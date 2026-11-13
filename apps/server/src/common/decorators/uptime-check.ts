import { SetMetadata } from '@nestjs/common';

export const UPTIME_CHECK = 'uptimeCheck';

/**
 * OBS-01 (Slice 9.6): a health page the outside uptime check calls on the API host (api.<platform domain>), the one host
 * that reaches the server's own unversioned routes through the edge. Only the ready check and the jobs check: /health,
 * which names the release, stays inside.
 */
export const UptimeCheck = (): MethodDecorator & ClassDecorator => SetMetadata(UPTIME_CHECK, true);
