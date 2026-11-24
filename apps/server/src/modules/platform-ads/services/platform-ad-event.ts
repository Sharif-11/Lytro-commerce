import type {
  MetaServerEvent,
  MetaUserData,
} from '../../shared/meta-conversions/ports/meta-conversions';
import { metaHash, metaPhoneOf } from '../../shared/meta-conversions/services/meta-user-data';
import { PlatformAdEvent, type PlatformAdJob } from '../types/platform-ad';

/**
 * MKT-02, MKT-03: a queued event as Meta's Conversions API takes it. An event with a visit happened in someone's browser
 * (`website`, with the page, address, browser and Meta's cookies); one without, Lytro's server saw alone
 * (`system_generated`). A shop's later events are told of by the owner's phone, read as they are sent.
 */
export function platformEventOf(job: PlatformAdJob, ownerPhone: string | null): MetaServerEvent {
  const phone = job.hashedPhone ?? (ownerPhone !== null ? metaHash(metaPhoneOf(ownerPhone)) : null);
  const visit = job.visit;
  const userData: MetaUserData = {
    ...(phone !== null ? { ph: [phone] } : {}),
    ...(job.hashedExternalId !== null ? { external_id: [job.hashedExternalId] } : {}),
    ...(visit?.ip ? { client_ip_address: visit.ip } : {}),
    ...(visit?.userAgent ? { client_user_agent: visit.userAgent } : {}),
    ...(visit?.fbp ? { fbp: visit.fbp } : {}),
    ...(visit?.fbc ? { fbc: visit.fbc } : {}),
  };
  return {
    event_name: job.event,
    event_time: job.eventTime,
    event_id: job.eventId,
    action_source: visit !== null ? 'website' : 'system_generated',
    ...(visit?.pageUrl ? { event_source_url: visit.pageUrl } : {}),
    user_data: userData,
    ...(job.event === PlatformAdEvent.Subscribe && job.value !== null
      ? { custom_data: { currency: 'BDT', value: Number(job.value) } }
      : {}),
  };
}
