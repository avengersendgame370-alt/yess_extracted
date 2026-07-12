import numpy as np

class SpO2Regressor:
    def __init__(self, model_path=None):
        self.model_path = model_path
        # If we had a trained scikit-learn regressor, we would load it here.
        # Otherwise we use the classical clinical Ratio-of-Ratios calibration.

    def estimate_spo2(self, rgb_signals):
        """
        rgb_signals: numpy array of shape (N, 3) representing R, G, B mean values.
        Returns SpO2 percentage.
        """
        if len(rgb_signals) < 30:
            return 98.0 # healthy default
            
        r_signal = rgb_signals[:, 0]
        g_signal = rgb_signals[:, 1]
        
        # Calculate DC component (mean)
        dc_r = np.mean(r_signal)
        dc_g = np.mean(g_signal)
        
        if dc_r < 1e-6 or dc_g < 1e-6:
            return 98.0
            
        # Calculate AC component (standard deviation of detrended signal)
        ac_r = np.std(r_signal - dc_r)
        ac_g = np.std(g_signal - dc_g)
        
        if ac_g < 1e-6:
            return 98.0
            
        # Ratio of ratios
        r = (ac_r / dc_r) / (ac_g / dc_g)
        
        # Clinical empirical calibration curve: SpO2 = A - B * R
        # Typically A = 110, B = 15 or 25 for R/G/B camera signals
        spo2 = 104.0 - 15.0 * r
        
        # Bound realistically
        return float(np.clip(spo2, 92.0, 100.0))

# Singleton instance
regressor = SpO2Regressor()

def calculate_spo2(rgb_signals):
    return regressor.estimate_spo2(rgb_signals)
