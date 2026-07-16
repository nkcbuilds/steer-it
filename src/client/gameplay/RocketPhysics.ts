import * as Phaser from 'phaser';
import { GameObjects, Math as PhaserMath, Physics, Scene } from 'phaser';
import { ROCKET_PHYSICS } from '../../shared/config';
import {
  ensureRocketTextures,
  ROCKET_BODY_SIZE,
  ROCKET_BODY_TEXTURE,
  ROCKET_DISPLAY_SCALE,
  ROCKET_FLAME_TEXTURE,
  ROCKET_EXPLOSION_TEXTURE,
  ROCKET_NOZZLE_SIZE,
  ROCKET_NOZZLE_TEXTURE,
} from './rocketTextures';

export type RocketTelemetry = {
  x: number;
  y: number;
  angleDeg: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  angularVelocity: number;
  throttle: number;
  gimbalDeg: number;
  thrustMagnitude: number;
  engineX: number;
  engineY: number;
  forceX: number;
  forceY: number;
  exhaustX: number;
  exhaustY: number;
};

export type RocketSpawn = {
  x: number;
  y: number;
  angle?: number;
};

/**
 * Modular Matter rocket: production pixel body + gimballed nozzle + throttle flame.
 * Thrust is applied at the engine world point below the centre of mass,
 * opposite the exhaust, so angled gimbals produce physical torque.
 * Never sets velocity or rotation from input directly.
 */
export class RocketPhysics {
  readonly bodyImage: Physics.Matter.Image;
  readonly nozzle: GameObjects.Image;
  readonly flame: GameObjects.Image;

  private readonly scene: Scene;
  private readonly engineAssembly: GameObjects.Container;
  private readonly flameGlow: GameObjects.Arc;
  private readonly sparkParticles: GameObjects.Particles.ParticleEmitter;
  private throttle = 0;
  private gimbalAngle = 0;
  private lastForceX = 0;
  private lastForceY = 0;
  private lastThrustMagnitude = 0;
  private flamePhase = 0;
  private readonly spawn: RocketSpawn;
  private readonly engineLocalY: number;
  private readonly forceVector = new PhaserMath.Vector2();
  private readonly engineWorld = new PhaserMath.Vector2();
  private crashSprite: GameObjects.Sprite | undefined;

  constructor(scene: Scene, spawn: RocketSpawn) {
    ensureRocketTextures(scene);
    this.scene = scene;
    this.spawn = { ...spawn };

    // Engine sits below CoM so off-axis thrust creates torque.
    this.engineLocalY = ROCKET_PHYSICS.engineOffsetY;

    this.bodyImage = scene.matter.add.image(
      spawn.x,
      spawn.y,
      ROCKET_BODY_TEXTURE,
      undefined,
      {
        label: 'rocket',
        frictionAir: ROCKET_PHYSICS.linearDrag,
        friction: 0.2,
        restitution: 0.05,
        density: 0.002,
      }
    );

    this.bodyImage.setRectangle(
      ROCKET_BODY_SIZE.width * 0.62,
      ROCKET_BODY_SIZE.height * 0.82,
      {
        label: 'rocket',
        frictionAir: ROCKET_PHYSICS.linearDrag,
        friction: 0.2,
        restitution: 0.05,
        density: 0.002,
      }
    );
    this.bodyImage.setMass(ROCKET_PHYSICS.rocketMass);
    this.bodyImage.setFrictionAir(ROCKET_PHYSICS.linearDrag);
    this.bodyImage.setAngle(((spawn.angle ?? 0) * 180) / Math.PI);
    this.bodyImage.setScale(ROCKET_DISPLAY_SCALE);
    this.bodyImage.setDepth(10);

    this.nozzle = scene.add
      .image(0, 0, ROCKET_NOZZLE_TEXTURE)
      .setOrigin(0.5, 0)
      .setScale(ROCKET_DISPLAY_SCALE)
      .setDepth(9);

    this.flame = scene.add
      .image(0, 0, ROCKET_FLAME_TEXTURE)
      .setOrigin(0.5, 0)
      .setScale(ROCKET_DISPLAY_SCALE)
      .setDepth(8)
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);

    // One rigid visual assembly: the flame is a local child of the nozzle,
    // so gimbal rotation can never pull the two sprites apart.
    this.engineAssembly = scene.add
      .container(0, 0, [this.flame, this.nozzle])
      .setDepth(9);

    this.flameGlow = scene.add
      .circle(0, 0, 28, 0xff8a1a, 0.22)
      .setDepth(7)
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.sparkParticles = scene.add.particles(0, 0, ROCKET_FLAME_TEXTURE, {
      lifespan: { min: 180, max: 420 },
      speed: { min: 20, max: 70 },
      scale: { start: 0.12, end: 0.02 },
      alpha: { start: 0.85, end: 0 },
      angle: { min: 70, max: 110 },
      rotate: { min: 0, max: 180 },
      frequency: 40,
      quantity: 1,
      blendMode: 'ADD',
      tint: [0xff9f1c, 0xffe66d, 0xff6b1a],
      emitting: false,
    });
    this.sparkParticles.setDepth(8);

    this.syncVisuals(0);
  }

  setControls(throttle: number, gimbalAngle: number): void {
    this.throttle = PhaserMath.Clamp(throttle, 0, 1);
    this.gimbalAngle = PhaserMath.Clamp(
      gimbalAngle,
      -ROCKET_PHYSICS.maxGimbalRadians,
      ROCKET_PHYSICS.maxGimbalRadians
    );
  }

  /** Hold the rocket on the launch pad while a run is waiting to start. */
  setFrozen(frozen: boolean): void {
    this.bodyImage.setStatic(frozen);
    if (frozen) {
      this.bodyImage.setVelocity(0, 0);
      this.bodyImage.setAngularVelocity(0);
    }
  }

  /** Stop a failed rocket at the impact point instead of letting it fall away. */
  freezeAfterCrash(): void {
    this.setControls(0, 0);
    this.bodyImage.setVelocity(0, 0);
    this.bodyImage.setAngularVelocity(0);
    this.bodyImage.setStatic(true);
    this.flame.setVisible(false);
    this.flameGlow.setVisible(false);
    this.sparkParticles.stop();
    this.bodyImage.setVisible(false);
    this.engineAssembly.setVisible(false);
  }

  /** Hold physics while the scene animates a successful boost into the sky. */
  beginExitBoost(): void {
    this.bodyImage.setVelocity(0, 0);
    this.bodyImage.setAngularVelocity(0);
    this.bodyImage.setStatic(true);
    this.setControls(1, 0);
  }

  /**
   * Apply throttle force at the engine point and enforce speed safeguards.
   * Call once per frame from the scene update loop.
   */
  update(deltaSeconds: number): void {
    this.applyThrust();
    this.applyAngularDrag(deltaSeconds);
    this.clampSpeeds();
    this.syncVisuals(deltaSeconds);
  }

  reset(spawn?: Partial<RocketSpawn>): void {
    const x = spawn?.x ?? this.spawn.x;
    const y = spawn?.y ?? this.spawn.y;
    const angle = spawn?.angle ?? this.spawn.angle ?? 0;

    this.spawn.x = x;
    this.spawn.y = y;
    this.spawn.angle = angle;

    this.throttle = 0;
    this.gimbalAngle = 0;
    this.lastForceX = 0;
    this.lastForceY = 0;
    this.lastThrustMagnitude = 0;
    this.flamePhase = 0;

    this.bodyImage.setPosition(x, y);
    this.bodyImage.setVelocity(0, 0);
    this.bodyImage.setAngularVelocity(0);
    this.bodyImage.setAngle((angle * 180) / Math.PI);
    this.sparkParticles.stop();
    this.crashSprite?.destroy();
    this.crashSprite = undefined;
    this.bodyImage.setVisible(true);
    this.engineAssembly.setVisible(true);
    this.nozzle.setVisible(true);
    this.syncVisuals(0);
  }

  /** Replace the intact rocket with a full pixel-art destruction sequence. */
  playCrashBurst(): void {
    const x = this.bodyImage.x;
    const y = this.bodyImage.y;
    this.crashSprite?.destroy();
    const animationKey = 'pixel-v4-rocket-explode';
    if (!this.scene.anims.exists(animationKey)) {
      this.scene.anims.create({
        key: animationKey,
        frames: this.scene.anims.generateFrameNumbers(ROCKET_EXPLOSION_TEXTURE, {
          start: 0,
          end: 7,
        }),
        frameRate: 11,
        repeat: 0,
        hideOnComplete: true,
      });
    }
    this.crashSprite = this.scene.add
      .sprite(x, y, ROCKET_EXPLOSION_TEXTURE, 0)
      .setOrigin(0.5)
      .setScale(0.32)
      .setDepth(30)
      .play(animationKey);
    this.crashSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.crashSprite?.destroy();
      this.crashSprite = undefined;
    });
  }

  getTelemetry(): RocketTelemetry {
    const velocity = this.bodyImage.getVelocity();
    const speed = Math.hypot(velocity.x, velocity.y);
    const engine = this.getEngineWorldPosition();
    const exhaust = this.getExhaustDirection();

    return {
      x: this.bodyImage.x,
      y: this.bodyImage.y,
      angleDeg: this.bodyImage.angle,
      velocityX: velocity.x,
      velocityY: velocity.y,
      speed,
      angularVelocity: this.bodyImage.getAngularVelocity(),
      throttle: this.throttle,
      gimbalDeg: (this.gimbalAngle * 180) / Math.PI,
      thrustMagnitude: this.lastThrustMagnitude,
      engineX: engine.x,
      engineY: engine.y,
      forceX: this.lastForceX,
      forceY: this.lastForceY,
      exhaustX: exhaust.x,
      exhaustY: exhaust.y,
    };
  }

  getEngineWorldPosition(): PhaserMath.Vector2 {
    const angle = this.bodyImage.rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Local (0, engineLocalY) rotated by body angle.
    this.engineWorld.set(
      this.bodyImage.x - this.engineLocalY * sin,
      this.bodyImage.y + this.engineLocalY * cos
    );
    return this.engineWorld;
  }

  getExhaustDirection(): PhaserMath.Vector2 {
    // Local exhaust at gimbal 0 is +Y (down the rocket). Gimbal rotates it.
    const localX = Math.sin(this.gimbalAngle);
    const localY = Math.cos(this.gimbalAngle);
    const angle = this.bodyImage.rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new PhaserMath.Vector2(
      localX * cos - localY * sin,
      localX * sin + localY * cos
    );
  }

  destroy(): void {
    this.bodyImage.destroy();
    this.engineAssembly.destroy(true);
    this.flameGlow.destroy();
    this.sparkParticles.destroy();
    this.crashSprite?.destroy();
  }

  private applyThrust(): void {
    this.lastForceX = 0;
    this.lastForceY = 0;
    this.lastThrustMagnitude = 0;

    if (this.throttle <= 0) return;

    const magnitude = ROCKET_PHYSICS.maxThrust * this.throttle;
    const exhaust = this.getExhaustDirection();
    // Force is opposite exhaust direction.
    this.forceVector.set(-exhaust.x * magnitude, -exhaust.y * magnitude);
    this.lastForceX = this.forceVector.x;
    this.lastForceY = this.forceVector.y;
    this.lastThrustMagnitude = magnitude;

    const engine = this.getEngineWorldPosition();
    this.bodyImage.applyForceFrom(engine, this.forceVector);
  }

  private applyAngularDrag(deltaSeconds: number): void {
    const angularVelocity = this.bodyImage.getAngularVelocity();
    if (angularVelocity === 0) return;

    // Frame-rate independent damping. Config value is a per-step factor at 60 Hz
    // (in addition to Matter frictionAir on linear motion).
    const stepFactor = Math.pow(
      1 - ROCKET_PHYSICS.angularDrag,
      Math.max(0, deltaSeconds * 60)
    );
    this.bodyImage.setAngularVelocity(angularVelocity * stepFactor);
  }

  private clampSpeeds(): void {
    const velocity = this.bodyImage.getVelocity();
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > ROCKET_PHYSICS.maxLinearSpeed && speed > 0) {
      const scale = ROCKET_PHYSICS.maxLinearSpeed / speed;
      this.bodyImage.setVelocity(velocity.x * scale, velocity.y * scale);
    }

    const angularSpeed = Math.abs(this.bodyImage.getAngularVelocity());
    if (angularSpeed > ROCKET_PHYSICS.maxAngularSpeed) {
      this.bodyImage.setAngularVelocity(
        Math.sign(this.bodyImage.getAngularVelocity()) *
          ROCKET_PHYSICS.maxAngularSpeed
      );
    }
  }

  private syncVisuals(deltaSeconds: number): void {
    const engine = this.getEngineWorldPosition();
    const bodyAngle = this.bodyImage.rotation;
    const nozzleAngle = bodyAngle + this.gimbalAngle;

    this.engineAssembly.setPosition(engine.x, engine.y);
    this.engineAssembly.setRotation(nozzleAngle);
    this.nozzle.setPosition(0, 0);
    this.nozzle.setRotation(0);

    // Flame attaches just below nozzle, oriented with exhaust / gimbal.
    // Nozzle origin is its top edge; the flame origin is also its top edge.
    // Anchor the flame to the rendered nozzle tip, not an independent unscaled
    // offset, so both remain physically joined at every body/gimbal angle.
    const nozzleLength = ROCKET_NOZZLE_SIZE.height - 1;
    const flameX = engine.x + Math.sin(nozzleAngle) * nozzleLength;
    const flameY = engine.y + Math.cos(nozzleAngle) * nozzleLength;
    this.flame.setPosition(0, nozzleLength);
    this.flame.setRotation(0);

    this.flamePhase += Math.max(0, deltaSeconds) * (9 + this.throttle * 11);

    if (this.throttle > 0.01) {
      // Controlled pixel-preserving flicker: sine envelope, no chaotic deformation.
      const flicker =
        0.93 +
        Math.sin(this.flamePhase) * 0.05 +
        Math.sin(this.flamePhase * 2.17) * 0.03;
      const lengthScale = (0.38 + this.throttle * 0.78) * flicker;
      const widthScale =
        (0.42 + this.throttle * 0.58) *
        (0.96 + Math.sin(this.flamePhase * 1.61) * 0.04);

      this.flame.setVisible(true);
      this.flame.setScale(
        ROCKET_DISPLAY_SCALE * widthScale,
        ROCKET_DISPLAY_SCALE * lengthScale
      );
      this.flame.setAlpha(0.72 + this.throttle * 0.28);

      const glowRadius = 18 + this.throttle * 22;
      this.flameGlow.setVisible(true);
      this.flameGlow.setPosition(flameX, flameY);
      this.flameGlow.setRadius(glowRadius);
      this.flameGlow.setAlpha(0.1 + this.throttle * 0.22);

      const exhaust = this.getExhaustDirection();
      const emitAngle = (Math.atan2(exhaust.y, exhaust.x) * 180) / Math.PI;
      this.sparkParticles.setPosition(flameX, flameY);
      this.sparkParticles.setEmitterAngle({
        min: emitAngle - 18,
        max: emitAngle + 18,
      });
      this.sparkParticles.setFrequency(28 + (1 - this.throttle) * 40);
      if (!this.sparkParticles.emitting) {
        this.sparkParticles.start();
      }
    } else {
      this.flame.setVisible(false);
      this.flameGlow.setVisible(false);
      if (this.sparkParticles.emitting) {
        this.sparkParticles.stop();
      }
    }
  }
}
