import { EdgeState } from './edge-state';
import type { WorkerEnv } from './env';
import { MediaHandler } from './handler';
import { S3Origin } from './origin';
import { LinkVerifier } from './signed-link';
import { AnalyticsUsageRecorder } from './usage';

// One handler per set of bindings, so what it keeps in memory -- the blocked list, the website addresses, the link
// key -- lasts across this Worker's requests.
const handlers = new WeakMap<WorkerEnv, MediaHandler>();

/** The media address's handler, made from the Worker's bindings and settings. */
export function handlerFor(env: WorkerEnv): MediaHandler {
  let handler = handlers.get(env);
  if (!handler) {
    const now = (): number => Date.now();
    handler = new MediaHandler({
      origin: new S3Origin({
        endpoint: env.R2_ENDPOINT,
        bucket: env.R2_BUCKET,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      }),
      state: new EdgeState(env.MEDIA_EDGE, now),
      links: new LinkVerifier(env.MEDIA_LINK_SECRET, now),
      usage: new AnalyticsUsageRecorder(env.MEDIA_USAGE),
      cache: caches.default,
      dashboardOrigins: env.DASHBOARD_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    });
    handlers.set(env, handler);
  }
  return handler;
}

// MED-02, BND-01: the media address (`media.lytro.app`). Everything it serves passes through the handler.
export default {
  fetch(request, env, ctx): Promise<Response> {
    return handlerFor(env).handle(request, ctx);
  },
} satisfies ExportedHandler<WorkerEnv>;
