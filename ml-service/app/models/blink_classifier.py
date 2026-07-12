import numpy as np

class BlinkClassifier:
    def __init__(self, model_path=None):
        self.model_path = model_path
        # If we had a saved sklearn or ONNX model, we would load it here.
        # Otherwise we use the robust EAR threshold state machine.

    def predict_blinks(self, ear_sequence):
        """
        Classifies blink occurrences from a sequence of EAR values.
        Returns the total number of blinks detected in the window.
        """
        if len(ear_sequence) < 5:
            return 0
            
        blinks = 0
        in_blink = False
        cooldown = 0
        
        # EAR sequence state machine
        # Dips below 0.18 indicate eye closure; recovering above 0.23 completes a blink.
        for val in ear_sequence:
            if cooldown > 0:
                cooldown -= 1
                continue
                
            if val < 0.17 and not in_blink:
                in_blink = True
            elif val > 0.22 and in_blink:
                blinks += 1
                in_blink = False
                cooldown = 3 # prevent double counting consecutive frames
                
        return blinks

# Singleton instance
classifier = BlinkClassifier()

def estimate_blinks(ear_sequence):
    return classifier.predict_blinks(ear_sequence)
