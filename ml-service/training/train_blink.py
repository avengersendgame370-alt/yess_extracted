import os
import pickle
import numpy as np
from sklearn.linear_model import LogisticRegression

def train():
    print("Starting Blink Classifier training script...")
    
    checkpoint_dir = os.path.join(os.path.dirname(__file__), "checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # Generate synthetic EAR sequence features (window size 5)
    # Class 0: No-blink (normal variations of EAR around 0.25 to 0.35)
    # Class 1: Blink (EAR drops below 0.18, e.g. [0.28, 0.22, 0.15, 0.22, 0.28])
    num_samples = 1000
    window_size = 5
    
    X = []
    y = []
    
    for _ in range(num_samples):
        is_blink = np.random.rand() > 0.5
        if is_blink:
            # Generate a blink sequence
            seq = [
                np.random.uniform(0.25, 0.32),
                np.random.uniform(0.18, 0.23),
                np.random.uniform(0.11, 0.16), # dip
                np.random.uniform(0.18, 0.23),
                np.random.uniform(0.25, 0.32)
            ]
            X.append(seq)
            y.append(1)
        else:
            # Generate a normal sequence
            seq = np.random.uniform(0.25, 0.34, size=window_size)
            X.append(seq)
            y.append(0)
            
    X = np.array(X)
    y = np.array(y)
    
    # Train Logistic Regression model
    model = LogisticRegression()
    model.fit(X, y)
    
    model_path = os.path.join(checkpoint_dir, "blink_model.pkl")
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
        
    print(f"Blink classifier trained successfully. Accuracy: {model.score(X, y) * 100:.2f}%")
    print(f"Model saved to: {model_path}")

if __name__ == "__main__":
    train()
