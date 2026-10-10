"""레이어 합성(composite.png)과 파츠 판별용 콘택트 시트(contact-sheet.png) 생성.

    python tools/live2d-authoring/export_previews.py --manifest <layer-plan.json> \
        [--layers <dir>] [--out <dir>] [--allow-draft] [--reference <png>]

--reference 를 주면 원화 크롭과 합성 결과를 나란히 둔 compare.png 도 만든다(육안 비교용, 명세 15.4).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from common import (DEFAULT_LAYERS, DEFAULT_OUTPUT, DEFAULT_PLAN, fail, is_export_excluded, layers_sorted,
                    load_plan, resolve_layer_file)

CELL = 192
COLS = 8


def collect(plan: dict, layers_dir: Path, allow_draft: bool) -> list[tuple[dict, Path]]:
    found = []
    for layer in layers_sorted(plan):
        p = resolve_layer_file(layers_dir, layer["id"])
        if p and (p.stem == layer["id"] or allow_draft):
            found.append((layer, p))
    return found


def composite(plan: dict, found: list[tuple[dict, Path]]) -> Image.Image:
    c = plan["canvas"]
    out = Image.new("RGBA", (c["width"], c["height"]), (0, 0, 0, 0))
    for layer, path in found:
        if is_export_excluded(plan, layer["id"]):
            continue
        im = Image.open(path).convert("RGBA")
        if im.size != out.size:
            im = im.resize(out.size)  # 크기 불일치는 validate_layers가 별도 보고
        out.alpha_composite(im)
    return out


def contact_sheet(found: list[tuple[dict, Path]]) -> Image.Image:
    rows = max(1, -(-len(found) // COLS))
    sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + 20)), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    checker = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
    for cy in range(0, CELL, 16):
        for cx in range(0, CELL, 16):
            if (cx // 16 + cy // 16) % 2:
                checker.paste((225, 225, 225, 255), (cx, cy, cx + 16, cy + 16))
    for i, (layer, path) in enumerate(found):
        im = Image.open(path).convert("RGBA")
        bbox = im.getbbox()
        thumb = im.crop(bbox) if bbox else im
        thumb.thumbnail((CELL - 8, CELL - 8))
        x, y = (i % COLS) * CELL, (i // COLS) * (CELL + 20)
        cell = checker.copy()
        cell.alpha_composite(thumb, ((CELL - thumb.width) // 2, (CELL - thumb.height) // 2))
        sheet.paste(cell.convert("RGB"), (x, y))
        draw.text((x + 4, y + CELL + 3), f"{layer['z']:>3} {path.stem}"[:30], fill=(40, 40, 40))
    return sheet


def export(plan: dict, layers_dir: Path, out: Path, allow_draft: bool = False,
           reference: Path | None = None) -> dict:
    found = collect(plan, layers_dir, allow_draft)
    if not found:
        return {"status": "BLOCKED_INPUT", "layers": 0, "files": []}
    out.mkdir(parents=True, exist_ok=True)
    comp = composite(plan, found)
    comp.save(out / "composite.png")
    contact_sheet(found).save(out / "contact-sheet.png")
    result = {"status": "NEEDS_MANUAL_QA" if any(p.stem != l["id"] for l, p in found) else "READY",
              "layers": len(found), "files": ["composite.png", "contact-sheet.png"]}
    if reference and reference.is_file() and plan.get("reference", {}).get("upperBodyCrop"):
        from prepare_artwork import crop_to_canvas
        ref, _ = crop_to_canvas(Image.open(reference).convert("RGBA"),
                                plan["reference"]["upperBodyCrop"], plan["canvas"])
        cmp_img = Image.new("RGBA", (comp.width * 2 + 16, comp.height), (255, 255, 255, 255))
        cmp_img.alpha_composite(ref, (0, 0))
        cmp_img.alpha_composite(comp, (comp.width + 16, 0))
        cmp_img.save(out / "compare.png")
        result["files"].append("compare.png")
        result["status"] = "NEEDS_MANUAL_QA"
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--layers", type=Path, default=DEFAULT_LAYERS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest")
    ap.add_argument("--allow-draft", action="store_true")
    ap.add_argument("--reference", type=Path, help="원화 PNG(비교 이미지 생성)")
    args = ap.parse_args()
    result = export(load_plan(args.manifest), args.layers, args.out, args.allow_draft, args.reference)
    if result["status"] == "BLOCKED_INPUT":
        fail(f"레이어 없음: {args.layers} (BLOCKED_INPUT)")
    print(f"[{result['status']}] {', '.join(result['files'])} ({result['layers']} layers) → {args.out}")


if __name__ == "__main__":
    main()
