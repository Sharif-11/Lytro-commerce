import { Controller, Get, Inject, Res } from '@nestjs/common';
import { SkipEdge } from '../../../common/decorators/skip-edge';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { JobsCheck, type JobsReport } from '../services/jobs-check';

// The part of the HTTP response this uses, so the file doesn't depend on Express's types.
interface StatusResponse {
  status(code: number): unknown;
}

/**
 * OBS-02, DAT-27 (Slice 9.6): the page the uptime check watches for the jobs and the backups: 200 while every one is on
 * time, 503 naming the late ones. Names only, never a figure from a shop.
 */
@Controller('health/jobs')
@SkipTenant()
@SkipEdge()
export class JobsCheckController {
  constructor(@Inject(JobsCheck) private readonly jobs: Pick<JobsCheck, 'report'>) {}

  @Get()
  async check(@Res({ passthrough: true }) response: StatusResponse): Promise<JobsReport> {
    const report = await this.jobs.report();
    if (report.status !== 'ok') response.status(503);
    return report;
  }
}
