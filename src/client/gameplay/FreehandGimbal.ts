import type { InputController } from './InputController';

export type TouchRect = { x: number; y: number; w: number; h: number };

export type FreehandGimbalOptions = {
  /**
   * Horizontal pixels from gesture origin that map to full ±1 deflection.
   * Higher = lower sensitivity.
   */
  fullDeflectionPx?: number;
  /** Absolute horizontal deadzone in pixels from gesture origin. */
  deadzonePx?: number;
};

/**
 * Freehand full-playfield gimbal: drag anywhere outside exclusion rects.
 * Horizontal displacement from the gesture start maps to normalized gimbal
 * with reduced sensitivity and a deadzone. Release returns to neutral.
 * Designed to coexist with a separate multi-touch throttle pointer.
 */
export class FreehandGimbal {
  private readonly inputController: InputController;
  private readonly fullDeflectionPx: number;
  private readonly deadzonePx: number;

  private pointerId: number | undefined;
  private originX = 0;
  private normalized = 0;
  private exclusion: TouchRect[] = [];
  private enabled = true;

  constructor(
    inputController: InputController,
    options: FreehandGimbalOptions = {}
  ) {
    this.inputController = inputController;
    this.fullDeflectionPx = options.fullDeflectionPx ?? 150;
    this.deadzonePx = options.deadzonePx ?? 12;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.release();
    }
  }

  setExclusionRects(rects: TouchRect[]): void {
    this.exclusion = rects;
  }

  isActive(): boolean {
    return this.pointerId !== undefined;
  }

  getPointerId(): number | undefined {
    return this.pointerId;
  }

  /** Current normalized gimbal in [-1, 1] for visual feedback. */
  getNormalized(): number {
    return this.normalized;
  }

  /**
   * Begin a freehand gesture if the pointer is outside UI exclusion rects
   * and no gesture is already active.
   * @returns true if this pointer was claimed.
   */
  tryBegin(pointerId: number, x: number, y: number): boolean {
    if (!this.enabled || this.pointerId !== undefined) return false;
    if (isInsideAny(this.exclusion, x, y)) return false;

    this.pointerId = pointerId;
    this.originX = x;
    this.normalized = 0;
    this.inputController.setTouchGimbalNormalized(0);
    return true;
  }

  /**
   * Update an active freehand gesture.
   * @returns true if this pointer is the active freehand pointer.
   */
  move(pointerId: number, x: number): boolean {
    if (this.pointerId !== pointerId) return false;
    const dx = x - this.originX;
    const abs = Math.abs(dx);
    if (abs <= this.deadzonePx) {
      this.normalized = 0;
    } else {
      const signed = Math.sign(dx) * (abs - this.deadzonePx);
      this.normalized = clamp(
        signed / this.fullDeflectionPx,
        -1,
        1
      );
    }
    this.inputController.setTouchGimbalNormalized(this.normalized);
    return true;
  }

  /**
   * End freehand if this pointer owns the gesture.
   * @returns true if the gesture was released.
   */
  end(pointerId: number): boolean {
    if (this.pointerId !== pointerId) return false;
    this.release();
    return true;
  }

  release(): void {
    if (this.pointerId === undefined) return;
    this.pointerId = undefined;
    this.normalized = 0;
    this.inputController.setTouchGimbalNormalized(null);
  }

  /** Sync visual when keyboard owns gimbal. */
  syncNormalized(normalized: number): void {
    if (this.pointerId !== undefined) return;
    this.normalized = clamp(normalized, -1, 1);
  }
}

const isInsideAny = (rects: TouchRect[], x: number, y: number): boolean => {
  for (const r of rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return true;
    }
  }
  return false;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
