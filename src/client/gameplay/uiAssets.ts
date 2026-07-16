import Phaser, { Scene } from 'phaser';

export const RESULTS_PANEL_TEXTURE = 'pixel-v3-results-panel';
export const THROTTLE_CONTROL_TEXTURE = 'pixel-v3-throttle-control';

export type UiAssetPaths = {
  resultsPanel: string;
  throttleControl: string;
};

export const UI_ASSET_PATHS: UiAssetPaths = {
  resultsPanel: 'assets/pixel-v3/results-panel.png',
  throttleControl: 'assets/pixel-v3/throttle-control.png',
};

/** Native pixel sizes of UI art. */
export const RESULTS_PANEL_NATIVE = { width: 420, height: 524 };
export const THROTTLE_CONTROL_NATIVE = { width: 128, height: 282 };

/**
 * Queue production UI assets on the scene loader.
 * Safe to call from scene `preload` (preferred) or before first use.
 */
export function preloadUiAssets(scene: Scene): void {
  if (!scene.textures.exists(RESULTS_PANEL_TEXTURE)) {
    scene.load.image(RESULTS_PANEL_TEXTURE, UI_ASSET_PATHS.resultsPanel);
  }
  if (!scene.textures.exists(THROTTLE_CONTROL_TEXTURE)) {
    scene.load.image(THROTTLE_CONTROL_TEXTURE, UI_ASSET_PATHS.throttleControl);
  }
}

/**
 * If textures are missing (e.g. TunnelRun only preloads rocket assets),
 * kick a late load and invoke onReady when available.
 */
export function ensureUiAssets(
  scene: Scene,
  onReady?: () => void
): void {
  const needResults = !scene.textures.exists(RESULTS_PANEL_TEXTURE);
  const needThrottle = !scene.textures.exists(THROTTLE_CONTROL_TEXTURE);

  if (!needResults && !needThrottle) {
    onReady?.();
    return;
  }

  if (needResults) {
    scene.load.image(RESULTS_PANEL_TEXTURE, UI_ASSET_PATHS.resultsPanel);
  }
  if (needThrottle) {
    scene.load.image(THROTTLE_CONTROL_TEXTURE, UI_ASSET_PATHS.throttleControl);
  }

  const finish = (): void => {
    onReady?.();
  };
  scene.load.once(Phaser.Loader.Events.COMPLETE, finish);
  if (!scene.load.isLoading()) {
    scene.load.start();
  }
}
