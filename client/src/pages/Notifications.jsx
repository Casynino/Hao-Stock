import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BellRing, CheckCheck, Bell } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { SEVERITY_META } from '@/lib/constants';
import { fromNow } from '@/lib/format';
import { PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Pagination } from '@/components/ui';

export default function Notifications() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', { page }],
    queryFn: async () => unwrap(await api.get('/notifications', { params: { page, limit: 20 } })),
  });

  const markRead = useMutation({
    mutationFn: (id) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      toast.success('All marked as read');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Stock, debt and operational alerts.">
        <Button variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </PageHeader>

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : !data?.data?.length ? (
          <EmptyState title="You're all caught up" message="No notifications right now." icon={Bell} />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {data.data.map((n) => {
                const sev = SEVERITY_META[n.severity] || SEVERITY_META.INFO;
                return (
                  <li key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.isRead ? 'opacity-70' : 'bg-brand-50/40'}`}>
                    <span className={`mt-0.5 rounded-lg p-2 ${sev.cls}`}><BellRing className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{n.title}</span>
                        <Badge className={sev.cls}>{n.severity}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{n.message}</p>
                      <p className="mt-1 text-xs text-faint">{fromNow(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <button onClick={() => markRead.mutate(n.id)} className="text-xs font-medium text-brand-600 hover:underline">
                        Mark read
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
