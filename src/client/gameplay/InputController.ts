import Phaser, { Scene } from 'phaser';
import { ROCKET_PHYSICS } from '../../shared/config';

export type FlightCommands = {
  /** Current throttle in [0, 1]. Persistent until changed or cut off. */
  throttle: number;
  /** Current gimbal angle in radians, limited to maxGimbalRadians. */
  gimbalAngle: number;
  /** True for one frame when reset/retry was pressed. */
  reset: boolean;
  /** True for one frame when debug toggle was pressed. */
  toggleDebug: boolean;
};

/**
 * Normalizes keyboard and touch into the same throttle/gimbal control state.
 * Keyboard: W/S persistent throttle, Space cutoff, A/D gimbal with spring return.
 * Touch: absolute throttle slider; gimbal pad with capture + spring-to-neutral.
 * No direct velocity or auto-level commands.
 */
export class InputController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private readonly keyW: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyS: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyA: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyD: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyR: Phaser.Input.Keyboard.Key | undefined;
  private readonly keySpace: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyF3: Phaser.Input.Keyboard.Key | undefined;
  private readonly keyBacktick: Phaser.Input.Keyboard.Key | undefined;

  private throttle = 0;
  private gimbalAngle = 0;
  private resetLatched = false;
  private debugLatched = false;

  /** When true, touch owns throttle absolute value for this frame span. */
  private touchThrottleActive = false;
  /** When true, touch owns gimbal; spring is deferred until release. */
  private touchGimbalActive = false;

  constructor(scene: Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) return;

    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyF3 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    this.keyBacktick = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
  }

  update(deltaSeconds: number): FlightCommands {
    this.integrateThrottle(deltaSeconds);
    this.integrateGimbal(deltaSeconds);

    const reset = this.consumeEdge(this.keyR, 'resetLatched');
    const toggleDebug =
      this.consumeEdge(this.keyF3, 'debugLatched') ||
      this.consumeEdge(this.keyBacktick, 'debugLatched');

    return {
      throttle: this.throttle,
      gimbalAngle: this.gimbalAngle,
      reset,
      toggleDebug,
    };
  }

  /**
   * Absolute throttle from the vertical touch slider [0, 1].
   * Pass null when the pointer is released (value remains persistent).
   */
  setTouchThrottle(value: number | null): void {
    if (value === null) {
      this.touchThrottleActive = false;
      return;
    }
    this.touchThrottleActive = true;
    this.throttle = clamp01(value);
  }

  /**
   * Normalized gimbal from the horizontal touch pad [-1, 1].
   * Pass null on release so the gimbal springs back to neutral.
   */
  setTouchGimbalNormalized(value: number | null): void {
    if (value === null) {
      this.touchGimbalActive = false;
      return;
    }
    this.touchGimbalActive = true;
    const max = ROCKET_PHYSICS.maxGimbalRadians;
    this.gimbalAngle = clamp(value, -1, 1) * max;
  }

  /** Immediate cutoff used by Space and external reset. */
  cutoff(): void {
    this.throttle = 0;
  }

  resetControls(): void {
    this.throttle = 0;
    this.gimbalAngle = 0;
    this.touchThrottleActive = false;
    this.touchGimbalActive = false;
  }

  getThrottle(): number {
    return this.throttle;
  }

  getGimbalAngle(): number {
    return this.gimbalAngle;
  }

  destroy(): void {
    // Keys are owned by the scene keyboard plugin.
  }

  private integrateThrottle(deltaSeconds: number): void {
    if (this.keySpace?.isDown) {
      this.throttle = 0;
      return;
    }

    // Touch slider owns absolute throttle while the pointer is held.
    if (this.touchThrottleActive) return;

    const rate = ROCKET_PHYSICS.throttleChangePerSecond * deltaSeconds;
    if (this.keyW?.isDown || this.cursors?.up.isDown) {
      this.throttle = Math.min(1, this.throttle + rate);
    }
    if (this.keyS?.isDown || this.cursors?.down.isDown) {
      this.throttle = Math.max(0, this.throttle - rate);
    }
  }

  private integrateGimbal(deltaSeconds: number): void {
    // Touch pad owns gimbal while the pointer is held; no spring until release.
    if (this.touchGimbalActive) return;

    const max = ROCKET_PHYSICS.maxGimbalRadians;
    const left =
      (this.keyA?.isDown ?? false) || (this.cursors?.left.isDown ?? false);
    const right =
      (this.keyD?.isDown ?? false) || (this.cursors?.right.isDown ?? false);

    if (left && !right) {
      this.gimbalAngle = Math.max(-max, this.gimbalAngle - max * 2 * deltaSeconds);
      return;
    }
    if (right && !left) {
      this.gimbalAngle = Math.min(max, this.gimbalAngle + max * 2 * deltaSeconds);
      return;
    }

    // Smooth return to neutral; does not erase body angular momentum.
    const returnRate = ROCKET_PHYSICS.gimbalReturnRadiansPerSecond * deltaSeconds;
    if (Math.abs(this.gimbalAngle) <= returnRate) {
      this.gimbalAngle = 0;
    } else {
      this.gimbalAngle -= Math.sign(this.gimbalAngle) * returnRate;
    }
  }

  private consumeEdge(
    key: Phaser.Input.Keyboard.Key | undefined,
    latch: 'resetLatched' | 'debugLatched'
  ): boolean {
    if (!key) return false;
    if (key.isDown) {
      if (!this[latch]) {
        this[latch] = true;
        return true;
      }
      return false;
    }
    this[latch] = false;
    return false;
  }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
