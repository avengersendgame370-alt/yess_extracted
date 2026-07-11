# VitalSense AI — Contactless Health Monitoring Platform

VitalSense AI is a contactless vital-sign monitoring platform inspired by premium cyber-HUD aesthetics. Using standard camera input (webcams or mobile devices paired via DroidCam), it tracks micro-facial blood flow variations via Remote Photoplethysmography (rPPG) offloaded to the **Presage SmartSpectra Node.js SDK**.

The dashboard includes a real-time face mesh wireframe overlay, heart rate (BPM), respiration rate (RPM), heart-rate variability (RMSSD, SDNN), Baevsky stress index levels, and relative arterial pressure waveforms. Sessions are stored in MongoDB and exportable as clinical-style PDF reports.

---

## Technical Architecture

```text
┌────────────────────┐        WebSocket (frames)        ┌──────────────────────────┐
│  Browser (React)    │ ───────────────────────────────▶ │  Node.js + Express        │
│  - getUserMedia      │                                  │  - Socket.IO server        │
│    (DroidCam or      │ ◀─────────────────────────────── │  - SmartSpectraSDK          │
│     real webcam)      │        WebSocket (vitals)        │    (headless, sendFrame)    │
│  - FaceMesh overlay   │                                  │  - JWT auth (bcrypt)        │
│  - Cyber-HUD dashboard│  ── REST (auth, history, PDF) ─▶ │  - REST API (Express)       │
│  - Session history UI │ ◀──────────────────────────────  │  - PDFKit report export      │
└────────────────────┘                                  └───────────┬──────────────┘
                                                                        │ Mongoose
                                                                        ▼
                                                             ┌────────────────────┐
                                                             │   MongoDB Atlas     │
                                                             │  users, vitallogs   │
                                                             └────────────────────┘
```

---

## Tech Stack
- **Frontend:** React (Vite), Pure CSS custom cyber-HUD variables, Socket.IO-client, MediaPipe FaceMesh (for UI canvas wireframe decoration), Canvas-based real-time line chart.
- **Backend:** Node.js, Express, Socket.IO, `@smartspectra/node-sdk` (Presage SmartSpectra Node SDK running headless on monotonic processes), MongoDB + Mongoose, JWT + bcrypt, PDFKit.
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
   ```
   *Note: If no valid `PRESAGE_API_KEY` is provided, the backend automatically runs in a high-fidelity simulation loop (Mock Mode) so all charts and gauges still update dynamically.*

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
