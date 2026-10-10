# 에셋 권리 상태

| 자산 | 권리자 | 용도 | 배포 | 앱 번들 |
|---|---|---|---|---|
| `assets/reference/kiriko.png` | Blizzard Entertainment (Overwatch 키리코) | 비주얼 레퍼런스 전용 | 불가 | 제외 |
| `assets/live2d-authoring/output/**` (초안·PSD·미리보기) | 위 자산 파생물 | 로컬 검수 | 불가 (Git 무시) | 제외 |
| `tests/fixtures/live2d/**` | 프로젝트 자체 생성(기하 도형) | 자동 테스트 | 가능 | 해당 없음 |
| `assets/live2d-authoring/input/layer-plan.json` | 프로젝트 | 레이어 계약 | 가능 | 해당 없음 |

- 기계 판독 원본: `assets/live2d-authoring/input/asset-license.json` (`run_pipeline.py` 가 보고서 "권리 상태" 줄에 그대로 반영)
- 최종 Live2D 모델을 배포하려면 레퍼런스를 베끼지 않은 **자체 원화**(명세 16.14) 또는 권리자 허락이 필요하다. 그 전까지 모델은 `assets/models/private/` 로컬 전용
- Live2D Cubism Core/SDK 는 Live2D Inc. 라이선스를 따르며 저장소에 포함하지 않는다(작업 10 에서 사용자가 직접 배치)
