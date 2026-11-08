import { createFileRoute } from '@tanstack/react-router';
import { NoticePage } from '@/views/notices/notice-page';

// One of Lytro's notices (§7.40, Part 37's `p37-notice`; NTC-05, NTC-08, NTC-15): its words and the owner's "I understand".
export const Route = createFileRoute('/$shop/notices_/$noticeId')({
  staticData: {
    screen: { hub: 'menu', section: 'notices', title: 'secNotices', back: '/$shop/notices' },
  },
  component: NoticeRoute,
});

function NoticeRoute(): React.JSX.Element {
  const { noticeId } = Route.useParams();
  return <NoticePage id={noticeId} />;
}
