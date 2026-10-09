# Kirikomodo — 비LLM 데스크톱 컴패니언 구현 명세서

- 버전: 1.5
- 작성일: 2026-10-10
- 공식 프로젝트명 / GitHub 저장소명: **Kirikomodo**
- 구현 대상: Windows 10/11 데스크톱 애플리케이션
- 개발 방식: Claude Code로 기능을 하나씩 구현하고 **기능마다 테스트 없이 자동 로컬 Git 커밋**, 전체 구현 이후에만 통합 테스트·오류 수정·재검증
- 핵심 기술: Electron, React, TypeScript, Live2D Cubism SDK for Web, SQLite
- 기본 UI 언어: 한국어
- 상태: 개발 착수용 설계 초안 (컴패니언 런타임 LLM·음성 AI 미포함; **개발 단계 모델 에셋 제작 파이프라인 포함**)

## 0. 프로젝트 공식 명칭 및 식별 규칙 (v1.3 추가)

### 0.1 프로젝트 명칭

- **공식 프로젝트명:** `Kirikomodo`
- **이름의 유래:** 키리코(`Kiriko`)와 키리코의 일본어 대사에서 착안한 `modo`를 합친 사용자 창작 명칭.
- **GitHub 저장소명:** `Kirikomodo` (대소문자 그대로)
- **앱 표시명 / 제품명:** `Kirikomodo`
- **npm 패키지명:** `kirikomodo` (소문자)
- **Windows 실행 파일명:** `Kirikomodo.exe`
- **설치 프로그램 표시명:** `Kirikomodo` (설치 파일명 예: `Kirikomodo-Setup-1.0.0.exe`)
- **데이터 디렉터리 표시명:** `Kirikomodo` (Electron `userData` 경로 이용; 경로 하드코딩 금지)
- **README 제목:** `Kirikomodo`
- **프로젝트 한 줄 설명:** `A little desktop companion, inspired by Kiriko.`
- **앱의 캐릭터명:** `Kiriko` / `키리코` (프로젝트명과 구별)

### 0.2 표기·구현 규칙

1. 프로젝트명은 모든 UI/설정/트레이/로그 시작 문구/문서/패키징에서 **`Kirikomodo`로 통일**한다.
2. 소스코드에서 패키지 이름이 필요한 경우 `kirikomodo`를 사용한다. 공식 GitHub 저장소의 대소문자는 `Kirikomodo`로 유지한다.
3. 레퍼런스 이미지, 원화 파츠, Live2D 모델의 에셋 접두사 `Kiriko_*`는 캐릭터 이름이므로 **변경하지 않는다**.
4. 과거 가칭 `Kiriko Companion`은 신규 파일·브랜드·제품명으로 사용하지 않는다. 기존 문서를 인용하는 경우만 과거 명칭으로 설명한다.
5. `appId`는 공개 배포 시 소유한 계정·도메인에 맞춰 **고유값으로 확정**한다. 예시 `io.github.<github-username>.kirikomodo`의 `<github-username>`은 실제 계정명으로 교체하며 예시값 그대로 배포하지 않는다.
6. 게임 공식 앱으로 오인할 수 있는 `Official`, `Overwatch` 등의 명칭·표기를 브랜드에 붙이지 않는다. 공식 제휴/후원을 암시하지 않는다.
7. GitHub 저장소 생성·원격 연결/푸시는 사용자가 허용했을 때만 수행한다. 저장소명 확정과 원격 저장소 생성은 별개다.

### 0.3 패키징 식별자 예시

`package.json` 및 패키징 설정의 관계를 다음처럼 유지한다. 아래 JSON은 **설정 키 예시**이며, 실제 사용 중인 빌더에 맞춰 적용한다.

```json
{
    "name": "kirikomodo",
    "productName": "Kirikomodo",
    "build": {
        "productName": "Kirikomodo",
        "executableName": "Kirikomodo"
    }
}
```

실제 구성 파일은 사용하는 빌더의 문법으로 작성하며, 설치 결과의 실행 파일명을 확인한다. `appId`는 0.2절의 고유 ID 확인 후 설정한다.

### 0.4 명칭 반영 수용 기준

- `N-01` 앱 창과 트레이 메뉴의 표시명이 `Kirikomodo`이다.
- `N-02` 패키지 이름은 `kirikomodo`, 제품명은 `Kirikomodo`이다.
- `N-03` 빌드 결과 실행 파일이 `Kirikomodo.exe`이다.
- `N-04` README 및 사용자 대상 문서에서 프로젝트명이 `Kirikomodo`이다.
- `N-05` Live2D 에셋의 캐릭터 접두사 `Kiriko_*`는 유지된다.
- `N-06` 샘플 `appId` 플레이스홀더가 실제 릴리스에 남지 않는다.

## 1. 프로젝트 목표

**Kirikomodo**는 키리코와 친구처럼 지내는 느낌의 **항상 상주하는 2D 데스크톱 컴패니언**이다. 캐릭터는 별도 앱 화면 속이 아니라 바탕화면/작업창 위에 작게 표시되며, 대화하지 않는 시간에도 숨 쉬기·눈 깜빡임·시선 이동·휴식 등 자율 행동을 한다.

현재 Live2D 모델은 보유하지 않는다. **모델이 전혀 없어도 실행 가능한 자체 제작 2D 플레이스홀더 모드**를 반드시 완성한다. 이와 병행해 **원화 준비→파츠 분리→PSD 구성→Cubism 리깅 지원→모델 출력→앱 임포트**의 별도 **제작 시점(asset-authoring) 파이프라인**을 구축한다. 최종 `.model3.json` 모델의 생성은 Live2D Cubism Editor의 실질적 출력과 검증이 필요한 작업이다. 원화가 없거나 Editor가 미설치된 경우에는 자동화 도구와 샘플·검증 체계까지만 완료한 것으로 보고하고, 모델 완성으로 표시하지 않는다.

### 1.1 비목표 / 제외 범위

- LLM API, Ollama, 프롬프트, RAG, 임베딩, 자동 AI 대화 생성
- AI 기반 감정 분석, AI 기반 기억 추출·요약
- STT/TTS, 음성 합성, 성우 음성 복제, 음성 명령
- 화면 캡처, 화면 OCR, 운영체제 활동 감시
- 온라인 계정, 클라우드 동기화, 멀티플레이
- 3D 캐릭터, 물리 기반 데스크톱 전체 탐색
- 최종 사용자 앱 내부의 이미지 생성, 이미지 편집 AI 실행, 모델 학습·다운로드 기능
- **모델 원화 제작·파츠 준비·리깅 보조 자동화는 개발용 별도 도구로 포함** (15절 참고)

대화창, 대화 기록, 정해진 문장에 의한 반응 시스템, 향후 AI를 붙일 수 있는 인터페이스는 **포함**한다. AI인 것처럼 가장하는 가짜 지능을 구현하지 않는다. **개발용 이미지 생성·편집 AI는 앱 런타임의 LLM 기능과 별개**이며, 명시적으로 설정된 도구·라이선스·에셋이 있을 때만 사용한다.

## 2. 우선순위

- **P0 / 필수:** 정상 실행·종료, 투명 캐릭터 창, 시스템 트레이, 기본 2D 플레이스홀더, 드래그/크기 조절, 동작/표정 상태 머신, 규칙 기반 대화, 설정 저장, 예외 복구, 설치 패키지.
- **P1 / 필수:** 공식 SDK 기반 Live2D 런타임 연결, 사용자가 준비한 모델 폴더 가져오기, 능력별 모션 매핑, 자율 행동 스케줄러, 다중 모니터/DPI 지원, SQLite 대화 기록, 방해 금지, 윈도우 시작 프로그램.
- **P1-Asset / 병행 필수:** 키리코 상반신 원화 제작 가이드, 파츠 명세, 파츠/PSD 조립 스크립트, 품질 검사·리포트, Cubism Editor 반자동 가이드, `.model3.json` 임포트 연계. 실제 모델의 완성/배포는 적법한 원화·Editor·리깅 결과가 확보된 뒤에만 판정.
- **P2 / 후순위:** 고급 화면 내 위치 동작, 선택적 효과음, 단축키 편집, 자율 행동 편집 UI, 일과 프리셋, 전체 화면 앱 자동 감지, Cubism GUI 자동화 실험.

P0만으로도 모델 없는 상태의 실행 파일을 만들 수 있어야 한다. P1의 Live2D 검증은 정식 샘플 또는 사용자가 가져온 라이선스 적합 모델을 통해 확인한다. **P1-Asset은 앱 개발과 독립된 작업 트랙이며, 권리가 확인된 키리코 원화/모델이 없다는 이유만으로 P0/P1 앱 개발을 정지하지 않는다.**

## 3. 기술 선택 및 프로세스

| 구분                 | 선택                                                  | 비고                                           |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| 데스크톱 셸          | Electron                                              | Windows 10/11 우선                             |
| UI                   | React + TypeScript + Vite                             | 엄격한 타입 검사                               |
| 상태 관리            | Zustand 또는 동등한 경량 스토어                       | UI 상태와 도메인 상태 구분                     |
| 스타일               | CSS Modules / CSS variables                           | 불필요한 UI 프레임워크 지양                    |
| 2D 플레이스홀더      | 자체 제작 SVG + CSS/Canvas                            | Live2D 모델·SDK가 없어도 동작                  |
| 에셋 제작 파이프라인 | Python + Pillow/OpenCV(필요 시 선택적 AI 이미지 도구) | 앱 빌드와 독립, 무인 제작 성공을 가정하지 않음 |
| 레이어 PSD 조립      | 호환 이미지 편집기/스크립팅 + Cubism 임포트 실검증    | RGB 8bit/sRGB, 각 파츠 정렬 유지               |
| Live2D               | 공식 Cubism SDK for Web (호환되는 안정 릴리스 고정)   | Core 라이선스 확인; 선택적 로드                |
| 설정                 | JSON (원자적 저장)                                    | 앱 설정·창 위치                                |
| 기록                 | SQLite (메인 프로세스)                                | 스크립트 대화·이벤트 기록                      |
| 검증                 | Zod 등                                                | IPC·설정·이벤트 데이터 검증                    |
| 테스트               | Vitest, Playwright Electron 또는 동등 도구            | 윈도우별 E2E/수동 테스트 병행                  |
| 패키징               | electron-builder 또는 electron-forge                  | Windows 설치 파일 생성                         |

**프로세스 분리**

- **Electron Main:** 창 생성/위치, 트레이, 자동 실행, 파일 가져오기, SQLite, 설정, 시스템 이벤트, 프로세스 단일 인스턴스 관리.
- **Preload:** 명시적 메서드만 `contextBridge`로 노출. Renderer에 Node.js/원시 IPC 제공 금지.
- **Character Renderer:** 투명 배경 + 플레이스홀더 또는 Live2D Canvas, 동작·표정 렌더링, 히트 테스트.
- **Chat Renderer:** 스크립트 대화창, 대화 이력, 사용자 입력.
- **Settings Renderer:** 설정 화면, 모델 가져오기·검증 결과, 진단 정보.
- **Companion Core:** 대화·행동·감정·시간·이벤트를 결정하는 순수 TypeScript 모듈. UI/SDK와 분리.

캐릭터 창, 채팅 창, 설정 창은 별도 `BrowserWindow`로 구현한다. 캐릭터 창 투명 입력 문제를 해결하기 위해 Renderer에서 마우스 위치가 실제 상호작용 영역인지 계산하고 Main에 제한적으로 전파한다. 투명한 빈 영역은 마우스 입력이 통과해야 한다. `setIgnoreMouseEvents`가 윈도우 **전체**에 적용되는 특성 때문에 실제 히트 테스트와 상태 전환을 반드시 Windows에서 실기 검증한다.

## 4. 기능 요구사항

### FR-001 시작/종료/상주

1. 실행 시 단일 인스턴스를 보장하고 캐릭터 창을 표시한다.
2. 창은 프레임 없음, 배경 투명, 작업 표시줄 미표시, 기본적으로 항상 위 표시.
3. 캐릭터가 아닌 투명 영역은 하위 창 클릭을 막지 않아야 한다.
4. 트레이 메뉴: 캐릭터 표시/숨기기, 대화 열기, 방해 금지 토글, 설정, 앱 종료.
5. 채팅/설정 창을 닫아도 캐릭터는 상주한다. **완전 종료는 트레이 '종료'**로 가능해야 한다.
6. 시작 시 이전 크기·위치·설정을 복원한다.
7. 모니터 분리 또는 해상도 변경 후 캐릭터가 화면 밖에 갇히지 않도록 가시 영역으로 보정한다.
8. OS 재부팅 후 자동 실행은 기본값 OFF, 사용자가 활성화 가능.

### FR-002 캐릭터 외형과 렌더러

1. 렌더러 인터페이스 `CharacterRenderer` 정의: `mount`, `dispose`, `setEmotion`, `playMotion`, `setLookTarget`, `setScale`, `hitTest`.
2. `PlaceholderRenderer`: 저작권 이슈 없는 **독자 제작 SVG/단순 2D 마스코트**. 눈 깜빡임·호흡·고개 갸웃·좌우 시선·미소·졸림·가벼운 반응을 표현할 것. 단순 텍스트 박스만으로 대체하지 않는다.
3. `Live2DRenderer`: Cubism Web SDK를 사용하여 `.model3.json` 모델 로딩, 애니메이션/표정/시선/히트 영역 처리.
4. 모델이 없거나 로딩에 실패하면 플레이스홀더로 안전하게 전환하고 재시도/오류 안내를 제공한다.
5. 애니메이션 기본 목표 60fps(가능한 환경), 유휴 상태 소비량을 줄이기 위한 렌더 제한 제공.
6. 캐릭터 크기 50~200% 설정, 화면 내 드래그 이동, 좌우 반전 옵션.
7. 더블클릭 시 대화창, 우클릭 시 간단한 컨텍스트 메뉴.

### FR-003 모델 가져오기/관리

1. 사용자가 `.model3.json` 선택 또는 모델 폴더 선택 → 해당 파일에서 참조하는 `.moc3`, 텍스처, `.motion3.json`, `.exp3.json`, 물리·포즈 파일을 검증한다.
2. 상대 경로를 모델 루트 안에서만 해석한다. `../` 경로 탈출, 임의 원격 URL, 실행 파일, 예기치 않은 대용량 파일을 거부한다.
3. 모델 폴더를 `app.getPath('userData')/models/{modelId}`에 안전하게 복사·등록한다. 사용자 원본 폴더를 변형하지 않는다.
4. 등록 정보: ID, 표시 이름, 출처 메모, `model3` 위치, 발견한 모션·표정·히트 영역, 기능 지원 여부.
5. 모션/표정 그룹 이름은 모델마다 다를 수 있으므로 강제하지 않는다. 별도 `model-map.json` 또는 설정 UI에서 의미별 매핑한다.
6. 파일을 가져오는 것만으로 모델이 정상 작동한다는 뜻은 아니다. 실제 렌더링 테스트 후 성공 처리한다.
7. 모델 변경·삭제(앱 등록 사본만)·실패 시 이전 모델로 롤백을 지원한다.
8. Live2D 라이선스/모델 저작권을 준수한다. 샘플 및 제3자 게임 캐릭터 자산은 무단 패키지 포함하지 않는다.
9. **제작 파이프라인의 결과물**은 원화 PNG, 레이어/정렬 메타데이터, PSD, Cubism 프로젝트, 임베디드 모델을 명확히 구분한다. `.moc3`는 PSD 조립만으로 생성할 수 없으므로 가짜/빈 파일 생성 금지.
10. `assets/live2d-authoring/`의 편집용 자산과 사용자용 `userData/models` 모델을 분리한다. 제작 결과는 15절의 검증을 통과한 후에만 앱 모델 관리자로 등록한다.

### FR-004 동작/표정/감정

- 기본 감정: `neutral`, `happy`, `playful`, `curious`, `concerned`, `sleepy`, `annoyed`.
- 기본 행동: `idle`, `blink`, `look`, `greet`, `wave`, `headTilt`, `stretch`, `yawn`, `reactTap`, `rest`.
- 각 감정은 표정 키, 후보 모션, 기본 지속시간, 쿨다운을 가진다.
- 모션 우선순위: **수동 명령/클릭 반응 > 대화 반응 > 자율 이벤트 > 기본 대기**.
- 동작 중복 재생 방지, 취소/인터럽트, 쿨다운, 무효 모션 안전 폴백 필수.
- 입·눈·시선 등 파라미터 제어 충돌을 막기 위해 레이어/소유권 관리.
- 없는 표정/모션은 가능한 기본 표정/idle로 대체하고 오류로 앱을 종료하지 않는다.
- 감정 상태는 사용자의 특정 조작, 이벤트, 스크립트 대화에 의해 규칙적으로 변경된다. 비LLM 버전에서 자유 텍스트 감정 분석은 하지 않는다.

### FR-005 자율 행동/생활 패턴

- 시간대 프리셋: 아침(06~11), 낮(11~18), 저녁(18~23), 밤(23~06). 사용자 설정에서 변경 가능.
- 유휴 상태에서는 10~40초 사이의 짧은 눈·시선 행동, 1~5분 사이의 큰 동작을 **가중치 추첨**. 숫자는 초기 설정값이며 수정 가능.
- 부자연스러운 모션 연속 반복·같은 대사 연속 표시 금지.
- 대화 중/드래그 중/방해 금지/숨김 중에는 자율 발화를 억제한다.
- 사용자의 대화·클릭 이후 5분 동안 선제 말 걸기 금지(초기값).
- 자율 말 걸기 최대 하루 3회, 발화 간 최소 90분(초기값). 방해 금지는 전부 차단.
- 스케줄링은 렌더 프레임과 별도로 동작. 절전·복귀 후 누적 이벤트를 한꺼번에 실행하지 않는다.
- `BehaviorEngine`은 결정 결과로 `CompanionEvent`만 발행하고 UI를 직접 조작하지 않는다.

### FR-006 규칙 기반 대화 (LLM 없음)

- 실제 사용자 입력과 캐릭터 답변을 표시하는 별도 채팅창 제공.
- 처음에는 `greeting`, `status`, `work`, `break`, `goodnight`, `thanks`, `joke`, `help`, `unknown` 등의 의도 사전을 사용.
- 한국어 키워드·정규식·버튼형 퀵 리액션을 통한 결정적 라우팅. 의도별 복수 대사를 중복 회피하여 무작위 선택.
- 인식 불가 문장은 정해진 범위에서 솔직한 기본 답변(예: '그 말은 아직 잘 모르겠어. 다른 얘기 해볼까?')을 반환한다.
- 자유로운 자연어 이해·AI인 듯한 거짓 응답 금지. 환경설정에 '현재는 규칙 기반 대화' 표시.
- 모든 메시지: id, 발화자, 텍스트, 시각, source(script/user), 연결된 감정·모션 기록.
- 사용자 입력을 그대로 HTML에 삽입 금지. 텍스트로만 렌더링, 입력 길이 제한 1,000자.
- 캐릭터 응답은 말풍선(기본 4~8초) 및 채팅 로그에 동시 반영. 타이핑 연출과 간단한 입 움직임은 옵션.
- **대화 제공자 인터페이스**를 구현하되 실제 공급자는 `ScriptedDialogueProvider` 하나만 등록. LLM Provider 구현/호출/환경변수는 만들지 않는다.

### FR-007 로컬 기록/관계/상태

- SQLite에 대화 로그·세션·이벤트 기록을 보관한다.
- 유저에게 설정한 별명, 주요 관심사 등은 **직접 편집 가능한 로컬 프로필**로만 저장한다. 비LLM 버전에서 자유 텍스트에서 프로필을 자동 추출하지 않는다.
- 관계/친밀도를 보여줄 필요가 있다면 `함께한 시간`, `대화 횟수`, `최근 상호작용`처럼 설명 가능한 지표만 사용한다. 과장된 감정 수치 노출 금지.
- 기록 열람·전체 삭제·JSON 내보내기 지원.
- 정기 저장 및 비정상 종료 후 복구. 스키마 버전/마이그레이션 관리.
- 모든 데이터 로컬 저장. 외부 분석 SDK와 원격 전송 기본 금지.

### FR-008 설정/조작성

설정은 작은 데스크톱 유틸리티다운 **화이트·미니멀 UI**로 구성한다.

- 일반: Windows 시작 시 실행, 항상 위, 트레이로 숨김, 언어(한국어 고정 가능).
- 캐릭터: 모델 선택/가져오기, 크기, 불투명도(캐릭터 창), 좌우 반전, 위치 초기화.
- 행동: 자율 행동 활성화, 발화 빈도, 시간대, 방해 금지 시간(예: 23:00~08:00).
- 대화: 말풍선 표시 시간, 스크립트 대화 활성화, 대화 기록 삭제.
- 고급: FPS 제한(30/60), 하드웨어 가속 관련 진단, 로그 보기, 초기화.
- 접근성: 텍스트 크기, 애니메이션 감소, 소리 끄기(후속 효과음 대비).

**디자인 원칙:** 과한 그라디언트·글로우·장식 카드·보라색 AI 대시보드 분위기 금지. 기능 중심 레이아웃, 명확한 계층, 기본 OS 동작에 가까운 컨트롤. 빈 상태·모델 없음·오류 상태는 안내문과 실제 가능한 동작을 제공한다.

## 5. 명시적 인터페이스 계약

```ts
export type Emotion = "neutral" | "happy" | "playful" | "curious" | "concerned" | "sleepy" | "annoyed";

export type Motion = "idle" | "blink" | "look" | "greet" | "wave" | "headTilt" | "stretch" | "yawn" | "reactTap" | "rest";

export interface CharacterRenderer {
    mount(container: HTMLElement): Promise<void>;
    dispose(): Promise<void>;
    setEmotion(emotion: Emotion): void;
    playMotion(motion: Motion, priority?: number): Promise<boolean>;
    setLookTarget(x: number, y: number): void;
    setScale(scale: number): void;
    hitTest(x: number, y: number): "head" | "body" | null;
}

export interface DialogueRequest {
    text: string;
    now: string;
    context: { timeOfDay: "morning" | "day" | "evening" | "night" };
}
export interface DialogueResponse {
    text: string;
    emotion: Emotion;
    motion?: Motion;
    intent: string;
    source: "script";
}
export interface DialogueProvider {
    respond(request: DialogueRequest): Promise<DialogueResponse>;
}

export interface CompanionEvent {
    id: string;
    type: "USER_TAP" | "USER_CHAT" | "TIME_TICK" | "IDLE_ACTION" | "PROACTIVE_DIALOGUE" | "SETTINGS_CHANGED" | "MODEL_CHANGED";
    timestamp: number;
    payload?: unknown;
}
```

`Renderer`와 `Engine`은 이벤트/상태 데이터로만 결합한다. 비즈니스 로직에서 Electron과 Live2D 객체를 직접 참조하지 않는다. IPC 입력의 허용 목록을 제한하고 모든 메시지를 검증한다.

## 6. 데이터 구조

### JSON 설정 예시

```json
{
    "schemaVersion": 1,
    "window": { "alwaysOnTop": true, "scale": 1.0, "opacity": 1.0, "x": null, "y": null },
    "character": { "activeModelId": "placeholder", "mirror": false },
    "behavior": {
        "enabled": true,
        "proactiveDialogue": true,
        "dailyProactiveLimit": 3,
        "minimumProactiveIntervalMinutes": 90,
        "quietHours": { "enabled": true, "start": "23:00", "end": "08:00" }
    },
    "display": { "speechBubbleSeconds": 6, "fpsLimit": 60 },
    "privacy": { "analytics": false }
}
```

### SQLite 주요 테이블

- `chat_messages(id, session_id, role, text, source, emotion, motion, created_at)`
- `chat_sessions(id, started_at, ended_at)`
- `companion_events(id, type, payload_json, created_at)` — 이벤트 보존 기간 설정 가능
- `user_profile(key, value_json, updated_at)` — 사용자가 직접 관리하는 정보만
- `schema_migrations(version, applied_at)`

DB는 Main 프로세스에서만 접근한다. JSON 설정은 손상 방지를 위한 임시 파일 쓰기→교체 및 백업을 사용한다. 저장 중 오류가 나면 기존 설정을 유지한다.

## 7. 프로젝트 디렉터리 권장안

```text
Kirikomodo/
├─ electron/
│  ├─ main.ts
│  ├─ preload.ts
│  ├─ windows/{character,chat,settings}.ts
│  ├─ ipc/
│  └─ services/{settings,models,database,autostart}.ts
├─ src/
│  ├─ app/
│  ├─ character/
│  │  ├─ CharacterRenderer.ts
│  │  ├─ PlaceholderRenderer.tsx
│  │  ├─ Live2DRenderer.ts
│  │  ├─ MotionController.ts
│  │  └─ ModelCapabilityMapper.ts
│  ├─ core/
│  │  ├─ CompanionEngine.ts
│  │  ├─ BehaviorEngine.ts
│  │  ├─ EmotionEngine.ts
│  │  ├─ DialogueProvider.ts
│  │  ├─ ScriptedDialogueProvider.ts
│  │  └─ Scheduler.ts
│  ├─ features/{chat,settings,model-manager}/
│  ├─ shared/{types,schemas,events}/
│  └─ styles/
├─ assets/placeholder/
├─ tools/live2d-authoring/
│  ├─ README.md
│  ├─ prepare_artwork.py
│  ├─ validate_layers.py
│  ├─ assemble_psd.py
│  ├─ export_previews.py
│  └─ validate_export.py
├─ assets/live2d-authoring/
│  ├─ input/.gitkeep
│  ├─ layers/.gitkeep
│  └─ output/.gitkeep
├─ scripts/
├─ tests/{unit,integration,e2e,assets}/
├─ docs/
│  ├─ architecture.md
│  ├─ model-import.md
│  ├─ live2d-authoring.md
│  ├─ live2d-qa.md
│  ├─ asset-rights.md
│  └─ decisions.md
└─ package.json
```

사용자 저장 파일 및 가져온 모델은 저장소가 아닌 Electron의 `userData` 아래에 둔다. 모델 바이너리는 기본 Git 저장소에 커밋하지 않는다. 원화/AI 산출물/PSD/CMO3/모델 바이너리는 권리와 용량 때문에 기본 `.gitignore` 대상이며, 배포 허용이 확인된 파일만 별도 승인 후 포함한다. 제작 스크립트·스키마·문서·비저작권 테스트 픽스처는 버전 관리한다.

## 8. 동작 상태 및 전환 규칙

### 상위 상태

`BOOTING` → `READY` → (`IDLE` / `INTERACTING` / `CHATTING` / `RESTING`) → `HIDDEN` → `SHUTDOWN`

- BOOTING: 설정/DB 로드, 렌더러 초기화. 실패하면 안전한 기본값과 플레이스홀더 사용.
- IDLE: 대기 애니메이션, 스케줄러 작동.
- INTERACTING: 클릭/드래그 중에는 자율 모션 중단.
- CHATTING: 입력·응답 중에는 자율 발화 중단, 대화 모션 우선.
- RESTING: 시간대/수동 선택에 따라 조용한 모션.
- HIDDEN: 창 숨김, 타이머 저전력; 대화 발화 및 애니메이션 불필요한 실행 중지.
- SHUTDOWN: 저장·타이머 취소·모델 해제·DB 종료.

상위 상태와 `emotion`은 별도로 관리한다. 작업 중 이벤트가 중복 발생하지 않게 단일 이벤트 큐/취소 토큰을 사용한다.

## 9. 비기능 요구사항

- **안정성:** Live2D 초기화 실패·모델 오류가 프로세스 종료로 이어지지 않을 것.
- **보안:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; CSP, IPC sender/인자 검증, 모델 파일 경로 검증. SDK 호환성 이슈 시 예외를 문서화하고 최소 범위에서 대체.
- **성능:** 일반 유휴 상태에서 부드러운 동작; 자율 로직은 상시 고빈도 폴링 금지. 30/60fps 옵션, 숨김 상태 렌더링 일시 정지. CPU/GPU/RAM 수치는 실측 후 기준 수립.
- **복구:** 렌더 프로세스 crash 이후 재생성/플레이스홀더 폴백, 설정 손상 시 백업 복원, DB 마이그레이션 검증.
- **일관성:** 같은 입력 상태와 난수 시드에서는 동일한 스케줄/대화 결과 재현 가능.
- **오프라인:** 초기 실행과 주요 기능은 인터넷 없이 작동해야 함.
- **관측성:** 오류 로그, 모델 로딩 단계, 이벤트 이력은 개인정보 최소화하여 로컬 기록.
- **패키징:** `npm run dev`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run dist`가 실행되도록 스크립트 제공.

## 10. 구현 단계 (Claude Code 작업 순서)

### Phase 1 — 실행 가능한 데스크톱 기반

1. Electron + Vite + React + TS 구성.
2. 세 창 구조(캐릭터/채팅/설정)와 트레이 메뉴 구현.
3. 화면 위 캐릭터 위치·드래그·스케일·설정 복원.
4. 자체 SVG 캐릭터를 사용한 플레이스홀더 렌더러 구현.
5. 투명 영역 클릭 통과 처리 로직 구현(Windows 실동작 확인은 최종 검증 단계로 미룸).
6. `npm run dev`, `npm run dist` 실행 스크립트와 배포 설정을 구성하되, 실제 실행·빌드 검사는 최종 검증 단계에서 수행.

### Phase 2 — 캐릭터 행동과 대화

1. 상태 머신, 이벤트 큐, 동작 우선순위.
2. 표정 7종 및 기본 동작 10종에 대응하는 플레이스홀더 연출.
3. 시간대별 스케줄, 자율 행동과 선제 대사 제한.
4. 스크립트 대화 사전, 채팅창, 말풍선.
5. 조용한 모드, 대화 중 자율 행동 억제.

### Phase 3 — 저장/모델 관리

1. JSON 설정, SQLite 대화/이벤트 기록, 초기화와 삭제.
2. 공식 Cubism Web SDK를 선택적으로 통합.
3. `.model3.json`/종속 파일 검사, 모델 등록 및 렌더링.
4. 모델 기능 탐지·의미별 모션/표정 매핑·폴백.
5. 모델 없이 재실행, 모델 손상, 다른 모델 교체 상황에 대한 예외 처리와 테스트 시나리오 구현(실행은 최종 검증 단계).

### Phase M — Live2D 모델 제작·자동화 (Phase 1~4와 **병행**)

1. 적법한 원화/참고자료 확보 여부를 기록하고 모델 사양을 확정한다(없으면 중단 상태를 명시).
2. 키리코 **상반신 정면 모델**에 필요한 레이어·매니페스트·명명 규칙을 작성한다.
3. 파츠 분리/가려진 부분 복원/레이어 정렬/PSD 조립을 지원하는 CLI를 구현한다. 외부 AI 도구는 설정되어 있을 때만 선택적으로 실행한다.
4. 이미지·파츠·PSD의 자동 검증, 레이어 합성 미리보기, 사용자 육안 검수 체크리스트를 구현한다.
5. Cubism Editor의 메쉬·디포머·얼굴 자동 생성·템플릿 적용 절차를 문서화하고, 실제 Editor 사용·검수는 최종 검증 단계 또는 별도 수동 단계에 기록한다.
6. 실제 Cubism 출력 `.model3.json` 모델의 앱 임포트와 표정·모션·시선·클릭을 검증할 테스트 절차를 작성한다. 모델/Editor가 확보된 경우에만 최종 검증 단계에서 실행한다.
7. 실제 모델이 없을 때 **제작 도구 준비 완료**와 **모델 완성** 상태를 분리 보고한다. 상세 계약은 15절을 따른다.

### Phase 4 — 기능 구현 마무리 및 통합 준비

1. 다중 모니터·DPI·절전 복귀 대응 로직을 구현하고, 실제 동작 검사는 최종 단계로 미룬다.
2. 채팅/설정/트레이 접근성과 UI 마감을 완료한다.
3. 단위·통합·E2E 테스트 코드와 실패 주입 시나리오를 필요한 범위에서 작성한다. **이 단계에서도 테스트는 실행하지 않는다.**
4. Windows 패키징 설정, README, 아키텍처, 모델 가져오기, 라이선스 안내를 완성한다.
5. 명세서 기능 TODO를 전부 점검하고, 외부 에셋·Cubism 등으로 실제 구현할 수 없는 항목은 `BLOCKED_INPUT`/`REQUIRES_EDITOR`로 따로 분류한다.

### Phase 5 — 전체 구현 후 일괄 테스트·수정·최종 빌드 (필수)

**Phase 1~4 및 개발 가능한 Phase M 기능의 구현과 기능별 커밋이 끝난 뒤에만 시작한다.**

1. 전체 의존성/환경을 점검하고 `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`를 일괄 실행한다(실제 제공되는 스크립트에 맞춰 조정).
2. 단위·통합·E2E, 플레이스홀더, Live2D 모델 폴백, 에셋 검사기 픽스처의 테스트를 수행한다.
3. Windows에서 창 투명 입력 통과, 트레이, 드래그/위치 저장, 다중 모니터·DPI, 절전 복귀, 시작 프로그램, UI를 점검한다. 실행 환경이 없으면 `NOT_TESTED`와 사유를 정확히 기록한다.
4. 실패 항목을 원인별로 분류해 수정하고, **수정 하나당 독립적인 한국어 로컬 커밋**을 남긴다. 수정 단계에서는 관련 재현/회귀 테스트를 필요에 따라 실행한다.
5. 수정이 모두 끝나면 **전체 테스트·타입 검사·lint·빌드를 다시 실행**해 회귀가 없는지 확인한다.
6. 검증 완료 후 Windows 설치 패키지를 생성하고, 가능한 경우 깨끗한 설치 환경에서 실행·삭제까지 검증한다.
7. 최종 결과를 `docs/implementation-progress.md`에 `구현 완료(검증 전) / 검증 통과 / 검증 실패 / 미검증 / 외부 도구 필요`로 구분해 기록하고, 테스트 로그·커밋·남은 제약을 보고한다.

**개발 원칙:** **`기능 구현 → 즉시 로컬 커밋 → 다음 기능`**을 반복한다. **기능마다 테스트·타입 검사·lint·빌드를 실행하지 않으며, 전체 구현 후 Phase 5에서 한꺼번에 검사하고 수정**한다(17절 우선 적용). Git diff/스테이징 범위·보안 점검은 테스트가 아니므로 매 커밋마다 유지한다. **Phase M은 완성된 모델을 요구하지 않고 제작 가능성을 준비하는 병렬 트랙**이다. 외부 에셋 부재 때문에 다른 기능을 중단하지 않는다. 미구현 또는 미검증 항목을 검증 완료로 표시하지 않는다.

## 11. 수용 기준 (완료 판정)

- [ ] **AC-01:** Live2D 모델 없이 클린 설치 후 앱이 구동되고 자체 2D 캐릭터가 보인다.
- [ ] **AC-02:** 캐릭터 창 바깥 및 투명 영역에서 다른 앱을 정상 클릭할 수 있다.
- [ ] **AC-03:** 드래그/크기 변경/화면 이동 후 앱 재실행에도 위치와 크기가 복원된다.
- [ ] **AC-04:** 트레이 메뉴로 표시/숨김·대화·설정·종료가 작동한다.
- [ ] **AC-05:** 표정 7종 및 대응 가능한 기본 동작이 미리보기와 이벤트로 작동한다.
- [ ] **AC-06:** 30분 이상 대기해도 상태 꼬임/동작 중복/동일 대사 반복이 발생하지 않는다.
- [ ] **AC-07:** 방해 금지/대화 중에는 선제 대사가 발생하지 않는다.
- [ ] **AC-08:** 규칙에 일치하는 메시지는 스크립트 응답, 미인식 문장은 기본 응답을 반환한다.
- [ ] **AC-09:** 대화 이력 및 설정이 재시작 후에도 유지되며 삭제 기능이 작동한다.
- [ ] **AC-10:** 유효한 공식 샘플 또는 합법적 사용 권한이 있는 Cubism 모델이 로드·표시된다.
- [ ] **AC-11:** 손상·누락된 모델을 가져오면 오류 안내 후 플레이스홀더로 돌아온다.
- [ ] **AC-12:** 서로 다른 모션 그룹 이름을 가진 모델의 미지원 모션은 안전하게 폴백한다.
- [ ] **AC-13:** 모니터 연결 변경, DPI/해상도 변경 후 캐릭터가 접근 가능한 화면에 남는다.
- [ ] **AC-14:** Windows 설치 파일로 설치, 자동 시작 설정 변경, 완전 제거가 정상 작동한다.
- [ ] **AC-15:** TypeScript 검사, 테스트, 빌드가 통과하며 주요 실패/제약은 문서화된다.
- [ ] **AC-16:** Live2D 레이어 사양·파츠 명명·필수/선택 분류·원화 권리 점검표가 문서화된다.
- [ ] **AC-17:** 정상/오류 레이어 픽스처를 기준으로 PNG 정렬·알파·크기·중복 이름·누락 검사 및 합성 미리보기가 자동 검증된다.
- [ ] **AC-18:** Cubism 호환 요구조건(RGB·8bit/channel·sRGB·레이어 이름)을 검사하고 실제 Editor 임포트 결과를 별도 기록한다.
- [ ] **AC-19:** 제작 도구만 준비된 상태를 완성된 키리코 `.moc3` 제작으로 잘못 표기하지 않으며 미충족 입력을 보고한다.
- [ ] **AC-20:** 권한 있는 모델의 Cubism 내보내기→앱 가져오기→표정/모션/시선 동작 확인까지 성공한 경우에만 실제 모델 통합 완료로 판정한다.

## 12. 테스트 전략

**실행 시점:** 아래 모든 테스트는 기능별 커밋 과정이 아니라 **Phase 5(전체 기능 구현 후)**에 모아서 실행한다. Phase 1~4에서는 테스트 코드 작성이 가능하지만 실행을 완료 조건으로 요구하지 않는다.

- **Unit:** 스케줄러 타이밍, 방해 금지 경계(23:00~08:00), 일별 발화 상한, 이벤트 우선순위, 키워드 매칭, 설정 직렬화.
- **Integration:** 이벤트→대화/모션 연결, 모델 로더 검증/폴백, IPC 스키마 검증, DB 읽기/쓰기·마이그레이션.
- **E2E/수동:** Windows 투명 입력 통과, 다중 모니터, 트레이, 드래그, 패키징, 부팅 시 자동 실행.
- **실패 주입:** 모델 폴더 누락, 잘못된 JSON, 텍스처 누락, 파일 접근 거부, DB 잠금, 절전 후 복귀, renderer 비정상 종료.
- **에셋 파이프라인:** 파츠 크기/위치 불일치, 완전 투명 레이어, 중복 레이어 이름, PSD 색상 모드 불일치, 이상한 알파 잔여물, 실제 Cubism 임포트 실패를 검증한다. 픽스처 테스트와 사람의 외형 검수를 별개로 통과시킨다.

모델 미보유 상태에서는 **플레이스홀더 E2E 및 에셋 파이프라인의 인공 테스트 픽스처 검사 필수**, **공식 샘플을 준비한 경우 Live2D 통합 테스트는 별도 실시**한다. 샘플 모델을 임의로 저장소에 복사해 배포하지 않는다.

## 13. 권리/외부 자료

- [Live2D 공식 SDK Web 안내](https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/)
- [Cubism Editor — PSD 가져오기](https://docs.live2d.com/en/cubism-editor-manual/psd-import/)
- [Cubism Editor — PSD 제작 유의사항](https://docs.live2d.com/en/cubism-editor-manual/precautions-for-psd-data/)
- [Cubism Editor — 자동 메쉬 생성](https://docs.live2d.com/en/cubism-editor-manual/mesh-edit/)
- [Cubism Editor — 디포머 자동 생성](https://docs.live2d.com/en/cubism-editor-manual/auto-generation-of-deformer/)
- [Cubism Editor — 얼굴 동작 자동 생성](https://docs.live2d.com/en/cubism-editor-manual/face-auto-edit/)
- [Cubism Editor — 모델 템플릿](https://docs.live2d.com/en/cubism-editor-manual/template/)
- [Cubism Editor — 외부 연동 API](https://docs.live2d.com/en/cubism-editor-manual/external-application-integration-api/)
- [Cubism Editor — 임베디드 파일 출력](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- [Live2D 공식 Web Samples](https://github.com/Live2D/CubismWebSamples)
- [Live2D 공식 샘플 모델 모음](https://www.live2d.com/en/learn/sample/)
- [Live2D 샘플 데이터 이용 조건](https://www.live2d.com/en/learn/sample/model-terms/)
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window/)
- [Electron 보안 권고](https://www.electronjs.org/docs/latest/tutorial/security/)

`Haru`, `Hiyori` 같은 공식 예제는 SDK 검증에 활용할 수 있으나, 사용 범위·고지 조건과 배포 조건은 모델별로 확인한다. **키리코는 블리자드 IP**이므로 전용 Live2D 모델/일러스트/음성은 별도 제작·이용 허가·배포 검토가 필요하다. 게임 클라이언트에서 무단 추출한 에셋은 포함하지 않는다. Live2D Core 및 SDK 배포·이용도 공식 라이선스를 검토한다.

## 14. Claude Code에 전달할 구현 지시문

> 프로젝트 공식 명칭 및 GitHub 저장소명은 **Kirikomodo**야. 앱 제목, 트레이, `package.json`의 `name`/`productName`, Windows 실행 파일, README 등의 프로젝트 명칭을 0절에 맞춰 통일해. 현재 저장소에서 **이 명세서 v1.5 전체(0~17절)**를 기준으로 Windows 컴패니언을 구현해줘. **앱 런타임의 LLM·Ollama·AI 대화 API·STT/TTS는 구현하지 마.** Live2D 모델이 없으므로 자체 SVG 플레이스홀더로 앱을 우선 완성하고, Phase M(15절)의 모델 제작 파이프라인도 병행해. 실제 원화·모델·Cubism Editor가 없을 때는 제작 도구와 문서까지만 구현하고 완성했다고 주장하지 마. **기능 하나 구현이 끝날 때마다 테스트·타입 검사·lint·빌드를 실행하지 말고, 변경 범위와 민감정보만 점검해 해당 기능을 한국어 메시지로 즉시 로컬 커밋해.** 이후 다음 기능을 계속 구현해. **전체 기능을 모두 구현한 다음 Phase 5에서 테스트·타입 검사·lint·빌드를 일괄 실행하고, 발견된 오류를 수정·커밋한 후 전체 재검증**해. Git 원격 푸시나 브랜치 변경은 승인 없이 하지 마. UI는 화이트·미니멀 스타일로 설계하고 권리 미확인 에셋을 임의로 배포하지 마. `docs/implementation-progress.md`에는 구현 여부, `미검증` 상태, 후반 테스트 결과를 정확히 구분해 기록해.

---

## 15. **[v1.1 신규] 키리코 Live2D 모델 제작·반자동화 명세**

### 15.1 목적과 기술적 경계

**목표:** 아직 존재하지 않는 키리코 Live2D 에셋을 나중에 공급할 수 있도록, Claude Code가 **제작용 도구·문서·검증·앱 연계**를 우선 구현한다. 적법한 원화와 Cubism Editor가 준비되면 같은 파이프라인으로 상반신 Live2D 모델을 제작·검수·출력할 수 있게 한다.

다음 세 항목을 반드시 구분한다.

| 범위                       | 담당                                 | 자동화 원칙                                           | 완료 판정                                               |
| -------------------------- | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| 원화·레이어 제작           | 이미지 편집/생성 도구, 개발용 Python | 필요한 입력과 도구가 있으면 반자동화                  | 원화/파츠의 실재 및 육안 검수                           |
| 모델 리깅 및 바이너리 출력 | **Live2D Cubism Editor**             | 공식 자동화 기능 + 사람 검수, 필요 시 보조 GUI 자동화 | 실제 `.cmo3` 작업본 및 `.moc3`·`.model3.json` 출력 확인 |
| 런타임 표시                | Electron 앱 + Cubism SDK for Web     | 파일 가져오기·모션 제어 자동화                        | 앱에서 렌더·표정·이벤트 동작 확인                       |

- **AI 사용 경계:** 이미지 생성·세그먼트 분리·인페인팅 등은 개발 과정에서만 수행하는 **선택적 제작 도구**다. 완성된 컴패니언 앱에는 AI 생성 기능이나 외부 AI API를 넣지 않는다.
- Claude Code만으로 이미지 생성 엔진, 이미지 모델 가중치, Cubism 설치/라이선스가 자동 제공된다고 가정하지 않는다. 준비되지 않았으면 대체 가능한 입·출력 인터페이스만 만들고 해당 단계는 `BLOCKED_INPUT` 또는 `REQUIRES_EDITOR`로 남긴다.
- Cubism 공식 **외부 연동 API는 주로 모델/파라미터 정보와 값의 송수신**에 사용한다. 파츠 가져오기→리깅→프로젝트 저장→`.moc3` 내보내기 전체를 수행하는 공식 범용 모델 생성 API로 가정하지 않는다.
- 자동화를 위해 Editor의 내부 포맷을 임의로 조작하거나 가짜 `.cmo3`/`.moc3` 파일을 만들어서는 안 된다. 자동 내보내기 가능 여부를 검증하지 못하면 수동 단계로 명시한다.

### 15.2 제작 대상과 품질 범위 (MVP)

- **우선 목표:** 키리코의 정면 **상반신/허리 위** 2D Live2D 모델. 바탕화면에서 작은 크기로 표시할 때 알아보기 쉬운 실루엣, 얼굴과 손의 표현을 우선한다.
- **포함 동작:** 자연스러운 호흡, 눈 깜빡임, 눈동자 X/Y, 고개 X/Y/Z, 미소/찡그림, 입 열림·형태, 고개 갸웃, 인사/가벼운 손 움직임(리깅에 성공한 범위), 머리카락 미세 흔들림.
- **후순위:** 전신 걷기, 바닥 앉기, 복잡한 몸통 회전, 정교한 손가락 제스처, 의상 변경, 음성 기반 립싱크.
- **원화 가이드:** 정면, 중심 정렬, 가급적 좌우 대칭에 가까운 자연스러운 대기 자세. 초기 권장 캔버스는 2048×3072 px이며 실제 원화/편집기/성능에 맞춰 조정한다. 투명 배경, 부분별 여유 그림 포함, 레이어 간 기준점 불변.
- **표현 가이드:** 기존 키리코 이미지와 동일한 에셋을 무단 추출·복사하지 않는다. 개인 팬아트 모델의 이용 범위를 확인하고, 공개/배포 시 별도 권리 검토를 수행한다.

### 15.3 입력 계약 — 원화·파츠·저작권

**필수 입력**

1. `assets/live2d-authoring/input/character_source.png` 또는 동등한 원화(소유/사용 권한 증빙 메모).
2. `asset-license.json`: 저작자, 출처, 제작 방법, 이용 허용 범위, 제3자 에셋 여부, 앱 배포 포함 가능 여부.
3. `layer-plan.json`: 레이어 ID·기대 파츠·좌우 구분·그리기 순서·필수 여부·가려진 영역 복원 필요 여부.
4. 이미지 생성·분할 AI를 사용하려면 별도의 **개발용** 설정과 접근 자격. 없으면 CLI는 입력 부족을 명시하고 종료한다.

**권장 파츠 구성 (실제 그림에 맞게 조정)**

| 파츠군  | 필수 레이어 예시                                                                       | 비고                                                        |
| ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 얼굴    | `face_base`, `ear_l`, `ear_r`, `nose`                                                  | 머리 회전을 위한 감춰진 얼굴 윤곽 복원                      |
| 눈/눈썹 | `eye_l_white`, `eye_r_white`, `iris_l`, `iris_r`, `lid_l`, `lid_r`, `brow_l`, `brow_r` | 눈꺼풀·흰자·동공을 가능한 한 분리; 세부 레이어 추가 가능    |
| 입      | `mouth_base`, `mouth_inner`, `mouth_upper`, `mouth_lower`                              | 입 열림/미소 변화 구현을 위한 별도 형태 확보                |
| 머리    | `hair_back`, `hair_side_l`, `hair_side_r`, `hair_front`, `hair_accessory`              | 앞머리 아래 얼굴/옆머리 가려진 영역 보완                    |
| 몸통    | `neck`, `torso`, `shoulder_l`, `shoulder_r`, `arm_l`, `arm_r`                          | 상반신 기본; 팔의 상·하분할은 필요 시 확장                  |
| 장식    | `outfit_front`, `outfit_back`, `accessory_*`                                           | 머리끈·장신구·의상 장식은 독립 회전/흔들림이 필요할 때 분리 |

- 각 레이어는 **공통 캔버스 좌표계** 또는 정확한 오프셋 메타데이터를 반드시 보유한다. 파츠가 원화의 원래 위치에서 이동하지 않아야 한다.
- 파츠별 PNG는 RGBA, 가능한 비손실, 투명 배경. **빈 이미지/색상 테두리/잘린 스트로크/반투명 잔여물**을 자동 점검한다.
- 좌·우 표기 기준은 **캐릭터 기준**으로 고정하고 `layer-plan.json`에 선언한다.
- 이미지 복원은 사람이 보지 못하는 영역을 합리적으로 완성하는 작업이다. AI 추정이 원본 캐릭터의 공식 설정을 보증하지 않으므로 **비주얼 검수 필수**.
- AI가 원화를 처음부터 만들 수 있는지 여부는 실제 이용 가능한 이미지 도구에 달려 있다. 구현 과정에서 **근거 없는 생성 완료 보고 금지**.

### 15.4 자산 제작 CLI 요구사항

`tools/live2d-authoring/`에 앱 본체와 독립적으로 실행 가능한 Python CLI를 구현한다. 구체적인 옵션 이름은 README와 `--help`에 고정·설명한다.

| 명령 예시                                         | 기능                                                         | 결과                                            |
| ------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `python prepare_artwork.py --input <png>`         | 입력 형식·크기·색상·알파 검증, 메타데이터 생성               | `source-info.json`                              |
| `python validate_layers.py --manifest <json>`     | 파츠 명칭/누락/정렬/오프셋/알파/크기 검사                    | `layer-validation.json`                         |
| `python export_previews.py --manifest <json>`     | 레이어 합성 및 각 파츠 판별용 시트 제작                      | `composite.png`, `contact-sheet.png`            |
| `python assemble_psd.py --manifest <json>`        | 동일 좌표계를 유지하며 PSD 조립(지원되는 편집기/검증된 방식) | `character_layers.psd` 또는 지원 도구 필요 오류 |
| `python validate_export.py --model <model3.json>` | 출력 파일 참조·파라미터/모션 파일·상대 경로 검증             | `model-export-validation.json`                  |

- **아직 완성된 PNG 파츠가 없는 경우**: 실존하는 원화에서 파츠 분리까지 자동 처리된 것으로 가장하지 말 것. `layers/`에 샘플 기하학 도형 픽스처를 만들어 경로·정렬·PSD 내보내기 테스트만 수행한다.
- **세그먼테이션/인페인팅 AI 옵션**: 실제 설치와 권한이 확인된 모델·도구가 있을 때만 `tools/live2d-authoring/adapters/` 아래에 어댑터 추가. 원본 파일 불변, 작업 로그/사용 모델/설정 기록. API 키·토큰은 출력 폴더와 Git에 남기지 않는다.
- 이미지 분리 품질이 낮으면 즉시 재분리·수정 가능한 마스크 및 중간 PNG를 보존한다. 배경 제거만으로 얼굴/눈/머리카락 레이어 분리가 끝났다고 판정하지 않는다.
- **PSD 호환성:** Cubism 공식 권장 조건인 **RGB, 채널당 8비트, sRGB**, 고유 레이어명, 병합된 클리핑/마스크 등을 검사한다. Photoshop/CLIP STUDIO PAINT 이외의 PSD 생성 경로는 Cubism 실제 임포트 통과 전까지 **실험적**으로 표시한다.
- Photoshop/CLIP STUDIO/Krita 등 실제 설치된 편집기만 활용한다. 특정 편집기가 없으면 지원하지 않는 자동 API를 지어내지 말고 `REQUIRES_PSD_TOOL`로 보고한다.
- 합성 미리보기는 사용자가 공급한 원화와 시각 비교한다. 자동 검사만으로 머리카락 경계·눈 위치·붕 뜬 파츠 품질을 통과시켜서는 안 된다.

### 15.5 Cubism Editor 리깅 및 출력 플로우

**사용자가 Cubism Editor를 설치·실행한 경우에만 이 단계 진행.** 각 단계는 완료 여부를 체크리스트로 기록한다.

1. **PSD 임포트:** `character_layers.psd`를 Cubism Editor로 열고 각 레이어가 독립 ArtMesh로 배치되는지 확인한다.
2. **자동 메쉬 생성:** 공식 `Automatic Mesh generator`를 활용하고 눈·입·앞머리 등 복잡한 영역은 필요하면 메쉬를 수동 정리한다.
3. **디포머 자동 생성:** 공식 `Auto Generation of Deformer`로 인간형 정면 상반신 구조를 마련한다. 인간형·정면·중앙 배치에서 유리하지만 모든 파츠를 완벽하게 추정하는 기능은 아니다.
4. **얼굴 동작 자동 생성:** 공식 `Auto generation of facial motion`으로 얼굴 디포머/Angle X·Y 움직임을 반자동 생성한다. 필요한 얼굴 파츠와 디포머 조건을 먼저 갖추어야 한다.
5. **템플릿 재사용(선택):** **사용이 허용된** 모델 템플릿을 활용해 디포머·파라미터·키폼을 전이한다. 눈·입·머리카락 위치 차이가 큰 경우 수동 재매핑/검수가 필요하다.
6. **파라미터 정리:** 예시 파라미터 `ParamAngleX/Y/Z`, `ParamEyeLOpen/ROpen`, `ParamEyeBallX/Y`, `ParamMouthOpenY`, `ParamMouthForm`, `ParamBodyAngleX/Y/Z` 중 모델에 존재하는 항목을 실제 확인한다. 모든 ID가 자동으로 만들어진다고 가정하지 않는다.
7. **표정·모션:** MVP에서 지원 가능한 `idle`, `blink`, `look`, `happy`, `playful`, `sleepy`, `greet`, `headTilt` 등을 구현하고 모델의 실제 파일/그룹명으로 매핑한다. 파츠가 없는 모션은 미지원으로 보고한다.
8. **동작 검수:** 좌우/상하 고개 회전과 표정 극단값에서 안구/앞머리 겹침, 하얀 틈, 파츠 순서 오류, 뒤틀린 윤곽, 텍스처 잘림을 확인한다.
9. **정식 출력:** Cubism Editor에서 `.cmo3` **편집용 프로젝트**를 저장한 다음 **Export as MOC3** 기능으로 `.moc3`, `.model3.json`, 텍스처 등 임베디드 파일을 내보낸다. 모션/표정/물리 설정 파일은 생성했다면 함께 포함한다.
10. **런타임 연계:** 출력 폴더를 기존 모델 관리자의 가져오기 기능으로 등록하고 기본 동작·표정·클릭·시선 추적을 확인한다. 미지원 동작은 안전하게 플레이스홀더/idle로 처리한다.

**Cubism 자동화 원칙**

- 공식 Cubism Editor의 자동 메쉬/디포머/얼굴 동작 기능과 외부 연동 API를 먼저 사용한다.
- 클릭/단축키를 조작하는 GUI 자동화는 **실험적 보조 기능**이며 기본 경로에서 필수가 아니다. GUI 자동화가 실패해도 프로젝트 원본과 파일을 안전하게 보존한다.
- GUI 자동화 시 모니터 배율/해상도/Editor 버전을 명시하고 각 단계 캡처·결과 확인을 수행한다. **Cubism의 미지원 내부 파일 조작, 이용 약관 우회, 비공식 리깅 성공 주장 금지.**
- 사용자 개입이 필요한 부분은 명세된 **검수 체크포인트**로 남기고, Claude Code가 스스로 완성 판정을 하지 않는다.

### 15.6 출력물과 상태 리포트

최종 산출물은 `assets/live2d-authoring/output/<build-id>/`에 저장한다. 실제 모델은 생성된 경우에만 `models/exported/`에 둔다.

```text
assets/live2d-authoring/
├── input/
│   ├── character_source.png          # 준비된 경우에만
│   ├── asset-license.json
│   └── layer-plan.json
├── layers/
│   ├── face_base.png
│   ├── eye_l_white.png
│   └── ...                            # 확보된 파츠만
└── output/<build-id>/
    ├── source-info.json
    ├── layer-validation.json
    ├── composite.png
    ├── contact-sheet.png
    ├── character_layers.psd           # PSD 생성 성공 시
    ├── cubism-import-checklist.md
    ├── model-export-validation.json  # 실제 모델 출력 시
    └── asset-build-report.md
models/exported/<model-id>/              # Cubism에서 출력했을 때만
    ├── *.model3.json
    ├── *.moc3
    ├── textures/
    └── ...
```

`asset-build-report.md`에는 각 단계별 **`NOT_STARTED` / `READY` / `BLOCKED_INPUT` / `REQUIRES_PSD_TOOL` / `REQUIRES_EDITOR` / `NEEDS_MANUAL_QA` / `PASSED` / `FAILED`** 상태를 기록한다. `PASSED`는 객관적 증거(실제 파일·임포트 결과·미리보기 등)가 있을 때만 부여한다.

**필수 보고 필드:** 사용한 도구·버전, 사용자 제공 에셋과 권리 상태, 실행한 명령, 생성 파일 목록, 파츠 검사 결과, Cubism 설치/실행 여부, 수동 검수 필요사항, 실제 모델 출력 여부, 앱 임포트 성공 여부, 남은 작업과 재현 방법.

### 15.7 모델 미보유 환경에서의 수용 기준

- [ ] **M-01 / 자동 테스트:** 레이어/파일/좌표 명세 JSON 스키마 검증 및 샘플 픽스처 테스트 통과.
- [ ] **M-02 / 자동 테스트:** 원본 파츠가 없어도 도구의 `--help`, 검증 실패 메시지, 산출물 경로가 정상 작동.
- [ ] **M-03 / 자동 테스트:** 기하학 테스트 레이어의 PNG 합성·정렬·누락/중복/색상 검사 통과.
- [ ] **M-04 / 실도구 조건부:** PSD가 생성된 경우 Cubism Editor로 열어 **실제 임포트 성공**이 확인됨. PSD 파일 존재만으로는 통과 아님.
- [ ] **M-05 / 실에셋 조건부:** 적법한 원화가 준비되면 파츠 수동/자동 분리 후 눈·입·머리카락 경계까지 육안 확인.
- [ ] **M-06 / Editor 조건부:** 실제 `.cmo3` 프로젝트 및 `.model3.json`·`.moc3` 출력 후 모델 로더 통과.
- [ ] **M-07 / 앱 조건부:** 눈/입/시선/표정/기본 모션을 앱에서 실동작 확인.
- [ ] **M-08 / 필수:** 미충족 조건은 해당 이유와 필요 입력을 보고하며, **실제 모델 완성으로 오인될 성공 문구를 출력하지 않음**.

`M-01~03` 및 `M-08`은 **모델 미보유 상태에서도 필수로 구현/검증**할 수 있어야 한다. `M-04~07`은 실입력과 Editor가 필요한 조건부 항목으로 별도 보고한다. 기존 AC-01~15와 이 기준은 서로 독립적이다.

### 15.8 Claude Code 작업 지시 및 커밋 단위

에셋 자동화 구현은 앱과 독립된 **기능별 자동 로컬 커밋**으로 진행한다. 각 기능별 테스트 실행은 하지 않고, **Phase 5에서 전체 검사**한다.

1. `docs/live2d-authoring.md`, `docs/asset-rights.md` 및 레이어 계약 작성 → 해당 기능 파일만 커밋.
2. 제작용 Python CLI, 레이어 검사, 테스트용 레이어 픽스처 작성 → 구현 후 커밋(실제 테스트 실행은 Phase 5).
3. 합성 미리보기/연구용 분리 어댑터/PSD 생성 구현 → 기능 커밋(품질·실패 케이스 검사는 Phase 5).
4. Cubism Editor 워크플로 및 반자동 체크리스트 정리 → 구현/수동 필요 상태 기록 후 커밋.
5. 실제 모델이 준비된다면 연계 코드를 구현 후 커밋하고, 출력·런타임 E2E 검증은 Phase 5 또는 수동 검수 단계에서 수행.

**최종 보고에서 별도 표기할 상태:** `앱 플레이스홀더 구현`, `Live2D 런타임 구현`, `Live2D 에셋 제작 도구 준비`, `키리코 원화 확보`, `PSD Cubism 임포트 검증`, `키리코 Cubism 리깅 완료`, `키리코 모델 런타임 통합 완료`. 뒤의 다섯 단계는 앞의 성공 여부를 근거로 자동 완료 처리하면 안 된다.

### 15.9 최종 제한 및 의사결정

- 모델 실물 없이도 **앱의 데스크톱 경험을 완성**하는 게 1차 목표다. 모델 제작은 병렬 개발한다.
- 고퀄리티 2D 캐릭터의 본질은 **리깅 가능한 파츠 원화와 사람의 품질 검수**다. 이미지 한 장을 자동 분리해 PSD를 만드는 것만으로 곧바로 충분한 Live2D 모델이 되지는 않는다.
- 최종 키리코 모델을 개인적으로만 사용하더라도 입력 자산의 출처/사용 조건을 확인한다. 공개 배포/수익화는 별도 IP/SDK/샘플 라이선스 검토를 반드시 거친다.
- **완전 무인 제작을 약속하지 않는다.** 정상 도구와 입력을 준비한 상태에서 최대한 자동화하고, 막힌 단계는 정확한 원인과 재개 절차를 남긴다.

## 16. 제공된 키리코 기준 이미지 기반 Live2D 파츠 명세서 v1

본 절은 사용자가 제공한 키리코 전신 기준 이미지를 바탕으로 작성한 **실제 파츠 분리/원화 제작/리깅용 사양**이다. 본 이미지는 캐릭터 외형, 의상, 색감, 장식 구조를 정의하는 **주요 비주얼 레퍼런스**로 사용한다. 단, 본 이미지는 3D 렌더 기반의 비정면 포즈이므로 **그 자체를 최종 리깅 PSD로 사용하지 않고**, 이를 기반으로 **2D Live2D용 원화**를 다시 제작하는 것을 기본 원칙으로 한다.

### 16.1 기준 이미지 평가

- 장점: 전신 구조가 드러나며 얼굴, 헤어, 여우 가면, 상의, 허리 장식, 하의, 신발까지 캐릭터 아이덴티티가 분명하다.
- 장점: 배경이 단순하고 캐릭터 분리가 쉬워 기준 분석용 입력으로 적합하다.
- 한계: 정면이 아닌 약간의 비틀림 포즈로, 좌우 회전용 파츠 분리에 불리하다.
- 한계: 손, 팔, 머리카락 뒤, 몸통 일부, 의상 내부 등 **가려진 영역이 많아 복원 작업이 필요**하다.
- 한계: 2D 일러스트가 아니라 3D 렌더 기반이므로 **리깅 친화적 레이어 원화 재구성**이 필수다.

### 16.2 제작 전략 결정

- 1차 목표는 **상반신 Live2D 모델**이다.
- 2차 목표는 상반신 성공 후 같은 비주얼 규칙으로 **전신 확장**이다.
- Companion 앱 1차 통합은 상반신 기준으로도 충분하다.
- 전신은 장식물, 코트/하카마형 전면 장식, 다리, 신발 등 변형 포인트가 많아 일정과 난도가 높다.
- 따라서 Claude Code는 우선 다음을 만족하는 상반신 모델을 목표로 한다.
    - 눈 깜빡임
    - 입 열림/닫힘 및 간단한 입모양
    - 얼굴 각도 X/Y
    - 시선 추적
    - 감정 표정 5종 이상
    - 머리/앞머리/장식 흔들림
    - 어깨/상체의 미세한 호흡 움직임

### 16.3 상반신 우선 범위 정의

상반신 우선 범위는 다음과 같다.

- 캔버스 기준: 머리 끝(가장 위의 묶인 헤어 포인트 포함)부터 허리 장식과 구슬 띠가 모두 들어오는 영역까지.
- 좌우 범위: 양쪽 어깨와 손 제스처 일부가 포함되되, 앱 1차 버전에서는 **왼손의 부적 손 제스처는 선택 구현**으로 둔다.
- 하한선: 붉은 전면 의상(허리 아래 장식) 시작부까지 포함 가능하되, 1차 리깅 필수 범위는 허리띠/구슬띠 상단까지.

### 16.4 필수 상반신 파츠 목록

#### A. 머리/얼굴 기본 파츠

1. `Head_Base`
    - 얼굴 피부, 기본 윤곽.
    - 눈/눈썹/입/머리카락과 분리.
2. `Face_Shadow`
    - 얼굴 그림자 보정용 별도 레이어.
3. `Ear_Left`, `Ear_Right` (실제 귀 노출 시 분리, 보이지 않으면 생략)
4. `Neck`
5. `Torso_Upper_Base`
    - 상의 흰색 기본 몸통.
6. `Shoulder_Left`, `Shoulder_Right`

#### B. 머리카락 파츠

1. `Hair_Front_Center`
2. `Hair_Front_Left_1`
3. `Hair_Front_Left_2`
4. `Hair_Front_Right_1`
5. `Hair_Front_Right_2`
6. `Hair_Side_Left`
7. `Hair_Side_Right`
8. `Hair_Back_Left`
9. `Hair_Back_Right`
10. `Hair_Back_Center`
11. `Hair_Top_Tuft`
    - 위로 솟은 상단 머리 파츠.
12. `Hair_Bangs_Shadow`

설명:

- 본 기준 이미지에서 뒷머리가 충분히 보이지 않으므로 `Hair_Back_*`는 **복원 제작 대상**이다.
- 머리카락 흔들림은 앞머리/옆머리/상단 머리 포인트를 개별 물리 파츠로 잡는다.

#### C. 가면/머리 장식 파츠

1. `Mask_Fox_Base`
2. `Mask_Fox_Horn_Left`
3. `Mask_Fox_Horn_Right`
4. `Headband_Base`
5. `Headband_Back`
6. `Mask_Detail_Decal`

설명:

- 붉은 여우 가면은 키리코 정체성 핵심 파츠이므로 얼굴과 독립시킨다.
- 머리 회전 시 가면과 머리카락 간 깊이 관계를 유지해야 한다.

#### D. 눈 파츠

각 눈마다 다음 레이어를 분리한다.

- `Eye_L_White`, `Eye_R_White`
- `Eye_L_Iris`, `Eye_R_Iris`
- `Eye_L_Pupil`, `Eye_R_Pupil`
- `Eye_L_Highlight`, `Eye_R_Highlight`
- `Eye_L_UpperLid`, `Eye_R_UpperLid`
- `Eye_L_LowerLid`, `Eye_R_LowerLid`
- `Eye_L_Lashes`, `Eye_R_Lashes`
- `Eye_L_BlinkGuide`, `Eye_R_BlinkGuide` (작업용 가이드, 최종 출력 제외 가능)

#### E. 눈썹 파츠

- `Brow_L`
- `Brow_R`

표정 변형용으로 각도를 크게 줄 수 있게 분리한다.

#### F. 입/코/볼 파츠

1. `Nose_Base` (얼굴에 포함 가능하나 코 쉐이딩 분리 권장)
2. `Mouth_Line`
3. `Mouth_Open`
4. `Mouth_Inner`
5. `Teeth_Upper`
6. `Tongue`
7. `Cheek_Left_Blush`
8. `Cheek_Right_Blush`

설명:

- 1차 버전은 입 모양 A/I/U/E/O까지 가지 않아도 되며, `closed / slight open / smile / open talk` 정도의 최소 4상태를 권장한다.

#### G. 상의/몸통 의상 파츠

1. `Cloth_Upper_White_Base`
2. `Cloth_Collar_Inner_Red`
3. `Cloth_Chest_Logo`
4. `Strap_Left`
5. `Strap_Right`
6. `Shoulder_Pad_Left` (보이는 경우)
7. `Shoulder_Pad_Right`
8. `Waist_Armor_Front`
9. `Waist_Beads_Main`
10. `Waist_Beads_Alt_Shadow`
11. `Waist_Knot_Left`
12. `Waist_Knot_Right`
13. `Waist_Hanging_Orbs`

설명:

- 허리 구슬 띠와 매듭은 미세 흔들림에 매우 유리한 포인트다.
- 상반신 모델에서도 허리 장식 일부를 포함하면 캐릭터성이 크게 살아난다.

#### H. 팔/손 파츠(상반신 선택 구현)

오른팔/왼팔의 완전한 리깅은 후순위다. 1차에서는 다음 정도를 권장한다.

1. `Arm_Upper_Left`
2. `Arm_Lower_Left`
3. `Hand_Left_Gesture` (부적을 든 포즈 전체를 하나로 처리 가능)
4. `Ofuda_Paper`
5. `Arm_Upper_Right`
6. `Arm_Lower_Right`
7. `Hand_Right_Rest`
8. `Glove_Left`
9. `Glove_Right`

설명:

- 본 기준 이미지의 왼손은 세운 검지와 부적이 핵심 포즈이므로, 1차는 통합 파츠로 두는 것이 효율적이다.
- 완전한 손가락 리깅은 불필요하다.

### 16.5 전신 확장 시 추가 파츠 목록

다음 항목은 전신 확장 단계에서 별도 구현한다.

- `Coat_Front_Left_Outer`
- `Coat_Front_Left_Inner`
- `Coat_Front_Right_Outer`
- `Coat_Front_Right_Inner`
- `Skirt_Center`
- `Leg_Left_Upper`
- `Leg_Left_Lower`
- `Leg_Right_Upper`
- `Leg_Right_Lower`
- `Boot_Left_Base`
- `Boot_Right_Base`
- `Boot_Left_Sole`
- `Boot_Right_Sole`
- `Weapon_Kunai_Set`
- `Waist_Accessory_Knives`
- `Back_Fabric_Tails`

전신 확장에서는 코트 전면의 큰 붉은 파츠와 다리 가림 관계가 어려운 포인트다. 따라서 **상반신 완성 이전에는 전신 파츠 제작을 필수 목표로 잡지 않는다.**

### 16.6 복원이 필요한 핵심 영역

본 기준 이미지를 기반으로 반드시 복원 또는 재해석이 필요한 부분:

1. 머리 뒤쪽 전체 형상
2. 왼쪽 어깨 뒤/머리카락 뒤 몸통 영역
3. 의상 안쪽 구조(가려진 흰색 상의 내부 연결부)
4. 붉은 가면 아래 이마/앞머리 접점
5. 왼손이 가리는 얼굴/머리카락 일부가 있을 경우 해당 연결부
6. 허리 장식 뒤 몸통/의상 경계
7. 상체 회전에 필요한 반대편 옷 주름 정보

복원 원칙:

- 원본 캐릭터의 인상 유지 우선
- 복원 부위는 "자연스러운 연결"이 목적이며, 원작 완벽 재현을 주장하지 않음
- 복원 후에는 평면 정면 일러스트 기준으로 재정렬한다.

### 16.7 표정 사양

최소 구현 표정 세트:

1. `neutral` — 평상시 미소에 가까운 기본 표정
2. `smile` — 조금 더 장난스럽고 밝은 미소
3. `happy` — 눈웃음 포함, 기쁨
4. `thinking` — 살짝 시선 회피/한쪽 눈 약간 좁힘 가능
5. `surprised` — 눈 크게, 입 소폭 개방
6. `sleepy` — 반쯤 감긴 눈
7. `concerned` — 걱정/위로용 표정

추가 권장:

- `teasing`
- `embarrassed`
- `wink`

### 16.8 물리 및 모션 사양

상반신 1차 버전에서 필요한 물리 요소:

- 앞머리 좌우 흔들림
- 옆머리 흔들림
- 머리 위 포인트 헤어의 탄성 흔들림
- 허리 구슬띠와 매듭의 미세 흔들림
- 어깨/상체의 호흡 움직임
- 얼굴 각도에 따른 가면/머리카락 깊이 변화

1차 모션 세트 권장:

1. `Idle_Breath`
2. `Idle_LookAround`
3. `Greet_Short`
4. `Nod_Small`
5. `HeadTilt_Left`
6. `HeadTilt_Right`
7. `Blink_Normal`
8. `Blink_Slow`
9. `Smile_Subtle`
10. `React_Click`

### 16.9 PSD 레이어 그룹 규칙

Cubism 친화적인 PSD를 위해 다음 구조를 권장한다.

```text
Kiriko_UpperBody/
├── 00_Guide/
├── 01_Head/
│   ├── Face
│   ├── Eyes
│   ├── Brows
│   ├── Mouth
│   ├── HairFront
│   ├── HairBack
│   └── Mask
├── 02_Body/
│   ├── Neck
│   ├── Torso
│   ├── Clothes
│   └── Straps
├── 03_Arms/
│   ├── Left
│   └── Right
├── 04_Accessories/
│   ├── Waist
│   └── Ofuda
└── 90_Shadow_Adjust/
```

레이어 규칙:

- 영문 이름만 사용
- 공백 대신 `_`
- 좌우는 `_L`, `_R` 접미사 사용
- 작업용 가이드는 `Guide` 접두사 사용
- 최종 출력 제외 레이어는 `_REF`, `_GUIDE`, `_TMP` 접미사 사용

### 16.10 Claude Code 자동화 범위

Claude Code가 수행할 작업:

1. 기준 이미지 분석 후 파츠 설계 문서 생성
2. 상반신 크롭 기준 정의 및 미리보기 생성
3. 파츠 리스트/레이어 계약 JSON 생성
4. 파츠 파일 검사기 구현
5. PSD 그룹 구조 검사기 구현
6. Cubism 임포트 전용 체크리스트 문서 생성
7. 모델 출력 후 런타임 배치 테스트 구현
8. 미구현/수동 필요 항목 보고서 생성

Claude Code가 단독으로 완료했다고 주장하면 안 되는 작업:

1. 원본 한 장만으로 고품질 리깅용 원화 완성 보장
2. Cubism Editor 내부의 모든 리깅 품질 확보
3. 모든 복원 부위의 시각적 적합성 최종 판단
4. IP/라이선스 적합성 최종 승인

### 16.11 Claude Code용 작업 지시문 (추가분)

아래 지시문은 기존 구현 지시문 뒤에 추가한다.

```text
Kirikomodo 프로젝트의 제공된 키리코 기준 이미지를 분석하여 상반신 Live2D 제작 사양을 우선 구현해줘.

핵심 규칙:
- 이 이미지는 최종 리깅 PSD가 아니라 비주얼 기준 레퍼런스로 취급할 것.
- 1차 목표는 상반신 Live2D 모델이며, 전신은 후속 확장 범위로 둘 것.
- 공식 앱 이름과 저장소는 Kirikomodo, 소스 패키지는 kirikomodo로 표기하고 캐릭터/파츠 명칭 Kiriko는 유지할 것.
- docs/implementation-spec.md의 16절 파츠 명세를 기준으로 레이어 계약을 작성할 것.
- 머리/얼굴/눈/눈썹/입/머리카락/가면/상의/허리 장식의 상반신 파츠를 우선 정의할 것.
- 가려진 뒷머리, 옷 내부, 몸통 연결부 등 복원 필요 영역은 별도 목록으로 관리할 것.
- 원화가 아직 없으므로 먼저 다음 산출물을 만들 것:
  1) docs/live2d-kiriko-parts.md
  2) docs/live2d-layer-contract.json
  3) tools/live2d_asset_validator/
  4) docs/cubism-import-checklist.md
  5) docs/model-production-status.md
- 앱은 실제 Live2D 모델 없이도 플레이스홀더 렌더러로 동작해야 하며, 나중에 실제 모델로 교체 가능해야 한다.
- 실제 이미지 분리나 복원 작업은 가능 범위까지만 자동화하고, 수동 검수 또는 외부 제작이 필요한 부분은 완료로 처리하지 말 것.
- 기능 하나가 완료될 때마다 **테스트 없이 즉시 자동 로컬 커밋**하고, 각 커밋 메시지는 한국어로 작성할 것. 모든 검사는 전체 구현 후 Phase 5에서 일괄 실행할 것.
```

### 16.12 산출물 요구사항

본 절이 추가되면 최소 다음 산출물이 필요하다.

- `docs/live2d-kiriko-parts.md`
- `docs/live2d-layer-contract.json`
- `docs/reference-image-analysis.md`
- `docs/cubism-import-checklist.md`
- `docs/model-production-status.md`
- `tools/live2d_asset_validator/`
- `tests/fixtures/live2d/` (샘플 레이어 구조 픽스처)

### 16.13 추가 완료 기준

`K-01` 제공된 키리코 기준 이미지에 대한 분석 문서가 존재한다.

`K-02` 상반신 우선 파츠 명세와 전신 확장 파츠 명세가 분리되어 기록되어 있다.

`K-03` 레이어 명명 규칙과 PSD 그룹 규칙이 JSON 또는 문서로 명확히 정의되어 있다.

`K-04` 복원이 필요한 영역 목록이 따로 정리되어 있다.

`K-05` Cubism 임포트 전 검사용 도구가 동작한다.

`K-06` Live2D 모델이 없더라도 앱의 플레이스홀더 모드가 정상 동작한다.

`K-07` 실제 원화/PSD/Cubism 단계가 미완료라면 그 상태가 보고서에 정확히 표시된다.

`K-08` 상반신 우선 전략이 일정/구현 범위에 반영되어 있다.

### 16.14 최종 판단

제공된 이미지는 **캐릭터 기준 레퍼런스**로는 충분히 유효하다. 다만 **그림 한 장을 그대로 분리해 곧바로 고품질 Live2D 모델로 쓰는 접근은 비현실적**이므로, 다음 원칙을 유지한다.

- 본 이미지는 외형 기준 입력이다.
- 최종 리깅 자산은 별도 2D 파츠 원화로 제작한다.
- 1차는 상반신 모델로 빠르게 성공 경험을 만든다.
- 앱 개발과 모델 제작 도구 개발은 병렬로 진행한다.

---

## 17. **[v1.5 개정] 기능별 자동 로컬 커밋 + 최종 일괄 테스트 규칙 (필수)**

### 17.1 핵심 원칙

Claude Code는 **기능 하나를 구현할 때마다 해당 기능의 변경만 자동 로컬 Git 커밋**한다. 사용자에게 커밋 승인을 반복 요청하지 않는다.

그러나 **각 기능마다 테스트·타입 검사·lint·빌드를 반복 실행하지 않는다.** 앱 기능·도구·설정·UI 등 구현 가능한 전체 범위를 먼저 작성하고, 그 후 **Phase 5에서 테스트·수정·재검증을 일괄 수행**한다.

- 기능 커밋의 상태는 `IMPLEMENTED_UNTESTED`(**구현됨, 테스트 전**)으로 기록한다.
- 커밋이 됐다는 이유만으로 `TEST_PASSED`나 수용 기준 통과로 표시하지 않는다.
- 기능별 커밋과 전체 테스트를 위한 최종 검증·수정 커밋은 모두 현 작업 브랜치에 남긴다.
- 브랜치 생성·전환·병합·리베이스·원격 푸시는 별도 요청이 없는 한 수행하지 않는다.

### 17.2 기능 커밋 단위

한 커밋은 독립된 기능 하나를 담는 것을 원칙으로 한다.

**커밋 예시**

- `feat: 투명 캐릭터 창 구현`
- `feat: 시스템 트레이 메뉴 추가`
- `feat: 캐릭터 드래그와 위치 복원 구현`
- `feat: 플레이스홀더 눈 깜빡임 추가`
- `feat: 방해 금지 시간대의 선제 대화 차단`
- `feat: Live2D 파츠 검사 도구 추가`
- `fix: 다중 모니터 위치 복원 오류 수정` (최종 검사 후 수정 커밋)

`전체 구현`, `작업 중` 등의 불명확한 묶음 커밋을 피한다. 큰 기능은 합리적으로 나누되, 작업 중간의 깨진 상태를 의도적으로 기능 완성이라고 명명하지 않는다. **빌드·실동작 검증은 최종 단계로 미루므로 기능 커밋도 아직 검증 전일 수 있다.**

### 17.3 구현 중 반복할 Git 절차 (테스트 없음)

1. 작업 전에 현재 브랜치, HEAD, `git status --short`를 확인하고 사용자 변경사항을 파악한다.
2. TODO에서 독립 기능 하나를 선정해 코드를 구현한다. 필요한 테스트 코드도 작성할 수 있지만 **실행하지 않는다**.
3. `git diff`, `git status --short`로 의도하지 않은 변경, 비밀정보, 불필요한 대용량 파일, 권리 미확인 에셋을 확인한다. 이는 **변경 범위 확인**이지 테스트가 아니다.
4. `git add -- <해당 기능 파일 경로>`처럼 관련 파일만 선택적으로 스테이징한다.
5. `git diff --cached --stat`, `git diff --cached`, `git status --short`로 기존 사용자 staged 파일이 섞이지 않았는지 검사한다.
6. **테스트/타입 검사/lint/빌드를 실행하지 않고** `git commit -m "<type>: <한국어 기능 설명>"`으로 커밋한다. 단, 저장소가 이미 강제하는 커밋 훅은 무단 우회하지 않는다.
7. 진행 문서에 기능명, 커밋 메시지, `IMPLEMENTED_UNTESTED` 상태, 관련 파일을 기록한다. 실제 해시는 커밋 후 확인해 후속 보고 또는 최종 보고에 반영한다.
8. 다음 기능으로 넘어간다. 아직 발견되지 않은 오류 때문에 임의로 테스트 단계를 앞당기지 않는다.

### 17.4 안전 규칙

- **금지:** `git add .`, `git add -A`, `git commit -am` 등 사용자 변경사항을 무분별하게 포함하는 명령.
- **금지:** `git reset --hard`, `git clean -fd`, 강제 체크아웃/리베이스, 사용자의 코드 덮어쓰기, 무단 stash, `git push --force`.
- **금지:** 승인 없는 GitHub Push, Release 게시, 원격 브랜치 생성, 자동 배포.
- **금지:** API 키, 비밀정보, 개인정보 DB, 사용자 대화 데이터, 배포권이 확인되지 않은 키리코 원화/PSD/Cubism 파일 커밋.
- `node_modules`, 임시 파일, 캐시, 빌드/설치 산출물은 기본 Git 추적 제외.
- 기존 staged 또는 미커밋 사용자 변경이 동일 파일에 섞여 안전하게 분리할 수 없다면 해당 커밋을 보류하고 다른 독립 작업을 진행한다.
- Git 작성자 설정을 임의로 지어내지 않는다. 훅 실패는 보고하고 우회하지 않는다. 훅이 자동으로 테스트를 실행한다면, **훅이 요구하는 검사는 예외**이며 훅 구성 자체를 허락 없이 변경하거나 `--no-verify`로 건너뛰지 않는다.

### 17.5 전체 구현이 끝난 뒤 실행하는 최종 QA 사이클

1. 구현 가능한 모든 기능과 도구를 작성했는지 명세서 TODO를 확인한다. 에셋/Editor 미확보로 수행할 수 없는 항목은 별도로 관리한다.
2. **이때 처음으로** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` 및 필요한 에셋 검사·E2E를 일괄 실행한다. 도구별 실제 명령은 프로젝트 설정에 맞춘다.
3. 실패 결과를 하나의 QA 목록에 정리한다. 오류 내용, 재현 방법, 영향 범위를 기록한다.
4. 오류를 개별적으로 수정하고 **수정 단위마다 자동 로컬 커밋**한다. 이 단계에서는 관련 테스트를 실행하면서 수정해도 된다.
5. 모든 수정 이후 전체 테스트/타입 검사/lint/빌드/E2E를 재실행해 회귀 여부를 확인한다.
6. 최종 Windows 설치 패키지를 생성하여 가능한 범위의 설치·실행·제거를 확인하고 결과를 기록한다.
7. `docs/implementation-progress.md`에 기능별 `TEST_PASSED`/`TEST_FAILED`/`NOT_TESTED`/`BLOCKED_INPUT`/`REQUIRES_EDITOR` 상태 및 커밋·실행 로그를 기록한다. 검증하지 않은 부분은 완료 판정하지 않는다.

### 17.6 진행 문서 규칙

- 기능 구현 시점에는 커밋 내용과 **미검증 상태**만 기록한다.
- 테스트 실행 명령, 통과·실패 여부는 Phase 5에서 **실제 실행된 뒤에만** 적는다.
- 커밋 해시는 `git log`로 얻고, 커밋 이전에 추측하지 않는다. 해시만 적기 위한 문서 전용 커밋을 남발하지 않는다.
- 커밋 실패는 `BLOCKED_COMMIT`으로 기록하고 임의의 다른 기능 커밋에 끼워 넣지 않는다.
- 사용자가 요청한 기능별 자동 커밋을 유지하면서도, 반복 테스트 수행으로 시간을 낭비하지 않는 것이 핵심이다.

### 17.7 Claude Code 최초 실행 프롬프트에 추가할 필수 규칙

다음 지침은 기존 14절 및 과거 스타터 프롬프트의 **기능별 테스트 선행 요구보다 우선한다.**

```text
[기능별 자동 커밋 + 전체 구현 후 테스트 — 필수]

- 기능 하나 구현 시마다 이번 기능 파일만 선택적으로 스테이징하고 한국어 Conventional Commit으로 자동 로컬 커밋할 것.
- 기능 커밋 전에 npm test, typecheck, lint, build 등을 일일이 실행하지 말 것.
- 각 커밋은 IMPLEMENTED_UNTESTED(구현 완료, 미검증)으로 기록하고 다음 기능으로 진행할 것.
- 모든 기능 구현 후 Phase 5에서 전체 테스트·타입 검사·lint·빌드를 한꺼번에 실행할 것.
- 최종 검사에서 발견한 오류를 수정하고, 수정마다 독립 로컬 커밋을 남길 것.
- 수정 완료 후 전체 검사를 다시 진행하고 통과/실패/미검증을 정확히 보고할 것.
- Git 기존 사용자 변경사항, 스테이징 내용, 브랜치, 민감정보는 보호할 것.
- 승인 없는 브랜치 전환/푸시는 하지 말 것. 기존 커밋 훅은 무단 우회하지 말 것.
- 기능별 커밋은 별도 승인을 기다리지 않고 계속 진행할 것.
```

### 17.8 추가 수용 기준

- `G-01` 구현한 각 독립 기능별 로컬 Git 커밋이 존재한다.
- `G-02` 커밋 메시지가 `feat:`, `fix:`, `refactor:`, `test:`, `docs:` 등 접두사와 한국어 기능 설명을 사용한다.
- `G-03` 기능 구현 기간에는 테스트·타입 검사·lint·빌드가 반복 실행되지 않는다(강제 커밋 훅 예외). 최종 검증에서만 수행한다.
- `G-04` 최종 QA 실패 항목이 수정되고 관련 수정 사항이 개별 커밋에 남는다.
- `G-05` 수정 후 전체 테스트·타입 검사·lint·빌드·가능한 E2E를 재실행하여 결과를 남긴다.
- `G-06` 기존 사용자 변경사항 보호, 무단 푸시·브랜치 전환 금지 원칙이 유지된다.
- `G-07` 최종 보고에 기능별 커밋 목록과 테스트 성공/실패/미실행 상태가 포함된다.

**최종 원칙: `기능 구현 → 자동 로컬 커밋 → 다음 기능` 반복, 전체 구현 후 `일괄 테스트 → 오류 수정·커밋 → 전체 재검증`**.
