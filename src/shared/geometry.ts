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
