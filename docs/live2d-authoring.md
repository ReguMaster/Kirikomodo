# Live2D 제작 파이프라인 (`tools/live2d-authoring/`)

`assets/reference/kiriko.png` 를 기준으로 파츠 초안 분리 → 검증 → 미리보기 → PSD 조립까지 자동화하고,
Cubism Editor 가 필요한 리깅·moc3 내보내기는 `REQUIRES_EDITOR` 로 기록만 한다. 앱(Electron) 코드와 독립된 Python CLI 다.

- 요구: Python 3.11+, Pillow, numpy (`python -c "import PIL, numpy"` 로 확인)
- 실행은 **반드시 `python` 으로** (`python -I` 금지: 같은 폴더의 `common` import 와 사용자 site-packages 가 막힘)
- Git Bash 에서 `/tmp` 류 경로를 넘길 때는 `cygpath -w` 로 Windows 경로로 변환
- 명세 16.12 의 `tools/live2d_asset_validator/` 는 이 폴더의 `validate_layers.py`(파츠) + `validate_export.py`(모델) 에 해당한다

## 한 번에 실행

```
python tools/live2d-authoring/run_pipeline.py --build-id 2026-10-10-r6
```

산출물은 `assets/live2d-authoring/output/<build-id>/` (Git 무시 대상. 비배포 원화 파생물).
`asset-build-report.md` 에 단계별 상태, `cubism-import-checklist.md` 에 사람이 할 일이 정리된다.

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--build-id` | (필수) | 출력 폴더 이름 |
| `--plan` | `assets/live2d-authoring/input/layer-plan.json` | 레이어 계약 |
| `--input` | `assets/reference/kiriko.png` | 원화 PNG. 없으면 prepare/draft 단계 `BLOCKED_INPUT` |
| `--layers` | `assets/live2d-authoring/layers` | 사람이 완성한 파츠 PNG 폴더. 비어 있으면 초안(`_REF`)으로 진행 |
| `--model` | 없음 | Cubism 내보내기 후 `*.model3.json`. 없으면 `REQUIRES_EDITOR` |
| `--out-root` | `assets/live2d-authoring/output` | 출력 루트 |

## 단계별 CLI

| 스크립트 | 입력 옵션 | 산출물 |
|---|---|---|
| `make_layer_plan.py [--out] [--docs]` | 코드 내 파츠 정의 | `layer-plan.json`, `docs/live2d-kiriko-parts.md` |
| `prepare_artwork.py --input --plan --out` | 원화 | `source-info.json`, `upper_body_preview.png` |
| `draft_split.py --input --plan --out` | 원화 | `<id>_REF.png`, `masks/`, `draft-split-report.json` |
| `validate_layers.py --manifest --layers --out [--allow-draft]` | 파츠 PNG | `layer-validation.json` |
| `export_previews.py --manifest --layers --out [--allow-draft] [--reference]` | 파츠 PNG | `composite.png`, `contact-sheet.png`, `compare.png` |
| `assemble_psd.py --manifest --layers --out [--allow-draft]` | 파츠 PNG | `character_layers.psd`(EXPERIMENTAL), `psd-assembly.json` |
| `validate_export.py --model --out` | `*.model3.json` | `model-export-validation.json` |
| `make_fixtures.py [--out]` | 없음 | `tests/fixtures/live2d/` |
| `selftest.py` | 픽스처 | 종료 코드 0/1 (`npm run test:authoring`) |

종료 코드: `0` = PASSED/READY/NEEDS_MANUAL_QA, `1` = FAILED, `2` = BLOCKED_INPUT.

## 상태값

| 상태 | 뜻 |
|---|---|
| `NOT_STARTED` | 기록만 있고 실행 안 함 |
| `READY` | 자동 단계 완료 |
| `BLOCKED_INPUT` | 입력(원화·파츠·모델) 없음 |
| `REQUIRES_PSD_TOOL` | Photoshop/Krita 등 외부 도구 필요 |
| `REQUIRES_EDITOR` | Cubism Editor 수동 작업 필요 |
| `NEEDS_MANUAL_QA` | 자동 통과했으나 사람이 확인해야 함(초안·실험적 PSD·경고 포함) |
| `PASSED` / `FAILED` | 검증 결과 |

초안(`_REF`)만으로 돌리면 전체 상태는 항상 `NEEDS_MANUAL_QA` 이며, 이것은 **모델 완성이 아니다**(M-08).

## 검증 항목 (`validate_layers.py`)

PNG 포맷 · RGBA · 캔버스 크기 일치 · 빈 이미지 · 가장자리 잘림(가이드 제외) · 반투명 잔여물 35% 초과 · 색 테두리 픽셀 ·
sha1 중복 · 계약에 없는 파일 · 필수 레이어 누락(초안 모드에서는 경고). 레이어명 규칙은 `docs/live2d-layer-contract.json`.

## 사람 작업 흐름

1. `assets/live2d-authoring/output/<id>/layers-draft/*_REF.png` 를 참고해 Krita/Photoshop 에서 파츠를 완성하고 `assets/live2d-authoring/layers/<id>.png` 로 저장
2. 복원 레이어(`docs/live2d-kiriko-parts.md` 복원 목록)는 가려진 부분을 그려 넣기
3. `run_pipeline.py` 재실행 → `validate_layers` 가 `PASSED` 가 될 때까지 반복
4. `cubism-import-checklist.md` 대로 Cubism Editor 에서 임포트·리깅·Export as MOC3
5. `run_pipeline.py --model <export>/*.model3.json` 으로 내보내기 검증 → 앱 연동(작업 10)
