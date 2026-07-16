import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ApiErrorResponse,
  BootstrapResponse,
  HealthResponse,
} from '../../shared/api';
import { FOUNDATION_VERSION } from '../../shared/config';
import { getChallengeWindow } from '../../shared/challenge';
import { generateShaftMap, validateShaftMap } from '../../shared/map';

export const api = new Hono();

api.get('/health', (c) =>
  c.json<HealthResponse>({
    status: 'ok',
    app: 'steer-it',
    version: FOUNDATION_VERSION,
  })
);

api.get('/bootstrap', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Missing Reddit post context.' },
      400
    );
  }

  try {
    const now = Date.now();
    const challenge = getChallengeWindow(now);
    const map = generateShaftMap(challenge.seed, challenge.startsAt);
    const validation = validateShaftMap(map);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const username = (await reddit.getCurrentUsername()) ?? 'anonymous';

    return c.json<BootstrapResponse>({
      type: 'bootstrap',
      postId,
      username,
      challenge,
      map,
    });
  } catch (error) {
    console.error('Steer It bootstrap failed:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Unable to initialize the current shaft.' },
      500
    );
  }
});
