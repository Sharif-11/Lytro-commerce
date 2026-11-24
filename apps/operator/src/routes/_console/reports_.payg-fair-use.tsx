import { createFileRoute } from '@tanstack/react-router';
import { PaygFairUseReportView } from '@/views/reports/payg-fair-use';

// PAYG-FAIR-USE-PLAN PF-16, PF-38: the pay-as-you-go fair-use report, a page of its own beside Reports.
export const Route = createFileRoute('/_console/reports_/payg-fair-use')({
  component: PaygFairUseReportView,
});
