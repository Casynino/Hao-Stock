import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, X, ClipboardCheck, PackageSearch } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useProducts, useWarehouses, useSalesReps } from '@/lib/hooks';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import {
  PageHeader, Card, CardHeader, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Input, Textarea, StatCard,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function CountModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: reps = [] } = useSalesReps();
  const [source, setSource] = useState('');
  const [rows, setRows] = useState([{ productId: '', countedQuantity: 0 }]);
  const [notes, setNotes] = useState('');

  const setRow = (i, p) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const save = useMutation({
    mutationFn: () => {
      const locationType = source.startsWith('w:') ? 'WAREHOUSE' : 'SALES_REP';
      const payload = {
        locationType,
        items: rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, countedQuantity: Number(r.countedQuantity) })),
        notes: notes || undefined,
      };
      if (locationType === 'WAREHOUSE') payload.warehouseId = source.slice(2);
      else payload.salesRepId = source.slice(2);
      return api.post('/stock-counts', payload);
    },
    onSuccess: () => { toast.success('Stock count recorded'); qc.invalidateQueries({ queryKey: ['stock-counts'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const valid = source && rows.some((r) => r.productId);

  return (
    <Modal open onClose={onClose} size="lg" title="New stock count"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>Reconcile</Button></>}>
      <div className="space-y-4">
        <Field label="Count location" required hint="The ledger balance will be compared to your physical count">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select…</option>
            <optgroup label="Warehouses">{warehouses.map((w) => <option key={w.id} value={`w:${w.id}`}>{w.name}</option>)}</optgroup>
            <optgroup label="Sales reps">{reps.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.user?.name} ({r.code})</option>)}</optgroup>
          </Select>
        </Field>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Counted quantities (base units)</span>
            <button type="button" onClick={() => setRows([...rows, { productId: '', countedQuantity: 0 }])} className="text-xs font-medium text-brand-600 hover:underline">+ Add</button>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value })} className="flex-1">
                <option value="">Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="number" min="0" value={r.countedQuantity} onChange={(e) => setRow(i, { countedQuantity: e.target.value })} className="w-32" placeholder="Counted" />
              <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-faint hover:text-rose-600"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CountList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['stock-counts', { page }],
    queryFn: async () => unwrap(await api.get('/stock-counts', { params: { page, limit: 15 } })),
  });
  if (isLoading) return <PageSpinner />;
  if (!data?.data?.length) return <EmptyState title="No stock counts yet" icon={ClipboardCheck} />;
  return (
    <Card>
      <Table>
        <THead><TR><TH>Count</TH><TH>Location</TH><TH>Items</TH><TH>Variances</TH><TH>Date</TH></TR></THead>
        <TBody>
          {data.data.map((c) => {
            const variances = c.items.filter((i) => i.varianceBase !== 0).length;
            return (
              <TR key={c.id}>
                <TD className="font-medium">{c.countNumber}</TD>
                <TD>{c.warehouse?.name || (c.locationType === 'SALES_REP' ? 'Sales rep' : '—')}</TD>
                <TD>{c.items.length}</TD>
                <TD>{variances > 0 ? <Badge className="bg-amber-100 text-amber-700">{variances} variance(s)</Badge> : <Badge className="bg-emerald-100 text-emerald-700">Matched</Badge>}</TD>
                <TD className="text-faint">{formatDate(c.countedAt)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
    </Card>
  );
}

function MissingReport() {
  const { data, isLoading } = useQuery({ queryKey: ['stock-counts', 'missing'], queryFn: async () => unwrap(await api.get('/stock-counts/missing')).data });
  if (isLoading) return <PageSpinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Missing units" value={formatNumber(data?.totals.totalUnits || 0)} icon={PackageSearch} tone="rose" />
        <StatCard label="Loss value" value={formatCurrency(data?.totals.totalValue || 0)} icon={PackageSearch} tone="rose" />
        <StatCard label="Incidents" value={data?.totals.count || 0} icon={PackageSearch} tone="amber" />
      </div>
      <Card>
        <CardHeader title="Missing & damaged stock" subtitle="Negative stock-count and damage entries" />
        {!data?.items?.length ? <EmptyState title="No missing stock recorded" message="Great — everything reconciles." /> : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Type</TH><TH>Product</TH><TH>Units</TH><TH>Value</TH><TH>Location</TH></TR></THead>
            <TBody>{data.items.map((it) => (
              <TR key={it.id}>
                <TD className="text-muted">{formatDate(it.occurredAt)}</TD>
                <TD><Badge className={it.type === 'DAMAGE' ? 'bg-rose-100 text-rose-700' : 'bg-fuchsia-100 text-fuchsia-700'}>{it.type}</Badge></TD>
                <TD>{it.product}</TD>
                <TD className="font-semibold text-rose-600">-{formatNumber(it.units)}</TD>
                <TD>{formatCurrency(it.value)}</TD>
                <TD>{it.location}</TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function StockCounts() {
  const [tab, setTab] = useState('counts');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Stock Counts" subtitle="Reconcile physical stock and surface what's missing.">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New count</Button>
      </PageHeader>
      <div className="mb-4 flex gap-2">
        {[['counts', 'Counts'], ['missing', 'Missing stock']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? 'bg-brand-600 text-slate-950' : 'bg-surface text-muted hover:bg-elevated'}`}>{label}</button>
        ))}
      </div>
      {tab === 'counts' ? <CountList /> : <MissingReport />}
      {open && <CountModal onClose={() => setOpen(false)} />}
    </div>
  );
}
