"""moc3 헤더·섹션 오프셋 표·개수 표를 출력한다. 포맷 해독용 출발점.

사용: python tools/moc3/dump-header.py <file.moc3>

확인된 사실(Haru 샘플, moc3 version 1, little-endian, Core 4.2.2 와 교차 검증):
- 0x00 'MOC3', 0x04 version(u8), 0x05 big-endian 플래그(u8), 0x06~0x3F 0 패딩.
- 0x40 부터 u32 섹션 오프셋 표가 단조 증가로 이어진다(Haru 101 항목). 첫 항목이 개수 표 위치(0x7C0).
- 개수 표(u32 배열): [0]=parts, [4]=art meshes, [5]=parameters 는 Core 값과 일치. 나머지 칸의 의미는 미확정.
- 개수 표 시작 +0x80 부터 f32 5개 = pixelsPerUnit, originX, originY, canvasWidth, canvasHeight (Core canvasinfo 와 일치).
"""
import struct
import sys

CANVAS_FIELDS = ('pixelsPerUnit', 'originX', 'originY', 'canvasWidth', 'canvasHeight')


def main(path: str) -> None:
    data = open(path, 'rb').read()
    if data[:4] != b'MOC3':
        sys.exit('MOC3 서명이 아니에요')
    big = data[5] == 1
    endian = '>' if big else '<'
    u32 = lambda off: struct.unpack_from(endian + 'I', data, off)[0]
    print(f'size {len(data)}  version {data[4]}  bigEndian {big}')

    offsets, prev = [], 0
    while 0x40 + 4 * len(offsets) + 4 <= len(data):
        v = u32(0x40 + 4 * len(offsets))
        if v < prev or v > len(data):
            break
        offsets.append(v)
        prev = v
    print(f'section offsets: {len(offsets)} entries (table ends at {hex(0x40 + 4 * len(offsets))})')
    for i, off in enumerate(offsets):
        end = offsets[i + 1] if i + 1 < len(offsets) else len(data)
        print(f'  [{i:3}] @{hex(off):>8}  size {end - off}')

    count_at = offsets[0]
    counts = [u32(count_at + 4 * i) for i in range(20)]
    print(f'count info @{hex(count_at)} u32[0..19] = {counts}')
    canvas = struct.unpack_from(endian + '5f', data, count_at + 0x80)
    print('canvas', dict(zip(CANVAS_FIELDS, canvas)))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
