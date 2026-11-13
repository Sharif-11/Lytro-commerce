import { AiProvider } from '@lytronix/validators';
import type { CircuitBreaker } from '../../../common/circuit-breaker';
import type { Env } from '../../../config/env';
import type { AddressReaders } from '../ports/address-reader';
import { GeminiAddressReader, type AiFetch } from './gemini-address-reader';
import { StandInAddressReader } from './stand-in-address-reader';

export type AiMode = 'stand-in' | 'real';

/**
 * D7-22 (the owner's call, 2026-11-06): AI follows SMS's rule (D7-21). Tests and development use the stand-in, unless
 * development sets AI_FORCE_REAL; production, staging included, always reads for real, and the settings refuse to start
 * a production server without Gemini's key (config/env.ts).
 */
export function aiModeOf(env: Pick<Env, 'NODE_ENV' | 'AI_FORCE_REAL'>): AiMode {
  if (env.NODE_ENV === 'test') return 'stand-in';
  if (env.NODE_ENV === 'production') return 'real';
  return env.AI_FORCE_REAL ? 'real' : 'stand-in';
}

export function addressReadersFor(
  env: Pick<Env, 'NODE_ENV' | 'AI_FORCE_REAL' | 'GEMINI_BASE_URL' | 'GEMINI_API_KEY'>,
  fetchAi: AiFetch,
  breaker?: CircuitBreaker,
): AddressReaders {
  if (aiModeOf(env) === 'stand-in') return { [AiProvider.Gemini]: new StandInAddressReader() };
  if (!env.GEMINI_API_KEY) {
    // The settings check makes this unreachable; kept so a missing key can never fall back to the stand-in quietly.
    throw new Error('Gemini key missing: set GEMINI_API_KEY');
  }
  return {
    [AiProvider.Gemini]: new GeminiAddressReader(
      { baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY },
      fetchAi,
      breaker,
    ),
  };
}
