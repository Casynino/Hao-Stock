import { useQuery } from '@tanstack/react-query';
import { Repeat, AlertTriangle, ShoppingBag } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { URGENCY_META } from '@/lib/constants';
import {
  PageHeader, Card, CardHeader, StatCard, PageSpinner, EmptyState, Badge,
  Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

export default function Reorder() {
  const { data, isLoading } = useQuery({
    queryKey: ['reorder'],
    queryFn: async () => unwrap(await api.get('/reorder')).data,
  });

  if (isLoading) return <PageSpinner />;
  const summary = data?.summary || {};
  const recs = data?.recommendations || [];
  const all = data?.items || [];

  return (
    <div>
      <PageHeader title="Reorder Engine" subtitle={`Velocity over the last ${summary.lookbackDays} days · target ${summary.coverDays} days of cover.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Need reorder" value={formatNumber(summary.reorderCount || 0)} icon={Repeat} tone="amber" />
        <StatCard label="Critical (≤3 days)" value={formatNumber(summary.criticalCount || 0)} icon={AlertTriangle} tone="rose" />
        <StatCard label="Est. reorder value" value={formatCurrency(summary.estimatedReorderValue || 0)} icon={ShoppingBag} tone="brand" />
        <StatCard label="Products analysed" value={formatNumber(summary.productsAnalyzed || 0)} tone="slate" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Reorder recommendations" subtitle="Ranked by urgency and projected days remaining" />
        {recs.length === 0 ? (
          <EmptyState title="Nothing to reorder" message="Stock levels are healthy based on current sales velocity." />
        ) : (
          <Table>
            <THead><TR><TH>Product</TH><TH>On hand</TH><TH>Avg/day</TH><TH>Days left</TH><TH>Recommend</TH><TH>Urgency</TH></TR></THead>
            <TBody>
              {recs.map((r) => {
                const meta = URGENCY_META[r.urgency] || {};
                return (
                  <TR key={r.productId}>
                    <TD><div className="font-medium text-foreground">{r.name}</div><div className="text-xs text-faint">{r.brand}</div></TD>
                    <TD>{formatNumber(r.onHand)} {r.baseUnitName}s</TD>
                    <TD>{r.avgDailySales}</TD>
                    <TD>{r.daysRemaining ?? '—'}</TD>
                    <TD className="font-semibold">{formatNumber(r.recommendedQty)} <span className="text-xs text-faint">({formatCurrency(r.recommendedValue)})</span></TD>
                    <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="All products — velocity" subtitle="Full picture across the catalog" />
        <Table>
          <THead><TR><TH>Product</TH><TH>On hand</TH><TH>Avg/day</TH><TH>Days left</TH><TH>Status</TH></TR></THead>
          <TBody>
            {all.map((r) => {
              const meta = URGENCY_META[r.urgency] || {};
              return (
                <TR key={r.productId}>
                  <TD>{r.name}</TD>
                  <TD>{formatNumber(r.onHand)}</TD>
                  <TD>{r.avgDailySales}</TD>
                  <TD>{r.daysRemaining ?? '—'}</TD>
                  <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
