import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/modules/health/health.controller';

describe('HealthController', () => {
  it('reports ok with database not yet configured', () => {
    const report = new HealthController({ SERVER_ROLE: 'all' }).check();
    expect(report.status).toBe('ok');
    expect(report.database).toBe('not_configured');
  });

  it('reports the release and the role it runs, so a deploy can check both (D9-11, D9-12)', () => {
    const report = new HealthController({ RELEASE: '854f8a0b', SERVER_ROLE: 'api' }).check();
    expect(report).toMatchObject({ version: '854f8a0b', role: 'api' });
  });

  it('mounted without the parsed settings, reads them from the environment', () => {
    process.env['SERVER_ROLE'] = 'worker';
    try {
      expect(new HealthController().check().role).toBe('worker');
    } finally {
      delete process.env['SERVER_ROLE'];
    }
  });
});
