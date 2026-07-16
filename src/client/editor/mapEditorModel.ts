import { GENERATOR_CONFIG } from '../../shared/config';
import type { MapValidationResult, ShaftMap, ShaftPoint } from '../../shared/domain';
import { validateShaftMap } from '../../shared/map';

const MIN_WIDTH = GENERATOR_CONFIG.minTunnelWidth;
const MAX_WIDTH = GENERATOR_CONFIG.maxTunnelWidth;
const MIN_POINT_GAP = 40;

export type EditorMapSnapshot = {
  map: ShaftMap;
  validation: MapValidationResult;
  selectedIndex: number;
};

export const cloneShaftMap = (map: ShaftMap): ShaftMap => ({
  ...map,
  points: map.points.map((point) => ({ ...point })),
  start: { ...map.start },
  exit: { ...map.exit },
  rules: { ...map.rules },
});

/**
 * Seed an editable draft from any ShaftMap (practice, shared challenge, prior draft).
 * Marks source as community for local authoring only — no publish path yet.
 */
export const createEditableDraft = (source: ShaftMap): ShaftMap => {
  const draft = cloneShaftMap(source);
  draft.points = draft.points.map((point) => {
    const width = clamp(point.width, MIN_WIDTH, MAX_WIDTH);
    return {
      ...point,
      width,
      x: clamp(point.x, width * 0.5, draft.worldWidth - width * 0.5),
    };
  });
  draft.id = `draft-${Date.now()}`;
  draft.name = source.name.startsWith('Draft:')
    ? source.name
    : `Draft: ${source.name}`;
  draft.source = 'community';
  draft.createdAt = Date.now();
  draft.generatorVersion = undefined;
  draft.seed = undefined;
  return syncStartAndExit(draft);
};

export const syncStartAndExit = (map: ShaftMap): ShaftMap => {
  const first = map.points[0];
  const last = map.points[map.points.length - 1];
  if (!first || !last) return map;

  // Place start on the centreline between the first two nodes (inside the shaft).
  let startY = first.y;
  if (map.points.length > 1) {
    const second = map.points[1];
    if (second) {
      startY = first.y + (second.y - first.y) * 0.25;
    }
  }
  map.start = {
    x: first.x,
    y: startY,
    rotation: 0,
  };

  map.exit = {
    x: last.x,
    y: Math.max(0, last.y - 50),
    width: Math.max(MIN_WIDTH, last.width + 20),
    height: 100,
  };
  return map;
};

export const validateDraft = (map: ShaftMap): MapValidationResult =>
  validateShaftMap(map);

export const isEndpointIndex = (map: ShaftMap, index: number): boolean =>
  index === 0 || index === map.points.length - 1;

export const movePoint = (
  map: ShaftMap,
  index: number,
  worldX: number,
  worldY: number
): ShaftMap => {
  const point = map.points[index];
  if (!point) return map;

  const halfWidth = point.width * 0.5;
  const minX = halfWidth;
  const maxX = map.worldWidth - halfWidth;
  const nextX = clamp(worldX, minX, maxX);
  let nextY: number;

  if (index === 0) {
    // The launch shaft stays fixed; the last node is movable and is always
    // synchronized to the surface opening.
    nextY = point.y;
  } else {
    nextY = clamp(worldY, 8, map.worldHeight - 8);
  }

  point.x = Math.round(nextX);
  point.y = Math.round(nextY);
  return syncStartAndExit(map);
};

export const addPointBetween = (
  map: ShaftMap,
  segmentIndex: number
): { map: ShaftMap; newIndex: number } | undefined => {
  // segmentIndex is the lower index of the segment (i → i+1).
  if (segmentIndex < 0 || segmentIndex >= map.points.length - 1) {
    return undefined;
  }
  const a = map.points[segmentIndex];
  const b = map.points[segmentIndex + 1];
  if (!a || !b) return undefined;

  const midY = (a.y + b.y) * 0.5;
  if (a.y - midY < MIN_POINT_GAP * 0.5 || midY - b.y < MIN_POINT_GAP * 0.5) {
    return undefined;
  }

  const newPoint: ShaftPoint = {
    id: `point-${Date.now()}-${segmentIndex}`,
    x: Math.round((a.x + b.x) * 0.5),
    y: Math.round(midY),
    width: Math.round((a.width + b.width) * 0.5),
  };

  map.points.splice(segmentIndex + 1, 0, newPoint);
  syncStartAndExit(map);
  return { map, newIndex: segmentIndex + 1 };
};

export const deletePoint = (
  map: ShaftMap,
  index: number
): ShaftMap | undefined => {
  if (isEndpointIndex(map, index)) return undefined;
  if (map.points.length <= 3) return undefined;
  map.points.splice(index, 1);
  return syncStartAndExit(map);
};

export const adjustPointWidth = (
  map: ShaftMap,
  index: number,
  delta: number
): ShaftMap => {
  const point = map.points[index];
  if (!point) return map;

  const nextWidth = clamp(point.width + delta, MIN_WIDTH, MAX_WIDTH);
  point.width = Math.round(nextWidth);

  // Keep centre far enough from world edges for the new half-width.
  const half = point.width * 0.5;
  point.x = clamp(point.x, half, map.worldWidth - half);
  return syncStartAndExit(map);
};

export const setPointWidth = (
  map: ShaftMap,
  index: number,
  width: number
): ShaftMap => {
  const point = map.points[index];
  if (!point) return map;
  const nextWidth = clamp(width, MIN_WIDTH, MAX_WIDTH);
  return adjustPointWidth(
    map,
    index,
    nextWidth - point.width
  );
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);
