"""파츠 PNG 검사: 명칭·누락·캔버스 크기·알파·빈 이미지·잘림·색 테두리·반투명 잔여물·중복.

    python tools/live2d-authoring/validate_layers.py --manifest <layer-plan.json> \
        [--layers assets/live2d-authoring/layers] [--out <dir>] [--allow-draft]

산출물: layer-validation.json. 종료 코드 0=PASSED/NEEDS_MANUAL_QA, 1=FAILED, 2=BLOCKED_INPUT(파츠 없음)
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from common import (DEFAULT_LAYERS, DEFAULT_OUTPUT, DEFAULT_PLAN, is_export_excluded, load_plan, now_iso,
                    resolve_layer_file, tool_versions, write_json)

SEMI_TRANSPARENT_WARN = 0.35  # 불투명 픽셀 중 반투명 비율 경고 임계


def check_layer(path: Path, canvas: dict, guide: bool = False) -> tuple[list[str], list[str], dict]:
    errors, warnings = [], []
    im = Image.open(path)
    meta: dict = {"mode": im.mode, "size": [im.width, im.height], "format": im.format}
    if im.format != "PNG":
        errors.append(f"PNG 아님({im.format})")
    if im.mode != "RGBA":
        errors.append(f"RGBA 아님({im.mode})")
    if (im.width, im.height) != (canvas["width"], canvas["height"]):
        errors.append(f"캔버스 크기 불일치 {im.width}x{im.height} ≠ {canvas['width']}x{canvas['height']}")
    a = np.asarray(im.convert("RGBA"))
    alpha = a[..., 3]
    opaque = alpha > 0
    n = int(opaque.sum())
    meta["opaquePixels"] = n
    if n == 0:
        errors.append("빈 이미지(불투명 픽셀 없음)")
        return errors, warnings, meta
    ys, xs = np.where(opaque)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    meta["bbox"] = bbox
    clipped = [s for s, hit in (("left", bbox[0] == 0), ("top", bbox[1] == 0),
                                ("right", bbox[2] == im.width), ("bottom", bbox[3] == im.height)) if hit]
    if clipped and not guide:  # 가이드(_GUIDE/exportExcluded)는 캔버스 전체를 가로지르는 게 정상
        warnings.append(f"가장자리에 닿음(잘린 스트로크 의심): {', '.join(clipped)}")
    semi = float(((alpha > 0) & (alpha < 255)).sum() / n)
    meta["semiTransparentRatio"] = round(semi, 4)
    if semi > SEMI_TRANSPARENT_WARN:
        warnings.append(f"반투명 잔여물 비율 높음 {semi:.0%}")
    fringe = int(((alpha > 0) & (alpha < 24) & (a[..., :3].max(axis=-1) > 96)).sum())
    meta["fringePixels"] = fringe
    if fringe > max(50, n * 0.02):
        warnings.append(f"색 테두리(fringe) 의심 {fringe}px")
    meta["sha1"] = hashlib.sha1(a.tobytes()).hexdigest()[:12]
    return errors, warnings, meta


def validate(plan: dict, layers_dir: Path, allow_draft: bool) -> dict:
    canvas = plan["canvas"]
    pattern = re.compile(plan["naming"]["pattern"])
    result = {"generatedAt": now_iso(), "tools": tool_versions(), "layersDir": str(layers_dir),
              "canvas": canvas, "layers": [], "missingRequired": [], "missingOptional": [],
              "unknownFiles": [], "duplicates": [], "errors": 0, "warnings": 0}
    hashes: dict[str, list[str]] = {}
    known = set()
    for layer in sorted(plan["layers"], key=lambda l: l["z"]):
        lid = layer["id"]
        path = resolve_layer_file(layers_dir, lid)
        if path and path.stem != lid and not allow_draft:
            path = None
        if path is None:
            (result["missingRequired"] if layer["required"] else result["missingOptional"]).append(lid)
            continue
        known.add(path.name)
        entry = {"id": lid, "file": path.name, "z": layer["z"], "group": layer["group"],
                 "isDraft": path.stem != lid, "exportExcluded": is_export_excluded(plan, lid),
                 "errors": [], "warnings": []}
        if not pattern.match(lid):
            entry["errors"].append("레이어명 규칙 위반")
        try:
            errs, warns, meta = check_layer(path, canvas, entry["exportExcluded"])
        except Exception as e:  # 손상 파일
            errs, warns, meta = [f"읽기 실패: {e}"], [], {}
        entry["errors"] += errs
        entry["warnings"] += warns
        entry.update(meta)
        if meta.get("sha1"):
            hashes.setdefault(meta["sha1"], []).append(lid)
        result["errors"] += len(entry["errors"])
        result["warnings"] += len(entry["warnings"])
        result["layers"].append(entry)
    result["duplicates"] = [ids for ids in hashes.values() if len(ids) > 1]
    result["errors"] += len(result["duplicates"])
    result["unknownFiles"] = sorted(p.name for p in layers_dir.glob("*.png") if p.name not in known) \
        if layers_dir.is_dir() else []
    result["warnings"] += len(result["unknownFiles"])
    if not result["layers"]:
        result["status"] = "BLOCKED_INPUT"
    elif result["errors"] or (result["missingRequired"] and not allow_draft):  # 초안은 누락 허용(수동 복원 대상)
        result["status"] = "FAILED"
    elif result["warnings"] or result["missingRequired"] or any(l["isDraft"] for l in result["layers"]):
        result["status"] = "NEEDS_MANUAL_QA"
    else:
        result["status"] = "PASSED"
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_PLAN, help="layer-plan.json")
    ap.add_argument("--layers", type=Path, default=DEFAULT_LAYERS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest")
    ap.add_argument("--allow-draft", action="store_true", help="<id>_REF.png 초안도 검사 대상에 포함")
    args = ap.parse_args()
    plan = load_plan(args.manifest)
    result = validate(plan, args.layers, args.allow_draft)
    out = write_json(args.out / "layer-validation.json", result)
    print(f"[{result['status']}] {len(result['layers'])} layers checked, "
          f"{len(result['missingRequired'])} required missing, {result['errors']} errors, "
          f"{result['warnings']} warnings → {out}")
    for e in result["layers"]:
        for msg in e["errors"]:
            print(f"  ERROR {e['id']}: {msg}")
        for msg in e["warnings"]:
            print(f"  warn  {e['id']}: {msg}")
    if result["missingRequired"]:
        print("  missing required:", ", ".join(result["missingRequired"]))
    if result["duplicates"]:
        print("  duplicates:", result["duplicates"])
    sys.exit({"PASSED": 0, "NEEDS_MANUAL_QA": 0, "FAILED": 1}.get(result["status"], 2))


if __name__ == "__main__":
    main()
