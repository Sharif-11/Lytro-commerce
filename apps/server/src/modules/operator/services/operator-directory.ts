import { Inject, Injectable } from '@nestjs/common';
import type { OperatorGateway } from '../ports/operator-gateway';
import { OPERATOR_GATEWAY } from '../tokens';

/**
 * Who an operator id is. The rows that record an operator keep only the id (settings, rates, overrides, the
 * platform audit log), and the console's screens show who, so every read that shows one asks here.
 */
@Injectable()
export class OperatorDirectory {
  constructor(@Inject(OPERATOR_GATEWAY) private readonly gateway: OperatorGateway) {}

  /** Each id that belongs to an operator, with its email. An id that doesn't, or a null, finds nothing. */
  async emailsOf(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const known = [...new Set(ids.filter((id): id is string => id !== null))];
    return known.length === 0 ? new Map() : this.gateway.emailsOf(known);
  }
}
