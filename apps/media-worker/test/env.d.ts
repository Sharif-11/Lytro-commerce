import type { WorkerEnv } from '../src/env';

// `cloudflare:test`'s `env` is the Worker's own bindings and settings.
declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- names the Worker's bindings, adds none
    interface Env extends WorkerEnv {}
  }
}
