# Kirikomodo 최종 구현 보고서

작성일: 2026-10-10 · 버전 0.1.0 · 브랜치 `ai/autopilot` · 기준 명세 `docs/implementation-spec.md`

## 1. 배포 산출물

`npm run dist` (electron-vite build → electron-builder 26, Electron 44.7.0, x64) 결과. `release/` 는 Git 무시 대상이므로 재생성해 사용한다.

| 파일 | 용도 | 크기 |
|------|------|------|
| `release/Kirikomodo-Setup-0.1.0.exe` | NSIS 설치 프로그램 (사용자별 설치, 설치 경로 변경 가능, 제거 시 AppData 유지) | 약 108 MB |
| `release/Kirikomodo-0.1.0-portable.exe` | 포터블 단일 실행 파일 | 약 107 MB |
| `release/win-unpacked/Kirikomodo.exe` | 압축 전 실행 폴더 (asar 포함) | – |

- 코드 서명 없음(`Get-AuthenticodeSignature` → NotSigned). 배포 시 SmartScreen 경고가 뜰 수 있다.
- 실행 파일 메타: ProductName Kirikomodo, FileVersion 0.1.0, CompanyName ReguMaster. 아이콘 `resources/icon.ico`.
- `electron-builder.yml` 의 `buildResources: build` 폴더가 없어 경고가 나지만 빌드에는 영향 없다.

### 패키징 결과 검증
- `release/win-unpacked/Kirikomodo.exe --user-data-dir=<임시 폴더>` 로 실행: 부팅 로그 `Kirikomodo 0.1.0 starting → store opened → ready`, `settings.json`·`kirikomodo.sqlite`·`logs/` 가 지정 폴더에 생성, 메인 창 `Kirikomodo` 생성 확인. 실제 `%APPDATA%/Kirikomodo` 는 건드리지 않음.
- 시작 프로그램 등록은 기본값 off → `HKCU\...\Run` 에 항목이 생기지 않음을 확인.
- **미검증**: NSIS 설치/제거 실행(개발 PC 시스템 변경을 피하려고 생략), 포터블 exe 실행(압축 해제 뒤 동작은 win-unpacked 와 동일), 실제 데스크톱에서의 투명창 외관(비대화형 세션에서는 화면 캡처 불가).

## 2. 검증 결과 요약

| 검사 | 결과 |
|------|------|
| `npm run typecheck` (node + web) | 통과 |
| `npm test` (vitest) | 43/43 통과, 8 파일 |
| `npm run build` | 통과 (`out/main`, `out/preload`, `out/renderer/{character,chat,settings}`) |
| `npm run test:authoring` (Live2D 제작 도구 자체검증) | 통과 |
| `npm run test:e2e` (실앱 E2E, 임시 userData) | 29/29 통과 |
| `npm run dist` | 통과 (NSIS + portable) |

E2E(`tests/e2e/smoke.cjs`)가 확인한 항목: 손상 설정 → `.bak` 복구·위치 복원(AC-03), 없는 모델 → 플레이스홀더 폴백 + 안내 말풍선(AC-11), 투명 영역 클릭 통과 전환(AC-02), 드래그·위치 저장(AC-03), 트레이 메뉴 5항목(AC-04), 표정 미리보기(AC-05), 방해 금지·일일 3회 제한(AC-07), 규칙 대화·unknown 폴백(AC-08), SQLite 기록·전체 삭제(AC-09), 화면 밖 복귀(AC-13), 렌더러 강제 크래시 후 자동 reload, 종료 직전 이동 위치 flush.

통합 검증 중 발견·수정한 결함:
1. 메인 프로세스 `speakProactive` 가 방해 금지·조용한 시간을 검사하지 않음 → 메인에서도 차단 (`f301356`).
2. 종료 시 500 ms 디바운스 중이던 캐릭터 위치 저장이 유실됨 → `before-quit` 에서 flush 후 저장 완료를 기다려 종료 (`142dfe5`).

## 3. 구현 결과 (기능별)

기능별 상세·커밋은 `docs/implementation-progress.md` 참조.

| 영역 | 상태 | 비고 |
|------|------|------|
| 기본 구조 (Electron 44 + React 19 + TS + electron-vite) | 완료 | contextIsolation·sandbox, IPC sender 검증 + zod |
| 데스크톱 상주 (투명창·항상 위·트레이·클릭 통과·다중 모니터 보정·절전 복귀) | 완료 | 실제 모니터 분리·DPI·절전은 미검증 |
| 플레이스홀더 캐릭터 (SVG, 감정 7·모션 10) | 완료 | |
| 상호작용 (드래그·Ctrl+휠 크기·클릭 반응·시선 추적·우클릭 메뉴) | 완료 | 실기 마우스 체감은 미검증(E2E는 입력 주입) |
| 모션 우선순위·쿨다운 | 완료 | |
| 행동 시스템 (시간대·조용한 시간·방해 금지·선제 발화 제한) | 완료 | 장시간 상주 안정성 미검증 |
| 규칙 기반 대화·말풍선·채팅창 | 완료 | 자유 자연어 이해 없음(설계상) |
| 설정 화면·SQLite 기록·JSON 내보내기·예외 복구 | 완료 | |
| Live2D 모델 로더 (`kmd-model://`, 가져오기, 자체 WebGL 렌더러) | 완료 (샘플 Haru 실렌더링 검증) | 키리코 모델은 미제작 |
| Live2D 파츠 분리·제작 파이프라인 (Python CLI) | 도구 완료, 모델 미완성 | `NEEDS_MANUAL_QA` / `REQUIRES_EDITOR` |
| Windows 패키징 (NSIS + portable) | 완료 | 코드 서명 없음 |

## 4. 미완료·미구현 항목

- **Live2D 실모델**: 완성 파츠 PNG 0/51, Cubism Editor 리깅·`.moc3` 내보내기 미수행. 배포 가능한 원화 없음(`docs/asset-rights.md`). 현재 앱은 항상 플레이스홀더로 동작한다.
- **Live2D 런타임 미지원**: physics3/pose3/사운드/립싱크(파일은 복사만), 반전 마스크(하드 스텐실만). 샘플 모델 렌더링은 검증했으나 모션·표정·시선 동작은 미확인.
- **설정 항목 중 미구현**: 하드웨어 가속 진단, 소리 끄기(음성 기능 없음), 언어 선택(한국어 고정). `user_profile` 테이블은 사용처가 없어 만들지 않음.
- **검증 범위 밖**: NSIS 설치/제거, 실제 두 번째 모니터 분리·DPI 변경·절전 복귀, 수 시간 상주, 실제 데스크톱에서의 클릭 통과 체감.
- 로그 파일명이 UTC 날짜 기준(로컬 날짜와 어긋날 수 있음, 사소).

## 5. 수동 작업 필요 사항

1. ~~Cubism Core 배치~~ — 불필요. `external/live2dcubismcore/` 에 포함돼 있고 패키징 시 앱에 들어간다(출처·라이선스는 그 폴더 README). 모델만 설정 > 모델 > "가져오기" 로 넣으면 된다.
2. **키리코 모델 제작**: 원화 확보(권리 확인) → `tools/live2d-authoring/` 파이프라인으로 파츠 PSD 조립 → Cubism Editor 에서 리깅·`.model3.json` + `.moc3` 내보내기 → 설정 > 모델 > "가져오기". 절차는 `docs/live2d-authoring.md`, 현황은 `docs/model-production-status.md`.
3. **실기 확인**: 설치 프로그램 설치/제거, 다중 모니터·DPI 변경·절전 복귀 후 캐릭터 위치, 시작 프로그램 등록(패키징 빌드에서만 동작), 투명창 클릭 통과 체감.
4. **배포 준비**: 코드 서명 인증서 적용, `appId`(`io.github.regumaster.kirikomodo`) 최종 확정, `build/` 리소스 폴더 추가 여부 결정.

## 6. 실행·검증 방법

```bash
npm install
npm run typecheck && npm test && npm run build
npm run test:e2e        # 실앱 E2E (창이 실제로 뜸, 임시 userData 사용)
npm run test:authoring  # Python 3.11 + Pillow + numpy
npm run dist            # release/ 에 설치/포터블 exe 생성
```

사용자 데이터 위치: `%APPDATA%/Kirikomodo/` (`settings.json`, `kirikomodo.sqlite`, `logs/`, `models/`, `live2d/`). 외부 네트워크·텔레메트리 없음.
