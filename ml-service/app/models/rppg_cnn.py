import os
import logging
import numpy as np
import torch
import torch.nn as nn
import onnxruntime as ort

logger = logging.getLogger("ml-service")

# 1. 1D Temporal CNN Architecture in PyTorch
class RPPG1DCNN(nn.Module):
    def __init__(self):
        super(RPPG1DCNN, self).__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(3, 16, kernel_size=5, padding=2),
            nn.BatchNorm1d(16),
            nn.ELU(),
            nn.MaxPool1d(2),
            nn.Conv1d(16, 32, kernel_size=5, padding=2),
            nn.BatchNorm1d(32),
            nn.ELU(),
            nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ELU(),
            nn.AdaptiveAvgPool1d(1)
        )
        self.fc = nn.Sequential(
            nn.Linear(64, 32),
            nn.ELU(),
            nn.Linear(32, 1) # Output HR estimate
        )
        
    def forward(self, x):
        # Input shape: (Batch, 3, Length)
        feat = self.conv(x)
        feat = feat.view(feat.size(0), -1)
        hr = self.fc(feat)
        return hr

# Checkpoint configurations
CHECKPOINT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "training", "checkpoints")
ONNX_PATH = os.path.join(CHECKPOINT_DIR, "rppg_cnn.onnx")
PTH_PATH = os.path.join(CHECKPOINT_DIR, "rppg_cnn.pth")

class RPPGEngine:
    def __init__(self):
        self.session = None
        self.model = None
        self.use_pytorch = False
        self.load_model()
        
    def load_model(self):
        if os.path.exists(PTH_PATH):
            try:
                self.model = RPPG1DCNN()
                self.model.load_state_dict(torch.load(PTH_PATH, map_location=torch.device('cpu')))
                self.model.eval()
                self.use_pytorch = True
                logger.info(f"Loaded trained native PyTorch rPPG CNN model from: {PTH_PATH}")
                return
            except Exception as e:
                logger.error(f"Failed to load PyTorch .pth model: {e}")

        if os.path.exists(ONNX_PATH):
            try:
                self.session = ort.InferenceSession(ONNX_PATH, providers=['CPUExecutionProvider'])
                logger.info(f"Loaded trained rPPG CNN model from ONNX: {ONNX_PATH}")
            except Exception as e:
                logger.error(f"Failed to load ONNX rPPG model: {e}")
        else:
            logger.info("No trained rPPG checkpoints found. Running high-precision rules-based POS fallback.")

    def estimate_vitals(self, rgb_signals, fps=30.0):
        """
        rgb_signals: list of [R, G, B] means of length N.
        Returns: (heart_rate_bpm, beat_peaks_ms, bvp_waveform)
        """
        N = len(rgb_signals)
        if N < 60:
            # Not enough data for stable frequency estimation
            return 72.0, [], [0.0] * N
            
        rgb_arr = np.array(rgb_signals) # shape: (N, 3)
        
        # 1. Plane-Orthogonal-to-Skin (POS) BVP signal extraction
        # This acts as our robust rules-based core and feature preprocessor
        # Step A: Temporal normalization
        mean_rgb = np.mean(rgb_arr, axis=0)
        norm_rgb = rgb_arr / (mean_rgb + 1e-6)
        
        # Step B: POS projection
        # P matrix project
        P = 3.0 * norm_rgb[:, 0] - 2.0 * norm_rgb[:, 1]
        Q = 1.5 * norm_rgb[:, 0] + 1.5 * norm_rgb[:, 1] - 3.0 * norm_rgb[:, 2]
        
        # Detrend and combine
        std_P = np.std(P)
        std_Q = np.std(Q)
        bvp = P - (std_P / (std_Q + 1e-6)) * Q
        
        # Bandpass filter BVP to cardiac frequency [0.75 Hz, 3.0 Hz] (45 BPM to 180 BPM)
        fft_vals = np.fft.rfft(bvp)
        freqs = np.fft.rfftfreq(N, d=1.0/fps)
        
        # Zero out non-cardiac bands
        cardiac_mask = (freqs >= 0.75) & (freqs <= 3.0)
        fft_vals[~cardiac_mask] = 0.0
        filtered_bvp = np.fft.irfft(fft_vals, n=N)
        
        # Normalize filtered BVP waveform
        bvp_norm = (filtered_bvp - np.mean(filtered_bvp)) / (np.std(filtered_bvp) + 1e-6)
        
        # 2. Extract Heart Rate
        hr_bpm = 72.0
        if self.use_pytorch:
            # Run inference natively using CPU PyTorch
            try:
                length = 256
                input_signal = np.zeros((3, length), dtype=np.float32)
                cur_len = min(N, length)
                # Normalize channels before CNN ingestion
                input_signal[:, :cur_len] = (rgb_arr[:cur_len, :].T - np.mean(rgb_arr[:cur_len, :], axis=0, keepdims=True).T) / (np.std(rgb_arr[:cur_len, :], axis=0, keepdims=True).T + 1e-6)
                
                with torch.no_grad():
                    inputs_tensor = torch.tensor(np.expand_dims(input_signal, axis=0), dtype=torch.float32)
                    hr_pred = self.model(inputs_tensor).item()
                hr_bpm = float(hr_pred)
                logger.debug(f"PyTorch CNN Estimated HR: {hr_bpm} BPM")
            except Exception as e:
                logger.error(f"PyTorch CNN inference failed, falling back to POS FFT: {e}")
                hr_bpm = self._estimate_fft_hr(filtered_bvp, freqs)
        elif self.session is not None:
            # We have a trained ONNX model! Formulate the input shape: (1, 3, N)
            try:
                # Pad/slice signals to length expected by CNN (e.g. 256 samples)
                length = 256
                input_signal = np.zeros((3, length), dtype=np.float32)
                cur_len = min(N, length)
                # Normalize channels before CNN ingestion
                input_signal[:, :cur_len] = (rgb_arr[:cur_len, :].T - np.mean(rgb_arr[:cur_len, :], axis=0, keepdims=True).T) / (np.std(rgb_arr[:cur_len, :], axis=0, keepdims=True).T + 1e-6)
                
                # ONNX Inference
                inputs = {self.session.get_inputs()[0].name: np.expand_dims(input_signal, axis=0)}
                hr_pred = self.session.run(None, inputs)[0][0][0]
                hr_bpm = float(hr_pred)
                logger.debug(f"ONNX CNN Estimated HR: {hr_bpm} BPM")
            except Exception as e:
                logger.error(f"ONNX CNN inference failed, falling back to POS FFT: {e}")
                hr_bpm = self._estimate_fft_hr(filtered_bvp, freqs)
        else:
            # Fallback to POS FFT
            hr_bpm = self._estimate_fft_hr(filtered_bvp, freqs)
            
        # Physiological validation: fallback to POS-FFT if CNN outputs unreasonable values
        if hr_bpm < 45.0 or hr_bpm > 180.0:
            hr_bpm = self._estimate_fft_hr(filtered_bvp, freqs)
            
        # 3. Peak-Picking for HRV calculations
        # Find local maxima in BVP waveform
        beat_peaks_ms = []
        for i in range(1, N - 1):
            if bvp_norm[i] > bvp_norm[i-1] and bvp_norm[i] > bvp_norm[i+1] and bvp_norm[i] > 0.4:
                # Peak index converted to milliseconds
                peak_ms = (i / fps) * 1000.0
                beat_peaks_ms.append(peak_ms)
                
        return round(hr_bpm, 1), beat_peaks_ms, bvp_norm.tolist()

    def _estimate_fft_hr(self, filtered_bvp, freqs):
        fft_mags = np.abs(np.fft.rfft(filtered_bvp))
        cardiac_mask = (freqs >= 0.75) & (freqs <= 3.0)
        # Suppress out-of-band noise or DC components completely
        fft_mags[~cardiac_mask] = 0.0
        peak_idx = np.argmax(fft_mags)
        peak_freq = freqs[peak_idx]
        hr = float(peak_freq * 60.0)
        # Clip to acceptable physiological boundaries
        if hr < 45.0 or hr > 180.0:
            return 72.0
        return hr

# Singleton instance
engine = RPPGEngine()

def calculate_pulse(rgb_signals, fps=30.0):
    return engine.estimate_vitals(rgb_signals, fps)
