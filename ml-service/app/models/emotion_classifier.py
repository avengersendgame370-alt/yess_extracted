import os
import logging
import numpy as np
import torch
from PIL import Image

try:
    from transformers import AutoImageProcessor, AutoModelForImageClassification
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

logger = logging.getLogger("ml-service")

# Model configuration
MODEL_NAME = "trpakov/vit-face-expression"
EMOTION_CONFIDENCE_THRESHOLD = float(os.getenv("EMOTION_CONFIDENCE_THRESHOLD", "0.40"))

EMOTION_MODEL_AVAILABLE = False
processor = None
model = None
device = "cpu"

if TRANSFORMERS_AVAILABLE:
    try:
        # Determine device
        if torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"
        
        logger.info(f"Loading facial expression recognition model '{MODEL_NAME}' on device: {device}...")
        
        # Load processor and model once at import time
        processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
        model = AutoModelForImageClassification.from_pretrained(MODEL_NAME).to(device)
        model.eval()
        
        EMOTION_MODEL_AVAILABLE = True
        logger.info(f"Facial expression model '{MODEL_NAME}' loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load facial expression model: {e}", exc_info=True)
else:
    logger.warning("transformers/pillow package not available. Emotion classification will be disabled.")


def classify_expression(face_crop_rgb: np.ndarray) -> dict:
    """
    Classifies facial expression/emotion from cropped RGB face image.
    Returns:
        dict: {"label": str, "confidence": float, "distribution": dict}
    """
    if not EMOTION_MODEL_AVAILABLE or face_crop_rgb is None or face_crop_rgb.size == 0:
        return {
            "label": "UNAVAILABLE",
            "confidence": 0.0,
            "distribution": {}
        }
    
    try:
        # Convert np.ndarray crop to PIL Image for transformers compatibility
        image = Image.fromarray(face_crop_rgb)
        
        # Preprocess image
        inputs = processor(images=image, return_tensors="pt").to(device)
        
        # Forward pass (no gradients needed)
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits
            probs = torch.softmax(logits, dim=-1).squeeze().cpu().numpy()
            
        # Get label mappings from model config
        id2label = model.config.id2label
        
        # Map classes to float probabilities
        distribution = {}
        for idx, prob in enumerate(probs):
            lbl = id2label.get(idx, f"CLASS_{idx}").upper()
            distribution[lbl] = float(prob)
            
        # Extract top prediction
        top_idx = int(np.argmax(probs))
        top_label = id2label.get(top_idx, "UNKNOWN").upper()
        top_confidence = float(probs[top_idx])
        
        # Threshold low confidence predictions
        final_label = top_label
        if top_confidence < EMOTION_CONFIDENCE_THRESHOLD:
            final_label = "UNCERTAIN"
            
        return {
            "label": final_label,
            "confidence": top_confidence,
            "distribution": distribution
        }
    except Exception as e:
        logger.error(f"Error running facial expression classifier: {e}", exc_info=True)
        return {
            "label": "ERROR",
            "confidence": 0.0,
            "distribution": {}
        }


def smooth_expression(session_state: dict, new_result: dict) -> dict:
    """
    Applies temporal majority-vote smoothing over a rolling buffer of 15 frames.
    Saves and reads rolling history from session_state["emotion_history"].
    Returns:
        dict: {"label": str, "confidence": float}
    """
    if "emotion_history" not in session_state:
        session_state["emotion_history"] = []
        
    history = session_state["emotion_history"]
    
    # Append the new prediction
    history.append(new_result)
    
    # Keep window size bound to last 15 frames
    if len(history) > 15:
        history.pop(0)
        
    # Count frequencies of each label
    labels = [res["label"] for res in history if res["label"] not in ("UNAVAILABLE", "ERROR")]
    if not labels:
        return {
            "label": new_result.get("label", "UNAVAILABLE"),
            "confidence": new_result.get("confidence", 0.0)
        }
        
    # Find majority vote label
    unique_labels, counts = np.unique(labels, return_counts=True)
    majority_label = unique_labels[np.argmax(counts)]
    
    # Calculate average confidence for the majority vote label's occurrences
    matching_confidences = [res["confidence"] for res in history if res["label"] == majority_label]
    mean_confidence = float(np.mean(matching_confidences)) if matching_confidences else 0.0
    
    return {
        "label": majority_label,
        "confidence": round(mean_confidence, 2)
    }
