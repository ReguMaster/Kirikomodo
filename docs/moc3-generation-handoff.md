# moc3 직접 생성 — 인수인계

2026-10-10 작성. 이어받는 세션이 처음부터 다시 조사하지 않도록, 확인된 사실과 아직 모르는 것을 구분해 적는다.

## 결정 사항
- 개발자님 결정: 키리코 Live2D 모델을 **Cubism Editor 없이 `.moc3` 를 직접 생성**해서 만든다. 개인 프로젝트이며 레퍼런스(`assets/reference/kiriko.png`)로 모델을 만드는 것을 허용했다. 배포·공개 시에는 `docs/asset-rights.md` 의 권리 검토가 다시 필요하다.
- 이번 세션에서는 개발자님이 웹 검색 도구 사용을 거절해서 외부 포맷 자료를 전혀 보지 않았고, 아래 내용은 모두 Haru 샘플 + Core 로 직접 확인한 것이다. 이후 개발자님이 **무인 작업으로 모든 권한을 허락**했다. 웹 조사·도구 설치·서브에이전트 병렬 작업을 자유롭게 해도 되고, 질문 없이 기본값으로 진행한다. 공개된 moc3 해독 자료가 있을 수 있으나 아직 확인하지 못했으니 가장 먼저 찾아볼 것.
- 목표는 **어떤 방법으로든, 완벽한 2D 귀여운 애니메이션 스타일의 키리코 Live2D 모델을 만드는 것**이다("아트 방향" 절). 앞의 "합격 기준"은 그대로 유지한다(해냈다는 보고가 사실이어야 하기 때문).
- 명세 154행: **가짜·빈 moc3 금지.** 합격 기준은 (1) Core 가 열 것, (2) 파라미터가 실제로 드로어블을 움직일 것, (3) 앱에서 육안으로 그려질 것. 셋 다 확인하기 전에는 모델 완성으로 표시하지 않는다.

## 이번 세션에서 만든 것
| 파일 | 역할 |
|---|---|
| `external/live2dcubismcore/` | Core 4.2.2 (jsDelivr `live2dcubismcore@1.0.2`, "Redistributable Code"). 앱이 내장 사용 |
| `tools/moc3/inspect-core.cjs` | **판정기.** moc3 를 Core 로 열어 유효성·파라미터·파츠·드로어블(정점 bbox)을 출력, `ParamX=값` 으로 파라미터를 움직여 어떤 드로어블이 변하는지 확인. Core 가 거부하면 `INVALID` + Core 로그, 종료 코드 1 |
| `tools/moc3/dump-header.py` | 헤더·섹션 오프셋 표·개수 표·캔버스 값 덤프 |
| `tools/moc3/selftest.cjs` (`npm run test:moc3`) | 판정기 자체검증. 0 바이트 파일 거부는 항상, 샘플 폴더가 있으면 Haru 통과 + `moc3.py` 라운드트립(바이트 동일·Core VALID) |
| `tools/moc3/moc3.py` | moc3 파서·writer(stdlib). `dump` / `roundtrip` / `json`. 생성기의 기반 |
| `tools/moc3/gen.py` | **moc3 생성기.** `Builder` 로 파츠·파라미터·워프/회전 디포머·아트메시·키폼을 선언하면 V3.00 moc3 를 쓴다. `python tools/moc3/gen.py demo out.moc3` 가 기하 도형 검증 모델. 좌표·키폼 규약은 `docs/moc3-format.md` "좌표·키폼 규약" |
| `tests/e2e/live2d.cjs` (`npm run test:e2e:live2d`) | 모델을 실제 가져오기 경로로 앱에 불러 그려지는지 확인. 생성한 모델의 최종 검증에 쓴다 |

샘플 준비 (완료됨)
- `assets/live2d-authoring/samples/live2dcubismcore/` 에 npm `live2dcubismcore@1.0.2` 패키지를 풀어 두었다(130MB, Git 무시, 재배포 금지). Haru 런타임 모델 외에 편집 원본(`haru_greeter_t04.cmo3`, `.can3`, 파츠 분리 PSD 2개)도 들어 있다(내용 미확인, 리그 구조 참고 자료가 될 수 있음).
- 폴더가 없으면 임시 폴더에서 `npm pack live2dcubismcore@1.0.2 && tar -xzf live2dcubismcore-1.0.2.tgz` 후 `package/` 내용을 위 경로로 옮긴다.

실행 방법
```bash
S=assets/live2d-authoring/samples/live2dcubismcore
H=$S/characters/haru_greeter_pro_jp/runtime/haru_greeter_t03.moc3
node tools/moc3/inspect-core.cjs "$H" ParamAngleX=30
python tools/moc3/dump-header.py "$H"
npm run test:moc3
env -u ELECTRON_RUN_AS_NODE KMD_L2D_MODEL=<생성한 .model3.json> npm run test:e2e:live2d   # 기본은 Haru
```
주의: 이 VSCode 환경은 `ELECTRON_RUN_AS_NODE=1` 이라 Electron 스크립트는 `env -u ELECTRON_RUN_AS_NODE npx electron ...` 로 실행한다. Node 에서 Core 를 읽을 때는 emscripten 래퍼 때문에 `globalThis.__dirname`·`globalThis.require` 를 먼저 설정해야 한다(inspect-core.cjs 가 한다).

## 확인된 사실 (Haru `haru_greeter_t03.moc3`, 384,704 bytes)
- Core 4.2.2. Core 가 정의한 moc 버전 상수: `MocVersion_30=1`, `_33=2`, `_40=3`, `_42=4`, 최신=4. **Haru 파일의 version 바이트는 1**(3.0 형식)이며 Core 4.2.2 가 열어 준다. 가장 단순한 version 1 을 목표로 삼는 것이 안전하다.
- 헤더: `0x00 'MOC3'`, `0x04 version(u8)`, `0x05 big-endian 플래그(u8)=0`, `0x06~0x3F` 0 패딩.
- `0x40` 부터 u32 섹션 오프셋 표 101 항목(표 끝 0x1D4). 단조 증가. 마지막 4개 항목(97~100)은 파일 끝(0x5DEC0)을 가리켜 **크기 0 섹션**이다(version 1 에는 없는 신형 섹션 자리로 보임, 추정).
- 첫 항목 = 개수 표 위치 0x7C0. 개수 표 u32[0..19] = `[19, 97, 66, 31, 84, 42, 19, 383, 253, 369, 69328, 71, 47, 42, 126, 6496, 14088, 10, 1, 84]`.
  - **Core 값과 일치(확정)**: `[0]=parts 19`, `[4]=art meshes 84`, `[5]=parameters 42`.
  - 추정(미확정): `[1]=deformers 97 = [2] warp 66 + [3] rotation 31`, `[6]=19` 은 part keyform 수로 보임, `[19]=84` 는 art mesh 와 같은 수. 나머지 칸은 의미 미확정.
- 개수 표 시작 +0x80 부터 f32 5개 = `pixelsPerUnit, originX, originY, canvasWidth, canvasHeight` (Core `canvasinfo` 와 일치, 확정).
- 판정기 동작: 4000 바이트로 자른 파일·0 바이트 파일은 Core 로그 `csmReviveMocInPlace: "size" is invalid` 로 거부된다. `Moc.fromArrayBuffer` 가 null 이면 거부.

## 포맷 해독 결과 (2026-10-10 AutoPilot 1회차)
- 공개 자료 2건(OpenL2D `moc3.hexpat` FDPL-1.0-US, `py-moc3` MIT)을 `assets/live2d-authoring/samples/moc3-refs/` 에 받아 두었다(Git 무시). 둘의 아트메시 필드 순서가 달라 Core 로 대조했고 hexpat 이 맞다.
- 101개 섹션 전부의 의미·타입·정렬 규칙·바인딩 체인·키폼 블록 64 B 정렬 규칙을 `docs/moc3-format.md` 에 정리했다. 섹션 표 정본은 `tools/moc3/moc3.py` 의 `LAYOUT`.
- `tools/moc3/moc3.py`: stdlib 파서·writer. Haru 라운드트립 **바이트 동일**, 재기록 파일 Core **VALID**, 파싱 값이 Core 보고(id·정점/인덱스 수·텍스처·마스크·parent·파라미터 범위·키 수)와 전부 일치. `npm run test:moc3` 가 라운드트립까지 검사한다.
- 아직 모르는 것: Core 가 거부하는 조건 목록(생성기에서 시행착오), 회전 디포머 키폼의 origin/scale 단위.

## 권장 순서
1. ~~섹션 해독~~ 완료 → `docs/moc3-format.md`.
2. ~~라운드트립~~ 완료 → `tools/moc3/moc3.py`, `npm run test:moc3`.
3. ~~최소 모델~~ 완료 → `tools/moc3/gen.py` (Core VALID).
4. ~~파라미터 반응~~ 완료 → 정점 이동·불투명도·워프(중첩 포함)·회전(중첩 포함)·2-파라미터 조합을 `npm run test:moc3` 가 Core 로 검사한다.
5. **키리코 적용**: 파츠 PNG 로 메시·UV·텍스처 아틀라스 생성, `.model3.json` 작성, 앱 가져오기 + `test:e2e:live2d` 방식으로 육안 확인(캡처를 직접 볼 것).
6. 상태 문서(`docs/model-production-status.md`, `docs/implementation-progress.md`)를 사실대로 갱신.

## 아트 방향 (개발자님 결정: 타협 없음)
- **거친 결과물은 안 된다.** 완성 기준은 "완벽한 2D 셀 셰이딩, 귀여운 애니메이션 스타일 그림체"다. 3D 렌더 질감·붙여 만든 티가 나면 불합격이다.
- **디자인 정본: `assets/reference/private/kiriko-style-guide.png`** (개발자님이 제시한 "키리코 2D 일러스트 스타일 가이드", 1448×1086, Git 무시). 연분홍 금발 롱헤어, 붉은 눈, 여우 귀와 큰 꼬리, 여우 가면 + 방울 달린 붉은 술 장식, 소매가 분리된 흰색·붉은색 무녀풍 의상(벚꽃 무늬, 허리 큰 리본·방울), 부적. 시트 구성: 기본 3면도(정면·측면·후면), 디테일(눈·가면 장식·귀·부적·리본/방울·옷 무늬), **표정 7종**(기본·행복·놀람·슬픔·화남·당황·윙크), 포즈 5종(기본 대기·인사·기쁨·고개 기울임·생각), **주요 파츠 분리 예시**(앞머리·귀, 눈/눈썹/입 파츠, 얼굴, 뒷머리, 가면, 장식, 꼬리, 상의/몸체, 소매, 치마/허리 리본, 부적).
- 같은 폴더에 **2배 업스케일본 `kiriko-style-guide_waifu2x_art_noise1_scale.png`(2896×2172)** 이 있다. 참조·이미지 조건(IP-Adapter 등)에는 이쪽을 쓴다. 가장 선명한 부분은 왼쪽 큰 일러스트(업스케일본 좌표 약 0,0~1000,1330)이고 얼굴·눈·여우 가면·귀·방울 술 질감을 가장 잘 보여 준다. 다만 이 일러스트는 원근이 있는 근접 구도(팔을 앞으로 뻗음)에 배경 흐림이 있어 정면 대기 자세 원본으로 쓸 수 없다. 정면 3면도 타일은 업스케일 후에도 흐릿하다(약 440×730px, waifu2x 평활화).
- 이 시트는 **디자인·화풍·색 기준**이지 제작용 원본이 아니다. 업스케일본도 해상도가 모자라 파츠를 오려 쓸 수 없고(업스케일은 없던 디테일을 만들지 못한다), 면마다 디자인이 조금씩 달라서 그대로 일관된 원본이 되지 않는다. 시트의 파츠 분리 예시를 레이어 구성의 출발점으로 삼는다.
- **제작 기준 원본: `assets/reference/private/kiriko-base-rgba.png`** (2210×2846, **RGBA 배경 제거본**, 정면 대기 자세, 좌우 거의 대칭, 두 손을 앞에 모으고 미소. 시트와 같은 디자인. 개발자님이 제공한 `복슬한 여우 무녀 캐릭터_waifu2x_art_noise1_scale.png` 의 ASCII 이름 사본이며 내용은 같다). 같은 구도의 흰 배경판 `ef5897f8-..._waifu2x_art_noise1_scale.png`(2172×2896, RGB)도 같은 폴더에 있다. 허벅지 위까지 나온 정면 상반신이라 Live2D 파츠 분리의 출발점으로 쓴다. waifu2x 2배 업스케일이라 선이 약간 부드러우므로 필요하면 애니메 특화 업스케일러(예: Real-ESRGAN anime)로 선·질감을 보강해도 된다. 이 원본의 한계와 주의점:
  - **배경 제거는 이미 되어 있고** 초록 배경에 합성해 보면 흰 옷 경계·털·머리카락 끝이 깨끗하다(2026-10-10 육안 확인). 다시 마팅할 필요는 없다. 다만 **피사체 알파가 255 가 아니라 약 253**(중앙값, 픽셀의 68% 가 250~254)이라 그대로 쓰면 미세하게 비친다. 임계 이상을 255 로 정규화하고, 어두운/밝은 배경에서 가장자리 헤일로(번짐)가 없는지 확인한다.
  - **가장자리 접촉**: 이미지 하단에서 옷자락·치마가 평평하게 잘려 있고(하단 행 불투명 1802px), 꼬리 끝(왼쪽 가장자리 20px)·귀/리본 끝(상단 3px)·오른쪽 옷자락(8px)이 경계에 닿는다. 캔버스에 여백을 덧대고, 하단 절단면은 상반신 모델의 아래쪽 처리(앱 창 하단 클리핑 또는 자연스러운 페이드)를 설계해서 처리한다.
  - **가려진 부분은 새로 그려야 한다**: 앞머리 뒤의 얼굴·이마, 눈꺼풀 아래 안구(눈 뜬/감은 상태 모두), 입 안쪽, 머리카락·소매 뒤의 어깨·몸통·팔, 모은 손 뒤의 팔과 치마, 가면 뒤 머리, 귀 뒷면, 꼬리 뿌리(몸 뒤에 가려짐), 겹치는 술 장식 뒤. 인페인팅(diffusers 등)이나 직접 그리기로 완성한다.
  - 꼬리는 화면 왼쪽에 하나만 보이고, 긴 뒷머리·소매·치마가 넓게 퍼져 있어 레이어 수가 많다. 눈썹은 앞머리에 가려져 거의 보이지 않으므로 표정용 눈썹은 새로 그린다.
  - 표정(감정 7종)·입 모양·눈 감김은 이 원본에 없으므로 같은 화풍으로 새로 만든다(시트의 표정 7종 타일 참조).
- 앱 감정 7종과의 대응(앱 `Emotion` 은 `src/shared/types.ts`): neutral=기본, happy=행복, playful=윙크, curious=놀람, concerned=슬픔(당황은 보조), annoyed=화남, sleepy=시트에 없음(눈 반쯤 감은 표정을 새로 그린다). 포즈는 idle=기본 대기, greet/wave=인사, headTilt=고개 기울임 등으로 대응시키고 나머지 앱 모션(blink·look·stretch·yawn·reactTap·rest)은 새로 만든다.
- `assets/reference/kiriko.png`(3D 렌더 원작 디자인)는 쓰지 않는다. 오려 쓰지도, 디자인 기준으로 삼지도 않는다. 이 시트의 디자인이 개발자님이 정한 키리코 2D 버전이다.
- 명세 기준 **상반신**. 정면, 좌우 대칭에 가까운 대기 자세, 파츠별 여유 그림(가려질 부분까지 완성) 포함. 여우 귀·꼬리·가면·방울 술 장식이 새 레이어이므로 레이어 계약 `docs/live2d-layer-contract.json` 과 `assets/live2d-authoring/input/layer-plan.json` 은 이 디자인에 맞게 다시 썼다(TASKS 5, 59 레이어). 파이프라인은 `docs/live2d-authoring.md`.
- 기존 파츠 초안(`assets/live2d-authoring/output/**`, 원작 3D 렌더 분리본)은 이 방향에서는 **쓰지 않는다**. 레이어 이름·구조 참고용으로만 둔다.
- 이미지를 만드는 방법은 자유다. 이 PC 에는 NVIDIA RTX 3070(8GB), Python 3.11(Pillow·numpy·OpenCV)이 있고 torch 는 CPU 빌드다. 후보: ① CUDA torch + diffusers 로 애니메 모델(SD1.5/SDXL 계열) 생성 후 파츠 분리·가려진 부분 인페인팅, ② 코드로 직접 그린 벡터(SVG) 일러스트를 파츠별 레이어로 렌더(Electron/Chromium 이 SVG→PNG 렌더에 쓸 수 있음. cairosvg 는 libcairo 가 없어 바로는 안 됨), ③ 두 방식 혼합. 결과물은 반드시 이미지를 직접 열어 보고 평가하며, 눈·얼굴 비율·머리카락 뭉치·선 굵기·명암·색 일관성이 애니메 일러스트로 읽힐 때까지 반복한다. 독립 검수를 서브에이전트에 맡겨도 된다.
- **애니메이션도 귀여워야 한다.** 눈 깜빡임·입 열림·시선·고개 기울임·호흡에 더해 표정(앱 감정 7종)·모션(앱 모션 10종)을 모두 만들고, 머리카락·여우 가면 장식·부적·옷자락 흔들림은 physics3 로 구현한다. 현재 앱 로더는 physics3 를 지원하지 않으므로(`src/character/Live2DRenderer.ts`) 로더도 확장해야 한다.

## 원본 정리·표정 제작 결과 (2026-10-10, TASKS 4)
- **정리본 `assets/reference/private/kiriko-base-prepared.png`** (2530×3006, Git 무시) = `tools/live2d-authoring/normalize_base.py` 산출. 알파 ≤8→0, ≥240→255, 투명 픽셀 RGB 는 최근접 불투명 색으로 채움(헤일로 방지), 좌·우·상 여백 160px, **하단 여백 0(절단면 = 캔버스 하단, 앱이 창 하단에서 클리핑)**. 흰·검정·초록 합성과 가장자리 확대(`output/base-check/`)를 Read 로 확인: 헤일로 없음, 머리카락 끝 온전. 보고서 `kiriko-base-prepared.report.json`. 이후 모든 파츠 작업은 이 정리본 좌표를 쓴다.
- **표정 변형 `assets/live2d-authoring/output/expressions/<name>.png`** (얼굴 크롭 640², 원본 좌표 FACE=(970,560,1610,1200)) 와 `<name>.full.png`(정리본 전체에 되붙인 RGBA) = `tools/live2d-authoring/gen_expressions.py` 산출(Animagine XL 3.1 인페인팅, `.venv` CUDA torch, RTX 3070 에서 1024² 한 장 ≈15초, 모델 캐시 `output/hf-cache/` 6.8GB Git 무시). 채택 시드는 `picks.json`. 눈: closed·half·wink·wide·teary·glare, 입: mouth_open·mouth_o, 복합(앱 Emotion): happy(closed+웃는 입)·playful(wink+혀)·curious(wide+o 입)·concerned(teary+물결 입)·annoyed(glare+벌린 입)·sleepy(half+하품). 왼눈만 칠하고 오른눈은 미러.
- 검수: 서브에이전트 독립 검토 2회 + Read 육안. 2차 검토에서 **wide·teary·glare·mouth_open·mouth_o·half·concerned·playful·annoyed·sleepy 합격**, closed·wink·happy 는 꺼풀 아래 분홍 잔상, curious 는 입 하단 윤곽 절단이 지적됨 → 눈 상자 하단 912·입 상자 하단 1015 로 늘려 closed·wink(시드 15)·happy·playful·curious·annoyed·sleepy 를 재생성하고 확대본을 Read 로 확인(잔상·절단 없음). 3차 독립 검토(2026-10-10 15:38, 서브에이전트가 눈·입 3~4배 확대·base 차분 이미지로 검사): **14종 전부 합격**, FAIL 없음. 경계 메모: closed·wink·happy 는 감은 눈 아크 아래 홍조가 base 보다 약간 높고 진함(좌우 동일한 그라데이션이라 의도된 연출로 판정), playful 혀 안쪽에 아주 옅은 하이라이트 선. 표정 제작은 여기서 확정. 눈 상자 위쪽 앞머리의 회색 탈색은 앞머리 레이어가 base 에서 따로 덮이므로 무시.
- **눈썹은 디퓨전으로 실패**(앞머리를 지우고 이마를 그림). TASKS 5 에서 가는 호(분홍 계열, 머리색보다 조금 진하게)로 직접 그려 눈썹 파츠를 만든다.

## 레이어 분리·복원·아틀라스 결과 (2026-10-10, TASKS 5)
- **레이어 계약**: `tools/live2d-authoring/make_layer_plan.py` 를 정리본(2530×3006) 디자인으로 다시 씀 → `assets/live2d-authoring/input/layer-plan.json`·`docs/live2d-kiriko-parts.md` 재생성(**59 레이어·15 그룹·40 필수·18 복원**). 계약 `docs/live2d-layer-contract.json` 에 `cut.clip`·`cut.dilate`·`cut.fallback`·`cut.dark.red`·`extend{method,box|poly,prompt,grow,seed}` 추가. `npm run test:authoring` PASSED. happy·wink 의 눈은 closed 와 동일 픽셀이라 `Eye_*_Happy`·`Eye_R_Wink` 레이어를 없애고 `Eye_*_Closed` 를 재사용한다(7번 표정 맵에서 그렇게 묶을 것).
- **분리 `tools/live2d-authoring/cut_parts.py`**(SAM ViT-H `sam_helper.py`, 체크포인트·마스크 캐시 `output/parts-work/`, Git 무시): 1차 마스크(sam/box/poly/dark) z 오름차순 → `clip` → `dilate` → fallback → 400px 미만 조각 회수·최근접 배정. 분리 합성 == 원본(알파 안 바이트 동일, assert). 복원(`extend`)은 보이는 큰 덩어리(≥1500px)를 grow px 팽창한 범위 ∩ 원본 알파 255 ∩ 위 레이어 픽셀만: cv2(최근접 자기색+블러) 또는 sdxl(Animagine XL 3.1 인페인팅). 전체 실행 ≈5분(RTX 3070).
- **아틀라스 `tools/live2d-authoring/make_atlas.py`**: bbox 크롭 → shelf packing 4096² pad 2 → `assets/models/private/kiriko/texture_00.png`·`texture_01.png` + `atlas.json`(레이어별 rect/src/uv) + `compare.png`. 결과 **textures=2, layers=58(GUIDE 제외), 재조립 diff_px=0**.
- **검수**: `compare.png`·부위별 크롭(머리·몸통·치마·꼬리·소매)·전 레이어 타일 시트를 Read 로 보고 서브에이전트 독립 검토 2회. 1차(PASS, 경미 지적)에서 찾은 실제 결함 → 고침: ① `Hands` 가 왼쪽 주먹만 잡고 오른쪽 주먹이 Apron/Hakama 로 샘 → 주먹마다 SAM 상자. ② 닫힌 입선이 `Mouth_Line` 에 없었음(원인: 마스크 마지막 3×3 열기 연산이 2~3px 선을 지움 + 밝은 붉은 선은 밝기 임계로 못 잡음) → dark 레이어는 열기 생략, `dark.red`(R−max(G,B)>30) 추가, 입 상자를 옷깃이 안 들어오게 축소. ③ `validate_layers.py` 가 동일 해시 레이어(happy/wink 눈)를 오류로 셈 → 위처럼 레이어 제거. 2차(PASS, 치명 없음)에서 Mouth_Grin 클리핑 의심 → 확인 결과 실제 결함: `expr_layer` 의 차이 탐색 창이 기본 파츠 bbox+30px 라 Mouth_Line 이 작아지자 열린 입·혀 아랫부분(y 1005~1021)이 모두 잘림 → 계약에 `expr.box`(입은 `[1230,912,1385,1030]`) 추가, 변형 레이어는 가장 큰 덩어리 외 400px 미만 조각(옷깃 인페인팅 노이즈) 제거. 8개 입 변형 모두 단일 성분으로 확인(`review/mouths5.png`).
- **실패·결정 이력**: SDXL 복원은 장식물·머리카락 밑에 흰 매듭·붉은 얼룩·가면 비슷한 형상을 지어냄 → Torso·Hair_Front·Hair_Back_R·Ear_L 은 cv2 로(가려지는 영역이라 흐려도 됨), Tail·Hair_Back_Center·Hair_Back_L·Apron 만 sdxl. 최근접색 복원은 레이어가 가진 가장자리 픽셀(장식 외곽선·방울 금색)을 번지게 하므로 외곽선은 장식물 쪽에 두어야 함 → Hair_Over_R/L·Bell_Chest·Hair_Knot·Mask_Fox·Mask_Tassel·Tassel_R/L·Ofuda 에 `dilate: 3`. 반투명 실루엣 가장자리(alpha<255) 밑을 복원하면 재조립 차이(run8 1346px) → alpha==255 만 복원해 0.
- **남은 잔여물(6·7번에서 감안)**: `Tassel_R` 에 술 사이 분홍 머리 가닥이 섞여 있음(술 물리 적용 시 머리카락이 같이 흔들림. SAM 음성 점으로 분리 가능), Apron 좌상단(≈450–600, 1800–1900) 머리카락·붉은 조각, Hair_Back_R/L 머리 근처 솜털 조각, Torso cv2 복원에 Hair_Over_R 아래 옷깃 붉은 번짐, Hair_Back_Center 는 추상적 붓자국(몸 뒤 완전 은폐), Ear_L fringe 1443px 경고, 눈 흰자·홍채 반투명 잔여물 경고 — 모두 기본 포즈에서 안 보임.

## 키리코 moc3 조립 결과 (2026-10-10, TASKS 6)
- **`tools/moc3/kiriko.py`**: `atlas.json`(rect/src) + `layer-plan.json`(z·그룹) → `assets/models/private/kiriko/kiriko.moc3`(1.1MB, V3.00) + `kiriko.model3.json`(Groups EyeBlink/LipSync, HitAreas Head/Body, 모션·표정은 7번에서). 파츠 14(그룹별)·파라미터 28·워프 2(`WarpBody` 루트 2×2, `WarpHead` 4×5 머리 상자 (700,100)-(1850,1720), 목 피벗 (1265,1050))·아트메시 58(흔들림 레이어 3×8 격자, 귀 2×3, 나머지 2×2). 모든 키폼은 픽셀로 계산해 부모 좌표(모델 공간 / 워프 격자 0..1)로 변환한다.
- 리깅: ParamAngleX/Y/Z(머리 워프 + 얼굴 파츠 깊이 시차 PARALLAX), ParamEyeL/ROpen(눈 아랫선 기준 세로 축소 + 키 0.3 에서 Closed 레이어로 교차), ParamEyeBallX/Y(홍채 ±8/5px), ParamBrowL/RY, ParamMouthOpenY(Line↔Open 교차 + 세로 스케일), ParamMouthForm(-1 Frown / 0 Line / 1 Smile), **ParamEyeVariant 0..5(기본·Half·Wide·Teary·Glare·Sleepy)·ParamMouthVariant 0..5(기본·O·Grin·Curious·Annoyed·Sleepy)** 는 표정 변형 레이어의 정수 스위치(7번 exp3 에서 사용. happy/wink 눈은 EyeOpen=0), ParamBodyAngleX/Y/Z·ParamBreath(몸 워프), ParamEarR/L(귀 밑 기준 ±14°), ParamTail(뿌리 기준 거리 비례 ±9° 휨), 물리용 ParamHairFront/HairSide/HairBack/Tassel/Ofuda/Skirt/Ribbon/Sleeve(위 고정 t² 흔들림, 진폭은 `SWAY` 표).
- **검증**: `inspect-core` VALID, 파라미터별 반응 확인(AngleX 42개·BodyAngleX 53개·EyeLOpen 9개·MouthOpenY 2개·Tail/EarL 1개 이동). `npm run test:moc3` 에 키리코 조립+반응 검사 추가(atlas 없으면 건너뜀). **앱 실렌더 `KMD_L2D_MODEL=assets/models/private/kiriko/kiriko.model3.json npm run test:e2e:live2d` all passed**, 캡처(368×460)를 Read 로 확인: 원본과 같은 귀여운 2D 일러스트로 그려짐(합격 기준 3 충족). 아직 안 본 것: 앱에서 머리 회전·표정 변형 레이어의 육안 확인(9번), 마스크·글루 미사용.
- **발견한 규약(중요)**: 이 앱 렌더러(셰이더가 `1 - uv.y`)와 Haru 기준 **moc3 의 UV v 는 텍스처 위가 0(top-down)** 이다. 처음에 `1 - y/4096` 로 썼더니 소매 자리에 허리 리본이 그려지는 식으로 전부 뒤섞였다. `docs/moc3-format.md` 에도 기록.
- 레이어를 다시 자르면(`cut_parts.py`→`make_atlas.py`) `python tools/moc3/kiriko.py` 만 다시 돌리면 된다(rect/src 를 atlas 에서 읽음).

## 상태
- 포맷 해독·라운드트립 writer·**처음부터 생성하는 생성기**까지 완료(2026-10-10). `gen.py` 의 `Builder` 로 만든 기하 도형 모델을 Core 가 VALID 로 열고 7개 파라미터가 의도한 드로어블만 움직인다(`npm run test:moc3`). 아직 앱에서 렌더(합격 기준 3)는 안 봤다 — 텍스처가 없는 도형 모델이라 키리코 파츠가 준비되면 본다.
- TASKS 4·5·6 은 위 결과 절 참조. 6 완료: `kiriko.py` 가 만든 moc3 가 Core VALID·파라미터 반응·앱 실렌더까지 통과. **다음은 7(감정 7종·모션 10종·model-map.json)** — exp3 는 ParamEyeVariant/ParamMouthVariant/ParamEyeL·ROpen/ParamMouthForm 조합으로. (아래는 6 시작 전 메모): `Builder` 에 `assets/models/private/kiriko/atlas.json` 의 레이어별 rect/uv 로 파츠 메시·UV 를 넣고 디포머·키폼을 붙인다. 레이어를 바꿀 때는 JSON 을 손으로 고치지 말고 `make_layer_plan.py` 수정 → 재생성 → `cut_parts.py`(≈5분) → `make_atlas.py` 순서로 다시 만든다. 생성기에서 아직 Core 로 안 본 것: 마스크·블렌드 모드·reflect·글루.
