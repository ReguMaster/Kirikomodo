# Live2D 모델 제작 현황 (K-07)

2026-10-10 기준. 키리코 모델은 **Cubism Editor 없이 직접 생성한 `.moc3` 로 완성**되어 앱 가져오기·실렌더링·표정·모션·물리까지 검증됐다. 모델 파일은 Git 무시 위치 `assets/models/private/kiriko/` 에 있다(원화 권리: `docs/asset-rights.md`).

| 항목 | 상태 | 비고 |
|---|---|---|
| 앱 플레이스홀더 캐릭터 | ✅ 구현 | 모델이 없을 때 폴백 |
| Live2D 런타임 로더 | ✅ 구현·검증 | motion3/exp3/physics3 지원, `docs/implementation-progress.md` 10절 |
| moc3 포맷 해독·writer | ✅ 완료 | `docs/moc3-format.md`, `tools/moc3/moc3.py`(Haru 라운드트립 바이트 동일), `gen.py`(처음부터 생성) |
| 제작 기준 원본 정리·표정 14종 | ✅ 완료 | `tools/live2d-authoring/gen_expressions.py`, 3차 독립 검토 합격 |
| 레이어 계약·파츠 분리·복원·아틀라스 | ✅ 59 레이어 / 15 그룹 | `cut_parts.py`(SAM + 인페인팅), `make_atlas.py`(4096² 2장, 재조립 diff 0) |
| 키리코 moc3 조립 | ✅ Core VALID | `tools/moc3/kiriko.py`: 파츠 14·파라미터 28·워프 2·아트메시 58 |
| 표정 7종·모션 10종·model-map | ✅ 완료 | `tools/moc3/kiriko_anim.py` |
| 소매 스윙 `ParamArmR/L` (어깨 피벗, 최대 7°) | ✅ | `kiriko.py` `ARM_*`, wave·stretch·greet 등 7 모션이 사용 |
| physics3 (머리카락 좌우 분리·술·부적·옷자락·꼬리·귀 15 설정, 뿌리+끝 2단 굽힘) | ✅ 완료 | `tools/moc3/kiriko_physics.py`, 로더 `src/character/live2dPhysics.ts` |
| 앱 통합·전체 검증 | ✅ 통과 | `KMD_L2D_MODEL=assets/models/private/kiriko/kiriko.model3.json npm run test:e2e:live2d` all passed, 캡처 육안 확인 |
| 배포 빌드 | `docs/final-report.md` 1절 참조 | `npm run dist` |

## 재생성 방법
`python tools/moc3/kiriko.py` 한 번이면 `assets/models/private/kiriko/` 에 moc3·model3·exp3 7·motion3 10·physics3·model-map 을 모두 다시 쓴다. 레이어를 바꾸면 `make_layer_plan.py` → `cut_parts.py`(끝에서 `clean_eyes.py` 자동 실행) → `make_atlas.py` 뒤에 실행한다. 전체 순서와 결정 사항은 `docs/moc3-generation-handoff.md`.

## 알려진 한계
- 몸통에 팔이 없어 손은 모은 채이고, 소매만 어깨에서 ±7° 휘두른다(진짜 손 흔들기는 새 아트 필요).
- 렌더러는 가변 dt 1회 적분 물리(프레임 급락 시 공식 고정 스텝 분할 필요), 하드 스텐실 마스크, pose3/사운드/립싱크 미지원.
- 분리 잔여물(Tassel_R 술 사이 머리카락, Apron 좌상단 조각 등)은 상위 레이어에 가려지는 위치라 미수정(handoff 문서 "남은 잔여물").

## 자동 검증 범위

`npm run test:moc3`: Haru 파싱·라운드트립, gen.py 도형 모델, 키리코 moc3 Core VALID·파라미터 반응·모션/표정/physics 등록 수.
`python tools/live2d-authoring/selftest.py`: 계약 검사, CLI `--help`, 파츠 검증(정상/불량/입력 없음), 미리보기·PSD 조립, model3.json 검증(정상/손상), 파이프라인 통합. 원화 없이 픽스처만 사용.
