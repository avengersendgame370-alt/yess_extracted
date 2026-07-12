# Biometric ML Vitals Engine Training Datasets & Preprocessing

This directory contains configuration files and document layout schemas for training models used in VitalSense ML Vitals Engine.

## Expected Directory Layouts

### 1. UBFC-rPPG Dataset (Pulse & HRV CNN)
The UBFC-rPPG dataset is used to train the 1D Temporal CNN model.
Expected folder structure:
```
data/ubfc_rppg/
  ├── subject1/
  │     ├── vid.avi        # Raw facial video stream (30 fps)
  │     └── ground_truth.txt # PPG waveform and heart rate ground truth
  ├── subject2/
  │     ├── vid.avi
  │     └── ground_truth.txt
  └── ...
```

### 2. SpO2 Dataset (Ratio-of-Ratios calibration)
Expected folder structure:
```
data/spo2/
  ├── train_features.csv   # AC/DC R/G ratio values
  └── train_labels.csv     # Ground-truth pulse oximeter readings (SpO2 %)
```

### 3. Blink Dataset (EAR classification)
Expected folder structure:
```
data/blinks/
  ├── subject_videos/      # High-speed eye close/open recordings
  └── annotations.json     # Frame-by-frame binary tags (1 = blink, 0 = open)
```

### 4. Stress Dataset (HRV analysis)
Expected folder structure:
```
data/stress/
  ├── hrv_features.csv     # Engineered SDNN, RMSSD, pNN50, and blinkRate vectors
  └── stress_labels.csv    # Per-row classified stress levels (0-3 or 0-100 score)
```

---

## Model Training & Export Workflow

1. Place your downloaded raw public datasets in the structures described above.
2. Run the preprocessing steps inside each script to clean and convert raw streams into windowed `.npy` features.
3. Execute the respective training script (e.g. `python training/train_rppg_cnn.py`).
4. Each script compiles metrics, compiles a model, saves weights to `training/checkpoints/`, and automatically exports to `.onnx` for real-time CPU execution in the inference server.
