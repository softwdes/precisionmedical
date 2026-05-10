export * from './react';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  ping: t.procedure.query(() => {
    return { status: 'ok' };
  }),
});

export type AppRouter = typeof appRouter;
