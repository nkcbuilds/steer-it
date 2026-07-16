import { ROCKET_PHYSICS } from '../../shared/config';
import type { RunState } from '../../shared/domain';

export type RunSnapshot = {
  state: RunState;
  elapsedMs: number;
  fuel: number;
  fuelUsed: number;
  fuelLimit: number;
  /** True when the player may apply flight controls. */
  canControl: boolean;
  /** True when the run is finished and waiting for retry. */
  isTerminal: boolean;
};

export type RunControllerOptions = {
  fuelLimit?: number;
  timeLimitMs?: number;
};

/**
 * Explicit run lifecycle for the tunnel vertical slice.
 * ready → running (first throttle) → crashed | completed; R/retry → ready.
 * Crash and complete each latch once until retry.
 */
export class RunController {
  private state: RunState = 'ready';
  private elapsedMs = 0;
  private fuel: number;
  private fuelUsed = 0;
  private readonly fuelLimit: number;
  private readonly timeLimitMs: number | undefined;

  constructor(options: RunControllerOptions = {}) {
    this.fuelLimit = options.fuelLimit ?? 100;
    this.fuel = this.fuelLimit;
    this.timeLimitMs = options.timeLimitMs;
  }

  getSnapshot(): RunSnapshot {
    const isTerminal = this.state === 'crashed' || this.state === 'completed';
    return {
      state: this.state,
      elapsedMs: this.elapsedMs,
      fuel: this.fuel,
      fuelUsed: this.fuelUsed,
      fuelLimit: this.fuelLimit,
      canControl: this.state === 'ready' || this.state === 'running',
      isTerminal,
    };
  }

  getState(): RunState {
    return this.state;
  }

  /**
   * Advance timer/fuel while running. Call once per frame with current throttle.
   * Transitions ready → running when throttle is applied.
   */
  update(deltaMs: number, throttle: number): void {
    if (this.state === 'ready') {
      if (throttle > 0.02) {
        this.state = 'running';
      } else {
        return;
      }
    }

    if (this.state !== 'running') return;

    const clampedDelta = Math.max(0, deltaMs);
    this.elapsedMs += clampedDelta;

    if (throttle > 0 && this.fuel > 0) {
      const burn =
        ROCKET_PHYSICS.fuelBurnPerSecond * (clampedDelta / 1000) * throttle;
      const actual = Math.min(this.fuel, burn);
      this.fuel -= actual;
      this.fuelUsed += actual;
    }

    if (this.timeLimitMs !== undefined && this.elapsedMs >= this.timeLimitMs) {
      // Time expiry is treated as a failed run for this slice.
      this.crash();
    }
  }

  /** Effective throttle after fuel exhaustion (physics still receives this). */
  effectiveThrottle(requestedThrottle: number): number {
    if (!this.getSnapshot().canControl) return 0;
    if (this.fuel <= 0) return 0;
    return requestedThrottle;
  }

  crash(): void {
    if (this.state === 'running' || this.state === 'ready') {
      this.state = 'crashed';
    }
  }

  complete(): void {
    if (this.state === 'running' || this.state === 'ready') {
      this.state = 'completed';
    }
  }

  /** Restart without page reload. Resets timer and fuel. */
  retry(): void {
    this.state = 'ready';
    this.elapsedMs = 0;
    this.fuel = this.fuelLimit;
    this.fuelUsed = 0;
  }
}
