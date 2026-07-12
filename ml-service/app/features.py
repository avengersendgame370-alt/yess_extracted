import logging
import numpy as np
import cv2

logger = logging.getLogger("ml-service")

# Try to import mediapipe dynamically to handle environment discrepancies gracefully
try:
    import mediapipe as mp
    import mediapipe.solutions.face_mesh as mp_fm # Try explicit import
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    MP_AVAILABLE = True
    logger.info("MediaPipe FaceMesh loaded successfully in ml-service")
except (ImportError, AttributeError, ModuleNotFoundError) as e:
    MP_AVAILABLE = False
    logger.warning(f"MediaPipe face_mesh not available ({e}). Features extractor will run with Haar Cascade fallback.")

import os
import urllib.request

# Directory to store local cascades
APP_DIR = os.path.dirname(__file__)
FACE_CASCADE_PATH = os.path.join(APP_DIR, "haarcascade_frontalface_default.xml")
EYE_CASCADE_PATH = os.path.join(APP_DIR, "haarcascade_eye.xml")

face_cascade = None
eye_cascade = None

def ensure_cascades():
    global face_cascade, eye_cascade
    if face_cascade is not None and eye_cascade is not None:
        return
        
    # Download if missing
    if not os.path.exists(FACE_CASCADE_PATH):
        try:
            logger.info("Downloading face Haar Cascade XML fallback model...")
            urllib.request.urlretrieve(
                "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml",
                FACE_CASCADE_PATH
            )
        except Exception as e:
            logger.error(f"Failed to download face cascade: {e}")
            
    if not os.path.exists(EYE_CASCADE_PATH):
        try:
            logger.info("Downloading eye Haar Cascade XML fallback model...")
            urllib.request.urlretrieve(
                "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_eye.xml",
                EYE_CASCADE_PATH
            )
        except Exception as e:
            logger.error(f"Failed to download eye cascade: {e}")
            
    # Load classifiers
    try:
        if os.path.exists(FACE_CASCADE_PATH):
            face_cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
        if os.path.exists(EYE_CASCADE_PATH):
            eye_cascade = cv2.CascadeClassifier(EYE_CASCADE_PATH)
        logger.info("OpenCV Haar Cascades face/eye fallback models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Haar Cascades: {e}")

# Landmark index sets for ROIs
# Forehead: around points 10, 109, 338, 67, 297
FOREHEAD_INDICES = [10, 67, 109, 297, 338]
# Left Cheek: points 116, 123, 117, 118, 50
LEFT_CHEEK_INDICES = [50, 116, 117, 118, 123]
# Right Cheek: points 345, 352, 346, 347, 280
RIGHT_CHEEK_INDICES = [280, 345, 346, 347, 352]

# Left Eye: 33 (corner), 160 (top-left), 158 (top-right), 133 (corner), 153 (bottom-right), 144 (bottom-left)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
# Right Eye: 362 (corner), 385 (top-left), 387 (top-right), 263 (corner), 373 (bottom-right), 380 (bottom-left)
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

def calculate_ear(eye_landmarks):
    # eye_landmarks is a list of 6 points (x, y)
    # EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
    p1, p2, p3, p4, p5, p6 = eye_landmarks
    vertical1 = np.linalg.norm(np.array(p2) - np.array(p6))
    vertical2 = np.linalg.norm(np.array(p3) - np.array(p5))
    horizontal = np.linalg.norm(np.array(p1) - np.array(p4))
    
    if horizontal < 1e-6:
        return 0.0
    return (vertical1 + vertical2) / (2.0 * horizontal)

def extract_face_features(frame_rgb):
    """
    Extracts RGB mean from cheeks/forehead ROI, computes average EAR,
    and returns metrics tracking face presence, mouth aspect ratio, and landmark stability.
    """
    h, w, c = frame_rgb.shape
    
    if not MP_AVAILABLE:
        ensure_cascades()
        if face_cascade is not None and not face_cascade.empty():
            try:
                # Convert to grayscale for Haar Cascades
                gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY)
                # Apply histogram equalization to maximize contrast for robust face detection under any lighting
                gray_eq = cv2.equalizeHist(gray)
                # Detect faces with highly sensitive parameters
                faces = face_cascade.detectMultiScale(gray_eq, scaleFactor=1.05, minNeighbors=2, minSize=(40, 40))
                
                if len(faces) > 0:
                    # Pick the largest face detected
                    (x, y, w_face, h_face) = max(faces, key=lambda f: f[2] * f[3])
                    
                    # 1. Extract Forehead and Cheek ROIs within the face box
                    # Forehead ROI: top 20% of the face, middle 50% width
                    fh_y1, fh_y2 = int(y + 0.05 * h_face), int(y + 0.25 * h_face)
                    fh_x1, fh_x2 = int(x + 0.25 * w_face), int(x + 0.75 * w_face)
                    
                    # Left Cheek ROI: middle height, left side
                    lc_y1, lc_y2 = int(y + 0.45 * h_face), int(y + 0.65 * h_face)
                    lc_x1, lc_x2 = int(x + 0.15 * w_face), int(x + 0.4 * w_face)
                    
                    # Right Cheek ROI: middle height, right side
                    rc_y1, rc_y2 = int(y + 0.45 * h_face), int(y + 0.65 * h_face)
                    rc_x1, rc_x2 = int(x + 0.6 * w_face), int(x + 0.85 * w_face)
                    
                    # Crop ROIs and calculate mean RGB
                    roi_means = []
                    for (y1, y2, x1, x2) in [(fh_y1, fh_y2, fh_x1, fh_x2), (lc_y1, lc_y2, lc_x1, lc_x2), (rc_y1, rc_y2, rc_x1, rc_x2)]:
                        # Ensure bounds are within image dimensions
                        y1_b, y2_b = max(0, y1), min(h, y2)
                        x1_b, x2_b = max(0, x1), min(w, x2)
                        if y2_b > y1_b and x2_b > x1_b:
                            roi_crop = frame_rgb[y1_b:y2_b, x1_b:x2_b]
                            roi_means.append(np.mean(roi_crop, axis=(0, 1)))
                    
                    # Average the ROIs
                    if len(roi_means) > 0:
                        avg_roi_rgb = np.mean(roi_means, axis=0).tolist()
                    else:
                        avg_roi_rgb = np.mean(frame_rgb[y:y+h_face, x:x+w_face], axis=(0, 1)).tolist()
                    
                    # 2. Detect eyes inside the upper half of the face box using equalized contrast
                    eye_gray_region = gray[y:y+int(h_face*0.55), x:x+w_face]
                    eye_gray_eq = cv2.equalizeHist(eye_gray_region)
                    eyes = []
                    if eye_cascade is not None and not eye_cascade.empty():
                        eyes = eye_cascade.detectMultiScale(eye_gray_eq, scaleFactor=1.05, minNeighbors=2, minSize=(10, 10))
                    
                    # If eyes are detected, EAR is high. If closed, it drops.
                    ear = 0.28 if len(eyes) >= 1 else 0.12
                    
                    # 3. Extract mouth mean pixel intensity as MAR fallback
                    mouth_y1, mouth_y2 = int(y + 0.75 * h_face), int(y + 0.95 * h_face)
                    mouth_x1, mouth_x2 = int(x + 0.3 * w_face), int(x + 0.7 * w_face)
                    mouth_y1_b, mouth_y2_b = max(0, mouth_y1), min(h, mouth_y2)
                    mouth_x1_b, mouth_x2_b = max(0, mouth_x1), min(w, mouth_x2)
                    if mouth_y2_b > mouth_y1_b and mouth_x2_b > mouth_x1_b:
                        mouth_crop = gray[mouth_y1_b:mouth_y2_b, mouth_x1_b:mouth_x2_b]
                        mar = float(np.mean(mouth_crop))
                    else:
                        mar = 0.0
                        
                    return avg_roi_rgb, ear, mar, 0.01, True
            except Exception as e:
                logger.error(f"OpenCV Haar Cascade processing error: {e}")
                
        # Absolute fallback if cascades fail
        mean_rgb = np.mean(frame_rgb, axis=(0, 1))
        return mean_rgb.tolist(), 0.28, 0.0, 0.01, False

    results = face_mesh.process(frame_rgb)
    
    if not results.multi_face_landmarks:
        # Return fallback stats but mark face_found=False
        mean_rgb = np.mean(frame_rgb, axis=(0, 1))
        return mean_rgb.tolist(), 0.30, 0.0, 0.05, False

    landmarks = results.multi_face_landmarks[0].landmark
    
    # Convert normalized landmarks to pixel coordinates
    coords = []
    for l in landmarks:
        coords.append((l.x * w, l.y * h))
    
    # 1. Cheeks and Forehead ROI extraction
    roi_pixels = []
    for indices in [FOREHEAD_INDICES, LEFT_CHEEK_INDICES, RIGHT_CHEEK_INDICES]:
        pts = np.array([coords[idx] for idx in indices], dtype=np.int32)
        # Create mask for polygon ROI
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [pts], 255)
        # Get mean RGB of masked region
        mean_val = cv2.mean(frame_rgb, mask=mask)[:3]
        roi_pixels.append(mean_val)
        
    # Average across all three face regions
    avg_roi_rgb = np.mean(roi_pixels, axis=0).tolist()
    
    # 2. Eye Aspect Ratio (EAR) calculation for blinks
    left_eye_pts = [coords[idx] for idx in LEFT_EYE]
    right_eye_pts = [coords[idx] for idx in RIGHT_EYE]
    
    left_ear = calculate_ear(left_eye_pts)
    right_ear = calculate_ear(right_eye_pts)
    avg_ear = float((left_ear + right_ear) / 2.0)
    
    # 3. Mouth Aspect Ratio (MAR) for speech detection (Points 13 and 14)
    lip_dist = np.linalg.norm(np.array(coords[13]) - np.array(coords[14]))
    face_h = np.linalg.norm(np.array(coords[10]) - np.array(coords[152]))
    mar = float(lip_dist / (face_h + 1e-6))
    
    # 4. Jitter calculation (for confidence)
    nose_tip = landmarks[4]
    jitter = float(np.std([nose_tip.x, nose_tip.y, nose_tip.z]))
    
    return avg_roi_rgb, avg_ear, mar, jitter, True
