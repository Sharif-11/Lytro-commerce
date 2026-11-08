import { Module } from '@nestjs/common';
import { DrizzleNoticeStore } from '../../database/adapters/notices.adapter';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatorModule } from '../operator/operator.module';
import { NoticeBoard } from './services/notice-board';
import { NoticeDesk } from './services/notice-desk';
import { NoticePublisher } from './services/notice-publisher';
import { NOTICE_STORE, NOTICES_CLOCK } from './tokens';

// NTC-01 to NTC-18 (Phase 7 Slice 7.4): Lytro's notices to shops -- the operator's desk, each shop's board, and the
// minute pass that sends them. Sending goes through the bell, push and email of NotificationsModule (Slice 7.3).
@Module({
  imports: [AuditModule, NotificationsModule, OperatorModule],
  providers: [
    { provide: NOTICE_STORE, useClass: DrizzleNoticeStore },
    { provide: NOTICES_CLOCK, useValue: (): Date => new Date() },
    NoticeBoard,
    NoticeDesk,
    NoticePublisher,
  ],
  exports: [NoticeBoard, NoticeDesk, NoticePublisher],
})
export class NoticesModule {}
