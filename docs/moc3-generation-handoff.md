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
| `tools/moc3/selftest.cjs` (`npm run test:moc3`) | 판정기 자체검증. 0 바이트 파일 거부는 항상, Haru 통과는 `KMD_L2D_SAMPLE` 지정 시 |
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

## 아직 모르는 것
- 101 개 섹션 각각의 의미·원소 크기·정렬 규칙. 개수 표 대부분의 칸.
- Core 가 요구하는 일관성 조건(오프셋 정렬, 인덱스 범위, 섹션 간 참조). 거부 시 Core 로그가 메시지를 주므로 시행착오로 좁힐 수 있다.
- keyform/파라미터 바인딩 구조, 워프·회전 디포머 표현, 마스크, 드로어블 정점·UV·인덱스 배치.

## 권장 순서
1. **섹션 해독**: Haru 를 기준으로 섹션별 크기를 개수 표 값과 나눠 원소 크기를 추정하고, Core API(`vertexPositions`, `indices`, `vertexUvs`, `parameters.keyValues` 등) 출력과 대조해 확정. 해독 결과는 이 문서나 `tools/moc3/` 에 계속 기록한다.
2. **라운드트립**: Haru 를 파싱해 같은 바이트로 다시 쓰는 writer 를 만든다(전 섹션 해독 검증). `inspect-core` VALID 로 판정.
3. **최소 모델**: 파츠 1·아트메시 1(쿼드)·파라미터 1 의 moc3 를 처음부터 생성 → Core 가 열고 렌더되는지 확인.
4. **파라미터 반응**: keyform 으로 불투명도·정점 이동 → `inspect-core ParamX=값` 으로 움직임 확인. 이어서 워프 디포머(머리 흔들기·호흡), 눈 깜빡임·입 열기.
5. **키리코 적용**: 파츠 PNG 로 메시·UV·텍스처 아틀라스 생성, `.model3.json` 작성, 앱 가져오기 + `test:e2e:live2d` 방식으로 육안 확인(캡처를 직접 볼 것).
6. 상태 문서(`docs/model-production-status.md`, `docs/implementation-progress.md`)를 사실대로 갱신.

## 아트 방향 (개발자님 결정: 타협 없음)
- **거친 결과물은 안 된다.** 완성 기준은 "완벽한 2D 셀 셰이딩, 귀여운 애니메이션 스타일 그림체"다. 3D 렌더 질감·붙여 만든 티가 나면 불합격이다.
- **디자인 정본: `assets/reference/private/kiriko-style-guide.png`** (개발자님이 제시한 "키리코 2D 일러스트 스타일 가이드", 1448×1086, Git 무시). 연분홍 금발 롱헤어, 붉은 눈, 여우 귀와 큰 꼬리, 여우 가면 + 방울 달린 붉은 술 장식, 소매가 분리된 흰색·붉은색 무녀풍 의상(벚꽃 무늬, 허리 큰 리본·방울), 부적. 시트 구성: 기본 3면도(정면·측면·후면), 디테일(눈·가면 장식·귀·부적·리본/방울·옷 무늬), **표정 7종**(기본·행복·놀람·슬픔·화남·당황·윙크), 포즈 5종(기본 대기·인사·기쁨·고개 기울임·생각), **주요 파츠 분리 예시**(앞머리·귀, 눈/눈썹/입 파츠, 얼굴, 뒷머리, 가면, 장식, 꼬리, 상의/몸체, 소매, 치마/허리 리본, 부적).
- 같은 폴더에 **2배 업스케일본 `kiriko-style-guide_waifu2x_art_noise1_scale.png`(2896×2172)** 이 있다. 참조·이미지 조건(IP-Adapter 등)에는 이쪽을 쓴다. 가장 선명한 부분은 왼쪽 큰 일러스트(업스케일본 좌표 약 0,0~1000,1330)이고 얼굴·눈·여우 가면·귀·방울 술 질감을 가장 잘 보여 준다. 다만 이 일러스트는 원근이 있는 근접 구도(팔을 앞으로 뻗음)에 배경 흐림이 있어 정면 대기 자세 원본으로 쓸 수 없다. 정면 3면도 타일은 업스케일 후에도 흐릿하다(약 440×730px, waifu2x 평활화).
- 이 시트는 **디자인·화풍·색 기준**이지 제작용 원본이 아니다. 업스케일본도 해상도가 모자라 파츠를 오려 쓸 수 없고(업스케일은 없던 디테일을 만들지 못한다), 면마다 디자인이 조금씩 달라서 그대로 일관된 원본이 되지 않는다. 시트의 파츠 분리 예시를 레이어 구성의 출발점으로 삼는다.
- **제작 기준 원본: `assets/reference/private/ef5897f8-5684-4265-8f01-2311930a62a2_waifu2x_art_noise1_scale.png`** (2172×2896, RGB, **흰 배경, 정면 대기 자세, 좌우 거의 대칭**, 두 손을 앞에 모으고 미소. 시트와 같은 디자인, 원본 1086×1448 을 waifu2x 로 2배 확대). 허벅지 위까지 나온 정면 상반신이라 Live2D 파츠 분리의 출발점으로 쓴다. 업스케일이라 선이 약간 부드러우므로 파츠 제작 단계에서 필요하면 애니메 특화 업스케일러(예: Real-ESRGAN anime)로 선·질감을 보강해도 된다. 이 원본의 한계와 주의점:
  - 배경이 흰색이고 의상·털도 흰색에 가까워 **배경 제거가 까다롭다**(흰 옷 경계, 털·머리카락 끝). 단순 임계값으로 자르지 말고 마팅/세그먼테이션으로 알파를 만들고 육안 검수.
  - **가려진 부분은 새로 그려야 한다**: 앞머리 뒤의 얼굴·이마, 눈꺼풀 아래 안구(눈 뜬/감은 상태 모두), 입 안쪽, 머리카락·소매 뒤의 어깨·몸통·팔, 모은 손 뒤의 팔과 치마, 가면 뒤 머리, 귀 뒷면, 꼬리 뿌리(몸 뒤에 가려짐), 겹치는 술 장식 뒤. 인페인팅(diffusers 등)이나 직접 그리기로 완성한다.
  - 꼬리는 화면 왼쪽에 하나만 보이고, 긴 뒷머리·소매·치마가 넓게 퍼져 있어 레이어 수가 많다. 눈썹은 앞머리에 가려져 거의 보이지 않으므로 표정용 눈썹은 새로 그린다.
  - 표정(감정 7종)·입 모양·눈 감김은 이 원본에 없으므로 같은 화풍으로 새로 만든다(시트의 표정 7종 타일 참조).
- 앱 감정 7종과의 대응(앱 `Emotion` 은 `src/shared/types.ts`): neutral=기본, happy=행복, playful=윙크, curious=놀람, concerned=슬픔(당황은 보조), annoyed=화남, sleepy=시트에 없음(눈 반쯤 감은 표정을 새로 그린다). 포즈는 idle=기본 대기, greet/wave=인사, headTilt=고개 기울임 등으로 대응시키고 나머지 앱 모션(blink·look·stretch·yawn·reactTap·rest)은 새로 만든다.
- `assets/reference/kiriko.png`(3D 렌더 원작 디자인)는 쓰지 않는다. 오려 쓰지도, 디자인 기준으로 삼지도 않는다. 이 시트의 디자인이 개발자님이 정한 키리코 2D 버전이다.
- 명세 기준 **상반신**. 정면, 좌우 대칭에 가까운 대기 자세, 파츠별 여유 그림(가려질 부분까지 완성) 포함. 여우 귀·꼬리·가면·방울 술 장식이 새 레이어이므로 레이어 계약 `docs/live2d-layer-contract.json`(원작 디자인 기준 76 레이어)과 `assets/live2d-authoring/input/layer-plan.json` 은 이 디자인에 맞게 다시 쓴다. 파이프라인은 `docs/live2d-authoring.md`.
- 기존 파츠 초안(`assets/live2d-authoring/output/**`, 원작 3D 렌더 분리본)은 이 방향에서는 **쓰지 않는다**. 레이어 이름·구조 참고용으로만 둔다.
- 이미지를 만드는 방법은 자유다. 이 PC 에는 NVIDIA RTX 3070(8GB), Python 3.11(Pillow·numpy·OpenCV)이 있고 torch 는 CPU 빌드다. 후보: ① CUDA torch + diffusers 로 애니메 모델(SD1.5/SDXL 계열) 생성 후 파츠 분리·가려진 부분 인페인팅, ② 코드로 직접 그린 벡터(SVG) 일러스트를 파츠별 레이어로 렌더(Electron/Chromium 이 SVG→PNG 렌더에 쓸 수 있음. cairosvg 는 libcairo 가 없어 바로는 안 됨), ③ 두 방식 혼합. 결과물은 반드시 이미지를 직접 열어 보고 평가하며, 눈·얼굴 비율·머리카락 뭉치·선 굵기·명암·색 일관성이 애니메 일러스트로 읽힐 때까지 반복한다. 독립 검수를 서브에이전트에 맡겨도 된다.
- **애니메이션도 귀여워야 한다.** 눈 깜빡임·입 열림·시선·고개 기울임·호흡에 더해 표정(앱 감정 7종)·모션(앱 모션 10종)을 모두 만들고, 머리카락·여우 가면 장식·부적·옷자락 흔들림은 physics3 로 구현한다. 현재 앱 로더는 physics3 를 지원하지 않으므로(`src/character/Live2DRenderer.ts`) 로더도 확장해야 한다.

## 상태
- 위 변경은 커밋하지 않았다(작업 트리에 남아 있음).
- moc3 생성 자체는 **착수 전**이다. 이번 세션은 판정기·덤프 도구·해독 출발점까지만 했다.
