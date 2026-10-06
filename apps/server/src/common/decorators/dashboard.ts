import { SetMetadata } from '@nestjs/common';

export const DASHBOARD = 'dashboard';

export interface DashboardOptions {
  /** Owners may still reach this route when the shop is locked, archived or deleted (LIF-11, AUTH-23). */
  lapsed?: boolean;
  /** The route also answers a session that has no shop yet, on the platform host (the account summary). */
  withoutShop?: boolean;
}

/** Marks a dashboard route. The DashboardGuard picks the shop from the host and the session, not from the global tenant guard. */
export const Dashboard = (options: DashboardOptions = {}): MethodDecorator & ClassDecorator =>
  SetMetadata(DASHBOARD, options);
