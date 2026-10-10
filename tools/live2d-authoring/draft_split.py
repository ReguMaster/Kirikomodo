"""기준 이미지에서 색상·ROI 기반 초안 레이어(_REF)를 뽑는다. AI 없음, Pillow+numpy만 사용.

    python tools/live2d-authoring/draft_split.py --input assets/reference/kiriko.png \
        [--plan ...] [--out assets/live2d-authoring/output/<build-id>/layers-draft]

layer-plan의 draft.roi(크롭 기준 좌표) ∩ draft.color(HSV 분류)로 마스크를 만들고 공통 캔버스에 둔다.
결과는 작업 참고용 초안(NEEDS_MANUAL_QA)이며 리깅용 파츠가 아니다. 머리카락 경계·눈·입은 반드시 수작업 분리.
중간 마스크(masks/*.png)를 함께 남겨 재분리·수정이 가능하게 한다.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from common import DEFAULT_OUTPUT, DEFAULT_PLAN, fail, load_plan, now_iso, tool_versions, write_json
from prepare_artwork import crop_to_canvas


def classify(rgba: Image.Image) -> dict[str, np.ndarray]:
    """PIL HSV(0~255) 기준 색 분류. 임계값은 kiriko.png 샘플링으로 보정했다."""
    a = np.asarray(rgba)
    hsv = np.asarray(rgba.convert("RGB").convert("HSV")).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    opaque = a[..., 3] > 128
    red = ((h >= 238) | (h <= 4)) & (s >= 100) & (v >= 60)
    skin = (h >= 4) & (h <= 26) & (s >= 55) & (s <= 150) & (v >= 80) & ~red
    white = (s <= 35) & (v >= 165)
    gray = (s <= 60) & (v >= 60) & (v < 165) & ~skin
    hair = ((h >= 100) & (h <= 140) & (v <= 110)) | ((v <= 70) & (s <= 90))
    dark = v < 70
    return {k: m & opaque for k, m in
            {"red": red, "skin": skin, "white": white, "gray": gray, "hair": hair, "dark": dark, "any": opaque}.items()}


def clean_mask(mask: np.ndarray) -> Image.Image:
    im = Image.fromarray((mask * 255).astype(np.uint8), "L")
    return im.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))


def split(src: Path, plan: dict, out: Path) -> dict:
    crop = plan.get("reference", {}).get("upperBodyCrop")
    if not crop:
        raise ValueError("layer-plan.reference.upperBodyCrop 없음 (BLOCKED_INPUT)")
    rgba = Image.open(src).convert("RGBA")
    canvas_img, mapping = crop_to_canvas(rgba, crop, plan["canvas"])
    classes = classify(canvas_img)
    scale, (ox, oy) = mapping["scale"], mapping["offset"]
    base = np.asarray(canvas_img)
    masks_dir = out / "masks"
    masks_dir.mkdir(parents=True, exist_ok=True)
    report = {"generatedAt": now_iso(), "tools": tool_versions(), "status": "NEEDS_MANUAL_QA",
              "input": str(src), "mapping": mapping, "layers": [], "skipped": []}
    for layer in plan["layers"]:
        d = layer.get("draft")
        if not d:
            report["skipped"].append(layer["id"])
            continue
        l, t, r, b = d["roi"]
        x0, y0 = int((l - crop[0]) * scale) + ox, int((t - crop[1]) * scale) + oy
        x1, y1 = int((r - crop[0]) * scale) + ox, int((b - crop[1]) * scale) + oy
        roi = np.zeros(base.shape[:2], bool)
        roi[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
        mask = clean_mask(classes[d["color"]] & roi)
        pixels = int((np.asarray(mask) > 0).sum())
        name = f"{layer['id']}_REF"
        mask.save(masks_dir / f"{name}.png")
        if pixels:  # 빈 초안은 마스크만 남기고 레이어 PNG는 만들지 않는다(빈 파일이 검증을 FAILED로 만들지 않도록)
            layer_img = Image.fromarray(base.copy(), "RGBA")
            layer_img.putalpha(Image.fromarray(np.minimum(np.asarray(mask), base[..., 3]), "L"))
            layer_img.save(out / f"{name}.png")
        report["layers"].append({"id": layer["id"], "file": f"{name}.png" if pixels else None, "color": d["color"],
                                 "canvasRoi": [x0, y0, x1, y1], "pixels": pixels,
                                 "status": "NEEDS_MANUAL_QA" if pixels else "FAILED"})
    report["empty"] = [l["id"] for l in report["layers"] if l["status"] == "FAILED"]
    write_json(out / "draft-split-report.json", report)
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, required=True)
    ap.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest" / "layers-draft")
    args = ap.parse_args()
    if not args.input.is_file():
        fail(f"입력 파일 없음: {args.input} (BLOCKED_INPUT)")
    report = split(args.input, load_plan(args.plan), args.out)
    print(f"[NEEDS_MANUAL_QA] {len(report['layers'])} draft layers → {args.out} "
          f"(skipped {len(report['skipped'])}, empty {len(report['empty'])})")
    if report["empty"]:
        print("  empty:", ", ".join(report["empty"]))


if __name__ == "__main__":
    main()
