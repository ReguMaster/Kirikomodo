# 키리코 Live2D 파츠 목록

> `python tools/live2d-authoring/make_layer_plan.py --docs docs/live2d-kiriko-parts.md` 로 생성. 직접 편집하지 말 것.

- 모델: `Kiriko_UpperBody` (`kiriko-upper-body`, scope `upper_body`)
- 캔버스: 2530x3006 RGB 8bit sRGB (정리본과 동일 좌표계)
- 좌우 표기: **캐릭터 기준** (`_L`=캐릭터 왼쪽=화면 오른쪽, `_R`=캐릭터 오른쪽=화면 왼쪽)
- 레이어 59개 · 필수 40 · 복원 필요 18 · 내보내기 제외 1
- 레퍼런스: `../../reference/private/kiriko-base-prepared.png` — 2530x3006 RGBA 2D 셀 셰이딩 정리본(normalize_base.py). 머리 끝~하카마 상단, 하단은 캔버스 절단면. assets/reference/kiriko.png(3D 렌더)는 사용하지 않는다.
- 분리: `cut_parts.py` 가 `cut` 힌트(SAM 박스·점, 밝기 임계, 표정 변형, 직접 그리기)로 파츠 PNG 를 만들고, `extend` 범위의 가려진 부분을 cv2/SDXL 인페인팅으로 복원한다.

## 레이어

| z | 그룹 | 레이어 | 필수 | 복원 | 분리 힌트 | 비고 |
|---|---|---|---|---|---|---|
| 0 | 00_Guide | `Guide_Center_GUIDE` |  |  |  | 내보내기 제외. 정중앙 세로선 x=1297.5·눈높이 y=850 가이드. 최종 출력 제외 |
| 5 | 03_Body | `Legs` | O |  | fallback [550, 2650, 1950, 3006] | 치마 아래 허벅지. 하단은 캔버스 절단면 |
| 10 | 01_Back/Tail | `Tail` | O | O | SAM [100, 950, 800, 1900] ∪ [100, 1700, 800, 2750]; fallback poly; extend sdxl [600, 1500, 1150, 2500] | 화면 왼쪽 큰 여우 꼬리. 뿌리 쪽이 뒷머리·치마에 가려짐 → 복원 |
| 19 | 02_HairBack | `Hair_Back_Center` |  | O | extend sdxl poly | 몸통 뒤 뒷머리. 원본에서 전부 가려짐 → 디퓨전으로 제작 |
| 20 | 02_HairBack | `Hair_Back_R` | O | O | SAM [430, 930, 930, 1800] ∪ [430, 1700, 930, 2470]; fallback poly; extend cv2 [430, 930, 1000, 2470] | 화면 왼쪽 뒷머리. 꼬리 앞, 소매 뒤 |
| 21 | 02_HairBack | `Hair_Back_L` | O | O | SAM [1680, 880, 2330, 1800] ∪ [1680, 1700, 2330, 2420]; fallback poly; extend sdxl [1600, 880, 2330, 2420] | 화면 오른쪽 뒷머리. 소매 뒤 |
| 30 | 03_Body | `Neck` | O | O | box [1225, 985, 1360, 1085]; fallback [1180, 900, 1420, 1230]; extend cv2 [1200, 985, 1390, 1220] | 털 깃 아래까지 복원 |
| 31 | 03_Body | `Torso` | O | O | SAM [1050, 1150, 1560, 1760]; fallback poly; extend cv2 [880, 1150, 1720, 2250] | 맨 어깨 + 흰 상의. 털 깃·가슴 방울·허리 리본·소매 아래 복원 |
| 33 | 03_Body | `Apron` | O | O | SAM [380, 1750, 2120, 3006]; fallback poly; extend sdxl [900, 1750, 1700, 2750] | 벚꽃 무늬 흰 앞치마. 허리 리본·손 아래 복원 |
| 34 | 03_Body | `Hakama` | O |  | SAM [560, 2500, 1950, 3006]; fallback poly | 붉은 하카마. 하단은 캔버스 절단면. 앞치마 박스에서 자기 픽셀을 가져가도록 z 를 앞치마보다 높게 둠 |
| 35 | 03_Body | `Hands` | O |  | SAM [1180, 2380, 1310, 2670] ∪ [1290, 2400, 1435, 2670] | 앞으로 모은 두 손(주먹마다 상자 하나. 한 상자로는 오른쪽 주먹 바깥이 빠짐) |
| 40 | 04_Arms | `Sleeve_R` | O | O | SAM [580, 1360, 1220, 1950] ∪ [580, 1800, 1220, 2520] ∪ [200, 2400, 620, 2920] ∪ [560, 1870, 800, 2170] ∪ [740, 1500, 900, 1830]; fallback poly; extend cv2 [840, 1300, 1250, 1800] | 화면 왼쪽 분리형 소매(어깨 프릴·매듭 포함). 어깨 앞 머리칼 아래 복원 |
| 41 | 04_Arms | `Sleeve_L` | O | O | SAM [1460, 1360, 2020, 1950] ∪ [1460, 1800, 2020, 2520] ∪ [1920, 2400, 2360, 2920] ∪ [1800, 1870, 2010, 2210] ∪ [1720, 1500, 1830, 1820]; fallback poly; extend cv2 [1400, 1300, 1760, 1800] | 화면 오른쪽 분리형 소매. 어깨 앞 머리칼 아래 복원 |
| 50 | 04_HairOver | `Hair_Over_R` | O |  | SAM [930, 1100, 1200, 1760] | 화면 왼쪽 어깨 앞으로 흘러내린 머리칼. 몸통·소매 앞, 땋은 머리 뒤 |
| 51 | 04_HairOver | `Hair_Over_L` | O |  | SAM [1420, 1100, 1620, 1760] | 화면 오른쪽 어깨 앞으로 흘러내린 머리칼 |
| 60 | 05_Accessories | `Ribbon_Waist` | O |  | SAM [1000, 1660, 1600, 1950] ∪ [1120, 1900, 1480, 2220] ∪ [1110, 1660, 1500, 2220] | 허리 큰 붉은 리본과 방울 |
| 61 | 05_Accessories | `Bell_Chest` | O |  | SAM [1200, 1060, 1470, 1580] ∪ [1260, 1480, 1350, 1670] | 가슴 방울과 목에서 내려오는 붉은 끈·술. 털 깃에 겹치는 부분은 털 깃(z 62)이 가져감 |
| 62 | 05_Accessories | `Fur_Collar` | O |  | SAM [1110, 990, 1500, 1220] | 목 털 깃 |
| 70 | 06_Face | `Face_Base` | O | O | SAM [1050, 560, 1540, 1030]; extend cv2 [1050, 560, 1540, 1030] | 얼굴 피부(코·홍조 포함). 앞머리 아래 이마, 눈·입 아래 피부 복원 |
| 80 | 06_Face/Eyes | `Eye_R_White` | O | O | SAM [1085, 775, 1280, 925]; extend cv2 [1085, 775, 1280, 925] | 흰자(눈 전체 마스크에서 홍채·속눈썹을 뺀 나머지). 홍채 아래 복원 |
| 81 | 06_Face/Eyes | `Eye_R_Iris` | O | O | SAM [1122, 800, 1242, 915]; extend cv2 [1122, 795, 1242, 915] | 홍채+동공+하이라이트 |
| 82 | 06_Face/Eyes | `Eye_R_Lashes` | O |  | dark≤110 [1085, 775, 1280, 925] | 속눈썹·윗눈꺼풀선 |
| 83 | 06_Face/Eyes | `Eye_R_Closed` |  |  | expr closed/eye_R | 표정 변형(closed) |
| 84 | 06_Face/Eyes | `Eye_R_Half` |  |  | expr half/eye_R | 표정 변형(half) |
| 85 | 06_Face/Eyes | `Eye_R_Wide` |  |  | expr wide/eye_R | 표정 변형(wide) |
| 86 | 06_Face/Eyes | `Eye_R_Teary` |  |  | expr teary/eye_R | 표정 변형(teary) |
| 87 | 06_Face/Eyes | `Eye_R_Glare` |  |  | expr glare/eye_R | 표정 변형(glare) |
| 88 | 06_Face/Eyes | `Eye_R_Sleepy` |  |  | expr sleepy/eye_R | 표정 변형(sleepy) |
| 95 | 06_Face/Eyes | `Eye_L_White` | O | O | SAM [1315, 775, 1510, 925]; extend cv2 [1315, 775, 1510, 925] | 흰자(눈 전체 마스크에서 홍채·속눈썹을 뺀 나머지). 홍채 아래 복원 |
| 96 | 06_Face/Eyes | `Eye_L_Iris` | O | O | SAM [1352, 800, 1472, 915]; extend cv2 [1352, 795, 1472, 915] | 홍채+동공+하이라이트 |
| 97 | 06_Face/Eyes | `Eye_L_Lashes` | O |  | dark≤110 [1315, 775, 1510, 925] | 속눈썹·윗눈꺼풀선 |
| 98 | 06_Face/Eyes | `Eye_L_Closed` |  |  | expr closed/eye_L | 표정 변형(closed) |
| 99 | 06_Face/Eyes | `Eye_L_Half` |  |  | expr half/eye_L | 표정 변형(half) |
| 100 | 06_Face/Eyes | `Eye_L_Wide` |  |  | expr wide/eye_L | 표정 변형(wide) |
| 101 | 06_Face/Eyes | `Eye_L_Teary` |  |  | expr teary/eye_L | 표정 변형(teary) |
| 102 | 06_Face/Eyes | `Eye_L_Glare` |  |  | expr glare/eye_L | 표정 변형(glare) |
| 103 | 06_Face/Eyes | `Eye_L_Sleepy` |  |  | expr sleepy/eye_L | 표정 변형(sleepy) |
| 111 | 06_Face/Brows | `Brow_R` | O | O | draw arc | 앞머리 아래 가는 호. 직접 그림 |
| 112 | 06_Face/Brows | `Brow_L` | O | O | draw arc | 앞머리 아래 가는 호. 직접 그림 |
| 115 | 06_Face/Mouth | `Mouth_Line` | O |  | dark≤190 [1245, 925, 1370, 990] | 닫힌 입(미소선) |
| 116 | 06_Face/Mouth | `Mouth_Open` | O |  | expr mouth_open/mouth | 표정 변형(mouth_open) |
| 117 | 06_Face/Mouth | `Mouth_O` | O |  | expr mouth_o/mouth | 표정 변형(mouth_o) |
| 118 | 06_Face/Mouth | `Mouth_Smile` | O |  | expr happy/mouth | 표정 변형(happy) |
| 119 | 06_Face/Mouth | `Mouth_Grin` |  |  | expr playful/mouth | 표정 변형(playful) |
| 120 | 06_Face/Mouth | `Mouth_Curious` |  |  | expr curious/mouth | 표정 변형(curious) |
| 121 | 06_Face/Mouth | `Mouth_Annoyed` |  |  | expr annoyed/mouth | 표정 변형(annoyed) |
| 122 | 06_Face/Mouth | `Mouth_Sleepy` |  |  | expr sleepy/mouth | 표정 변형(sleepy) |
| 123 | 06_Face/Mouth | `Mouth_Frown` |  |  | expr concerned/mouth | 표정 변형(concerned) |
| 130 | 07_HairFront | `Hair_Side_R` | O |  | SAM [1000, 1080, 1150, 1560] | 화면 왼쪽 어깨 앞 땋은 옆머리. 소매 위 잔가닥은 소매에 남김 |
| 131 | 07_HairFront | `Hair_Side_L` | O |  | SAM [1500, 1230, 1620, 1720] | 화면 오른쪽 어깨 앞 땋은 옆머리 |
| 132 | 07_HairFront | `Hair_Front` | O | O | SAM [960, 280, 1640, 930]; fallback [960, 280, 1640, 640]; extend cv2 [960, 280, 1640, 930] | 정수리~앞머리 한 덩어리. 귀·매듭·가면·술 장식 아래 복원 |
| 133 | 07_HairFront | `Hair_Knot` | O |  | SAM [1235, 290, 1350, 400] | 정수리 붉은 끈 매듭 |
| 140 | 08_Ears | `Ear_R` | O |  | SAM [860, 140, 1270, 580] | 화면 왼쪽 여우 귀 |
| 141 | 08_Ears | `Ear_L` | O | O | SAM [1400, 140, 1760, 580]; extend cv2 [1400, 140, 1760, 600] | 화면 오른쪽 여우 귀. 가면에 가린 부분 복원 |
| 150 | 09_Mask | `Mask_Fox` | O |  | SAM [1400, 340, 1720, 720] ∪ [1330, 280, 1480, 500] | 여우 가면(왼쪽 귀 포함) |
| 151 | 09_Mask | `Mask_Tassel` | O |  | SAM [1395, 575, 1600, 880] | 가면 아래 붉은 매듭·방울·술 |
| 160 | 10_Tassels | `Tassel_R` | O |  | SAM [780, 560, 1020, 1320] | 화면 왼쪽 방울 술 장식 |
| 161 | 10_Tassels | `Tassel_L` | O |  | SAM [1560, 560, 1770, 1320] | 화면 오른쪽 방울 술 장식 |
| 162 | 10_Tassels | `Ofuda` | O |  | SAM [1540, 670, 1655, 880] | 술 장식에 매달린 부적 |

## 복원(가려진 부분 그려넣기) 대상

원본에서 가려져 있어 `extend` 범위를 인페인팅(평탄한 곳은 cv2, 질감 있는 곳은 SDXL)으로 채우는 레이어.

- `Tail` — sdxl
- `Hair_Back_Center` — sdxl
- `Hair_Back_R` — cv2
- `Hair_Back_L` — sdxl
- `Neck` — cv2
- `Torso` — cv2
- `Apron` — sdxl
- `Sleeve_R` — cv2
- `Sleeve_L` — cv2
- `Face_Base` — cv2
- `Eye_R_White` — cv2
- `Eye_R_Iris` — cv2
- `Eye_L_White` — cv2
- `Eye_L_Iris` — cv2
- `Brow_R` — draw
- `Brow_L` — draw
- `Hair_Front` — cv2
- `Ear_L` — cv2

## 그룹

- `00_Guide`
- `01_Back/Tail`
- `02_HairBack`
- `03_Body`
- `04_Arms`
- `04_HairOver`
- `05_Accessories`
- `06_Face`
- `06_Face/Brows`
- `06_Face/Eyes`
- `06_Face/Mouth`
- `07_HairFront`
- `08_Ears`
- `09_Mask`
- `10_Tassels`
