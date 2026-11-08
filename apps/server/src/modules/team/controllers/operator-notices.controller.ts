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
import type {
  NoticeCreateInput,
  NoticesQuery,
  NoticeTemplateInput,
  NoticeUpdateInput,
} from '@lytronix/validators';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { NoticeDesk, type NoticeOperator } from '../../notices/services/notice-desk';
import type { NoticeDraft } from '../../notices/notice-words';
import type {
  NoticeAcknowledgmentList,
  OperatorNoticeDetail,
  OperatorNoticeView,
} from '../../notices/types/notice';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  NoticeAcknowledgmentListDto,
  NoticeCreateDto,
  NoticeDraftDto,
  NoticesQueryDto,
  NoticeTemplateDto,
  NoticeUpdateDto,
  OperatorNoticeDetailDto,
  OperatorNoticeDto,
  OperatorNoticePageDto,
} from '../dto/notices.dto';
import { CatalogueRequest } from '../services/catalogue-request';

// NTC-01, NTC-05, NTC-08, NTC-09, NTC-10, NTC-12, NTC-13, NTC-17 (Phase 7 Slice 7.4, read agreed 2026-11-07): the
// operator's notices -- write, edit, withdraw, see what came of each and who acknowledged it, and start one from a
// template. The operator's alone: no shop credential reaches these routes (NTC-10).
@ApiTags('Operator Notices')
@Controller('operator/notices')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorNoticesController {
  constructor(
    @Inject(NoticeDesk) private readonly desk: NoticeDesk,
    @Inject(CatalogueRequest) private readonly request: CatalogueRequest,
  ) {}

  @Get()
  @ResponseMessage('NoticesListed')
  @ApiOperation({
    summary:
      'Every notice, newest written first, with where it stands and its delivery, read and acknowledgment counts (NTC-09)',
  })
  @ZodResponse({ type: OperatorNoticePageDto })
  list(
    @Query(new ZodValidationPipe(NoticesQueryDto.schema)) query: NoticesQuery,
  ): Promise<{ items: OperatorNoticeView[]; next: number | null }> {
    return this.desk.list(query);
  }

  @Post()
  @ResponseMessage('NoticeCreated')
  @ApiOperation({
    summary:
      'Write a notice: a draft until it has a publish time, then sent within a minute of it (NTC-01, NTC-11)',
  })
  @ApiBody({ type: NoticeCreateDto })
  @ZodResponse({ type: OperatorNoticeDto, status: 201 })
  create(
    @Body(new ZodValidationPipe(NoticeCreateDto.schema)) body: NoticeCreateInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<OperatorNoticeView> {
    return this.desk.create(body, this.operatorOf(request));
  }

  @Post('template')
  @HttpCode(200)
  @ResponseMessage('NoticeTemplateFilled')
  @ApiOperation({
    summary:
      'A template filled in -- rate change, maintenance, outage or policy update; a rate change fills its rates itself (NTC-12, NTC-13)',
  })
  @ApiBody({ type: NoticeTemplateDto })
  @ZodResponse({ type: NoticeDraftDto })
  template(
    @Body(new ZodValidationPipe(NoticeTemplateDto.schema)) body: NoticeTemplateInput,
  ): Promise<NoticeDraft> {
    return this.desk.template(body);
  }

  @Get(':id')
  @ResponseMessage('NoticeShown')
  @ApiOperation({ summary: 'One notice, with its earlier versions (NTC-08, NTC-09)' })
  @ZodResponse({ type: OperatorNoticeDetailDto })
  detail(@Param('id') id: string): Promise<OperatorNoticeDetail> {
    return this.desk.detail(this.request.idOf(id, 'NoticeNotFound'));
  }

  @Patch(':id')
  @ResponseMessage('NoticeSaved')
  @ApiOperation({
    summary:
      'Change a notice; once live, its earlier version is kept, the board says "updated", and nothing is sent again (NTC-08)',
  })
  @ApiBody({ type: NoticeUpdateDto })
  @ZodResponse({ type: OperatorNoticeDto })
  edit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(NoticeUpdateDto.schema)) body: NoticeUpdateInput,
    @Req() request: OperatorSessionRequest,
  ): Promise<OperatorNoticeView> {
    return this.desk.edit(this.request.idOf(id, 'NoticeNotFound'), body, this.operatorOf(request));
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ResponseMessage('NoticeWithdrawn')
  @ApiOperation({
    summary:
      'Withdraw a notice: hidden from every shop at once, kept here with its history (NTC-08)',
  })
  @ZodResponse({ type: OperatorNoticeDto })
  withdraw(
    @Param('id') id: string,
    @Req() request: OperatorSessionRequest,
  ): Promise<OperatorNoticeView> {
    return this.desk.withdraw(this.request.idOf(id, 'NoticeNotFound'), this.operatorOf(request));
  }

  @Get(':id/acknowledgments')
  @ResponseMessage('NoticeAcknowledgmentsListed')
  @ApiOperation({
    summary: 'The shops that said "I understand", and those in its audience still to (NTC-05)',
  })
  @ZodResponse({ type: NoticeAcknowledgmentListDto })
  acknowledgments(@Param('id') id: string): Promise<NoticeAcknowledgmentList> {
    return this.desk.acknowledgments(this.request.idOf(id, 'NoticeNotFound'));
  }

  private operatorOf(request: OperatorSessionRequest): NoticeOperator {
    return this.request.operatorOf(request);
  }
}
