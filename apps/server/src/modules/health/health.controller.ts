import { Controller, Get, Inject } from '@nestjs/common';
import { SkipEdge } from '../../common/decorators/skip-edge';
import { SkipTenant } from '../../common/decorators/skip-tenant';
import type { Env } from '../../config/env';
import type { ServerRole } from '../../config/server-role';
import { ENV } from '../../config/tokens';

export interface HealthReport {
  status: 'ok';
  // The release this process runs (RELEASE, the commit its image was built from), so a deploy can check it is live.
  version: string;
  // D9-11: what this process does, so a deploy can check each container started in its role.
  role: ServerRole;
  // MON-02 also requires database reachability; wired in Phase 1 when the database exists.
  database: 'not_configured';
}

@Controller('health')
@SkipTenant()
@SkipEdge()
export class HealthController {
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'RELEASE' | 'SERVER_ROLE'>) {}

  @Get()
  check(): HealthReport {
    return {
      status: 'ok',
      version: this.env.RELEASE ?? process.env['npm_package_version'] ?? '0.0.0',
      role: this.env.SERVER_ROLE,
      database: 'not_configured',
    };
  }
}
