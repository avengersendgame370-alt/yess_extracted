import numpy as np

def calculate_confidence_score(rppg_signal, landmark_jitter, frame_luminance_var):
    """
    Combines rPPG signal quality, tracker stability (jitter), and lighting variance
    into a single 0-100 score.
    """
    # 1. Calculate SNR of rPPG signal (spectral peak vs noise)
    if len(rppg_signal) > 50:
        fft_vals = np.abs(np.fft.rfft(rppg_signal))
        peak_idx = np.argmax(fft_vals[1:]) + 1
        peak_val = fft_vals[peak_idx]
        noise_mean = np.mean(np.delete(fft_vals, [0, peak_idx]))
        snr = 20 * np.log10(peak_val / (noise_mean + 1e-6)) if noise_mean > 0 else 5.0
    else:
        snr = 10.0 # moderate default
        
    # Map SNR to 0-40 subscore
    snr_score = np.clip((snr - 2) * 5, 0, 40)
    
    # 2. Map tracking stability (jitter) to 0-30 subscore
    # High jitter = low stability
    jitter_penalty = np.clip(landmark_jitter * 100, 0, 30)
    stability_score = 30 - jitter_penalty
    
    # 3. Map lighting variance to 0-30 subscore
    # High lighting variance (flicker) = low quality
    light_penalty = np.clip(frame_luminance_var * 0.05, 0, 30)
    lighting_score = 30 - light_penalty
    
    total_score = float(snr_score + stability_score + lighting_score)
    return round(float(np.clip(total_score, 10.0, 100.0)), 1)
