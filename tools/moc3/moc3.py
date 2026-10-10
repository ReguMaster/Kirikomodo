"""moc3 파서·writer (stdlib 만 사용).

섹션 레이아웃은 OpenL2D `moc3.hexpat`(MOC3 Format Specification 2.1b, FDPL-1.0-US) 을 따르고
Haru 샘플 + Cubism Core 4.2.2 로 교차 검증했다. 구조 설명은 docs/moc3-format.md.

사용:
  python tools/moc3/moc3.py dump <in.moc3>                 섹션 표·개수 표 출력
  python tools/moc3/moc3.py roundtrip <in.moc3> <out.moc3>  파싱 → 재기록, 바이트 동일 여부 출력
  python tools/moc3/moc3.py json <in.moc3>                  섹션 전체를 JSON 으로(Core 교차검증용)
"""
from __future__ import annotations

import json
import struct
import sys
from dataclasses import dataclass, field

MAGIC = b'MOC3'
HEADER_SIZE = 0x40
SOT_ENTRIES = 160          # u32 × 160 = 0x280, 0x40~0x2C0
BODY_START = 0x7C0         # 0x2C0~0x740 런타임 주소 맵(로드 시 덮어씀), ~0x7C0 패딩
ALIGN = 64
V3_00, V3_03, V4_00, V4_02, V5_00 = 1, 2, 3, 4, 5

# 개수 표 칸 이름 (순서 = hexpat CountInfoTable)
COUNT_NAMES = [
    'parts', 'deformers', 'warpDeformers', 'rotationDeformers', 'artMeshes', 'parameters',
    'partKeyforms', 'warpDeformerKeyforms', 'rotationDeformerKeyforms', 'artMeshKeyforms',
    'keyformPositions', 'parameterBindingIndices', 'keyformBindings', 'parameterBindings', 'keys',
    'uvs', 'positionIndices', 'drawableMasks', 'drawOrderGroups', 'drawOrderGroupObjects',
    'glue', 'glueInfo', 'glueKeyforms',
    # V4_02+
    'keyformMultiplyColors', 'keyformScreenColors', 'blendShapeParameterBindings',
    'blendShapeKeyformBindings', 'blendShapesWarpDeformers', 'blendShapesArtMeshes',
    'blendShapeConstraintIndices', 'blendShapeConstraints', 'blendShapeConstraintValues',
    # V5_00+
    'blendShapesParts', 'blendShapesRotationDeformers', 'blendShapesGlue',
]
COUNT_SLOTS = {V3_00: 23, V3_03: 23, V4_00: 23, V4_02: 32, V5_00: 35}
COUNT_TABLE_SIZE = {V3_00: 128, V3_03: 128, V4_00: 128, V4_02: 128, V5_00: 256}

# (섹션 이름, 원소 타입, 개수 칸, 도입 버전). 타입: i32 f32 u32 i16 u8 id(64바이트 문자열) rt(런타임 8바이트/원소)
# 순서가 곧 섹션 오프셋 표 순서다 (표 [0]=개수 표, [1]=캔버스, [2]부터 아래 순서).
def _layout() -> list[tuple[str, str, str, int]]:
    L: list[tuple[str, str, str, int]] = []
    def add(prefix, count, fields, since=V3_00):
        for name, typ in fields:
            L.append((f'{prefix}.{name}', typ, count, since))
    add('part', 'parts', [('runtimeSpace0', 'rt'), ('ids', 'id'), ('keyformBindingSourcesIndices', 'i32'),
        ('keyformSourcesBeginIndices', 'i32'), ('keyformSourcesCounts', 'i32'), ('isVisible', 'u32'),
        ('isEnabled', 'u32'), ('parentPartIndices', 'i32')])
    add('deformer', 'deformers', [('runtimeSpace0', 'rt'), ('ids', 'id'), ('keyformBindingSourcesIndices', 'i32'),
        ('isVisible', 'u32'), ('isEnabled', 'u32'), ('parentPartIndices', 'i32'), ('parentDeformerIndices', 'i32'),
        ('types', 'u32'), ('specificSourcesIndices', 'i32')])
    add('warpDeformer', 'warpDeformers', [('keyformBindingSourcesIndices', 'i32'), ('keyformSourcesBeginIndices', 'i32'),
        ('keyformSourcesCounts', 'i32'), ('vertexCounts', 'i32'), ('rows', 'u32'), ('columns', 'u32')])
    add('rotationDeformer', 'rotationDeformers', [('keyformBindingSourcesIndices', 'i32'),
        ('keyformSourcesBeginIndices', 'i32'), ('keyformSourcesCounts', 'i32'), ('baseAngles', 'f32')])
    add('artMesh', 'artMeshes', [('runtimeSpace0', 'rt'), ('runtimeSpace1', 'rt'), ('runtimeSpace2', 'rt'),
        ('runtimeSpace3', 'rt'), ('ids', 'id'), ('keyformBindingSourcesIndices', 'i32'),
        ('keyformSourcesBeginIndices', 'i32'), ('keyformSourcesCounts', 'i32'), ('isVisible', 'u32'),
        ('isEnabled', 'u32'), ('parentPartIndices', 'i32'), ('parentDeformerIndices', 'i32'), ('textureNos', 'u32'),
        ('drawableFlags', 'u8'), ('vertexCounts', 'i32'), ('uvSourcesBeginIndices', 'i32'),
        ('positionIndexSourcesBeginIndices', 'i32'), ('positionIndexSourcesCounts', 'i32'),
        ('drawableMaskSourcesBeginIndices', 'i32'), ('drawableMaskSourcesCounts', 'i32')])
    add('parameter', 'parameters', [('runtimeSpace0', 'rt'), ('ids', 'id'), ('maxValues', 'f32'), ('minValues', 'f32'),
        ('defaultValues', 'f32'), ('isRepeat', 'u32'), ('decimalPlaces', 'u32'),
        ('parameterBindingSourcesBeginIndices', 'i32'), ('parameterBindingSourcesCounts', 'i32')])
    add('partKeyform', 'partKeyforms', [('drawOrders', 'f32')])
    add('warpDeformerKeyform', 'warpDeformerKeyforms', [('opacities', 'f32'), ('keyformPositionSourcesBeginIndices', 'i32')])
    add('rotationDeformerKeyform', 'rotationDeformerKeyforms', [('opacities', 'f32'), ('angles', 'f32'), ('originX', 'f32'),
        ('originY', 'f32'), ('scales', 'f32'), ('isReflectX', 'u32'), ('isReflectY', 'u32')])
    add('artMeshKeyform', 'artMeshKeyforms', [('opacities', 'f32'), ('drawOrders', 'f32'),
        ('keyformPositionSourcesBeginIndices', 'i32')])
    add('keyformPosition', 'keyformPositions', [('xys', 'f32')])
    add('parameterBindingIndices', 'parameterBindingIndices', [('bindingSourcesIndices', 'i32')])
    add('keyformBinding', 'keyformBindings', [('parameterBindingIndexSourcesBeginIndices', 'i32'),
        ('parameterBindingIndexSourcesCounts', 'i32')])
    add('parameterBinding', 'parameterBindings', [('keysSourcesBeginIndices', 'i32'), ('keysSourcesCounts', 'i32')])
    add('key', 'keys', [('values', 'f32')])
    add('uv', 'uvs', [('uvs', 'f32')])
    add('positionIndices', 'positionIndices', [('indices', 'i16')])
    add('drawableMask', 'drawableMasks', [('artMeshSourcesIndices', 'i32')])
    add('drawOrderGroup', 'drawOrderGroups', [('objectSourcesBeginIndices', 'i32'), ('objectSourcesCounts', 'i32'),
        ('objectSourcesTotalCounts', 'i32'), ('maximumDrawOrders', 'u32'), ('minimumDrawOrders', 'u32')])
    add('drawOrderGroupObject', 'drawOrderGroupObjects', [('types', 'u32'), ('indices', 'i32'), ('selfIndices', 'i32')])
    add('glue', 'glue', [('runtimeSpace0', 'rt'), ('ids', 'id'), ('keyformBindingSourcesIndices', 'i32'),
        ('keyformSourcesBeginIndices', 'i32'), ('keyformSourcesCounts', 'i32'), ('artMeshIndicesA', 'i32'),
        ('artMeshIndicesB', 'i32'), ('glueInfoSourcesBeginIndices', 'i32'), ('glueInfoSourcesCounts', 'i32')])
    add('glueInfo', 'glueInfo', [('weights', 'f32'), ('positionIndices', 'i16')])
    add('glueKeyform', 'glueKeyforms', [('intensities', 'f32')])
    add('warpDeformerV3_3', 'warpDeformers', [('isQuadSource', 'u32')], V3_03)
    add('parameterExtension', 'parameters', [('runtimeSpace0', 'rt'), ('keysSourcesBeginIndices', 'i32'),
        ('keysSourcesCounts', 'i32')], V4_02)
    add('warpDeformerV4_2', 'warpDeformers', [('keyformColorSourcesBeginIndices', 'i32')], V4_02)
    add('rotationDeformerV4_2', 'rotationDeformers', [('keyformColorSourcesBeginIndices', 'i32')], V4_02)
    add('artMeshV4_2', 'artMeshes', [('keyformColorSourcesBeginIndices', 'i32')], V4_02)
    add('keyformMultiplyColor', 'keyformMultiplyColors', [('R', 'f32'), ('G', 'f32'), ('B', 'f32')], V4_02)
    add('keyformScreenColor', 'keyformScreenColors', [('R', 'f32'), ('G', 'f32'), ('B', 'f32')], V4_02)
    add('parameterV4_2', 'parameters', [('parameterTypes', 'u32'), ('blendShapeParameterBindingSourcesBeginIndices', 'i32'),
        ('blendShapeParameterBindingSourcesCounts', 'i32')], V4_02)
    add('blendShapeParameterBinding', 'blendShapeParameterBindings', [('keysSourcesBeginIndices', 'i32'),
        ('keysSourcesCounts', 'i32'), ('baseKeyIndices', 'i32')], V4_02)
    add('blendShapeKeyformBinding', 'blendShapeKeyformBindings', [('parameterBindingSourcesIndices', 'i32'),
        ('keyformSourcesBlendShapeIndices', 'i32'), ('keyformSourcesBlendShapeCounts', 'i32'),
        ('blendShapeConstraintIndexSourcesBeginIndices', 'i32'), ('blendShapeConstraintIndexSourcesCounts', 'i32')], V4_02)
    bs = [('targetIndices', 'i32'), ('blendShapeKeyformBindingSourcesBeginIndices', 'i32'),
          ('blendShapeKeyformBindingSourcesCounts', 'i32')]
    add('blendShapesWarpDeformer', 'blendShapesWarpDeformers', bs, V4_02)
    add('blendShapesArtMesh', 'blendShapesArtMeshes', bs, V4_02)
    add('blendShapeConstraintIndices', 'blendShapeConstraintIndices', [('blendShapeConstraintSourcesIndices', 'i32')], V4_02)
    add('blendShapeConstraint', 'blendShapeConstraints', [('parameterIndices', 'i32'),
        ('blendShapeConstraintValueSourcesBeginIndices', 'i32'), ('blendShapeConstraintValueSourcesCounts', 'i32')], V4_02)
    add('blendShapeConstraintValue', 'blendShapeConstraintValues', [('keys', 'f32'), ('weights', 'f32')], V4_02)
    colors = [('keyformMultiplyColorSourcesBeginIndices', 'i32'), ('keyformScreenColorSourcesBeginIndices', 'i32')]
    add('warpDeformerKeyformV5_0', 'warpDeformerKeyforms', colors, V5_00)
    add('rotationDeformerKeyformV5_0', 'rotationDeformerKeyforms', colors, V5_00)
    add('artMeshKeyformV5_0', 'artMeshKeyforms', colors, V5_00)
    add('blendShapesPart', 'blendShapesParts', bs, V5_00)
    add('blendShapesRotationDeformer', 'blendShapesRotationDeformers', bs, V5_00)
    add('blendShapesGlue', 'blendShapesGlue', bs, V5_00)
    return L

LAYOUT = _layout()
FMT = {'i32': 'i', 'u32': 'I', 'f32': 'f', 'i16': 'h', 'u8': 'B'}
SIZE = {'i32': 4, 'u32': 4, 'f32': 4, 'i16': 2, 'u8': 1, 'id': 64, 'rt': 8}


def layout_for(version: int) -> list[tuple[str, str, str, int]]:
    return [e for e in LAYOUT if e[3] <= version]


@dataclass
class Moc3:
    version: int = V3_00
    big_endian: bool = False
    counts: dict[str, int] = field(default_factory=dict)
    canvas: dict[str, float] = field(default_factory=lambda: {
        'pixelsPerUnit': 1.0, 'originX': 0.0, 'originY': 0.0, 'canvasWidth': 1.0, 'canvasHeight': 1.0, 'flags': 0})
    sections: dict[str, list] = field(default_factory=dict)
    sot: list[int] = field(default_factory=list)   # 읽은 원본 오프셋 표 (쓰기엔 쓰지 않음)

    @property
    def e(self) -> str:
        return '>' if self.big_endian else '<'

    # ---- read ----
    @classmethod
    def parse(cls, data: bytes) -> 'Moc3':
        if data[:4] != MAGIC:
            raise ValueError('MOC3 서명이 아니에요')
        m = cls(version=data[4], big_endian=data[5] == 1)
        if m.version not in COUNT_SLOTS:
            raise ValueError(f'지원하지 않는 version {m.version}')
        e = m.e
        m.sot = list(struct.unpack_from(e + f'{SOT_ENTRIES}I', data, HEADER_SIZE))
        count_at, canvas_at = m.sot[0], m.sot[1]
        slots = COUNT_SLOTS[m.version]
        values = struct.unpack_from(e + f'{slots}I', data, count_at)
        m.counts = dict(zip(COUNT_NAMES[:slots], values))
        m.canvas = dict(zip(('pixelsPerUnit', 'originX', 'originY', 'canvasWidth', 'canvasHeight'),
                            struct.unpack_from(e + '5f', data, canvas_at)))
        m.canvas['flags'] = data[canvas_at + 20]
        for i, (name, typ, count_key, _) in enumerate(layout_for(m.version)):
            off = m.sot[2 + i]
            n = m.counts[count_key]
            if typ == 'rt':
                m.sections[name] = []       # 로드 시 Core 가 덮어쓰는 공간. 0 으로 재생성
            elif typ == 'id':
                m.sections[name] = [data[off + 64 * k: off + 64 * k + 64].split(b'\0', 1)[0].decode('utf-8')
                                    for k in range(n)]
            else:
                m.sections[name] = list(struct.unpack_from(e + f'{n}{FMT[typ]}', data, off))
        return m

    @classmethod
    def load(cls, path: str) -> 'Moc3':
        return cls.parse(open(path, 'rb').read())

    # ---- write ----
    def to_bytes(self) -> bytes:
        e = self.e
        slots = COUNT_SLOTS[self.version]
        body = bytearray()
        offsets: list[int] = []

        def pad64():
            while (BODY_START + len(body)) % ALIGN:
                body.append(0)

        offsets.append(BODY_START + len(body))
        counts = [self.counts.get(k, 0) for k in COUNT_NAMES[:slots]]
        body += struct.pack(e + f'{slots}I', *counts)
        body += bytes(COUNT_TABLE_SIZE[self.version] - 4 * slots)
        offsets.append(BODY_START + len(body))
        c = self.canvas
        body += struct.pack(e + '5f', c['pixelsPerUnit'], c['originX'], c['originY'], c['canvasWidth'], c['canvasHeight'])
        body += bytes([c.get('flags', 0)]) + bytes(43)
        for name, typ, count_key, _ in layout_for(self.version):
            n = self.counts.get(count_key, 0)
            if typ != 'id':
                pad64()
            offsets.append(BODY_START + len(body))
            if typ == 'rt':
                body += bytes(8 * n)
            elif typ == 'id':
                for s in self.sections.get(name, []):
                    raw = s.encode('utf-8')
                    if len(raw) >= 64:
                        raise ValueError(f'ID 가 64 바이트를 넘어요: {s}')
                    body += raw + bytes(64 - len(raw))
            else:
                vals = self.sections.get(name, [])
                if len(vals) != n:
                    raise ValueError(f'{name}: 원소 {len(vals)}개, 개수 표({count_key})는 {n}')
                body += struct.pack(e + f'{n}{FMT[typ]}', *vals)
        pad64()
        head = bytearray(MAGIC + bytes([self.version, 1 if self.big_endian else 0]) + bytes(HEADER_SIZE - 6))
        head += struct.pack(e + f'{SOT_ENTRIES}I', *(offsets + [0] * (SOT_ENTRIES - len(offsets))))
        head += bytes(BODY_START - len(head))
        return bytes(head + body)

    def save(self, path: str) -> None:
        open(path, 'wb').write(self.to_bytes())


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, src = argv[0], argv[1]
    m = Moc3.load(src)
    if cmd == 'dump':
        print(f'version {m.version}  bigEndian {m.big_endian}  canvas {m.canvas}')
        print('counts', m.counts)
        for i, (name, typ, key, _) in enumerate(layout_for(m.version)):
            print(f'  [{2 + i:3}] @{m.sot[2 + i]:#8x}  {name:60} {typ:4} × {m.counts[key]}')
    elif cmd == 'roundtrip':
        out = m.to_bytes()
        orig = open(src, 'rb').read()
        open(argv[2], 'wb').write(out)
        same = out == orig
        print(f'{"IDENTICAL" if same else "DIFFERENT"}  {len(orig)} → {len(out)} bytes')
        if not same:
            first = next((i for i in range(min(len(orig), len(out))) if orig[i] != out[i]), min(len(orig), len(out)))
            print(f'  첫 차이 @{first:#x}')
            return 1
    elif cmd == 'json':
        print(json.dumps({'version': m.version, 'counts': m.counts, 'canvas': m.canvas, 'sections': m.sections}))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
