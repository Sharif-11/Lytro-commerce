import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_CHAT_BUSY_MINUTES,
  DEFAULT_CHAT_HISTORY_DAYS,
  DEFAULT_CHAT_MESSAGES_PER_MINUTE,
  DEFAULT_CHAT_PHOTO_DAYS,
  PlatformSettingKey,
} from '@lytronix/validators';
import { HelpLine } from '../../help-line/services/help-line';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/** The chat's rules as the console sets them (LC-5, LC-8, LC-11, LC-25) and its hours, the help line's (LC-24). */
export interface ChatRules {
  busyMinutes: number;
  historyDays: number;
  photoDays: number;
  messagesPerMinute: number;
  opensHour: number;
  closesHour: number;
  whatsapp: string | null;
}

const DHAKA_OFFSET_HOURS = 6;

/** LC-24: whether Lytro answers now, by the help line's hours in Dhaka (a closing hour before the opening one spans midnight). */
export function openAt(at: Date, opensHour: number, closesHour: number): boolean {
  const hour = (at.getUTCHours() + DHAKA_OFFSET_HOURS) % 24;
  if (opensHour === closesHour) return true;
  return opensHour < closesHour
    ? hour >= opensHour && hour < closesHour
    : hour >= opensHour || hour < closesHour;
}

/** Reads the live chat's settings, each with its default until the operator sets it. */
@Injectable()
export class ChatSettings {
  constructor(
    @Inject(PlatformSettingsService)
    private readonly settings: Pick<PlatformSettingsService, 'current'>,
    @Inject(HelpLine) private readonly helpLine: Pick<HelpLine, 'current'>,
  ) {}

  async rules(): Promise<ChatRules> {
    const [busy, history, photos, perMinute, help] = await Promise.all([
      this.number(PlatformSettingKey.ChatBusyMinutes, DEFAULT_CHAT_BUSY_MINUTES),
      this.number(PlatformSettingKey.ChatHistoryDays, DEFAULT_CHAT_HISTORY_DAYS),
      this.number(PlatformSettingKey.ChatPhotoDays, DEFAULT_CHAT_PHOTO_DAYS),
      this.number(PlatformSettingKey.ChatMessagesPerMinute, DEFAULT_CHAT_MESSAGES_PER_MINUTE),
      this.helpLine.current(),
    ]);
    return {
      busyMinutes: busy,
      historyDays: history,
      // LC-8: a photo never outlives its message.
      photoDays: Math.min(photos, history),
      messagesPerMinute: perMinute,
      opensHour: help.opensHour,
      closesHour: help.closesHour,
      whatsapp: help.whatsapp,
    };
  }

  private async number(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' && setting.value > 0 ? setting.value : fallback;
  }
}
