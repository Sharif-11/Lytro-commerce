import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  ListenerIgnoredReason,
  ListenerMessageStatus,
  listenerRecentQuerySchema,
  listenerUploadSchema,
  PaymentMethod,
  PaymentReviewReason,
  type ListenerRecentQuery,
  type ListenerUploadInput,
} from '@lytronix/validators';
import { PublicApiRoute } from '../../../common/decorators/public-api';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  ListenerDeviceGuard,
  type ListenerRequest,
} from '../../listener/guards/listener-device.guard';
import { ListenerReceipts } from '../services/listener-receipts';
import type { ListenerRecent, ListenerUploaded } from '../types/listener-receipts';

class ListenerUploadDto extends createZodDto(listenerUploadSchema) {}
class ListenerUploadedDto extends createZodDto(
  z.object({
    results: z.array(
      z.object({
        status: z.nativeEnum(ListenerMessageStatus).nullable(),
        transactionId: z.string().nullable(),
        reviewReason: z.nativeEnum(PaymentReviewReason).nullable(),
        ignoredReason: z.nativeEnum(ListenerIgnoredReason).nullable(),
      }),
    ),
    testModeUntil: z.coerce.date().nullable(),
  }),
) {}
class ListenerRecentDto extends createZodDto(
  z.object({
    receipts: z.array(
      z.object({
        id: z.string(),
        sender: z.string(),
        method: z.nativeEnum(PaymentMethod).nullable(),
        amount: z.string().nullable(),
        transactionId: z.string().nullable(),
        status: z.nativeEnum(ListenerMessageStatus),
        reviewReason: z.nativeEnum(PaymentReviewReason).nullable(),
        ignoredReason: z.nativeEnum(ListenerIgnoredReason).nullable(),
        orderNumber: z.string().nullable(),
        receivedAt: z.coerce.date(),
      }),
    ),
    today: z.object({ verified: z.number(), waiting: z.number(), toCheck: z.number() }),
  }),
) {}

// LSN-13 to LSN-16, VER-02 to VER-06 (Phase 5 Slice 5.4b, read agreed 2026-11-02): the app's receipts, on the API host at
// /v1/listener/messages, behind the same live checks as its other calls.
@ApiTags('Listener app')
@Controller('public/listener')
@PublicApiRoute()
@UseGuards(ListenerDeviceGuard)
export class ListenerReceiptsController {
  constructor(@Inject(ListenerReceipts) private readonly receipts: ListenerReceipts) {}

  @Post('messages')
  @HttpCode(200)
  @ResponseMessage('ListenerMessagesTaken')
  @ApiOperation({
    summary:
      'The SMS a phone forwards: at most 50 in a request of 64 KB, 1,000 characters each; 30 uploads a minute from a phone, 120 from a shop (LSN-13)',
  })
  @ApiHeader({ name: 'x-installation-id', required: true })
  @ApiHeader({ name: 'x-app-version', required: true })
  @ApiBody({ type: ListenerUploadDto })
  @ZodResponse({ type: ListenerUploadedDto })
  upload(
    @Body(new ZodValidationPipe(ListenerUploadDto.schema)) body: ListenerUploadInput,
    @Req() request: ListenerRequest,
  ): Promise<ListenerUploaded> {
    const device = request.listenerDevice;
    const version = request.listenerAppVersion;
    if (!device || version === undefined) throw new Error('the listener guard names the device');
    return this.receipts.upload(device, version, body);
  }

  @Get('messages')
  @ResponseMessage('ListenerMessagesRead')
  @ApiOperation({
    summary:
      "This phone's newest receipts as they stand, and how today's stand, for its home screen",
  })
  @ApiHeader({ name: 'x-installation-id', required: true })
  @ApiHeader({ name: 'x-app-version', required: true })
  @ZodResponse({ type: ListenerRecentDto })
  recent(
    @Query(new ZodValidationPipe(listenerRecentQuerySchema)) query: ListenerRecentQuery,
    @Req() request: ListenerRequest,
  ): Promise<ListenerRecent> {
    const device = request.listenerDevice;
    if (!device) throw new Error('the listener guard names the device');
    return this.receipts.recent(device, query);
  }
}
