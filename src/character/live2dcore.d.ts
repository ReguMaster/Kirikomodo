// Cubism Core(live2dcubismcore.min.js, 사용자 배치) 최소 타입. 전체 선언은 SDK 동봉 live2dcubismcore.d.ts 참고.
declare namespace Live2DCubismCore {
  class Moc {
    static fromArrayBuffer(buffer: ArrayBuffer): Moc | null
    release(): void
  }
  class Model {
    static fromMoc(moc: Moc): Model | null
    readonly parameters: {
      count: number
      ids: string[]
      minimumValues: Float32Array
      maximumValues: Float32Array
      defaultValues: Float32Array
      values: Float32Array
    }
    readonly parts: { count: number; ids: string[]; opacities: Float32Array }
    readonly drawables: {
      count: number
      ids: string[]
      constantFlags: Uint8Array
      dynamicFlags: Uint8Array
      textureIndices: Int32Array
      renderOrders: Int32Array
      opacities: Float32Array
      maskCounts: Int32Array
      masks: Int32Array[]
      vertexCounts: Int32Array
      vertexPositions: Float32Array[]
      vertexUvs: Float32Array[]
      indexCounts: Int32Array
      indices: Uint16Array[]
      resetDynamicFlags(): void
    }
    readonly canvasinfo: { CanvasWidth: number; CanvasHeight: number; CanvasOriginX: number; CanvasOriginY: number; PixelsPerUnit: number }
    update(): void
    release(): void
  }
  namespace Version {
    function csmGetVersion(): number
  }
}
