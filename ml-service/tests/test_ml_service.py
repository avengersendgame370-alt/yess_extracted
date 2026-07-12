import numpy as np
import pytest
import time
import asyncio
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
    eye_pts = [
        (0.0, 0.0),
        (3.0, 2.0),
        (7.0, 2.0),
        (10.0, 0.0),
        (7.0, -2.0),
        (3.0, -2.0)
    ]
    ear = calculate_ear(eye_pts)
    assert abs(ear - 0.4) < 1e-5

def test_hrv_calculation():
    peak_times = [0.0, 1000.0, 2000.0, 3000.0, 4000.0]
    hrv = calculate_hrv_metrics(peak_times)
    assert hrv["sdnn"] == 0.0
    assert hrv["rmssd"] == 0.0
    assert hrv["pnn50"] == 0.0

    peak_times = [0.0, 1000.0, 2100.0, 3000.0, 4000.0]
    hrv = calculate_hrv_metrics(peak_times)
    assert hrv["sdnn"] > 0.0
    assert hrv["rmssd"] > 0.0

def test_stress_scoring():
    hrv_low = {"rmssd": 15.0, "sdnn": 20.0}
    stress_high, label_high = calculate_stress(hrv_low, heart_rate=95.0, blink_rate=30.0)
    
    hrv_high = {"rmssd": 75.0, "sdnn": 80.0}
    stress_low, label_low = calculate_stress(hrv_high, heart_rate=62.0, blink_rate=12.0)
    
    assert stress_high > stress_low
    assert "HIGH" in label_high or "ELEVATED" in label_high
    assert "LOW" in label_low or "MODERATE" in label_low

def test_confidence_scoring():
    clean_signal = np.sin(np.linspace(0, 10, 100))
    conf_high = calculate_confidence_score(clean_signal, landmark_jitter=0.001, frame_luminance_var=0.1)
    
    noisy_signal = clean_signal + np.random.normal(0, 2.0, 100)
    conf_low = calculate_confidence_score(noisy_signal, landmark_jitter=0.15, frame_luminance_var=150.0)
    
    assert conf_high > conf_low

def test_crop_face():
    from app.features import crop_face
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    
    bbox = (20, 20, 40, 40)
    crop = crop_face(frame, bbox)
    assert crop is not None
    assert crop.shape[2] == 3
    
    bbox_oob = (-10, -10, 150, 150)
    crop_oob = crop_face(frame, bbox_oob)
    assert crop_oob is not None
    
    assert crop_face(frame, None) is None

def test_classify_expression():
    from app.models.emotion_classifier import classify_expression
    crop = np.zeros((48, 48, 3), dtype=np.uint8)
    result = classify_expression(crop)
    assert "label" in result
    assert "confidence" in result
    assert "distribution" in result
    assert 0.0 <= result["confidence"] <= 1.0

def test_smooth_expression():
    from app.models.emotion_classifier import smooth_expression
    session_state = {}
    
    for _ in range(10):
        res = smooth_expression(session_state, {"label": "NEUTRAL", "confidence": 0.8})
    assert res["label"] == "NEUTRAL"
    assert abs(res["confidence"] - 0.8) < 1e-5
    
    for _ in range(3):
        res = smooth_expression(session_state, {"label": "HAPPY", "confidence": 0.9})
    assert res["label"] == "NEUTRAL"
    
    for _ in range(10):
        res = smooth_expression(session_state, {"label": "HAPPY", "confidence": 0.9})
    assert res["label"] == "HAPPY"

def test_fallback_when_model_unavailable(monkeypatch):
    import app.models.emotion_classifier as ec
    import app.inference as inf
    from app.inference import process_rolling_stream_inference
    
    monkeypatch.setattr(ec, "EMOTION_MODEL_AVAILABLE", False)
    
    # Mock extract_face_features to return face_found = True
    monkeypatch.setattr(inf, "extract_face_features", lambda frame: (
        [100, 100, 100], 0.28, 0.03, 0.01, True, (10, 10, 50, 50)
    ))
    
    session_state = {
        "start_time": time.time(),
        "total_blinks": 0,
        "blink_cooldown": 0,
        "in_blink": False,
        "emotion_frame_counter": 5
    }
    
    rgb_buffer = [[100.0, 100.0, 100.0]] * 100
    ear_buffer = [0.28] * 100
    timestamps = [time.time()] * 100
    mar_buffer = [0.03] * 15
    
    raw_bytes = bytes([128] * (320 * 240 * 3))
    
    payload = asyncio.run(process_rolling_stream_inference(
        raw_bytes, rgb_buffer, ear_buffer, timestamps, session_state, mar_buffer
    ))
    
    assert payload is not None
    assert payload["expression"] == "UNAVAILABLE"

