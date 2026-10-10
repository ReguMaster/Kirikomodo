# Cubism 임포트 체크리스트 (템플릿)

빌드별 체크리스트는 `run_pipeline.py` 가 `assets/live2d-authoring/output/<build-id>/cubism-import-checklist.md` 로 생성한다(복원 목록·경로가 채워짐).
아래는 공통 절차. 모두 사람이 수행하며 자동화 대상이 아니다(`REQUIRES_EDITOR`).

## 임포트 전

- [ ] `_REF` / `_GUIDE` / `_TMP` 레이어 삭제 또는 숨김(Cubism 은 숨김 레이어도 임포트하므로 삭제 권장)
- [ ] `layer-validation.json` 상태가 `PASSED`(또는 `NEEDS_MANUAL_QA` 사유 기록)
- [ ] 복원 레이어 완료, 눈·입 파츠 분리 상태 확인
- [ ] PSD 는 pure-Python 생성(EXPERIMENTAL)이므로 Photoshop/Krita 에서 한 번 열어 재저장하면 호환성이 좋아짐(`REQUIRES_PSD_TOOL`)

## Cubism Editor

- [ ] File → Open 으로 PSD 임포트, 레이어명·그룹명 보존 확인
- [ ] 드로우 오더를 `layer-plan.json` 의 z 기준으로 재정렬(PSD 그룹 순서는 그룹 내 최대 z 기준)
- [ ] 표준 파라미터: ParamAngleX/Y/Z, ParamEyeLOpen/ROpen, ParamEyeBallX/Y, ParamMouthOpenY, ParamMouthForm, ParamBodyAngleX/Y/Z, ParamBreath
- [ ] Groups: EyeBlink(ParamEyeLOpen, ParamEyeROpen), LipSync(ParamMouthOpenY)
- [ ] HitAreas: Head, Body
- [ ] 텍스처 아틀라스 2048 이하, 모션 idle/tap/greeting 각 1개 이상, physics3.json
- [ ] File → Export → Export as MOC3

## 내보내기 후

```
python tools/live2d-authoring/validate_export.py --model <export>/kiriko-upper-body.model3.json --out <output-dir>
```

- [ ] `model-export-validation.json` 이 `PASSED`(또는 사유 확인된 `NEEDS_MANUAL_QA`)
- [ ] 앱 설정 > 캐릭터 > 모델 > "가져오기" 로 `.model3.json` 선택 → 앱이 `%APPDATA%/kirikomodo/models/<id>/` 에 복사. Core(`live2dcubismcore.min.js`)는 "Core 폴더" 버튼으로 연 폴더에 배치 후 "다시 불러오기"
