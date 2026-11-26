import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import {
  CHAT_PHOTO_TYPES,
  chatFeatureModeSchema,
  chatPhotoStartSchema,
  chatQuickReplyOrderSchema,
  chatQuickReplySchema,
  chatSendSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  type ChatFeatureModeInput,
  type ChatPhotoStartInput,
  type ChatQuickReplyInput,
  type ChatQuickReplyOrderInput,
  type ChatSendInput,
  type PushSubscriptionInput,
  type PushUnsubscribeInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { ClientIp } from '../../../common/client-ip';
import { ResponseMessage } from '../../../common/decorators/response-message';
import { SkipTenant } from '../../../common/decorators/skip-tenant';
import { ZodValidationPipe } from '../../../common/pipes/validation.pipe';
import {
  OperatorSessionGuard,
  type OperatorSessionRequest,
} from '../../operator/guards/operator-session.guard';
import { sendChatPhoto, type ChatPhotoResponse } from '../chat-photo-response';
import {
  ChatFeatureModeDto,
  ChatFeatureStateDto,
  ChatInboxDto,
  ChatLytroDetailDto,
  ChatMessageDto,
  ChatOkDto,
  ChatPhotoStartDto,
  ChatPhotoUploadDto,
  ChatQuickRepliesDto,
  ChatQuickReplyDto,
  ChatQuickReplyOrderDto,
  ChatQuickReplyViewDto,
  ChatReadDto,
  ChatSendDto,
  ChatWaitingDto,
  OperatorPushKeyDto,
  OperatorPushSubscribedDto,
  OperatorPushSubscriptionDto,
  OperatorPushUnsubscribeDto,
} from '../dto/chat.dto';
import { ChatFeature } from '../services/chat-feature';
import { LiveChat, type ChatLytroPerson } from '../services/live-chat';
import { OperatorChatPush } from '../services/operator-chat-push';

const uuid = z.uuid();

/** A shop's ID from the path; anything else is a page that isn't there. */
function shopId(value: string): string {
  if (!uuid.safeParse(value).success) throw new ApiError('not_found', 'PageNotFound', {});
  return value;
}

function lytroPerson(request: OperatorSessionRequest, ip: string | null): ChatLytroPerson {
  const session = request.operatorSession;
  if (!session) throw new ApiError('unauthenticated', 'SignInToContinue', {});
  return { operatorId: session.operatorId, ip };
}

// LIVE-CHAT-PLAN LC-1, LC-2, LC-9, LC-13 (PR 1): Lytro's side of the chats -- the inbox, one chat with the shop beside
// it, the answer, and each shop's own switch. The operator's alone: no shop credential reaches these routes.
@ApiTags('Operator Chats')
@Controller('operator/chats')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorChatsController {
  constructor(
    @Inject(LiveChat) private readonly chat: LiveChat,
    @Inject(ChatFeature) private readonly feature: ChatFeature,
    @Inject(ClientIp) private readonly clientIp: ClientIp,
  ) {}

  @Get()
  @ResponseMessage('ChatsListed')
  @ApiOperation({ summary: "Lytro's inbox: every shop with a chat in the kept days, newest first" })
  @ZodResponse({ type: ChatInboxDto })
  async inbox(@Req() request: OperatorSessionRequest) {
    return { items: await this.chat.inbox(lytroPerson(request, null)) };
  }

  @Get('waiting')
  @ResponseMessage('ChatsWaiting')
  @ApiOperation({
    summary: "The console's floating button: chats waiting for a person, and the latest shop",
  })
  @ZodResponse({ type: ChatWaitingDto })
  waiting() {
    return this.chat.waiting();
  }

  @Get(':tenantId')
  @ResponseMessage('ChatLoaded')
  @ApiOperation({ summary: "One shop's chat, with the shop beside it" })
  @ZodResponse({ type: ChatLytroDetailDto })
  detail(@Req() request: OperatorSessionRequest, @Param('tenantId') tenantId: string) {
    return this.chat.detail(lytroPerson(request, null), shopId(tenantId));
  }

  @Post(':tenantId/messages')
  @HttpCode(201)
  @ResponseMessage('ChatMessageSent')
  @ApiOperation({ summary: "Answer a shop's chat" })
  @ApiBody({ type: ChatSendDto })
  @ZodResponse({ status: 201, type: ChatMessageDto })
  reply(
    @Req() request: OperatorSessionRequest,
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(chatSendSchema)) body: ChatSendInput,
  ) {
    return this.chat.reply(lytroPerson(request, null), shopId(tenantId), body);
  }

  @Post(':tenantId/read')
  @HttpCode(200)
  @ResponseMessage('ChatRead')
  @ApiOperation({ summary: "Mark a shop's chat read to now, for this operator" })
  @ZodResponse({ type: ChatReadDto })
  read(@Req() request: OperatorSessionRequest, @Param('tenantId') tenantId: string) {
    return this.chat.lytroRead(lytroPerson(request, null), shopId(tenantId));
  }

  @Get(':tenantId/feature')
  @ResponseMessage('ChatFeatureLoaded')
  @ApiOperation({
    summary: "The shop's chat: what its plan says, its own setting, and whether it has it",
  })
  @ZodResponse({ type: ChatFeatureStateDto })
  featureState(@Param('tenantId') tenantId: string) {
    return this.feature.state(shopId(tenantId));
  }

  @Put(':tenantId/feature')
  @ResponseMessage('ChatFeatureSet')
  @ApiOperation({ summary: "Set the shop's own chat: follow its plan, on, or off (LC-2)" })
  @ApiBody({ type: ChatFeatureModeDto })
  @ZodResponse({ type: ChatFeatureStateDto })
  setFeature(
    @Req() request: OperatorSessionRequest,
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(chatFeatureModeSchema)) body: ChatFeatureModeInput,
  ) {
    const person = lytroPerson(request, this.clientIp.resolve(request));
    return this.feature.set(shopId(tenantId), body.mode, person.operatorId, person.ip);
  }
}

// LC-8, LC-10, LC-4: Lytro's photos, quick replies and its own browsers' push, for the chats.
@ApiTags('Operator Chats')
@Controller('operator/chat')
@SkipTenant()
@UseGuards(OperatorSessionGuard)
export class OperatorChatToolsController {
  constructor(
    @Inject(LiveChat) private readonly chat: LiveChat,
    @Inject(OperatorChatPush) private readonly push: OperatorChatPush,
  ) {}

  @Post('photos')
  @HttpCode(201)
  @ResponseMessage('ChatPhotoUploadStarted')
  @ApiOperation({
    summary: 'A signed link to upload one photo to, before sending it with an answer',
  })
  @ApiBody({ type: ChatPhotoStartDto })
  @ZodResponse({ status: 201, type: ChatPhotoUploadDto })
  startPhoto(@Body(new ZodValidationPipe(chatPhotoStartSchema)) body: ChatPhotoStartInput) {
    return this.chat.startPhoto('lytro', body);
  }

  @Get('photos/:id')
  @ApiOperation({ summary: 'A chat photo, the file itself' })
  @ApiProduces(...CHAT_PHOTO_TYPES)
  async photo(@Param('id') id: string, @Res() response: ChatPhotoResponse): Promise<void> {
    sendChatPhoto(response, await this.chat.photo('lytro', shopId(id)));
  }

  @Get('quick-replies')
  @ResponseMessage('ChatQuickRepliesListed')
  @ApiOperation({ summary: "Lytro's quick replies, in order" })
  @ZodResponse({ type: ChatQuickRepliesDto })
  async quickReplies() {
    return { items: await this.chat.quickReplies() };
  }

  @Post('quick-replies')
  @HttpCode(201)
  @ResponseMessage('ChatQuickReplyAdded')
  @ApiOperation({ summary: 'Add a quick reply at the end of the list' })
  @ApiBody({ type: ChatQuickReplyDto })
  @ZodResponse({ status: 201, type: ChatQuickReplyViewDto })
  addQuickReply(@Body(new ZodValidationPipe(chatQuickReplySchema)) body: ChatQuickReplyInput) {
    return this.chat.addQuickReply(body);
  }

  @Put('quick-replies/order')
  @ResponseMessage('ChatQuickRepliesOrdered')
  @ApiOperation({ summary: 'Put the quick replies in this order' })
  @ApiBody({ type: ChatQuickReplyOrderDto })
  @ZodResponse({ type: ChatOkDto })
  async orderQuickReplies(
    @Body(new ZodValidationPipe(chatQuickReplyOrderSchema)) body: ChatQuickReplyOrderInput,
  ) {
    await this.chat.orderQuickReplies(body.ids);
    return { ok: true as const };
  }

  @Put('quick-replies/:id')
  @ResponseMessage('ChatQuickReplyChanged')
  @ApiOperation({ summary: 'Change a quick reply' })
  @ApiBody({ type: ChatQuickReplyDto })
  @ZodResponse({ type: ChatQuickReplyViewDto })
  changeQuickReply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chatQuickReplySchema)) body: ChatQuickReplyInput,
  ) {
    return this.chat.changeQuickReply(shopId(id), body);
  }

  @Delete('quick-replies/:id')
  @ResponseMessage('ChatQuickReplyRemoved')
  @ApiOperation({ summary: 'Remove a quick reply' })
  @ZodResponse({ type: ChatOkDto })
  async removeQuickReply(@Param('id') id: string) {
    await this.chat.removeQuickReply(shopId(id));
    return { ok: true as const };
  }

  @Get('push/key')
  @ResponseMessage('PushKeyRead')
  @ApiOperation({
    summary: "The public key a console browser subscribes to Lytro's chat pushes with",
  })
  @ZodResponse({ type: OperatorPushKeyDto })
  pushKey() {
    return { publicKey: this.push.publicKey };
  }

  @Post('push/subscriptions')
  @HttpCode(201)
  @ResponseMessage('PushSubscribed')
  @ApiOperation({ summary: 'Turn chat pushes on in this browser, for this operator' })
  @ApiBody({ type: OperatorPushSubscriptionDto })
  @ZodResponse({ status: 201, type: OperatorPushSubscribedDto })
  async subscribe(
    @Req() request: OperatorSessionRequest,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionInput,
  ) {
    await this.push.subscribe(lytroPerson(request, null).operatorId, body);
    return { subscribed: true };
  }

  @Post('push/subscriptions/check')
  @HttpCode(200)
  @ResponseMessage('Success')
  @ApiOperation({ summary: "Whether this browser is this operator's own subscription" })
  @ApiBody({ type: OperatorPushUnsubscribeDto })
  @ZodResponse({ type: OperatorPushSubscribedDto })
  async check(
    @Req() request: OperatorSessionRequest,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeInput,
  ) {
    return {
      subscribed: await this.push.holds(lytroPerson(request, null).operatorId, body.endpoint),
    };
  }

  @Delete('push/subscriptions')
  @ResponseMessage('PushUnsubscribed')
  @ApiOperation({ summary: 'Turn chat pushes off in this browser' })
  @ApiBody({ type: OperatorPushUnsubscribeDto })
  @ZodResponse({ type: OperatorPushSubscribedDto })
  async unsubscribe(
    @Req() request: OperatorSessionRequest,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeInput,
  ) {
    await this.push.unsubscribe(lytroPerson(request, null).operatorId, body.endpoint);
    return { subscribed: false };
  }
}
