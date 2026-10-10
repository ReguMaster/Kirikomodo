"""레이어 PNG + layer-plan → 그룹 구조를 가진 PSD(RGB 8bit, 비압축). 외부 PSD 라이브러리 없이 작성한다.

    python tools/live2d-authoring/assemble_psd.py --manifest <layer-plan.json> \
        [--layers <dir>] [--out <dir>/character_layers.psd] [--allow-draft]

EXPERIMENTAL: Photoshop 없이 만든 PSD이므로 Cubism Editor 임포트 결과는 사람이 확인해야 한다(명세 15.4).
그룹 순서는 그룹 내 최대 z 기준(그룹끼리 교차 불가), 그룹 안 레이어는 z 오름차순. Guide 레이어는 숨김으로 둔다.
"""
from __future__ import annotations

import argparse
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

from common import (DEFAULT_LAYERS, DEFAULT_OUTPUT, DEFAULT_PLAN, fail, is_export_excluded, layers_sorted,
                    load_plan, now_iso, resolve_layer_file, write_json)

CHANNEL_IDS = (-1, 0, 1, 2)  # A, R, G, B
HIDDEN = 0x02


def _pascal(name: str) -> bytes:
    raw = name.encode("latin-1", "replace")[:255]
    data = bytes([len(raw)]) + raw
    return data + b"\0" * (-len(data) % 4)


def _extra(name: str, section: int | None) -> bytes:
    """mask(0) + blend ranges(0) + pascal name + luni + (lsct)"""
    uni = name.encode("utf-16-be")
    luni = struct.pack(">I", len(name)) + uni + (b"\0\0" if len(uni) % 4 else b"")
    out = struct.pack(">II", 0, 0) + _pascal(name) + b"8BIMluni" + struct.pack(">I", len(luni)) + luni
    if section is not None:
        out += b"8BIMlsct" + struct.pack(">I", 4) + struct.pack(">I", section)
    return out


class _Entry:
    """PSD에 쓰일 레이어 하나. 파일 순서는 아래→위. 그룹은 divider(3) … children … folder(1)."""

    def __init__(self, name: str, image: Image.Image | None = None, section: int | None = None, hidden=False):
        self.name, self.section, self.hidden = name, section, hidden
        if image is None:
            self.bbox, self.channels = (0, 0, 0, 0), [b""] * 4
        else:
            bbox = image.getbbox() or (0, 0, 0, 0)
            crop = image.crop(bbox)
            r, g, b, a = (crop.getchannel(c).tobytes() for c in "RGBA")
            self.bbox, self.channels = bbox, [a, r, g, b]
        self.extra = _extra(name, section)

    def record_size(self) -> int:
        return 16 + 2 + 6 * 4 + 12 + 4 + len(self.extra)


def _tree(plan: dict, found: dict[str, Path]) -> list[_Entry]:
    """groups 'AA_Top/Sub' → 중첩 폴더. 비어 있는 그룹은 생략."""
    canvas = (plan["canvas"]["width"], plan["canvas"]["height"])
    by_group: dict[str, list[dict]] = {}
    for layer in layers_sorted(plan):
        if layer["id"] in found:
            by_group.setdefault(layer["group"], []).append(layer)

    def max_z(prefix: str) -> int:
        return max(l["z"] for g, ls in by_group.items() if g == prefix or g.startswith(prefix + "/") for l in ls)

    def leaf_entries(group: str) -> list[_Entry]:
        out = []
        for layer in by_group.get(group, []):
            path = found[layer["id"]]
            im = Image.open(path).convert("RGBA")
            if im.size != canvas:
                im = im.resize(canvas)
            out.append(_Entry(path.stem, im, hidden=layer["id"].startswith(plan["naming"]["guidePrefix"])))
        return out

    def folder(name: str, children: list[_Entry]) -> list[_Entry]:
        return [_Entry("</Layer group>", section=3)] + children + [_Entry(name, section=1)]

    tops = sorted({g.split("/")[0] for g in by_group}, key=max_z)
    entries: list[_Entry] = []
    for top in tops:
        subs = sorted({g for g in by_group if g.startswith(top + "/")}, key=max_z)
        children = leaf_entries(top)
        for sub in subs:
            children += folder(sub.split("/", 1)[1], leaf_entries(sub))
        entries += folder(top, children)
    return folder(plan["model"]["name"], entries)


def write_psd(entries: list[_Entry], merged: Image.Image, out: Path) -> int:
    w, h = merged.size
    header = b"8BPS" + struct.pack(">H6xHIIHH", 1, 4, h, w, 8, 3)
    layer_info_start = len(header) + 4 + 4 + 4 + 4  # colormode len, resources len, L&M len, layer info len
    records_size = 2 + sum(e.record_size() for e in entries)
    pos = layer_info_start + records_size
    channel_blobs, records = BytesIO(), BytesIO()
    records.write(struct.pack(">h", -len(entries)))  # 음수: 병합 이미지 첫 알파 채널 = 투명도
    for e in entries:
        lengths = []
        for data in e.channels:
            blob = struct.pack(">H", 0) + data
            if (pos + len(blob)) & 1:
                blob += b"\0"  # Pillow 리더가 홀수 오프셋을 패딩으로 해석하므로 짝수 정렬
            channel_blobs.write(blob)
            pos += len(blob)
            lengths.append(len(blob))
        x0, y0, x1, y1 = e.bbox
        records.write(struct.pack(">iiii", y0, x0, y1, x1))
        records.write(struct.pack(">H", 4))
        for cid, ln in zip(CHANNEL_IDS, lengths):
            records.write(struct.pack(">hI", cid, ln))
        records.write(b"8BIMnorm" + struct.pack(">BBBB", 255, 0, HIDDEN if e.hidden else 0, 0))
        records.write(struct.pack(">I", len(e.extra)) + e.extra)
    layer_info = records.getvalue() + channel_blobs.getvalue()
    if len(layer_info) & 1:
        layer_info += b"\0"
    layer_mask = struct.pack(">I", len(layer_info)) + layer_info + struct.pack(">I", 0)
    merged_data = struct.pack(">H", 0) + b"".join(merged.getchannel(c).tobytes() for c in "RGBA")
    blob = header + struct.pack(">I", 0) + struct.pack(">I", 0) + struct.pack(">I", len(layer_mask)) + layer_mask + merged_data
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(blob)
    return len(blob)


def verify_psd(path: Path, expected_names: list[str]) -> list[str]:
    """Pillow로 다시 읽어 레이어 이름·순서·크기를 확인한다."""
    problems = []
    with Image.open(path) as im:
        if im.format != "PSD":
            problems.append(f"PSD로 인식되지 않음: {im.format}")
        names = [l[0] for l in im.layers]
        if names != expected_names:
            problems.append(f"레이어 이름/순서 불일치 ({len(names)} vs {len(expected_names)})")
        im.load()
    return problems


def assemble(plan: dict, layers_dir: Path, out: Path, allow_draft: bool = False) -> dict:
    found = {}
    for layer in plan["layers"]:
        p = resolve_layer_file(layers_dir, layer["id"])
        if p and (p.stem == layer["id"] or allow_draft):
            found[layer["id"]] = p
    report = {"generatedAt": now_iso(), "experimental": True, "writer": "tools/live2d-authoring/assemble_psd.py (pure Python)",
              "layersDir": str(layers_dir), "layers": len(found), "notes": []}
    if not found:
        report["status"] = "BLOCKED_INPUT"
        return report
    entries = _tree(plan, found)
    from export_previews import composite
    merged = composite(plan, [(l, found[l["id"]]) for l in layers_sorted(plan) if l["id"] in found])
    size = write_psd(entries, merged, out)
    problems = verify_psd(out, [e.name for e in entries])
    report.update({"file": str(out), "bytes": size, "groups": sum(1 for e in entries if e.section == 1),
                   "verify": problems, "canvas": [merged.width, merged.height]})
    drafts = [lid for lid, p in found.items() if p.stem != lid]
    if drafts:
        report["notes"].append(f"초안(_REF) {len(drafts)}장 포함: 임포트용이 아닌 검수용")
    excluded = [lid for lid in found if is_export_excluded(plan, lid)]
    if excluded:
        report["notes"].append(f"제외 접미사 레이어 {len(excluded)}장 포함(Cubism 임포트 전 삭제 필요)")
    report["notes"].append("그룹 순서는 그룹 내 최대 z 기준이므로 Cubism에서 드로우 오더 재확인 필요")
    report["status"] = "FAILED" if problems else ("NEEDS_MANUAL_QA" if drafts or excluded else "READY")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--layers", type=Path, default=DEFAULT_LAYERS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest" / "character_layers.psd")
    ap.add_argument("--allow-draft", action="store_true")
    args = ap.parse_args()
    report = assemble(load_plan(args.manifest), args.layers, args.out, args.allow_draft)
    write_json(args.out.with_name("psd-assembly.json"), report)
    if report["status"] == "BLOCKED_INPUT":
        fail(f"레이어 없음: {args.layers} (BLOCKED_INPUT)")
    print(f"[{report['status']}] EXPERIMENTAL PSD {report['layers']} layers / {report['groups']} groups, "
          f"{report['bytes']:,} bytes → {args.out}")
    for n in report["notes"] + report["verify"]:
        print("  -", n)


if __name__ == "__main__":
    main()
