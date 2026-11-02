export const HOLD_PREVIEW_DELAY_MS = 300;
export const HOLD_PREVIEW_MOVE_TOLERANCE = 10;
export const HOLD_PREVIEW_EVENT = "market-preview-start";

export function movedBeforeHold(startX: number, startY: number, x: number, y: number): boolean {
  return Math.hypot(x - startX, y - startY) > HOLD_PREVIEW_MOVE_TOLERANCE;
}
