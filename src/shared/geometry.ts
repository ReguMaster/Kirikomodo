export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// 창이 area를 벗어나면 안쪽으로 밀어 넣는다. 창이 area보다 크면 좌상단 대신 우하단을 맞춘다.
export function clampToArea(bounds: Rect, area: Rect): Rect {
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width)
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height)
  return { ...bounds, x: Math.round(x), y: Math.round(y) }
}

// 커서 화면 좌표를 창 중심 기준 -1..1 시선 좌표로 바꾼다. rangeFactor×창 크기만큼 떨어지면 시선이 끝까지 돌아간다.
export function cursorToLook(cursor: { x: number; y: number }, bounds: Rect, rangeFactor: number): { x: number; y: number } {
  const clamp = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100
  return {
    x: clamp((cursor.x - (bounds.x + bounds.width / 2)) / (bounds.width * rangeFactor)),
    y: clamp((cursor.y - (bounds.y + bounds.height / 2)) / (bounds.height * rangeFactor))
  }
}
