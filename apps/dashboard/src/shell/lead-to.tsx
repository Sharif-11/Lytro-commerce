import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * Sends the shop's person to its Plan or Renew page, once, replacing the path they asked for (TENANT-DASHBOARD-DESIGN
 * §7.20). Not the router's `<Navigate>`, which navigates again on every render while the move is pending.
 */
export function LeadTo({ slug, page }: { slug: string; page: 'plan' | 'renew' }): null {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({
      to: page === 'plan' ? '/$shop/plan' : '/$shop/renew',
      params: { shop: slug },
      replace: true,
    });
  }, [navigate, page, slug]);
  return null;
}
