"""고개를 돌릴 때 드러나는 얼굴 주변 이음새 정리. cut_parts.py 가 clean_eyes 다음에 호출한다.

    .venv/Scripts/python tools/live2d-authoring/refine_face.py [--layers assets/live2d-authoring/layers]

1. Face_Base: 눈이 놓일 수 있는 모든 영역(기본 눈 + 변형 12장의 합집합) 밑에 피부를 깐다. 한쪽 눈의 바깥 절반이 피부판 실루엣 밖에
   있어서, 눈이 시차로 밀리면 그 자리로 배경이 비쳤다. 휴지 자세에서 위 레이어가 알파 255 로 덮는 픽셀만 채워 겉모습은 그대로다.
2. Neck: 원본 픽셀은 두고, 사각형으로 복원한 부분(세로 줄무늬·딱딱한 모서리)을 원본 목 색의 매끈한 필드로 바꾸고 가장자리를 둥글게 푼다.
3. 복원 레이어(Apron·Torso·Hair_Back_R/L·Hair_Front): 복원한 부분(원본 픽셀이 아닌 것)을 그 레이어 본래 색(밝은 천·머리색)의 매끈한 필드로
   바꾸고 원본 영역에서 멀어질수록 투명하게 한다. SDXL/cv2 복원이 지어낸 붉은 덩어리·사각형 얼룩이 소매·머리가 움직일 때 드러났다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_LAYERS, DEFAULT_PLAN, load_plan  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/reference/private/kiriko-base-prepared.png'
EYE_TAGS = ('White', 'Iris', 'Lashes', 'Closed', 'Half', 'Wide', 'Teary', 'Glare', 'Sleepy')
VARIANT = ('Closed', 'Half', 'Wide', 'Teary', 'Glare', 'Sleepy', 'Mouth_Open', 'Mouth_O', 'Mouth_Smile', 'Mouth_Grin',
           'Mouth_Curious', 'Mouth_Annoyed', 'Mouth_Sleepy', 'Mouth_Frown')   # 휴지 자세에서 꺼져 있는 표정 변형
SKIN_SIGMAS = (18, 60)   # 피부색 필드 σ(가까운 출처가 없으면 더 넓게)
NECK_FEATHER = 28        # 복원한 목의 바깥 경계 알파 페더 px
NECK_ORIGINAL_TOL = 6    # 원본 픽셀로 판정할 색 차이(RGB 합)
# 복원 레이어 정리: id → (색 출처 밝기 하한 V, 채도 상한 S, 완전 불투명 거리 px, 페이드 거리 px, 색 필드 σ)
# 소매 밑 천(Apron·Torso)은 소매가 벌어질 때 넓게 드러나므로 멀리까지 두고, 머리카락은 가깝게만 둔다.
SOFTEN = {
    'Apron': (0.88, 0.15, 150, 60, (30, 120)),
    'Torso': (0.80, 0.35, 70, 40, (25, 90)),
    'Hair_Back_R': (0.78, 0.50, 36, 40, (30, 90)),
    'Hair_Back_L': (0.78, 0.50, 36, 40, (30, 90)),
    'Hair_Front': (0.78, 0.50, 24, 30, (20, 60)),
}


def _rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGBA')).copy()


def original_pixels(img: np.ndarray, base: np.ndarray) -> np.ndarray:
    """레이어 픽셀 중 원본 일러스트에서 그대로 온 것(색·알파가 원본과 같다). 가장자리의 반투명 픽셀도 원본이다."""
    same = np.abs(img[..., :3].astype(int) - base[..., :3].astype(int)).sum(2) <= NECK_ORIGINAL_TOL
    return (img[..., 3] > 0) & same & (np.abs(img[..., 3].astype(int) - base[..., 3].astype(int)) <= 8)


def _field(rgb: np.ndarray, source: np.ndarray, fallback: np.ndarray, sigmas: tuple = SKIN_SIGMAS) -> np.ndarray:
    """source 불리언 마스크의 색을 정규화 컨볼루션으로 번지게 한 색 필드. 출처가 없는 곳은 fallback."""
    out = fallback.astype(np.float32)
    w = source.astype(np.float32)
    for sigma in reversed(sigmas):
        num = cv2.GaussianBlur(rgb.astype(np.float32) * w[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(w, (0, 0), sigma)[..., None]
        out = np.where(den > 0.02, num / np.maximum(den, 1e-3), out)
    return out


def covered_at_rest(layers: Path, above_z: int) -> np.ndarray:
    """휴지 자세에서 Face_Base 위 레이어(변형 제외)가 알파 255 로 완전히 덮는 픽셀."""
    cover = None
    for layer in load_plan(DEFAULT_PLAN)['layers']:
        lid = layer['id']
        path = layers / f'{lid}.png'
        if layer['z'] <= above_z or not path.is_file() or lid in VARIANT or lid.rsplit('_', 1)[-1] in VARIANT:
            continue
        a = _rgba(path)[..., 3]
        cover = a if cover is None else np.maximum(cover, a)
    return cover == 255


def extend_face_base(layers: Path, base: np.ndarray) -> int:
    face = _rgba(layers / 'Face_Base.png')
    eyes = np.zeros(face.shape[:2], bool)
    for side in 'RL':
        for tag in EYE_TAGS:
            path = layers / f'Eye_{side}_{tag}.png'
            if path.is_file():
                eyes |= _rgba(path)[..., 3] > 8
    eyes = cv2.morphologyEx(eyes.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
    face_z = next(l['z'] for l in load_plan(DEFAULT_PLAN)['layers'] if l['id'] == 'Face_Base')
    # 휴지 자세에서 위 레이어가 완전히 덮는 눈 영역만 다룬다(겉모습 불변). 눈이 감기며 줄어들 때 이 밑이 드러나므로 구멍뿐 아니라
    # 거칠게 복원된 주황빛 얼룩도 피부색으로 바꾼다.
    need = eyes & (base[..., 3] > 0) & covered_at_rest(layers, face_z)
    if not need.any():
        return 0
    hsv = cv2.cvtColor(np.ascontiguousarray(face[..., :3]), cv2.COLOR_RGB2HSV).astype(np.float32)
    s, v = hsv[..., 1] / 255, hsv[..., 2] / 255
    skin = (face[..., 3] == 255) & (s >= 0.06) & (s <= 0.25) & (v >= 0.9) & ~need
    color = _field(face[..., :3], skin, np.array([253, 227, 220]))
    face[need, :3] = color[need].round().astype(np.uint8)
    face[need, 3] = 255
    Image.fromarray(face).save(layers / 'Face_Base.png')
    return int(need.sum())


def refine_neck(layers: Path, base: np.ndarray) -> int:
    neck = _rgba(layers / 'Neck.png')
    a = neck[..., 3] > 0
    original = original_pixels(neck, base)
    restored = a & ~original
    if not restored.any() or not original.any():
        return 0
    median = np.median(neck[..., :3][original], axis=0)
    color = _field(neck[..., :3], original, median)
    neck[restored, :3] = color[restored].round().astype(np.uint8)
    dist = cv2.distanceTransform(a.astype(np.uint8), cv2.DIST_L2, 5)
    ramp = (np.clip(dist / NECK_FEATHER, 0, 1) * 255).round().astype(np.uint8)
    neck[..., 3] = np.where(restored, ramp, neck[..., 3])
    Image.fromarray(neck).save(layers / 'Neck.png')
    return int(restored.sum())


def soften_restored(layers: Path, base: np.ndarray, lid: str, vmin: float, smax: float, d0: int, fade: int, sigmas: tuple) -> int:
    path = layers / f'{lid}.png'
    img = _rgba(path)
    a = img[..., 3] > 0
    original = original_pixels(img, base)
    restored = a & ~original
    if not restored.any() or not original.any():
        return 0
    hsv = cv2.cvtColor(np.ascontiguousarray(img[..., :3]), cv2.COLOR_RGB2HSV).astype(np.float32)
    source = original & (hsv[..., 2] / 255 >= vmin) & (hsv[..., 1] / 255 <= smax)
    if source.sum() < 500:
        source = original
    field = _field(img[..., :3], source, np.median(img[..., :3][source], axis=0), sigmas)
    img[restored, :3] = field[restored].round().astype(np.uint8)
    dist = cv2.distanceTransform((~original).astype(np.uint8), cv2.DIST_L2, 5)
    ramp = np.clip(1 - (dist - d0) / fade, 0, 1)
    img[..., 3] = np.where(restored, (img[..., 3] * ramp).round().astype(np.uint8), img[..., 3])
    Image.fromarray(img).save(path)
    return int(restored.sum())


def refine_all(layers: Path) -> None:
    base = _rgba(BASE)
    print(f'  Face_Base: 눈 밑 피부 {extend_face_base(layers, base)}px 채움')
    print(f'  Neck: 복원 부분 {refine_neck(layers, base)}px 정리')
    for lid, (vmin, smax, d0, fade, sigmas) in SOFTEN.items():
        print(f'  {lid}: 복원 부분 {soften_restored(layers, base, lid, vmin, smax, d0, fade, sigmas)}px 정리')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--layers', type=Path, default=DEFAULT_LAYERS)
    refine_all(ap.parse_args().layers)
