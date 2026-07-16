import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { api } from './routes/api';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { appRouter, createTrpcContext } from './trpc';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/triggers', triggers);

app.route('/api', api);
app.all('/api/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: createTrpcContext,
  })
);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
