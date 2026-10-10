"""원화 검증·메타데이터 생성 + 상반신 크롭 미리보기.

    python tools/live2d-authoring/prepare_artwork.py --input assets/reference/kiriko.png \
        [--plan assets/live2d-authoring/input/layer-plan.json] [--out assets/live2d-authoring/output/<build-id>]

산출물: source-info.json, upper_body_preview.png(계획 캔버스 크기로 맞춘 크롭)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from common import DEFAULT_OUTPUT, DEFAULT_PLAN, fail, load_plan, now_iso, tool_versions, write_json

MIN_SIDE = 512


def analyze(path: Path) -> tuple[dict, Image.Image]:
    im = Image.open(path)
    info: dict = {
        "file": str(path), "format": im.format, "mode": im.mode,
        "width": im.width, "height": im.height, "dpi": im.info.get("dpi"),
        "hasIccProfile": "icc_profile" in im.info, "checks": [], "status": "READY",
    }
    if im.mode not in ("RGBA", "LA", "RGB", "P"):
        info["checks"].append(f"지원하지 않는 모드 {im.mode}")
    rgba = im.convert("RGBA")
    a = np.asarray(rgba)
    alpha = a[..., 3]
    opaque = alpha > 0
    info["alpha"] = {"present": im.mode in ("RGBA", "LA", "P") and bool((alpha < 255).any()),
                     "coverage": round(float(opaque.mean()), 4),
                     "semiTransparentRatio": round(float(((alpha > 0) & (alpha < 255)).mean()), 4)}
    if not info["alpha"]["present"]:
        info["checks"].append("투명 배경 없음(배경 제거 필요)")
    if opaque.any():
        ys, xs = np.where(opaque)
        bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        info["opaqueBBox"] = bbox
        touching = [side for side, hit in (("left", bbox[0] == 0), ("top", bbox[1] == 0),
                                           ("right", bbox[2] == im.width), ("bottom", bbox[3] == im.height)) if hit]
        if touching:
            info["checks"].append(f"불투명 픽셀이 캔버스 가장자리에 닿음: {', '.join(touching)}")
    else:
        info["checks"].append("불투명 픽셀 없음(빈 이미지)")
        info["status"] = "FAILED"
    if min(im.width, im.height) < MIN_SIDE:
        info["checks"].append(f"해상도 부족(짧은 변 {min(im.width, im.height)}px < {MIN_SIDE})")
    # 색 테두리(fringe): 거의 투명한데 밝은 색이 남은 픽셀
    fringe = (alpha > 0) & (alpha < 32) & (a[..., :3].max(axis=-1) > 64)
    info["alpha"]["fringePixels"] = int(fringe.sum())
    if info["checks"] and info["status"] == "READY":
        info["status"] = "NEEDS_MANUAL_QA"
    return info, rgba


def crop_to_canvas(rgba: Image.Image, crop: list[int], canvas: dict) -> tuple[Image.Image, dict]:
    """crop 영역을 캔버스에 비율 유지로 맞추고 가로 중앙·세로 상단 정렬."""
    region = rgba.crop(tuple(crop))
    cw, ch = canvas["width"], canvas["height"]
    scale = min(cw / region.width, ch / region.height)
    size = (max(1, round(region.width * scale)), max(1, round(region.height * scale)))
    scaled = region.resize(size, Image.LANCZOS)
    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    offset = ((cw - size[0]) // 2, 0)
    out.paste(scaled, offset)
    return out, {"crop": crop, "scale": round(scale, 5), "scaledSize": list(size), "offset": list(offset)}


def prepare(src: Path, plan: dict, out: Path) -> dict:
    info, rgba = analyze(src)
    info.update({"generatedAt": now_iso(), "tools": tool_versions()})
    crop = plan.get("reference", {}).get("upperBodyCrop")
    if crop:
        crop = [max(0, crop[0]), max(0, crop[1]), min(rgba.width, crop[2]), min(rgba.height, crop[3])]
        preview, mapping = crop_to_canvas(rgba, crop, plan["canvas"])
        out.mkdir(parents=True, exist_ok=True)
        preview.save(out / "upper_body_preview.png")
        info["upperBody"] = {**mapping, "preview": "upper_body_preview.png", "canvas": plan["canvas"]}
    write_json(out / "source-info.json", info)
    return info


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", type=Path, required=True, help="원화 PNG")
    ap.add_argument("--plan", type=Path, default=DEFAULT_PLAN)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUTPUT / "latest")
    args = ap.parse_args()
    if not args.input.is_file():
        fail(f"입력 파일 없음: {args.input} (BLOCKED_INPUT)")
    info = prepare(args.input, load_plan(args.plan), args.out)
    print(f"[{info['status']}] {args.input.name} {info['width']}x{info['height']} {info['mode']} "
          f"alpha coverage {info['alpha']['coverage']:.1%} → {args.out / 'source-info.json'}")
    for c in info["checks"]:
        print("  -", c)


if __name__ == "__main__":
    main()
