# moc3 직접 생성 — 인수인계

2026-10-10 작성. 이어받는 세션이 처음부터 다시 조사하지 않도록, 확인된 사실과 아직 모르는 것을 구분해 적는다.

## 결정 사항
- 개발자님 결정: 키리코 Live2D 모델을 **Cubism Editor 없이 `.moc3` 를 직접 생성**해서 만든다. 개인 프로젝트이며 레퍼런스(`assets/reference/kiriko.png`)로 모델을 만드는 것을 허용했다. 배포·공개 시에는 `docs/asset-rights.md` 의 권리 검토가 다시 필요하다.
- 이번 세션에서 개발자님이 **웹 검색 도구 사용을 거절**했다. 그래서 외부 포맷 자료를 전혀 보지 않았고, 아래 내용은 모두 Haru 샘플 + Core 로 직접 확인한 것이다. 공개된 moc3 해독 자료가 있을 수 있으나 확인하지 못했다. 이어받으면 먼저 웹 조사를 해도 되는지 물어볼 것.
- 명세 154행: **가짜·빈 moc3 금지.** 합격 기준은 (1) Core 가 열 것, (2) 파라미터가 실제로 드로어블을 움직일 것, (3) 앱에서 육안으로 그려질 것. 셋 다 확인하기 전에는 모델 완성으로 표시하지 않는다.

## 이번 세션에서 만든 것
| 파일 | 역할 |
|---|---|
| `external/live2dcubismcore/` | Core 4.2.2 (jsDelivr `live2dcubismcore@1.0.2`, "Redistributable Code"). 앱이 내장 사용 |
| `tools/moc3/inspect-core.cjs` | **판정기.** moc3 를 Core 로 열어 유효성·파라미터·파츠·드로어블(정점 bbox)을 출력, `ParamX=값` 으로 파라미터를 움직여 어떤 드로어블이 변하는지 확인. Core 가 거부하면 `INVALID` + Core 로그, 종료 코드 1 |
| `tools/moc3/dump-header.py` | 헤더·섹션 오프셋 표·개수 표·캔버스 값 덤프 |
| `tools/moc3/selftest.cjs` (`npm run test:moc3`) | 판정기 자체검증. 0 바이트 파일 거부는 항상, Haru 통과는 `KMD_L2D_SAMPLE` 지정 시 |
| `tests/e2e/live2d.cjs` (`npm run test:e2e:live2d`) | 모델을 실제 가져오기 경로로 앱에 불러 그려지는지 확인. 생성한 모델의 최종 검증에 쓴다 |

실행 방법
```bash
# 참조 샘플(저장소에 없음, 130MB): 스크래치 폴더에 받아서 푼다
npm pack live2dcubismcore@1.0.2 && tar -xzf live2dcubismcore-1.0.2.tgz      # → package/
export KMD_L2D_SAMPLE=<위 package 폴더>
H=$KMD_L2D_SAMPLE/characters/haru_greeter_pro_jp/runtime/haru_greeter_t03.moc3
node tools/moc3/inspect-core.cjs "$H" ParamAngleX=30
python tools/moc3/dump-header.py "$H"
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

## 키리코 파츠 현황 (병행 필요)
`docs/model-production-status.md` 와 동일: 완성 파츠 PNG 0/51, 초안 44/45 생성(필수 누락 18). 원화가 3/4 각도 3D 렌더 전신이고 오른손(화면 왼쪽)이 부적을 들어 올려 얼굴·머리·팔 일부를 가린다. 이미지 생성 도구가 없어 가려진 부분은 코드로 메워야 하므로 품질이 거칠다. 개인 프로젝트이므로 상반신 중심 + 완성도 타협을 허용할지 개발자님께 확인할 것. 파이프라인: `docs/live2d-authoring.md`, 레이어 계약 `docs/live2d-layer-contract.json`.

## 상태
- 위 변경은 커밋하지 않았다(작업 트리에 남아 있음).
- moc3 생성 자체는 **착수 전**이다. 이번 세션은 판정기·덤프 도구·해독 출발점까지만 했다.
