import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

const pointSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
});

const mapSchema = z.object({
  id: z.string(),
  version: z.number(),
  generatorVersion: z.number().optional(),
  name: z.string(),
  description: z.string().optional(),
  creatorId: z.string().optional(),
  creatorUsername: z.string().optional(),
  source: z.enum(['official', 'generated', 'community']),
  seed: z.number().optional(),
  createdAt: z.number(),
  worldWidth: z.number(),
  worldHeight: z.number(),
  points: z.array(pointSchema),
  start: z.object({
    x: z.number(),
    y: z.number(),
    rotation: z.number(),
  }),
  exit: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  rules: z.object({
    fuelLimit: z.number().optional(),
    timeLimitMs: z.number().optional(),
  }),
});

const challengeSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  seed: z.number(),
  startsAt: z.number(),
  endsAt: z.number(),
  status: z.literal('active'),
  type: z.literal('generated'),
});

const leaderboardSchema = z.object({
  challengeId: z.string(),
  attempts: z.number(),
  completions: z.number(),
  personalBestMs: z.number().optional(),
  entries: z.array(
    z.object({
      rank: z.number(),
      userId: z.string(),
      username: z.string(),
      durationMs: z.number(),
    })
  ),
});

const currentChallengeSchema = z.object({
  challenge: challengeSchema,
  map: mapSchema,
  leaderboard: leaderboardSchema,
});

const submitResultSchema = z.object({
  accepted: z.literal(true),
  isPersonalBest: z.boolean(),
  leaderboard: leaderboardSchema,
});

export type ClientChallenge = z.infer<typeof currentChallengeSchema>;
export type ClientLeaderboard = z.infer<typeof leaderboardSchema>;

let bootstrap: ClientChallenge | undefined;

const client = createTRPCUntypedClient<AnyRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});

export const loadClientChallenge = async (): Promise<ClientChallenge | undefined> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await client.query('currentChallenge', undefined, {
      signal: controller.signal,
    });
    bootstrap = currentChallengeSchema.parse(response);
    return bootstrap;
  } catch (error) {
    console.warn('Shared challenge unavailable; using local practice map.', error);
    return undefined;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const getClientChallenge = (): ClientChallenge | undefined => bootstrap;

export const beginSharedAttempt = async (input: {
  challengeId: string;
  mapId: string;
  clientRunId: string;
}): Promise<boolean> => {
  try {
    await client.mutation('beginAttempt', input);
    return true;
  } catch (error) {
    console.warn('Unable to register shared attempt.', error);
    return false;
  }
};

export const submitSharedResult = async (input: {
  challengeId: string;
  mapId: string;
  clientRunId: string;
  durationMs: number;
  fuelUsed: number;
}): Promise<ClientLeaderboard | undefined> => {
  try {
    const response = await client.mutation('submitResult', input);
    return submitResultSchema.parse(response).leaderboard;
  } catch (error) {
    console.warn('Unable to submit shared result.', error);
    return undefined;
  }
};
