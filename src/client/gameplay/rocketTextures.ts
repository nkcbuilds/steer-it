import { Scene } from 'phaser';

export const ROCKET_BODY_TEXTURE = 'pixel-v2-rocket-body';
export const ROCKET_NOZZLE_TEXTURE = 'pixel-v2-rocket-nozzle';
export const ROCKET_FLAME_TEXTURE = 'pixel-v2-rocket-flame';
export const CAVERN_EDGE_TEXTURE = 'pixel-v2-cavern-edge';
export const CAVERN_BACKGROUND_TEXTURE = 'pixel-v2-cavern-background';
export const LAUNCH_PLATFORM_TEXTURE = 'pixel-v3-launch-platform';
export const SURFACE_EXIT_TEXTURE = 'pixel-v3-surface-exit';
export const THROTTLE_CONTROL_TEXTURE = 'pixel-v3-throttle-control';
export const RESULTS_PANEL_TEXTURE = 'pixel-v3-results-panel';
export const ROCKET_EXPLOSION_TEXTURE = 'pixel-v4-rocket-explosion';

export type RocketAssetPaths = {
  body: string;
  nozzle: string;
  flame: string;
  cavernEdge: string;
  cavernBackground: string;
  launchPlatform: string;
  surfaceExit: string;
  throttleControl: string;
  resultsPanel: string;
  explosion: string;
};

export const ROCKET_ASSET_PATHS: RocketAssetPaths = {
  body: 'assets/pixel-v2/rocket-body.png',
  nozzle: 'assets/pixel-v2/rocket-nozzle.png',
  flame: 'assets/pixel-v2/rocket-flame.png',
  cavernEdge: 'assets/pixel-v2/cavern-edge.png',
  cavernBackground: 'assets/pixel-v2/cavern-background.png',
  launchPlatform: 'assets/pixel-v3/launch-platform.png',
  surfaceExit: 'assets/pixel-v3/surface-exit.png',
  throttleControl: 'assets/pixel-v3/throttle-control.png',
  resultsPanel: 'assets/pixel-v3/results-panel.png',
  explosion: 'assets/pixel-v4/rocket-explosion-sheet.png',
};

/** Native pixel sizes of production art. */
export const ROCKET_BODY_NATIVE = { width: 60, height: 132 };
export const ROCKET_NOZZLE_NATIVE = { width: 30, height: 50 };
export const ROCKET_FLAME_NATIVE = { width: 30, height: 114 };
export const CAVERN_EDGE_NATIVE = { width: 512, height: 62 };
export const CAVERN_BACKGROUND_NATIVE = { width: 512, height: 910 };

/**
 * Uniform display scale for the modular rocket so it fits the tunnel
 * while keeping body, nozzle, and flame proportions locked.
 */
export const ROCKET_DISPLAY_SCALE = 0.62;

/** Effective on-screen / collision layout sizes after display scale. */
export const ROCKET_BODY_SIZE = {
  width: ROCKET_BODY_NATIVE.width * ROCKET_DISPLAY_SCALE,
  height: ROCKET_BODY_NATIVE.height * ROCKET_DISPLAY_SCALE,
};
export const ROCKET_NOZZLE_SIZE = {
  width: ROCKET_NOZZLE_NATIVE.width * ROCKET_DISPLAY_SCALE,
  height: ROCKET_NOZZLE_NATIVE.height * ROCKET_DISPLAY_SCALE,
};
export const ROCKET_FLAME_SIZE = {
  width: ROCKET_FLAME_NATIVE.width * ROCKET_DISPLAY_SCALE,
  height: ROCKET_FLAME_NATIVE.height * ROCKET_DISPLAY_SCALE,
};

/** Queue production pixel assets on the scene loader. Call from scene `preload`. */
export function preloadGameAssets(scene: Scene): void {
  if (!scene.textures.exists(ROCKET_BODY_TEXTURE)) {
    scene.load.image(ROCKET_BODY_TEXTURE, ROCKET_ASSET_PATHS.body);
  }
  if (!scene.textures.exists(ROCKET_NOZZLE_TEXTURE)) {
    scene.load.image(ROCKET_NOZZLE_TEXTURE, ROCKET_ASSET_PATHS.nozzle);
  }
  if (!scene.textures.exists(ROCKET_FLAME_TEXTURE)) {
    scene.load.image(ROCKET_FLAME_TEXTURE, ROCKET_ASSET_PATHS.flame);
  }
  if (!scene.textures.exists(CAVERN_EDGE_TEXTURE)) {
    scene.load.image(CAVERN_EDGE_TEXTURE, ROCKET_ASSET_PATHS.cavernEdge);
  }
  if (!scene.textures.exists(CAVERN_BACKGROUND_TEXTURE)) {
    scene.load.image(
      CAVERN_BACKGROUND_TEXTURE,
      ROCKET_ASSET_PATHS.cavernBackground
    );
  }
  if (!scene.textures.exists(LAUNCH_PLATFORM_TEXTURE)) {
    scene.load.image(LAUNCH_PLATFORM_TEXTURE, ROCKET_ASSET_PATHS.launchPlatform);
  }
  if (!scene.textures.exists(SURFACE_EXIT_TEXTURE)) {
    scene.load.image(SURFACE_EXIT_TEXTURE, ROCKET_ASSET_PATHS.surfaceExit);
  }
  if (!scene.textures.exists(THROTTLE_CONTROL_TEXTURE)) {
    scene.load.image(THROTTLE_CONTROL_TEXTURE, ROCKET_ASSET_PATHS.throttleControl);
  }
  if (!scene.textures.exists(RESULTS_PANEL_TEXTURE)) {
    scene.load.image(RESULTS_PANEL_TEXTURE, ROCKET_ASSET_PATHS.resultsPanel);
  }
  if (!scene.textures.exists(ROCKET_EXPLOSION_TEXTURE)) {
    scene.load.spritesheet(
      ROCKET_EXPLOSION_TEXTURE,
      ROCKET_ASSET_PATHS.explosion,
      { frameWidth: 384, frameHeight: 512 }
    );
  }
}

/**
 * Ensures rocket textures exist. Prefer preloaded production assets; only
 * generate tiny placeholders if a load failed so the scene can still boot.
 */
export function ensureRocketTextures(scene: Scene): void {
  if (!scene.textures.exists(ROCKET_BODY_TEXTURE)) {
    generateFallbackBody(scene);
  }
  if (!scene.textures.exists(ROCKET_NOZZLE_TEXTURE)) {
    generateFallbackNozzle(scene);
  }
  if (!scene.textures.exists(ROCKET_FLAME_TEXTURE)) {
    generateFallbackFlame(scene);
  }
}

function generateFallbackBody(scene: Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  const w = ROCKET_BODY_NATIVE.width;
  const h = ROCKET_BODY_NATIVE.height;

  g.fillStyle(0xc5c9d0, 1);
  g.fillRect(16, 28, w - 32, h - 48);
  g.fillStyle(0xaeb4bc, 1);
  g.fillTriangle(w / 2, 4, 14, 36, w - 14, 36);
  g.fillStyle(0x3d9be9, 1);
  g.fillCircle(w / 2, 48, 10);
  g.fillStyle(0x8b919a, 1);
  g.fillTriangle(6, h - 20, 18, h - 52, 18, h - 20);
  g.fillTriangle(w - 6, h - 20, w - 18, h - 52, w - 18, h - 20);
  g.fillStyle(0x5c6370, 1);
  g.fillRect(22, h - 22, w - 44, 14);

  g.generateTexture(ROCKET_BODY_TEXTURE, w, h);
  g.destroy();
}

function generateFallbackNozzle(scene: Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  const w = ROCKET_NOZZLE_NATIVE.width;
  const h = ROCKET_NOZZLE_NATIVE.height;

  g.fillStyle(0x6b7280, 1);
  g.fillTriangle(4, 0, w - 4, 0, w / 2 + 6, h);
  g.fillTriangle(4, 0, w - 4, 0, w / 2 - 6, h);
  g.fillStyle(0x4b5563, 1);
  g.fillRect(6, 0, w - 12, 6);

  g.generateTexture(ROCKET_NOZZLE_TEXTURE, w, h);
  g.destroy();
}

function generateFallbackFlame(scene: Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 });
  const w = ROCKET_FLAME_NATIVE.width;
  const h = ROCKET_FLAME_NATIVE.height;

  g.fillStyle(0xff6b1a, 1);
  g.fillTriangle(w / 2, h, 2, 4, w - 2, 4);
  g.fillStyle(0xffc94a, 1);
  g.fillTriangle(w / 2, h - 12, 6, 10, w - 6, 10);
  g.fillStyle(0xffffff, 0.9);
  g.fillTriangle(w / 2, h - 28, 10, 16, w - 10, 16);

  g.generateTexture(ROCKET_FLAME_TEXTURE, w, h);
  g.destroy();
}
