import { GameObjects, Scene } from 'phaser';
import type { RocketTelemetry } from './RocketPhysics';

const FORCE_SCALE = 120_000;
const VELOCITY_SCALE = 8;
const EXHAUST_SCALE = 36;

/**
 * Optional debug arrows and telemetry for the physics sandbox.
 * Toggle with F3 or backtick from the scene.
 */
export class PhysicsDebugOverlay {
  private readonly graphics: GameObjects.Graphics;
  private readonly telemetryText: GameObjects.Text;
  private readonly helpText: GameObjects.Text;
  private enabled = true;

  constructor(scene: Scene) {
    this.graphics = scene.add.graphics().setDepth(100).setScrollFactor(1);
    this.telemetryText = scene.add
      .text(12, 36, '', {
        color: '#b8f0ff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '13px',
        lineSpacing: 4,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.helpText = scene.add
      .text(12, 0, '', {
        color: '#9fb3c8',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        lineSpacing: 3,
        backgroundColor: '#00000066',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.helpText.setText(
      [
        'W/S throttle (persistent)  Space cutoff',
        'A/D or arrows gimbal (returns to neutral)',
        'R reset  F3/` debug toggle',
      ].join('\n')
    );

    this.layout(scene.scale.width, scene.scale.height);
    this.applyVisibility();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.applyVisibility();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVisibility();
  }

  layout(_viewWidth: number, viewHeight: number): void {
    this.helpText.setPosition(12, Math.max(12, viewHeight - 64));
  }

  draw(telemetry: RocketTelemetry): void {
    this.graphics.clear();
    if (!this.enabled) {
      this.telemetryText.setText('');
      return;
    }

    // Velocity (cyan)
    this.drawArrow(
      telemetry.x,
      telemetry.y,
      telemetry.x + telemetry.velocityX * VELOCITY_SCALE,
      telemetry.y + telemetry.velocityY * VELOCITY_SCALE,
      0x4cc9f0,
      2
    );

    // Thrust force at engine (orange)
    this.drawArrow(
      telemetry.engineX,
      telemetry.engineY,
      telemetry.engineX + telemetry.forceX * FORCE_SCALE,
      telemetry.engineY + telemetry.forceY * FORCE_SCALE,
      0xff9f1c,
      3
    );

    // Exhaust direction (red)
    this.drawArrow(
      telemetry.engineX,
      telemetry.engineY,
      telemetry.engineX + telemetry.exhaustX * EXHAUST_SCALE,
      telemetry.engineY + telemetry.exhaustY * EXHAUST_SCALE,
      0xff4d6d,
      2
    );

    // Engine application point
    this.graphics.fillStyle(0xffffff, 0.9);
    this.graphics.fillCircle(telemetry.engineX, telemetry.engineY, 3);

    this.telemetryText.setText(
      [
        'PHYSICS SANDBOX',
        `pos  ${telemetry.x.toFixed(1)}, ${telemetry.y.toFixed(1)}`,
        `ang  ${telemetry.angleDeg.toFixed(1)} deg`,
        `spd  ${telemetry.speed.toFixed(2)}  w ${telemetry.angularVelocity.toFixed(3)}`,
        `thr  ${(telemetry.throttle * 100).toFixed(0)}%  gim ${telemetry.gimbalDeg.toFixed(1)} deg`,
        `F    ${telemetry.forceX.toExponential(2)}, ${telemetry.forceY.toExponential(2)}`,
        'arrows: vel(cyan) thrust(orange) exhaust(red)',
      ].join('\n')
    );
  }

  destroy(): void {
    this.graphics.destroy();
    this.telemetryText.destroy();
    this.helpText.destroy();
  }

  private drawArrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    width: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    this.graphics.lineStyle(width, color, 0.95);
    this.graphics.lineBetween(x1, y1, x2, y2);

    const nx = dx / len;
    const ny = dy / len;
    const head = Math.min(10, len * 0.35);
    this.graphics.lineBetween(
      x2,
      y2,
      x2 - nx * head - ny * head * 0.5,
      y2 - ny * head + nx * head * 0.5
    );
    this.graphics.lineBetween(
      x2,
      y2,
      x2 - nx * head + ny * head * 0.5,
      y2 - ny * head - nx * head * 0.5
    );
  }

  private applyVisibility(): void {
    this.graphics.setVisible(this.enabled);
    this.telemetryText.setVisible(this.enabled);
    this.helpText.setVisible(true);
  }
}
