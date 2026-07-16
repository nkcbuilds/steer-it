import Phaser, { GameObjects, Scene } from 'phaser';
import type { ShaftMap, Vector2 } from '../../shared/domain';
import {
  CAVERN_BACKGROUND_TEXTURE,
  CAVERN_EDGE_NATIVE,
  CAVERN_EDGE_TEXTURE,
  LAUNCH_PLATFORM_TEXTURE,
  SURFACE_EXIT_TEXTURE,
} from './rocketTextures';

export type TunnelSample = {
  centre: Vector2;
  left: Vector2;
  right: Vector2;
  tangent: Vector2;
  /** Unit normal pointing toward the left wall relative to travel (bottom→top). */
  normal: Vector2;
  width: number;
};

export type WallSegment = {
  x: number;
  y: number;
  length: number;
  thickness: number;
  /** Radians, Matter/body angle along the wall edge. */
  angle: number;
  side: 'left' | 'right';
};

export type TunnelBuildOptions = {
  /** Arc-length spacing between centreline samples (pixels). */
  sampleSpacing?: number;
  /** Thickness of static wall collision rectangles. */
  wallThickness?: number;
  /** Extra length per segment so neighbors overlap for reliable collision. */
  segmentOverlap?: number;
  /** When true, draw editor-friendly overlays (no centreline in play). */
  editorPreview?: boolean;
};

export type TunnelGeometry = {
  map: ShaftMap;
  samples: TunnelSample[];
  leftWall: Vector2[];
  rightWall: Vector2[];
  wallSegments: WallSegment[];
  sampleSpacing: number;
  wallThickness: number;
};

export type BuiltTunnel = {
  geometry: TunnelGeometry;
  wallBodies: Phaser.Types.Physics.Matter.MatterBody[];
  exitBody: Phaser.Types.Physics.Matter.MatterBody;
  graphics: GameObjects.Graphics;
  background: GameObjects.TileSprite | undefined;
  edgeLayer: GameObjects.Container;
  exitBeacon: GameObjects.Container;
  launchPlatform: GameObjects.Image | undefined;
  surfaceExit: GameObjects.Image | undefined;
  setParallax: (scrollX: number, scrollY: number) => void;
  destroy: () => void;
};

const DEFAULT_SAMPLE_SPACING = 28;
const DEFAULT_WALL_THICKNESS = 22;
const DEFAULT_SEGMENT_OVERLAP = 10;

/** Visual scale of the modular rock-edge strip (512×62 native). */
const EDGE_STRIP_SCALE = 0.38;
/** Arc-length step between overlapping edge modules. */
const EDGE_MODULE_STEP = 72;
const EDGE_STRIP_LENGTH = CAVERN_EDGE_NATIVE.width * EDGE_STRIP_SCALE;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/**
 * Converts a ShaftMap centreline into matched render samples and overlapping
 * static Matter wall rectangles. Sampling is linear along the polyline only —
 * no spline interpolation that could overshoot the authored path.
 */
export class TunnelBuilder {
  static buildGeometry(
    map: ShaftMap,
    options: TunnelBuildOptions = {}
  ): TunnelGeometry {
    const sampleSpacing = options.sampleSpacing ?? DEFAULT_SAMPLE_SPACING;
    const wallThickness = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
    const segmentOverlap = options.segmentOverlap ?? DEFAULT_SEGMENT_OVERLAP;

    const samples = sampleCentreline(map, sampleSpacing);
    const leftWall = samples.map((sample) => sample.left);
    const rightWall = samples.map((sample) => sample.right);
    const wallSegments = [
      ...buildWallSegments(leftWall, wallThickness, segmentOverlap, 'left'),
      ...buildWallSegments(rightWall, wallThickness, segmentOverlap, 'right'),
    ];

    return {
      map,
      samples,
      leftWall,
      rightWall,
      wallSegments,
      sampleSpacing,
      wallThickness,
    };
  }

  /**
   * Creates Matter static wall segments + exit sensor and draws the cavern.
   * Render paths and collision segments share the same sample set.
   */
  static createInScene(
    scene: Scene,
    map: ShaftMap,
    options: TunnelBuildOptions = {}
  ): BuiltTunnel {
    const geometry = TunnelBuilder.buildGeometry(map, options);
    const wallBodies: Phaser.Types.Physics.Matter.MatterBody[] = [];

    for (const segment of geometry.wallSegments) {
      const body = scene.matter.add.rectangle(
        segment.x,
        segment.y,
        segment.length,
        segment.thickness,
        {
          isStatic: true,
          angle: segment.angle,
          label: 'tunnel-wall',
          friction: 0.35,
          restitution: 0.02,
        }
      );
      wallBodies.push(body);
    }

    const exitBody = scene.matter.add.rectangle(
      map.exit.x,
      map.exit.y,
      map.exit.width,
      map.exit.height,
      {
        isStatic: true,
        isSensor: true,
        label: 'exit',
      }
    );

    // A real bottom closes the shaft below the launch deck. It shares the wall
    // label so the normal crash path handles impacts consistently.
    const launchFloor = scene.matter.add.rectangle(
      map.worldWidth / 2,
      map.start.y + 90,
      map.worldWidth,
      84,
      {
        isStatic: true,
        label: 'tunnel-wall',
        friction: 0.8,
        restitution: 0,
      }
    );
    wallBodies.push(launchFloor);

    const background = createParallaxBackground(scene, map);
    const graphics = scene.add.graphics().setDepth(1);
    TunnelBuilder.drawPreview(graphics, geometry, {
      editorPreview: options.editorPreview ?? false,
    });

    const edgeLayer = scene.add.container(0, 0).setDepth(2);
    placeEdgeModules(scene, edgeLayer, geometry.leftWall, 'left');
    placeEdgeModules(scene, edgeLayer, geometry.rightWall, 'right');

    const launchPlatform = createLaunchPlatform(scene, map);
    const surfaceExit = createSurfaceExit(scene, map);
    const exitBeacon = createExitBeacon(scene, map);

    return {
      geometry,
      wallBodies,
      exitBody,
      graphics,
      background,
      edgeLayer,
      exitBeacon,
      launchPlatform,
      surfaceExit,
      setParallax: (scrollX: number, scrollY: number) => {
        if (!background) return;
        background.tilePositionX = scrollX * 0.35;
        background.tilePositionY = scrollY * 0.45;
      },
      destroy: () => {
        for (const body of wallBodies) {
          scene.matter.world.remove(body);
        }
        scene.matter.world.remove(exitBody);
        graphics.destroy();
        background?.destroy();
        edgeLayer.destroy(true);
        exitBeacon.destroy(true);
        launchPlatform?.destroy();
        surfaceExit?.destroy();
      },
    };
  }

  /** Draw the tunnel void/walls/start/exit from shared geometry (editor + play). */
  static drawPreview(
    graphics: GameObjects.Graphics,
    geometry: TunnelGeometry,
    options: { editorPreview?: boolean } = {}
  ): void {
    drawTunnel(graphics, geometry, options.editorPreview === true);
  }
}

function sampleCentreline(
  map: ShaftMap,
  sampleSpacing: number
): TunnelSample[] {
  const points = map.points;
  if (points.length < 2) {
    throw new Error('TunnelBuilder requires at least two centreline points.');
  }

  type PolyVertex = { x: number; y: number; width: number };
  const vertices: PolyVertex[] = points.map((point) => ({
    x: point.x,
    y: point.y,
    width: point.width,
  }));

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const a = vertices[index];
    const b = vertices[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    segmentLengths.push(length);
    totalLength += length;
  }

  const spacing = Math.max(8, sampleSpacing);
  const sampleCount = Math.max(2, Math.ceil(totalLength / spacing) + 1);
  const raw: Array<{ x: number; y: number; width: number }> = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const distance = (totalLength * i) / (sampleCount - 1);
    raw.push(pointAtDistance(vertices, segmentLengths, distance));
  }

  // Guarantee exact start/end control points.
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (first) raw[0] = { x: first.x, y: first.y, width: first.width };
  if (last) raw[raw.length - 1] = { x: last.x, y: last.y, width: last.width };

  const samples: TunnelSample[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const current = raw[i];
    if (!current) continue;

    const prev = raw[Math.max(0, i - 1)] ?? current;
    const next = raw[Math.min(raw.length - 1, i + 1)] ?? current;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty);
    if (tLen < 1e-6) {
      tx = 0;
      ty = -1;
    } else {
      tx /= tLen;
      ty /= tLen;
    }

    // With screen Y down, travel is generally -Y. Clockwise normal of tangent
    // points to the geometric left relative to travel direction.
    const nx = ty;
    const ny = -tx;
    const halfWidth = current.width * 0.5;

    samples.push({
      centre: { x: current.x, y: current.y },
      left: { x: current.x + nx * halfWidth, y: current.y + ny * halfWidth },
      right: { x: current.x - nx * halfWidth, y: current.y - ny * halfWidth },
      tangent: { x: tx, y: ty },
      normal: { x: nx, y: ny },
      width: current.width,
    });
  }

  return samples;
}

function pointAtDistance(
  vertices: Array<{ x: number; y: number; width: number }>,
  segmentLengths: number[],
  distance: number
): { x: number; y: number; width: number } {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0 };
  }
  if (distance <= 0) {
    const first = vertices[0];
    return first
      ? { x: first.x, y: first.y, width: first.width }
      : { x: 0, y: 0, width: 0 };
  }

  let remaining = distance;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index] ?? 0;
    const a = vertices[index];
    const b = vertices[index + 1];
    if (!a || !b) continue;

    if (remaining <= length || index === segmentLengths.length - 1) {
      const t = length <= 1e-6 ? 0 : clamp(remaining / length, 0, 1);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        width: a.width + (b.width - a.width) * t,
      };
    }
    remaining -= length;
  }

  const last = vertices[vertices.length - 1];
  return last
    ? { x: last.x, y: last.y, width: last.width }
    : { x: 0, y: 0, width: 0 };
}

function buildWallSegments(
  wallPoints: Vector2[],
  thickness: number,
  overlap: number,
  side: 'left' | 'right'
): WallSegment[] {
  const segments: WallSegment[] = [];
  for (let index = 0; index < wallPoints.length - 1; index += 1) {
    const a = wallPoints[index];
    const b = wallPoints[index + 1];
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;

    segments.push({
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
      length: length + overlap,
      thickness,
      angle: Math.atan2(dy, dx),
      side,
    });
  }
  return segments;
}

function createParallaxBackground(
  scene: Scene,
  map: ShaftMap
): GameObjects.TileSprite | undefined {
  if (!scene.textures.exists(CAVERN_BACKGROUND_TEXTURE)) {
    return undefined;
  }

  // Fixed to the camera so tile offsets drive the parallax motion.
  const bg = scene.add
    .tileSprite(
      0,
      0,
      Math.ceil(map.worldWidth * 1.2),
      Math.ceil(map.worldHeight * 1.2),
      CAVERN_BACKGROUND_TEXTURE
    )
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(0)
    .setAlpha(0.92)
    .setTint(0xb8c4d4);

  return bg;
}

function placeEdgeModules(
  scene: Scene,
  layer: GameObjects.Container,
  wallPoints: Vector2[],
  side: 'left' | 'right'
): void {
  if (!scene.textures.exists(CAVERN_EDGE_TEXTURE) || wallPoints.length < 2) {
    return;
  }

  let traveled = 0;
  let nextPlace = EDGE_MODULE_STEP * 0.35;

  for (let index = 0; index < wallPoints.length - 1; index += 1) {
    const a = wallPoints[index];
    const b = wallPoints[index + 1];
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;
    // Perpendicular of the wall segment (screen coords, Y down).
    const px = -uy;
    const py = ux;

    while (nextPlace - traveled <= segLen + 0.01) {
      const distOnSeg = nextPlace - traveled;
      const x = a.x + ux * distOnSeg;
      const y = a.y + uy * distOnSeg;
      const tangentAngle = Math.atan2(uy, ux);

      // Lit rocky lip is the bottom of the strip texture. Origin bias + flipY
      // keep that playable edge facing into the tunnel on both walls.
      const module = scene.add
        .image(x, y, CAVERN_EDGE_TEXTURE)
        .setScale(EDGE_STRIP_SCALE)
        .setOrigin(0.5, 0.72)
        .setRotation(tangentAngle)
        .setFlipY(side === 'right')
        .setAlpha(0.98);

      // Nudge into solid rock so collision geometry stays on the void lip.
      const outward = side === 'left' ? 1 : -1;
      module.setPosition(x + px * 5 * outward, y + py * 5 * outward);

      layer.add(module);
      nextPlace += EDGE_MODULE_STEP * (0.88 + ((index * 17) % 5) * 0.025);
    }

    traveled += segLen;
  }

  void EDGE_STRIP_LENGTH;
}

function createExitBeacon(
  scene: Scene,
  map: ShaftMap
): GameObjects.Container {
  return scene.add.container(map.exit.x, map.exit.y).setDepth(3);
}

function createLaunchPlatform(
  scene: Scene,
  map: ShaftMap
): GameObjects.Image | undefined {
  if (!scene.textures.exists(LAUNCH_PLATFORM_TEXTURE)) return undefined;
  const image = scene.add
    .image(map.start.x, map.start.y + 38, LAUNCH_PLATFORM_TEXTURE)
    .setOrigin(0.5)
    .setDepth(4);
  const targetWidth = Math.min(map.worldWidth * 0.82, 690);
  image.setScale(targetWidth / image.width);
  return image;
}

function createSurfaceExit(
  scene: Scene,
  map: ShaftMap
): GameObjects.Image | undefined {
  if (!scene.textures.exists(SURFACE_EXIT_TEXTURE)) return undefined;
  const image = scene.add
    .image(map.exit.x, 0, SURFACE_EXIT_TEXTURE)
    .setOrigin(0.5, 0)
    .setDepth(3);
  image.setScale(map.worldWidth / image.width);
  return image;
}

function drawTunnel(
  graphics: GameObjects.Graphics,
  geometry: TunnelGeometry,
  editorPreview: boolean
): void {
  const { map, leftWall, rightWall } = geometry;

  graphics.clear();

  // Solid rock on both sides only — the shaft void stays clear so the
  // parallax cavern texture (and camera backdrop) read through the playable path.
  graphics.fillStyle(0x171c28, 1);
  fillLeftRock(graphics, leftWall, map);
  fillRightRock(graphics, rightWall, map);

  // Cap rock above the exit and below the start so the world edges are solid.
  if (leftWall.length >= 2 && rightWall.length >= 2) {
    const topL = leftWall[leftWall.length - 1];
    const topR = rightWall[rightWall.length - 1];
    const botL = leftWall[0];
    const botR = rightWall[0];
    if (topL && topR) {
      graphics.fillStyle(0x141924, 1);
      graphics.fillRect(0, 0, map.worldWidth, Math.max(0, Math.min(topL.y, topR.y)));
    }
    if (botL && botR) {
      const y0 = Math.max(botL.y, botR.y);
      graphics.fillStyle(0x141924, 1);
      graphics.fillRect(0, y0, map.worldWidth, Math.max(0, map.worldHeight - y0));
    }
  }

  if (leftWall.length >= 2 && rightWall.length >= 2) {
    const firstLeft = leftWall[0];
    // The rock masses are drawn only outside the centre corridor, so the
    // generated background remains visible through the playable shaft.
    // A translucent veil separates the flight lane from the rock edge.
    graphics.fillStyle(0x070a10, 0.3);
    graphics.beginPath();
    if (firstLeft) {
      graphics.moveTo(firstLeft.x, firstLeft.y);
      for (let i = 1; i < leftWall.length; i += 1) {
        const point = leftWall[i];
        if (point) graphics.lineTo(point.x, point.y);
      }
      for (let i = rightWall.length - 1; i >= 0; i -= 1) {
        const point = rightWall[i];
        if (point) graphics.lineTo(point.x, point.y);
      }
      graphics.closePath();
      graphics.fillPath();
    }

    // Soft inner shadow just inside the walls.
    graphics.lineStyle(12, 0x04060a, 0.5);
    strokePolyline(graphics, leftWall);
    strokePolyline(graphics, rightWall);

    // Warm playable-edge highlight (matches modular rock lip).
    graphics.lineStyle(2, 0xc9a26b, 0.6);
    strokePolyline(graphics, leftWall);
    strokePolyline(graphics, rightWall);

    // Thin cool rim for depth separation.
    graphics.lineStyle(1, 0x6b7c96, 0.4);
    strokePolyline(graphics, leftWall);
    strokePolyline(graphics, rightWall);
  }

  // Editor keeps a faint centreline for node editing; play mode does not.
  if (editorPreview) {
    graphics.fillStyle(0xff9f1c, 0.35);
    graphics.fillRect(map.start.x - 42, map.start.y + 18, 84, 10);
    graphics.lineStyle(2, 0xffe66d, 0.7);
    graphics.strokeRect(
      map.exit.x - map.exit.width / 2,
      map.exit.y - map.exit.height / 2,
      map.exit.width,
      map.exit.height
    );
    graphics.lineStyle(1, 0x80ed99, 0.35);
    strokePolyline(
      graphics,
      geometry.samples.map((sample) => sample.centre)
    );
  }
}

function fillLeftRock(
  graphics: GameObjects.Graphics,
  leftWall: Vector2[],
  map: ShaftMap
): void {
  if (leftWall.length < 2) return;
  const top = leftWall[leftWall.length - 1];
  const bottom = leftWall[0];
  if (!top || !bottom) return;

  graphics.beginPath();
  graphics.moveTo(0, 0);
  graphics.lineTo(top.x, 0);
  graphics.lineTo(top.x, top.y);
  for (let i = leftWall.length - 2; i >= 0; i -= 1) {
    const point = leftWall[i];
    if (point) graphics.lineTo(point.x, point.y);
  }
  graphics.lineTo(bottom.x, map.worldHeight);
  graphics.lineTo(0, map.worldHeight);
  graphics.closePath();
  graphics.fillPath();
}

function fillRightRock(
  graphics: GameObjects.Graphics,
  rightWall: Vector2[],
  map: ShaftMap
): void {
  if (rightWall.length < 2) return;
  const top = rightWall[rightWall.length - 1];
  const bottom = rightWall[0];
  if (!top || !bottom) return;

  graphics.beginPath();
  graphics.moveTo(map.worldWidth, 0);
  graphics.lineTo(top.x, 0);
  graphics.lineTo(top.x, top.y);
  for (let i = rightWall.length - 2; i >= 0; i -= 1) {
    const point = rightWall[i];
    if (point) graphics.lineTo(point.x, point.y);
  }
  graphics.lineTo(bottom.x, map.worldHeight);
  graphics.lineTo(map.worldWidth, map.worldHeight);
  graphics.closePath();
  graphics.fillPath();
}

function strokePolyline(
  graphics: GameObjects.Graphics,
  points: Vector2[]
): void {
  if (points.length < 2) return;
  const first = points[0];
  if (!first) return;
  graphics.beginPath();
  graphics.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (point) graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();
}
