"""눈 변형 레이어(Eye_{L,R}_{Closed,Half,Wide,Teary,Glare,Sleepy}.png) 정리.

SDXL 인페인팅이 기존 눈을 지우면서 윗눈꺼풀 위에 회색·흰색 반투명 잔상(원래 속눈썹·눈의 유령)을 남기고, 눈에서 먼 곳의
머리카락 조각까지 변형으로 잡힌다. 그 두 가지를 고친다.

    .venv/Scripts/python tools/live2d-authoring/clean_eyes.py [--layers assets/live2d-authoring/layers] [--out <dir>]

1. 눈 주변 영역: 기본 눈(White/Iris/Lashes) ∪ 변형의 어두운 선을 RING px 부풀린 범위 밖은 버리고 경계를 부드럽게.
2. 잔상: 열(column)마다 가장 위의 어두운 픽셀(속눈썹·눈꺼풀선) 위쪽에서, 채도가 낮은 픽셀을 주변의 깨끗한 분홍(머리·피부) 색으로 교체.
cut_parts.py 가 끝에 호출하므로 레이어를 다시 자르면 자동으로 적용된다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_LAYERS  # noqa: E402

VARIANTS = ('Closed', 'Half', 'Wide', 'Teary', 'Glare', 'Sleepy')
RING = 18             # 눈 주변 영역 부풀림 px
RING_FEATHER = 10     # 영역 경계 알파 페더 px
EDGE_FEATHER = 5      # 레이어 바깥 경계 알파 페더 px
DARK_V, DARK_S = 0.34, 0.20   # 속눈썹·눈꺼풀선: 진한 갈색(V 상한, S 하한). 회색 잔상의 어두운 가시 끝은 제외
MIN_DARK = 12         # 어두운 선으로 인정할 최소 조각 크기(px)
TOP_WIN = 31          # 눈꺼풀선 높이 닫기 폭(열 수). 이보다 좁게 솟은 가시는 잔상으로 취급
DARK_REL = 0.25       # …그리고 가장 큰 어두운 덩어리 대비 최소 비율
KEEP_S, KEEP_V = (0.18, 0.28), (0.72, 0.82)  # 이 채도·밝기 이상이면 진짜 머리카락 가닥으로 보고 남긴다(경계 구간은 부드럽게)
SKIN_S = (0.08, 0.30)            # 교체 색 출처(피부·머리 분홍)의 채도 범위
SKIN_V = 0.88                    # 교체 색 출처의 최소 밝기
SIGMAS = (14, 45)                # 교체 색 필드의 가우시안 σ(가까운 출처가 없으면 더 넓게)


def _hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    return h[..., 1] / 255, h[..., 2] / 255


def _top_dark(dark: np.ndarray) -> np.ndarray:
    """열마다 가장 위의 어두운 픽셀 y. 없는 열은 이웃에서 보간하고, 선 위로 솟은 좁은 가시는 닫기(closing)로 메운다."""
    h, w = dark.shape
    top = np.where(dark.any(0), dark.argmax(0), -1).astype(np.float32)
    known = np.nonzero(top >= 0)[0]
    top = np.interp(np.arange(w), known, top[known]).astype(np.float32)
    win = lambda t, n: np.lib.stride_tricks.sliding_window_view(np.pad(t, n // 2, mode='edge'), n)
    top = win(win(top, TOP_WIN).max(axis=1), TOP_WIN).min(axis=1)   # y 가 작은(위로 솟은) 좁은 골을 메움
    return np.median(win(top, 9), axis=1)


def clean_variant(rgba: np.ndarray, base_eye: np.ndarray, skin: tuple[int, int, int]) -> np.ndarray:
    """rgba: 전체 캔버스 RGBA, base_eye: 기본 눈 파츠 불리언 마스크(같은 크기), skin: 근처 출처가 없을 때 쓸 피부색.
    정리된 RGBA 를 돌려준다."""
    alpha = rgba[..., 3] > 0
    if not alpha.any():
        return rgba
    ys, xs = np.nonzero(alpha)
    pad = RING + RING_FEATHER + 2
    y0, y1 = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + 1 + pad)
    img = rgba[y0:y1, x0:x1].copy()
    a = img[..., 3].astype(np.float32) / 255
    rgb = img[..., :3]
    s, v = _hsv(rgb)

    dark = (v < DARK_V) & (s > DARK_S) & (a > 0.5)
    n, cc, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), connectivity=8)
    if n > 1:  # 잔상 속의 작은 어두운 얼룩은 속눈썹이 아니다: 가장 큰 덩어리의 일부 크기 이상만
        big = st[1:, cv2.CC_STAT_AREA].max() * DARK_REL
        dark = np.isin(cc, [c for c in range(1, n) if st[c, cv2.CC_STAT_AREA] >= max(MIN_DARK, big)])

    # 1. 눈 주변 영역
    core = base_eye[y0:y1, x0:x1] | dark
    k = 2 * RING + 1
    roi = cv2.dilate(core.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    roi = cv2.morphologyEx(roi, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    dist = cv2.distanceTransform(roi, cv2.DIST_L2, 5)
    a = a * np.clip(dist / RING_FEATHER, 0, 1)

    # 2. 윗눈꺼풀 위의 잔상: 밝고 채도 있는 분홍 가닥만 남기고 나머지(회색·흰 안개·칙칙한 갈색 얼룩)는 주변 피부색으로 교체
    top = _top_dark(dark)
    rows = np.arange(a.shape[0])[:, None]
    above = rows < (top[None, :] - 2)
    keep = np.clip((s - KEEP_S[0]) / (KEEP_S[1] - KEEP_S[0]), 0, 1) * np.clip((v - KEEP_V[0]) / (KEEP_V[1] - KEEP_V[0]), 0, 1)
    w = (1 - keep) * above * np.clip((top[None, :] - 2 - rows) / 4, 0, 1) * (a > 0)
    clean = ((s >= SKIN_S[0]) & (s <= SKIN_S[1]) & (v >= SKIN_V) & (a > 0.9) & ~above & ~dark).astype(np.float32)
    target = np.broadcast_to(np.array(skin, np.float32), rgb.shape).copy()
    for sigma in reversed(SIGMAS):
        num = cv2.GaussianBlur(rgb.astype(np.float32) * clean[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(clean, (0, 0), sigma)[..., None]
        target = np.where(den > 0.02, num / np.maximum(den, 1e-3), target)
    rgb = (rgb * (1 - w[..., None]) + target * w[..., None]).round().astype(np.uint8)

    # 레이어 바깥 경계(차이 탐색 창의 직선 모서리·들쭉날쭉한 잔상 가장자리)의 알파를 부드럽게
    a_edge = cv2.distanceTransform((a > 0.02).astype(np.uint8), cv2.DIST_L2, 5)
    a = a * np.clip(a_edge / EDGE_FEATHER, 0, 1)

    out = np.zeros_like(rgba)
    out[y0:y1, x0:x1, :3] = rgb
    out[y0:y1, x0:x1, 3] = (a * 255).round().astype(np.uint8)
    out[..., :3][out[..., 3] == 0] = 0
    return out


def face_skin(layers: Path) -> tuple[int, int, int]:
    """Face_Base 의 눈 주변(볼·눈 밑) 밝은 피부색 중앙값."""
    face = np.asarray(Image.open(layers / 'Face_Base.png').convert('RGBA'))[700:1050, 1050:1560]
    s, v = _hsv(np.ascontiguousarray(face[..., :3]))
    ok = (face[..., 3] == 255) & (s >= 0.06) & (s <= 0.22) & (v >= 0.93)
    return tuple(int(c) for c in np.median(face[..., :3][ok], axis=0))


def clean_all(layers: Path, out: Path | None = None) -> None:
    out = out or layers
    out.mkdir(parents=True, exist_ok=True)
    skin = face_skin(layers)
    print(f'  skin {skin}')
    for side in 'RL':
        base = np.zeros(np.asarray(Image.open(layers / f'Eye_{side}_White.png')).shape[:2], bool)
        for part in ('White', 'Iris', 'Lashes'):
            base |= np.asarray(Image.open(layers / f'Eye_{side}_{part}.png').convert('RGBA'))[..., 3] > 0
        for v in VARIANTS:
            path = layers / f'Eye_{side}_{v}.png'
            if not path.is_file():
                continue
            cleaned = clean_variant(np.asarray(Image.open(path).convert('RGBA')), base, skin)
            Image.fromarray(cleaned).save(out / path.name)
            print(f'  cleaned Eye_{side}_{v}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--layers', type=Path, default=DEFAULT_LAYERS)
    ap.add_argument('--out', type=Path, help='지정하지 않으면 layers 를 제자리에서 덮어쓴다')
    a = ap.parse_args()
    clean_all(a.layers, a.out)
