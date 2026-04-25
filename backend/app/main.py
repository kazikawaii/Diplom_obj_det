import base64
import json

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .config import settings
from .model_manager import model_manager
from .schemas import ModelInfo, PredictionResponse


app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StreamHub:
    def __init__(self) -> None:
        self._viewers: dict[str, set[WebSocket]] = {}

    async def connect_viewer(self, stream_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._viewers.setdefault(stream_id, set()).add(websocket)
        await websocket.send_json(
            {
                "type": "status",
                "stream_id": stream_id,
                "message": "viewer_connected",
            }
        )

    def disconnect_viewer(self, stream_id: str, websocket: WebSocket) -> None:
        viewers = self._viewers.get(stream_id)
        if not viewers:
            return

        viewers.discard(websocket)
        if not viewers:
            self._viewers.pop(stream_id, None)

    def viewer_count(self, stream_id: str) -> int:
        return len(self._viewers.get(stream_id, set()))

    async def broadcast(self, stream_id: str, frame: bytes) -> int:
        viewers = list(self._viewers.get(stream_id, set()))
        disconnected: list[WebSocket] = []

        for viewer in viewers:
            try:
                await viewer.send_bytes(frame)
            except Exception:
                disconnected.append(viewer)

        for viewer in disconnected:
            self.disconnect_viewer(stream_id, viewer)

        return len(viewers) - len(disconnected)


stream_hub = StreamHub()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    models = model_manager.list_models()
    if not models:
        raise HTTPException(status_code=404, detail="No .pt models found")
    return models


@app.post("/api/predict", response_model=PredictionResponse)
async def predict(
    model_name: str = Form(...),
    conf: float = Form(0.25),
    iou: float = Form(0.45),
    imgsz: int = Form(960),
    object_query: str = Form(""),
    file: UploadFile = File(...),
) -> PredictionResponse:
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "image"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        raise HTTPException(
            status_code=400,
            detail="Only image and video files are supported",
        )

    try:
        contents = await file.read()
        return model_manager.predict(
            model_name=model_name,
            file_bytes=contents,
            media_type=media_type,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            object_query=object_query,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc


@app.get("/api/stream")
def stream(
    model_name: str,
    source: str = "0",
    conf: float = 0.25,
    iou: float = 0.45,
    imgsz: int = 960,
    object_query: str = "",
    max_fps: float = 12.0,
) -> StreamingResponse:
    try:
        frames = model_manager.stream_mjpeg(
            model_name=model_name,
            source=source,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            object_query=object_query,
            max_fps=max_fps,
        )
        return StreamingResponse(
            frames,
            media_type="multipart/x-mixed-replace; boundary=frame",
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stream failed: {exc}") from exc


@app.websocket("/ws/streams/{stream_id}/view")
async def view_stream(websocket: WebSocket, stream_id: str) -> None:
    await stream_hub.connect_viewer(stream_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        stream_hub.disconnect_viewer(stream_id, websocket)


@app.websocket("/ws/streams/{stream_id}/publish")
async def publish_stream(
    websocket: WebSocket,
    stream_id: str,
    model_name: str = "",
    conf: float = 0.25,
    iou: float = 0.45,
    imgsz: int = 960,
    object_query: str = "",
) -> None:
    await websocket.accept()
    await websocket.send_json(
        {
            "type": "status",
            "stream_id": stream_id,
            "message": "publisher_connected",
        }
    )

    frame_index = 0

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return

            frame_bytes: bytes | None = None

            if "bytes" in message and message["bytes"] is not None:
                frame_bytes = message["bytes"]
            elif "text" in message and message["text"] is not None:
                frame_bytes = _frame_bytes_from_text(message["text"])

            if not frame_bytes:
                continue

            rendered_frame = model_manager.render_frame(
                frame_bytes=frame_bytes,
                model_name=model_name,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                object_query=object_query,
            )
            viewers = await stream_hub.broadcast(stream_id, rendered_frame)
            frame_index += 1
            await websocket.send_json(
                {
                    "type": "ack",
                    "stream_id": stream_id,
                    "frame_index": frame_index,
                    "viewers": viewers,
                    "bytes": len(rendered_frame),
                }
            )
    except WebSocketDisconnect:
        return
    except FileNotFoundError as exc:
        await websocket.close(code=1008, reason=str(exc))
    except ValueError as exc:
        await websocket.close(code=1003, reason=str(exc))
    except Exception as exc:
        await websocket.close(code=1011, reason=f"Stream publish failed: {exc}")


def _frame_bytes_from_text(payload: str) -> bytes | None:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None

    image = data.get("image")
    if not isinstance(image, str):
        return None

    if "," in image:
        image = image.split(",", 1)[1]

    return base64.b64decode(image)
