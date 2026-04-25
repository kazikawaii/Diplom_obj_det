from __future__ import annotations

import base64
import io
import re
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO

from .config import settings
from .schemas import Detection, ModelInfo, PredictionResponse


class ModelManager:
    MAX_VIDEO_DETECTIONS = 5000

    def __init__(self, models_dir: Path) -> None:
        self.models_dir = models_dir
        self._cache: dict[str, YOLO] = {}

    def list_models(self) -> list[ModelInfo]:
        if not self.models_dir.exists():
            return []

        models: list[ModelInfo] = []
        for path in sorted(self.models_dir.glob("*.pt")):
            models.append(
                ModelInfo(
                    name=path.name,
                    path=str(path),
                    size_mb=round(path.stat().st_size / (1024 * 1024), 2),
                )
            )
        return models

    def get_model(self, model_name: str) -> YOLO:
        model_path = self.models_dir / model_name
        if not model_path.exists():
            raise FileNotFoundError(f"Model '{model_name}' was not found in {self.models_dir}")

        if model_name not in self._cache:
            self._cache[model_name] = YOLO(str(model_path))
        return self._cache[model_name]

    def predict(
        self,
        model_name: str,
        file_bytes: bytes,
        media_type: str,
        conf: float,
        iou: float,
        imgsz: int,
        object_query: str = "",
    ) -> PredictionResponse:
        if media_type == "video":
            return self._predict_video(
                model_name=model_name,
                video_bytes=file_bytes,
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                object_query=object_query,
            )
        return self._predict_image(
            model_name=model_name,
            image_bytes=file_bytes,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            object_query=object_query,
        )

    def stream_mjpeg(
        self,
        model_name: str,
        source: str,
        conf: float,
        iou: float,
        imgsz: int,
        object_query: str = "",
        max_fps: float = 12.0,
    ) -> Iterator[bytes]:
        model = self.get_model(model_name)
        names = model.names
        requested_labels = self._parse_object_query(object_query)
        selected_class_ids = self._match_class_ids(names, requested_labels)
        capture_source = self._parse_capture_source(source)
        capture = cv2.VideoCapture(capture_source)

        if not capture.isOpened():
            raise ValueError(f"Could not open stream source '{source}'")

        frame_delay = 1.0 / max_fps if max_fps > 0 else 0.0

        def generate() -> Iterator[bytes]:
            try:
                while True:
                    frame_started_at = time.monotonic()
                    success, frame = capture.read()
                    if not success:
                        break

                    results = model.predict(
                        source=frame,
                        conf=conf,
                        iou=iou,
                        imgsz=imgsz,
                        classes=selected_class_ids if selected_class_ids else None,
                        verbose=False,
                    )
                    rendered_frame = results[0].plot()
                    ok, encoded = cv2.imencode(".jpg", rendered_frame)
                    if not ok:
                        continue

                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + encoded.tobytes()
                        + b"\r\n"
                    )

                    elapsed = time.monotonic() - frame_started_at
                    if frame_delay > elapsed:
                        time.sleep(frame_delay - elapsed)
            finally:
                capture.release()

        return generate()

    def render_frame(
        self,
        frame_bytes: bytes,
        model_name: str = "",
        conf: float = 0.25,
        iou: float = 0.45,
        imgsz: int = 960,
        object_query: str = "",
    ) -> bytes:
        frame_array = np.frombuffer(frame_bytes, dtype=np.uint8)
        frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode frame")

        if model_name:
            model = self.get_model(model_name)
            names = model.names
            requested_labels = self._parse_object_query(object_query)
            selected_class_ids = self._match_class_ids(names, requested_labels)

            if not requested_labels or selected_class_ids:
                results = model.predict(
                    source=frame,
                    conf=conf,
                    iou=iou,
                    imgsz=imgsz,
                    classes=selected_class_ids if selected_class_ids else None,
                    verbose=False,
                )
                frame = results[0].plot()

        ok, encoded = cv2.imencode(".jpg", frame)
        if not ok:
            raise ValueError("Could not encode rendered frame")

        return encoded.tobytes()

    def _predict_image(
        self,
        model_name: str,
        image_bytes: bytes,
        conf: float,
        iou: float,
        imgsz: int,
        object_query: str = "",
    ) -> PredictionResponse:
        model = self.get_model(model_name)
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_np = np.array(pil_image)
        names = model.names
        requested_labels = self._parse_object_query(object_query)
        selected_class_ids = self._match_class_ids(names, requested_labels)

        results = model.predict(
            source=image_np,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            classes=selected_class_ids if selected_class_ids else None,
            verbose=False,
        )
        result = results[0]

        detections: list[Detection] = []
        if result.boxes is not None:
            for box in result.boxes:
                cls_id = int(box.cls.item())
                detections.append(
                    Detection(
                        class_id=cls_id,
                        class_name=names.get(cls_id, str(cls_id)),
                        confidence=round(float(box.conf.item()), 4),
                        bbox=[round(float(value), 2) for value in box.xyxy[0].tolist()],
                    )
                )

        if requested_labels and not selected_class_ids:
            encoded = self._encode_image(pil_image)
        else:
            plotted = result.plot()
            plotted_rgb = cv2.cvtColor(plotted, cv2.COLOR_BGR2RGB)
            encoded = self._encode_image(Image.fromarray(plotted_rgb))

        return PredictionResponse(
            model=model_name,
            media_type="image",
            image_size=[pil_image.width, pil_image.height],
            detections=detections,
            total_detections=len(detections),
            rendered_media=encoded,
            rendered_mime_type="image/jpeg",
            extra={
                "speed_ms": result.speed,
                "available_classes": [names[idx] for idx in sorted(names)],
                "requested_classes": requested_labels,
                "matched_classes": [names[idx] for idx in selected_class_ids],
                "query_applied": bool(requested_labels),
            },
        )

    def _predict_video(
        self,
        model_name: str,
        video_bytes: bytes,
        conf: float,
        iou: float,
        imgsz: int,
        object_query: str = "",
    ) -> PredictionResponse:
        model = self.get_model(model_name)
        names = model.names
        requested_labels = self._parse_object_query(object_query)
        selected_class_ids = self._match_class_ids(names, requested_labels)

        with tempfile.NamedTemporaryFile(suffix=".mp4") as input_file, tempfile.NamedTemporaryFile(
            suffix=".mp4"
        ) as output_file:
            input_file.write(video_bytes)
            input_file.flush()

            capture = cv2.VideoCapture(input_file.name)
            if not capture.isOpened():
                raise ValueError("Could not open uploaded video")

            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
            fps = capture.get(cv2.CAP_PROP_FPS)
            if fps <= 0:
                fps = 25.0
            if width <= 0 or height <= 0:
                capture.release()
                raise ValueError("Could not determine video frame size")

            writer = cv2.VideoWriter(
                output_file.name,
                cv2.VideoWriter_fourcc(*"mp4v"),
                fps,
                (width, height),
            )
            if not writer.isOpened():
                capture.release()
                raise ValueError("Could not create rendered video")

            detections: list[Detection] = []
            total_detections = 0
            class_totals: dict[str, int] = {}
            frame_count = 0
            timings: list[dict[str, float]] = []

            try:
                while True:
                    success, frame = capture.read()
                    if not success:
                        break

                    results = model.predict(
                        source=frame,
                        conf=conf,
                        iou=iou,
                        imgsz=imgsz,
                        classes=selected_class_ids if selected_class_ids else None,
                        verbose=False,
                    )
                    result = results[0]
                    frame_count += 1
                    timings.append(result.speed)

                    if result.boxes is not None:
                        for box in result.boxes:
                            cls_id = int(box.cls.item())
                            class_name = names.get(cls_id, str(cls_id))
                            total_detections += 1
                            class_totals[class_name] = class_totals.get(class_name, 0) + 1

                            if len(detections) < self.MAX_VIDEO_DETECTIONS:
                                detections.append(
                                    Detection(
                                        class_id=cls_id,
                                        class_name=class_name,
                                        confidence=round(float(box.conf.item()), 4),
                                        bbox=[
                                            round(float(value), 2)
                                            for value in box.xyxy[0].tolist()
                                        ],
                                        frame_index=frame_count - 1,
                                    )
                                )

                    rendered_frame = result.plot()
                    writer.write(rendered_frame)
            finally:
                capture.release()
                writer.release()

            output_file.seek(0)
            rendered_bytes = output_file.read()

        return PredictionResponse(
            model=model_name,
            media_type="video",
            image_size=[width, height],
            detections=detections,
            total_detections=total_detections,
            rendered_media=base64.b64encode(rendered_bytes).decode("utf-8"),
            rendered_mime_type="video/mp4",
            extra={
                "frame_count": frame_count,
                "fps": round(fps, 2),
                "speed_ms_avg": self._average_timings(timings),
                "available_classes": [names[idx] for idx in sorted(names)],
                "requested_classes": requested_labels,
                "matched_classes": [names[idx] for idx in selected_class_ids],
                "query_applied": bool(requested_labels),
                "class_totals": class_totals,
                "detections_truncated": total_detections > len(detections),
            },
        )

    @staticmethod
    def _parse_object_query(object_query: str) -> list[str]:
        if not object_query.strip():
            return []

        parts = re.split(r"[,;\n]+", object_query)
        return [part.strip() for part in parts if part.strip()]

    @staticmethod
    def _normalize_label(label: str) -> str:
        return re.sub(r"\s+", " ", label.strip().lower())

    def _match_class_ids(self, names: dict[int, str], requested_labels: list[str]) -> list[int]:
        if not requested_labels:
            return []

        normalized_names = {
            class_id: self._normalize_label(class_name)
            for class_id, class_name in names.items()
        }

        matched_ids: list[int] = []
        for requested_label in requested_labels:
            normalized_request = self._normalize_label(requested_label)
            for class_id, normalized_name in normalized_names.items():
                if (
                    normalized_request == normalized_name
                    or normalized_request in normalized_name
                    or normalized_name in normalized_request
                ) and class_id not in matched_ids:
                    matched_ids.append(class_id)
        return matched_ids

    @staticmethod
    def _parse_capture_source(source: str) -> int | str:
        stripped_source = source.strip()
        if stripped_source.isdigit():
            return int(stripped_source)
        return stripped_source

    @staticmethod
    def _encode_image(image: Image.Image) -> str:
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=90)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    @staticmethod
    def _average_timings(timings: list[dict[str, float]]) -> dict[str, float]:
        if not timings:
            return {}

        totals: dict[str, float] = {}
        for timing in timings:
            for key, value in timing.items():
                totals[key] = totals.get(key, 0.0) + float(value)

        return {
            key: round(value / len(timings), 3)
            for key, value in totals.items()
        }


model_manager = ModelManager(settings.models_dir)
