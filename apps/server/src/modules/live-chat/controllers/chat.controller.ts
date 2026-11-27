import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  CHAT_PHOTO_TYPES,
  chatPhotoStartSchema,
  chatSendSchema,
  type ChatPhotoStartInput,
  type ChatSendInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { Dashboard } from '../../../common/decorators/dashboard';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import { DashboardGuard, type DashboardRequest } from '../../identity/guards/dashboard.guard';
import { SessionGuard } from '../../identity/guards/session.guard';
import {
  ChatMessageDto,
  ChatPhotoStartDto,
  ChatPhotoUploadDto,
  ChatReadDto,
  ChatSendDto,
  ChatViewDto,
} from '../dto/chat.dto';
import { sendChatPhoto, type ChatPhotoResponse } from '../chat-photo-response';
import { LiveChat, type ChatShopPerson } from '../services/live-chat';

// LIVE-CHAT-PLAN LC-1, LC-6, LC-8, LC-13 (PR 1): a shop's one chat with Lytro, for its owner and every staff member. The
// owner still reaches it while the shop is locked, archived or suspended -- that's when Lytro's help matters most --
// and it still writes in read-only.
@ApiTags('Chat')
@Controller('chat')
@Dashboard({ lapsed: true, suspendedOwner: true, readOnlyWrite: true })
@UseGuards(SessionGuard, DashboardGuard)
export class ChatController {
  constructor(@Inject(LiveChat) private readonly chat: LiveChat) {}

  @Get()
  @ResponseMessage('ChatLoaded')
  @ApiOperation({
    summary: "The shop's chat with Lytro: on or not, the hours, and the kept days' messages",
  })
  @ZodResponse({ type: ChatViewDto })
  view(@Req() request: DashboardRequest) {
    return this.chat.view(this.person(request));
  }

  @Post('messages')
  @HttpCode(201)
  @ResponseMessage('ChatMessageSent')
  @ApiOperation({ summary: 'Write to Lytro: words, up to three photos, or both' })
  @ApiBody({ type: ChatSendDto })
  @ZodResponse({ status: 201, type: ChatMessageDto })
  send(
    @Req() request: DashboardRequest,
    @Body(new ZodValidationPipe(chatSendSchema)) body: ChatSendInput,
  ) {
    return this.chat.send(this.person(request), body);
  }

  @Post('read')
  @HttpCode(200)
  @ResponseMessage('ChatRead')
  @ApiOperation({ summary: "Mark the chat read to now, for the session's own person" })
  @ZodResponse({ type: ChatReadDto })
  read(@Req() request: DashboardRequest) {
    return this.chat.read(this.person(request));
  }

  @Post('photos')
  @HttpCode(201)
  @ResponseMessage('ChatPhotoUploadStarted')
  @ApiOperation({
    summary: 'A signed link to upload one photo to, before sending it with a message',
  })
  @ApiBody({ type: ChatPhotoStartDto })
  @ZodResponse({ status: 201, type: ChatPhotoUploadDto })
  startPhoto(
    @Req() request: DashboardRequest,
    @Body(new ZodValidationPipe(chatPhotoStartSchema)) body: ChatPhotoStartInput,
  ) {
    return this.chat.startPhoto({ tenantId: this.person(request).tenantId }, body);
  }

  @Get('photos/:id')
  @ApiOperation({ summary: "A photo of the shop's chat, the file itself" })
  @ApiProduces(...CHAT_PHOTO_TYPES)
  async photo(
    @Req() request: DashboardRequest,
    @Param('id') id: string,
    @Res() response: ChatPhotoResponse,
  ): Promise<void> {
    sendChatPhoto(response, await this.chat.photo({ tenantId: this.person(request).tenantId }, id));
  }

  private person(request: DashboardRequest): ChatShopPerson {
    const tenantId = request.tenant?.id;
    if (!tenantId) throw new ApiError('not_found', 'PageNotFound', {});
    return { tenantId, sessionUserId: request.session?.userId ?? null };
  }
}
