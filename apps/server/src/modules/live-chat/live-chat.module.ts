import { Module } from '@nestjs/common';
import { DrizzleChatStore } from '../../database/adapters/live-chat.adapter';
import { AuditModule } from '../audit/audit.module';
import { HelpLineModule } from '../help-line/help-line.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatorModule } from '../operator/operator.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ChatController } from './controllers/chat.controller';
import {
  OperatorChatsController,
  OperatorChatToolsController,
} from './controllers/operator-chat.controller';
import { ChatBus } from './services/chat-bus';
import { ChatFeature } from './services/chat-feature';
import { ChatPush } from './services/chat-push';
import { ChatSettings } from './services/chat-settings';
import { ChatSockets } from './services/chat-sockets';
import { LiveChat } from './services/live-chat';
import { OperatorChatPush } from './services/operator-chat-push';
import { CHAT_CLOCK, CHAT_STORE } from './tokens';

// LIVE-CHAT-PLAN (the owner, 2026-11-27), PR 1 without the AI: live chat between a shop's owner and staff and Lytro --
// the routes on both sides, the live connection, the busy and outside-hours lines, and the nightly clean-up.
@Module({
  imports: [
    AuditModule,
    HelpLineModule,
    IdentityModule,
    MediaModule,
    NotificationsModule,
    OperatorModule,
    PlatformSettingsModule,
    TenancyModule,
  ],
  controllers: [ChatController, OperatorChatsController, OperatorChatToolsController],
  providers: [
    { provide: CHAT_STORE, useClass: DrizzleChatStore },
    { provide: CHAT_CLOCK, useValue: (): Date => new Date() },
    ChatBus,
    ChatFeature,
    ChatPush,
    ChatSettings,
    ChatSockets,
    LiveChat,
    OperatorChatPush,
  ],
  exports: [LiveChat, ChatFeature],
})
export class LiveChatModule {}
