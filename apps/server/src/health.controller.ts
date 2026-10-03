import { Controller, Get } from '@nestjs/common';

export interface HealthReport {
  status: 'ok';
  version: string;
  // MON-02 also requires database reachability; wired in Phase 1 when the database exists.
  database: 'not_configured';
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthReport {
    return {
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.0.0',
      database: 'not_configured',
    };
  }
}
