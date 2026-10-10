# live2dcubismcore (external lib)

Live2D Cubism Core 런타임. 수정하지 않고 그대로 둔다.

- 출처: https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js (npm `live2dcubismcore@1.0.2`)
- SHA-256: `29b32715c117b2c00ddd9e978cb0eb951105f56477b40f309d9feb3290bf1386`
- 라이선스: Live2D Proprietary Software License Agreement. 파일 헤더가 "Redistributable Code" 로 명시한다. https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html
- 사용: `electron/services/models.ts` 의 `findCore()` 가 `kmd-model://core/...` 요청에 이 파일을 내준다. 패키징 시 `electron-builder.yml` 의 `extraResources` 로 `resources/external/` 에 복사된다. `%APPDATA%/Kirikomodo/live2d/` 에 같은 이름의 파일을 두면 그쪽이 우선한다.
