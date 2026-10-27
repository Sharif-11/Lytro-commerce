import { TenantState } from '@lytronix/validators';
import { useShell } from '@/shell/shell-context';
import { PaygPage } from './payg-page';
import { PlanPage } from './plan-page';

/**
 * Plan (TENANT-DASHBOARD-DESIGN §7.12): a pay-as-you-go shop's own page, else the plan page of a trial or a paid plan.
 * A locked or archived shop never reaches it: the shell sends it to the Renew page (§7.20). `openPlanId` opens that
 * plan's sheet once its price is read (Usage's "To raise it", Slice 11.5c).
 */
export function PlanView({ openPlanId }: { openPlanId: string | null }): React.JSX.Element {
  const { tenant } = useShell();
  return tenant.state === TenantState.PayAsYouGo ? (
    <PaygPage openPlanId={openPlanId} />
  ) : (
    <PlanPage openPlanId={openPlanId} />
  );
}
