const PREFIX = 'steer-it:v1';

const scoped = (postId: string, challengeId: string): string =>
  `${PREFIX}:post:${postId}:challenge:${challengeId}`;

export const redisKeys = {
  attempts: (postId: string, challengeId: string): string =>
    `${scoped(postId, challengeId)}:attempts`,
  counters: (postId: string, challengeId: string): string =>
    `${scoped(postId, challengeId)}:counters`,
  processedRuns: (postId: string, challengeId: string): string =>
    `${scoped(postId, challengeId)}:processed-runs`,
  timeLeaderboard: (postId: string, challengeId: string): string =>
    `${scoped(postId, challengeId)}:leaderboard:time`,
  playerNames: (postId: string, challengeId: string): string =>
    `${scoped(postId, challengeId)}:player-names`,
};
