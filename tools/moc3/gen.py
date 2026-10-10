"""moc3 생성기 (stdlib). 파츠·아트메시·파라미터·키폼·워프/회전 디포머를 처음부터 만들어 V3.00 moc3 로 쓴다.

좌표 규약(Haru + Core 로 확인, docs/moc3-format.md):
  - 파일에 저장되는 좌표는 전부 화면 방향(y 아래 +). Core 는 출력할 때 y 를 뒤집어 위쪽 + 로 보고한다.
  - 루트 객체(부모 디포머 없음): 모델 공간. 픽셀 → x=(px-originX)/ppu, y=(py-originY)/ppu.
  - 워프 디포머의 자식: 격자 로컬 (u,v) 0..1. u 는 열 방향, v 는 행 방향(행 0 = positions 의 첫 행)으로 쌍선형 보간.
  - 회전 디포머의 자식: 회전 로컬 좌표. 부모 좌표 = origin + R(angle)·(scale·local). 각도는 화면 기준 시계 방향 +.
  - 키폼 수 = 바인딩된 파라미터별 키 수의 곱. 키폼 데이터는 콜백 kf(values) 로 받아 모든 조합을 채운다.

사용: python tools/moc3/gen.py demo <out.moc3>   기하 도형 검증 모델 생성
"""
from __future__ import annotations

import itertools
import os
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from moc3 import Moc3, V3_00, COUNT_NAMES, layout_for  # noqa: E402

WARP, ROTATION = 0, 1
BLOCK = 16  # 키폼 위치 블록은 16 f32(64 B) 단위로 정렬


@dataclass
class _Obj:
    id: str
    part: int
    parent: int                     # deformer 인덱스, -1 루트
    params: list[int]               # 바인딩 파라미터 인덱스
    kf: object                      # callable(values: dict[str, float]) -> dict
    kind: str = ''
    extra: dict = field(default_factory=dict)


class Builder:
    def __init__(self, width: float, height: float, ppu: float | None = None,
                 origin: tuple[float, float] | None = None):
        self.width, self.height = float(width), float(height)
        self.ppu = float(ppu or width)
        self.origin = origin or (width / 2, height / 2)
        self.parts: list[tuple[str, int, float]] = []
        self.params: list[dict] = []
        self.deformers: list[_Obj] = []
        self.artmeshes: list[_Obj] = []

    # 픽셀 → 모델 공간(저장 좌표, y 아래 +)
    def model(self, px: float, py: float) -> tuple[float, float]:
        return (px - self.origin[0]) / self.ppu, (py - self.origin[1]) / self.ppu

    def part(self, id: str, parent: int = -1, draw_order: float = 500.0) -> int:
        self.parts.append((id, parent, draw_order))
        return len(self.parts) - 1

    def param(self, id: str, lo: float, hi: float, default: float, keys: list[float] | None = None,
              decimals: int = 3, repeat: bool = False) -> int:
        self.params.append(dict(id=id, lo=float(lo), hi=float(hi), default=float(default),
                                keys=[float(k) for k in (keys or [lo, hi])], decimals=decimals, repeat=repeat))
        return len(self.params) - 1

    def _pidx(self, ids: list[str]) -> list[int]:
        return [next(i for i, p in enumerate(self.params) if p['id'] == pid) for pid in ids]

    def warp(self, id: str, part: int, parent: int, rows: int, cols: int, params: list[str], kf) -> int:
        """kf(values) -> dict(positions=[(x,y)]*((rows+1)*(cols+1)), 행(v) 바깥·열(u) 안쪽 순서, opacity=1)"""
        assert parent < len(self.deformers)
        self.deformers.append(_Obj(id, part, parent, self._pidx(params), kf, 'warp', dict(rows=rows, cols=cols)))
        return len(self.deformers) - 1

    def rotation(self, id: str, part: int, parent: int, params: list[str], kf, base_angle: float = 0.0) -> int:
        """kf(values) -> dict(angle=deg, origin=(x,y), scale=1.0, opacity=1, reflectX=0, reflectY=0)"""
        assert parent < len(self.deformers)
        self.deformers.append(_Obj(id, part, parent, self._pidx(params), kf, 'rotation', dict(base=base_angle)))
        return len(self.deformers) - 1

    def artmesh(self, id: str, part: int, parent: int, texture: int, uvs: list[tuple[float, float]],
                indices: list[int], params: list[str], kf, masks: list[int] | None = None,
                blend: int = 0, double_sided: bool = False, inverted_mask: bool = False) -> int:
        """kf(values) -> dict(positions=[(x,y)]*len(uvs), opacity=1, drawOrder=500)"""
        assert parent < len(self.deformers) and len(indices) % 3 == 0
        flags = (blend & 3) | (4 if double_sided else 0) | (8 if inverted_mask else 0)
        self.artmeshes.append(_Obj(id, part, parent, self._pidx(params), kf, 'artmesh',
                                   dict(texture=texture, uvs=uvs, indices=indices, masks=masks or [], flags=flags)))
        return len(self.artmeshes) - 1

    # ---- 조립 ----
    def _keyforms(self, obj: _Obj) -> list[dict]:
        # 첫 번째 바인딩 파라미터가 가장 빠르게 변한다(Core 로 확인, gen 자체검증 참고)
        axes = [self.params[i]['keys'] for i in obj.params]
        out = []
        for combo in itertools.product(*reversed(axes)):
            vals = {self.params[i]['id']: v for i, v in zip(obj.params, reversed(combo))}
            out.append(obj.kf(vals))
        return out

    def build(self) -> Moc3:
        m = Moc3(version=V3_00)
        S: dict[str, list] = {name: [] for name, _, _, _ in layout_for(V3_00)}
        m.sections = S
        m.canvas = dict(pixelsPerUnit=self.ppu, originX=self.origin[0], originY=self.origin[1],
                        canvasWidth=self.width, canvasHeight=self.height, flags=0)

        # 파라미터 → parameterBindings(파라미터당 1개) + keys
        for p in self.params:
            S['parameter.ids'].append(p['id'])
            S['parameter.maxValues'].append(p['hi']); S['parameter.minValues'].append(p['lo'])
            S['parameter.defaultValues'].append(p['default'])
            S['parameter.isRepeat'].append(1 if p['repeat'] else 0)
            S['parameter.decimalPlaces'].append(p['decimals'])
            S['parameter.parameterBindingSourcesBeginIndices'].append(len(S['parameterBinding.keysSourcesBeginIndices']))
            S['parameter.parameterBindingSourcesCounts'].append(1)
            S['parameterBinding.keysSourcesBeginIndices'].append(len(S['key.values']))
            S['parameterBinding.keysSourcesCounts'].append(len(p['keys']))
            S['key.values'] += p['keys']

        # keyformBindings: [0] 은 바인딩 0개(고정 객체), 이후 파라미터 조합별로 공유
        S['keyformBinding.parameterBindingIndexSourcesBeginIndices'].append(0)
        S['keyformBinding.parameterBindingIndexSourcesCounts'].append(0)
        kb_cache: dict[tuple, int] = {(): 0}

        def binding(params: list[int]) -> int:
            key = tuple(params)
            if key not in kb_cache:
                S['keyformBinding.parameterBindingIndexSourcesBeginIndices'].append(len(S['parameterBindingIndices.bindingSourcesIndices']))
                S['keyformBinding.parameterBindingIndexSourcesCounts'].append(len(params))
                S['parameterBindingIndices.bindingSourcesIndices'] += params
                kb_cache[key] = len(kb_cache)
            return kb_cache[key]

        positions = S['keyformPosition.xys']

        def push_positions(pts: list[tuple[float, float]], n: int) -> int:
            assert len(pts) == n, f'정점 {n}개가 필요한데 {len(pts)}개'
            begin = len(positions)
            for x, y in pts:
                positions.append(float(x)); positions.append(float(y))
            while len(positions) % BLOCK:
                positions.append(0.0)
            return begin

        for i, (pid, parent, order) in enumerate(self.parts):
            S['part.ids'].append(pid)
            S['part.keyformBindingSourcesIndices'].append(0)
            S['part.keyformSourcesBeginIndices'].append(i)
            S['part.keyformSourcesCounts'].append(1)
            S['part.isVisible'].append(1); S['part.isEnabled'].append(1)
            S['part.parentPartIndices'].append(parent)
            S['partKeyform.drawOrders'].append(float(order))

        for d in self.deformers:
            S['deformer.ids'].append(d.id)
            S['deformer.keyformBindingSourcesIndices'].append(binding(d.params))
            S['deformer.isVisible'].append(1); S['deformer.isEnabled'].append(1)
            S['deformer.parentPartIndices'].append(d.part)
            S['deformer.parentDeformerIndices'].append(d.parent)
            kfs = self._keyforms(d)
            if d.kind == 'warp':
                rows, cols = d.extra['rows'], d.extra['cols']
                vc = (rows + 1) * (cols + 1)
                S['deformer.types'].append(WARP)
                S['deformer.specificSourcesIndices'].append(len(S['warpDeformer.rows']))
                S['warpDeformer.keyformBindingSourcesIndices'].append(binding(d.params))
                S['warpDeformer.keyformSourcesBeginIndices'].append(len(S['warpDeformerKeyform.opacities']))
                S['warpDeformer.keyformSourcesCounts'].append(len(kfs))
                S['warpDeformer.vertexCounts'].append(vc)
                S['warpDeformer.rows'].append(rows); S['warpDeformer.columns'].append(cols)
                for k in kfs:
                    S['warpDeformerKeyform.opacities'].append(float(k.get('opacity', 1.0)))
                    S['warpDeformerKeyform.keyformPositionSourcesBeginIndices'].append(push_positions(k['positions'], vc))
            else:
                S['deformer.types'].append(ROTATION)
                S['deformer.specificSourcesIndices'].append(len(S['rotationDeformer.baseAngles']))
                S['rotationDeformer.keyformBindingSourcesIndices'].append(binding(d.params))
                S['rotationDeformer.keyformSourcesBeginIndices'].append(len(S['rotationDeformerKeyform.angles']))
                S['rotationDeformer.keyformSourcesCounts'].append(len(kfs))
                S['rotationDeformer.baseAngles'].append(float(d.extra['base']))
                for k in kfs:
                    ox, oy = k['origin']
                    S['rotationDeformerKeyform.opacities'].append(float(k.get('opacity', 1.0)))
                    S['rotationDeformerKeyform.angles'].append(float(k['angle']))
                    S['rotationDeformerKeyform.originX'].append(float(ox))
                    S['rotationDeformerKeyform.originY'].append(float(oy))
                    S['rotationDeformerKeyform.scales'].append(float(k.get('scale', 1.0)))
                    S['rotationDeformerKeyform.isReflectX'].append(int(k.get('reflectX', 0)))
                    S['rotationDeformerKeyform.isReflectY'].append(int(k.get('reflectY', 0)))

        for a in self.artmeshes:
            x = a.extra
            vc = len(x['uvs'])
            S['artMesh.ids'].append(a.id)
            S['artMesh.keyformBindingSourcesIndices'].append(binding(a.params))
            S['artMesh.keyformSourcesBeginIndices'].append(len(S['artMeshKeyform.opacities']))
            kfs = self._keyforms(a)
            S['artMesh.keyformSourcesCounts'].append(len(kfs))
            S['artMesh.isVisible'].append(1); S['artMesh.isEnabled'].append(1)
            S['artMesh.parentPartIndices'].append(a.part)
            S['artMesh.parentDeformerIndices'].append(a.parent)
            S['artMesh.textureNos'].append(x['texture'])
            S['artMesh.drawableFlags'].append(x['flags'])
            S['artMesh.vertexCounts'].append(vc)
            S['artMesh.uvSourcesBeginIndices'].append(len(S['uv.uvs']))
            for u, v in x['uvs']:
                S['uv.uvs'] += [float(u), float(v)]
            S['artMesh.positionIndexSourcesBeginIndices'].append(len(S['positionIndices.indices']))
            S['artMesh.positionIndexSourcesCounts'].append(len(x['indices']))
            S['positionIndices.indices'] += x['indices']
            S['artMesh.drawableMaskSourcesBeginIndices'].append(len(S['drawableMask.artMeshSourcesIndices']))
            S['artMesh.drawableMaskSourcesCounts'].append(len(x['masks']))
            S['drawableMask.artMeshSourcesIndices'] += x['masks']
            for k in kfs:
                S['artMeshKeyform.opacities'].append(float(k.get('opacity', 1.0)))
                S['artMeshKeyform.drawOrders'].append(float(k.get('drawOrder', 500.0)))
                S['artMeshKeyform.keyformPositionSourcesBeginIndices'].append(push_positions(k['positions'], vc))

        n = len(self.artmeshes)
        orders = S['artMeshKeyform.drawOrders'] + S['partKeyform.drawOrders'] or [500.0]
        S['drawOrderGroup.objectSourcesBeginIndices'].append(0)
        S['drawOrderGroup.objectSourcesCounts'].append(n)
        S['drawOrderGroup.objectSourcesTotalCounts'].append(n)
        S['drawOrderGroup.maximumDrawOrders'].append(int(max(orders)) + 500)
        S['drawOrderGroup.minimumDrawOrders'].append(max(0, int(min(orders)) - 500))
        S['drawOrderGroupObject.types'] += [0] * n
        S['drawOrderGroupObject.indices'] += list(range(n))
        S['drawOrderGroupObject.selfIndices'] += [-1] * n

        sizes = {
            'parts': len(self.parts), 'deformers': len(self.deformers),
            'warpDeformers': len(S['warpDeformer.rows']), 'rotationDeformers': len(S['rotationDeformer.baseAngles']),
            'artMeshes': n, 'parameters': len(self.params), 'partKeyforms': len(self.parts),
            'warpDeformerKeyforms': len(S['warpDeformerKeyform.opacities']),
            'rotationDeformerKeyforms': len(S['rotationDeformerKeyform.angles']),
            'artMeshKeyforms': len(S['artMeshKeyform.opacities']), 'keyformPositions': len(positions),
            'parameterBindingIndices': len(S['parameterBindingIndices.bindingSourcesIndices']),
            'keyformBindings': len(S['keyformBinding.parameterBindingIndexSourcesCounts']),
            'parameterBindings': len(self.params), 'keys': len(S['key.values']), 'uvs': len(S['uv.uvs']),
            'positionIndices': len(S['positionIndices.indices']),
            'drawableMasks': len(S['drawableMask.artMeshSourcesIndices']),
            'drawOrderGroups': 1, 'drawOrderGroupObjects': n, 'glue': 0, 'glueInfo': 0, 'glueKeyforms': 0,
        }
        m.counts = {k: sizes.get(k, 0) for k in COUNT_NAMES[:23]}
        return m


# ---- 기하 도형 검증 모델 ----
QUAD_IDX = [0, 1, 2, 0, 2, 3]
QUAD_UV = [(0, 0), (1, 0), (1, 1), (0, 1)]


def quad(cx, cy, hw, hh):
    return [(cx - hw, cy - hh), (cx + hw, cy - hh), (cx + hw, cy + hh), (cx - hw, cy + hh)]


def demo() -> Builder:
    """파라미터 → 드로어블 반응을 Core 로 확인하기 위한 모델. 각 파라미터가 서로 다른 드로어블을 움직인다."""
    b = Builder(1000, 1000)
    body = b.part('PartBody')
    b.param('ParamMoveX', -1, 1, 0)                     # 루트 워프 격자를 좌우로
    b.param('ParamAngle', -30, 30, 0, keys=[-30, 0, 30])  # 회전 디포머 각도
    b.param('ParamOpacity', 0, 1, 1)                   # 아트메시 불투명도
    b.param('ParamMeshY', -1, 1, 0)                    # 루트 아트메시 정점 직접 이동
    b.param('ParamMix', 0, 1, 0)                       # 2-파라미터 키폼 순서 확인용

    def grid(v):  # 2×2 격자(정점 9개) 를 캔버스 전체에, ParamMoveX 로 0.2 만큼 이동
        dx = 0.2 * v['ParamMoveX']
        return dict(positions=[(x * 0.5 + dx, y * 0.5) for y in (-1, 0, 1) for x in (-1, 0, 1)])
    root = b.warp('WarpRoot', body, -1, 2, 2, ['ParamMoveX'], grid)

    # 워프 자식: 격자 로컬 0..1. 중앙 0.5,0.5 주변 0.1 크기 → 모델 공간 ±0.1
    b.artmesh('MeshCenter', body, root, 0, QUAD_UV, QUAD_IDX, ['ParamOpacity'],
              lambda v: dict(positions=quad(0.5, 0.5, 0.1, 0.1), opacity=v['ParamOpacity']))

    rot = b.rotation('RotArm', body, root, ['ParamAngle'],
                     lambda v: dict(angle=v['ParamAngle'], origin=(0.5, 0.5), scale=0.001))
    # 회전 자식: 로컬 단위 × scale(0.001) = 격자 로컬. 원점에서 오른쪽으로 200 → 격자 0.2 → 모델 0.2
    b.artmesh('MeshArm', body, rot, 0, QUAD_UV, QUAD_IDX, [],
              lambda v: dict(positions=quad(200, 0, 50, 20)))

    # 중첩: 워프 안의 워프(격자 로컬 0..1), 회전 안의 회전(scale 1 → 같은 로컬 단위)
    b.param('ParamHeadY', -1, 1, 0)
    head = b.warp('WarpHead', body, root, 1, 1, ['ParamHeadY'],
                  lambda v: dict(positions=[(x, y + 0.1 * v['ParamHeadY']) for y in (0.6, 0.9) for x in (0.3, 0.7)]))
    b.artmesh('MeshHead', body, head, 0, QUAD_UV, QUAD_IDX, [], lambda v: dict(positions=quad(0.5, 0.5, 0.1, 0.1)))
    b.param('ParamHand', -30, 30, 0)
    hand = b.rotation('RotHand', body, rot, ['ParamHand'], lambda v: dict(angle=v['ParamHand'], origin=(300, 0)))
    b.artmesh('MeshHand', body, hand, 0, QUAD_UV, QUAD_IDX, [], lambda v: dict(positions=quad(50, 0, 20, 20)))

    # 루트 아트메시: 모델 공간 직접. ParamMeshY 로 y 이동, ParamMix 로 x 이동(2-파라미터 조합)
    b.artmesh('MeshFree', body, -1, 0, QUAD_UV, QUAD_IDX, ['ParamMeshY', 'ParamMix'],
              lambda v: dict(positions=quad(-0.3 + 0.1 * v['ParamMix'], 0.3 * v['ParamMeshY'], 0.05, 0.05)))
    return b


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'demo':
        demo().build().save(sys.argv[2])
        print('wrote', sys.argv[2])
    else:
        print(__doc__)
        sys.exit(2)
