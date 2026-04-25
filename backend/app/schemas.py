from typing import Any

from pydantic import BaseModel, Field


class ModelInfo(BaseModel):
    name: str
    path: str
    size_mb: float


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]
    frame_index: int | None = None


class PredictionResponse(BaseModel):
    model: str
    media_type: str = Field(description="image or video")
    image_size: list[int] = Field(description="[width, height]")
    detections: list[Detection]
    total_detections: int
    rendered_media: str = Field(description="Base64-encoded rendered media")
    rendered_mime_type: str = Field(description="MIME type of rendered media")
    extra: dict[str, Any] = Field(default_factory=dict)
