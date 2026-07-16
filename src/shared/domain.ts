export type Vector2 = {
  x: number;
  y: number;
};

export type RunState = 'ready' | 'running' | 'crashed' | 'completed' | 'paused';

export type MapSource = 'official' | 'generated' | 'community';

export type ShaftPoint = Vector2 & {
  id: string;
  width: number;
};

export type ShaftMap = {
  id: string;
  version: number;
  generatorVersion?: number | undefined;
  name: string;
  description?: string | undefined;
  creatorId?: string | undefined;
  creatorUsername?: string | undefined;
  source: MapSource;
  seed?: number | undefined;
  createdAt: number;
  worldWidth: number;
  worldHeight: number;
  points: ShaftPoint[];
  start: Vector2 & { rotation: number };
  exit: Vector2 & { width: number; height: number };
  rules: {
    fuelLimit?: number | undefined;
    timeLimitMs?: number | undefined;
  };
};

export type Challenge = {
  id: string;
  mapId: string;
  seed: number;
  startsAt: number;
  endsAt: number;
  status: 'active';
  type: 'generated';
};

export type RunResult = {
  mapId: string;
  challengeId: string;
  completed: boolean;
  durationMs?: number;
  fuelUsed: number;
  createdAt: number;
  clientRunId: string;
};

export type MapValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};
