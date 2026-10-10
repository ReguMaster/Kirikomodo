"""키리코 moc3 조립. atlas.json(레이어 rect/src) + layer-plan.json(z·그룹) 으로 파츠·메시·디포머·키폼을 만든다.

사용: python tools/moc3/kiriko.py [out_dir]   기본 assets/models/private/kiriko → kiriko.moc3 + kiriko.model3.json
검증: node tools/moc3/inspect-core.cjs assets/models/private/kiriko/kiriko.moc3 ParamAngleX=30

좌표: 모든 키폼은 정리본 픽셀(2530×3006, y 아래 +)로 계산한 뒤 부모 좌표(모델 공간 또는 워프 격자 0..1)로 변환한다.
표정 변형 레이어는 ParamEyeVariant / ParamMouthVariant 의 정수 키로 켠다(0 = 기본).
"""
from __future__ import annotations

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import Builder  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ATLAS = os.path.join(ROOT, 'assets/models/private/kiriko/atlas.json')
PLAN = os.path.join(ROOT, 'assets/live2d-authoring/input/layer-plan.json')
TEX = 4096

EYE_VARIANTS = ['', 'Half', 'Wide', 'Teary', 'Glare', 'Sleepy']          # ParamEyeVariant 0..5 (Closed 는 EyeOpen=0)
MOUTH_VARIANTS = ['', 'Mouth_O', 'Mouth_Grin', 'Mouth_Curious', 'Mouth_Annoyed', 'Mouth_Sleepy']  # ParamMouthVariant 0..5
HEAD_RECT = (700, 100, 1850, 1720)      # 머리 워프 격자(px). 귀·술·옆머리까지 포함
HEAD_PIVOT = (1265, 1050)               # 목
BODY_PIVOT = (1265, 3006)
# 흔들림(물리) 파라미터: 레이어 → (파라미터, 진폭 px, 고정축 'top'|'pivot', 피벗 px)
SWAY = {
    'Hair_Back_R': ('ParamHairBack', 45, 'top'), 'Hair_Back_L': ('ParamHairBack', 45, 'top'),
    'Hair_Back_Center': ('ParamHairBack', 30, 'top'),
    'Hair_Side_R': ('ParamHairSide', 25, 'top'), 'Hair_Side_L': ('ParamHairSide', 25, 'top'),
    'Hair_Over_R': ('ParamHairSide', 20, 'top'), 'Hair_Over_L': ('ParamHairSide', 20, 'top'),
    'Hair_Front': ('ParamHairFront', 14, 'top'),
    'Tassel_R': ('ParamTassel', 35, 'top'), 'Tassel_L': ('ParamTassel', 35, 'top'), 'Mask_Tassel': ('ParamTassel', 25, 'top'),
    'Ofuda': ('ParamOfuda', 30, 'top'),
    'Apron': ('ParamSkirt', 25, 'top'), 'Hakama': ('ParamSkirt', 25, 'top'),
    'Ribbon_Waist': ('ParamRibbon', 15, 'top'), 'Bell_Chest': ('ParamRibbon', 12, 'top'),
    'Sleeve_R': ('ParamSleeve', 18, 'top'), 'Sleeve_L': ('ParamSleeve', 18, 'top'),
}
PARALLAX = {'Face_Base': 0.35, 'Eye': 0.7, 'Brow': 0.65, 'Mouth': 0.6, 'Neck': 0.0, 'Hair_Knot': -0.1, 'Ear': -0.15, 'Mask_Fox': -0.1}


def lerp_key(v: float, keys: list[float], vals: list[float]) -> float:
    for (k0, v0), (k1, v1) in zip(zip(keys, vals), zip(keys[1:], vals[1:])):
        if v <= k1:
            return v0 if k1 == k0 else v0 + (v1 - v0) * (v - k0) / (k1 - k0)
    return vals[-1]


def rot(px, py, cx, cy, deg):
    a = math.radians(deg)
    dx, dy = px - cx, py - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def grid_pts(x0, y0, w, h, cols, rows):
    return [(x0 + w * i / cols, y0 + h * j / rows) for j in range(rows + 1) for i in range(cols + 1)]


def grid_idx(cols, rows):
    out = []
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            b, c, d = a + 1, a + cols + 1, a + cols + 2
            out += [a, b, d, a, d, c]
    return out


class Kiriko:
    def __init__(self):
        atlas = json.load(open(ATLAS, encoding='utf-8'))
        plan = json.load(open(PLAN, encoding='utf-8'))
        self.W, self.H = atlas['canvas']['width'], atlas['canvas']['height']
        self.textures = atlas['textures']
        self.layers = [l for l in plan['layers'] if l['id'] in atlas['layers']]
        self.layers.sort(key=lambda l: l['z'])
        self.atlas = atlas['layers']
        self.b = Builder(self.W, self.H)
        self.parts: dict[str, int] = {}
        self.rects: dict[int, tuple] = {}   # 워프 인덱스 → 휴지 자세 px 사각형

    # ---- 좌표 변환 ----
    def local(self, parent: int, pts):
        if parent < 0:
            return [self.b.model(x, y) for x, y in pts]
        x0, y0, x1, y1 = self.rects[parent]
        return [((x - x0) / (x1 - x0), (y - y0) / (y1 - y0)) for x, y in pts]

    # ---- 파라미터 ----
    def params(self):
        P = self.b.param
        for pid in ('ParamAngleX', 'ParamAngleY', 'ParamAngleZ'):
            P(pid, -30, 30, 0, keys=[-30, 0, 30])
        for pid in ('ParamEyeLOpen', 'ParamEyeROpen'):
            P(pid, 0, 1, 1, keys=[0, 0.3, 1])
        for pid in ('ParamEyeBallX', 'ParamEyeBallY', 'ParamBrowLY', 'ParamBrowRY', 'ParamMouthForm'):
            P(pid, -1, 1, 0, keys=[-1, 0, 1])
        P('ParamMouthOpenY', 0, 1, 0, keys=[0, 0.3, 1])
        P('ParamEyeVariant', 0, len(EYE_VARIANTS) - 1, 0, keys=list(range(len(EYE_VARIANTS))), decimals=0)
        P('ParamMouthVariant', 0, len(MOUTH_VARIANTS) - 1, 0, keys=list(range(len(MOUTH_VARIANTS))), decimals=0)
        for pid in ('ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ'):
            P(pid, -10, 10, 0, keys=[-10, 0, 10])
        P('ParamBreath', 0, 1, 0)
        for pid in ('ParamEarR', 'ParamEarL', 'ParamTail', 'ParamHairFront', 'ParamHairSide', 'ParamHairBack',
                    'ParamTassel', 'ParamOfuda', 'ParamSkirt', 'ParamRibbon', 'ParamSleeve'):
            P(pid, -1, 1, 0, keys=[-1, 0, 1])

    # ---- 디포머 ----
    def body_px(self, v, x, y):
        t = (BODY_PIVOT[1] - y) / self.H            # 아래 0 → 위 1
        x += v['ParamBodyAngleX'] * 3.0 * t
        y -= v['ParamBreath'] * 10 * t + v['ParamBodyAngleY'] * 1.5 * t
        return rot(x, y, *BODY_PIVOT, v['ParamBodyAngleZ'] * 0.5)

    def head_px(self, v, x, y, depth=0.0):
        ax, ay, az = v['ParamAngleX'], v['ParamAngleY'], v['ParamAngleZ']
        t = max(0.0, (HEAD_PIVOT[1] - y) / 900)      # 목 0 → 정수리 ≈1
        x += ax * (1.2 + 1.4 * t) + ax * depth * 2.5
        y -= ay * (1.0 + 0.8 * t) + ay * depth * 1.6
        return rot(x, y, *HEAD_PIVOT, az)

    def deformers(self):
        b, rects = self.b, self.rects
        part = self.parts['03_Body']
        pts = grid_pts(0, 0, self.W, self.H, 2, 2)
        body = b.warp('WarpBody', part, -1, 2, 2, ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamBreath'],
                      lambda v: dict(positions=self.local(-1, [self.body_px(v, x, y) for x, y in pts])))
        rects[body] = (0, 0, self.W, self.H)
        x0, y0, x1, y1 = HEAD_RECT
        hp = grid_pts(x0, y0, x1 - x0, y1 - y0, 4, 5)
        head = b.warp('WarpHead', self.parts['06_Face'], body, 5, 4, ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ'],
                      lambda v: dict(positions=self.local(body, [self.head_px(v, x, y) for x, y in hp])))
        rects[head] = HEAD_RECT
        self.body, self.head = body, head

    # ---- 아트메시 ----
    def mesh_for(self, lid: str, w: int, h: int):
        if lid in SWAY or lid == 'Tail':
            return 3, 8
        if lid.startswith('Ear'):
            return 2, 3
        return 2, 2

    def transform(self, lid: str, v: dict, x: float, y: float, geo: dict):
        """레이어 하나의 정점(px) 을 파라미터 값으로 변형. 머리/몸 워프의 영향은 부모가 처리하므로 여기서는 고유 변형만."""
        x0, y0, w, h = geo['x0'], geo['y0'], geo['w'], geo['h']
        if lid in SWAY:
            pid, amp, _ = SWAY[lid]
            t = (y - y0) / h
            x += amp * v[pid] * t * t
        if lid == 'Tail':
            px, py = x0 + w - 40, y0 + h - 120
            d = math.hypot(x - px, y - py) / math.hypot(w, h)
            x, y = rot(x, y, px, py, v['ParamTail'] * 9 * d)
        if lid.startswith('Ear_'):
            side = lid[-1]
            cx = x0 + w / 2
            x, y = rot(x, y, cx, y0 + h, v['ParamEar' + side] * 14 * (1 if side == 'L' else -1))
        if lid.startswith('Brow_'):
            y -= v['ParamBrow' + lid[-1] + 'Y'] * 12
        if lid.startswith('Eye_') and 'Closed' not in lid:
            side = lid[4]
            s = lerp_key(v['ParamEye' + side + 'Open'], [0, 0.3, 1], [0.06, 0.5, 1.0])
            cy = y0 + h * 0.8
            y = cy + (y - cy) * s
            if 'Iris' in lid:
                x += v['ParamEyeBallX'] * 8
                y += v['ParamEyeBallY'] * 5
        if lid == 'Mouth_Open':
            s = lerp_key(v['ParamMouthOpenY'], [0, 0.3, 1], [0.35, 0.5, 1.0])
            y = y0 + (y - y0) * s
        for key, depth in PARALLAX.items():
            if lid.startswith(key) and 'ParamAngleX' in v:
                x += v['ParamAngleX'] * depth * 2.5
                y -= v['ParamAngleY'] * depth * 1.6
                break
        return x, y

    def opacity(self, lid: str, v: dict) -> float:
        if lid.startswith('Eye_'):
            side = lid[4]
            op = v['ParamEye' + side + 'Open']
            open_w = lerp_key(op, [0, 0.3, 1], [0, 1, 1])
            variant = int(round(v['ParamEyeVariant']))
            if lid.endswith('Closed'):
                return 1 - open_w
            tag = lid.split('_', 2)[2]
            if tag in ('White', 'Iris', 'Lashes'):
                return open_w if variant == 0 else 0.0
            return open_w if EYE_VARIANTS[variant] == tag else 0.0
        if lid.startswith('Mouth_'):
            variant = int(round(v['ParamMouthVariant']))
            if lid in MOUTH_VARIANTS:
                return 1.0 if MOUTH_VARIANTS[variant] == lid else 0.0
            if variant != 0:
                return 0.0
            open_w = lerp_key(v['ParamMouthOpenY'], [0, 0.3, 1], [0, 1, 1])
            if lid == 'Mouth_Open':
                return open_w
            form = v['ParamMouthForm']
            shape = {'Mouth_Frown': lerp_key(form, [-1, 0, 1], [1, 0, 0]), 'Mouth_Line': lerp_key(form, [-1, 0, 1], [0, 1, 0]),
                     'Mouth_Smile': lerp_key(form, [-1, 0, 1], [0, 0, 1])}[lid]
            return shape * (1 - open_w)
        return 1.0

    def bind_params(self, lid: str) -> list[str]:
        ps: list[str] = []
        if lid in SWAY:
            ps.append(SWAY[lid][0])
        if lid == 'Tail':
            ps.append('ParamTail')
        if lid.startswith('Ear_'):
            ps.append('ParamEar' + lid[-1])
        if lid.startswith('Brow_'):
            ps.append('ParamBrow' + lid[-1] + 'Y')
        if lid.startswith('Eye_'):
            ps += ['ParamEye' + lid[4] + 'Open', 'ParamEyeVariant']
            if 'Iris' in lid:
                ps += ['ParamEyeBallX', 'ParamEyeBallY']
        if lid.startswith('Mouth_'):
            ps.append('ParamMouthVariant')
            if lid not in MOUTH_VARIANTS:
                ps.append('ParamMouthOpenY')
                if lid != 'Mouth_Open':
                    ps.append('ParamMouthForm')
        if any(lid.startswith(k) for k in PARALLAX):
            ps += ['ParamAngleX', 'ParamAngleY']
        return ps

    def artmeshes(self):
        b = self.b
        for layer in self.layers:
            lid, z = layer['id'], layer['z']
            a = self.atlas[lid]
            rx, ry, w, h = a['rect']
            x0, y0 = a['src']
            cols, rows = self.mesh_for(lid, w, h)
            uvs = [((rx + w * i / cols) / TEX, (ry + h * j / rows) / TEX) for j in range(rows + 1) for i in range(cols + 1)]
            base = grid_pts(x0, y0, w, h, cols, rows)
            geo = dict(x0=x0, y0=y0, w=w, h=h)
            parent = self.head if self.is_head(layer) else self.body
            if lid == 'Tail':
                parent = self.body

            def kf(v, lid=lid, base=base, geo=geo, parent=parent, z=z):
                pts = [self.transform(lid, v, x, y, geo) for x, y in base]
                return dict(positions=self.local(parent, pts), opacity=self.opacity(lid, v), drawOrder=500 + z)
            b.artmesh(lid, self.parts[layer['group']], parent, a['texture'], uvs, grid_idx(cols, rows), self.bind_params(lid), kf)

    @staticmethod
    def is_head(layer) -> bool:
        g = layer['group']
        return g.startswith(('06_', '07_', '08_', '09_', '10_')) or layer['id'] == 'Neck'

    def build(self):
        for g in sorted({l['group'] for l in self.layers}):
            self.parts[g] = self.b.part('Part' + g.replace('/', '_').replace('_', '', 1) if g[0].isdigit() else g)
        self.params()
        self.deformers()
        self.artmeshes()
        return self.b.build()

    def model3(self, moc_name: str) -> dict:
        return {
            'Version': 3,
            'FileReferences': {'Moc': moc_name, 'Textures': self.textures, 'Motions': {}, 'Expressions': []},
            'Groups': [
                {'Target': 'Parameter', 'Name': 'EyeBlink', 'Ids': ['ParamEyeLOpen', 'ParamEyeROpen']},
                {'Target': 'Parameter', 'Name': 'LipSync', 'Ids': ['ParamMouthOpenY']},
            ],
            'HitAreas': [{'Id': 'Hair_Front', 'Name': 'Head'}, {'Id': 'Torso', 'Name': 'Body'}],
        }


def main(out_dir: str):
    k = Kiriko()
    m = k.build()
    os.makedirs(out_dir, exist_ok=True)
    moc = os.path.join(out_dir, 'kiriko.moc3')
    m.save(moc)
    from kiriko_anim import write_all
    from kiriko_physics import write as write_physics
    model3 = k.model3('kiriko.moc3')
    model3['FileReferences']['Motions'], model3['FileReferences']['Expressions'] = write_all(out_dir)
    model3['FileReferences']['Physics'] = write_physics(out_dir)
    with open(os.path.join(out_dir, 'kiriko.model3.json'), 'w', encoding='utf-8') as f:
        json.dump(model3, f, ensure_ascii=False, indent=2)
    print(f'wrote {moc}: parts={len(k.b.parts)} params={len(k.b.params)} deformers={len(k.b.deformers)} artmeshes={len(k.b.artmeshes)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(ATLAS))
