import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Boxes, Coins, Timer, ClipboardList, Wallet, Eye } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/format';
import { SETTLEMENT_STATUS_META } from '@/lib/constants';
import OrderDetailModal from '@/components/OrderDetail';
import {
  PageHeader, StatCard, Card, CardHeader, PageSpinner, EmptyState, Badge,
  Table, THead, TBody, TR, TH, TD, Button,
} from '@/components/ui';

function hoursLabel(h) {
  if (h == null) return '—';
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

export default function RepDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: async () => unwrap(await api.get('/dashboard/me')).data,
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <EmptyState title="No data yet" />;

  const { heldStock, commission, openSettlements, openSettlementsValue, pendingRequests, orders } = data;

  return (
    <div>
      <PageHeader title={`Hello, ${user?.name?.split(' ')[0]}`} subtitle="Your stock, open orders and commission.">
        <Button onClick={() => navigate('/stock-requests')}><ClipboardList className="h-4 w-4" /> Request stock</Button>
      </PageHeader>

      {/* Commission — earned on settled boxes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Boxes settled" value={formatNumber(commission?.boxesSettled || 0)} icon={TrendingUp} tone="brand" hint={`${formatCurrency(commission?.rule?.perBox || 0)} / box`} />
        <StatCard label="Commission earned" value={formatCurrency(commission?.earned || 0)} icon={Coins} tone="violet" />
        <StatCard label="Commission paid" value={formatCurrency(commission?.paid || 0)} icon={Wallet} tone="emerald" />
        <StatCard label="Commission remaining" value={formatCurrency(commission?.pending || 0)} icon={Coins} tone="amber" hint={`${formatCurrency(commission?.available || 0)} to withdraw`} onClick={() => navigate('/commissions')} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Stock you hold" value={formatCurrency(heldStock.value)} icon={Boxes} tone="amber" hint={`${formatNumber(heldStock.units)} boxes · ${heldStock.lines} products`} />
        <StatCard label="Open orders (72h)" value={formatNumber(openSettlements || 0)} icon={Timer} tone="rose" hint={`${formatCurrency(openSettlementsValue || 0)} to settle`} onClick={() => navigate('/settlements')} />
        <StatCard label="Pending stock requests" value={formatNumber(pendingRequests || 0)} icon={ClipboardList} tone="slate" onClick={() => navigate('/stock-requests')} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Your open orders" subtitle="Settle every box (pay) or return it before the 72-hour deadline." />
        {!orders?.length ? (
          <EmptyState title="No open orders" message="Request stock to get started — once approved it appears here to settle." icon={Timer} />
        ) : (
          <Table>
            <THead><TR><TH>Order</TH><TH>Value</TH><TH>Settled</TH><TH>Balance</TH><TH>Deadline</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id} className="cursor-pointer" onClick={() => setViewing(o.id)}>
                  <TD className="font-medium">{o.settlementNumber}</TD>
                  <TD>{formatCurrency(o.value)}</TD>
                  <TD className="text-emerald-500">{formatCurrency(o.settled)}</TD>
                  <TD className={o.balance > 0 ? 'font-semibold text-rose-500' : 'text-faint'}>{formatCurrency(o.balance)}</TD>
                  <TD>
                    <div className="text-muted">{formatDateTime(o.deadlineAt)}</div>
                    <div className={`text-xs ${o.hoursRemaining < 0 ? 'text-rose-500' : o.approaching ? 'text-amber-500' : 'text-faint'}`}>{hoursLabel(o.hoursRemaining)}</div>
                  </TD>
                  <TD><Badge className={SETTLEMENT_STATUS_META[o.status]?.cls}>{SETTLEMENT_STATUS_META[o.status]?.label}</Badge></TD>
                  <TD><span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">Settle <Eye className="h-3.5 w-3.5" /></span></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {viewing && <OrderDetailModal settlementId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
