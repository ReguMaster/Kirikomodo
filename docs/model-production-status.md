# Live2D 모델 제작 현황 (K-07)

2026-10-10 기준. 모델은 **완성되지 않았다.** 앱은 플레이스홀더 캐릭터로 동작한다.

| 항목 | 상태 | 비고 |
|---|---|---|
| 앱 플레이스홀더 캐릭터 | ✅ 구현 | 작업 3·4·5 (`src/character/`) |
| Live2D 런타임 로더 | ✅ 구현(실모델 미검증) | Core·모델 없으면 플레이스홀더 자동 폴백. `docs/implementation-progress.md` 10절 |
| 에셋 제작 도구 | ✅ 준비 | `tools/live2d-authoring/` 9종, 자체검증 `npm run test:authoring` |
| 레이어 계약·파츠 목록 | ✅ 76 레이어 / 17 그룹 | `docs/live2d-layer-contract.json`, `docs/live2d-kiriko-parts.md` |
| 키리코 원화(배포 가능) | ❌ 없음 | `kiriko.png` 는 비배포 레퍼런스(`docs/asset-rights.md`) |
| 파츠 초안 분리 | 🟡 NEEDS_MANUAL_QA | 44/45 초안 생성, 필수 누락 18, 경계 수작업 필요 |
| 완성 파츠 PNG (`assets/live2d-authoring/layers/`) | ❌ 0 / 51 필수 | 사람 작업 |
| PSD 조립 | 🟡 EXPERIMENTAL | pure-Python 작성, Pillow 재판독 통과. Cubism 임포트 미검증 |
| Cubism Editor 임포트·리깅 | ❌ REQUIRES_EDITOR | Cubism Editor 미설치 |
| moc3 내보내기·검증 | ❌ REQUIRES_EDITOR | `validate_export.py` 는 픽스처로만 검증됨 |
| 런타임 통합 | ⏳ 로더 준비됨 | moc3 완성 후 설정 > 모델 > 가져오기로 로드 확인 |

## 남은 사람 작업

1. 자체 원화 또는 권리 확보
2. 파츠 PNG 51장 완성 + 복원 17장
3. Cubism Editor 리깅·내보내기(`docs/cubism-import-checklist.md`)
4. 앱 로더 연동 확인

## 자동 검증 범위

`python tools/live2d-authoring/selftest.py`: 계약 검사, CLI `--help`, 파츠 검증(정상/불량/입력 없음), 미리보기·PSD 조립, model3.json 검증(정상/손상), 파이프라인 통합. 원화 없이 픽스처만 사용.
