"""layer-plan.json 생성기. 제작 기준 원본(assets/reference/private/kiriko-base-prepared.png, 2530x3006)의
여우 귀·꼬리·가면·방울 술 장식 디자인을 레이어 계약 형식으로 내보낸다.

좌우 표기는 캐릭터 기준(sideConvention=character): 화면 왼쪽 = 캐릭터 오른쪽(_R).
각 레이어의 `cut` 은 cut_parts.py 가 쓰는 분리 힌트(정리본 픽셀 좌표)다.
  sam: [{box, pos, neg}]  SAM 박스·점 프롬프트(합집합)
  box / poly              사각형·다각형 영역
  dark: {box, max, red?}  box 안에서 밝기 <= max 또는 R-max(G,B) > red 인 픽셀(속눈썹·입선)
  expr: {name, region, box?}  output/expressions/<name>.full.png 에서 region(eye_L/eye_R/mouth) 변형을 잘라냄. box 가 있으면 그 창 안에서만 차이를 찾음(없으면 기본 파츠 bbox+30px)
  draw: {arc}             직접 그리기(눈썹)
  clip: {box|poly}        1차 마스크를 이 영역 안으로 제한(SAM 번짐 차단)
  dilate: px              1차 마스크를 px 만큼 팽창(장식물 외곽선을 아래 레이어에서 가져옴)
  fallback: {box|poly}    1차 마스크에 안 잡힌 픽셀을 회수하는 대략 영역(2차 배정, z 높은 쪽 우선)
  extend: {box, method, prompt}  가려진 부분 복원 범위와 방식(cv2 | sdxl)
픽셀은 자기 마스크에 포함된 레이어 중 z 가 가장 높은 레이어에 배정된다.

    python tools/live2d-authoring/make_layer_plan.py [--out assets/live2d-authoring/input/layer-plan.json] [--docs docs/live2d-kiriko-parts.md]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "assets/live2d-authoring/input/layer-plan.json"
CANVAS = (2530, 3006)

LAYERS: list[dict] = []


def add(id, group, z, required=True, side=None, restore=False, cut=None, note=None, excluded=False):
    d = {"id": id, "group": group, "z": z, "required": required, "side": side, "restore": restore}
    if excluded:
        d["exportExcluded"] = True
    if cut:
        d["cut"] = cut
    if note:
        d["note"] = note
    LAYERS.append(d)


def sam(box, pos=(), neg=()):
    return {"box": list(box), "pos": [list(p) for p in pos], "neg": [list(p) for p in neg]}


def ext(box, method="cv2", prompt=None, poly=None, grow=None, seed=None):
    """복원 범위. grow: 보이는 부분에서 연장할 px(기본 60). seed: 보이는 부분이 없을 때 색을 빌릴 레이어 id."""
    d = {"poly": [list(p) for p in poly]} if poly else {"box": list(box)}
    d["method"] = method
    for k, v in (("prompt", prompt), ("grow", grow), ("seed", seed)):
        if v is not None:
            d[k] = v
    return d


HAIR = "long pale pink hair, soft cel shading, anime style, clean lineart"

add("Guide_Center_GUIDE", "00_Guide", 0, False, excluded=True, note="정중앙 세로선 x=1297.5·눈높이 y=850 가이드. 최종 출력 제외")

add("Tail", "01_Back/Tail", 10, True, None, True,
    {"sam": [sam((100, 950, 800, 1900), [(300, 1200), (500, 1500), (650, 1100)]),
             sam((100, 1700, 800, 2750), [(350, 2000), (450, 2400), (300, 2600)])],
     "fallback": {"poly": [[100, 900], [800, 900], [830, 1400], [760, 2000], [850, 2750], [100, 2750]]},
     "extend": ext((600, 1500, 1150, 2500), "sdxl", "fluffy white fox tail with pink tip, soft cel shading, anime style")},
    "화면 왼쪽 큰 여우 꼬리. 뿌리 쪽이 뒷머리·치마에 가려짐 → 복원")

add("Hair_Back_Center", "02_HairBack", 19, False, None, True,
    {"extend": ext(None, "sdxl", HAIR + ", back of head, hanging straight down", seed="Hair_Back_R",
                   poly=[[1050, 950], [1550, 950], [1640, 1300], [1650, 1700], [1550, 1900], [1050, 1900], [950, 1700], [960, 1300]])},
    "몸통 뒤 뒷머리. 원본에서 전부 가려짐 → 디퓨전으로 제작")
add("Hair_Back_R", "02_HairBack", 20, True, "R", True,
    {"sam": [sam((430, 930, 930, 1800), [(650, 1300), (600, 1600), (800, 1100)], [(300, 1500)]),
             sam((430, 1700, 930, 2470), [(600, 1900), (700, 2300), (550, 2100)], [(300, 2000), (1000, 2000)])],
     "fallback": {"poly": [[560, 900], [1150, 900], [1180, 1250], [1000, 1700], [950, 2000], [900, 2450], [600, 2450], [560, 1900], [600, 1300]]},
     "extend": ext((430, 930, 1000, 2470))},
    "화면 왼쪽 뒷머리. 꼬리 앞, 소매 뒤")
add("Hair_Back_L", "02_HairBack", 21, True, "L", True,
    {"sam": [sam((1680, 880, 2330, 1800), [(2000, 1200), (1900, 1000), (2050, 1600)], [(1600, 1500)]),
             sam((1680, 1700, 2330, 2420), [(2050, 1800), (1950, 2250), (2200, 2100)], [(1600, 2000)])],
     "fallback": {"poly": [[1420, 880], [2330, 880], [2500, 2450], [2450, 3006], [2030, 3006], [2050, 2450], [1600, 2450], [1650, 1700], [1400, 1250]]},
     "extend": ext((1600, 880, 2330, 2420), "sdxl", HAIR)},
    "화면 오른쪽 뒷머리. 소매 뒤")

add("Legs", "03_Body", 5, True, None, False, {"fallback": {"box": [550, 2650, 1950, 3006]}}, "치마 아래 허벅지. 하단은 캔버스 절단면")
add("Neck", "03_Body", 30, True, None, True,
    {"box": [1225, 985, 1360, 1085], "fallback": {"box": [1180, 900, 1420, 1230]}, "extend": ext((1200, 985, 1390, 1220))}, "털 깃 아래까지 복원")
add("Torso", "03_Body", 31, True, None, True,
    {"sam": [sam((1050, 1150, 1560, 1760), [(1300, 1560), (1170, 1700), (1430, 1700), (1300, 1250)], [(1340, 1430), (1300, 1900)])],
     "fallback": {"poly": [[880, 1200], [1700, 1200], [1700, 1350], [1640, 1500], [1600, 1900], [1000, 1900], [960, 1500], [900, 1350]]},
     "extend": ext((880, 1150, 1720, 2250))},
    "맨 어깨 + 흰 상의. 털 깃·가슴 방울·허리 리본·소매 아래 복원")
add("Hakama", "03_Body", 34, True, None, False,
    {"sam": [sam((560, 2500, 1950, 3006), [(800, 2850), (1750, 2850), (1300, 2950), (700, 2950), (1300, 2700)],
                 [(1300, 2500), (500, 2800), (2000, 2800)])],
     "fallback": {"poly": [[600, 2500], [1950, 2500], [1950, 2920], [1970, 2920], [1970, 3006], [1700, 3006], [1700, 2920], [850, 2920], [850, 3006], [560, 3006], [560, 2920], [600, 2920]]}},
    "붉은 하카마. 하단은 캔버스 절단면. 앞치마 박스에서 자기 픽셀을 가져가도록 z 를 앞치마보다 높게 둠")
add("Apron", "03_Body", 33, True, None, True,
    {"sam": [sam((380, 1750, 2120, 3006), [(700, 2500), (1900, 2500), (1300, 2300), (1100, 2800), (600, 2900), (2000, 2900)],
                 [(1300, 1950), (1300, 2900)])],
     "clip": {"poly": [[880, 1750], [1720, 1750], [1760, 2460], [2264, 2700], [2264, 3006], [300, 3006], [300, 2700], [840, 2460]]},
     "fallback": {"poly": [[850, 1750], [1750, 1750], [2080, 2500], [2050, 3006], [1900, 3006], [1850, 2750], [700, 2750], [650, 3006], [230, 3006], [230, 2450]]},
     "extend": ext((900, 1750, 1700, 2750), "sdxl", "white apron with pink sakura pattern, soft cel shading, anime style")},
    "벚꽃 무늬 흰 앞치마. 허리 리본·손 아래 복원")
add("Hands", "03_Body", 35, True, None, False,
    {"sam": [sam((1180, 2380, 1310, 2670), [(1250, 2540)]),
             sam((1290, 2400, 1435, 2670), [(1355, 2540), (1405, 2520), (1400, 2600), (1370, 2470)])]},
    "앞으로 모은 두 손(주먹마다 상자 하나. 한 상자로는 오른쪽 주먹 바깥이 빠짐)")

add("Sleeve_R", "04_Arms", 40, True, "R", True,
    {"sam": [sam((580, 1360, 1220, 1950), [(900, 1700), (950, 1450), (1000, 1600)], [(1300, 1800), (760, 1450), (700, 1250)]),
             sam((580, 1800, 1220, 2520), [(800, 2200), (1000, 2000), (700, 2050), (900, 2400)], [(1300, 2200)]),
             sam((200, 2400, 620, 2920), [(400, 2500), (300, 2650), (450, 2800), (550, 2600)], [(215, 2410)]),
             sam((560, 1870, 800, 2170), [(720, 1920), (640, 2100)], [(500, 2000), (600, 2300), (850, 2050)]),
             sam((740, 1500, 900, 1830), [(790, 1750), (770, 1620), (850, 1560)], [(700, 1700), (680, 1550)])],
     "fallback": {"poly": [[840, 1360], [1230, 1360], [1230, 2520], [900, 2560], [680, 2560], [630, 2700], [600, 3006], [200, 3006], [200, 2660], [220, 2450], [600, 2400], [820, 1900]]},
     "extend": ext((840, 1300, 1250, 1800), grow=80)},
    "화면 왼쪽 분리형 소매(어깨 프릴·매듭 포함). 어깨 앞 머리칼 아래 복원")
add("Sleeve_L", "04_Arms", 41, True, "L", True,
    {"sam": [sam((1460, 1360, 2020, 1950), [(1700, 1700), (1650, 1450), (1600, 1600)], [(1300, 1800), (1850, 1450), (1900, 1250)]),
             sam((1460, 1800, 2020, 2520), [(1800, 2200), (1600, 2000), (1900, 2050), (1700, 2400)], [(1300, 2200)]),
             sam((1920, 2400, 2360, 2920), [(2150, 2500), (2250, 2650), (2100, 2800), (2000, 2600)], [(2340, 2410)]),
             sam((1800, 1870, 2010, 2210), [(1865, 1955), (1910, 2020), (1960, 2120)], [(1770, 1950), (1960, 1850), (1800, 2150)]),
             sam((1720, 1500, 1830, 1820), [(1780, 1600), (1790, 1750)])],
     "fallback": {"poly": [[1450, 1360], [1760, 1360], [1780, 1900], [2000, 2400], [2264, 2480], [2370, 2600], [2370, 3006], [1930, 3006], [1900, 2700], [1850, 2560], [1694, 2560], [1450, 2520]]},
     "extend": ext((1400, 1300, 1760, 1800), grow=80)},
    "화면 오른쪽 분리형 소매. 어깨 앞 머리칼 아래 복원")

add("Hair_Over_R", "04_HairOver", 50, True, "R", False,
    {"sam": [sam((930, 1100, 1200, 1760), [(1060, 1450), (1010, 1600), (1120, 1300), (1080, 1700), (1090, 1150)],
                 [(1200, 1500), (950, 1500), (1230, 1650), (980, 1290), (1140, 1280)])], "dilate": 3},
    "화면 왼쪽 어깨 앞으로 흘러내린 머리칼. 몸통·소매 앞, 땋은 머리 뒤")
add("Hair_Over_L", "04_HairOver", 51, True, "L", False,
    {"sam": [sam((1420, 1100, 1620, 1760), [(1500, 1450), (1540, 1600), (1470, 1300), (1520, 1700), (1480, 1150)],
                 [(1400, 1500), (1620, 1500), (1380, 1650), (1640, 1300)])], "dilate": 3},
    "화면 오른쪽 어깨 앞으로 흘러내린 머리칼")

add("Ribbon_Waist", "05_Accessories", 60, True, None, False,
    {"sam": [sam((1000, 1660, 1600, 1950), [(1300, 1800), (1180, 1850), (1420, 1850), (1050, 1860), (1550, 1860)]),
             sam((1120, 1900, 1480, 2220), [(1200, 2000), (1400, 2000), (1220, 2150), (1380, 2150)]),
             sam((1110, 1660, 1500, 2220), [(1300, 1800), (1300, 2150)], [(1200, 1900), (1400, 1900)])]},
    "허리 큰 붉은 리본과 방울")
add("Bell_Chest", "05_Accessories", 61, True, None, False,
    {"sam": [sam((1200, 1060, 1470, 1580), [(1340, 1430), (1340, 1330), (1300, 1150), (1380, 1150), (1290, 1500), (1395, 1500), (1290, 1545), (1400, 1545)],
                 [(1250, 1300), (1430, 1300), (1340, 1250), (1340, 1300), (1310, 1270), (1370, 1270), (1440, 1400), (1430, 1500), (1460, 1300)]),
             sam((1260, 1480, 1350, 1670), [(1292, 1540), (1310, 1620)])], "dilate": 3,
     "clip": {"poly": [[1230, 1060], [1400, 1060], [1430, 1370], [1430, 1500], [1400, 1660], [1270, 1660], [1270, 1500], [1250, 1370]]}},
    "가슴 방울과 목에서 내려오는 붉은 끈·술. 털 깃에 겹치는 부분은 털 깃(z 62)이 가져감")
add("Fur_Collar", "05_Accessories", 62, True, None, False,
    {"sam": [sam((1110, 990, 1500, 1220), [(1300, 1130), (1180, 1080), (1420, 1080)], [(1300, 1010)])]}, "목 털 깃")

add("Face_Base", "06_Face", 70, True, None, True,
    {"sam": [sam((1050, 560, 1540, 1030), [(1290, 960), (1150, 880), (1440, 880), (1290, 760)], [(1290, 470), (1290, 1100)])],
     "extend": ext((1050, 560, 1540, 1030))},
    "얼굴 피부(코·홍조 포함). 앞머리 아래 이마, 눈·입 아래 피부 복원")

EYE_BOX = {"R": (1085, 775, 1280, 925), "L": (1315, 775, 1510, 925)}
# happy·wink 의 눈은 closed 와 동일 픽셀이라 Eye_*_Closed 를 재사용한다(별도 레이어 없음)
EYE_VARIANTS = ["Closed", "Half", "Wide", "Teary", "Glare", "Sleepy"]
EYE_EXPR = {"Closed": "closed", "Half": "half", "Wide": "wide", "Teary": "teary", "Glare": "glare", "Sleepy": "sleepy"}
for side, z0 in (("R", 80), ("L", 95)):
    bx = EYE_BOX[side]
    cx = (bx[0] + bx[2]) // 2
    add(f"Eye_{side}_White", "06_Face/Eyes", z0, True, side, True,
        {"sam": [sam(bx, [(cx - 50, 850), (cx + 50, 850), (cx, 835)])], "extend": ext(bx, grow=25)},
        "흰자(눈 전체 마스크에서 홍채·속눈썹을 뺀 나머지). 홍채 아래 복원")
    add(f"Eye_{side}_Iris", "06_Face/Eyes", z0 + 1, True, side, True,
        {"sam": [sam((cx - 60, 800, cx + 60, 915), [(cx, 858)])], "extend": ext((cx - 60, 795, cx + 60, 915), grow=25)},
        "홍채+동공+하이라이트")
    add(f"Eye_{side}_Lashes", "06_Face/Eyes", z0 + 2, True, side, False,
        {"dark": {"box": list(bx), "max": 110}}, "속눈썹·윗눈꺼풀선")
    for i, v in enumerate(EYE_VARIANTS):
        add(f"Eye_{side}_{v}", "06_Face/Eyes", z0 + 3 + i, False, side, False,
            {"expr": {"name": EYE_EXPR[v], "region": f"eye_{side}"}}, f"표정 변형({EYE_EXPR[v]})")

add("Brow_R", "06_Face/Brows", 111, True, "R", True,
    {"draw": {"arc": [[1110, 790], [1170, 768], [1240, 775]], "width": 7}}, "앞머리 아래 가는 호. 직접 그림")
add("Brow_L", "06_Face/Brows", 112, True, "L", True,
    {"draw": {"arc": [[1350, 775], [1420, 768], [1480, 790]], "width": 7}}, "앞머리 아래 가는 호. 직접 그림")

MOUTH_BOX = [1245, 925, 1370, 990]  # 옷깃 빨간 선(x>1370, y>990)이 들어오지 않게 입선 주변만
MOUTH_EXPR_BOX = [1224, 892, 1400, 1034]  # 열린 입·혀(playful 입꼬리 x≈1386, sleepy 윗선 y≈905)가 상자 경계에 닿으면 평평하게 잘린다. 옷깃 인페인팅 노이즈는 작은 조각 제거(400px)로 거른다
add("Mouth_Line", "06_Face/Mouth", 115, True, None, False, {"dark": {"box": MOUTH_BOX, "max": 190, "red": 30}}, "닫힌 입(미소선)")
for i, (v, name) in enumerate([("Open", "mouth_open"), ("O", "mouth_o"), ("Smile", "happy"), ("Grin", "playful"),
                               ("Curious", "curious"), ("Annoyed", "annoyed"), ("Sleepy", "sleepy"), ("Frown", "concerned")]):
    add(f"Mouth_{v}", "06_Face/Mouth", 116 + i, v in ("Open", "O", "Smile"), None, False,
        {"expr": {"name": name, "region": "mouth", "box": MOUTH_EXPR_BOX}}, f"표정 변형({name})")

add("Hair_Side_R", "07_HairFront", 130, True, "R", False,
    {"sam": [sam((1000, 1080, 1150, 1560), [(1070, 1200), (1080, 1350), (1060, 1500)])]}, "화면 왼쪽 어깨 앞 땋은 옆머리. 소매 위 잔가닥은 소매에 남김")
add("Hair_Side_L", "07_HairFront", 131, True, "L", False,
    {"sam": [sam((1500, 1230, 1620, 1720), [(1545, 1300), (1545, 1420), (1560, 1550)])]}, "화면 오른쪽 어깨 앞 땋은 옆머리")
add("Hair_Front", "07_HairFront", 132, True, None, True,
    {"sam": [sam((960, 280, 1640, 930), [(1300, 450), (1100, 600), (1500, 600), (1300, 700), (1050, 780), (1560, 780)],
                 [(1290, 900), (1290, 1000), (1182, 858), (1412, 858)])],
     "clip": {"poly": [[960, 280], [1640, 280], [1640, 930], [1510, 930], [1510, 805], [1330, 805], [1330, 930],
                       [1275, 930], [1275, 805], [1090, 805], [1090, 930], [960, 930]]},
     "fallback": {"box": [960, 280, 1640, 640]},
     "extend": ext((960, 280, 1640, 930))},
    "정수리~앞머리 한 덩어리. 귀·매듭·가면·술 장식 아래 복원")
add("Hair_Knot", "07_HairFront", 133, True, None, False,
    {"sam": [sam((1235, 290, 1350, 400), [(1292, 345)])], "dilate": 3}, "정수리 붉은 끈 매듭")

add("Ear_R", "08_Ears", 140, True, "R", False,
    {"sam": [sam((860, 140, 1270, 580), [(1050, 330), (1000, 450), (1150, 400)], [(1200, 560)])]}, "화면 왼쪽 여우 귀")
add("Ear_L", "08_Ears", 141, True, "L", True,
    {"sam": [sam((1400, 140, 1760, 580), [(1560, 300), (1650, 450)], [(1560, 520)])],
     "extend": ext((1400, 140, 1760, 600), grow=40)},
    "화면 오른쪽 여우 귀. 가면에 가린 부분 복원")

add("Mask_Fox", "09_Mask", 150, True, None, False,
    {"sam": [sam((1400, 340, 1720, 720), [(1560, 520)], [(1500, 650)]),
             sam((1330, 280, 1480, 500), [(1390, 380), (1410, 330), (1385, 470)], [(1340, 450), (1460, 290)])],
     "dilate": 3}, "여우 가면(왼쪽 귀 포함)")
add("Mask_Tassel", "09_Mask", 151, True, None, False,
    {"sam": [sam((1395, 575, 1600, 880), [(1470, 650), (1460, 760), (1505, 660), (1545, 800)], [(1580, 760)])], "dilate": 3},
    "가면 아래 붉은 매듭·방울·술")

add("Tassel_R", "10_Tassels", 160, True, "R", False,
    {"sam": [sam((780, 560, 1020, 1320), [(880, 770), (910, 870), (960, 1030), (900, 650), (870, 1250), (960, 1230)])], "dilate": 3}, "화면 왼쪽 방울 술 장식")
add("Tassel_L", "10_Tassels", 161, True, "L", False,
    {"sam": [sam((1560, 560, 1770, 1320), [(1700, 740), (1690, 760), (1620, 1030), (1700, 1120), (1650, 650), (1620, 1230), (1700, 1250), (1740, 950)], [(1600, 780)])], "dilate": 3},
    "화면 오른쪽 방울 술 장식")
add("Ofuda", "10_Tassels", 162, True, None, False,
    {"sam": [sam((1540, 670, 1655, 880), [(1595, 770)])], "dilate": 3}, "술 장식에 매달린 부적")


def build_plan() -> dict:
    zs = [l["z"] for l in LAYERS]
    assert len(zs) == len(set(zs)), "z duplicate"
    ids = [l["id"] for l in LAYERS]
    assert len(ids) == len(set(ids)), "id duplicate"
    return {
        "$schema": "../../../docs/live2d-layer-contract.json",
        "version": 1,
        "model": {"id": "kiriko-upper-body", "name": "Kiriko_UpperBody", "scope": "upper_body"},
        "canvas": {"width": CANVAS[0], "height": CANVAS[1], "colorMode": "RGB", "bitDepth": 8, "colorProfile": "sRGB"},
        "sideConvention": "character",
        "naming": {
            "pattern": "^[A-Za-z][A-Za-z0-9_]*$",
            "sideSuffix": {"left": "_L", "right": "_R"},
            "excludeSuffixes": ["_REF", "_GUIDE", "_TMP"],
            "guidePrefix": "Guide",
        },
        "reference": {
            "file": "../../reference/private/kiriko-base-prepared.png",
            "upperBodyCrop": [0, 0, CANVAS[0], CANVAS[1]],
            "note": "2530x3006 RGBA 2D 셀 셰이딩 정리본(normalize_base.py). 머리 끝~하카마 상단, 하단은 캔버스 절단면. "
                    "assets/reference/kiriko.png(3D 렌더)는 사용하지 않는다.",
        },
        "expressions": "../output/expressions/<name>.full.png",
        "groups": sorted({l["group"] for l in LAYERS}),
        "layers": LAYERS,
    }


def build_docs(plan: dict) -> str:
    L = plan["layers"]
    c, m, r = plan["canvas"], plan["model"], plan["reference"]
    lines = [
        "# 키리코 Live2D 파츠 목록", "",
        "> `python tools/live2d-authoring/make_layer_plan.py --docs docs/live2d-kiriko-parts.md` 로 생성. 직접 편집하지 말 것.", "",
        f"- 모델: `{m['name']}` (`{m['id']}`, scope `{m['scope']}`)",
        f"- 캔버스: {c['width']}x{c['height']} {c['colorMode']} {c['bitDepth']}bit {c['colorProfile']} (정리본과 동일 좌표계)",
        "- 좌우 표기: **캐릭터 기준** (`_L`=캐릭터 왼쪽=화면 오른쪽, `_R`=캐릭터 오른쪽=화면 왼쪽)",
        f"- 레이어 {len(L)}개 · 필수 {sum(l['required'] for l in L)} · 복원 필요 {sum(l['restore'] for l in L)} · "
        f"내보내기 제외 {sum(bool(l.get('exportExcluded')) for l in L)}",
        f"- 레퍼런스: `{r['file']}` — {r['note']}",
        "- 분리: `cut_parts.py` 가 `cut` 힌트(SAM 박스·점, 밝기 임계, 표정 변형, 직접 그리기)로 파츠 PNG 를 만들고, "
        "`extend` 범위의 가려진 부분을 cv2/SDXL 인페인팅으로 복원한다.",
        "", "## 레이어", "", "| z | 그룹 | 레이어 | 필수 | 복원 | 분리 힌트 | 비고 |", "|---|---|---|---|---|---|---|",
    ]
    for l in sorted(L, key=lambda l: l["z"]):
        cut = l.get("cut") or {}
        hint = []
        if "sam" in cut:
            hint.append("SAM " + " ∪ ".join(str(s["box"]) for s in cut["sam"]))
        if "box" in cut:
            hint.append(f"box {cut['box']}")
        if "dark" in cut:
            hint.append(f"dark≤{cut['dark']['max']} {cut['dark']['box']}")
        if "expr" in cut:
            hint.append(f"expr {cut['expr']['name']}/{cut['expr']['region']}")
        if "draw" in cut:
            hint.append("draw arc")
        if "fallback" in cut:
            hint.append("fallback " + str(cut["fallback"].get("box") or "poly"))
        if "extend" in cut:
            hint.append(f"extend {cut['extend']['method']} {cut['extend'].get('box') or 'poly'}")
        note = ("내보내기 제외. " if l.get("exportExcluded") else "") + (l.get("note") or "")
        lines.append(f"| {l['z']} | {l['group']} | `{l['id']}` | {'O' if l['required'] else ''} | "
                     f"{'O' if l['restore'] else ''} | {'; '.join(hint)} | {note} |")
    lines += ["", "## 복원(가려진 부분 그려넣기) 대상", "",
              "원본에서 가려져 있어 `extend` 범위를 인페인팅(평탄한 곳은 cv2, 질감 있는 곳은 SDXL)으로 채우는 레이어.", "",
              *[f"- `{l['id']}` — {l['cut']['extend']['method'] if 'extend' in l['cut'] else 'draw'}" for l in L if l["restore"]], "",
              "## 그룹", "", *[f"- `{g}`" for g in plan["groups"]], ""]
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
