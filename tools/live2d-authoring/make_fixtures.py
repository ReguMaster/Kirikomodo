"""기하학 도형 테스트 픽스처 생성(명세 15.4·15.7 M-01~M-03). 실제 원화 없이 경로·정렬·검사·PSD 조립을 시험한다.

    python tools/live2d-authoring/make_fixtures.py [--out tests/fixtures/live2d]

산출물: layer-plan.json(작은 캔버스), layers/*.png(정상), layers-bad/*.png(빈 이미지·크기 불일치·중복·잘림),
model/fixture.model3.json(+ 가짜 MOC3 매직 파일·텍스처: 참조 무결성 검사 전용, 실제 모델 아님),
model-broken/fixture.model3.json(텍스처 누락·moc 매직 불일치)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
W, H = 256, 320


def plan() -> dict:
    layers = [
        ("Guide_Center_GUIDE", "00_Guide", 0, False, None, True),
        ("Hair_Back", "01_Head/HairBack", 10, True, None, False),
        ("Body", "02_Body/Torso", 20, True, None, False),
        ("Head_Base", "01_Head/Face", 30, True, None, False),
        ("Eye_L_White", "01_Head/Eyes", 40, True, "L", False),
        ("Eye_R_White", "01_Head/Eyes", 41, True, "R", False),
        ("Eye_L_Iris", "01_Head/Eyes", 42, True, "L", False),
        ("Eye_R_Iris", "01_Head/Eyes", 43, True, "R", False),
        ("Mouth_Line", "01_Head/Mouth", 50, True, None, False),
        ("Hair_Front", "01_Head/HairFront", 60, True, None, False),
        ("Arm_L", "03_Arms/Left", 70, False, "L", False),
        ("Shadow_Adjust", "90_Shadow_Adjust", 80, False, None, False),
    ]
    return {
        "version": 1,
        "model": {"id": "fixture-geo", "name": "Fixture_Geo", "scope": "upper_body"},
        "canvas": {"width": W, "height": H, "colorMode": "RGB", "bitDepth": 8, "colorProfile": "sRGB"},
        "sideConvention": "character",
        "naming": {"pattern": "^[A-Za-z][A-Za-z0-9_]*$", "sideSuffix": {"left": "_L", "right": "_R"},
                   "excludeSuffixes": ["_REF", "_GUIDE", "_TMP"], "guidePrefix": "Guide"},
        "groups": sorted({l[1] for l in layers}),
        "layers": [{"id": i, "group": g, "z": z, "required": r, "side": s, "restore": False,
                    **({"exportExcluded": True} if ex else {})} for i, g, z, r, s, ex in layers],
    }


def shape(draw_fn) -> Image.Image:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(im))
    return im


SHAPES = {
    "Guide_Center_GUIDE": lambda d: d.line([(W // 2, 0), (W // 2, H)], (0, 200, 255, 255), 1),
    "Hair_Back": lambda d: d.ellipse([60, 40, 196, 200], (40, 60, 70, 255)),
    "Body": lambda d: d.rounded_rectangle([70, 170, 186, 300], 20, (240, 240, 240, 255)),
    "Head_Base": lambda d: d.ellipse([78, 60, 178, 170], (250, 220, 200, 255)),
    "Eye_L_White": lambda d: d.ellipse([136, 100, 160, 116], (255, 255, 255, 255)),
    "Eye_R_White": lambda d: d.ellipse([96, 100, 120, 116], (255, 255, 255, 255)),
    "Eye_L_Iris": lambda d: d.ellipse([143, 103, 155, 115], (60, 40, 30, 255)),
    "Eye_R_Iris": lambda d: d.ellipse([101, 103, 113, 115], (60, 40, 30, 255)),
    "Mouth_Line": lambda d: d.arc([116, 130, 140, 146], 10, 170, (180, 60, 60, 255), 2),
    "Hair_Front": lambda d: d.chord([74, 52, 182, 120], 180, 360, (40, 60, 70, 255)),
    "Arm_L": lambda d: d.rounded_rectangle([186, 180, 216, 290], 12, (250, 220, 200, 255)),
    "Shadow_Adjust": lambda d: d.ellipse([90, 150, 166, 175], (0, 0, 0, 255)),
}


def write_layers(out: Path) -> None:
    good = out / "layers"
    good.mkdir(parents=True, exist_ok=True)
    for lid, fn in SHAPES.items():
        shape(fn).save(good / f"{lid}.png")
    bad = out / "layers-bad"
    bad.mkdir(exist_ok=True)
    for lid in ("Head_Base", "Eye_L_White", "Eye_R_White", "Mouth_Line", "Hair_Front", "Hair_Back"):
        shape(SHAPES[lid]).save(bad / f"{lid}.png")
    shape(SHAPES["Eye_L_Iris"]).save(bad / "Eye_R_Iris.png")  # 중복 픽셀
    shape(SHAPES["Eye_L_Iris"]).save(bad / "Eye_L_Iris.png")
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(bad / "Body.png")  # 빈 이미지
    Image.new("RGBA", (W // 2, H // 2), (0, 0, 0, 0)).save(bad / "Arm_L.png")  # 크기 불일치
    shape(lambda d: d.rectangle([0, 0, 40, 40], (255, 0, 0, 255))).save(bad / "Shadow_Adjust.png")  # 가장자리 잘림
    shape(SHAPES["Body"]).convert("RGB").save(bad / "Unknown_Extra.png")  # 계획에 없는 파일


def write_models(out: Path) -> None:
    tex = shape(SHAPES["Head_Base"])
    for name, broken in (("model", False), ("model-broken", True)):
        d = out / name
        (d / "textures").mkdir(parents=True, exist_ok=True)
        (d / "fixture.moc3").write_bytes((b"XXXX" if broken else b"MOC3") + b"\0" * 60)
        if not broken:
            tex.save(d / "textures/texture_00.png")
        (d / "fixture.physics3.json").write_text('{"Version":3,"Meta":{},"PhysicsSettings":[]}', encoding="utf-8")
        (d / "motions").mkdir(exist_ok=True)
        (d / "motions/idle_01.motion3.json").write_text('{"Version":3,"Meta":{"Duration":1,"Fps":30},"Curves":[]}',
                                                        encoding="utf-8")
        model = {
            "Version": 3,
            "FileReferences": {"Moc": "fixture.moc3", "Textures": ["textures/texture_00.png"],
                               "Physics": "fixture.physics3.json",
                               "Motions": {"Idle": [{"File": "motions/idle_01.motion3.json"}]}},
            "Groups": [{"Target": "Parameter", "Name": "EyeBlink", "Ids": ["ParamEyeLOpen", "ParamEyeROpen"]},
                       {"Target": "Parameter", "Name": "LipSync", "Ids": ["ParamMouthOpenY"]}],
            "HitAreas": [{"Id": "HitAreaHead", "Name": "Head"}],
            "_fixture": "테스트 전용 참조 무결성 픽스처. 실제 Cubism 모델이 아니며 런타임 로드 불가",
        }
        (d / "fixture.model3.json").write_text(json.dumps(model, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=ROOT / "tests/fixtures/live2d")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "layer-plan.json").write_text(json.dumps(plan(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_layers(args.out)
    write_models(args.out)
    print(f"wrote fixtures → {args.out}")


if __name__ == "__main__":
    main()
