# 구현 진행 현황

명세서(`docs/implementation-spec.md`) 17.6 진행 문서 규칙에 따라 기능별 상태를 기록한다.
상태 구분: `구현 완료(검증 전)` / `검증 통과` / `검증 실패` / `미검증` / `외부 도구 필요`.
"검증 통과"는 `npm run typecheck`·`npm test`·`npm run build`·`npx electron .` 부팅 스모크·오프스크린 캡처 스크립트 중 해당 항목을 통과한 것이며, 실기 사용자 조작 검증은 별도로 표시한다.

최종 갱신: 2026-10-10 (작업 12 완료 시점). 최종 보고서는 `docs/final-report.md`.

## 요약

| # | 기능 | 커밋 | 상태 |
|---|------|------|------|
| 1 | 기본 구조 (Electron 44 + React 19 + TS + electron-vite 5) | dfa21a2 | 검증 통과 (typecheck/vitest/build) |
| 2 | 데스크톱 상주 (투명창·항상 위·트레이·자동 실행·다중 모니터 보정) | 659bdca | 검증 통과 (E2E), 실기 항목 미검증 (아래 참조) |
| 3 | 2D 플레이스홀더 캐릭터 + 렌더러 분리 | a5937b1 | 검증 통과 (오프스크린 캡처) |
| 4 | 상호작용 (드래그·Ctrl+휠 크기·클릭 반응·시선·우클릭 메뉴) | 1f3eab6 | 검증 통과 (오프스크린 입력 주입) |
| 5 | 애니메이션 + 모션 우선순위 | 1aa6876 | 검증 통과 (vitest) |
| 6 | 행동 시스템 (시간대·조용한 시간·방해 금지·선제 발화 제한) | a92eeb0 | 검증 통과 (vitest) |
| 7 | 규칙 기반 대화·말풍선·채팅 UI | 744f331 | 검증 통과 (vitest + 오프스크린) |
| 8 | 설정 화면·SQLite 기록·JSON 내보내기·예외 복구 | 3fbcadb | 검증 통과 (vitest + 스모크 + 오프스크린) |
| 9 | Live2D 파츠 분리·모델 제작 파이프라인 | df87efe | 도구·문서 완료, 모델은 NEEDS_MANUAL_QA/REQUIRES_EDITOR (`docs/model-production-status.md`) |
| 10 | Live2D Cubism 모델 로더 | f670b07 | 검증 통과 (vitest + 빌드 + 샘플 Haru 실렌더링 `test:e2e:live2d`), 키리코 모델은 미제작 |
| 11 | 통합 테스트·타입 검사·빌드·오류 수정 | f301356·142dfe5·67f879c | 검증 통과 (typecheck/vitest 43/build/authoring/E2E 29) |
| 12 | Kirikomodo.exe 빌드 + 보고서 | (본 커밋) | 검증 통과 (NSIS+portable 생성, 패키징 exe 부팅), 설치/제거 미검증 |

## 기능별 상세

### 1. 기본 구조 — 검증 통과
- 3개 BrowserWindow(character/chat/settings), `contextIsolation`+`sandbox`, preload `contextBridge`, IPC sender 검증 + zod 스키마.
- settings.json 원자적 저장(tmp→bak→rename), CSP는 패키징/프리뷰에서만 적용.
- 검증: typecheck, vitest, build 산출물(`out/main`, `out/preload`, `out/renderer/*`) 확인.

### 2. 데스크톱 상주 — 검증 통과 (E2E)
- 검증 통과: E2E(`npm run test:e2e`)로 투명 영역 `setIgnoreMouseEvents(true)`/캐릭터 위 `false` 전환, 드래그 후 settings.json 위치 저장, 트레이 메뉴 5항목 클릭(숨기기/표시/대화/설정/방해 금지), 화면 밖 이동 후 `display-metrics-changed` → 작업 영역 복귀, 종료 직전 이동 위치 flush.
- 미검증(환경 없음): 실제 두 번째 모니터 분리·DPI 변경·절전 복귀(코드 경로는 동일 핸들러 `ensureCharacterVisibleOnScreen`), 시작 프로그램 등록(패키징 빌드 전용, 작업 12에서 확인).

### 3. 플레이스홀더 캐릭터 — 검증 통과
- SVG DOM 직접 생성 렌더러, 감정 7종·모션 10종. `createCharacterRenderer` 팩토리가 Live2D 분기 지점.
- 검증: 오프스크린 캡처로 표정·모션 렌더 확인.

### 4. 상호작용 — 검증 통과
- 검증: 오프스크린 `sendInputEvent`로 탭·드래그·우클릭·Ctrl+휠·시선 추적 IPC 확인. 실기 마우스 조작은 미검증.

### 5. 모션 우선순위 — 검증 통과
- `MotionController` 우선순위·쿨다운·중복 방지·무효 폴백 vitest.

### 6. 행동 시스템 — 검증 통과
- `BehaviorEngine` 시계·난수 주입 vitest. 장시간 실행(수 시간) 안정성은 미검증.

### 7. 규칙 기반 대화 — 검증 통과
- 의도 9종 규칙, 시간대별 인사·선제 발화 대사. 메인 프로세스 허브가 모든 창에 브로드캐스트.
- 검증: vitest, 오프스크린 채팅창+캐릭터창 동시 로드 캡처(말풍선 표시 확인).

### 8. 설정·데이터 저장·예외 처리 — 검증 통과
- 설정 화면 6섹션(일반/캐릭터/행동/대화/표시·접근성/고급), 흰색 미니멀. 위치 초기화·설정 초기화·로그 폴더 열기.
- 대화 기록: `node:sqlite`(Electron 44 내장 Node 24) `src/core/chatStore.ts`. 테이블 `chat_sessions`/`chat_messages`/`companion_events`/`schema_migrations`. DB 열기 실패 시 메모리 기록으로 폴백. 선제 발화 일일 횟수는 DB 이벤트로 집계해 재시작 후 유지.
- JSON 내보내기(`dialog.showSaveDialog`), 전체 삭제 시 모든 창 `chat:cleared` 동기화.
- 예외: 렌더러 `ErrorBoundary`(재로드 버튼), `render-process-gone` 시 로그 후 reload, `unresponsive` 경고, main `uncaughtException`/`unhandledRejection` 로그.
- 검증: vitest 38개(DB 마이그레이션·재오픈·limit 정렬 포함), typecheck, build, 실앱 스모크(`kirikomodo.sqlite` 생성 로그), 오프스크린 설정 화면 조작(토글→`settings:update`, 내보내기→`chat:export`, FPS select).
- 미구현: `user_profile` 테이블(사용처 없음), 하드웨어 가속 진단, 소리 끄기(음성 기능 없음), 언어 선택(한국어 고정).

### 9. Live2D 파츠 분리·제작 파이프라인 — 키리코 모델 완성 (moc3 직접 생성)
- `tools/live2d-authoring/` Python CLI 9종(계획 생성·원화 분석·색/ROI 초안 분리·파츠 검증·미리보기·pure-Python PSD 조립·model3.json 검증·파이프라인·픽스처). 사용법 `docs/live2d-authoring.md`.
- 레이어 계약 `docs/live2d-layer-contract.json` + 76 레이어 계획(`assets/live2d-authoring/input/layer-plan.json`, 파츠 목록 `docs/live2d-kiriko-parts.md` 자동 생성).
- 검증: `npm run test:authoring`(픽스처 기반 자체검증 5종 통과), `run_pipeline.py --build-id 2026-10-10-r6` 전체 상태 `NEEDS_MANUAL_QA`.
- 2026-10-10 완성: Cubism Editor 없이 moc3 포맷을 해독(`docs/moc3-format.md`)해 `tools/moc3/`(moc3.py 라운드트립 writer·gen.py 생성기·kiriko.py 조립기·kiriko_anim.py·kiriko_physics.py)로 키리코 모델을 직접 생성. 원본 정리·표정 14종(`gen_expressions.py`), SAM+인페인팅 파츠 분리·복원 59 레이어(`cut_parts.py`), 아틀라스 2장(`make_atlas.py`). 모델·텍스처는 Git 무시(`assets/models/private/kiriko/`). 현황 `docs/model-production-status.md`, 절차 `docs/moc3-generation-handoff.md`.

### 10. Live2D Cubism 모델 로더 — 검증 통과 (Haru 샘플 + 키리코 모델)
- Cubism Core(`live2dcubismcore.min.js`)는 npm `live2dcubismcore@1.0.2`(jsDelivr 로도 제공)의 파일을 `external/live2dcubismcore/` 에 그대로 두고(출처·해시는 그 폴더 README) 앱이 그 파일을 쓴다. 패키징은 `electron-builder.yml` `extraResources` 로 `resources/external/` 에 복사한다. `%APPDATA%/Kirikomodo/live2d/` 에 같은 이름 파일을 두면 그쪽이 우선한다(`findCore()`). 둘 다 없으면 플레이스홀더 폴백 + 말풍선 안내.
- npm 패키지에는 Haru 샘플 모델(moc3·텍스처·모션·physics, 약 130MB)도 있으나 저장소·앱에는 넣지 않는다.
- **정정**: 이전 기록의 "npm 미배포·재배포 불가"는 둘 다 틀렸다. npm/jsDelivr 에 있고, 파일 헤더가 스스로 "Redistributable Code"(Live2D Proprietary Software License Agreement)라고 밝힌다. 확인 없이 적은 것이며, 그 때문에 실모델 렌더링 검증이 뒤로 밀렸다.
- 가져오기(FR-003): 설정 > 모델 > "가져오기" → `.model3.json` 선택 → `inspectModel3` 참조 검사(`../`·절대 경로·원격·허용 외 확장자 거부, 파일 64MB/전체 256MB, `MOC3` 매직) → `%APPDATA%/kirikomodo/models/<id>/` 복사 + `models.json` 등록. 삭제는 앱 복사본만 제거(원본 유지), 사용 중이면 플레이스홀더로 복귀.
- 렌더러: 전용 스킴 `kmd-model://`(`electron/services/models.ts`, `protocol.handle`, 경로 탈출 차단)로 Core/모델 파일 제공. `src/character/Live2DRenderer.ts` 가 Core 원시 API + 자체 WebGL(프리멀티플라이 텍스처, 블렌드 모드, 스텐실 마스크, renderOrders)로 그림. motion3/exp3 파싱(`live2dMotion.ts`), Idle 자동 루프, 깜빡임·호흡·시선, 표정 파일 없으면 내장 파라미터 표로 감정 표현, HitAreas 기반 hitTest. 모션 그룹 별칭 또는 모델 폴더의 `model-map.json`(선택)으로 앱 모션 이름 ↔ 그룹 매핑.
- 검증: `tests/unit/live2d.test.ts`(model3 검사·거부 케이스·커브 보간·페이드) 포함 vitest 43개 통과, typecheck·build 통과.
- 실모델 검증: `KMD_L2D_SAMPLE=<npm pack live2dcubismcore 를 푼 package 폴더> npm run test:e2e:live2d` (`tests/e2e/live2d.cjs`). 내장 Core 로 Haru 를 실제 가져오기 경로(`importModel`)로 불러와 `canvas.live2d-canvas` 마운트·폴백 없음·그려진 픽셀 비율을 확인하고, 캡처를 육안으로 확인했다(2026-10-10, Haru 전신이 정상 렌더링됨. 소프트웨어 렌더링 `disableHardwareAcceleration`).
- physics3: `src/character/live2dPhysics.ts`(공식 CubismPhysics 진자 알고리즘, 가변 dt 1회 적분)로 model3 `Physics` 파일을 해석해 매 프레임 적용(reduceMotion 이면 생략). 렌더러가 e2e 용 훅 `window.__kmdLive2D`(파라미터 읽기·physics 로드 여부)를 둔다.
- 키리코 검증(2026-10-10): `KMD_L2D_MODEL=assets/models/private/kiriko/kiriko.model3.json npm run test:e2e:live2d` → 21파일 가져오기, 캔버스 렌더, 표정 6종 화면 변화, 모션 9종 화면 변화, physics3 로드·ParamHairBack/Tail/Tassel 변동 all passed. 캡처(표정·모션별)를 육안으로 확인해 2D 일러스트 그대로 표정·고개·입이 바뀌는 것을 봤다. **e2e 는 `out/` 을 쓰므로 `npm run build` 뒤에 실행해야 한다.**
- 한계: pose3/사운드/립싱크 미지원(파일은 복사만), 마스크는 하드 스텐실(반전 마스크 미지원).

### 11. 통합 검증 — 검증 통과
- 실행(2026-10-10 최종): `npm run typecheck` ✓, `npm test` 45/45 ✓, `npm run build` ✓, `npm run test:authoring` ✓, `npm run test:moc3` ✓, `npm run test:e2e` 29/29 ✓, `npm run test:e2e:live2d`(키리코) all passed ✓.
- E2E 하네스 `tests/e2e/smoke.cjs`: 임시 폴더를 userData로 지정해 실제 `out/main/main.js`를 띄운다(사용자 데이터 미접촉). 손상 settings.json→.bak 복구(AC-03), 없는 모델 폴백 말풍선(AC-11), 클릭 통과(AC-02), 드래그·위치 저장(AC-03), 트레이 메뉴(AC-04), 표정 미리보기(AC-05), 방해 금지·일일 3회 제한(AC-07), 규칙 대화·unknown 폴백(AC-08), SQLite 기록·전체 삭제(AC-09), 화면 밖 복귀(AC-13), 렌더러 강제 크래시 후 reload, 종료 시 위치 flush.
- 발견·수정한 결함: (1) 메인 `speakProactive`가 방해 금지·조용한 시간을 검사하지 않아 렌더러 엔진을 우회하면 발화 가능 → 메인에서도 차단(f301356). (2) 종료 시 500ms 디바운스 중인 위치 저장이 유실(`flushSettings` 미대기) → `before-quit`에서 위치 flush 후 저장 완료를 기다려 종료(142dfe5). 두 결함 모두 수정 전 E2E 실패 → 수정 후 통과로 확인.
- 미검증(NOT_TESTED): 실기 마우스 체감(hover/드래그는 `sendInputEvent` 주입), 실제 모니터 분리·DPI·절전, 장시간(수 시간) 상주 안정성. 키리코 모델 렌더링·표정·모션·물리는 10절에서 검증.

### 12. 패키징 — 검증 통과 (설치/제거 미검증)
- `npm run dist` → `release/Kirikomodo-Setup-0.1.0.exe`(NSIS, 약 113 MB), `release/Kirikomodo-0.1.0-portable.exe`(약 112 MB, 2026-10-10 재빌드), `release/win-unpacked/`. 코드 서명 없음.
- 검증: `win-unpacked/Kirikomodo.exe --user-data-dir=<임시>` 부팅 로그 ready, settings/sqlite/logs 가 임시 폴더에 생성, 메인 창 생성, 시작 프로그램 Run 항목 없음(기본 off). 실제 `%APPDATA%` 미접촉.
- 미검증: NSIS 설치/제거 실행, 포터블 exe 실행, 실제 데스크톱 외관(비대화형 세션에서 캡처 불가).
- 보고서: `docs/final-report.md`(산출물·검증 결과·구현 현황·미완료·수동 작업).

## 공통 제약
- 외부 네트워크·LLM·텔레메트리 없음. 모든 데이터는 `%APPDATA%/Kirikomodo/`에 저장.
- 로그 파일명이 UTC 날짜 기준(로컬 날짜와 어긋날 수 있음).
- 키리코 IP 관련 에셋은 사용자 제작/허가 필요(명세 13절).
