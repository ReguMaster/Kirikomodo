"""제작 기준 원본(RGBA 배경 제거본) 정리: 알파 정규화 + 캔버스 여백 + 헤일로 점검용 합성 미리보기.

    python tools/live2d-authoring/normalize_base.py --input assets/reference/private/kiriko-base-rgba.png \
        --out assets/reference/private/kiriko-base-prepared.png [--margin 160] [--bottom 0]

- 알파 >= --hi(기본 240) 는 255 로, 알파 <= --lo(기본 8) 는 0 으로(배경 잔여 노이즈 제거), 그 사이는 선형 재배치.
- 투명 픽셀의 RGB 는 가장 가까운 불투명 색으로 채워(premultiplied 번짐 방지) 어두운 배경에서도 테두리가 어둡게 비치지 않게 한다.
- 하단은 원본이 평평하게 잘려 있으므로 여백을 --bottom 만큼만 둔다(기본 0: 캔버스 하단 = 절단면. 앱이 창 하단에서 클리핑).
- 산출물 옆에 <out>.report.json 과 output/base-check/ 에 흰·검정 배경 합성·가장자리 확대본을 둔다(Read 로 육안 점검).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def normalize_alpha(alpha: np.ndarray, lo: int, hi: int) -> np.ndarray:
    a = alpha.astype(np.float32)
    a = np.clip((a - lo) / (hi - lo), 0, 1) * 255
    return np.round(a).astype(np.uint8)


def fill_transparent_rgb(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """투명 영역 RGB 를 가장 가까운 불투명 픽셀 색으로 채운다(가장자리 보간 시 어두운 헤일로 방지)."""
    mask = (alpha == 0).astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels(mask, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(mask == 0)
    # 라벨 k (1-based) = k 번째 0 픽셀(행 우선) → 좌표표
    lookup = np.zeros((len(ys) + 1, 2), dtype=np.int64)
    lookup[1:, 0], lookup[1:, 1] = ys, xs
    src = lookup[labels]
    out = rgb.copy()
    out[mask == 1] = rgb[src[..., 0][mask == 1], src[..., 1][mask == 1]]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--margin', type=int, default=160, help='좌·우·상 여백(px)')
    ap.add_argument('--bottom', type=int, default=0, help='하단 여백(px). 절단면은 그대로 둔다')
    ap.add_argument('--lo', type=int, default=8)
    ap.add_argument('--hi', type=int, default=240)
    ap.add_argument('--check-dir', default='assets/live2d-authoring/output/base-check')
    args = ap.parse_args()

    im = Image.open(args.input).convert('RGBA')
    a = np.asarray(im)
    before = a[..., 3]
    alpha = normalize_alpha(before, args.lo, args.hi)
    rgb = fill_transparent_rgb(a[..., :3], alpha)

    m, b = args.margin, args.bottom
    h, w = alpha.shape
    canvas = np.zeros((h + m + b, w + 2 * m, 4), dtype=np.uint8)
    canvas[m:m + h, m:m + w, :3] = rgb
    canvas[m:m + h, m:m + w, 3] = alpha
    # 여백의 RGB 도 가장 가까운 색으로 채워 둔다
    canvas[..., :3] = fill_transparent_rgb(canvas[..., :3], canvas[..., 3])
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(canvas).save(out)

    ys, xs = np.nonzero(canvas[..., 3])
    report = {
        'input': args.input, 'output': str(out), 'inputSize': [w, h], 'outputSize': [canvas.shape[1], canvas.shape[0]],
        'margin': {'left': m, 'right': m, 'top': m, 'bottom': b},
        'alphaBefore': {'opaque255': int((before == 255).sum()), 'semi': int(((before > 0) & (before < 255)).sum()),
                        'faint(<=lo)': int(((before > 0) & (before <= args.lo)).sum())},
        'alphaAfter': {'opaque255': int((alpha == 255).sum()), 'semi': int(((alpha > 0) & (alpha < 255)).sum())},
        'opaqueBBox': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        'bottomRowOpaque': int((canvas[-1, :, 3] > 0).sum()),
        'bottomCut': '원본 하단 절단면을 캔버스 하단에 그대로 둠. 앱 창 하단 클리핑으로 처리(handoff "아트 방향")',
    }
    out.with_suffix('.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    # 육안 점검용: 흰/검정 배경 합성 축소본 + 가장자리 확대 타일
    check = Path(args.check_dir)
    check.mkdir(parents=True, exist_ok=True)
    rgba = Image.fromarray(canvas)
    for name, color in (('on-white', (255, 255, 255)), ('on-black', (0, 0, 0)), ('on-green', (0, 180, 0))):
        bg = Image.new('RGBA', rgba.size, color + (255,))
        comp = Image.alpha_composite(bg, rgba).convert('RGB')
        comp.resize((comp.width // 3, comp.height // 3), Image.LANCZOS).save(check / f'{name}.png')
    right = (xs.argmax(), ys.argmin(), xs.argmin())  # 가장 오른쪽·위·왼쪽 불투명 픽셀 주변
    crops = {'right': (xs[right[0]] - 400, ys[right[0]] - 250), 'top': (xs[right[1]] - 250, ys[right[1]] - 100),
             'left': (xs[right[2]] - 100, ys[right[2]] - 250),
             'face': (canvas.shape[1] // 2 - 250, m + 700), 'bottom': (canvas.shape[1] // 2 - 250, canvas.shape[0] - 500)}
    for name, (x0, y0) in crops.items():
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        tile = rgba.crop((x0, y0, x0 + 500, y0 + 500))
        row = Image.new('RGB', (1000, 500))
        for i, color in enumerate(((255, 255, 255), (0, 0, 0))):
            row.paste(Image.alpha_composite(Image.new('RGBA', tile.size, color + (255,)), tile).convert('RGB'), (500 * i, 0))
        row.save(check / f'edge-{name}.png')
    # 정규화로 사라진 희미한 픽셀(알파 <= lo) 분포: 머리카락 끝이 아니라 배경 잔여 노이즈인지 확인
    removed = (before > 0) & (alpha == 0)
    vis = np.full((h, w, 3), 255, np.uint8); vis[before >= 128] = 200; vis[removed] = (255, 0, 0)
    Image.fromarray(vis).resize((w // 3, h // 3), Image.NEAREST).save(check / 'removed-faint.png')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
