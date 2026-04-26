#!/usr/bin/env python3
import argparse
import signal
import sys
import threading
import time
import urllib.parse

import cv2
from websocket import ABNF, WebSocketApp


def build_ws_url(base_url: str, stream_id: str, model_name: str, conf: float, iou: float, imgsz: int, object_query: str) -> str:
    if base_url.startswith("http://"):
        base_url = "ws://" + base_url[len("http://"):]
    elif base_url.startswith("https://"):
        base_url = "wss://" + base_url[len("https://"):]
    elif not base_url.startswith("ws://") and not base_url.startswith("wss://"):
        base_url = "ws://" + base_url

    base_url = base_url.rstrip("/")
    query = urllib.parse.urlencode(
        {
            "model_name": model_name,
            "conf": str(conf),
            "iou": str(iou),
            "imgsz": str(imgsz),
            "object_query": object_query,
        }
    )
    stream_id = urllib.parse.quote(stream_id, safe="")
    return f"{base_url}/ws/streams/{stream_id}/publish?{query}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="WebSocket camera sender for YOLO backend.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default="localhost:8000", help="Backend host or full ws/http URL")
    parser.add_argument("--stream-id", default="main", help="Stream ID for publisher/viewer")
    parser.add_argument("--model-name", default="", help="Model filename from backend models folder")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.45, help="IoU threshold")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size for model")
    parser.add_argument("--fps", type=int, default=8, help="Frames per second to send")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index")
    parser.add_argument("--preview", action="store_true", help="Show local preview window")
    return parser.parse_args()


class CameraSender:
    def __init__(self, url: str, fps: int, camera_index: int, preview: bool) -> None:
        self.url = url
        self.fps = max(1, fps)
        self.camera_index = camera_index
        self.preview = preview
        self.capture = cv2.VideoCapture(self.camera_index)
        self.ws: WebSocketApp | None = None
        self.running = threading.Event()
        self.running.set()

    def start(self) -> None:
        if not self.capture.isOpened():
            raise RuntimeError(f"Cannot open camera index {self.camera_index}")

        self.ws = WebSocketApp(
            self.url,
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
        )

        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        try:
            self.ws.run_forever()
        finally:
            self.stop()

    def stop(self) -> None:
        self.running.clear()
        if self.capture.isOpened():
            self.capture.release()
        if self.ws is not None:
            self.ws.close()
        if self.preview:
            cv2.destroyAllWindows()

    def on_open(self, ws: WebSocketApp) -> None:
        print(f"Connected to {self.url}")
        thread = threading.Thread(target=self._send_loop, args=(ws,), daemon=True)
        thread.start()

    def on_message(self, ws: WebSocketApp, message: str) -> None:
        try:
            print(f"Server message: {message}")
        except Exception:
            pass

    def on_error(self, ws: WebSocketApp, error: Exception) -> None:
        print(f"WebSocket error: {error}", file=sys.stderr)

    def on_close(self, ws: WebSocketApp, close_status_code: int, close_msg: str) -> None:
        print(f"WebSocket closed: code={close_status_code} msg={close_msg}")
        self.running.clear()

    def _send_loop(self, ws: WebSocketApp) -> None:
        interval = 1.0 / self.fps
        frame_count = 0

        while self.running.is_set() and ws.keep_running:
            success, frame = self.capture.read()
            if not success:
                print("Failed to read frame from camera", file=sys.stderr)
                break

            if self.preview:
                cv2.imshow("datasender preview", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    print("Preview closed by user")
                    self.running.clear()
                    break

            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if not ok:
                print("Failed to encode frame", file=sys.stderr)
                continue

            try:
                ws.send(encoded.tobytes(), opcode=ABNF.OPCODE_BINARY)
                frame_count += 1
                print(f"Sent frame {frame_count}", end="\r")
            except Exception as exc:
                print(f"Send failed: {exc}", file=sys.stderr)
                break

            time.sleep(interval)

        self.running.clear()

    def _signal_handler(self, signum: int, frame: object) -> None:
        print(f"Stopping on signal {signum}")
        self.running.clear()


def main() -> None:
    args = parse_args()
    ws_url = build_ws_url(args.host, args.stream_id, args.model_name, args.conf, args.iou, args.imgsz, args.object_query)
    sender = CameraSender(ws_url, args.fps, args.camera, args.preview)
    try:
        sender.start()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
