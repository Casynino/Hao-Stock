import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, HandCoins, ClipboardList, Coins, Timer, Globe, Boxes, Activity as ActivityIcon,
} from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { fromNow } from '@/lib/format';
import { PageHeader, Card, PageSpinner, EmptyState } from '@/components/ui';

const KIND = {
  SALE: { icon: ShoppingCart, cls: 'bg-blue-100 text-blue-700' },
  PAYMENT: { icon: HandCoins, cls: 'bg-emerald-100 text-emerald-700' },
  STOCK_REQUEST: { icon: ClipboardList, cls: 'bg-amber-100 text-amber-700' },
  WITHDRAWAL: { icon: Coins, cls: 'bg-violet-100 text-violet-700' },
  SETTLEMENT: { icon: Timer, cls: 'bg-sky-100 text-sky-700' },
  ONLINE_ORDER: { icon: Globe, cls: 'bg-indigo-100 text-indigo-700' },
  MOVEMENT: { icon: Boxes, cls: 'bg-elevated text-muted' },
};

export default function Activity() {
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => unwrap(await api.get('/activity', { params: { limit: 50 } })).data,
    refetchInterval: 15_000, // near real-time
  });

  return (
    <div>
      <PageHeader title="Activity Feed" subtitle="Everything happening across the business, updating live." />
      <Card>
        {isLoading ? <PageSpinner /> : !data?.length ? (
          <EmptyState title="No recent activity" icon={ActivityIcon} />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((a, i) => {
              const k = KIND[a.kind] || KIND.MOVEMENT;
              const Icon = k.icon;
              return (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <span className={`mt-0.5 rounded-lg p-2 ${k.cls}`}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    {a.detail && <div className="text-sm text-muted">{a.detail}</div>}
                    <div className="mt-0.5 text-xs text-faint">{a.by ? `${a.by} · ` : ''}{fromNow(a.at)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
