# live2d-authoring

Live2D 파츠 초안 분리 · 검증 · PSD 조립 · 모델 내보내기 검증 CLI. 사용법·옵션·상태값은 `docs/live2d-authoring.md`.

```
python tools/live2d-authoring/run_pipeline.py --build-id <id>   # 전체 실행
python tools/live2d-authoring/selftest.py                        # 자체검증(npm run test:authoring)
```

`python -I` 로 실행하지 말 것(같은 폴더 import·사용자 site-packages 차단).
