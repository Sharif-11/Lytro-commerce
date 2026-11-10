import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_HELP_CLOSES_HOUR,
  DEFAULT_HELP_OPENS_HOUR,
  PlatformSettingKey,
} from '@lytronix/validators';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';

/** D8-76: a number not set yet, or cleared (stored empty), is none. */
function numberOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** D8-4, D8-68: Lytro's help line, as every page that shows it reads it. */
export interface HelpLineView {
  /** Bangladeshi mobile numbers in their local form (01XXXXXXXXX); null until the operator sets one or after it is cleared. */
  whatsapp: string | null;
  phone: string | null;
  /** Hours of a 24-hour clock in Dhaka, every day; each page writes them in its own words. */
  opensHour: number;
  closesHour: number;
}

/**
 * D8-4, D8-68, D8-69 (Phase 8 Slice 8.7, read agreed 2026-11-10): Lytro's one help line -- its WhatsApp and phone numbers and
 * its hours -- set in the console's settings, so the dashboard, Lytro's payment page and the website all show the same one,
 * not a number of their own each. A number not set yet is shown nowhere.
 */
@Injectable()
export class HelpLine {
  constructor(
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  async current(): Promise<HelpLineView> {
    const [whatsapp, phone, opens, closes] = await Promise.all([
      this.settings.current(PlatformSettingKey.HelpWhatsapp),
      this.settings.current(PlatformSettingKey.HelpPhone),
      this.settings.current(PlatformSettingKey.HelpOpensHour),
      this.settings.current(PlatformSettingKey.HelpClosesHour),
    ]);
    return {
      whatsapp: numberOf(whatsapp?.value),
      phone: numberOf(phone?.value),
      opensHour: typeof opens?.value === 'number' ? opens.value : DEFAULT_HELP_OPENS_HOUR,
      closesHour: typeof closes?.value === 'number' ? closes.value : DEFAULT_HELP_CLOSES_HOUR,
    };
  }
}
