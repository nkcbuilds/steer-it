import type { Challenge, ShaftMap } from './domain';

export type HealthResponse = {
  status: 'ok';
  app: 'steer-it';
  version: string;
};

export type BootstrapResponse = {
  type: 'bootstrap';
  postId: string;
  username: string;
  challenge: Challenge;
  map: ShaftMap;
};

export type ApiErrorResponse = {
  status: 'error';
  message: string;
};
