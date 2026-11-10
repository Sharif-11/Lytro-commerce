import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  ManualEntries,
  type ManualEntryPage,
  type ManualEntryPreview,
  type ManualEntryView,
} from '../../manual-entries/services/manual-entries';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import {
  PaymentEvidence,
  type EvidenceLink,
  type EvidenceUpload,
} from '../../payment-evidence/services/payment-evidence';
import {
  EvidenceLinkDto,
  EvidenceUploadDto,
  EvidenceUploadResponseDto,
  ManualEntryDto,
  ManualEntryListDto,
  ManualEntryPageDto,
  ManualEntryPreviewDto,
  ManualEntryPreviewResponseDto,
  ManualEntryViewDto,
  ReverseManualEntryDto,
} from '../dto/operator-manual-entries.dto';

// ADM-14, ADM-15, ADM-16, D8-14, D8-47 to D8-56 (Phase 8 Slice 8.5): payments the operator records for a shop, and reverses.
@ApiTags('Operator Manual Entries')
@Controller('operator/manual-entries')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorManualEntriesController {
  constructor(
    @Inject(ManualEntries) private readonly entries: ManualEntries,
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('ManualEntriesListed')
  @ApiOperation({ summary: 'List manual entries and reversals, newest first' })
  @ZodResponse({ type: ManualEntryPageDto })
  list(
    @Query(new ZodValidationPipe(ManualEntryListDto.schema)) query: ManualEntryListDto,
  ): Promise<ManualEntryPage> {
    return this.entries.list(query);
  }

  @Post('evidence')
  @ResponseMessage('EvidenceUploadReady')
  @ApiOperation({ summary: 'Get a signed link to upload a payment screenshot' })
  @ZodResponse({ type: EvidenceUploadResponseDto })
  startUpload(
    @Body(new ZodValidationPipe(EvidenceUploadDto.schema)) body: EvidenceUploadDto,
  ): Promise<EvidenceUpload> {
    return this.evidence.startOperatorUpload(body);
  }

  @Post('preview')
  @ResponseMessage('ManualEntryPreviewed')
  @ApiOperation({ summary: 'What an entry would be for this shop now, before saving it' })
  @ZodResponse({ type: ManualEntryPreviewResponseDto })
  preview(
    @Body(new ZodValidationPipe(ManualEntryPreviewDto.schema)) body: ManualEntryPreviewDto,
  ): Promise<ManualEntryPreview> {
    return this.entries.preview(body);
  }

  @Post()
  @ResponseMessage('ManualEntryRecorded')
  @ApiOperation({ summary: 'Record a payment made outside the normal flow' })
  @ZodResponse({ type: ManualEntryViewDto })
  record(
    @Body(new ZodValidationPipe(ManualEntryDto.schema)) body: ManualEntryDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<ManualEntryView> {
    return this.entries.record(body, this.operatorId(request), this.clientIp.resolve(request));
  }

  @Post(':id/reverse')
  @ResponseMessage('ManualEntryReversed')
  @ApiOperation({ summary: 'Reverse a manual entry; the original is kept' })
  @ZodResponse({ type: ManualEntryViewDto })
  reverse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ReverseManualEntryDto.schema)) body: ReverseManualEntryDto,
    @Req() request: OperatorSessionRequest,
  ): Promise<ManualEntryView> {
    return this.entries.reverse(
      id,
      body.reason,
      this.operatorId(request),
      this.clientIp.resolve(request),
    );
  }

  @Get(':id/evidence')
  @ResponseMessage('EvidenceLinkReady')
  @ApiOperation({ summary: "A link to an entry's screenshot, lasting five minutes" })
  @ZodResponse({ type: EvidenceLinkDto })
  evidenceLink(@Param('id') id: string): Promise<EvidenceLink> {
    return this.entries.evidenceLink(id);
  }

  private operatorId(request: OperatorSessionRequest): string {
    const session = request.operatorSession;
    if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return session.operatorId;
  }
}
