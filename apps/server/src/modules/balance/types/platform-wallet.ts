export interface PlatformWallet {
  id: string;
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
  createdAt: Date;
}
