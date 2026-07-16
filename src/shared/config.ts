export const APP_NAME = 'Steer It';
export const APP_SLUG = 'steer-it';
export const FOUNDATION_VERSION = '0.1.0-foundation';

export const CHALLENGE_WINDOW_MS = 4 * 60 * 60 * 1000;

export const ROCKET_PHYSICS = {
  gravityY: 0.45,
  rocketMass: 1,
  linearDrag: 0.015,
  angularDrag: 0.08,
  maxThrust: 0.00125,
  maxGimbalRadians: (Math.PI * 25) / 180,
  gimbalReturnRadiansPerSecond: Math.PI * 1.1,
  throttleChangePerSecond: 0.5,
  maxLinearSpeed: 11,
  maxAngularSpeed: 2.4,
  crashImpactThreshold: 2,
  fuelBurnPerSecond: 1,
  /** Local +Y offset from body centre of mass to engine force point (pixels). */
  engineOffsetY: 35,
};

export const GENERATOR_CONFIG = {
  worldWidth: 900,
  worldHeight: 4200,
  /** More nodes let curve modules form visible sweeps without sharp kinks. */
  pointCount: 18,
  verticalMargin: 180,
  horizontalMargin: 150,
  /** Per-step horizontal cap; validator warns above 1.5× this value. */
  maxHorizontalShift: 150,
  minTunnelWidth: 250,
  maxTunnelWidth: 340,
  maxGenerationAttempts: 12,
};
