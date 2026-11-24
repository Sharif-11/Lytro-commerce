import type { Env } from '../../../config/env';

type PixelEnv = Pick<
  Env,
  'LYTRO_META_PIXEL_ID' | 'LYTRO_META_CAPI_TOKEN' | 'LYTRO_META_TEST_EVENT_CODE'
>;

/**
 * MKT-05: Lytro's own pixel and Conversions API token, set in production's server.env alone. Unless both are set,
 * nothing is queued or sent, so staging and development tell Meta nothing. The token is never logged.
 */
export class PlatformAdSettings {
  readonly pixelId: string | null;
  readonly accessToken: string | null;
  readonly testEventCode: string | null;

  constructor(env: PixelEnv) {
    this.pixelId = env.LYTRO_META_PIXEL_ID ?? null;
    this.accessToken = env.LYTRO_META_CAPI_TOKEN ?? null;
    this.testEventCode = env.LYTRO_META_TEST_EVENT_CODE ?? null;
  }

  get enabled(): boolean {
    return this.pixelId !== null && this.accessToken !== null;
  }
}
