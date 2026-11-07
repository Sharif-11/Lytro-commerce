import { createFileRoute } from '@tanstack/react-router';
import { CourierView } from '@/views/couriers/connection';

// Settings' Couriers (§7.39): one connection, its courier's name its title.
export const Route = createFileRoute('/$shop/settings_/couriers_/$courierKey')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sCourier',
      back: '/$shop/settings/couriers',
    },
  },
  component: CourierRoute,
});

function CourierRoute(): React.JSX.Element {
  const { courierKey } = Route.useParams();
  return <CourierView courierKey={courierKey} />;
}
