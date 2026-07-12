import os
import pickle
import numpy as np
from sklearn.linear_model import LinearRegression

def train():
    print("Starting SpO2 Regressor training script...")
    
    checkpoint_dir = os.path.join(os.path.dirname(__file__), "checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # Generate synthetic ratio-of-ratios features and SpO2 targets
    # Ratio values usually range from 0.1 to 0.8
    # SpO2 targets range from 92.0% to 100.0%
    num_samples = 500
    ratios = np.random.uniform(0.1, 0.8, size=(num_samples, 1))
    
    # Calibration relationship: SpO2 = 104 - 15 * Ratio
    noise = np.random.normal(0, 0.2, size=(num_samples, 1))
    spo2 = 104.0 - 15.0 * ratios + noise
    spo2 = np.clip(spo2, 90.0, 100.0)
    
    # Train Linear Regression model
    model = LinearRegression()
    model.fit(ratios, spo2.ravel())
    
    # Save the model
    model_path = os.path.join(checkpoint_dir, "spo2_model.pkl")
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
        
    print(f"SpO2 model trained successfully. Coefficients: {model.coef_}, Intercept: {model.intercept_}")
    print(f"Model saved to: {model_path}")

if __name__ == "__main__":
    train()
