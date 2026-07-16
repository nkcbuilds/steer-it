import Phaser, { GameObjects, Scene } from 'phaser';
import { ROCKET_PHYSICS } from '../../shared/config';
import type { InputController } from './InputController';
import { FreehandGimbal, type TouchRect } from './FreehandGimbal';
import {
  ensureUiAssets,
  THROTTLE_CONTROL_NATIVE,
  THROTTLE_CONTROL_TEXTURE,
} from './uiAssets';

const FONT =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

/**
 * Mobile touch flight controls for compact Reddit webviews.
 * Lower-left: vertical throttle graphic (pixel art).
 * Gimbal: freehand drag anywhere outside UI exclusion rects (multi-touch safe).
 * Visual gimbal feedback is a compact themed arc near bottom-center.
 */
export class TouchControls {
  private readonly scene: Scene;
  private readonly inputController: InputController;
  private readonly freehand: FreehandGimbal;

  private readonly root: GameObjects.Container;
  private readonly throttleImage: GameObjects.Image;
  private readonly throttleFallback: GameObjects.Graphics;
  private readonly throttleFill: GameObjects.Graphics;
  private readonly throttleKnob: GameObjects.Graphics;
  private readonly throttleLabel: GameObjects.Text;
  private readonly gimbalGfx: GameObjects.Graphics;
  private readonly gimbalLabel: GameObjects.Text;

  private throttleBounds: TouchRect = { x: 0, y: 0, w: 0, h: 0 };
  private gimbalArcBounds: TouchRect = { x: 0, y: 0, w: 0, h: 0 };
  private extraExclusion: TouchRect[] = [];

  private throttlePointerId: number | undefined;
  private throttleValue = 0;
  private visible = true;
  private viewWidth = 390;

  constructor(scene: Scene, inputController: InputController) {
    this.scene = scene;
    this.inputController = inputController;
    this.freehand = new FreehandGimbal(inputController, {
      fullDeflectionPx: 150,
      deadzonePx: 12,
    });

    this.throttleFallback = scene.add.graphics();
    this.throttleFill = scene.add.graphics();
    this.throttleKnob = scene.add.graphics();
    this.throttleImage = scene.add
      .image(0, 0, THROTTLE_CONTROL_TEXTURE)
      .setOrigin(0.5)
      .setVisible(false);
    this.throttleLabel = scene.add
      .text(0, 0, 'THR', {
        color: '#ffc27a',
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1);

    this.gimbalGfx = scene.add.graphics();
    this.gimbalLabel = scene.add
      .text(0, 0, 'GIMBAL', {
        color: '#8ec8ff',
        fontFamily: FONT,
        fontSize: '10px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1);

    this.root = scene.add
      .container(0, 0, [
        this.throttleFallback,
        this.throttleImage,
        this.throttleFill,
        this.throttleKnob,
        this.throttleLabel,
        this.gimbalGfx,
        this.gimbalLabel,
      ])
      .setScrollFactor(0)
      .setDepth(200);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);

    ensureUiAssets(scene, () => {
      this.refreshThrottleTexture();
      this.redraw();
    });

    this.layout(scene.scale.width, scene.scale.height);
  }

  layout(viewWidth: number, viewHeight: number): void {
    this.viewWidth = Math.max(1, viewWidth);

    const margin = Math.max(6, Math.min(14, viewWidth * 0.025));
    const bottomPad = Math.max(8, Math.min(16, viewHeight * 0.018));

    // Slightly larger vertical throttle in the lower-left.
    const thrH = clamp(
      Math.round(viewHeight * 0.22),
      150,
      Math.min(220, Math.round(viewHeight * 0.32))
    );
    const thrW = clamp(
      Math.round(thrH * (THROTTLE_CONTROL_NATIVE.width / THROTTLE_CONTROL_NATIVE.height)),
      56,
      88
    );

    this.throttleBounds = {
      x: margin,
      y: viewHeight - bottomPad - thrH,
      w: thrW,
      h: thrH,
    };

    // Compact arc indicator bottom-center (not a boxed pad).
    const arcW = clamp(Math.round(viewWidth * 0.28), 96, 140);
    const arcH = 36;
    this.gimbalArcBounds = {
      x: (viewWidth - arcW) / 2,
      y: viewHeight - bottomPad - arcH - 4,
      w: arcW,
      h: arcH,
    };

    this.throttleLabel.setPosition(
      this.throttleBounds.x + this.throttleBounds.w / 2,
      this.throttleBounds.y - 4
    );
    this.gimbalLabel.setPosition(
      this.gimbalArcBounds.x + this.gimbalArcBounds.w / 2,
      this.gimbalArcBounds.y - 2
    );

    this.refreshThrottleTexture();
    this.throttleValue = this.inputController.getThrottle();
    this.rebuildExclusions();
    this.redraw();
  }

  /**
   * Extra screen-space rects freehand gimbal must ignore
   * (HUD panels, results, tutorial, etc.).
   */
  setExclusionRects(rects: TouchRect[]): void {
    this.extraExclusion = rects;
    this.rebuildExclusions();
  }

  getThrottleBounds(): TouchRect {
    return { ...this.throttleBounds };
  }

  /** Public freehand entry for integration tests / external wiring. */
  beginFreehandGimbal(pointerId: number, x: number, y: number): boolean {
    return this.freehand.tryBegin(pointerId, x, y);
  }

  updateFreehandGimbal(pointerId: number, x: number): boolean {
    const ok = this.freehand.move(pointerId, x);
    if (ok) this.redraw();
    return ok;
  }

  endFreehandGimbal(pointerId: number): boolean {
    const ok = this.freehand.end(pointerId);
    if (ok) this.redraw();
    return ok;
  }

  /** Sync visual throttle / gimbal when keyboard changes values. */
  syncFromInput(): void {
    if (this.throttlePointerId === undefined) {
      this.throttleValue = this.inputController.getThrottle();
    }
    if (!this.freehand.isActive()) {
      this.freehand.syncNormalized(
        this.inputController.getGimbalAngle() /
          ROCKET_PHYSICS.maxGimbalRadians
      );
    }
    this.redraw();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.setVisible(visible);
    if (!visible) {
      this.releaseThrottle();
    }
  }

  /**
   * The freehand gesture remains enabled when the mobile control art is hidden
   * on desktop. This gives mouse users click-drag gimbal control over the whole
   * playfield without showing a phone-sized control overlay.
   */
  setInputEnabled(enabled: boolean): void {
    this.freehand.setEnabled(enabled);
    if (!enabled) this.releaseThrottle();
  }

  destroy(scene: Scene): void {
    scene.input.off('pointerdown', this.onPointerDown, this);
    scene.input.off('pointermove', this.onPointerMove, this);
    scene.input.off('pointerup', this.onPointerUp, this);
    scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.freehand.release();
    this.root.destroy(true);
  }

  private rebuildExclusions(): void {
    const rects: TouchRect[] = [
      this.throttleBounds,
      // Keep top instrument / action strip free of freehand capture.
      { x: 0, y: 0, w: this.viewWidth, h: 96 },
      ...this.extraExclusion,
    ];
    this.freehand.setExclusionRects(rects);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const x = pointer.x;
    const y = pointer.y;

    // Keep receiving the drag even when a fast mouse/finger leaves the canvas.
    // Pointer Events capture is the cross-device primitive for this behavior.
    const nativeEvent = pointer.event;
    if (nativeEvent instanceof PointerEvent) {
      this.scene.game.canvas.setPointerCapture(nativeEvent.pointerId);
    }

    if (
      this.visible &&
      this.throttlePointerId === undefined &&
      hit(this.throttleBounds, x, y)
    ) {
      this.throttlePointerId = pointer.id;
      this.applyThrottle(y);
      return;
    }

    // Freehand gimbal on any free pointer outside exclusions.
    if (this.freehand.tryBegin(pointer.id, x, y)) {
      this.redraw();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return;

    if (this.throttlePointerId === pointer.id) {
      this.applyThrottle(pointer.y);
      return;
    }

    if (this.freehand.move(pointer.id, pointer.x)) {
      this.redraw();
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const nativeEvent = pointer.event;
    if (
      nativeEvent instanceof PointerEvent &&
      this.scene.game.canvas.hasPointerCapture(nativeEvent.pointerId)
    ) {
      this.scene.game.canvas.releasePointerCapture(nativeEvent.pointerId);
    }
    if (this.throttlePointerId === pointer.id) {
      this.releaseThrottle();
      this.redraw();
      return;
    }

    if (this.freehand.end(pointer.id)) {
      this.redraw();
    }
  }

  private releaseThrottle(): void {
    if (this.throttlePointerId === undefined) return;
    this.throttlePointerId = undefined;
    // Throttle is persistent; release only ends absolute override.
    this.inputController.setTouchThrottle(null);
  }

  private applyThrottle(pointerY: number): void {
    const bounds = this.throttleBounds;
    // Top of track = full throttle, bottom = zero (persistent).
    const t = 1 - (pointerY - bounds.y) / bounds.h;
    this.throttleValue = clamp(t, 0, 1);
    this.inputController.setTouchThrottle(this.throttleValue);
    this.redraw();
  }

  private refreshThrottleTexture(): void {
    const hasTex = this.scene.textures.exists(THROTTLE_CONTROL_TEXTURE);
    this.throttleImage.setVisible(hasTex);
    if (!hasTex) return;
    this.throttleImage.setTexture(THROTTLE_CONTROL_TEXTURE);
    this.throttleImage.setPosition(
      this.throttleBounds.x + this.throttleBounds.w / 2,
      this.throttleBounds.y + this.throttleBounds.h / 2
    );
    this.throttleImage.setDisplaySize(
      this.throttleBounds.w,
      this.throttleBounds.h
    );
  }

  private redraw(): void {
    this.throttleFallback.clear();
    this.throttleFill.clear();
    this.throttleKnob.clear();
    this.gimbalGfx.clear();

    const t = this.throttleBounds;
    const hasTex = this.scene.textures.exists(THROTTLE_CONTROL_TEXTURE);

    if (!hasTex) {
      this.throttleFallback.fillStyle(0x0a0f18, 0.82);
      this.throttleFallback.fillRect(t.x, t.y, t.w, t.h);
      this.throttleFallback.lineStyle(2, 0xff9f1c, 0.85);
      this.throttleFallback.strokeRect(t.x, t.y, t.w, t.h);
    }

    // Amber fill overlay on the track (works with or without art).
    const insetX = t.w * 0.32;
    const insetTop = t.h * 0.14;
    const insetBot = t.h * 0.12;
    const trackX = t.x + insetX;
    const trackW = t.w - insetX * 2;
    const trackY = t.y + insetTop;
    const trackH = t.h - insetTop - insetBot;
    const fillH = trackH * this.throttleValue;
    if (fillH > 1) {
      this.throttleFill.fillStyle(0xff9f1c, hasTex ? 0.35 : 0.55);
      this.throttleFill.fillRect(
        trackX,
        trackY + trackH - fillH,
        trackW,
        fillH
      );
    }

    const thrKnobY = trackY + trackH - this.throttleValue * trackH;
    const thrKnobX = t.x + t.w / 2;
    this.throttleKnob.fillStyle(0xffb347, 0.95);
    this.throttleKnob.fillCircle(thrKnobX, thrKnobY, 9);
    this.throttleKnob.lineStyle(2, 0xffe66d, 0.95);
    this.throttleKnob.strokeCircle(thrKnobX, thrKnobY, 9);

    // Compact gimbal arc near bottom-center.
    const g = this.gimbalArcBounds;
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h - 6;
    const radius = g.w * 0.42;
    const normalized = this.freehand.getNormalized();

    this.gimbalGfx.fillStyle(0x0a0f18, 0.55);
    this.gimbalGfx.fillRect(g.x, g.y, g.w, g.h);
    this.gimbalGfx.lineStyle(1, 0x3d5a80, 0.75);
    this.gimbalGfx.strokeRect(g.x, g.y, g.w, g.h);

    // Arc track
    this.gimbalGfx.lineStyle(3, 0x415a77, 0.85);
    this.drawArc(this.gimbalGfx, cx, cy, radius, Math.PI, 0);
    this.gimbalGfx.lineStyle(2, 0x5ec8e8, 0.55);
    this.drawArc(this.gimbalGfx, cx, cy, radius, Math.PI, 0);

    // Needle from centre along arc
    const angle = Math.PI + ((normalized + 1) / 2) * Math.PI;
    const nx = cx + Math.cos(angle) * radius;
    const ny = cy + Math.sin(angle) * radius;
    this.gimbalGfx.lineStyle(2, 0x8ec8ff, 0.95);
    this.gimbalGfx.lineBetween(cx, cy, nx, ny);
    this.gimbalGfx.fillStyle(0x8ec8ff, 0.96);
    this.gimbalGfx.fillCircle(nx, ny, 6);
    this.gimbalGfx.lineStyle(1, 0xe0f7ff, 0.95);
    this.gimbalGfx.strokeCircle(nx, ny, 6);
    this.gimbalGfx.fillStyle(0xffffff, 0.35);
    this.gimbalGfx.fillCircle(cx, cy, 3);
  }

  private drawArc(
    gfx: GameObjects.Graphics,
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): void {
    const steps = 24;
    const span = endAngle - startAngle;
    gfx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const a = startAngle + (span * i) / steps;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
    gfx.strokePath();
  }
}

const hit = (rect: TouchRect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
