import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { AuditListQuery, ConsumersQuery, ReportQuery } from '@lytronix/validators';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { OperatorSessionGuard } from '../../operator/guards/operator-session.guard';
import { OperatorAuditLog, type AuditLogPage } from '../../reports/services/operator-audit-log';
import {
  consumersCsv,
  reportFileName,
  revenueCsv,
  shopsCsv,
} from '../../reports/services/report-csv';
import {
  Reports,
  type ConsumersReport,
  type RevenueReport,
  type ShopsReport,
} from '../../reports/services/reports';
import {
  AuditListQueryDto,
  AuditLogPageDto,
  ConsumersQueryDto,
  ConsumersReportDto,
  ReportQueryDto,
  RevenueReportDto,
  ShopsReportDto,
} from '../dto/operator-reports.dto';
import { PausedWhileDegraded } from '../../degraded-mode/paused-while-degraded';

// The raw response a CSV route writes to, the same narrow shape the balance statement's export uses.
interface RawResponse {
  status(code: number): RawResponse;
  set(headers: Record<string, string>): RawResponse;
  send(body: string): void;
}

function sendCsv(response: RawResponse, fileName: string, csv: string): void {
  response
    .status(200)
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    })
    .send(csv);
}

// ADM-08, ADM-09, D8-10, D8-11 (Phase 8 Slice 8.4): the operator's reports, each also as a CSV, and the platform audit
// log's list. Read only.
@ApiTags('Operator Reports')
@Controller('operator')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorReportsController {
  constructor(
    @Inject(Reports) private readonly reports: Reports,
    @Inject(OperatorAuditLog) private readonly audit: OperatorAuditLog,
  ) {}

  @Get('reports/revenue')
  @PausedWhileDegraded()
  @ResponseMessage('RevenueReportRead')
  @ApiOperation({
    summary:
      "What Lytro earned, by week, month, quarter or year: plans and add-ons paid to its wallets, and shops' balance spending by kind (D8-40)",
  })
  @ZodResponse({ type: RevenueReportDto })
  revenue(
    @Query(new ZodValidationPipe(ReportQueryDto.schema)) query: ReportQuery,
  ): Promise<RevenueReport> {
    return this.reports.revenue(query);
  }

  @Get('reports/revenue/export')
  @PausedWhileDegraded()
  @ApiOperation({ summary: 'The revenue report as a CSV' })
  async revenueCsv(
    @Query(new ZodValidationPipe(ReportQueryDto.schema)) query: ReportQuery,
    @Res() response: RawResponse,
  ): Promise<void> {
    const report = await this.reports.revenue(query);
    sendCsv(response, reportFileName('revenue', report, query.bucket), revenueCsv(report));
  }

  @Get('reports/shops')
  @PausedWhileDegraded()
  @ResponseMessage('ShopsReportRead')
  @ApiOperation({
    summary:
      'Shops by state and plan now, and each week, month, quarter or year: opened, became paying, lapsed (D8-41)',
  })
  @ZodResponse({ type: ShopsReportDto })
  shops(
    @Query(new ZodValidationPipe(ReportQueryDto.schema)) query: ReportQuery,
  ): Promise<ShopsReport> {
    return this.reports.shops(query);
  }

  @Get('reports/shops/export')
  @PausedWhileDegraded()
  @ApiOperation({ summary: 'The shops report as a CSV' })
  async shopsCsv(
    @Query(new ZodValidationPipe(ReportQueryDto.schema)) query: ReportQuery,
    @Res() response: RawResponse,
  ): Promise<void> {
    const report = await this.reports.shops(query);
    sendCsv(response, reportFileName('shops', report, query.bucket), shopsCsv(report));
  }

  @Get('reports/consumers')
  @PausedWhileDegraded()
  @ResponseMessage('ConsumersReportRead')
  @ApiOperation({
    summary:
      "The shops that used the most storage, bandwidth or SMS in a period, with each owner's phone (D8-42)",
  })
  @ZodResponse({ type: ConsumersReportDto })
  consumers(
    @Query(new ZodValidationPipe(ConsumersQueryDto.schema)) query: ConsumersQuery,
  ): Promise<ConsumersReport> {
    return this.reports.consumers(query);
  }

  @Get('reports/consumers/export')
  @PausedWhileDegraded()
  @ApiOperation({ summary: 'The top consumers as a CSV, with each owner phone' })
  async consumersCsv(
    @Query(new ZodValidationPipe(ConsumersQueryDto.schema)) query: ConsumersQuery,
    @Res() response: RawResponse,
  ): Promise<void> {
    const report = await this.reports.consumers(query);
    sendCsv(response, reportFileName('consumers', report, query.metric), consumersCsv(report));
  }

  @Get('audit')
  @ResponseMessage('AuditLogListed')
  @ApiOperation({
    summary:
      'The platform audit log, newest first, by shop, operator, action and day; read only (ADM-08, D8-11)',
  })
  @ZodResponse({ type: AuditLogPageDto })
  auditLog(
    @Query(new ZodValidationPipe(AuditListQueryDto.schema)) query: AuditListQuery,
  ): Promise<AuditLogPage> {
    return this.audit.list(query);
  }
}
