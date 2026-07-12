import json
import logging
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.inference import process_frame_inference, process_rolling_stream_inference

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-service")

app = FastAPI(title="VitalSense ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FramePayload(BaseModel):
    frame_b64: str = None
    width: int = 320
    height: int = 240
    timestamp_us: int = None

@app.get("/health")
def health():
    return {"status": "healthy", "service": "ml-service"}

@app.post("/vitals/frame")
async def vitals_frame(payload: FramePayload):
    result = await process_frame_inference(payload.frame_b64, payload.width, payload.height, payload.timestamp_us)
    return result

@app.websocket("/vitals/stream")
async def vitals_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established with backend client")
    
    # Session state for this connection:
    # rgb_buffer: list of extracted RGB means from cheek/forehead ROI
    # ear_buffer: list of EAR (Eye Aspect Ratio) values
    # timestamps: list of microsecond timestamps
    rgb_buffer = []
    ear_buffer = []
    timestamps = []
    mar_buffer = []
    face_buffer = []
    
    session_state = {
        "total_blinks": 0,
        "start_time": time.time(),
        "in_blink": False,
        "blink_cooldown": 0
    }
    
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                logger.info("WebSocket client disconnected via disconnect message")
                break
            
            if "bytes" in message:
                raw_bytes = message["bytes"]
                # Process the incoming raw binary frame and get vitals output
                result = await process_rolling_stream_inference(raw_bytes, rgb_buffer, ear_buffer, timestamps, session_state, mar_buffer, face_buffer)
                if result:
                    await websocket.send_text(json.dumps(result))
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "reset":
                    rgb_buffer.clear()
                    ear_buffer.clear()
                    timestamps.clear()
                    mar_buffer.clear()
                    face_buffer.clear()
                    session_state["total_blinks"] = 0
                    session_state["start_time"] = time.time()
                    session_state["in_blink"] = False
                    session_state["blink_cooldown"] = 0
                    logger.info("Session buffer reset requested")
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket processing error: {e}", exc_info=True)
