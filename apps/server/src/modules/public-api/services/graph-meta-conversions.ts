import { Injectable } from '@nestjs/common';
import { SECOND_MS } from '../../../common/time';
import type { MetaConversions, MetaServerEvent } from '../ports/meta-conversions';

// The Graph API version the events go to, and how long one send may take before it counts as failed.
const GRAPH_VERSION = 'v21.0';
const SEND_TIMEOUT_MS = 10 * SECOND_MS;

/** LND-16: Meta's Conversions API over HTTPS, `POST /{pixel}/events`. */
@Injectable()
export class GraphMetaConversions implements MetaConversions {
  async send(pixelId: string, accessToken: string, events: MetaServerEvent[]): Promise<void> {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: events, access_token: accessToken }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`Meta answered ${String(response.status)} for pixel ${pixelId}`);
    }
  }
}
