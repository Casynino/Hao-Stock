import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Wallet, Coins, Boxes, Package } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  PageHeader, Card, CardHeader, CardBody, StatCard, PageSpinner, EmptyState,
  Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']];
const PERIOD_LABEL = { today: 'today', week: 'this week', month: 'this month', all: 'all time' };
const BRAND_TONE = {
  OHIS: { card: 'border-emerald-500/30 bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-400' },
  CIVLILY: { card: 'border-violet-500/30 bg-violet-500/5', badge: 'bg-violet-500/15 text-violet-400' },
};

function Money({ label, value, tone }) {
  const tones = { default: 'text-foreground', emerald: 'text-emerald-400' };
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${tones[tone] || tones.default}`}>{value}</div>
    </div>
  );
}

export default function Profit() {
  const [period, setPeriod] = useState('month');
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'profit-overview', period],
    queryFn: async () => unwrap(await api.get('/reports/profit-overview', { params: { period } })).data,
  });

  return (
    <div>
      <PageHeader title="Profit & Margins" subtitle="Real profit from settled sales — selling price minus cost price, per box.">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${period === k ? 'bg-brand-500 text-slate-950' : 'border border-border text-muted hover:bg-elevated'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {isLoading || !data ? <PageSpinner /> : (
        <div className="space-y-8">
          {/* Business profit overview */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard label="Total revenue" value={formatCurrency(data.totals.revenue)} icon={TrendingUp} tone="emerald" hint={`${formatNumber(data.totals.boxes)} boxes sold`} />
            <StatCard label="Cost of goods sold" value={formatCurrency(data.totals.cost)} icon={Package} tone="slate" />
            <StatCard label="Gross profit" value={formatCurrency(data.totals.profit)} icon={Wallet} tone="brand" />
            <StatCard label="Profit margin" value={`${data.totals.margin}%`} icon={Coins} tone="violet" />
          </div>

          {/* Profit by brand */}
          {data.byBrand.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Profit by brand</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {data.byBrand.map((b) => {
                  const t = BRAND_TONE[b.name?.toUpperCase()] || { card: 'border-border bg-surface', badge: 'bg-elevated text-muted' };
                  return (
                    <div key={b.brandId} className={`rounded-2xl border p-4 ${t.card}`}>
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.badge}`}>{b.name}</span>
                        <span className="text-sm font-bold text-foreground">{b.margin}% margin</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5">
                        <Money label="Revenue" value={formatCurrency(b.revenue)} />
                        <Money label="Cost" value={formatCurrency(b.cost)} />
                        <Money label="Profit" value={formatCurrency(b.profit)} tone="emerald" />
                      </div>
                      <div className="mt-2 text-xs text-faint">{formatNumber(b.boxes)} boxes sold {PERIOD_LABEL[period]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Value sitting in The Lab */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Value sitting in The Lab</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Inventory value (cost)" value={formatCurrency(data.inventoryValue.costValue)} icon={Boxes} tone="slate" hint={`${formatNumber(data.inventoryValue.units)} boxes on hand`} />
              <StatCard label="Potential revenue" value={formatCurrency(data.inventoryValue.potentialRevenue)} icon={TrendingUp} tone="emerald" hint="if all sold at selling price" />
              <StatCard label="Potential profit" value={formatCurrency(data.inventoryValue.potentialProfit)} icon={Wallet} tone="brand" hint="locked in current stock" />
            </div>
          </div>

          {/* Most profitable products */}
          <Card>
            <CardHeader title="Most profitable products" subtitle={`By profit, ${PERIOD_LABEL[period]}`} />
            <CardBody>
              {!data.byProduct.length ? <EmptyState title="No sales in this period" icon={Package} /> : (
                <Table>
                  <THead><TR><TH>Product</TH><TH>Boxes sold</TH><TH>Profit / box</TH><TH>Revenue</TH><TH>Profit</TH><TH>Margin</TH></TR></THead>
                  <TBody>
                    {data.byProduct.map((p) => (
                      <TR key={p.productId}>
                        <TD className="font-medium text-foreground">{p.name}</TD>
                        <TD>{formatNumber(p.boxes)}</TD>
                        <TD>{formatCurrency(p.profitPerBox)}</TD>
                        <TD>{formatCurrency(p.revenue)}</TD>
                        <TD className="font-semibold text-emerald-500">{formatCurrency(p.profit)}</TD>
                        <TD>{p.margin}%</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          {/* Profit by sales rep */}
          <Card>
            <CardHeader title="Profit by sales rep" subtitle="Revenue & profit generated from settled boxes" />
            <CardBody>
              {!data.byRep.length ? <EmptyState title="No rep sales in this period" icon={TrendingUp} /> : (
                <Table>
                  <THead><TR><TH>Sales rep</TH><TH>Boxes sold</TH><TH>Revenue</TH><TH>Profit</TH><TH>Margin</TH></TR></THead>
                  <TBody>
                    {data.byRep.map((r) => (
                      <TR key={r.salesRepId}>
                        <TD className="font-medium text-foreground">{r.name}</TD>
                        <TD>{formatNumber(r.boxes)}</TD>
                        <TD>{formatCurrency(r.revenue)}</TD>
                        <TD className="font-semibold text-emerald-500">{formatCurrency(r.profit)}</TD>
                        <TD>{r.margin}%</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
