import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { SkipEdge } from '../../common/decorators/skip-edge';
import { SkipTenant } from '../../common/decorators/skip-tenant';
import type { Env } from '../../config/env';
import { type ServerRole, serverRoleOf } from '../../config/server-role';
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

type HealthSettings = Partial<Pick<Env, 'RELEASE'>> & Pick<Env, 'SERVER_ROLE'>;

@Controller('health')
@SkipTenant()
@SkipEdge()
export class HealthController {
  private readonly settings: HealthSettings;

  // The parsed settings, or, where a module mounts this controller without them (the guards' own specs), the same
  // values read from the process's environment.
  constructor(@Optional() @Inject(ENV) env?: HealthSettings) {
    this.settings = env ?? {
      RELEASE: process.env['RELEASE'],
      SERVER_ROLE: serverRoleOf(process.env),
    };
  }

  @Get()
  check(): HealthReport {
    return {
      status: 'ok',
      version: this.settings.RELEASE ?? process.env['npm_package_version'] ?? '0.0.0',
      role: this.settings.SERVER_ROLE,
      database: 'not_configured',
    };
  }
}
