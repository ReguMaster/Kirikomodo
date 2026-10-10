"""SAM(ViT-H) 박스·점 프롬프트로 정리본 좌표계의 마스크를 만든다. cut_parts.py 가 사용.

체크포인트는 assets/live2d-authoring/output/sam/sam_vit_h_4b8939.pth (Git 무시,
https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CKPT = ROOT / 'assets/live2d-authoring/output/sam/sam_vit_h_4b8939.pth'


class Sam:
    def __init__(self, rgb: np.ndarray):
        import torch
        from segment_anything import SamPredictor, sam_model_registry
        model = sam_model_registry['vit_h'](checkpoint=str(CKPT)).to('cuda' if torch.cuda.is_available() else 'cpu')
        self.pred = SamPredictor(model)
        self.rgb = rgb
        self._crop = None

    def _set_crop(self, crop: tuple[int, int, int, int]) -> None:
        if self._crop != crop:
            x0, y0, x1, y1 = crop
            self.pred.set_image(self.rgb[y0:y1, x0:x1])
            self._crop = crop

    def mask(self, box: tuple[int, int, int, int], pos: list = (), neg: list = (), pad: float = 0.25,
             crop: tuple | None = None, multi: bool = False) -> np.ndarray:
        """box·점은 전체 이미지 좌표. box 를 pad 만큼 넓힌 영역을 잘라 SAM 에 넣는다(작은 파츠 해상도 확보)."""
        h, w = self.rgb.shape[:2]
        x0, y0, x1, y1 = box
        if crop is None:
            px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
            crop = (max(0, x0 - px), max(0, y0 - py), min(w, x1 + px), min(h, y1 + py))
        self._set_crop(crop)
        cx, cy = crop[0], crop[1]
        pts = [(x - cx, y - cy) for x, y in pos] + [(x - cx, y - cy) for x, y in neg]
        labels = [1] * len(pos) + [0] * len(neg)
        masks, scores, _ = self.pred.predict(
            point_coords=np.array(pts, dtype=np.float32) if pts else None,
            point_labels=np.array(labels) if pts else None,
            box=np.array([x0 - cx, y0 - cy, x1 - cx, y1 - cy], dtype=np.float32),
            multimask_output=multi)
        m = masks[int(np.argmax(scores))]
        full = np.zeros((h, w), dtype=bool)
        full[crop[1]:crop[3], crop[0]:crop[2]] = m
        clip = np.zeros_like(full)
        clip[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6] = True
        return full & clip


def overlay(rgb: np.ndarray, mask: np.ndarray, color=(255, 0, 255), alpha=0.5) -> Image.Image:
    out = rgb.astype(np.float32).copy()
    out[mask] = out[mask] * (1 - alpha) + np.array(color, dtype=np.float32) * alpha
    return Image.fromarray(out.astype(np.uint8))
