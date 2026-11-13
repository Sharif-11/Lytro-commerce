export interface SignupSettings {
  now(): Date;
  shopUrl(address: string): string;
  dashboardUrl(address: string): string;
}
