import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { REQUEST_ID_ALPHABET, REQUEST_ID_HALF_LENGTH } from '@lytronix/validators';

/**
 * API-27, D8-21 (Phase 8 Slice 8.1): a new request's ID, like K7MQ-4XR2. Eight characters from 31 that can't be mistaken
 * for each other give about 850 billion IDs: unique enough for the 7 days a fault is kept, and short enough to read
 * out over the phone. It names a request; it proves nothing, so it is never trusted from a client.
 */
@Injectable()
export class RequestIds {
  next(): string {
    return `${this.half()}-${this.half()}`;
  }

  private half(): string {
    let half = '';
    for (let i = 0; i < REQUEST_ID_HALF_LENGTH; i += 1) {
      half += REQUEST_ID_ALPHABET.charAt(randomInt(REQUEST_ID_ALPHABET.length));
    }
    return half;
  }
}
