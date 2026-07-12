import os
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier

def train():
    print("Starting Stress Model training script...")
    
    checkpoint_dir = os.path.join(os.path.dirname(__file__), "checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # Generate synthetic training features representing different stress states
    # Features: [RMSSD, SDNN, HeartRate, BlinkRate]
    # Classes: 0 = Low, 1 = Moderate, 2 = Elevated, 3 = High
    num_samples = 1000
    
    X = []
    y = []
    
    for _ in range(num_samples):
        # Stress level probability
        stress_level = np.random.choice([0, 1, 2, 3])
        
        if stress_level == 0: # Low
            rmssd = np.random.uniform(60, 100)
            sdnn = np.random.uniform(60, 95)
            hr = np.random.uniform(55, 68)
            blinks = np.random.uniform(10, 18)
        elif stress_level == 1: # Moderate
            rmssd = np.random.uniform(40, 65)
            sdnn = np.random.uniform(45, 65)
            hr = np.random.uniform(66, 78)
            blinks = np.random.uniform(8, 22)
        elif stress_level == 2: # Elevated
            rmssd = np.random.uniform(25, 45)
            sdnn = np.random.uniform(30, 48)
            hr = np.random.uniform(76, 92)
            blinks = np.random.uniform(4, 25)
        else: # High
            rmssd = np.random.uniform(5, 28)
            sdnn = np.random.uniform(10, 32)
            hr = np.random.uniform(88, 115)
            blinks = np.random.choice([np.random.uniform(0, 4), np.random.uniform(25, 35)])
            
        X.append([rmssd, sdnn, hr, blinks])
        y.append(stress_level)
        
    X = np.array(X)
    y = np.array(y)
    
    # Train Random Forest Classifier
    model = RandomForestClassifier(n_estimators=50, random_state=42)
    model.fit(X, y)
    
    model_path = os.path.join(checkpoint_dir, "stress_model.pkl")
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
        
    print(f"Stress model trained successfully. Training Accuracy: {model.score(X, y) * 100:.2f}%")
    print(f"Model saved to: {model_path}")

if __name__ == "__main__":
    train()
