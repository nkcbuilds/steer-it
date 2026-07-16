import { Scene } from 'phaser';
import {
  beginSharedAttempt,
  getClientChallenge,
  submitSharedResult,
} from '../challengeClient';
import { HANDCRAFTED_TUNNEL_MAP } from '../../shared/handcraftedMap';
import type { ShaftMap } from '../../shared/domain';
import { InputController } from '../gameplay/InputController';
import { RocketPhysics } from '../gameplay/RocketPhysics';
import { RunController } from '../gameplay/RunController';
import { RunHud } from '../gameplay/RunHud';
import { TouchControls } from '../gameplay/TouchControls';
import {
  TunnelBuilder,
  type BuiltTunnel,
} from '../gameplay/TunnelBuilder';
import { TunnelDebugOverlay } from '../gameplay/TunnelDebugOverlay';
import { preloadGameAssets } from '../gameplay/rocketTextures';
import type { MapEditorSceneData, TunnelRunSceneData } from './sceneData';
import type { RunState } from '../../shared/domain';

export type { TunnelRunSceneData } from './sceneData';

const LOOK_AHEAD_Y = 110;
const CAMERA_LERP = 0.1;
const TOUCH_LAYOUT_MAX_WIDTH = 700;
const EXIT_BOOST_MS = 1050;

/**
 * Phase 3 + 4 vertical slice: hand-authored tunnel, Matter wall collision,
 * run state machine, camera follow, touch + keyboard controls, baseline HUD.
 * Also hosts editor test flights with the same physics/rendering path.
 */
export class TunnelRun extends Scene {
  private map: ShaftMap = HANDCRAFTED_TUNNEL_MAP;
  private tunnel: BuiltTunnel | undefined;
  private rocket: RocketPhysics | undefined;
  private inputController: InputController | undefined;
  private touchControls: TouchControls | undefined;
  private runController: RunController | undefined;
  private hud: RunHud | undefined;
  private debug: TunnelDebugOverlay | undefined;
  private collisionBound = false;
  private challengeId: string | undefined;
  private clientRunId = createClientRunId();
  private attemptRegistration: Promise<boolean> | undefined;
  private editorTestMode = false;
  private lastRunState: RunState = 'ready';
  private completionCinematic = false;
  private cameraLockedAfterCrash = false;

  constructor() {
    super('TunnelRun');
  }

  preload(): void {
    preloadGameAssets(this);
  }

  init(data: TunnelRunSceneData): void {
    this.editorTestMode = data.mode === 'editor-test' && data.map !== undefined;
    if (this.editorTestMode && data.map) {
      this.map = data.map;
      this.challengeId = undefined;
    } else {
      const sharedChallenge = getClientChallenge();
      this.map = sharedChallenge?.map ?? HANDCRAFTED_TUNNEL_MAP;
      this.challengeId = sharedChallenge?.challenge.id;
    }
    this.clientRunId = createClientRunId();
    this.attemptRegistration = undefined;
    this.collisionBound = false;
    this.lastRunState = 'ready';
    this.completionCinematic = false;
    this.cameraLockedAfterCrash = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x080b12);

    this.matter.world.setBounds(
      0,
      0,
      this.map.worldWidth,
      this.map.worldHeight,
      32,
      true,
      true,
      true,
      true
    );

    this.inputController = new InputController(this);
    const runOptions =
      this.map.rules.timeLimitMs === undefined
        ? { fuelLimit: this.map.rules.fuelLimit ?? 100 }
        : {
            fuelLimit: this.map.rules.fuelLimit ?? 100,
            timeLimitMs: this.map.rules.timeLimitMs,
          };
    this.runController = new RunController(runOptions);

    this.tunnel = TunnelBuilder.createInScene(this, this.map);
    this.debug = new TunnelDebugOverlay(this);
    this.debug.setGeometry(this.tunnel.geometry);

    this.hud = new RunHud(this, {
      onRetry: () => this.retryRun(),
      onEdit: () => this.openEditor(),
      onBackToEditor: () => this.returnToEditor(),
      onContinue: () => this.retryRun(),
    });
    this.hud.setEditorTestMode(this.editorTestMode);
    if (this.editorTestMode) {
      this.hud.setCommunityStatus('TEST FLIGHT');
    } else {
      this.hud.setCommunityStatus(
        this.challengeId === undefined ? 'PRACTICE' : 'SHARED'
      );
    }

    this.touchControls = new TouchControls(this, this.inputController);
    this.spawnRocket();
    this.bindCollisions();
    this.layoutViewport();

    this.scale.on('resize', this.layoutViewport, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layoutViewport, this);
    });

    // Prevent browser scroll / rubber-band while flying in the iframe.
    this.input.addPointer(2);
    this.game.canvas.style.touchAction = 'none';
  }

  override update(_time: number, delta: number): void {
    if (
      !this.rocket ||
      !this.inputController ||
      !this.runController ||
      !this.hud ||
      !this.debug ||
      !this.touchControls
    ) {
      return;
    }

    const deltaMs = Math.min(delta, 50);
    const deltaSeconds = deltaMs / 1000;
    const commands = this.inputController.update(deltaSeconds);

    if (commands.toggleDebug) {
      this.debug.toggle();
      this.setMatterDebug(this.debug.isEnabled());
    }

    if (commands.reset) {
      this.retryRun();
      return;
    }

    const snapshot = this.runController.getSnapshot();
    let throttle = commands.throttle;
    let gimbal = commands.gimbalAngle;

    if (!snapshot.canControl) {
      throttle = this.completionCinematic ? 1 : 0;
      gimbal = 0;
    } else {
      throttle = this.runController.effectiveThrottle(throttle);
    }

    this.runController.update(deltaMs, throttle);
    if (
      snapshot.state === 'ready' &&
      this.runController.getState() === 'running'
    ) {
      this.rocket.setFrozen(false);
      this.registerAttempt();
    }

    this.rocket.setControls(throttle, gimbal);
    this.rocket.update(deltaSeconds);

    const nextSnapshot = this.runController.getSnapshot();
    if (
      this.lastRunState !== 'crashed' &&
      nextSnapshot.state === 'crashed'
    ) {
      this.hud.setTerminalResultsDeferred(true);
      this.hud.hideTutorial(false);
      this.touchControls.setInputEnabled(false);
      this.rocket.playCrashBurst();
      this.rocket.freezeAfterCrash();
      this.cameraLockedAfterCrash = true;
      this.cameras.main.shake(360, 0.012);
      this.time.delayedCall(780, () => {
        if (!this.runController || !this.hud) return;
        const result = this.runController.getSnapshot();
        if (result.state !== 'crashed') return;
        this.hud.setTerminalResultsDeferred(false);
        this.hud.showCrashResults({
          timeSeconds: result.elapsedMs / 1000,
          fuelUsed: result.fuelUsed,
          statusText: this.challengeId === undefined ? 'PRACTICE RUN' : 'SHAFT FAILED',
        });
      });
    }
    this.lastRunState = nextSnapshot.state;

    this.touchControls.syncFromInput();
    this.hud.update(nextSnapshot, commands.throttle);
    this.touchControls.setExclusionRects(this.hud.getExclusionRects());
    this.debug.draw(this.rocket.getTelemetry());
    if (!this.cameraLockedAfterCrash) this.updateCamera();
  }

  private spawnRocket(): void {
    this.rocket?.destroy();
    this.rocket = new RocketPhysics(this, {
      x: this.map.start.x,
      y: this.map.start.y,
      angle: this.map.start.rotation,
    });
    this.rocket.setFrozen(true);
  }

  private retryRun(): void {
    this.runController?.retry();
    this.lastRunState = 'ready';
    this.completionCinematic = false;
    this.cameraLockedAfterCrash = false;
    this.hud?.setTerminalResultsDeferred(false);
    this.hud?.hideResults();
    this.touchControls?.setInputEnabled(true);
    this.clientRunId = createClientRunId();
    this.attemptRegistration = undefined;
    this.inputController?.resetControls();
    if (this.rocket) {
      this.rocket.reset({
        x: this.map.start.x,
        y: this.map.start.y,
        angle: this.map.start.rotation,
      });
      this.rocket.setFrozen(true);
    } else {
      this.spawnRocket();
    }
    this.touchControls?.syncFromInput();
    if (this.runController && this.hud && this.inputController) {
      this.hud.update(
        this.runController.getSnapshot(),
        this.inputController.getThrottle()
      );
    }
    this.updateCamera(true);
  }

  private bindCollisions(): void {
    if (this.collisionBound) return;
    this.collisionBound = true;

    this.matter.world.on(
      'collisionstart',
      (event: { pairs: Array<{ bodyA: MatterBodyLabel; bodyB: MatterBodyLabel }> }) => {
        this.handleCollisionPairs(event.pairs);
      }
    );
  }

  private handleCollisionPairs(
    pairs: Array<{ bodyA: MatterBodyLabel; bodyB: MatterBodyLabel }>
  ): void {
    if (!this.runController) return;
    const snapshot = this.runController.getSnapshot();
    if (snapshot.isTerminal) return;

    for (const pair of pairs) {
      const labels = [readLabel(pair.bodyA), readLabel(pair.bodyB)];
      const hasRocket = labels.includes('rocket');
      if (!hasRocket) continue;

      if (labels.includes('tunnel-wall')) {
        this.runController.crash();
        this.rocket?.setControls(0, 0);
        return;
      }
      if (labels.includes('exit')) {
        this.runController.complete();
        this.playExitCinematic();
        void this.submitCompletion();
        return;
      }
    }
  }

  private registerAttempt(): void {
    if (!this.challengeId || this.attemptRegistration) return;
    this.attemptRegistration = beginSharedAttempt({
      challengeId: this.challengeId,
      mapId: this.map.id,
      clientRunId: this.clientRunId,
    });
  }

  private async submitCompletion(): Promise<void> {
    if (!this.challengeId || !this.runController || !this.hud) return;
    const registered = await (this.attemptRegistration ?? Promise.resolve(false));
    if (!registered) {
      this.hud.setCommunityStatus('SAVE FAILED');
      return;
    }

    const snapshot = this.runController.getSnapshot();
    const leaderboard = await submitSharedResult({
      challengeId: this.challengeId,
      mapId: this.map.id,
      clientRunId: this.clientRunId,
      durationMs: Math.max(1, Math.round(snapshot.elapsedMs)),
      fuelUsed: snapshot.fuelUsed,
    });
    if (!leaderboard) {
      this.hud.setCommunityStatus('SAVE FAILED');
      return;
    }
    const best = leaderboard.personalBestMs;
    this.hud.setCommunityStatus(
      best === undefined ? 'SAVED' : `PB ${(best / 1000).toFixed(1)}s`
    );
  }

  private playExitCinematic(): void {
    if (!this.rocket || !this.hud || this.completionCinematic) return;
    this.completionCinematic = true;
    this.hud.setTerminalResultsDeferred(true);
    this.hud.hideTutorial(false);
    this.touchControls?.setInputEnabled(false);
    this.rocket.beginExitBoost();

    const camera = this.cameras.main;
    const rocket = this.rocket.bodyImage;
    this.tweens.add({
      targets: camera,
      zoom: Math.max(camera.zoom, 1.72),
      duration: 520,
      ease: 'Quad.easeInOut',
    });
    this.tweens.add({
      targets: rocket,
      y: rocket.y - 320,
      duration: EXIT_BOOST_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (!this.runController || !this.hud) return;
        const result = this.runController.getSnapshot();
        this.completionCinematic = false;
        this.hud.setTerminalResultsDeferred(false);
        this.hud.showCompletionResults({
          timeSeconds: result.elapsedMs / 1000,
          fuelUsed: result.fuelUsed,
          fuelLimit: result.fuelLimit,
          statusText: this.challengeId === undefined ? 'PRACTICE CLEAR' : 'SAVING RUN',
        });
      },
    });
  }

  private openEditor(): void {
    const data: MapEditorSceneData = { baseMap: this.map };
    this.scene.start('MapEditor', data);
  }

  private returnToEditor(): void {
    const data: MapEditorSceneData = {};
    this.scene.start('MapEditor', data);
  }

  private layoutViewport = (): void => {
    const viewWidth = Math.max(1, this.scale.width);
    const viewHeight = Math.max(1, this.scale.height);
    this.cameras.resize(viewWidth, viewHeight);

    // Keep the simulation at native scale and center its compact vertical
    // viewport on wide screens. This makes desktop feel intentionally framed
    // instead of pinning a phone-sized shaft to the left edge. On mobile the
    // viewport consumes the full canvas, so pointer coordinates remain aligned
    // with the touch-control hit regions.
    // The camera must consume the complete Reddit modal. On desktop, zoom the
    // fixed-width world to the available width instead of leaving an unused
    // band beside a phone-sized viewport.
    const contentWidth = viewWidth;
    this.cameras.main.setViewport(0, 0, viewWidth, viewHeight);
    this.cameras.main.setZoom(Math.max(1, viewWidth / this.map.worldWidth));
    this.cameras.main.setBounds(
      0,
      0,
      this.map.worldWidth,
      Math.min(this.map.worldHeight, this.map.start.y + 140)
    );

    this.hud?.layout(contentWidth, viewHeight);
    this.touchControls?.layout(contentWidth, viewHeight);
    this.touchControls?.setVisible(viewWidth <= TOUCH_LAYOUT_MAX_WIDTH);
    if (this.hud && this.touchControls) {
      this.touchControls.setExclusionRects(this.hud.getExclusionRects());
    }
    this.debug?.layout(contentWidth, viewHeight);
    this.updateCamera(true);
  };

  private updateCamera(snap = false): void {
    if (!this.rocket) return;
    const camera = this.cameras.main;
    const zoom = camera.zoom || 1;
    const viewW = camera.width / zoom;
    const viewH = camera.height / zoom;

    // Look-ahead upward: place rocket below centre so more tunnel is visible above.
    const targetX = this.rocket.bodyImage.x - viewW / 2;
    const targetY = this.rocket.bodyImage.y - viewH / 2 - LOOK_AHEAD_Y;

    const maxScrollX = Math.max(0, this.map.worldWidth - viewW);
    const maxScrollY = Math.max(0, this.map.worldHeight - viewH);
    const clampedX = clamp(targetX, 0, maxScrollX);
    const clampedY = clamp(targetY, 0, maxScrollY);

    if (snap) {
      camera.setScroll(clampedX, clampedY);
    } else {
      const sx = camera.scrollX + (clampedX - camera.scrollX) * CAMERA_LERP;
      const sy = camera.scrollY + (clampedY - camera.scrollY) * CAMERA_LERP;
      camera.setScroll(sx, sy);
    }

    this.tunnel?.setParallax(camera.scrollX, camera.scrollY);
  }

  private setMatterDebug(enabled: boolean): void {
    const world = this.matter.world;
    world.drawDebug = enabled;
    if (enabled) {
      if (!world.debugGraphic) {
        world.createDebugGraphic();
      }
      world.debugGraphic?.setVisible(true);
      world.debugGraphic?.setDepth(99);
    } else if (world.debugGraphic) {
      world.debugGraphic.clear();
      world.debugGraphic.setVisible(false);
    }
  }
}

type MatterBodyLabel = {
  label?: string;
  gameObject?: { body?: { label?: string } } | null;
};

const readLabel = (body: MatterBodyLabel): string => {
  if (typeof body.label === 'string' && body.label.length > 0) {
    return body.label;
  }
  const nested = body.gameObject?.body?.label;
  if (typeof nested === 'string') return nested;
  return '';
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const createClientRunId = (): string => crypto.randomUUID();
