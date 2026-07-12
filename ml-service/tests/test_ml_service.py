import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.features import calculate_ear
from app.models.hrv import calculate_hrv_metrics
from app.models.confidence import calculate_confidence_score
from app.models.stress_model import calculate_stress

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "ml-service"}

def test_ear_calculation():
    # Construct 6 mock eye points
    # Horizontal width = 10, Vertical height = 2
    eye_pts = [
        (0.0, 0.0), # p1 (corner)
        (3.0, 2.0), # p2 (top-left)
        (7.0, 2.0), # p3 (top-right)
        (10.0, 0.0), # p4 (corner)
        (7.0, -2.0), # p5 (bottom-right)
        (3.0, -2.0)  # p6 (bottom-left)
    ]
    ear = calculate_ear(eye_pts)
    # vertical1 = ||(3,2) - (3,-2)|| = 4
    # vertical2 = ||(7,2) - (7,-2)|| = 4
    # horizontal = ||(0,0) - (10,0)|| = 10
    # EAR = (4 + 4) / (2 * 10) = 8 / 20 = 0.4
    assert abs(ear - 0.4) < 1e-5

def test_hrv_calculation():
    # Create synthetic peak intervals corresponding to 60 BPM (1000ms intervals)
    peak_times = [0.0, 1000.0, 2000.0, 3000.0, 4000.0]
    hrv = calculate_hrv_metrics(peak_times)
    # Constant interval = 1000ms, standard dev (SDNN) should be 0.0, RMSSD should be 0.0
    assert hrv["sdnn"] == 0.0
    assert hrv["rmssd"] == 0.0
    assert hrv["pnn50"] == 0.0

    # With varying intervals: [1000ms, 1100ms, 900ms, 1000ms]
    peak_times = [0.0, 1000.0, 2100.0, 3000.0, 4000.0]
    hrv = calculate_hrv_metrics(peak_times)
    assert hrv["sdnn"] > 0.0
    assert hrv["rmssd"] > 0.0

def test_stress_scoring():
    # Lower HRV and higher HR should lead to a higher stress index
    hrv_low = {"rmssd": 15.0, "sdnn": 20.0}
    stress_high, label_high = calculate_stress(hrv_low, heart_rate=95.0, blink_rate=30.0)
    
    # Higher HRV and lower HR should lead to a lower stress index
    hrv_high = {"rmssd": 75.0, "sdnn": 80.0}
    stress_low, label_low = calculate_stress(hrv_high, heart_rate=62.0, blink_rate=12.0)
    
    assert stress_high > stress_low
    assert "HIGH" in label_high or "ELEVATED" in label_high
    assert "LOW" in label_low or "MODERATE" in label_low

def test_confidence_scoring():
    # Solid clean signal with low jitter and low lighting variation
    clean_signal = np.sin(np.linspace(0, 10, 100))
    conf_high = calculate_confidence_score(clean_signal, landmark_jitter=0.001, frame_luminance_var=0.1)
    
    # Jittery, noisy signal with high lighting fluctuation
    noisy_signal = clean_signal + np.random.normal(0, 2.0, 100)
    conf_low = calculate_confidence_score(noisy_signal, landmark_jitter=0.15, frame_luminance_var=150.0)
    
    assert conf_high > conf_low
