# VitalSense AI — Contactless Health Monitoring Platform

VitalSense AI is a contactless vital-sign monitoring platform inspired by premium cyber-HUD aesthetics. Using standard camera input (webcams or mobile devices paired via DroidCam), it tracks micro-facial blood flow variations via Remote Photoplethysmography (rPPG) offloaded to the **Presage SmartSpectra Node.js SDK**.

The dashboard includes a real-time face mesh wireframe overlay, heart rate (BPM), respiration rate (RPM), heart-rate variability (RMSSD, SDNN), Baevsky stress index levels, and relative arterial pressure waveforms. Sessions are stored in MongoDB and exportable as clinical-style PDF reports.

---

## Technical Architecture

```text
┌────────────────────┐      WebSocket (frames)      ┌──────────────────────────┐
│  Browser (React)    │ ───────────────────────────▶ │  Node.js + Express        │
│  - getUserMedia      │                              │  - Socket.IO server      │
│  - FaceMesh overlay   │ ◀─────────────────────────── │  - Config: dsp / ml      │
│  - Cyber-HUD dashboard│      WebSocket (vitals)      │  - Proxy to ml-service   │
└────────────────────┘                              └──────────┬───┬───────────┘
                                                       ▲       │   │ Mongoose
                                    Proxy WS (frames)  │       │   ▼
                                    and Vitals JSON    │       │ ┌────────────────────┐
                                                       │       │ │   MongoDB Atlas    │
                                                       ▼       │ │  users, vitallogs  │
                                            ┌──────────────────┴─┐ └────────────────────┘
                                            │ Python ml-service  │
                                            │ - FastAPI / Uvicorn│
                                            │ - PyTorch 1D CNN   │
                                            │ - Tabular ML models│
                                            └────────────────────┘
```

---

## ML Vitals Engine & Model Cards

The machine learning telemetry is handled by a dedicated Python FastAPI microservice (`ml-service/`). The service integrates the following custom models:

### 1. 1D Temporal CNN (Remote PPG Pulse Rate)
* **Architecture:** 1D Conv Layers + BatchNorm + ELU + Adaptive Average Pooling + Linear Regressor.
* **Intended Use:** Contactless heart rate estimation (BPM) and peak-to-peak beat interval extraction from facial cheek/forehead ROI color trajectories.
* **Data Source:** Trained on synthetic cardiac pulse simulations and preprocessed UBFC-rPPG video streams.
* **Limitations:** Sensitive to facial movements (talking, chewing), head rotations, and ambient lighting changes. Not clinically validated.

### 2. SpO2 Regressor
* **Architecture:** Tabular Linear Regression / Ratio-of-Ratios calibration.
* **Intended Use:** Estimate blood oxygen levels (SpO2 %) using the relative AC/DC ratio of RED vs GREEN/BLUE channels.
* **Limitations:** Ambient color temperature shifts and camera sensor response curves degrade accuracy. Meant for wellness/reference tracking only.

### 3. Blink EAR Classifier
* **Architecture:** Logistic Regression / EAR State-Machine sequence classifier.
* **Intended Use:** Identifies eye blink closures per frame from the Eye Aspect Ratio (EAR) sequence.
* **Limitations:** Squinting, eyewear reflection, and rapid head tilting can trigger false positives.

### 4. Cognitive Stress Predictor
* **Architecture:** Random Forest Classifier.
* **Intended Use:** Classifies cognitive stress into 4 severity levels (Low, Moderate, Elevated, High) based on HRV time-domain metrics (SDNN, RMSSD) and blink rates.
* **Limitations:** Physiological stress indicators are subjective and influenced by caffeine, sleep deprivation, and external noise.

---

## Tech Stack
- **Frontend:** React (Vite), Pure CSS custom cyber-HUD variables, Socket.IO-client, MediaPipe FaceMesh (for UI canvas wireframe decoration), Canvas-based real-time line chart.
- **Backend:** Node.js, Express, Socket.IO, `@smartspectra/node-sdk` (Presage SmartSpectra Node SDK fallback), `ws` WebSocket client proxy, MongoDB + Mongoose, JWT + bcrypt, PDFKit.
- **ML Service:** Python, FastAPI, Uvicorn, PyTorch, MediaPipe FaceMesh (Python-based backup extractor), scikit-learn, NumPy, OpenCV, pytest.
- **Deployment:** Docker & Docker-Compose.

---

## Local Setup (Developer Mode)

### Prerequisites
- Node.js (v18 or v20 LTS recommended)
- MongoDB running locally on `mongodb://127.0.0.1:27017/vitalsense` or a MongoDB Atlas URI

### Configuration
1. Create a `.env` file in the `backend/` directory or copy `backend/.env.example` to `.env`:
   ```bash
   PORT=5000
   MONGO_URI=mongodb://127.0.0.1:27017/vitalsense
   JWT_SECRET=f4d1e2b5e0c5a2e5d9c8b7a6f5e4d3c2b1a09876543210abcdef0123456789ab
   PRESAGE_API_KEY=your_presage_api_key_here
   CLIENT_ORIGIN=http://localhost:8000
   
   # Enable ML Vitals Engine (set to 'ml' or 'dsp')
   VITALS_ENGINE=ml
   ML_SERVICE_URL=ws://127.0.0.1:8001
   ```
   *Note: If no valid `PRESAGE_API_KEY` is provided in `dsp` mode, the backend automatically runs in a high-fidelity simulation loop (Mock Mode). If `ml` mode is active, Node.js proxies raw telemetry to the Python `ml-service` WebSocket.*

### Run ML Microservice & Models
To run the ML engine locally, make sure you have Python 3.10+ installed:

1. Install dependencies:
   ```bash
   cd ml-service
   pip install -r requirements.txt
   ```
2. Train/Generate Models (compiles PyTorch CNN, SpO2 regression coefficients, EAR blink state machine, and stress classifier):
   ```bash
   python training/train_rppg_cnn.py
   python training/train_spo2.py
   python training/train_blink.py
   python training/train_stress.py
   ```
3. Start the FastAPI Uvicorn server:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
   ```

### Run Backend
```bash
cd backend
npm install
npm start
```
The server will start on port `5000`.

### Run Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.


---

## Docker Container Orchestration

Run the entire stack (Database, API, and Frontend) in an isolated container network:

1. Create a root `.env` file using `.env.example` as a template.
2. Build and launch the containers:
   ```bash
   docker-compose up --build
   ```
3. Open `http://localhost:8000` to view the application served via Nginx.

---

## Using Your Phone as a Camera (DroidCam Virtual Webcam)

To utilize DroidCam as the primary capture device:
1. Install the **DroidCam app** on your phone (iOS/Android).
2. Install the **DroidCam desktop client** on your PC.
3. Open both programs, connect them via Wi-Fi or USB, and confirm that DroidCam registers a **virtual webcam device** on your system.
4. Open VitalSense AI in your browser.
5. In the **Authentication View** or **HUD Dashboard Panel**, click the camera selector dropdown and choose the DroidCam virtual source instead of your built-in webcam.

---

## Regulatory Compliance & Disclosures

- **Informational Use Only:** VitalSense AI physiological metrics are intended for general wellness and educational informational tracking only. It is **not** a diagnostic clinical tool and does not replace medical advice or examinations.
- **Arterial Waveform shape:** The rendering represents relative arterial pressure waveform shape only and does not measure blood pressure.
