import { execFile, execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// The production edge config itself, never a copy: what this runs is what a deployment runs (KNOWN-GAPS §141).
const CADDYFILE = resolve(__dirname, '../../../../deploy/Caddyfile');
// The image the edge runs in: the deployment's own (deploy/caddy/Dockerfile, Caddy with the Cloudflare DNS plugin, D9-10),
// which CI builds and names in CADDY_IMAGE. A computer without it runs plain Caddy, whose routing is the same.
export const EDGE_IMAGE = process.env['CADDY_IMAGE'] ?? 'caddy:2';
const IMAGE = EDGE_IMAGE;
// The test's hosts are *.localhost, whose certificates Caddy signs itself: never the Cloudflare challenge production's
// wildcard site uses (deploy/Caddyfile's WILDCARD_TLS).
const TEST_SETTINGS = { WILDCARD_TLS: 'wildcard_tls_auto' };
const READY_WITHIN_MS = 60_000;

/** True when a Docker engine answers here. CI always has one; a computer without it skips the edge's spec. */
export function dockerAnswers(): boolean {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: 'ignore',
      timeout: 20_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** One answer through the edge: the status, the headers and the body as JSON when it is JSON. */
export interface EdgeAnswer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: unknown;
}

/**
 * deploy/Caddyfile running in Caddy in a container, in front of a server under test on this computer, so a spec can call
 * the server as the world will: over HTTPS, by host name, through every rule the edge applies. The hosts are named from
 * PLATFORM_DOMAIN=localhost, so Caddy signs their certificates itself; the calls trust it, as only a test may.
 */
export class CaddyEdge {
  private id = '';
  private port = 0;

  constructor(private readonly env: Record<string, string>) {}

  async start(): Promise<void> {
    const args = [
      'run',
      '--detach',
      '--rm',
      // The server under test listens on this computer, which the container reaches by this name (Linux needs it said).
      '--add-host',
      'host.docker.internal:host-gateway',
      '--publish',
      '127.0.0.1::443',
      '--mount',
      `type=bind,source=${CADDYFILE},target=/etc/caddy/Caddyfile,readonly`,
    ];
    for (const [name, value] of Object.entries({ ...TEST_SETTINGS, ...this.env })) {
      args.push('--env', `${name}=${value}`);
    }
    args.push(IMAGE);
    this.id = (await run('docker', args)).stdout.trim();
    const mapped =
      (await run('docker', ['port', this.id, '443/tcp'])).stdout.trim().split('\n')[0] ?? '';
    this.port = Number(mapped.slice(mapped.lastIndexOf(':') + 1));
    await this.ready();
  }

  /** The Caddy modules the edge image carries. */
  async modules(): Promise<string[]> {
    const { stdout } = await run('docker', ['run', '--rm', IMAGE, 'caddy', 'list-modules']);
    return stdout.split('\n').map((line) => line.trim());
  }

  async stop(): Promise<void> {
    if (this.id === '') return;
    await run('docker', ['rm', '--force', this.id]).catch(() => undefined);
    this.id = '';
  }

  /** A request to `host` through the edge, exactly at `path`. */
  send(
    host: string,
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ): Promise<EdgeAnswer> {
    const data = payload === undefined ? '' : JSON.stringify(payload);
    return new Promise((done, fail) => {
      const req = httpsRequest(
        {
          host: '127.0.0.1',
          port: this.port,
          servername: host,
          // Caddy's own local authority signed this certificate; nothing outside a test is sent this way.
          rejectUnauthorized: false,
          agent: false,
          method,
          path,
          headers: {
            host,
            'accept-language': 'en',
            ...(payload === undefined
              ? {}
              : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }),
            ...headers,
          },
        },
        (res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => {
            text += chunk.toString();
          });
          res.on('end', () => {
            let json: unknown = undefined;
            try {
              json = text === '' ? undefined : (JSON.parse(text) as unknown);
            } catch {
              json = undefined;
            }
            done({ status: res.statusCode ?? 0, headers: res.headers, text, json });
          });
        },
      );
      req.on('error', fail);
      req.end(data);
    });
  }

  /** Caddy has started and signed its certificates once the API host answers over HTTPS at all. */
  private async ready(): Promise<void> {
    const until = Date.now() + READY_WITHIN_MS;
    let last: unknown = null;
    while (Date.now() < until) {
      try {
        await this.send('api.localhost', 'GET', '/v1/shop');
        return;
      } catch (error: unknown) {
        last = error;
        await new Promise((wait) => setTimeout(wait, 250));
      }
    }
    const logs = await run('docker', ['logs', '--tail', '40', this.id]).catch(() => null);
    throw new Error(
      `the edge did not answer within ${String(READY_WITHIN_MS / 1000)} s (${String(last)}): ${logs?.stderr ?? ''}`,
    );
  }
}
