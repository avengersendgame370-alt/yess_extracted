import numpy as np

class StressModel:
    def __init__(self, model_path=None):
        self.model_path = model_path
        # If we had a trained XGBoost model, we would load it here.
        # Otherwise we use an expert scoring rule based on HRV parameters.

    def estimate_stress(self, hrv_metrics, heart_rate, blink_rate):
        """
        hrv_metrics: dict containing keys: rmssd, sdnn
        heart_rate: estimated heart rate (BPM)
        blink_rate: blinks per minute
        Returns: (stress_score [0-100], stress_label [Low/Moderate/Elevated/High])
        """
        rmssd = hrv_metrics.get("rmssd", 45.0)
        sdnn = hrv_metrics.get("sdnn", 50.0)
        
        # HRV is inversely proportional to stress. High RMSSD/SDNN = lower stress.
        # HR is directly proportional to stress. High HR = higher stress.
        hrv_factor = (rmssd * 0.4) + (sdnn * 0.2)
        hr_factor = np.clip(heart_rate - 60, 0, 60) * 0.6
        
        # Blink rate factor: extremely low (<4) or high (>25) blinks/min suggests cognitive load
        blink_factor = 0
        if blink_rate < 4:
            blink_factor = 10
        elif blink_rate > 25:
            blink_factor = 15
            
        base_score = 45.0 - hrv_factor + hr_factor + blink_factor
        score = float(np.clip(base_score, 5.0, 98.0))
        
        # Classify severity label
        if score < 30:
            label = "LOW / RELAXED"
        elif score < 60:
            label = "MODERATE / CALM"
        elif score < 80:
            label = "ELEVATED STRESS"
        else:
            label = "HIGH STRESS / FATIGUE"
            
        return round(score, 1), label

# Singleton instance
model = StressModel()

def calculate_stress(hrv_metrics, heart_rate, blink_rate):
    return model.estimate_stress(hrv_metrics, heart_rate, blink_rate)
