"""layer-plan.json 의 `cut` 힌트로 정리본을 파츠 PNG(전체 캔버스 RGBA)로 분리하고 가려진 부분을 복원한다.

    .venv/Scripts/python tools/live2d-authoring/cut_parts.py [--plan ...] [--out assets/live2d-authoring/layers]
        [--work assets/live2d-authoring/output/parts-work] [--only ID,...] [--no-restore] [--no-sdxl]

1. 레이어별 마스크(SAM/box/poly/dark) → 원본의 각 픽셀을 z 가 가장 높은 레이어에 배정(라벨맵).
   배정되지 않은 픽셀은 가장 가까운 레이어로. 분리 전후 합성이 바이트 동일함을 검사한다.
2. restore 레이어는 extend 범위 중 위 레이어에 가려진 픽셀을 cv2(TELEA) 로 채우고, method=sdxl 이면 그 결과를
   초기 이미지로 SDXL 인페인팅해 질감을 입힌다.
3. expr 레이어는 output/expressions/<name>.full.png 에서 (원본 파츠 마스크 ∪ 변화 영역)을 잘라낸다.
4. draw 레이어(눈썹)는 호를 직접 그린다.
5. 눈 변형 레이어의 회색 잔상·먼 조각을 clean_eyes.py 로, 얼굴 피부판 구멍·목 이음새를 refine_face.py 로 정리한다(--no-clean 으로 생략).
work/ 에 labelmap.png(라벨 오버레이)·unassigned.png 를 남긴다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clean_eyes import clean_all  # noqa: E402
from refine_face import refine_all  # noqa: E402
from common import DEFAULT_LAYERS, DEFAULT_PLAN, load_plan  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'assets/reference/private/kiriko-base-prepared.png'
EXPR_DIR = ROOT / 'assets/live2d-authoring/output/expressions'
DEFAULT_WORK = ROOT / 'assets/live2d-authoring/output/parts-work'
BROW_COLOR = (138, 90, 92, 255)
EXPR_DIFF = 40


def box_mask(shape, box) -> np.ndarray:
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = True
    return m


def poly_mask(shape, poly) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    return m.astype(bool)


def region_mask(shape, spec: dict) -> np.ndarray:
    return poly_mask(shape, spec['poly']) if 'poly' in spec else box_mask(shape, spec['box'])


MIN_GROW_SEED = 1500  # 이보다 작은 조각(최근접 배정 잔여물)은 복원 연장의 씨앗으로 쓰지 않는다
MIN_HOLE_FILL_AREA = 60000  # 이보다 큰 1차 마스크만 구멍을 메운다(작은 파츠는 그대로)
MAX_HOLE = 4000  # 메우는 구멍의 최대 크기(눈처럼 의도된 큰 빈 영역은 남긴다)
MOUTH_GAP = 3  # 입 변형에서 가장 큰 덩어리와 이 거리(px) 안에 닿지 않는 조각은 버린다(옷깃·볼 노이즈가 입 가까이 떠 있기도 해서 좁게)
MIN_SPECK = 400  # 이보다 작은 고립 조각은 라벨을 빼앗아 이웃 큰 덩어리에 붙인다
FEATHER = 20  # 복원 영역 바깥 경계 알파 페더 px
COLOR_ERODE = 9  # 복원 색 출처에서 경계 혼색 픽셀을 제외할 침식 커널


def fill_small_holes(m: np.ndarray, max_area: int) -> np.ndarray:
    n, cc, st, _ = cv2.connectedComponentsWithStats((~m).astype(np.uint8), connectivity=4)
    small = [c for c in range(1, n) if st[c, cv2.CC_STAT_AREA] <= max_area]
    return m | np.isin(cc, small) if small else m


class Cutter:
    def __init__(self, plan: dict, work: Path, use_sdxl: bool):
        self.plan = plan
        self.work = work
        (work / 'masks').mkdir(parents=True, exist_ok=True)
        self.base = np.asarray(Image.open(BASE).convert('RGBA'))
        self.alpha = self.base[..., 3] > 0
        self.rgb = np.ascontiguousarray(self.base[..., :3]).copy()
        self.rgb[~self.alpha] = 255  # 투명 픽셀의 RGB 잡음이 SAM 경계를 흐리지 않게
        self.shape = self.alpha.shape
        self.layers = sorted(plan['layers'], key=lambda l: l['z'])
        self.idx = {l['id']: i for i, l in enumerate(self.layers)}
        self.z = np.array([l['z'] for l in self.layers])
        self.label = np.full(self.shape, -1, np.int16)
        self._sam = None
        self._pipe = None
        self.use_sdxl = use_sdxl

    # ---------- 마스크 ----------
    def sam(self):
        if self._sam is None:
            from sam_helper import Sam
            self._sam = Sam(self.rgb)
        return self._sam

    def layer_mask(self, layer: dict) -> np.ndarray | None:
        cut = layer.get('cut') or {}
        if not any(k in cut for k in ('sam', 'box', 'poly', 'dark')):
            return None
        key = hashlib.sha1(json.dumps({k: cut.get(k) for k in ('sam', 'box', 'poly', 'dark')}, sort_keys=True).encode()).hexdigest()[:12]
        cache = self.work / 'masks' / f"{layer['id']}.v4-{key}.png"  # clip 전 원시 마스크(SAM 재계산 방지)
        if cache.is_file():
            m = np.asarray(Image.open(cache)) > 0
        else:
            m = np.zeros(self.shape, bool)
            for s in cut.get('sam', []):
                m |= self.sam().mask(tuple(s['box']), [tuple(p) for p in s.get('pos', [])], [tuple(p) for p in s.get('neg', [])])
            if 'box' in cut:
                m |= box_mask(self.shape, cut['box'])
            if 'poly' in cut:
                m |= poly_mask(self.shape, cut['poly'])
            if 'dark' in cut:
                d = cut['dark']
                lum = self.rgb.astype(np.uint16).sum(2) // 3
                dm = box_mask(self.shape, d['box']) & (lum <= d['max'])
                if 'red' in d:  # 밝은 붉은 선(입선)은 밝기만으로 못 잡는다: R - max(G,B) > red
                    rgb = self.rgb.astype(int)
                    dm |= box_mask(self.shape, d['box']) & (rgb[..., 0] - rgb[..., 1:].max(2) > d['red'])
                dm = cv2.morphologyEx(dm.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(bool)
                m |= dm
            Image.fromarray(m.astype(np.uint8) * 255).save(cache)
        if 'dark' not in cut and m.sum() >= MIN_HOLE_FILL_AREA:  # SAM 마스크의 점박이 구멍은 그 레이어 것
            m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)).astype(bool)
            m = fill_small_holes(m, MAX_HOLE)
        if 'clip' in cut:
            m &= region_mask(self.shape, cut['clip'])
        if 'dilate' in cut:  # 장식물의 어두운 외곽선(SAM 이 1~3px 안쪽으로 잡음)을 아래 레이어에서 가져온다
            k = 2 * int(cut['dilate']) + 1
            m = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(bool)
        m &= self.alpha
        if 'dark' in cut:  # 입선·속눈썹은 2~3px 선이라 열기 연산이 지워 버린다
            return m
        return cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)

    def drop_specks(self) -> None:
        """레이어별 작은 고립 조각을 미배정으로 되돌린다(최근접 배정이 다시 큰 덩어리에 붙인다). 속눈썹·입선(dark)은 제외."""
        for i, layer in enumerate(self.layers):
            if 'dark' in (layer.get('cut') or {}):
                continue
            m = self.label == i
            if not m.any():
                continue
            n, cc, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
            small = [c for c in range(1, n) if st[c, cv2.CC_STAT_AREA] < MIN_SPECK]
            if small and len(small) < n - 1:
                self.label[np.isin(cc, small)] = -1

    def assign_nearest(self) -> None:
        un = self.alpha & (self.label < 0)
        if un.any():
            src8 = (self.label < 0).astype(np.uint8)  # 0 = 배정된 픽셀
            _, lab = cv2.distanceTransformWithLabels(src8, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            zeros = np.argwhere(src8 == 0)  # DIST_LABEL_PIXEL 라벨은 0 픽셀의 스캔 순서 + 1
            src = zeros[lab[un] - 1]
            self.label[un] = self.label[src[:, 0], src[:, 1]]

    def assign(self) -> None:
        for i, layer in enumerate(self.layers):
            m = self.layer_mask(layer)
            if m is not None:
                self.label[m] = i
                print(f"  mask {layer['id']:<18} {int(m.sum()):>8} px")
        un0 = self.alpha & (self.label < 0)
        print(f"unassigned after primary masks: {int(un0.sum())} px")
        for i, layer in enumerate(self.layers):
            fb = (layer.get('cut') or {}).get('fallback')
            if fb:
                m = region_mask(self.shape, fb) & un0
                self.label[m] = i
        un = self.alpha & (self.label < 0)
        print(f"unassigned after fallback: {int(un.sum())} px")
        for _ in range(2):
            self.drop_specks()
            self.assign_nearest()
        assert not (self.alpha & (self.label < 0)).any()
        self.save_overlay(un)

    def save_overlay(self, un: np.ndarray) -> None:
        rng = np.random.RandomState(7)
        colors = rng.randint(40, 255, (len(self.layers), 3)).astype(np.uint8)
        over = np.zeros((*self.shape, 3), np.uint8)
        ok = self.label >= 0
        over[ok] = colors[self.label[ok]]
        over[un] = (255, 0, 255)
        out = (self.rgb.astype(np.float32) * 0.4 + over * 0.6).astype(np.uint8)
        out[~self.alpha] = 32
        Image.fromarray(out).resize((self.shape[1] // 3, self.shape[0] // 3), Image.LANCZOS).save(self.work / 'labelmap.png')
        Image.fromarray(np.where(un[..., None], np.array([255, 0, 255], np.uint8), self.rgb)).resize(
            (self.shape[1] // 3, self.shape[0] // 3), Image.LANCZOS).save(self.work / 'unassigned.png')

    # ---------- 출력 ----------
    def layer_rgba(self, i: int) -> np.ndarray:
        out = np.zeros_like(self.base)
        m = self.label == i
        out[m] = self.base[m]
        return out

    def restore(self, i: int, rgba: np.ndarray) -> np.ndarray:
        layer = self.layers[i]
        ex = layer['cut']['extend']
        roi = region_mask(self.shape, ex)
        # 실루엣의 반투명 가장자리(alpha<255) 밑은 비워 둬서 복원 색이 원본 외곽선 밖으로 비치지 않게 한다
        occluded = roi & (self.base[:, :, 3] == 255) & (self.label >= 0) & (self.z[np.clip(self.label, 0, None)] > self.z[i])
        own_full = self.label == i
        big = own_full  # 복원의 씨앗·색 출처는 보이는 큰 덩어리만(최근접 배정 잔여 조각의 색이 번지는 것을 막는다)
        if own_full.any():  # 큰 덩어리에서 grow px 만큼만 아래 레이어 밑으로 연장(사각형 통채우기 방지)
            n, cc, st, _ = cv2.connectedComponentsWithStats(own_full.astype(np.uint8), connectivity=8)
            big = np.isin(cc, [c for c in range(1, n) if st[c, cv2.CC_STAT_AREA] >= MIN_GROW_SEED])
            if not big.any():
                big = own_full
            k = 2 * int(ex.get('grow', 60)) + 1
            occluded &= cv2.dilate(big.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(bool)
        if not occluded.any():
            return rgba
        ys, xs = np.nonzero(occluded | (own_full & roi))
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        own = big[y0:y1, x0:x1]
        unknown = (~own).astype(np.uint8)
        crop = self.rgb[y0:y1, x0:x1].copy()
        if 'seed' in ex:  # 보이는 부분이 없는 레이어: 이웃 레이어의 보이는 부분을 영역 크기로 늘려 밑그림으로 쓴다
            s_full = self.label == self.idx[ex['seed']]
            sy, sx = np.nonzero(s_full)
            s_rgb = self.rgb[sy.min():sy.max() + 1, sx.min():sx.max() + 1]
            s_a = s_full[sy.min():sy.max() + 1, sx.min():sx.max() + 1]
            s_rgb = np.where(s_a[..., None], s_rgb, self.rgb[s_full].mean(0).astype(np.uint8))
            crop = cv2.resize(cv2.inpaint(s_rgb, (~s_a).astype(np.uint8), 7, cv2.INPAINT_TELEA), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
            filled = crop
        else:  # 가장 가까운 보이는 픽셀 색으로 채우고 흐려서 줄무늬를 없앤다(TELEA 는 넓은 영역에서 평균색으로 뭉개짐)
            core = cv2.erode(own.astype(np.uint8), np.ones((COLOR_ERODE, COLOR_ERODE), np.uint8)).astype(bool)
            if core.any():  # 경계의 혼색(머리카락·옷 색이 섞인 안티에일리어스 픽셀)은 색 출처에서 뺀다
                unknown = (~core).astype(np.uint8)
                own = core
            _, lbl = cv2.distanceTransformWithLabels(unknown, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            oy, ox = np.nonzero(own)
            src_lbl = np.zeros(lbl.max() + 1, np.int64)
            src_lbl[lbl[oy, ox]] = oy * own.shape[1] + ox
            near = crop.reshape(-1, 3)[src_lbl[lbl]]
            filled = np.where(unknown[..., None].astype(bool), cv2.GaussianBlur(near, (0, 0), 6), crop)
        if ex['method'] == 'sdxl' and self.use_sdxl:
            filled = self.sdxl(filled, occluded[y0:y1, x0:x1], own, ex.get('prompt', ''))
        occ = occluded[y0:y1, x0:x1]
        sub = rgba[y0:y1, x0:x1]
        sub[occ, :3] = filled[occ]
        # 복원 영역의 바깥 경계만 부드럽게(보이는 부분과 맞닿는 안쪽은 거리가 커서 255 유지 → 이음새 없음)
        dist = cv2.distanceTransform((occ | big[y0:y1, x0:x1]).astype(np.uint8), cv2.DIST_L2, 5)
        sub[occ, 3] = (np.clip(dist[occ] / FEATHER, 0, 1) * 255).round().astype(np.uint8)
        print(f"  restore {layer['id']:<16} {ex['method']:<4} {int(occluded.sum()):>8} px")
        return rgba

    def pipe(self):
        if self._pipe is None:
            from gen_expressions import load_pipe
            self._pipe = load_pipe()
        return self._pipe

    def sdxl(self, init: np.ndarray, fill: np.ndarray, own: np.ndarray, prompt: str) -> np.ndarray:
        import torch
        h, w = fill.shape
        side = max(h, w)
        canvas = np.zeros((side, side, 3), np.uint8) + 128
        canvas[:h, :w] = init
        m = np.zeros((side, side), np.uint8)
        m[:h, :w] = cv2.dilate(fill.astype(np.uint8), np.ones((9, 9), np.uint8)) * 255
        img = Image.fromarray(canvas).resize((1024, 1024), Image.LANCZOS)
        mask = Image.fromarray(m).resize((1024, 1024), Image.BILINEAR).filter(ImageFilter.GaussianBlur(4))
        out = self.pipe()(prompt=prompt + ', masterpiece, best quality, flat color, no shading noise',
                          negative_prompt='photo, realistic, 3d, blurry, lowres, text, watermark, extra limbs, face, eyes',
                          image=img, mask_image=mask, strength=0.7, num_inference_steps=28, guidance_scale=6.0,
                          generator=torch.Generator('cuda').manual_seed(11)).images[0]
        res = np.asarray(out.resize((side, side), Image.LANCZOS))[:h, :w]
        blend = (cv2.GaussianBlur(fill.astype(np.float32), (0, 0), 3))[..., None]
        return (res * blend + init * (1 - blend)).round().astype(np.uint8)

    def expr_layer(self, layer: dict) -> np.ndarray:
        e = layer['cut']['expr']
        src = np.asarray(Image.open(EXPR_DIR / f"{e['name']}.full.png").convert('RGBA'))
        prefix = {'eye_R': 'Eye_R_', 'eye_L': 'Eye_L_', 'mouth': 'Mouth_'}[e['region']]
        base_ids = [self.idx[l['id']] for l in self.layers if l['id'].startswith(prefix) and 'expr' not in (l.get('cut') or {})]
        m0 = np.isin(self.label, base_ids)
        if 'box' in e:  # 기본 파츠(입선)가 작으면 bbox+pad 창이 열린 입·혀를 잘라 버린다
            x0, y0, x1, y1 = e['box']
        else:
            ys, xs = np.nonzero(m0)
            pad = 30
            y0, y1, x0, x1 = max(0, ys.min() - pad), ys.max() + pad, max(0, xs.min() - pad), xs.max() + pad
        diff = np.zeros(self.shape, bool)
        d = np.abs(src[y0:y1, x0:x1, :3].astype(int) - self.rgb[y0:y1, x0:x1].astype(int)).sum(2) > EXPR_DIFF
        diff[y0:y1, x0:x1] = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(bool)
        m = (m0 | diff) & (src[..., 3] > 0)
        m = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & self.alpha
        above = (self.label >= 0) & (self.z[np.clip(self.label, 0, None)] > layer['z'])
        m &= ~above  # 변형 위를 덮는 앞머리·귀 픽셀은 변형에 넣지 않는다(머리카락이 움직이면 잔상이 보임)
        n, cc, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
        if n > 2:  # 인페인팅이 옷깃에 남긴 작은 노이즈 조각은 변형이 아니다. 가장 큰 덩어리는 항상 유지
            keep = [c for c in range(1, n) if st[c, cv2.CC_STAT_AREA] >= MIN_SPECK or st[c, cv2.CC_STAT_AREA] == st[1:, cv2.CC_STAT_AREA].max()]
            m = np.isin(cc, keep)
            if e['region'] == 'mouth':  # 입 변형은 한 덩어리(이빨·혀 하이라이트는 입 안쪽): 입에서 떨어진 옷깃·볼 노이즈 조각은 버린다
                main = cc == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
                near = cv2.dilate(main.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MOUTH_GAP + 1,) * 2)).astype(bool)
                m &= np.isin(cc, np.unique(cc[near & m]))
        out = np.zeros_like(src)
        out[m] = src[m]
        return out

    def draw_layer(self, layer: dict) -> np.ndarray:
        d = layer['cut']['draw']
        S = 4
        (p0, p1, p2) = [np.array(p, float) for p in d['arc']]
        big = Image.new('RGBA', (self.shape[1] * S, self.shape[0] * S), (0, 0, 0, 0))
        pts_big = [tuple(((1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2) * S) for t in np.linspace(0, 1, 48)]
        ImageDraw.Draw(big).line(pts_big, fill=BROW_COLOR, width=int(d.get('width', 6) * S), joint='curve')
        x0, y0, x1, y1 = big.getbbox()
        small = big.crop((x0, y0, x1, y1)).resize(((x1 - x0) // S, (y1 - y0) // S), Image.LANCZOS)
        out = Image.new('RGBA', (self.shape[1], self.shape[0]), (0, 0, 0, 0))
        out.alpha_composite(small, (x0 // S, y0 // S))
        return np.asarray(out)

    def run(self, out_dir: Path, only: set[str] | None, do_restore: bool, do_clean: bool = True) -> None:
        out_dir.mkdir(parents=True, exist_ok=True)
        self.assign()
        if self._sam is not None:  # SDXL 전에 SAM(ViT-H) VRAM 반납
            import gc, torch
            self._sam = None
            gc.collect()
            torch.cuda.empty_cache()
        comp = np.zeros_like(self.base)
        for i, layer in enumerate(self.layers):
            cut = layer.get('cut') or {}
            lid = layer['id']
            if layer.get('exportExcluded') or (not cut):
                continue
            if 'expr' in cut:
                rgba = self.expr_layer(layer)
            elif 'draw' in cut:
                rgba = self.draw_layer(layer)
            else:
                rgba = self.layer_rgba(i)
                m = rgba[..., 3] > 0
                comp[m] = rgba[m]
                if do_restore and 'extend' in cut and (only is None or lid in only):
                    rgba = self.restore(i, rgba)
            if only is None or lid in only:
                Image.fromarray(rgba).save(out_dir / f'{lid}.png')
        assert np.array_equal(comp[self.alpha], self.base[self.alpha]) and not comp[~self.alpha].any(), '분리 합성이 원본과 다름'
        print('split composite == base: OK')
        if do_clean and only is None:
            clean_all(out_dir)
            refine_all(out_dir)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--plan', type=Path, default=DEFAULT_PLAN)
    ap.add_argument('--out', type=Path, default=DEFAULT_LAYERS)
    ap.add_argument('--work', type=Path, default=DEFAULT_WORK)
    ap.add_argument('--only', help='쉼표로 구분한 레이어 id. 지정하면 그 레이어만 저장·복원')
    ap.add_argument('--no-restore', action='store_true')
    ap.add_argument('--no-sdxl', action='store_true', help='sdxl 복원도 cv2 결과로 대체')
    ap.add_argument('--no-clean', action='store_true', help='눈 변형 레이어 잔상 정리(clean_eyes.py)를 생략')
    a = ap.parse_args()
    plan = load_plan(a.plan)
    Cutter(plan, a.work, not a.no_sdxl).run(a.out, set(a.only.split(',')) if a.only else None, not a.no_restore, not a.no_clean)


if __name__ == '__main__':
    main()
