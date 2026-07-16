import type { ShaftMap } from './domain';

/**
 * Hand-authored practice shaft for the Phase 3 vertical slice.
 * Centreline points run bottom → top (decreasing Y) with local widths.
 * Dimensions suit compact Reddit webviews (narrow world, tall shaft).
 */
export const HANDCRAFTED_TUNNEL_MAP: ShaftMap = {
  id: 'handcrafted-practice-shaft-v1',
  version: 1,
  name: 'Practice Shaft',
  description:
    'A short hand-authored tunnel for tunnel collision, camera, and touch controls.',
  source: 'official',
  createdAt: 1_700_000_000_000,
  worldWidth: 560,
  worldHeight: 2200,
  points: [
    { id: 'p0', x: 280, y: 2050, width: 300 },
    { id: 'p1', x: 280, y: 1850, width: 280 },
    { id: 'p2', x: 310, y: 1650, width: 270 },
    { id: 'p3', x: 360, y: 1480, width: 260 },
    { id: 'p4', x: 340, y: 1280, width: 250 },
    { id: 'p5', x: 250, y: 1100, width: 260 },
    { id: 'p6', x: 210, y: 920, width: 250 },
    { id: 'p7', x: 250, y: 740, width: 260 },
    { id: 'p8', x: 320, y: 560, width: 270 },
    { id: 'p9', x: 300, y: 380, width: 280 },
    { id: 'p10', x: 280, y: 220, width: 300 },
    { id: 'p11', x: 280, y: 90, width: 320 },
  ],
  start: { x: 280, y: 1980, rotation: 0 },
  exit: { x: 280, y: 40, width: 340, height: 100 },
  rules: {
    fuelLimit: 100,
    timeLimitMs: 180_000,
  },
};
