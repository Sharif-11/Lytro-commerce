import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { Permission, SmsEvent, type SmsLogQuery, type SmsReportQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { RequirePermission } from '../../../common/decorators/require-permission';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import { SmsHistory, type SmsLogView, type SmsReport } from '../../sms-events/services/sms-history';
import {
  SmsSettingsService,
  type SmsSettingsView,
} from '../../sms-events/services/sms-settings.service';
import {
  SmsLogDto,
  SmsLogQueryDto,
  SmsReportDto,
  SmsReportQueryDto,
  SmsSettingsDto,
  SmsSettingsUpdateDto,
} from '../dto/sms.dto';
import { PermissionGuard } from '../guards/permission.guard';
import { CatalogueRequest } from '../services/catalogue-request';

function eventOf(value: string): SmsEvent {
  const event = z.nativeEnum(SmsEvent).safeParse(value);
  if (!event.success) throw new ApiError('not_found', 'PageNotFound', {});
  return event.data;
}

// SMS-02 to SMS-19 (Phase 7 Slice 7.2, read agreed 2026-11-06): a shop's SMS events -- their switches, words, SMS name,
// spend cap and estimates -- and what its SMS did. Reading is `sms:read`, changing `sms:manage`.
@ApiTags('SMS')
@Controller('sms')
@Dashboard({})
@UseGuards(SessionGuard, DashboardGuard, PermissionGuard)
export class SmsController {
  constructor(
    @Inject(SmsSettingsService) private readonly settings: SmsSettingsService,
    @Inject(SmsHistory) private readonly history: SmsHistory,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get('settings')
  @RequirePermission(Permission.SmsRead)
  @ResponseMessage('SmsSettingsRead')
  @ApiOperation({
    summary:
      "The shop's SMS events, each with its switch, its words, a sample with its units and an estimated cost, the essential ones always on, the SMS name and the month's spend cap (SMS-02, SMS-10, SMS-12, SMS-13, SMS-19)",
  })
  @ZodResponse({ type: SmsSettingsDto })
  view(@Req() request: DashboardRequest): Promise<SmsSettingsView> {
    return this.settings.view(this.request.tenantIdOf(request));
  }

  @Patch('settings')
  @RequirePermission(Permission.SmsManage)
  @ResponseMessage('SmsSettingsSaved')
  @ApiOperation({
    summary:
      'Change any of the switches, templates (each keeps {order_number}), the SMS name or the spend cap (SMS-02, SMS-10, SMS-13, SMS-16)',
  })
  @ApiBody({ type: SmsSettingsUpdateDto })
  @ZodResponse({ type: SmsSettingsDto })
  update(
    @Body(new ZodValidationPipe(SmsSettingsUpdateDto.schema)) body: SmsSettingsUpdateDto,
    @Req() request: DashboardRequest,
  ): Promise<SmsSettingsView> {
    return this.settings.update(this.request.tenantIdOf(request), body);
  }

  @Post('settings/templates/:event/reset')
  @HttpCode(200)
  @RequirePermission(Permission.SmsManage)
  @ResponseMessage('SmsTemplateReset')
  @ApiOperation({ summary: "An event's template back to the platform's current default (SMS-19)" })
  @ZodResponse({ type: SmsSettingsDto })
  reset(@Param('event') event: string, @Req() request: DashboardRequest): Promise<SmsSettingsView> {
    return this.settings.resetTemplate(this.request.tenantIdOf(request), eventOf(event));
  }

  @Get('report')
  @RequirePermission(Permission.SmsRead)
  @ResponseMessage('SmsReportRead')
  @ApiOperation({
    summary:
      "Each day's SMS by kind: sent, failed, blocked, units and cost, the last 30 days by default (SMS-14)",
  })
  @ZodResponse({ type: SmsReportDto })
  report(
    @Query(new ZodValidationPipe(SmsReportQueryDto.schema)) query: SmsReportQuery,
    @Req() request: DashboardRequest,
  ): Promise<SmsReport> {
    return this.history.report(this.request.tenantIdOf(request), query);
  }

  @Get('log')
  @RequirePermission(Permission.SmsRead)
  @ResponseMessage('SmsLogListed')
  @ApiOperation({
    summary:
      "The shop's SMS, newest first, with what each cost and why one was refused; one order's alone when asked (SMS-07, SMS-17)",
  })
  @ZodResponse({ type: SmsLogDto })
  log(
    @Query(new ZodValidationPipe(SmsLogQueryDto.schema)) query: SmsLogQuery,
    @Req() request: DashboardRequest,
  ): Promise<{ sms: SmsLogView[] }> {
    return this.history.log(this.request.tenantIdOf(request), query);
  }
}
