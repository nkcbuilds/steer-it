import { context, reddit, redis } from '@devvit/web/server';
import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { getChallengeWindow } from '../shared/challenge';
import { generateShaftMap, validateShaftMap } from '../shared/map';
import { redisKeys } from './redis/keys';

const TOP_TIMES_LIMIT = 10;
const ATTEMPT_TTL_MS = 20 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 2_500;
const MINIMUM_PLAUSIBLE_RUN_MS = 1_500;

type TrpcContext = {
  postId: string;
  userId: string;
  username: string;
};

export const createTrpcContext = async (): Promise<TrpcContext> => {
  if (!context.postId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A Reddit post context is required.',
    });
  }

  const userId = context.userId ?? context.loid;
  if (!userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Sign in to record challenge attempts.',
    });
  }

  const username =
    context.username ?? (await reddit.getCurrentUsername()) ?? 'anonymous-pilot';
  return { postId: context.postId, userId, username };
};

const t = initTRPC.context<TrpcContext>().create();
const publicProcedure = t.procedure;

const challengeIdentityInput = z.object({
  challengeId: z.string().min(1).max(100),
});

const beginAttemptInput = challengeIdentityInput.extend({
  mapId: z.string().min(1).max(120),
  clientRunId: z.string().min(8).max(100),
});

const submitResultInput = beginAttemptInput.extend({
  durationMs: z.number().int().positive().max(30 * 60 * 1000),
  fuelUsed: z.number().finite().nonnegative().max(1_000_000),
});

type AttemptTicket = {
  userId: string;
  challengeId: string;
  mapId: string;
  startedAt: number;
};

const assertActiveChallenge = (
  challengeId: string,
  mapId?: string
): ReturnType<typeof getChallengeWindow> => {
  const challenge = getChallengeWindow(Date.now());
  if (challenge.id !== challengeId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'That challenge is no longer active.',
    });
  }
  if (mapId !== undefined && challenge.mapId !== mapId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The submitted map does not match the active challenge.',
    });
  }
  return challenge;
};

const parseAttemptTicket = (value: string | undefined): AttemptTicket => {
  if (!value) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The attempt ticket is missing or expired.',
    });
  }

  const result = z
    .object({
      userId: z.string(),
      challengeId: z.string(),
      mapId: z.string(),
      startedAt: z.number(),
    })
    .safeParse(JSON.parse(value));
  if (!result.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'The stored attempt ticket is invalid.',
    });
  }
  return result.data;
};

const getLeaderboard = async (ctx: TrpcContext, challengeId: string) => {
  const leaderboardKey = redisKeys.timeLeaderboard(ctx.postId, challengeId);
  const namesKey = redisKeys.playerNames(ctx.postId, challengeId);
  const countersKey = redisKeys.counters(ctx.postId, challengeId);
  const [ranked, names, counters, personalBest] = await Promise.all([
    redis.zRange(leaderboardKey, 0, TOP_TIMES_LIMIT - 1, { by: 'rank' }),
    redis.hGetAll(namesKey),
    redis.hGetAll(countersKey),
    redis.zScore(leaderboardKey, ctx.userId),
  ]);

  return {
    challengeId,
    attempts: Number(counters.attempts ?? 0),
    completions: Number(counters.completions ?? 0),
    personalBestMs: personalBest,
    entries: ranked.map((entry, index) => ({
      rank: index + 1,
      userId: entry.member,
      username: names[entry.member] ?? 'unknown-pilot',
      durationMs: entry.score,
    })),
  };
};

export const appRouter = t.router({
  currentChallenge: publicProcedure.query(async ({ ctx }) => {
    const challenge = getChallengeWindow(Date.now());
    const map = generateShaftMap(challenge.seed, challenge.startsAt);
    const validation = validateShaftMap(map);
    if (!validation.valid) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The current shaft failed validation.',
      });
    }
    return {
      challenge,
      map,
      leaderboard: await getLeaderboard(ctx, challenge.id),
    };
  }),

  leaderboard: publicProcedure
    .input(challengeIdentityInput)
    .query(async ({ ctx, input }) => {
      assertActiveChallenge(input.challengeId);
      return getLeaderboard(ctx, input.challengeId);
    }),

  beginAttempt: publicProcedure
    .input(beginAttemptInput)
    .mutation(async ({ ctx, input }) => {
      assertActiveChallenge(input.challengeId, input.mapId);
      const attemptKey = redisKeys.attempts(ctx.postId, input.challengeId);
      const stored = await redis.hSetNX(
        attemptKey,
        input.clientRunId,
        JSON.stringify({
          userId: ctx.userId,
          challengeId: input.challengeId,
          mapId: input.mapId,
          startedAt: Date.now(),
        })
      );
      if (stored !== 1) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'That run has already been started.',
        });
      }
      await Promise.all([
        redis.expire(attemptKey, Math.ceil(ATTEMPT_TTL_MS / 1000)),
        redis.hIncrBy(
          redisKeys.counters(ctx.postId, input.challengeId),
          'attempts',
          1
        ),
      ]);
      return { accepted: true, serverStartedAt: Date.now() };
    }),

  submitResult: publicProcedure
    .input(submitResultInput)
    .mutation(async ({ ctx, input }) => {
      assertActiveChallenge(input.challengeId, input.mapId);
      const attemptKey = redisKeys.attempts(ctx.postId, input.challengeId);
      const ticket = parseAttemptTicket(
        await redis.hGet(attemptKey, input.clientRunId)
      );
      if (
        ticket.userId !== ctx.userId ||
        ticket.challengeId !== input.challengeId ||
        ticket.mapId !== input.mapId
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'The attempt ticket does not belong to this run.',
        });
      }

      const serverElapsed = Date.now() - ticket.startedAt;
      if (
        input.durationMs < MINIMUM_PLAUSIBLE_RUN_MS ||
        input.durationMs + CLOCK_TOLERANCE_MS < serverElapsed
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The submitted duration is not plausible for this attempt.',
        });
      }

      const processed = await redis.hSetNX(
        redisKeys.processedRuns(ctx.postId, input.challengeId),
        input.clientRunId,
        String(Date.now())
      );
      if (processed !== 1) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'That result has already been submitted.',
        });
      }

      const leaderboardKey = redisKeys.timeLeaderboard(
        ctx.postId,
        input.challengeId
      );
      const previousBest = await redis.zScore(leaderboardKey, ctx.userId);
      const isPersonalBest =
        previousBest === undefined || input.durationMs < previousBest;
      await Promise.all([
        redis.hIncrBy(
          redisKeys.counters(ctx.postId, input.challengeId),
          'completions',
          1
        ),
        redis.hSet(redisKeys.playerNames(ctx.postId, input.challengeId), {
          [ctx.userId]: ctx.username,
        }),
        ...(isPersonalBest
          ? [
              redis.zAdd(leaderboardKey, {
                member: ctx.userId,
                score: input.durationMs,
              }),
            ]
          : []),
      ]);

      return {
        accepted: true,
        isPersonalBest,
        leaderboard: await getLeaderboard(ctx, input.challengeId),
      };
    }),
});

export type AppRouter = typeof appRouter;
