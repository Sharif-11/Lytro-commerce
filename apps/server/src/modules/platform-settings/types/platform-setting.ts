export interface PlatformSettingValue {
  key: string;
  value: unknown;
  description: string;
  updatedBy: string | null;
  updatedAt: Date;
}
