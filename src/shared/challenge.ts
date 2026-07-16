import { CHALLENGE_WINDOW_MS } from './config';
import type { Challenge } from './domain';
import { stableHash } from './random';

export const getChallengeWindow = (timestamp: number): Challenge => {
  const windowIndex = Math.floor(timestamp / CHALLENGE_WINDOW_MS);
  const startsAt = windowIndex * CHALLENGE_WINDOW_MS;
  const seed = stableHash(`steer-it:official:${windowIndex}`);

  return {
    id: `official-${windowIndex}`,
    mapId: `generated-v2-${seed}`,
    seed,
    startsAt,
    endsAt: startsAt + CHALLENGE_WINDOW_MS,
    status: 'active',
    type: 'generated',
  };
};
