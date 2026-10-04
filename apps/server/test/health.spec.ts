import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/modules/health/health.controller';

describe('HealthController', () => {
  it('reports ok with database not yet configured', () => {
    const report = new HealthController().check();
    expect(report.status).toBe('ok');
    expect(report.database).toBe('not_configured');
  });
});
