"""layer-plan.json 생성기. 명세 16.4(상반신 파츠)를 레이어 계약 형식으로 내보낸다.

좌우 표기는 캐릭터 기준(sideConvention=character). 명세 16.4의 Arm_*_Left/Hand_Left_Gesture는
화면 기준 표기이므로 여기서는 캐릭터 오른팔(Arm_*_R, Hand_R_Gesture)로 옮겼다.

    python tools/live2d-authoring/make_layer_plan.py [--out assets/live2d-authoring/input/layer-plan.json] [--docs docs/live2d-kiriko-parts.md]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "assets/live2d-authoring/input/layer-plan.json"

LAYERS: list[dict] = []


def add(id, group, z, required=True, side=None, restore=False, draft=None, note=None, excluded=False):
    d = {"id": id, "group": group, "z": z, "required": required, "side": side, "restore": restore}
    if excluded:
        d["exportExcluded"] = True
    if draft:
        d["draft"] = {"roi": draft[0], "color": draft[1]}
    if note:
        d["note"] = note
    LAYERS.append(d)


# draft roi는 reference.upperBodyCrop([0,0,732,1000]) 기준 픽셀 좌표 [left, top, right, bottom]
add("Guide_Center_GUIDE", "00_Guide", 0, False, excluded=True, note="정중앙 세로선·눈높이 가이드. 최종 출력 제외")
add("Eye_L_BlinkGuide_GUIDE", "00_Guide", 1, False, "L", excluded=True)
add("Eye_R_BlinkGuide_GUIDE", "00_Guide", 2, False, "R", excluded=True)

add("Hair_Back_Center", "01_Head/HairBack", 10, True, None, True, ([200, 60, 440, 340], "hair"), "기준 이미지에서 거의 보이지 않음. 복원 제작")
add("Hair_Back_L", "01_Head/HairBack", 11, True, "L", True, note="복원 제작")
add("Hair_Back_R", "01_Head/HairBack", 12, True, "R", True, note="복원 제작")
add("Headband_Back", "01_Head/Mask", 15, True, None, True, note="머리띠 뒷부분, 복원")

add("Neck", "02_Body/Neck", 20, True, None, False, ([270, 290, 360, 370], "skin"))
add("Torso_Upper_Base", "02_Body/Torso", 22, True, None, True, note="옷 안쪽 몸통. 회전 시 노출 영역 복원")
add("Shoulder_L", "02_Body/Torso", 24, True, "L", True, ([400, 340, 560, 470], "white"), "캐릭터 왼어깨(화면 오른쪽). 뒤로 돌아간 어깨, 정면 재해석")
add("Shoulder_R", "02_Body/Torso", 25, True, "R", False, ([130, 330, 230, 440], "white"))
add("Cloth_Upper_White_Base", "02_Body/Clothes", 30, True, None, False, ([150, 330, 560, 640], "white"))
add("Cloth_Collar_Inner_Red", "02_Body/Clothes", 32, True, None, False, ([250, 350, 380, 430], "red"))
add("Cloth_Chest_Logo", "02_Body/Clothes", 34, True, None, False, ([295, 410, 355, 465], "red"))
add("Strap_L", "02_Body/Straps", 36, True, "L", False, ([360, 350, 560, 600], "gray"))
add("Strap_R", "02_Body/Straps", 37, True, "R", False, ([160, 400, 300, 580], "gray"))
add("Shoulder_Pad_L", "02_Body/Straps", 38, False, "L", draft=([380, 340, 470, 420], "gray"))
add("Shoulder_Pad_R", "02_Body/Straps", 39, False, "R")

add("Arm_Upper_L", "03_Arms/Left", 40, False, "L", True, ([500, 430, 620, 700], "skin"), "캐릭터 왼팔(화면 오른쪽), 내린 팔. 크롭 하단에서 잘림 → 복원")
add("Arm_Lower_L", "03_Arms/Left", 41, False, "L", True, ([520, 700, 640, 900], "skin"))
add("Hand_L_Rest", "03_Arms/Left", 42, False, "L", True, ([510, 820, 640, 1000], "red"), "크롭 범위 밖까지 이어짐")
add("Glove_L", "03_Arms/Left", 43, False, "L", True)

add("Waist_Armor_Front", "04_Accessories/Waist", 50, True, None, False, ([110, 530, 480, 760], "red"))
add("Waist_Beads_Alt_Shadow", "04_Accessories/Waist", 52, False)
add("Waist_Beads_Main", "04_Accessories/Waist", 54, True, None, False, ([130, 600, 450, 700], "white"))
add("Waist_Belt", "04_Accessories/Waist", 55, True, None, False, ([150, 650, 450, 730], "gray"))
add("Waist_Knot_L", "04_Accessories/Waist", 56, True, "L", False, ([280, 820, 350, 900], "white"))
add("Waist_Knot_R", "04_Accessories/Waist", 57, True, "R", False, ([210, 820, 285, 900], "white"))
add("Waist_Hanging_Orbs", "04_Accessories/Waist", 58, True, None, False, ([255, 700, 320, 830], "dark"))

add("Head_Base", "01_Head/Face", 60, True, None, True, ([215, 170, 400, 345], "skin"), "앞머리·가면 아래 이마 윤곽 복원")
add("Face_Shadow", "90_Shadow_Adjust", 62, False)
add("Ear_L", "01_Head/Face", 64, False, "L", True, note="기준 이미지에서 머리카락에 가려짐")
add("Ear_R", "01_Head/Face", 65, False, "R", True)
for side, z0, roi in (("L", 70, [305, 215, 355, 255]), ("R", 71, [235, 220, 285, 260])):
    add(f"Eye_{side}_White", "01_Head/Eyes", z0, True, side, False, (roi, "white"))
    add(f"Eye_{side}_Iris", "01_Head/Eyes", z0 + 2, True, side, False, (roi, "dark"))
    add(f"Eye_{side}_Pupil", "01_Head/Eyes", z0 + 4, True, side)
    add(f"Eye_{side}_Highlight", "01_Head/Eyes", z0 + 6, True, side)
    add(f"Eye_{side}_LowerLid", "01_Head/Eyes", z0 + 8, True, side)
    add(f"Eye_{side}_UpperLid", "01_Head/Eyes", z0 + 10, True, side)
    add(f"Eye_{side}_Lashes", "01_Head/Eyes", z0 + 12, True, side)
add("Brow_L", "01_Head/Brows", 88, True, "L", False, ([300, 200, 360, 230], "dark"))
add("Brow_R", "01_Head/Brows", 89, True, "R", False, ([230, 205, 290, 235], "dark"))
add("Nose_Base", "01_Head/Face", 90, False)
add("Mouth_Inner", "01_Head/Mouth", 92, True, None, True, note="닫힌 입이라 내부 미노출. 제작 필요")
add("Teeth_Upper", "01_Head/Mouth", 93, False, restore=True)
add("Tongue", "01_Head/Mouth", 94, False, restore=True)
add("Mouth_Open", "01_Head/Mouth", 95, True, None, True)
add("Mouth_Line", "01_Head/Mouth", 96, True, None, False, ([265, 275, 325, 305], "red"))
add("Cheek_L_Blush", "01_Head/Face", 98, False, "L", draft=([330, 240, 365, 270], "red"))
add("Cheek_R_Blush", "01_Head/Face", 99, False, "R", draft=([230, 245, 265, 275], "red"))

add("Hair_Side_L", "01_Head/HairFront", 100, True, "L", False, ([370, 180, 430, 300], "hair"))
add("Hair_Side_R", "01_Head/HairFront", 101, True, "R", False, ([200, 180, 260, 320], "hair"))
add("Hair_Bangs_Shadow", "90_Shadow_Adjust", 103, False)
add("Hair_Front_Center", "01_Head/HairFront", 104, True, None, False, ([270, 180, 360, 240], "hair"))
add("Hair_Front_L_1", "01_Head/HairFront", 105, True, "L", False, ([330, 180, 400, 250], "hair"))
add("Hair_Front_L_2", "01_Head/HairFront", 106, True, "L")
add("Hair_Front_R_1", "01_Head/HairFront", 107, True, "R", False, ([220, 185, 290, 260], "hair"))
add("Hair_Front_R_2", "01_Head/HairFront", 108, True, "R")
add("Hair_Top_Tuft", "01_Head/HairFront", 110, True, None, False, ([300, 20, 440, 140], "hair"))

add("Mask_Fox_Base", "01_Head/Mask", 120, True, None, False, ([190, 100, 400, 235], "red"))
add("Mask_Fox_Horn_L", "01_Head/Mask", 122, True, "L", False, ([300, 90, 360, 150], "white"))
add("Mask_Fox_Horn_R", "01_Head/Mask", 123, True, "R", False, ([185, 120, 250, 185], "white"))
add("Mask_Detail_Decal", "01_Head/Mask", 124, False, draft=([225, 120, 300, 175], "white"))
add("Headband_Base", "01_Head/Mask", 126, True, None, False, ([200, 140, 420, 250], "dark"))

add("Arm_Upper_R", "03_Arms/Right", 130, False, "R", False, ([40, 430, 200, 620], "skin"), "캐릭터 오른팔(화면 왼쪽), 부적을 든 팔. 명세 16.4 Arm_*_Left에 해당")
add("Arm_Lower_R", "03_Arms/Right", 131, False, "R", False, ([60, 300, 190, 460], "skin"))
add("Glove_R", "03_Arms/Right", 132, False, "R", False, ([55, 330, 180, 500], "red"))
add("Hand_R_Gesture", "03_Arms/Right", 133, False, "R", False, ([70, 240, 190, 370], "skin"), "세운 검지+부적 포즈를 하나의 파츠로 처리")
add("Ofuda_Paper", "04_Accessories/Ofuda", 134, False, None, False, ([0, 150, 165, 320], "white"))


def build_plan() -> dict:
    zs = [l["z"] for l in LAYERS]
    assert len(zs) == len(set(zs)), "z duplicate"
    ids = [l["id"] for l in LAYERS]
    assert len(ids) == len(set(ids)), "id duplicate"
    return {
        "$schema": "../../../docs/live2d-layer-contract.json",
        "version": 1,
        "model": {"id": "kiriko-upper-body", "name": "Kiriko_UpperBody", "scope": "upper_body"},
        "canvas": {"width": 1024, "height": 1400, "colorMode": "RGB", "bitDepth": 8, "colorProfile": "sRGB"},
        "sideConvention": "character",
        "naming": {
            "pattern": "^[A-Za-z][A-Za-z0-9_]*$",
            "sideSuffix": {"left": "_L", "right": "_R"},
            "excludeSuffixes": ["_REF", "_GUIDE", "_TMP"],
            "guidePrefix": "Guide",
        },
        "reference": {
            "file": "../../reference/kiriko.png",
            "upperBodyCrop": [0, 0, 732, 1000],
            "note": "732x2048 RGBA 전신 3D 렌더. 상반신 크롭은 머리 끝~허리 매듭·늘어진 구슬까지. "
                    "비주얼 레퍼런스이며 최종 리깅 PSD 원본이 아니다(명세 16.14).",
        },
        "groups": sorted({l["group"] for l in LAYERS}),
        "layers": LAYERS,
    }


def build_docs(plan: dict) -> str:
    L = plan["layers"]
    c, m, r = plan["canvas"], plan["model"], plan["reference"]
    lines = [
        "# 키리코 Live2D 파츠 목록 (상반신)", "",
        "> `python tools/live2d-authoring/make_layer_plan.py --docs docs/live2d-kiriko-parts.md` 로 생성. 직접 편집하지 말 것.", "",
        f"- 모델: `{m['name']}` (`{m['id']}`, scope `{m['scope']}`)",
        f"- 캔버스: {c['width']}x{c['height']} {c['colorMode']} {c['bitDepth']}bit {c['colorProfile']}",
        "- 좌우 표기: **캐릭터 기준** (`_L`=캐릭터 왼쪽, `_R`=캐릭터 오른쪽). 명세 16.4 의 화면 기준 `Arm_*_Left` 는 `Arm_*_R` 로 옮김",
        f"- 레이어 {len(L)}개 · 필수 {sum(l['required'] for l in L)} · 복원 필요 {sum(l['restore'] for l in L)} · "
        f"내보내기 제외 {sum(bool(l.get('exportExcluded')) for l in L)}",
        f"- 레퍼런스: `{r['file']}` 상반신 크롭 {r['upperBodyCrop']} — {r['note']}",
        "", "## 범위", "",
        "상반신(머리~허리 매듭)만 포함한다. 전신(하반신·다리·신발·꼬리 장식 하단)은 scope `full_body` 계획을 따로 만들 때 추가하며, "
        "파이프라인·캔버스 규칙·PSD 그룹 구조는 그대로 재사용한다.", "",
        "## 레이어", "", "| z | 그룹 | 레이어 | 필수 | 복원 | 초안 ROI·색 | 비고 |", "|---|---|---|---|---|---|---|",
    ]
    for l in sorted(L, key=lambda l: l["z"]):
        roi = f"{l['draft']['roi']} {l['draft']['color']}" if l.get("draft") else ""
        note = ("내보내기 제외. " if l.get("exportExcluded") else "") + (l.get("note") or "")
        lines.append(f"| {l['z']} | {l['group']} | `{l['id']}` | {'O' if l['required'] else ''} | "
                     f"{'O' if l['restore'] else ''} | {roi} | {note} |")
    lines += ["", "## 복원(가려진 부분 그려넣기) 대상 — K-02/K-04", "",
              "레퍼런스에서 가려져 있어 전체 형태를 사람이 그려 넣어야 하는 레이어. `draft_split.py` 초안은 보이는 부분만 추출한다.", "",
              *[f"- `{l['id']}`" for l in L if l["restore"]], "",
              "## 그룹(PSD 폴더)", "", *[f"- `{g}`" for g in plan["groups"]], ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--docs", type=Path, help="파츠 목록 Markdown 출력 경로(예: docs/live2d-kiriko-parts.md)")
    args = ap.parse_args()
    plan = build_plan()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.docs:
        args.docs.write_text(build_docs(plan), encoding="utf-8")
        print(f"wrote {args.docs}")
    print(f"wrote {args.out}: {len(plan['layers'])} layers, {len(plan['groups'])} groups, "
          f"{sum(l['required'] for l in plan['layers'])} required, {sum(l['restore'] for l in plan['layers'])} restore")


if __name__ == "__main__":
    main()
