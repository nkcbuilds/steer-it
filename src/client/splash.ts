import { requestExpandedMode } from '@devvit/web/client';
import type { ShaftMap } from '../shared/domain';
import { HANDCRAFTED_TUNNEL_MAP } from '../shared/handcraftedMap';
import { loadClientChallenge } from './challengeClient';

const canvas = document.getElementById('shaft-preview');
const startButton = document.getElementById('start-button');
const mapName = document.getElementById('map-name');
const playCount = document.getElementById('play-count');
const completionCount = document.getElementById('completion-count');
const creatorCard = document.getElementById('creator-card');
const creatorName = document.getElementById('creator-name');

let activeMap: ShaftMap = HANDCRAFTED_TUNNEL_MAP;
const cavernImage = new Image();
cavernImage.src = 'assets/pixel-v2/cavern-background.png';
cavernImage.addEventListener('load', () => drawPreview());
const edgeImage = loadPreviewImage('assets/pixel-v2/cavern-edge.png');
const platformImage = loadPreviewImage('assets/pixel-v3/launch-platform.png');
const surfaceImage = loadPreviewImage('assets/pixel-v3/surface-exit.png');
const rocketImage = loadPreviewImage('assets/pixel-v2/rocket-body.png');

const initialize = async (): Promise<void> => {
  const shared = await loadClientChallenge();
  if (shared) {
    activeMap = shared.map;
    if (playCount) playCount.textContent = formatCount(shared.leaderboard.attempts);
    if (completionCount) {
      completionCount.textContent = `${formatCount(shared.leaderboard.completions)} ESCAPES`;
    }
  } else {
    if (playCount) playCount.textContent = 'PRACTICE';
    if (completionCount) completionCount.textContent = 'LOCAL FLIGHT';
  }

  if (mapName) mapName.textContent = activeMap.name;
  const showCreator =
    activeMap.source === 'community' &&
    typeof activeMap.creatorUsername === 'string' &&
    activeMap.creatorUsername.length > 0;
  if (creatorCard) creatorCard.hidden = !showCreator;
  if (creatorName && showCreator) {
    creatorName.textContent = `u/${activeMap.creatorUsername}`;
  }
  drawPreview();
};

startButton?.addEventListener('click', (event) =>
  requestExpandedMode(event, 'game')
);

if (canvas instanceof HTMLCanvasElement) {
  new ResizeObserver(() => drawPreview()).observe(canvas);
}

void initialize();

function drawPreview(): void {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;

  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width * pixelRatio));
  const height = Math.max(1, Math.round(bounds.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingEnabled = false;

  drawCavernBackground(context, width, height);
  const geometry = previewGeometry(activeMap, width, height);
  drawRockMass(context, geometry.left, width, height, true);
  drawRockMass(context, geometry.right, width, height, false);
  drawTexturedWall(context, geometry.left, false, pixelRatio);
  drawTexturedWall(context, geometry.right, true, pixelRatio);
  drawStartAndExit(context, geometry, width, height);
}

function drawCavernBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  context.fillStyle = '#070b12';
  context.fillRect(0, 0, width, height);
  if (cavernImage.complete && cavernImage.naturalWidth > 0) {
    const scale = Math.max(width / cavernImage.width, height / cavernImage.height);
    const drawWidth = cavernImage.width * scale;
    const drawHeight = cavernImage.height * scale;
    context.globalAlpha = 0.92;
    context.drawImage(
      cavernImage,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    context.globalAlpha = 1;
  }
}

type PreviewPoint = { x: number; y: number };
type PreviewGeometry = {
  left: PreviewPoint[];
  right: PreviewPoint[];
};

function previewGeometry(
  map: ShaftMap,
  width: number,
  height: number
): PreviewGeometry {
  // Preserve authored order (launch -> surface). TunnelBuilder uses this same
  // order, so the card is a scaled render of the playable geometry.
  const ordered = [...map.points];
  const horizontalPadding = width * 0.08;
  const top = height * 0.11;
  const bottom = height * 0.94;
  const usableWidth = width - horizontalPadding * 2;
  const usableHeight = bottom - top;

  const left: PreviewPoint[] = [];
  const right: PreviewPoint[] = [];
  const sampled = sampleMapPoints(ordered);
  for (let index = 0; index < sampled.length; index += 1) {
    const point = sampled[index];
    if (!point) continue;
    const before = sampled[Math.max(0, index - 1)] ?? point;
    const after = sampled[Math.min(sampled.length - 1, index + 1)] ?? point;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = dy / length;
    const normalY = -dx / length;
    const halfWidth = point.width * 0.5;
    const toScreen = (worldX: number, worldY: number): PreviewPoint => ({
      x: horizontalPadding + (worldX / map.worldWidth) * usableWidth,
      y: top + (worldY / map.worldHeight) * usableHeight,
    });
    left.push(
      toScreen(point.x + normalX * halfWidth, point.y + normalY * halfWidth)
    );
    right.push(
      toScreen(point.x - normalX * halfWidth, point.y - normalY * halfWidth)
    );
  }
  return { left, right };
}

function drawRockMass(
  context: CanvasRenderingContext2D,
  wall: PreviewPoint[],
  width: number,
  height: number,
  leftSide: boolean
): void {
  if (wall.length === 0) return;
  context.beginPath();
  context.moveTo(leftSide ? 0 : width, 0);
  for (const point of wall) context.lineTo(point.x, point.y);
  context.lineTo(leftSide ? 0 : width, height);
  context.closePath();
  context.fillStyle = '#0b0c14';
  context.fill();
}

function drawTexturedWall(
  context: CanvasRenderingContext2D,
  wall: PreviewPoint[],
  flip: boolean,
  pixelRatio: number
): void {
  if (wall.length < 2 || !edgeImage.complete || edgeImage.naturalWidth < 1) return;
  const moduleLength = 76 * pixelRatio;
  const moduleThickness = 18 * pixelRatio;
  for (let index = 1; index < wall.length; index += 1) {
    const from = wall[index - 1];
    const to = wall[index];
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / (moduleLength * 0.72)));
    const angle = Math.atan2(dy, dx);
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      context.save();
      context.translate(from.x + dx * t, from.y + dy * t);
      context.rotate(angle);
      if (flip) context.scale(1, -1);
      context.drawImage(
        edgeImage,
        -moduleLength / 2,
        -moduleThickness / 2,
        moduleLength,
        moduleThickness
      );
      context.restore();
    }
  }
}

function drawStartAndExit(
  context: CanvasRenderingContext2D,
  geometry: PreviewGeometry,
  width: number,
  height: number
): void {
  const leftStart = geometry.left[0];
  const rightStart = geometry.right[0];
  const leftExit = geometry.left[geometry.left.length - 1];
  const rightExit = geometry.right[geometry.right.length - 1];
  if (!leftExit || !rightExit || !leftStart || !rightStart) return;

  const exitX = (leftExit.x + rightExit.x) / 2;
  const exitGlow = context.createRadialGradient(exitX, 0, 0, exitX, 0, width * 0.3);
  exitGlow.addColorStop(0, '#8edfffcc');
  exitGlow.addColorStop(0.35, '#397f9f77');
  exitGlow.addColorStop(1, '#08101a00');
  context.fillStyle = exitGlow;
  context.fillRect(0, 0, width, height * 0.36);

  const startX = (leftStart.x + rightStart.x) / 2;
  if (surfaceImage.complete && surfaceImage.naturalWidth > 0) {
    context.drawImage(surfaceImage, exitX - width * 0.22, -height * 0.05, width * 0.44, height * 0.2);
  }
  if (platformImage.complete && platformImage.naturalWidth > 0) {
    context.drawImage(platformImage, startX - width * 0.25, height * 0.82, width * 0.5, height * 0.16);
  }
  if (rocketImage.complete && rocketImage.naturalWidth > 0) {
    const rocketHeight = height * 0.16;
    const rocketWidth = rocketHeight * (rocketImage.width / rocketImage.height);
    context.drawImage(rocketImage, startX - rocketWidth / 2, height * 0.73, rocketWidth, rocketHeight);
  }
}

function sampleMapPoints(points: ShaftMap['points']): ShaftMap['points'] {
  const sampled: ShaftMap['points'] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const steps = 5;
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      sampled.push({
        id: `${from.id}-${to.id}-${step}`,
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        width: from.width + (to.width - from.width) * t,
      });
    }
  }
  return sampled.length > 0 ? sampled : points;
}

function loadPreviewImage(path: string): HTMLImageElement {
  const image = new Image();
  image.src = path;
  image.addEventListener('load', () => drawPreview());
  return image;
}

function formatCount(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}
