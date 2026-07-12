import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
const Camera = window.Camera;
const FaceMesh = window.FaceMesh;
import { 
  Heart, 
  Wind, 
  Activity, 
  Shield, 
  Lock, 
  User as UserIcon, 
  History as HistoryIcon, 
  Info, 
  Download, 
  Camera as CameraIcon, 
  LogOut, 
  Video, 
  Play, 
  Square,
  AlertTriangle,
  Eye,
  Brain
} from 'lucide-react';

// API and Socket server URL configurations
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : window.location.origin;

const getStressColor = (label) => {
  const normLabel = (label || '').toUpperCase();
  if (!normLabel || normLabel === '--') {
    return { fg: "#888888", bg: "rgba(136,136,136,0.15)" };
  }
  if (normLabel.includes("HIGH") || normLabel.includes("FATIGUE")) {
    return { fg: "#ff5252", bg: "rgba(255,82,82,0.15)" };
  } else if (normLabel.includes("ELEVATED") || normLabel.includes("STRESS")) {
    return { fg: "#ffaa00", bg: "rgba(255,170,0,0.15)" };
  } else if (normLabel.includes("MODERATE")) {
    return { fg: "#00d9ff", bg: "rgba(0,217,255,0.15)" };
  } else {
    return { fg: "#3ef7a5", bg: "rgba(62,247,165,0.15)" };
  }
};

export default function App() {
  const [view, setView] = useState('LOGIN'); // LOGIN, DASHBOARD, HISTORY, ABOUT
  const [authMode, setAuthMode] = useState('EMAIL_LOGIN'); // EMAIL_LOGIN, REGISTER
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  
  // Form fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // Biometrics registration state
  const [registeredFaceEmbedding, setRegisteredFaceEmbedding] = useState(null);
  const [biometricStatus, setBiometricStatus] = useState('AWAITING SUBJECT...');
  const [isFaceRegistered, setIsFaceRegistered] = useState(false);

  // Device list and selection
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [stream, setStream] = useState(null);
  const [cameraType, setCameraType] = useState('WEBCAM'); // WEBCAM or IP_CAM
  const [ipCamUrl, setIpCamUrl] = useState('http://10.232.74.142:4747/video');

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [validationHint, setValidationHint] = useState('');
  const [vitals, setVitals] = useState({
    heartRate: 0,
    respirationRate: 0,
    spo2: 0,
    stress: 0,
    rmssd: 0,
    sdnn: 0,
    blinkCount: 0,
    blinkRate: 0,
    stress_score: 0,
    stress_label: 'CALIBRATING...',
    confidence: 100,
    talking: 'NO',
    expression: 'CALM / BASELINE',
    signalQuality: 100,
    isLowConfidence: false
  });
  const [waveform, setWaveform] = useState([]);
  const [history, setHistory] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [sysIntegrity, setSysIntegrity] = useState(96);

  // References
  const videoRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const socketRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);
  const scanningRef = useRef(false);
  const ipImgRef = useRef(null);
  const ipLoopActiveRef = useRef(false);
  const cursorDotRef = useRef(null);
  const cursorRingRef = useRef(null);

  // Initialize particles background
  useEffect(() => {
    if (window.particlesJS) {
      window.particlesJS("particles-js", {
        "particles": {
          "number": { "value": 150, "density": { "enable": true, "value_area": 800 } },
          "color": { "value": ["#ffffff", "#ff5252", "#00d9ff", "#3ef7a5"] },
          "shape": { "type": "circle" },
          "opacity": { "value": 0.5, "random": true },
          "size": { "value": 2, "random": true },
          "line_linked": { "enable": true, "distance": 120, "color": "#00d9ff", "opacity": 0.1, "width": 1 },
          "move": { "enable": true, "speed": 1 }
        },
        "interactivity": {
          "events": { "onhover": { "enable": true, "mode": "repulse" }, "onclick": { "enable": true, "mode": "push" } }
        }
      });
    }
  }, [view]);

  // Clean Sci-Fi Cursor Mouse Tracker
  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring) return;

    const onMouseMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      dot.style.transform = `translate3d(${x - 3}px, ${y - 3}px, 0)`;
      ring.style.transform = `translate3d(${x - 16}px, ${y - 16}px, 0)`;
    };

    const onMouseOver = (e) => {
      const target = e.target;
      const isClickable = target.closest('button, a, select, input, [role="button"], .nav-item, .action-btn, .tab-btn, option');
      if (isClickable) {
        ring.classList.add('hover');
      } else {
        ring.classList.remove('hover');
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseover', onMouseOver);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseover', onMouseOver);
    };
  }, []);

  // Log in user session
  const saveAuthSession = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    setAuthError('');
    setView('DASHBOARD');
  };

  // Log out session
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    stopScanning();
    setView('LOGIN');
    setAuthMode('EMAIL_LOGIN');
  };

  // Fetch device inputs
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      setDevices(videoInputs);
      if (videoInputs.length > 0) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    }).catch(err => {
      console.error("Failed to enumerate devices:", err);
      addSystemLog("Camera hardware query failed", "error");
    });
  }, []);

  // Set up socket connections
  useEffect(() => {
    socketRef.current = io(SERVER_URL, {
      transports: ['websocket', 'polling']
    });

    socketRef.current.on('connect', () => {
      console.log("[Socket] Telemetry connection active");
      addSystemLog("Telemetry Secure Link Established", "success");
    });

    socketRef.current.on('vitals_update', (data) => {
      setVitals(data);
      if (data.filteredWave) {
        setWaveform(data.filteredWave);
      }
    });

    socketRef.current.on('validation_hint', (data) => {
      setValidationHint(data.hint);
    });

    socketRef.current.on('sdk_error', (data) => {
      addSystemLog(`SDK Notification: ${data.message}`, "warning");
    });

    socketRef.current.on('session_saved', (log) => {
      addSystemLog("Biometric session persisted to MongoDB Atlas", "success");
      fetchHistory();
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [token]);

  // Fetch history list
  const fetchHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/vitals/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    if (view === 'HISTORY') {
      fetchHistory();
    }
  }, [view]);

  // System logs aggregator
  const addSystemLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setSystemLogs(prev => [{ time, msg, type }, ...prev].slice(0, 15));
  };

  // Helper: Biometric signature calculations (Euclidean vector ratios)
  const calculateBiometricVector = (landmarks) => {
    if (!landmarks || landmarks.length < 468) return null;
    
    const getDist = (p1, p2) => Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2)
    );
    
    const nose = landmarks[1];
    const chin = landmarks[152];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const mouthL = landmarks[61];
    const mouthR = landmarks[291];
    
    const d_eyes = getDist(leftEye, rightEye) || 0.001;
    const d_nose_mouth = getDist(nose, { x: (mouthL.x + mouthR.x)/2, y: (mouthL.y + mouthR.y)/2, z: (mouthL.z + mouthR.z)/2 });
    const d_nose_chin = getDist(nose, chin);
    const d_mouth_width = getDist(mouthL, mouthR);
    const d_nose_left_eye = getDist(nose, leftEye);
    const d_nose_right_eye = getDist(nose, rightEye);
    
    return [
      d_nose_mouth / d_eyes,
      d_nose_chin / d_eyes,
      d_mouth_width / d_eyes,
      d_nose_left_eye / d_eyes,
      d_nose_right_eye / d_eyes
    ];
  };

  // Handle standard registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          email: regEmail,
          password: regPassword,
          faceEmbedding: registeredFaceEmbedding
        })
      });
      const data = await res.json();
      if (res.ok) {
        saveAuthSession(data.token, data.user);
      } else {
        setAuthError(data.error || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Connection server registry error');
    }
  };

  // Handle traditional Login
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        saveAuthSession(data.token, data.user);
      } else {
        setAuthError(data.error || 'Login failed');
      }
    } catch (err) {
      setAuthError('Connection login verification error');
    }
  };

  // Trigger camera for login/register biometric scanner
  useEffect(() => {
    if (view === 'LOGIN' && (authMode === 'FACE_LOGIN' || authMode === 'REGISTER')) {
      initializeFaceMeshScanner();
    } else if (view === 'DASHBOARD') {
      // In dashboard we control camera via play/stop scan button, but let's clear login resources
      cleanupCamera();
    }
    return () => cleanupCamera();
  }, [view, authMode, selectedDeviceId]);

  // Camera cleanup
  const cleanupCamera = () => {
    ipLoopActiveRef.current = false;
    scanningRef.current = false;
    if (ipImgRef.current) {
      ipImgRef.current.src = "";
    }
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
  };

  // Initialize MediaPipe FaceMesh for authentication scanner views
  const initializeFaceMeshScanner = async () => {
    cleanupCamera();
    
    // Safety check: verify MediaPipe CDNs are fully loaded
    if (typeof window.FaceMesh === 'undefined' || typeof window.Camera === 'undefined') {
      setBiometricStatus('LOADING CORE AI LIBRARIES...');
      addSystemLog("Awaiting MediaPipe WebAssembly CDNs...", "info");
      setTimeout(initializeFaceMeshScanner, 1000);
      return;
    }
    
    // Create new FaceMesh context
    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      const canvas = outputCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw camera mirror
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Calculate biometric vector
        const vector = calculateBiometricVector(landmarks);
        
        // Render cosmetic cyan wireframe grid
        ctx.strokeStyle = '#00d9ff';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < landmarks.length; i += 4) {
          const pt = landmarks[i];
          const x = (1 - pt.x) * canvas.width; // mirrored
          const y = pt.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0, 217, 255, 0.6)';
          ctx.fill();
        }

        if (authMode === 'REGISTER') {
          setRegisteredFaceEmbedding(vector);
          setIsFaceRegistered(true);
          setBiometricStatus('FACE ACQUIRED - DATA ENCODED');
        } else if (authMode === 'FACE_LOGIN' && !scanningRef.current) {
          scanningRef.current = true;
          setBiometricStatus('MATCHING BIOMETRICS...');
          
          // Submit face vector for authentication match
          fetch(`${SERVER_URL}/api/auth/biometric-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faceEmbedding: vector })
          })
          .then(res => res.json())
          .then(data => {
            if (data.token) {
              setBiometricStatus('IDENTITY VERIFIED. ACCESS GRANTED.');
              setTimeout(() => {
                saveAuthSession(data.token, data.user);
                scanningRef.current = false;
              }, 1000);
            } else {
              setBiometricStatus('IDENTITY NOT CONFIRMED.');
              setTimeout(() => {
                scanningRef.current = false;
              }, 2000);
            }
          })
          .catch(err => {
            console.error("Biometric match network error:", err);
            setBiometricStatus('AUTH SERVER UNREACHABLE.');
            setTimeout(() => {
              scanningRef.current = false;
            }, 3000);
          });
        }
      } else {
        setBiometricStatus('SEARCHING SUBJECT...');
        if (authMode === 'REGISTER') {
          setIsFaceRegistered(false);
        }
      }
    });

    faceMeshRef.current = faceMesh;

    // For authentication/login page: ALWAYS use the local laptop webcam
    try {
      // 1. Request camera permission first with a generic video request so labels are populated
      let mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // 2. Once permission is active, enumerate devices to find the built-in camera
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devList.filter(d => d.kind === 'videoinput');
      
      // 3. Find the first video device that does NOT contain "droidcam" or "virtual"
      let targetDevice = videoDevs.find(d => {
        const name = (d.label || '').toLowerCase();
        return name && !name.includes('droidcam') && !name.includes('virtual');
      });

      // If we found a specific non-DroidCam camera, stop the temp stream and open the specific one
      if (targetDevice) {
        const currentTrack = mediaStream.getVideoTracks()[0];
        const currentSettings = currentTrack ? currentTrack.getSettings() : {};
        if (currentSettings.deviceId !== targetDevice.deviceId) {
          mediaStream.getTracks().forEach(t => t.stop());
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: targetDevice.deviceId } }
          });
        }
      }

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await faceMesh.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480
      });
      camera.start();
      cameraRef.current = camera;
      addSystemLog("Laptop camera feed initiated for face mesh mapping", "success");
    } catch (err) {
      console.error("Failed to start laptop camera for FaceMesh:", err);
      setBiometricStatus('ERROR: CAMERA ACCESS DENIED');
      addSystemLog("Failed to capture laptop webcam feed - verify permissions", "error");
    }
  };

  // Frame pipe loop that runs at a solid 30 fps, sending raw RGB frames to Socket.io
  const startFramePiping = (videoEl, imgEl, mode) => {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 320;
    offscreenCanvas.height = 240;
    const offCtx = offscreenCanvas.getContext('2d');

    const fps = 30;
    const interval = 1000 / fps;
    let lastTime = performance.now();
    const sessionStart = performance.now();

    const pipeFrame = () => {
      // Loop halts if scanning is stopped
      if (!scanningRef.current) return;

      const now = performance.now();
      const elapsed = now - lastTime;

      if (elapsed >= interval) {
        lastTime = now - (elapsed % interval);

        try {
          offCtx.save();
          offCtx.translate(320, 0);
          offCtx.scale(-1, 1);
          
          let hasFrame = false;
          if (mode === 'IP_CAM') {
            if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
              offCtx.drawImage(imgEl, 0, 0, 320, 240);
              hasFrame = true;
            }
          } else {
            if (videoEl && videoEl.readyState >= 2) {
              offCtx.drawImage(videoEl, 0, 0, 320, 240);
              hasFrame = true;
            }
          }
          offCtx.restore();

          if (hasFrame) {
            const imgData = offCtx.getImageData(0, 0, 320, 240);
            const data = imgData.data;
            const rgbBuffer = new Uint8Array(320 * 240 * 3);
            let rgbIdx = 0;
            for (let i = 0; i < data.length; i += 4) {
              rgbBuffer[rgbIdx++] = data[i];
              rgbBuffer[rgbIdx++] = data[i + 1];
              rgbBuffer[rgbIdx++] = data[i + 2];
            }

            if (socketRef.current && socketRef.current.connected) {
              socketRef.current.emit('stream_frame_data', {
                frame: rgbBuffer.buffer,
                width: 320,
                height: 240,
                timestampUs: Math.round((performance.now() - sessionStart) * 1000)
              });
            }
          }
        } catch (err) {
          console.error("Frame pipe loop error:", err);
        }
      }

      requestAnimationFrame(pipeFrame);
    };

    requestAnimationFrame(pipeFrame);
  };

  // Start vital scan telemetry session
  const startScanning = async () => {
    if (isScanning) return;
    
    // Safety check: verify MediaPipe is loaded
    if (typeof window.FaceMesh === 'undefined' || typeof window.Camera === 'undefined') {
      addSystemLog("AI Engine library not fully loaded yet. Please wait.", "warning");
      return;
    }

    setIsScanning(true);
    addSystemLog("Initializing VitalSense scanning session", "info");

    socketRef.current.emit('start_session', { token });

    // Set up camera and FaceMesh pipelines for dashboard overlay
    const faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults((results) => {
      const canvas = outputCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw camera mirror
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Draw client cosmetic mesh grid
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        ctx.strokeStyle = 'rgba(0, 217, 255, 0.4)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < landmarks.length; i += 8) {
          const pt = landmarks[i];
          const x = (1 - pt.x) * canvas.width;
          const y = pt.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(62, 247, 165, 0.6)';
          ctx.fill();
        }
      }
    });

    faceMeshRef.current = faceMesh;

    if (cameraType === 'IP_CAM') {
      try {
        let targetUrl = ipCamUrl;
        if (!targetUrl.endsWith('/video') && !targetUrl.endsWith('/video.force') && !targetUrl.endsWith('/mjpeg')) {
          targetUrl = targetUrl.replace(/\/$/, '') + '/video';
        }
        const proxiedUrl = `${SERVER_URL}/api/droidcam-proxy?url=${encodeURIComponent(targetUrl)}`;
        addSystemLog(`Linking IP Camera Proxy: ${targetUrl}`, "info");
        
        ipLoopActiveRef.current = true;
        scanningRef.current = true;
        if (ipImgRef.current) {
          ipImgRef.current.src = proxiedUrl;
        }

        const ipScanLoop = async () => {
          if (!ipLoopActiveRef.current || !scanningRef.current) return;
          if (ipImgRef.current && ipImgRef.current.complete && ipImgRef.current.naturalWidth > 0) {
            try {
              await faceMesh.send({ image: ipImgRef.current });
            } catch (err) {
              console.error("IP Cam FaceMesh send error:", err);
            }
          }
          setTimeout(() => {
            requestAnimationFrame(ipScanLoop);
          }, 33);
        };
        ipScanLoop();

        // Start high-performance 30 FPS stream
        startFramePiping(null, ipImgRef.current, 'IP_CAM');
        addSystemLog("IP camera loop active", "success");
      } catch (err) {
        console.error("Failed to start scan camera:", err);
        setIsScanning(false);
        addSystemLog("Failed to link IP camera stream", "error");
      }
    } else {
      try {
        const constraints = {
          video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
        };
        
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current) {
              await faceMesh.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
        camera.start();
        cameraRef.current = camera;
        scanningRef.current = true;

        // Start high-performance 30 FPS stream
        startFramePiping(videoRef.current, null, 'WEBCAM');
        addSystemLog("Scan active - stream linked", "success");
      } catch (err) {
        console.error("Failed to start scan camera:", err);
        setIsScanning(false);
        addSystemLog("Failed to boot scanning stream camera", "error");
      }
    }
  };

  // Stop scanning telemetry session
  const stopScanning = async () => {
    if (!isScanning) return;
    setIsScanning(false);
    setValidationHint('');
    addSystemLog("Terminating telemetry stream session", "info");

    if (socketRef.current) {
      socketRef.current.emit('end_session');
    }

    cleanupCamera();
    setVitals({
      heartRate: 0,
      respirationRate: 0,
      spo2: 0,
      stress: 0,
      rmssd: 0,
      sdnn: 0,
      blinkCount: 0,
      talking: 'NO',
      expression: 'CALM / BASELINE',
      signalQuality: 0,
      isLowConfidence: true
    });
    setWaveform([]);
  };

  // Draw real-time arterial pressure waveform chart on canvas
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || waveform.length === 0) return;
    const ctx = canvas.getContext('2d');
    
    // Handle retina display sizes
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const data = waveform;
    const min = Math.min(...data);
    const max = Math.max(...data);
    let range = max - min;
    if (range === 0) range = 1;

    ctx.lineJoin = 'round';
    
    // Waveform linear color gradient filling
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0, 217, 255, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 217, 255, 0.0)');

    ctx.beginPath();
    ctx.fillStyle = gradient;
    const padding = canvas.height * 0.15;
    const drawHeight = canvas.height * 0.7;
    
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * canvas.width;
      const y = padding + drawHeight - ((data[i] - min) / range) * drawHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fill();

    // Stroke line neon glows
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#00d9ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00d9ff';
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * canvas.width;
      const y = padding + drawHeight - ((data[i] - min) / range) * drawHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }, [waveform]);

  return (
    <div className="monitor-container">
      {/* Background container */}
      <div id="particles-js" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1 }}></div>
      <img ref={ipImgRef} style={{ display: 'none' }} crossOrigin="anonymous" alt="Global IP Cam Feed" />

      {/* --- RENDER VIEWS --- */}
      {view === 'LOGIN' && (
        <div className="login-screen" style={{ position: 'relative', width: '100%', height: '100vh', background: 'transparent' }}>
          <div className="login-bg-grid"></div>
          <div className="login-box-enhanced">
            <div className="brand-header">
              <span style={{ color: '#ffffff', fontSize: '2.5rem', fontWeight: 600 }}>Vital</span>
              <span style={{ color: '#ff5252', fontSize: '2.5rem', fontWeight: 600 }}>Sense</span>
              <div className="brand-sub">SYSTEM AUTHENTICATION</div>
            </div>

            {/* Mode tabs selector */}
            <div className="login-tabs" style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <button 
                onClick={() => { setAuthMode('EMAIL_LOGIN'); setAuthError(''); setAuthMessage(''); }} 
                className={`tab-btn ${authMode === 'EMAIL_LOGIN' ? 'active' : ''}`}
                style={{ padding: '0.5rem 1.5rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
              >
                EMAIL LOGIN
              </button>
              <button 
                onClick={() => { setAuthMode('REGISTER'); setAuthError(''); setAuthMessage(''); }} 
                className={`tab-btn ${authMode === 'REGISTER' ? 'active' : ''}`}
                style={{ padding: '0.5rem 1.5rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
              >
                REGISTER
              </button>
            </div>

            {/* Error notifications */}
            {authError && <div style={{ color: '#ff5252', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem', textTransform: 'uppercase', textShadow: '0 0 5px rgba(255,82,82,0.4)', textAlign: 'center' }}>{authError}</div>}
            {authMessage && <div style={{ color: '#3ef7a5', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem', textTransform: 'uppercase', textShadow: '0 0 5px rgba(62,247,165,0.4)', textAlign: 'center' }}>{authMessage}</div>}



            {/* 2. Email Login Form */}
            {authMode === 'EMAIL_LOGIN' && (
              <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', width: '100%', maxWidth: '350px', margin: '0 auto' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EMAIL ADDRESS</label>
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required placeholder="Email / Username" autoComplete="off" className="sci-input" style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SECURE PASSWORD</label>
                  <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required placeholder="Password" autoComplete="new-password" className="sci-input" style={{ width: '100%' }} />
                </div>
                <button type="submit" className="action-btn" style={{ marginTop: '1rem', padding: '0.7rem', fontSize: '1rem', width: '100%' }}>
                  AUTHENTICATE CREDENTIALS
                </button>
              </form>
            )}

            {/* 3. Registration Form */}
            {authMode === 'REGISTER' && (
              <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '350px', margin: '0 auto' }}>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>FULL NAME</label>
                  <input type="text" value={regName} onChange={e => setRegName(e.target.value)} required placeholder="Full Name" autoComplete="off" className="sci-input" style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>EMAIL ADDRESS</label>
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required placeholder="Email Address" autoComplete="off" className="sci-input" style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>PASSWORD</label>
                  <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required placeholder="Password" autoComplete="new-password" className="sci-input" style={{ width: '100%' }} />
                </div>

                {/* Biometric camera enrollment section */}
                <div style={{ border: '1px solid var(--border-color)', padding: '0.8rem', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#fff' }}>FACIAL BIOMETRIC REGISTER</span>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', border: '1px solid', borderColor: isFaceRegistered ? '#3ef7a5' : '#ff5252', color: isFaceRegistered ? '#3ef7a5' : '#ff5252', borderRadius: '2px' }}>
                      {isFaceRegistered ? 'LOCKED' : 'OPTIONAL'}
                    </span>
                  </div>
                  
                  <div className="scanner-container" style={{ width: '100%', height: '140px', margin: '0 0 0.5rem 0' }}>
                    <video ref={videoRef} style={{ display: 'none' }} playsInline muted></video>
                    <canvas ref={outputCanvasRef} width="640" height="480" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}></canvas>
                  </div>
                  
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: isFaceRegistered ? '#3ef7a5' : '#94a3b8', textAlign: 'center' }}>
                    {biometricStatus}
                  </div>
                </div>

                <button type="submit" className="action-btn" style={{ marginTop: '0.5rem', padding: '0.7rem', fontSize: '1rem', width: '100%' }}>
                  CREATE SECURE ACCOUNT
                </button>
              </form>
            )}



            {/* Offline Bypass Override */}
            <button 
              onClick={() => {
                setView('DASHBOARD');
                addSystemLog("Offline bypass override active - running serverless sim", "warning");
              }} 
              className="action-btn bypass-btn" 
              style={{ marginTop: '2rem' }}
            >
              LOCAL OVERRIDE (DEMO SCAN)
            </button>
          </div>
        </div>
      )}

      {view !== 'LOGIN' && (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {/* Top Header */}
          <header className="hud-header">
            <div className="hud-logo-section">
              <span className="hud-logo-glow">Vital</span>
              <span className="hud-logo-accent">Sense</span>
              <span className="hud-live-tag">
                <span className={`glow-dot ${isScanning ? 'alert-pulse-red' : ''}`} style={{ backgroundColor: isScanning ? '#ff5252' : '#3ef7a5' }}></span>
                {isScanning ? 'LIVE SCAN' : 'SYSTEM READY'}
              </span>
            </div>
            
            <div className="hud-telemetry">
              <div className="telemetry-item"><span className="label">AI ENGINE:</span> <span className="value text-blue">{isScanning ? 'RUNNING' : 'STANDBY'}</span></div>
              <div className="telemetry-item"><span className="label">SIGNAL LOCK:</span> <span className={`value ${vitals.isLowConfidence ? 'text-red' : 'text-green'}`}>{vitals.isLowConfidence ? 'SEARCHING' : 'LOCKED'}</span></div>
              <div className="telemetry-item"><span className="label">NET STATUS:</span> <span className="value text-green">ONLINE</span></div>
              <div className="telemetry-item"><span className="label">OPERATOR:</span> <span className="value text-blue" style={{ textTransform: 'uppercase' }}>{user ? user.name : 'DEMO USER'}</span></div>
            </div>

            <div className="hud-user-actions" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
              <button 
                onClick={handleLogout} 
                className="hud-icon-btn" 
                title="Disconnect Node"
                style={{ background: 'transparent', border: '1px solid rgba(255,82,82,0.4)', color: '#ff5252', padding: '0.4rem', cursor: 'pointer', borderRadius: '4px' }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>

          <div style={{ display: 'flex', flex: 1, gap: '1.5rem', width: '100%', minHeight: 'calc(100vh - 120px)' }}>
            
            {/* Sidebar navigation */}
            <aside className="sidebar-hud">
              <div className="sidebar-logo">V<span>S</span></div>
              <nav className="sidebar-nav">
                <div onClick={() => { stopScanning(); setView('DASHBOARD'); }} className={`nav-item ${view === 'DASHBOARD' ? 'active' : ''}`} title="HUD Vitals Dashboard">
                  <Activity size={22} />
                  <span className="nav-label">HUD SCAN</span>
                </div>
                <div onClick={() => { stopScanning(); setView('HISTORY'); }} className={`nav-item ${view === 'HISTORY' ? 'active' : ''}`} title="Biometric History Logs">
                  <HistoryIcon size={22} />
                  <span className="nav-label">HISTORY</span>
                </div>
                <div onClick={() => { stopScanning(); setView('ABOUT'); }} className={`nav-item ${view === 'ABOUT' ? 'active' : ''}`} title="Compliance & Specifications">
                  <Info size={22} />
                  <span className="nav-label">COMPLIANCE</span>
                </div>
              </nav>
            </aside>

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* --- DASHBOARD VIEW --- */}
              {view === 'DASHBOARD' && (
                <main className="monitor-grid" style={{ width: '100%' }}>
                  
                  {/* Left Column: Live camera feed */}
                  <div className="col-left">
                    <div className="sci-panel panel-camera" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>LIVE STREAM FEED (rPPG WIREFRAME)</span>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button 
                            type="button"
                            onClick={() => { stopScanning(); setCameraType('WEBCAM'); }}
                            className={`action-btn ${cameraType === 'WEBCAM' ? 'active' : ''}`}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem', borderColor: cameraType === 'WEBCAM' ? '#00d9ff' : 'var(--border-color)', color: '#fff', background: cameraType === 'WEBCAM' ? 'rgba(0,217,255,0.15)' : 'transparent', height: '26px' }}
                          >
                            WEBCAM
                          </button>
                          <button 
                            type="button"
                            onClick={() => { stopScanning(); setCameraType('IP_CAM'); }}
                            className={`action-btn ${cameraType === 'IP_CAM' ? 'active' : ''}`}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem', borderColor: cameraType === 'IP_CAM' ? '#00d9ff' : 'var(--border-color)', color: '#fff', background: cameraType === 'IP_CAM' ? 'rgba(0,217,255,0.15)' : 'transparent', height: '26px' }}
                          >
                            DROIDCAM IP
                          </button>
                          
                          {cameraType === 'WEBCAM' ? (
                            devices.length > 0 && (
                              <select 
                                value={selectedDeviceId} 
                                onChange={e => setSelectedDeviceId(e.target.value)} 
                                className="sci-input"
                                disabled={isScanning}
                                style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', width: '130px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,217,255,0.3)', color: '#00d9ff', height: '26px' }}
                              >
                                {devices.map((d, idx) => (
                                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${idx + 1}`}</option>
                                ))}
                              </select>
                            )
                          ) : (
                            <input 
                              type="text" 
                              value={ipCamUrl}
                              onChange={e => setIpCamUrl(e.target.value)}
                              placeholder="http://10.232.74.142:4747/video"
                              className="sci-input"
                              disabled={isScanning}
                              style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', width: '170px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,217,255,0.3)', color: '#00d9ff', textAlign: 'center', height: '26px' }}
                            />
                          )}
                        </div>
                      </div>
                      
                      <div className="camera-wrapper" style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
                        {isScanning && (vitals.confidence < 50 || vitals.signalQuality < 50) && (
                          <div style={{
                            position: 'absolute',
                            top: '40px',
                            left: '10px',
                            right: '10px',
                            background: 'rgba(255, 82, 82, 0.9)',
                            border: '1px solid #ff5252',
                            color: '#fff',
                            fontSize: '0.75rem',
                            padding: '0.4rem',
                            borderRadius: '4px',
                            textAlign: 'center',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontFamily: 'var(--font-mono)',
                            animation: 'pulseAlert 1.5s infinite'
                          }}>
                            <AlertTriangle size={12} />
                            <span>LOW CONFIDENCE: ADJUST LIGHTING / HOLD STILL</span>
                          </div>
                        )}
                        <div className="hud-laser"></div>
                        <div className="hud-floating-label" style={{ top: '10px', left: '10px' }} id="hudDetectStatus">
                          {isScanning ? (vitals.isLowConfidence ? 'SEARCHING SKIN...' : 'SIGNAL SYNC LOCKED') : 'SYSTEM OFFLINE'}
                        </div>
                        <div className="hud-floating-label" style={{ top: '10px', right: '10px' }}>
                          QUALITY: {vitals.signalQuality}%
                        </div>
                        
                        <div className="hex-bg"></div>
                        <div className="corner-accents">
                          <div className="ca top-left"></div>
                          <div className="ca top-right"></div>
                          <div className="ca bot-left"></div>
                          <div className="ca bot-right"></div>
                        </div>

                        <video ref={videoRef} style={{ display: 'none' }} playsInline muted></video>
                        <canvas ref={outputCanvasRef} width="640" height="480" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}></canvas>
                      </div>

                      <div className="camera-footer">
                        {/* Session Control Buttons */}
                        <div style={{ display: 'flex', gap: '1rem', width: '100%', marginBottom: '1rem' }}>
                          {!isScanning ? (
                            <button onClick={startScanning} className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderColor: '#3ef7a5', color: '#3ef7a5', boxShadow: '0 0 10px rgba(62,247,165,0.15)' }}>
                              <Play size={14} /> START HEALTH LOCK
                            </button>
                          ) : (
                            <button onClick={stopScanning} className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderColor: '#ff5252', color: '#ff5252', boxShadow: '0 0 10px rgba(255,82,82,0.15)' }}>
                              <Square size={14} /> HALT TELEMETRY
                            </button>
                          )}
                        </div>

                        <div className="conf-text">
                          <span>PPG SIGNAL CONFIDENCE</span>
                          <span>{vitals.signalQuality}%</span>
                        </div>
                        <div className="progress-track" style={{ height: '4px', background: 'rgba(0,217,255,0.1)' }}>
                          <div className="progress-fill" style={{ width: `${vitals.signalQuality}%`, backgroundColor: vitals.isLowConfidence ? '#ff5252' : '#3ef7a5', boxShadow: vitals.isLowConfidence ? '0 0 8px #ff5252' : '0 0 8px #3ef7a5' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Core Vitals (Heart Rate, Respiration Rate, SpO2, waveform, ML additions) */}
                  <div className="col-middle">
                    {/* Vitals Sub-Grid Container */}
                    <div className="vitals-grid-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', flex: 'none' }}>
                      
                      {/* Heart Rate Display */}
                      <div className="sci-panel panel-hr" style={{ flex: 'none', margin: 0 }}>
                        <div className="panel-header" style={{ padding: '0.6rem 0.8rem' }}>
                          <div className="header-title" style={{ fontSize: '0.75rem' }}>
                            <Heart size={14} className="icon-red" />
                            HEART RATE
                          </div>
                          <div className="dots">...</div>
                        </div>
                        <div className="panel-body" style={{ padding: '0.4rem 0.8rem 0.8rem 0.8rem' }}>
                          <div className="readout" style={{ marginBottom: '0.2rem' }}>
                            <span className="value text-red" style={{ fontFamily: 'var(--font-numeric)', fontSize: '2rem' }}>
                              {vitals.heartRate > 0 ? vitals.heartRate : '--'}
                            </span>
                            <span className="unit" style={{ fontSize: '0.8rem', marginLeft: '0.2rem' }}>BPM</span>
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            rPPG ROLLING ESTIMATE
                          </div>
                        </div>
                      </div>

                      {/* Cognitive Stress Level Display */}
                      <div className="sci-panel panel-stress-level" style={{ flex: 'none', margin: 0 }}>
                        <div className="panel-header" style={{ padding: '0.6rem 0.8rem' }}>
                          <div className="header-title" style={{ fontSize: '0.75rem' }}>
                            <Brain size={14} style={{ color: '#ff5252' }} />
                            STRESS PROFILE
                          </div>
                          <div className="dots">...</div>
                        </div>
                        <div className="panel-body" style={{ padding: '0.4rem 0.8rem 0.8rem 0.8rem' }}>
                          <div className="readout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span className="value text-red" style={{ fontFamily: 'var(--font-numeric)', fontSize: '2rem', lineHeight: 1 }}>
                              {vitals.heartRate > 0 && (vitals.stress_score !== undefined && vitals.stress_score > 0 ? vitals.stress_score : (vitals.stress > 0 ? vitals.stress : '--')) || '--'}
                            </span>
                            <div style={{
                              fontSize: '0.55rem',
                              padding: '0.1rem 0.4rem',
                              marginTop: '0.3rem',
                              borderRadius: '3px',
                              fontWeight: 'bold',
                              fontFamily: 'var(--font-hud)',
                              border: '1px solid',
                              background: getStressColor(vitals.heartRate > 0 ? (vitals.stress_label || 'CALM / BASELINE') : '--').bg,
                              color: getStressColor(vitals.heartRate > 0 ? (vitals.stress_label || 'CALM / BASELINE') : '--').fg,
                              borderColor: getStressColor(vitals.heartRate > 0 ? (vitals.stress_label || 'CALM / BASELINE') : '--').fg
                            }}>
                              {vitals.heartRate > 0 ? (vitals.stress_label || 'CALM / BASELINE') : '--'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Respiration Rate Display */}
                      <div className="sci-panel panel-rr" style={{ flex: 'none', margin: 0 }}>
                        <div className="panel-header" style={{ padding: '0.6rem 0.8rem' }}>
                          <div className="header-title" style={{ fontSize: '0.75rem' }}>
                            <Wind size={14} style={{ color: '#3ef7a5' }} />
                            RESPIRATORY RATE
                          </div>
                          <div className="dots">...</div>
                        </div>
                        <div className="panel-body" style={{ padding: '0.4rem 0.8rem 0.8rem 0.8rem' }}>
                          <div className="readout" style={{ marginBottom: '0.2rem' }}>
                            <span className="value text-green" style={{ fontFamily: 'var(--font-numeric)', fontSize: '2rem' }}>
                              {vitals.respirationRate > 0 ? vitals.respirationRate : '--'}
                            </span>
                            <span className="unit" style={{ fontSize: '0.8rem', marginLeft: '0.2rem' }}>RPM</span>
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            CHEST SPECTRA WINDOW
                          </div>
                        </div>
                      </div>



                      {/* SpO2 Display */}
                      <div className="sci-panel panel-spo2" style={{ flex: 'none', margin: 0 }}>
                        <div className="panel-header" style={{ padding: '0.6rem 0.8rem' }}>
                          <div className="header-title" style={{ fontSize: '0.75rem' }}>
                            <Shield size={14} style={{ color: '#00d9ff' }} />
                            BLOOD OXYGEN (SpO2)
                          </div>
                          <div className="dots">...</div>
                        </div>
                        <div className="panel-body" style={{ padding: '0.4rem 0.8rem 0.8rem 0.8rem' }}>
                          <div className="readout" style={{ marginBottom: '0.2rem' }}>
                            <span className="value text-blue" style={{ fontFamily: 'var(--font-numeric)', fontSize: '2rem' }}>
                              {vitals.spo2 > 0 ? `${vitals.spo2}%` : '--'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            AC/DC RED RATIO-OF-RATIOS
                          </div>
                        </div>
                      </div>

                      {/* Signal Confidence Display */}
                      <div className="sci-panel panel-confidence" style={{ flex: 'none', margin: 0, gridColumn: 'span 2' }}>
                        <div className="panel-header" style={{ padding: '0.6rem 0.8rem' }}>
                          <div className="header-title" style={{ fontSize: '0.75rem' }}>
                            <Shield size={14} style={{ color: '#3ef7a5' }} />
                            QUALITY INDEX
                          </div>
                          <div className="dots">...</div>
                        </div>
                        <div className="panel-body" style={{ padding: '0.4rem 0.8rem 0.8rem 0.8rem' }}>
                          <div className="readout" style={{ marginBottom: '0.2rem' }}>
                            <span className="value" style={{ color: vitals.confidence < 50 ? '#ff5252' : '#3ef7a5', fontFamily: 'var(--font-numeric)', fontSize: '2rem' }}>
                              {vitals.confidence !== undefined ? `${Math.round(vitals.confidence)}%` : `${vitals.signalQuality}%`}
                            </span>
                          </div>
                          <div className="progress-track" style={{ height: '3px', background: 'rgba(0,217,255,0.1)', marginTop: '0.2rem', width: '100%' }}>
                            <div className="progress-fill" style={{ width: `${vitals.confidence !== undefined ? vitals.confidence : vitals.signalQuality}%`, backgroundColor: vitals.confidence < 50 ? '#ff5252' : '#3ef7a5' }}></div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Arterial Waveform Display */}
                    <div className="sci-panel panel-art" style={{ flex: 1, minHeight: '120px' }}>
                      <div className="panel-header">
                        <div className="header-title">
                          <Activity size={14} style={{ color: '#00d9ff' }} />
                          ART WAVEFORM (RELATIVE PATTERN)
                        </div>
                        <div className="dots">...</div>
                      </div>
                      <div className="panel-body art-body" style={{ flex: 1, minHeight: '100px' }}>
                        <div className="wave-container" style={{ height: '100%' }}>
                          <canvas ref={chartCanvasRef}></canvas>
                          <div className="y-axis">
                            <span>+2.0</span>
                            <span>0.0</span>
                            <span>-2.0</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: HRV, Stress, Behavior, and Logs */}
                  <div className="col-right">
                    {/* HRV Grid panel */}
                    <div className="sci-panel panel-hrv" style={{ flex: 'none' }}>
                      <div className="panel-header">HRV & STRESS INDICES (60S WINDOW)</div>
                      <div className="hrv-grid">
                        <div className="hrv-box">
                          <div className="label">SDNN (BEAT-TO-BEAT)</div>
                          <div className="val text-blue" style={{ fontFamily: 'var(--font-numeric)' }}>
                            {vitals.sdnn > 0 ? vitals.sdnn : '--'}<span className="unit">ms</span>
                          </div>
                        </div>
                        <div className="hrv-box">
                          <div className="label">RMSSD (VAGAL INDEX)</div>
                          <div className="val text-blue" style={{ fontFamily: 'var(--font-numeric)' }}>
                            {vitals.rmssd > 0 ? vitals.rmssd : '--'}<span className="unit">ms</span>
                          </div>
                        </div>
                        <div className="hrv-box" style={{ gridColumn: 'span 2' }}>
                          <div className="label">BAEVSKY STRESS INDEX</div>
                          <div className="val text-green" style={{ fontFamily: 'var(--font-numeric)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{vitals.stress > 0 ? vitals.stress : '--'}</span>
                            {vitals.stress > 0 && (
                              <span style={{ fontSize: '0.8rem', padding: '0.1rem 0.5rem', background: vitals.stress > 150 ? 'rgba(255,82,82,0.1)' : 'rgba(62,247,165,0.1)', color: vitals.stress > 150 ? '#ff5252' : '#3ef7a5', border: '1px solid', borderRadius: '4px' }}>
                                {vitals.stress > 150 ? 'ELEVATED STRESS' : 'STABLE COGNITIVE'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Behavioral State */}
                    <div className="sci-panel" style={{ flex: 'none' }}>
                      <div className="panel-header">COGNITIVE / BEHAVIOR STATE</div>
                      <div className="face-grid" style={{ marginBottom: '1rem' }}>
                        <div className="face-box" style={{ gridColumn: 'span 2' }}>
                          <div className="label">SPEECH DETECTED</div>
                          <div className="val text-green" style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem' }}>{vitals.heartRate > 0 ? vitals.talking : '--'}</div>
                        </div>
                      </div>
                      <div style={{ padding: '0 1rem 1rem 1rem' }}>
                        <div className="label" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>EXPRESSION PROFILE</div>
                        <div className="text-green" style={{ fontFamily: 'var(--font-hud)', fontSize: '1.3rem', fontWeight: 500, letterSpacing: '1px' }}>
                          {vitals.heartRate > 0 ? vitals.expression : 'NO FACE DETECTED'}
                        </div>
                      </div>
                    </div>

                    {/* System Logs / Diagnostics */}
                    <div className="sci-panel" style={{ flex: 1, minHeight: '180px' }}>
                      <div className="panel-header">DIAGNOSTICS & SYSTEM TERMINAL</div>
                      <div style={{ flex: 1, padding: '0 1rem 1rem 1rem', display: 'flex', flexDirection: 'column' }}>
                        
                        {/* Validation Hints banner */}
                        {validationHint && (
                          <div style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid #ffaa00', color: '#ffaa00', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', animation: 'pulseAlert 2s infinite' }}>
                            <AlertTriangle size={14} />
                            <span>ATTENTION: {validationHint.toUpperCase()}</span>
                          </div>
                        )}

                        <div className="terminal-screen" style={{ flex: 1, background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', overflowY: 'auto', maxHeight: '180px' }}>
                          {systemLogs.length === 0 ? (
                            <div style={{ color: 'rgba(255,255,255,0.3)' }}>Awaiting telemetry stream packets...</div>
                          ) : (
                            systemLogs.map((log, idx) => (
                              <div key={idx} style={{ marginBottom: '0.2rem', color: log.type === 'success' ? '#3ef7a5' : (log.type === 'error' ? '#ff5252' : (log.type === 'warning' ? '#ffaa00' : '#00d9ff')) }}>
                                <span>[{log.time}]</span> <span>{log.msg}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                </main>
              )}

              {/* --- SESSION HISTORY VIEW --- */}
              {view === 'HISTORY' && (
                <div className="sci-panel" style={{ flex: 1, animation: 'fadeSlideUp 0.5s ease-out' }}>
                  <div className="panel-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>HISTORICAL HEALTH METRIC TELEMETRY RECORDS</div>
                  </div>
                  
                  <div className="panel-body" style={{ padding: '1rem', overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
                    {history.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        <HistoryIcon size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        No past telemetry records registered for this user node.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '0.8rem' }}>TIMESTAMP</th>
                            <th style={{ padding: '0.8rem' }}>PULSE (HR)</th>
                            <th style={{ padding: '0.8rem' }}>RESPIRATION (RR)</th>
                            <th style={{ padding: '0.8rem' }}>SpO2 (%)</th>
                            <th style={{ padding: '0.8rem' }}>STRESS INDEX</th>
                            <th style={{ padding: '0.8rem' }}>RMSSD</th>
                            <th style={{ padding: '0.8rem' }}>BLINKS</th>
                            <th style={{ padding: '0.8rem' }}>BLINK RATE</th>
                            <th style={{ padding: '0.8rem' }}>CONF.</th>
                            <th style={{ padding: '0.8rem', textAlign: 'center' }}>CLINICAL RECORD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((log) => (
                            <tr key={log._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                              <td style={{ padding: '0.8rem', color: '#fff' }}>{new Date(log.timestamp).toLocaleString()}</td>
                              <td style={{ padding: '0.8rem', color: '#ff5252', fontWeight: 600 }}>{log.heartRate} BPM</td>
                              <td style={{ padding: '0.8rem', color: '#3ef7a5' }}>{log.respirationRate} RPM</td>
                              <td style={{ padding: '0.8rem', color: '#00d9ff' }}>{log.spo2}%</td>
                              <td style={{ padding: '0.8rem', color: log.stress > 150 ? '#ff5252' : '#3ef7a5' }}>{log.stress}</td>
                              <td style={{ padding: '0.8rem', color: '#00d9ff' }}>{log.rmssd} ms</td>
                              <td style={{ padding: '0.8rem' }}>{log.blinkCount}</td>
                              <td style={{ padding: '0.8rem', color: '#ffaa00' }}>{log.blinkRate || 0} blinks/m</td>
                              <td style={{ padding: '0.8rem', color: (log.confidence || 0) < 50 ? '#ff5252' : '#3ef7a5' }}>{log.confidence || 0}%</td>
                              <td style={{ padding: '0.8rem', textAlign: 'center' }}>
                                <a 
                                  href={`${SERVER_URL}/api/report?token=${token}&sessionId=${log._id}`} 
                                  target="_blank"
                                  rel="noopener noreferrer" 
                                  className="action-btn"
                                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}
                                >
                                  <Download size={10} /> REPORT PDF
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* --- ABOUT / COMPLIANCE VIEW --- */}
              {view === 'ABOUT' && (
                <div className="sci-panel" style={{ flex: 1, animation: 'fadeSlideUp 0.5s ease-out' }}>
                  <div className="panel-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>REGULATORY DISCLOSURES & SYSTEM LIMITATIONS</div>
                  </div>
                  
                  <div className="panel-body" style={{ padding: '1.5rem', overflowY: 'auto', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    <div style={{ borderLeft: '3px solid #ffaa00', background: 'rgba(255,170,0,0.05)', padding: '1rem', borderRadius: '4px' }}>
                      <h3 style={{ color: '#ffaa00', fontFamily: 'var(--font-hud)', marginBottom: '0.5rem' }}>GENERAL HEALTH & WELLNESS SPECIFICATION</h3>
                      <p>
                        VitalSense AI utilizes Remote Photoplethysmography (rPPG) metrics generated via the **Presage SmartSpectra SDK**. 
                        These metrics are compiled for **general wellness tracking and educational informational purposes only**. 
                        This software does not construct medical diagnoses, prescribe treatment schedules, or substitute for formal clinical examinations by certified healthcare professionals.
                      </p>
                    </div>

                    <div>
                      <h3 style={{ color: '#00d9ff', fontFamily: 'var(--font-hud)', marginBottom: '0.5rem' }}>RELATIVE ARTERIAL WAVEFORM</h3>
                      <p>
                        The real-time photoplethysmogram (PPG) wave rendered on the dashboard panel represents **relative arterial shape variations only**. 
                        It is calculated from micro-changes in light absorption across facial tissue. 
                        It **does not represent a metric measurement of blood pressure** and must not be used or interpreted as such.
                      </p>
                    </div>

                    <div>
                      <h3 style={{ color: '#3ef7a5', fontFamily: 'var(--font-hud)', marginBottom: '0.5rem' }}>OPERATIONAL CONSTRAINTS</h3>
                      <p>
                        For accurate signals, verify the following experimental conditions are satisfied:
                      </p>
                      <ul style={{ paddingLeft: '1.2rem', listStyleType: 'square', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
                        <li><strong>Lighting:</strong> Ensure the subject is illuminated by flat, constant light. Avoid colored neon bulbs, dark shadows, or direct backlighting.</li>
                        <li><strong>Movement:</strong> The subject must remain stationary. Large speaking movements, laughing, or head tilting will create transient movement artifacts.</li>
                        <li><strong>Camera Resolution:</strong> Standard webcams or DroidCam streams should maintain stable capture framerates (minimum 30 FPS) at 640x480 resolution.</li>
                      </ul>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>ENGINE CORE: Presage SmartSpectra v1.0</span>
                      <span>COMPLIANCE AUTH: inform_only_ref</span>
                    </div>

                  </div>
                </div>
              )}

              {/* Disclaimer footer banner */}
              <footer className="monitor-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.8rem', marginTop: 'auto' }}>
                <div className="disclaimer" style={{ width: '100%', textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>
                  ⚠️ INFORMATIONAL PURPOSES ONLY — NOT FOR MEDICAL DIAGNOSIS OR CLINICAL DECISION MAKING
                </div>
              </footer>

            </div>
          </div>
        </div>
      )}
      <div ref={cursorDotRef} className="cursor-dot"></div>
      <div ref={cursorRingRef} className="cursor-ring"></div>
    </div>
  );
}
