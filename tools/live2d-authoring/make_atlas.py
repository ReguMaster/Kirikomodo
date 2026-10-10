"""파츠 PNG → 텍스처 아틀라스(4096² PNG, 여러 장 가능) + atlas.json(UV·캔버스 오프셋) + compare.png.

    .venv/Scripts/python tools/live2d-authoring/make_atlas.py [--out assets/models/private/kiriko] [--size 4096] [--pad 2]

atlas.json: {canvas, textures:[file], layers:{id:{texture, rect:[x,y,w,h], src:[x,y], uv:[u0,v0,u1,v1]}}}
  rect 는 텍스처 픽셀, src 는 그 조각이 놓이는 캔버스 좌표(= 레이어 bbox 좌상단), uv 는 0..1(위가 0).
compare.png: [원본 | 아틀라스에서 다시 조립한 합성 | 차이(빨강)] — 표정 변형·눈썹(expr/draw)은 조립에서 제외.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from common import DEFAULT_LAYERS, DEFAULT_PLAN, ROOT, is_export_excluded, layers_sorted, load_plan, write_json

BASE = ROOT / 'assets/reference/private/kiriko-base-prepared.png'


def pack(items: list[tuple[str, int, int]], size: int, pad: int) -> list[dict]:
    """shelf packing. items=(id,w,h) → [{id,texture,x,y}]. 높이 내림차순."""
    placed, page, shelves = [], 0, []  # shelves: [x_cursor, y, h]
    for lid, w, h in sorted(items, key=lambda t: -t[2]):
        assert w + 2 * pad <= size and h + 2 * pad <= size, f'{lid} 가 텍스처보다 큼'
        for sh in shelves:
            if sh[2] >= h + 2 * pad and sh[0] + w + 2 * pad <= size:
                placed.append(dict(id=lid, texture=page, x=sh[0] + pad, y=sh[1] + pad))
                sh[0] += w + 2 * pad
                break
        else:
            y = (shelves[-1][1] + shelves[-1][2]) if shelves else 0
            if y + h + 2 * pad > size:
                page, shelves, y = page + 1, [], 0
            shelves.append([w + 2 * pad, y, h + 2 * pad])
            placed.append(dict(id=lid, texture=page, x=pad, y=y + pad))
    return placed


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--plan', type=Path, default=DEFAULT_PLAN)
    ap.add_argument('--layers', type=Path, default=DEFAULT_LAYERS)
    ap.add_argument('--out', type=Path, default=ROOT / 'assets/models/private/kiriko')
    ap.add_argument('--size', type=int, default=4096)
    ap.add_argument('--pad', type=int, default=2)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    plan = load_plan(a.plan)

    crops: dict[str, tuple[np.ndarray, int, int]] = {}
    for layer in layers_sorted(plan):
        lid = layer['id']
        p = a.layers / f'{lid}.png'
        if is_export_excluded(plan, lid) or not p.is_file():
            continue
        im = np.asarray(Image.open(p).convert('RGBA'))
        ys, xs = np.nonzero(im[..., 3])
        if not len(ys):
            print(f'  skip empty {lid}')
            continue
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crops[lid] = (im[y0:y1, x0:x1], int(x0), int(y0))

    placed = pack([(lid, c.shape[1], c.shape[0]) for lid, (c, _, _) in crops.items()], a.size, a.pad)
    n_tex = max(p['texture'] for p in placed) + 1
    pages = [np.zeros((a.size, a.size, 4), np.uint8) for _ in range(n_tex)]
    meta = {'canvas': plan['canvas'], 'textures': [f'texture_{i:02d}.png' for i in range(n_tex)], 'layers': {}}
    for p in placed:
        crop, sx, sy = crops[p['id']]
        h, w = crop.shape[:2]
        pages[p['texture']][p['y']:p['y'] + h, p['x']:p['x'] + w] = crop
        meta['layers'][p['id']] = dict(texture=p['texture'], rect=[p['x'], p['y'], w, h], src=[sx, sy],
                                       uv=[p['x'] / a.size, p['y'] / a.size, (p['x'] + w) / a.size, (p['y'] + h) / a.size])
    for i, pg in enumerate(pages):
        Image.fromarray(pg).save(a.out / meta['textures'][i])
    write_json(a.out / 'atlas.json', meta)

    # 아틀라스 → 캔버스 재조립과 원본 비교
    base = np.asarray(Image.open(BASE).convert('RGBA'))
    comp = np.zeros_like(base)
    by_id = {l['id']: l for l in plan['layers']}
    for layer in layers_sorted(plan):
        m = meta['layers'].get(layer['id'])
        cut = layer.get('cut') or {}
        if not m or 'expr' in cut or 'draw' in cut:
            continue
        x, y, w, h = m['rect']
        piece = pages[m['texture']][y:y + h, x:x + w]
        sx, sy = m['src']
        dst = comp[sy:sy + h, sx:sx + w]
        al = piece[..., 3:4].astype(np.float32) / 255
        dal = dst[..., 3:4].astype(np.float32) / 255
        oa = al + dal * (1 - al)
        rgb = np.divide(piece[..., :3] * al + dst[..., :3] * dal * (1 - al), oa, out=np.zeros_like(oa.repeat(3, -1)), where=oa > 0)
        dst[..., :3] = rgb.round().astype(np.uint8)
        dst[..., 3] = (oa[..., 0] * 255).round().astype(np.uint8)
    alpha = base[..., 3] > 0
    diff = alpha & (np.abs(comp[..., :3].astype(int) - base[..., :3].astype(int)).sum(-1) > 12)
    heat = np.full_like(base, 255)
    heat[..., :3] = (base[..., :3] * 0.3 + 255 * 0.7).astype(np.uint8)
    heat[diff] = (255, 0, 0, 255)
    white = lambda im: np.where(im[..., 3:4] > 0, im, np.array([255, 255, 255, 255], np.uint8))
    panel = np.concatenate([white(base), white(comp), heat], 1)
    Image.fromarray(panel).resize((panel.shape[1] // 2, panel.shape[0] // 2), Image.LANCZOS).save(a.out / 'compare.png')
    print(f'textures={n_tex} layers={len(placed)} diff_px={int(diff.sum())} (원본 알파 안, 임계 12)')
    print(f'→ {a.out}')


if __name__ == '__main__':
    main()
