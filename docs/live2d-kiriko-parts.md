# 키리코 Live2D 파츠 목록 (상반신)

> `python tools/live2d-authoring/make_layer_plan.py --docs docs/live2d-kiriko-parts.md` 로 생성. 직접 편집하지 말 것.

- 모델: `Kiriko_UpperBody` (`kiriko-upper-body`, scope `upper_body`)
- 캔버스: 1024x1400 RGB 8bit sRGB
- 좌우 표기: **캐릭터 기준** (`_L`=캐릭터 왼쪽, `_R`=캐릭터 오른쪽). 명세 16.4 의 화면 기준 `Arm_*_Left` 는 `Arm_*_R` 로 옮김
- 레이어 76개 · 필수 51 · 복원 필요 17 · 내보내기 제외 3
- 레퍼런스: `../../reference/kiriko.png` 상반신 크롭 [0, 0, 732, 1000] — 732x2048 RGBA 전신 3D 렌더. 상반신 크롭은 머리 끝~허리 매듭·늘어진 구슬까지. 비주얼 레퍼런스이며 최종 리깅 PSD 원본이 아니다(명세 16.14).

## 범위

상반신(머리~허리 매듭)만 포함한다. 전신(하반신·다리·신발·꼬리 장식 하단)은 scope `full_body` 계획을 따로 만들 때 추가하며, 파이프라인·캔버스 규칙·PSD 그룹 구조는 그대로 재사용한다.

## 레이어

| z | 그룹 | 레이어 | 필수 | 복원 | 초안 ROI·색 | 비고 |
|---|---|---|---|---|---|---|
| 0 | 00_Guide | `Guide_Center_GUIDE` |  |  |  | 내보내기 제외. 정중앙 세로선·눈높이 가이드. 최종 출력 제외 |
| 1 | 00_Guide | `Eye_L_BlinkGuide_GUIDE` |  |  |  | 내보내기 제외.  |
| 2 | 00_Guide | `Eye_R_BlinkGuide_GUIDE` |  |  |  | 내보내기 제외.  |
| 10 | 01_Head/HairBack | `Hair_Back_Center` | O | O | [200, 60, 440, 340] hair | 기준 이미지에서 거의 보이지 않음. 복원 제작 |
| 11 | 01_Head/HairBack | `Hair_Back_L` | O | O |  | 복원 제작 |
| 12 | 01_Head/HairBack | `Hair_Back_R` | O | O |  | 복원 제작 |
| 15 | 01_Head/Mask | `Headband_Back` | O | O |  | 머리띠 뒷부분, 복원 |
| 20 | 02_Body/Neck | `Neck` | O |  | [270, 290, 360, 370] skin |  |
| 22 | 02_Body/Torso | `Torso_Upper_Base` | O | O |  | 옷 안쪽 몸통. 회전 시 노출 영역 복원 |
| 24 | 02_Body/Torso | `Shoulder_L` | O | O | [400, 340, 560, 470] white | 캐릭터 왼어깨(화면 오른쪽). 뒤로 돌아간 어깨, 정면 재해석 |
| 25 | 02_Body/Torso | `Shoulder_R` | O |  | [130, 330, 230, 440] white |  |
| 30 | 02_Body/Clothes | `Cloth_Upper_White_Base` | O |  | [150, 330, 560, 640] white |  |
| 32 | 02_Body/Clothes | `Cloth_Collar_Inner_Red` | O |  | [250, 350, 380, 430] red |  |
| 34 | 02_Body/Clothes | `Cloth_Chest_Logo` | O |  | [295, 410, 355, 465] red |  |
| 36 | 02_Body/Straps | `Strap_L` | O |  | [360, 350, 560, 600] gray |  |
| 37 | 02_Body/Straps | `Strap_R` | O |  | [160, 400, 300, 580] gray |  |
| 38 | 02_Body/Straps | `Shoulder_Pad_L` |  |  | [380, 340, 470, 420] gray |  |
| 39 | 02_Body/Straps | `Shoulder_Pad_R` |  |  |  |  |
| 40 | 03_Arms/Left | `Arm_Upper_L` |  | O | [500, 430, 620, 700] skin | 캐릭터 왼팔(화면 오른쪽), 내린 팔. 크롭 하단에서 잘림 → 복원 |
| 41 | 03_Arms/Left | `Arm_Lower_L` |  | O | [520, 700, 640, 900] skin |  |
| 42 | 03_Arms/Left | `Hand_L_Rest` |  | O | [510, 820, 640, 1000] red | 크롭 범위 밖까지 이어짐 |
| 43 | 03_Arms/Left | `Glove_L` |  | O |  |  |
| 50 | 04_Accessories/Waist | `Waist_Armor_Front` | O |  | [110, 530, 480, 760] red |  |
| 52 | 04_Accessories/Waist | `Waist_Beads_Alt_Shadow` |  |  |  |  |
| 54 | 04_Accessories/Waist | `Waist_Beads_Main` | O |  | [130, 600, 450, 700] white |  |
| 55 | 04_Accessories/Waist | `Waist_Belt` | O |  | [150, 650, 450, 730] gray |  |
| 56 | 04_Accessories/Waist | `Waist_Knot_L` | O |  | [280, 820, 350, 900] white |  |
| 57 | 04_Accessories/Waist | `Waist_Knot_R` | O |  | [210, 820, 285, 900] white |  |
| 58 | 04_Accessories/Waist | `Waist_Hanging_Orbs` | O |  | [255, 700, 320, 830] dark |  |
| 60 | 01_Head/Face | `Head_Base` | O | O | [215, 170, 400, 345] skin | 앞머리·가면 아래 이마 윤곽 복원 |
| 62 | 90_Shadow_Adjust | `Face_Shadow` |  |  |  |  |
| 64 | 01_Head/Face | `Ear_L` |  | O |  | 기준 이미지에서 머리카락에 가려짐 |
| 65 | 01_Head/Face | `Ear_R` |  | O |  |  |
| 70 | 01_Head/Eyes | `Eye_L_White` | O |  | [305, 215, 355, 255] white |  |
| 71 | 01_Head/Eyes | `Eye_R_White` | O |  | [235, 220, 285, 260] white |  |
| 72 | 01_Head/Eyes | `Eye_L_Iris` | O |  | [305, 215, 355, 255] dark |  |
| 73 | 01_Head/Eyes | `Eye_R_Iris` | O |  | [235, 220, 285, 260] dark |  |
| 74 | 01_Head/Eyes | `Eye_L_Pupil` | O |  |  |  |
| 75 | 01_Head/Eyes | `Eye_R_Pupil` | O |  |  |  |
| 76 | 01_Head/Eyes | `Eye_L_Highlight` | O |  |  |  |
| 77 | 01_Head/Eyes | `Eye_R_Highlight` | O |  |  |  |
| 78 | 01_Head/Eyes | `Eye_L_LowerLid` | O |  |  |  |
| 79 | 01_Head/Eyes | `Eye_R_LowerLid` | O |  |  |  |
| 80 | 01_Head/Eyes | `Eye_L_UpperLid` | O |  |  |  |
| 81 | 01_Head/Eyes | `Eye_R_UpperLid` | O |  |  |  |
| 82 | 01_Head/Eyes | `Eye_L_Lashes` | O |  |  |  |
| 83 | 01_Head/Eyes | `Eye_R_Lashes` | O |  |  |  |
| 88 | 01_Head/Brows | `Brow_L` | O |  | [300, 200, 360, 230] dark |  |
| 89 | 01_Head/Brows | `Brow_R` | O |  | [230, 205, 290, 235] dark |  |
| 90 | 01_Head/Face | `Nose_Base` |  |  |  |  |
| 92 | 01_Head/Mouth | `Mouth_Inner` | O | O |  | 닫힌 입이라 내부 미노출. 제작 필요 |
| 93 | 01_Head/Mouth | `Teeth_Upper` |  | O |  |  |
| 94 | 01_Head/Mouth | `Tongue` |  | O |  |  |
| 95 | 01_Head/Mouth | `Mouth_Open` | O | O |  |  |
| 96 | 01_Head/Mouth | `Mouth_Line` | O |  | [265, 275, 325, 305] red |  |
| 98 | 01_Head/Face | `Cheek_L_Blush` |  |  | [330, 240, 365, 270] red |  |
| 99 | 01_Head/Face | `Cheek_R_Blush` |  |  | [230, 245, 265, 275] red |  |
| 100 | 01_Head/HairFront | `Hair_Side_L` | O |  | [370, 180, 430, 300] hair |  |
| 101 | 01_Head/HairFront | `Hair_Side_R` | O |  | [200, 180, 260, 320] hair |  |
| 103 | 90_Shadow_Adjust | `Hair_Bangs_Shadow` |  |  |  |  |
| 104 | 01_Head/HairFront | `Hair_Front_Center` | O |  | [270, 180, 360, 240] hair |  |
| 105 | 01_Head/HairFront | `Hair_Front_L_1` | O |  | [330, 180, 400, 250] hair |  |
| 106 | 01_Head/HairFront | `Hair_Front_L_2` | O |  |  |  |
| 107 | 01_Head/HairFront | `Hair_Front_R_1` | O |  | [220, 185, 290, 260] hair |  |
| 108 | 01_Head/HairFront | `Hair_Front_R_2` | O |  |  |  |
| 110 | 01_Head/HairFront | `Hair_Top_Tuft` | O |  | [300, 20, 440, 140] hair |  |
| 120 | 01_Head/Mask | `Mask_Fox_Base` | O |  | [190, 100, 400, 235] red |  |
| 122 | 01_Head/Mask | `Mask_Fox_Horn_L` | O |  | [300, 90, 360, 150] white |  |
| 123 | 01_Head/Mask | `Mask_Fox_Horn_R` | O |  | [185, 120, 250, 185] white |  |
| 124 | 01_Head/Mask | `Mask_Detail_Decal` |  |  | [225, 120, 300, 175] white |  |
| 126 | 01_Head/Mask | `Headband_Base` | O |  | [200, 140, 420, 250] dark |  |
| 130 | 03_Arms/Right | `Arm_Upper_R` |  |  | [40, 430, 200, 620] skin | 캐릭터 오른팔(화면 왼쪽), 부적을 든 팔. 명세 16.4 Arm_*_Left에 해당 |
| 131 | 03_Arms/Right | `Arm_Lower_R` |  |  | [60, 300, 190, 460] skin |  |
| 132 | 03_Arms/Right | `Glove_R` |  |  | [55, 330, 180, 500] red |  |
| 133 | 03_Arms/Right | `Hand_R_Gesture` |  |  | [70, 240, 190, 370] skin | 세운 검지+부적 포즈를 하나의 파츠로 처리 |
| 134 | 04_Accessories/Ofuda | `Ofuda_Paper` |  |  | [0, 150, 165, 320] white |  |

## 복원(가려진 부분 그려넣기) 대상 — K-02/K-04

레퍼런스에서 가려져 있어 전체 형태를 사람이 그려 넣어야 하는 레이어. `draft_split.py` 초안은 보이는 부분만 추출한다.

- `Hair_Back_Center`
- `Hair_Back_L`
- `Hair_Back_R`
- `Headband_Back`
- `Torso_Upper_Base`
- `Shoulder_L`
- `Arm_Upper_L`
- `Arm_Lower_L`
- `Hand_L_Rest`
- `Glove_L`
- `Head_Base`
- `Ear_L`
- `Ear_R`
- `Mouth_Inner`
- `Teeth_Upper`
- `Tongue`
- `Mouth_Open`

## 그룹(PSD 폴더)

- `00_Guide`
- `01_Head/Brows`
- `01_Head/Eyes`
- `01_Head/Face`
- `01_Head/HairBack`
- `01_Head/HairFront`
- `01_Head/Mask`
- `01_Head/Mouth`
- `02_Body/Clothes`
- `02_Body/Neck`
- `02_Body/Straps`
- `02_Body/Torso`
- `03_Arms/Left`
- `03_Arms/Right`
- `04_Accessories/Ofuda`
- `04_Accessories/Waist`
- `90_Shadow_Adjust`
