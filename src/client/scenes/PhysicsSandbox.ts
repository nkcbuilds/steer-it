import Phaser, { GameObjects, Scene } from 'phaser';
import { APP_NAME } from '../../shared/config';
import { InputController } from '../gameplay/InputController';
import { PhysicsDebugOverlay } from '../gameplay/PhysicsDebugOverlay';
import { RocketPhysics } from '../gameplay/RocketPhysics';
import { preloadGameAssets } from '../gameplay/rocketTextures';

const GROUND_HEIGHT = 28;
const WORLD_PADDING = 80;

/**
 * Phase 2 open physics sandbox: modular rocket, gimbal/throttle input,
 * force-at-engine thrust, debug overlay. No tunnel/editor/scoring.
 */
export class PhysicsSandbox extends Scene {
  private rocket: RocketPhysics | undefined;
  private inputController: InputController | undefined;
  private debug: PhysicsDebugOverlay | undefined;
  private ground: Phaser.Types.Physics.Matter.MatterBody | undefined;
  private titleText: GameObjects.Text | undefined;
  private backdrop: GameObjects.Graphics | undefined;
  private spawnX = 0;
  private spawnY = 0;

  constructor() {
    super('PhysicsSandbox');
  }

  preload(): void {
    preloadGameAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x071018);
    this.matter.world.setBounds(
      -2000,
      -4000,
      4000,
      8000,
      64,
      true,
      true,
      false,
      true
    );

    this.backdrop = this.add.graphics().setDepth(0);
    this.titleText = this.add
      .text(0, 0, `${APP_NAME}  |  Physics Sandbox`, {
        color: '#e8f4ff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
      })
      .setScrollFactor(0)
      .setDepth(102);

    this.inputController = new InputController(this);
    this.debug = new PhysicsDebugOverlay(this);

    this.layoutWorld();
    this.spawnRocket();

    this.scale.on('resize', () => this.layoutWorld());
  }

  override update(_time: number, delta: number): void {
    if (!this.rocket || !this.inputController || !this.debug) return;

    const deltaSeconds = Math.min(delta, 50) / 1000;
    const commands = this.inputController.update(deltaSeconds);

    if (commands.toggleDebug) {
      this.debug.toggle();
    }

    if (commands.reset) {
      this.resetSandbox();
      return;
    }

    this.rocket.setControls(commands.throttle, commands.gimbalAngle);
    this.rocket.update(deltaSeconds);
    this.debug.draw(this.rocket.getTelemetry());
  }

  private layoutWorld(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.cameras.resize(width, height);

    this.spawnX = width / 2;
    this.spawnY = height * 0.35;

    this.drawBackdrop(width, height);
    this.placeGround(width, height);

    this.titleText?.setPosition(12, 8);
    this.debug?.layout(width, height);

    // Keep camera origin at world 0,0 so UI scrollFactor 0 stays viewport-relative.
    this.cameras.main.setScroll(0, 0);
  }

  private drawBackdrop(width: number, height: number): void {
    if (!this.backdrop) return;
    this.backdrop.clear();
    this.backdrop.fillStyle(0x071018, 1);
    this.backdrop.fillRect(0, 0, width, height);

    // Subtle grid for spatial reference in the sandbox.
    this.backdrop.lineStyle(1, 0x1b2a3a, 0.55);
    const step = 48;
    for (let x = 0; x <= width; x += step) {
      this.backdrop.lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += step) {
      this.backdrop.lineBetween(0, y, width, y);
    }

    // Horizon accent
    this.backdrop.lineStyle(2, 0x243b53, 0.8);
    this.backdrop.lineBetween(
      WORLD_PADDING,
      height - GROUND_HEIGHT - 40,
      width - WORLD_PADDING,
      height - GROUND_HEIGHT - 40
    );
  }

  private placeGround(width: number, height: number): void {
    const groundY = height - GROUND_HEIGHT / 2;
    const groundWidth = Math.max(320, width - WORLD_PADDING);

    if (this.ground) {
      this.matter.world.remove(this.ground);
      this.ground = undefined;
    }

    this.ground = this.matter.add.rectangle(
      width / 2,
      groundY,
      groundWidth,
      GROUND_HEIGHT,
      {
        isStatic: true,
        label: 'sandbox-ground',
        friction: 0.6,
        restitution: 0.05,
      }
    );
  }

  private spawnRocket(): void {
    this.rocket?.destroy();
    this.rocket = new RocketPhysics(this, {
      x: this.spawnX,
      y: this.spawnY,
      angle: 0,
    });
  }

  private resetSandbox(): void {
    this.inputController?.resetControls();
    this.layoutWorld();
    if (this.rocket) {
      this.rocket.reset({ x: this.spawnX, y: this.spawnY, angle: 0 });
    } else {
      this.spawnRocket();
    }
    if (this.rocket && this.debug) {
      this.debug.draw(this.rocket.getTelemetry());
    }
  }
}
