# moc3 포맷 구조 (V3.00 / version 1 기준)

2026-10-10 작성. 공개 자료를 Haru 샘플(`haru_greeter_t03.moc3`, 384,704 bytes)과 Cubism Core 4.2.2 로 교차 검증한 결과다.
파서·writer 구현은 `tools/moc3/moc3.py`, 검증은 `npm run test:moc3`(Haru 라운드트립 바이트 동일 + Core VALID).

## 출처
| 자료 | 내용 | 라이선스 | 보관 위치(Git 무시) |
|---|---|---|---|
| OpenL2D `moc3ingbird` — `moc3.hexpat` "MOC3 Format Specification 2.1b" | ImHex 패턴. V3.00~V5.00 전 섹션 정의 | FDPL-1.0-US (문서 자유 이용) | `assets/live2d-authoring/samples/moc3-refs/moc3ingbird/` |
| `py-moc3` (Ludentes, 2026) — Cubism SDK exporter Java 디컴파일(`moc3-reader-re`) 포팅 | Python 읽기/쓰기, 라운드트립 테스트 | MIT | `assets/live2d-authoring/samples/moc3-refs/py-moc3/` |

둘은 아트메시 필드 순서에서 서로 달랐다(py-moc3: `position_index_counts, uv_begin, position_index_begin, vertex_counts…`). **Core 와 대조한 결과 hexpat 순서가 맞다**(`vertexCounts, uvSourcesBegin, positionIndexSourcesBegin, positionIndexSourcesCounts, maskBegin, maskCounts`). drawOrderGroup 의 `maximum, minimum` 순서도 hexpat 이 맞다(Haru: 1000, 260).

## 전체 배치
| 오프셋 | 크기 | 내용 |
|---|---|---|
| 0x000 | 64 | 헤더: `'MOC3'`, `0x04` version u8 (1=3.00, 2=3.03, 3=4.00, 4=4.02, 5=5.00), `0x05` big-endian u8(0), 나머지 0 |
| 0x040 | 640 | 섹션 오프셋 표 u32 × 160. `[0]`=개수 표, `[1]`=캔버스, `[2]…` 아래 섹션 순서대로. 안 쓰는 칸 0 |
| 0x2C0 | 1280 | 0 (Core 가 로드 시 런타임 주소 표로 덮어씀) |
| 0x7C0 | 128 | 개수 표 u32 × 23 (V4.02: 32, V5.00: 35·256 B) |
| 0x840 | 64 | 캔버스: f32 `pixelsPerUnit, originX, originY, canvasWidth, canvasHeight`, u8 flags(bit0 = 캔버스 뒤집기) |
| 0x880 | … | 섹션 본문. struct-of-arrays, 각 섹션은 개수 표 값 × 원소 크기 |

정렬 규칙(Haru 로 확인): **ID 섹션(64 B 고정 문자열, UTF-8, 0 종료)을 제외한 모든 섹션 앞에서 64 바이트 정렬**. ID 섹션은 직전 런타임 섹션 바로 뒤에 붙는다. 파일 끝도 64 정렬. 런타임 공간 섹션은 원소당 8 B 의 0.

## 개수 표 (V3.00, 인덱스 → Haru 값)
0 parts 19 · 1 deformers 97 · 2 warpDeformers 66 · 3 rotationDeformers 31 · 4 artMeshes 84 · 5 parameters 42 · 6 partKeyforms 19 · 7 warpDeformerKeyforms 383 · 8 rotationDeformerKeyforms 253 · 9 artMeshKeyforms 369 · 10 keyformPositions 69328 (f32 개수) · 11 parameterBindingIndices 71 · 12 keyformBindings 47 · 13 parameterBindings 42 · 14 keys 126 · 15 uvs 6496 (f32 개수) · 16 positionIndices 14088 · 17 drawableMasks 10 · 18 drawOrderGroups 1 · 19 drawOrderGroupObjects 84 · 20 glue 0 · 21 glueInfo 0 · 22 glueKeyforms 0.
Haru 는 version 1 이라 섹션 101개(표 [0]~[100]). 전체 섹션 목록·타입은 `tools/moc3/moc3.py` 의 `LAYOUT` 이 정본이고 `python tools/moc3/moc3.py dump <moc3>` 로 오프셋과 함께 볼 수 있다.

## 섹션 요약 (V3.00)
- **Parts**: runtime(8B) · ids · keyformBindingSourcesIndices · keyformSourcesBeginIndices · keyformSourcesCounts · isVisible · isEnabled · parentPartIndices(-1=루트). PartKeyforms 는 `drawOrders` f32 하나.
- **Deformers**(공통): runtime · ids · keyformBindingSourcesIndices · isVisible · isEnabled · parentPartIndices · parentDeformerIndices(-1 없음) · types(0 warp, 1 rotation) · specificSourcesIndices(각 타입 배열 안의 인덱스).
  - **WarpDeformers**: keyformBindingSourcesIndices · keyformSourcesBeginIndices · keyformSourcesCounts · vertexCounts(= (rows+1)×(columns+1), 확인) · rows · columns. (V3.03+: isQuadSource)
  - **RotationDeformers**: keyformBindingSourcesIndices · keyformSourcesBeginIndices · keyformSourcesCounts · baseAngles.
- **ArtMeshes**: runtime×4 · ids · keyformBindingSourcesIndices · keyformSourcesBeginIndices · keyformSourcesCounts · isVisible · isEnabled · parentPartIndices · parentDeformerIndices · textureNos · drawableFlags u8(bit0-1 blendMode 0 normal/1 add/2 multiply, bit2 doubleSided, bit3 inverted mask) · vertexCounts · uvSourcesBeginIndices(**f32 단위**, = 정점 인덱스×2) · positionIndexSourcesBeginIndices · positionIndexSourcesCounts · drawableMaskSourcesBeginIndices · drawableMaskSourcesCounts.
- **Parameters**: runtime · ids · maxValues · minValues · defaultValues · isRepeat · decimalPlaces · parameterBindingSourcesBeginIndices · parameterBindingSourcesCounts.
- **Keyforms**: WarpDeformerKeyforms(opacities, keyformPositionSourcesBeginIndices) · RotationDeformerKeyforms(opacities, angles, originX, originY, scales, isReflectX, isReflectY) · ArtMeshKeyforms(opacities, drawOrders, keyformPositionSourcesBeginIndices).
- **KeyformPositions**: f32 xy 쌍. 단위는 캔버스 좌표를 ppu 로 나눈 모델 공간(Haru: -0.53, -0.96 …). **키폼 하나의 정점 블록은 `vertexCount×2` 를 16 f32(64 B) 단위로 올림한 크기를 차지한다**(Haru 전 키폼 확인, begin 값이 모두 16 의 배수). 공개 자료엔 없는 규칙이라 생성기에서 지켜야 한다. Warp 키폼 블록이 먼저, 그 뒤 아트메시 키폼 블록이 온다(Haru). 
- **바인딩 체인**: 객체.keyformBindingSourcesIndices → KeyformBindings(parameterBindingIndexSourcesBegin/Counts) → ParameterBindingIndices(s32) → ParameterBindings(keysSourcesBegin/Counts) → Keys(f32). 한 객체의 **키폼 수 = 바인딩된 파라미터별 키 수의 곱**(Haru 84 아트메시 전부 확인). 바인딩 수 0 인 keyformBinding(인덱스 0) 은 키폼 1개짜리 고정 객체용. 파라미터의 parameterBindingSourcesBegin 은 Haru 에서 파라미터 인덱스와 동일(파라미터당 바인딩 1개).
- **UVs** f32 — **v 는 텍스처 위가 0(top-down)**. 앱 렌더러 셰이더가 `1 - uv.y` 로 뒤집어 WebGL 에 넘기며, 키리코 조립에서 `1 - y/H` 로 쓰자 전 레이어가 뒤섞여 확인했다(2026-10-10). **PositionIndices** s16(삼각형 3개씩), **DrawableMasks** s32(아트메시 인덱스).
- **DrawOrderGroups**: objectSourcesBeginIndices · objectSourcesCounts · objectSourcesTotalCounts · maximumDrawOrders · minimumDrawOrders. **DrawOrderGroupObjects**: types(0 artMesh, 1 part) · indices · selfIndices(-1). Haru 는 그룹 1개가 아트메시 84개를 담는다.
- **Glue**(0 이어도 섹션 자리는 있어야 함): Glue 9개 섹션, GlueInfo(weights f32, positionIndices s16), GlueKeyforms(intensities).
- V3.03 은 warpDeformer `isQuadSource` 1개 섹션 추가, V4.02 는 파라미터 확장·키폼 색·블렌드셰이프 섹션 추가, V5.00 은 색 begin 인덱스·파츠/회전/글루 블렌드셰이프 추가. 목표는 version 1 이라 생성기는 V3.00 만 쓴다.

## Core 교차 검증 결과 (Haru)
`tools/moc3/inspect-core.cjs --json` 과 `tools/moc3/moc3.py json` 을 비교해 다음이 전부 일치했다: 아트메시 id·vertexCounts·positionIndexCounts·textureNos·마스크 수·parentPart·drawableFlags, 파라미터 id·min·max·default·키 수, 파츠 id·parent. UV 총 길이 = Σ정점×2, 인덱스 총 길이 = Σ인덱스 수. 재기록한 파일은 Core 가 VALID 로 열고 바이트가 원본과 동일하다.

## 좌표·키폼 규약 (생성기 `tools/moc3/gen.py` 로 Core 에 직접 확인, 2026-10-10)
- **저장 좌표는 전부 화면 방향(y 아래 +)**. Core 는 `vertexPositions` 를 보고할 때 y 를 뒤집어 위쪽 + 로 준다. 픽셀 → 저장 모델 좌표는 `x=(px-originX)/ppu, y=(py-originY)/ppu`.
- 루트 객체(부모 디포머 -1)의 키폼 위치는 모델 공간. **워프 디포머의 자식**은 격자 로컬 (u,v) 0..1 (u 열 방향, v 행 방향, 행 0 = 격자 positions 의 첫 행) 을 쌍선형 보간. 격자 positions 는 행 바깥·열 안쪽 순서, 정점 수 = (rows+1)×(columns+1). 워프 안의 워프도 같은 규칙(자식 격자 좌표가 부모 격자 로컬 0..1).
- **회전 디포머의 자식**은 회전 로컬 좌표. 부모 좌표 = origin + R(angle)·(scale × local). origin 은 부모 공간(루트면 모델 공간, 워프 아래면 격자 로컬 0..1), scale 은 로컬 단위 → 부모 단위 배율. Haru 의 0.000417(=1/2400) 은 워프 아래 회전의 자식 좌표를 "픽셀 단위" 로 두고 격자 로컬로 바꾸는 값이었다(확정). 회전 안의 회전은 scale 1 이면 같은 로컬 단위. 각도는 도 단위, 화면 기준 시계 방향 + (Core 출력 y-up 기준으로는 시계 방향).
- **키폼 순서**: 바인딩 파라미터 목록(parameterBindingIndices 순서)에서 **첫 파라미터가 가장 빠르게 변한다**(keys 순서대로). 2-파라미터 조합을 Core 로 확인.
- 파라미터당 parameterBinding 1개, 키는 그 파라미터를 쓰는 모든 객체가 공유. keyformBinding[0] 은 바인딩 0개(고정 객체·파츠용), 나머지는 파라미터 조합별로 공유해도 된다.
- drawOrderGroup 1개에 아트메시 전부(types 0, indices 0..n-1, selfIndices -1), max/min drawOrders 는 실제 범위를 넉넉히 감싸면 된다(Core 가 거부하지 않음).
- Core 가 처음부터 생성한 V3.00 파일을 거부한 경우는 없었다(101개 섹션 전부 존재·개수 표 일치·64 B 정렬만 지키면 열림).

## 아직 확인하지 않은 것
- isReflectX/Y, 마스크(drawableMasks)·블렌드 모드·글루의 생성 파일 동작(생성기에 필드는 있으나 Core 로 아직 안 돌려 봄).
