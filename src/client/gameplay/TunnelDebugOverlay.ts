import { GameObjects, Scene } from 'phaser';
import type { RocketTelemetry } from './RocketPhysics';
import type { TunnelGeometry } from './TunnelBuilder';

const FORCE_SCALE = 120_000;
const VELOCITY_SCALE = 8;
const EXHAUST_SCALE = 36;

/**
 * Dev debug overlay for tunnel geometry samples and rocket forces.
 * Toggle with F3 / backtick from the scene.
 */
export class TunnelDebugOverlay {
  private readonly graphics: GameObjects.Graphics;
  private readonly telemetryText: GameObjects.Text;
  private readonly helpText: GameObjects.Text;
  private enabled = false;
  private helpVisible = false;
  private geometry: TunnelGeometry | undefined;

  constructor(scene: Scene) {
    this.graphics = scene.add.graphics().setDepth(100).setScrollFactor(1);
    this.telemetryText = scene.add
      .text(12, 100, '', {
        color: '#b8f0ff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: '12px',
        lineSpacing: 3,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.helpText = scene.add
      .text(12, 0, '', {
        color: '#9fb3c8',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        lineSpacing: 2,
        backgroundColor: '#00000066',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.helpText.setText(
      [
        'Touch: L gimbal  R throttle  |  Keys: W/S thr  A/D gim  Space cut',
        'R retry  F3/` debug (centreline / walls / forces)',
      ].join('\n')
    );

    this.layout(scene.scale.width, scene.scale.height);
    this.applyVisibility();
  }

  setGeometry(geometry: TunnelGeometry): void {
    this.geometry = geometry;
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

  layout(viewWidth: number, viewHeight: number): void {
    // Sit above the touch control band on short viewports.
    const y = Math.max(12, viewHeight - Math.min(120, viewHeight * 0.22) - 52);
    this.helpText.setPosition(12, y);
    // The themed first-flight card owns player instructions. Debug legends are
    // developer-only and must never occupy the production playfield.
    this.helpVisible = this.enabled && viewWidth >= 520;
    this.helpText.setVisible(this.helpVisible);
  }

  draw(telemetry: RocketTelemetry): void {
    this.graphics.clear();
    if (!this.enabled) {
      this.telemetryText.setText('');
      return;
    }

    this.drawGeometrySamples();
    this.drawRocketDebug(telemetry);

    const sampleCount = this.geometry?.samples.length ?? 0;
    const wallCount = this.geometry?.wallSegments.length ?? 0;

    this.telemetryText.setText(
      [
        'TUNNEL DEBUG',
        `samples ${sampleCount}  wallSeg ${wallCount}`,
        `pos  ${telemetry.x.toFixed(1)}, ${telemetry.y.toFixed(1)}`,
        `ang  ${telemetry.angleDeg.toFixed(1)} deg`,
        `spd  ${telemetry.speed.toFixed(2)}  w ${telemetry.angularVelocity.toFixed(3)}`,
        `thr  ${(telemetry.throttle * 100).toFixed(0)}%  gim ${telemetry.gimbalDeg.toFixed(1)} deg`,
        'cyan=vel orange=thrust red=exhaust',
        'lime=centre  yellow=walls  magenta=seg',
      ].join('\n')
    );
  }

  destroy(): void {
    this.graphics.destroy();
    this.telemetryText.destroy();
    this.helpText.destroy();
  }

  private drawGeometrySamples(): void {
    const geometry = this.geometry;
    if (!geometry) return;

    // Centreline samples
    this.graphics.fillStyle(0x80ed99, 0.9);
    for (const sample of geometry.samples) {
      this.graphics.fillCircle(sample.centre.x, sample.centre.y, 2.5);
    }
    this.graphics.lineStyle(1, 0x80ed99, 0.7);
    for (let i = 0; i < geometry.samples.length - 1; i += 1) {
      const a = geometry.samples[i];
      const b = geometry.samples[i + 1];
      if (!a || !b) continue;
      this.graphics.lineBetween(a.centre.x, a.centre.y, b.centre.x, b.centre.y);
    }

    // Wall sample points
    this.graphics.fillStyle(0xffe66d, 0.85);
    for (const point of geometry.leftWall) {
      this.graphics.fillCircle(point.x, point.y, 2);
    }
    for (const point of geometry.rightWall) {
      this.graphics.fillCircle(point.x, point.y, 2);
    }

    // Matter segment centers (approximate body placement)
    this.graphics.lineStyle(1, 0xff00aa, 0.55);
    for (const segment of geometry.wallSegments) {
      const cos = Math.cos(segment.angle);
      const sin = Math.sin(segment.angle);
      const hx = (segment.length * 0.5) * cos;
      const hy = (segment.length * 0.5) * sin;
      this.graphics.lineBetween(
        segment.x - hx,
        segment.y - hy,
        segment.x + hx,
        segment.y + hy
      );
    }
  }

  private drawRocketDebug(telemetry: RocketTelemetry): void {
    this.drawArrow(
      telemetry.x,
      telemetry.y,
      telemetry.x + telemetry.velocityX * VELOCITY_SCALE,
      telemetry.y + telemetry.velocityY * VELOCITY_SCALE,
      0x4cc9f0,
      2
    );

    this.drawArrow(
      telemetry.engineX,
      telemetry.engineY,
      telemetry.engineX + telemetry.forceX * FORCE_SCALE,
      telemetry.engineY + telemetry.forceY * FORCE_SCALE,
      0xff9f1c,
      3
    );

    this.drawArrow(
      telemetry.engineX,
      telemetry.engineY,
      telemetry.engineX + telemetry.exhaustX * EXHAUST_SCALE,
      telemetry.engineY + telemetry.exhaustY * EXHAUST_SCALE,
      0xff4d6d,
      2
    );

    this.graphics.fillStyle(0xffffff, 0.9);
    this.graphics.fillCircle(telemetry.engineX, telemetry.engineY, 3);
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
    this.helpText.setVisible(this.enabled && this.helpVisible);
  }
}
