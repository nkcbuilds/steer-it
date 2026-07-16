import { GENERATOR_CONFIG } from './config';
import type { MapValidationResult, ShaftMap, ShaftPoint } from './domain';
import { createSeededRandom } from './random';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

export const validateShaftMap = (map: ShaftMap): MapValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (map.points.length < 3)
    errors.push('A shaft requires at least three centreline points.');
  if (map.worldWidth <= 0 || map.worldHeight <= 0)
    errors.push('World dimensions must be positive.');

  for (const [index, point] of map.points.entries()) {
    if (point.width < GENERATOR_CONFIG.minTunnelWidth) {
      errors.push(`Point ${point.id} is narrower than the safe baseline.`);
    }
    if (
      point.x < 0 ||
      point.x > map.worldWidth ||
      point.y < 0 ||
      point.y > map.worldHeight
    ) {
      errors.push(`Point ${point.id} is outside the world bounds.`);
    }

    const previous = map.points[index - 1];
    if (
      previous &&
      Math.abs(point.x - previous.x) > GENERATOR_CONFIG.maxHorizontalShift * 1.5
    ) {
      warnings.push(
        `The turn into ${point.id} may be too abrupt for baseline physics.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
};

type CurveStep = {
  /** Heading delta applied this step (radians; + veers right). */
  curvature: number;
  /** Width bias: -1 narrow, 0 normal, +1 wide. */
  widthBias: number;
};

/**
 * Deterministic shared-challenge generator.
 * Builds visibly twisty but flyable shafts from constrained curve modules
 * (straights, soft sweeps, S-turns, chicanes, narrow/wide sections) while
 * preserving bottom→top order, minimum clearance, and validator compatibility.
 */
export const generateShaftMap = (seed: number, createdAt: number): ShaftMap => {
  const random = createSeededRandom(seed);
  const config = GENERATOR_CONFIG;
  const usableHeight = config.worldHeight - config.verticalMargin * 2;
  const minimumX = config.horizontalMargin;
  const maximumX = config.worldWidth - config.horizontalMargin;
  const stepCount = config.pointCount;
  const steps = planCurveSteps(stepCount - 1, random);

  let x = config.worldWidth / 2;
  let heading = 0;
  let width =
    (config.minTunnelWidth + config.maxTunnelWidth) * 0.5 +
    (random() - 0.5) * 20;
  width = clamp(width, config.minTunnelWidth, config.maxTunnelWidth);

  const points: ShaftPoint[] = [];

  for (let index = 0; index < stepCount; index += 1) {
    const progress = index / (stepCount - 1);
    const y = Math.round(
      config.worldHeight - config.verticalMargin - usableHeight * progress
    );

    if (index > 0) {
      const step = steps[index - 1] ?? { curvature: 0, widthBias: 0 };
      const verticalSpan = usableHeight / (stepCount - 1);

      // Soft curvature with hard clamps so corners stay flyable.
      heading = clamp(heading + step.curvature, -0.52, 0.52);

      // Near side walls, gently push heading back toward centre.
      const edge =
        (x - config.worldWidth / 2) /
        Math.max(1, config.worldWidth / 2 - config.horizontalMargin);
      if (Math.abs(edge) > 0.72) {
        heading -= Math.sign(edge) * 0.08;
        heading = clamp(heading, -0.45, 0.45);
      }

      const rawDx = Math.sin(heading) * verticalSpan * 0.92;
      const dx = clamp(
        rawDx,
        -config.maxHorizontalShift,
        config.maxHorizontalShift
      );
      x = clamp(x + dx, minimumX, maximumX);

      // Bounce heading if we hit a horizontal margin.
      if (x <= minimumX + 2 || x >= maximumX - 2) {
        heading *= -0.55;
      }

      const widthTarget =
        step.widthBias < 0
          ? config.minTunnelWidth + 8
          : step.widthBias > 0
            ? config.maxTunnelWidth - 8
            : (config.minTunnelWidth + config.maxTunnelWidth) * 0.5 +
              (random() - 0.5) * 24;
      width = width + (widthTarget - width) * 0.45;
      width = clamp(width, config.minTunnelWidth, config.maxTunnelWidth);
    }

    points.push({
      id: `point-${index}`,
      x: Math.round(x),
      y,
      width: Math.round(width),
    });
  }

  // Ensure start/end sit near centre for fair spawn/exit framing.
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last)
    throw new Error('Generator configuration must create at least two points.');

  first.x = Math.round(
    first.x * 0.35 + (config.worldWidth / 2) * 0.65
  );
  last.x = Math.round(last.x * 0.4 + (config.worldWidth / 2) * 0.6);
  first.width = Math.max(first.width, config.minTunnelWidth + 20);
  last.width = Math.max(last.width, config.minTunnelWidth + 30);

  return {
    id: `generated-v2-${seed}`,
    version: 1,
    generatorVersion: 2,
    name: 'Current Community Shaft',
    description:
      'A deterministic shared challenge generated from the active four-hour window.',
    source: 'generated',
    seed,
    createdAt,
    worldWidth: config.worldWidth,
    worldHeight: config.worldHeight,
    points,
    start: { x: first.x, y: first.y, rotation: 0 },
    exit: {
      x: last.x,
      y: Math.max(0, last.y - 80),
      width: last.width,
      height: 160,
    },
    rules: { timeLimitMs: 180_000 },
  };
};

/**
 * Pack constrained curve modules into a fixed step budget.
 * All choices are driven by the seeded RNG for cross-client determinism.
 */
function planCurveSteps(
  count: number,
  random: () => number
): CurveStep[] {
  const steps: CurveStep[] = [];
  let remaining = count;

  while (remaining > 0) {
    const block = nextCurveModule(remaining, random);
    for (const step of block) {
      steps.push(step);
      remaining -= 1;
      if (remaining <= 0) break;
    }
  }

  return steps.slice(0, count);
}

function nextCurveModule(
  remaining: number,
  random: () => number
): CurveStep[] {
  const roll = random();

  if (roll < 0.16) {
    // Straight calm
    const length = Math.min(remaining, 1 + Math.floor(random() * 2));
    return Array.from({ length }, () => ({ curvature: 0, widthBias: 0 }));
  }
  if (roll < 0.34) {
    // Soft left sweep
    const length = Math.min(remaining, 2 + Math.floor(random() * 2));
    const mag = -(0.1 + random() * 0.1);
    return Array.from({ length }, () => ({
      curvature: mag,
      widthBias: 0,
    }));
  }
  if (roll < 0.52) {
    // Soft right sweep
    const length = Math.min(remaining, 2 + Math.floor(random() * 2));
    const mag = 0.1 + random() * 0.1;
    return Array.from({ length }, () => ({
      curvature: mag,
      widthBias: 0,
    }));
  }
  if (roll < 0.7) {
    // S-turn
    const length = Math.min(remaining, 4);
    const dir = random() < 0.5 ? 1 : -1;
    const half = Math.ceil(length / 2);
    return Array.from({ length }, (_, i) => ({
      curvature: (i < half ? dir : -dir) * (0.14 + random() * 0.06),
      widthBias: 0,
    }));
  }
  if (roll < 0.84) {
    // Chicane — alternating tight pulses, still under max shift
    const length = Math.min(remaining, 4);
    const dir = random() < 0.5 ? 1 : -1;
    return Array.from({ length }, (_, i) => ({
      curvature: (i % 2 === 0 ? dir : -dir) * (0.16 + random() * 0.06),
      widthBias: -0.35,
    }));
  }
  if (roll < 0.92) {
    // Narrow corridor
    const length = Math.min(remaining, 2);
    return Array.from({ length }, () => ({
      curvature: (random() - 0.5) * 0.08,
      widthBias: -1,
    }));
  }

  // Wide chamber
  const length = Math.min(remaining, 2);
  return Array.from({ length }, () => ({
    curvature: (random() - 0.5) * 0.06,
    widthBias: 1,
  }));
}
