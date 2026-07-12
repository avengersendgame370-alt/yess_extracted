import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

# Define the model matching app.models.rppg_cnn.RPPG1DCNN
class RPPG1DCNN(nn.Module):
    def __init__(self):
        super(RPPG1DCNN, self).__init__()
        self.conv = nn.Sequential(
            nn.Conv1d(3, 16, kernel_size=5, padding=2),
            nn.BatchNorm1d(16),
            nn.ELU(),
            nn.MaxPool1d(2),
            nn.Conv1d(16, 32, kernel_size=5, padding=2),
            nn.BatchNorm1d(32),
            nn.ELU(),
            nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ELU(),
            nn.AdaptiveAvgPool1d(1)
        )
        self.fc = nn.Sequential(
            nn.Linear(64, 32),
            nn.ELU(),
            nn.Linear(32, 1)
        )
        
    def forward(self, x):
        feat = self.conv(x)
        feat = feat.view(feat.size(0), -1)
        return self.fc(feat)

def generate_synthetic_data(num_samples=100, length=256, fps=30.0):
    """
    Generates synthetic rPPG signals (temporal RGB) representing different BPMs.
    """
    X = []
    y = []
    
    t = np.arange(length) / fps
    for _ in range(num_samples):
        # Random BPM between 55 and 115
        bpm = np.random.uniform(55, 115)
        freq = bpm / 60.0
        
        # Simulating cardiac pulse as sinusoid with dicrotic notch
        pulse = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t + np.pi/3)
        
        # Add channel variations (Green has higher absorption, Blue lower)
        r = pulse * 0.8 + np.random.normal(0, 0.1, length)
        g = pulse * 1.2 + np.random.normal(0, 0.05, length)
        b = pulse * 0.5 + np.random.normal(0, 0.15, length)
        
        signal = np.stack([r, g, b], axis=0) # shape (3, 256)
        
        # Standard normalize signal
        signal = (signal - np.mean(signal, axis=1, keepdims=True)) / (np.std(signal, axis=1, keepdims=True) + 1e-6)
        
        X.append(signal)
        y.append([bpm])
        
    return torch.tensor(np.array(X), dtype=torch.float32), torch.tensor(np.array(y), dtype=torch.float32)

def train():
    print("Starting rPPG CNN training script...")
    
    # Create checkpoints directory
    checkpoint_dir = os.path.join(os.path.dirname(__file__), "checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)
    
    # 1. Dataset loading / generation
    # Try to load real preprocessed ubfc-rppg data, otherwise fallback to synthetic
    real_data_path = os.path.join(os.path.dirname(__file__), "data", "ubfc_preprocessed.npz")
    if os.path.exists(real_data_path):
        print(f"Loading real preprocessed data from {real_data_path}")
        data = np.load(real_data_path)
        X_train = torch.tensor(data["X"], dtype=torch.float32)
        y_train = torch.tensor(data["y"], dtype=torch.float32)
    else:
        print("No preprocessed UBFC-rPPG dataset found. Generating high-fidelity synthetic temporal dataset...")
        X_train, y_train = generate_synthetic_data(200)
        
    dataset = TensorDataset(X_train, y_train)
    loader = DataLoader(dataset, batch_size=16, shuffle=True)
    
    # 2. Setup training loop
    model = RPPG1DCNN()
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    print("Training model...")
    model.train()
    epochs = 5
    for epoch in range(epochs):
        epoch_loss = 0.0
        for batch_X, batch_y in loader:
            optimizer.zero_grad()
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * batch_X.size(0)
        print(f"Epoch {epoch+1}/{epochs} - Loss: {epoch_loss / len(X_train):.4f}")
        
    # Save PyTorch weights
    pth_path = os.path.join(checkpoint_dir, "rppg_cnn.pth")
    torch.save(model.state_dict(), pth_path)
    print(f"Saved PyTorch weights: {pth_path}")
    
    # 3. Export to ONNX for CPU fast inference
    model.eval()
    dummy_input = torch.randn(1, 3, 256)
    onnx_path = os.path.join(checkpoint_dir, "rppg_cnn.onnx")
    
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    print(f"Successfully exported model to ONNX: {onnx_path}")

if __name__ == "__main__":
    train()
