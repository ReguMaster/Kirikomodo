# 구현 진행 현황

명세서(`docs/implementation-spec.md`) 17.6 진행 문서 규칙에 따라 기능별 상태를 기록한다.
상태 구분: `구현 완료(검증 전)` / `검증 통과` / `검증 실패` / `미검증` / `외부 도구 필요`.
"검증 통과"는 `npm run typecheck`·`npm test`·`npm run build`·`npx electron .` 부팅 스모크·오프스크린 캡처 스크립트 중 해당 항목을 통과한 것이며, 실기 사용자 조작 검증은 별도로 표시한다.

최종 갱신: 2026-10-10 (작업 8 완료 시점). 전체 통합 검증·설치 패키지 검증은 Phase 5(작업 11·12)에서 재기록한다.

## 요약

| # | 기능 | 커밋 | 상태 |
|---|------|------|------|
| 1 | 기본 구조 (Electron 44 + React 19 + TS + electron-vite 5) | dfa21a2 | 검증 통과 (typecheck/vitest/build) |
| 2 | 데스크톱 상주 (투명창·항상 위·트레이·자동 실행·다중 모니터 보정) | 659bdca | 부분 검증 (아래 참조) |
| 3 | 2D 플레이스홀더 캐릭터 + 렌더러 분리 | a5937b1 | 검증 통과 (오프스크린 캡처) |
| 4 | 상호작용 (드래그·Ctrl+휠 크기·클릭 반응·시선·우클릭 메뉴) | 1f3eab6 | 검증 통과 (오프스크린 입력 주입) |
| 5 | 애니메이션 + 모션 우선순위 | 1aa6876 | 검증 통과 (vitest) |
| 6 | 행동 시스템 (시간대·조용한 시간·방해 금지·선제 발화 제한) | a92eeb0 | 검증 통과 (vitest) |
| 7 | 규칙 기반 대화·말풍선·채팅 UI | 744f331 | 검증 통과 (vitest + 오프스크린) |
| 8 | 설정 화면·SQLite 기록·JSON 내보내기·예외 복구 | 3fbcadb | 검증 통과 (vitest + 스모크 + 오프스크린) |
| 9 | Live2D 파츠 분리·모델 제작 파이프라인 | (본 커밋) | 도구·문서 완료, 모델은 NEEDS_MANUAL_QA/REQUIRES_EDITOR (`docs/model-production-status.md`) |
| 10 | Live2D Cubism 모델 로더 | – | 미구현 (Cubism Core는 외부 배포) |
| 11 | 통합 테스트·타입 검사·빌드·오류 수정 | – | 미착수 |
| 12 | Kirikomodo.exe 빌드 + 보고서 | – | 미착수 |

## 기능별 상세

### 1. 기본 구조 — 검증 통과
- 3개 BrowserWindow(character/chat/settings), `contextIsolation`+`sandbox`, preload `contextBridge`, IPC sender 검증 + zod 스키마.
- settings.json 원자적 저장(tmp→bak→rename), CSP는 패키징/프리뷰에서만 적용.
- 검증: typecheck, vitest, build 산출물(`out/main`, `out/preload`, `out/renderer/*`) 확인.

### 2. 데스크톱 상주 — 부분 검증
- 검증 통과: 부팅 스모크(트레이 생성 로그), 작업 영역 clamp 순수 함수 vitest.
- 미검증: 실기 클릭 통과(`setIgnoreMouseEvents`) 체감, 트레이 메뉴 클릭, 다중 모니터/DPI 변경, 절전 복귀 보정, 시작 프로그램 등록(패키징 빌드에서만 동작).

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
- 미구현: `user_profile` 테이블(사용처 없음), 하드웨어 가속 진단, 소리 끄기(음성 기능 없음), 언어 선택(한국어 고정), Live2D 모델 가져오기 UI(작업 10).

### 9. Live2D 파츠 분리·제작 파이프라인 — 도구 완료, 모델 미완성
- `tools/live2d-authoring/` Python CLI 9종(계획 생성·원화 분석·색/ROI 초안 분리·파츠 검증·미리보기·pure-Python PSD 조립·model3.json 검증·파이프라인·픽스처). 사용법 `docs/live2d-authoring.md`.
- 레이어 계약 `docs/live2d-layer-contract.json` + 76 레이어 계획(`assets/live2d-authoring/input/layer-plan.json`, 파츠 목록 `docs/live2d-kiriko-parts.md` 자동 생성).
- 검증: `npm run test:authoring`(픽스처 기반 자체검증 5종 통과), `run_pipeline.py --build-id 2026-10-10-r6` 전체 상태 `NEEDS_MANUAL_QA`.
- 미완: 완성 파츠 PNG 0/51, Cubism Editor 리깅·moc3 내보내기(`REQUIRES_EDITOR`, Editor 미설치), 배포 가능한 원화 없음(`docs/asset-rights.md`). 산출물 폴더 `assets/live2d-authoring/output/` 은 Git 무시.

### 10. Live2D 로더 — 미구현 / 외부 도구 필요
- Cubism Core(`live2dcubismcore.min.js`)는 npm 미배포 → 사용자가 공식 SDK에서 가져와야 함. 미존재 시 플레이스홀더 폴백.

### 11~12. 통합 검증·패키징 — 미착수
- 설치 패키지(electron-builder NSIS) 생성·설치·제거 검증은 작업 12에서 기록.

## 공통 제약
- 외부 네트워크·LLM·텔레메트리 없음. 모든 데이터는 `%APPDATA%/Kirikomodo/`에 저장.
- 로그 파일명이 UTC 날짜 기준(로컬 날짜와 어긋날 수 있음).
- 키리코 IP 관련 에셋은 사용자 제작/허가 필요(명세 13절).
