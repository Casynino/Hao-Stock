import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PackagePlus, SlidersHorizontal, Boxes, Warehouse, Truck } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useProducts, useWarehouses, useSalesReps, useDebounce } from '@/lib/hooks';
import { formatCurrency, formatNumber, formatDateTime, pluralizeUnit } from '@/lib/format';
import { MOVEMENT_META } from '@/lib/constants';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Input, Textarea,
  SearchInput, Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function ReceiveModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/inventory/stock-in', {
      warehouseId,
      items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity) })),
      notes: notes || undefined,
    }),
    onSuccess: () => { toast.success('Stock received'); qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} size="lg" title="Receive stock"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!warehouseId || !items.some((l) => l.productId && l.quantity > 0)} onClick={() => save.mutate()}>Receive</Button></>}>
      <div className="space-y-4">
        <Field label="Into warehouse" required>
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Select…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </Field>
        <ItemLines products={products} value={items} onChange={setItems} />
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ mode, onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: reps = [] } = useSalesReps();
  const [source, setSource] = useState('');
  const [productId, setProductId] = useState('');
  const [packagingUnitId, setPackagingUnitId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState('DECREASE');
  const [reason, setReason] = useState('');

  const product = products.find((p) => p.id === productId);
  const packagings = (product?.packagings || []).slice().sort((a, b) => a.baseQuantity - b.baseQuantity);

  const buildLocation = () => {
    if (source.startsWith('w:')) return { type: 'WAREHOUSE', warehouseId: source.slice(2) };
    if (source.startsWith('r:')) return { type: 'SALES_REP', salesRepId: source.slice(2) };
    return null;
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { location: buildLocation(), productId, packagingUnitId, quantity: Number(quantity), reason };
      if (mode === 'adjust') return api.post('/inventory/adjustments', { ...body, direction });
      return api.post('/inventory/damage', body);
    },
    onSuccess: () => { toast.success(mode === 'adjust' ? 'Adjustment posted' : 'Damage recorded'); qc.invalidateQueries({ queryKey: ['inventory'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const valid = source && productId && packagingUnitId && quantity > 0 && reason.trim();

  return (
    <Modal open onClose={onClose} title={mode === 'adjust' ? 'Stock adjustment' : 'Record damage'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{mode === 'adjust' ? 'Post adjustment' : 'Record damage'}</Button></>}>
      <div className="space-y-4">
        <Field label="Location" required>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Select…</option>
            <optgroup label="Warehouses">{warehouses.map((w) => <option key={w.id} value={`w:${w.id}`}>{w.name}</option>)}</optgroup>
            <optgroup label="Sales reps">{reps.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.user?.name} ({r.code})</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Product" required>
          <Select value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((x) => x.id === e.target.value); const b = p?.packagings?.find((k) => k.isBaseUnit) || p?.packagings?.[0]; setPackagingUnitId(b?.packagingUnitId || ''); }}>
            <option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Packaging">
            <Select value={packagingUnitId} onChange={(e) => setPackagingUnitId(e.target.value)} disabled={!product}>
              {packagings.map((pk) => <option key={pk.id} value={pk.packagingUnitId}>{pk.packagingUnit.name} (×{pk.baseQuantity})</option>)}
            </Select>
          </Field>
          <Field label="Quantity"><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
        </div>
        {mode === 'adjust' && (
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="DECREASE">Decrease (remove)</option><option value="INCREASE">Increase (add)</option>
            </Select>
          </Field>
        )}
        <Field label="Reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

const BRAND_CHIP = {
  OHIS: 'bg-emerald-100 text-emerald-700',
  CIVILLY: 'bg-violet-100 text-violet-700',
};

function Balances() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const debounced = useDebounce(search);
  const { data: brands = [] } = useQuery({
    queryKey: ['brands', 'all'],
    queryFn: async () => unwrap(await api.get('/brands', { params: { limit: 50 } })).data,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'balances', { page, search: debounced, brand }],
    queryFn: async () => unwrap(await api.get('/inventory/balances', { params: { page, limit: 24, search: debounced, brand: brand || undefined } })),
  });

  const rows = data?.data || [];
  const max = Math.max(1, ...rows.map((r) => r.totalBase));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="max-w-sm flex-1"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search product…" /></div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setBrand(''); setPage(1); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${brand === '' ? 'bg-brand-500 text-slate-950' : 'border border-border text-muted hover:bg-elevated'}`}>All brands</button>
          {brands.map((b) => (
            <button key={b.id} onClick={() => { setBrand(b.name); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${brand === b.name ? 'bg-brand-500 text-slate-950' : 'border border-border text-muted hover:bg-elevated'}`}>{b.name}</button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <Card><PageSpinner /></Card>
      ) : !rows.length ? (
        <Card><EmptyState title="No stock on hand" message="Receive stock to get started." icon={Boxes} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r, i) => (
              <div key={r.productId} className="card-tile animate-rise" style={{ animationDelay: `${i * 35}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight text-foreground">{r.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {r.brandName && <Badge className={BRAND_CHIP[r.brandName?.toUpperCase()] || 'bg-elevated text-muted'}>{r.brandName}</Badge>}
                      <span className="text-xs text-faint">{r.sku}</span>
                    </div>
                  </div>
                  {r.lowStock && <Badge className="bg-rose-100 text-rose-700">Low</Badge>}
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className={`text-2xl font-bold ${r.lowStock ? 'text-rose-600' : 'text-foreground'}`}>{formatNumber(r.totalBase)}</div>
                    <div className="text-xs text-faint">{pluralizeUnit(r.baseUnitName)} on hand</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground">{formatCurrency(r.sellingPrice)}</div>
                    <div className="text-xs text-faint">per {(r.baseUnitName || 'unit').toLowerCase()}</div>
                  </div>
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-elevated">
                  <div
                    className={`h-full rounded-full transition-all ${r.lowStock ? 'bg-rose-500' : 'bg-brand-500'}`}
                    style={{ width: `${Math.max(4, Math.round((r.totalBase / max) * 100))}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="whitespace-nowrap text-xs text-faint">Value {formatCurrency(r.value)}</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {r.locations.slice(0, 3).map((loc, k) => (
                      <Badge key={k} className={loc.type === 'WAREHOUSE' ? 'bg-elevated text-muted' : 'bg-sky-100 text-sky-700'}>
                        {loc.type === 'WAREHOUSE' ? <Warehouse className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                        {(loc.name || '').split(' ')[0]}: {formatNumber(loc.baseQuantity)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}

function Movements() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'movements', { page, type }],
    queryFn: async () => unwrap(await api.get('/inventory/movements', { params: { page, limit: 20, type: type || undefined } })),
  });
  return (
    <Card>
      <div className="border-b border-border p-4">
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="sm:w-56">
          <option value="">All movement types</option>
          {Object.entries(MOVEMENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      {isLoading ? <PageSpinner /> : !data?.data?.length ? <EmptyState title="No movements" /> : (
        <>
          <Table>
            <THead><TR><TH>When</TH><TH>Type</TH><TH>Product</TH><TH>Qty</TH><TH>Base Δ</TH><TH>Location</TH><TH>By</TH></TR></THead>
            <TBody>
              {data.data.map((m) => {
                const meta = MOVEMENT_META[m.type] || { label: m.type, cls: 'bg-elevated' };
                return (
                  <TR key={m.id}>
                    <TD className="text-muted">{formatDateTime(m.occurredAt)}</TD>
                    <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                    <TD className="max-w-[200px] truncate">{m.product?.name}</TD>
                    <TD>{m.quantity} {m.packagingUnit?.name}</TD>
                    <TD className={m.baseQuantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>{m.baseQuantity > 0 ? '+' : ''}{formatNumber(m.baseQuantity)}</TD>
                    <TD>{m.locationType === 'WAREHOUSE' ? m.warehouse?.name : m.salesRep?.user?.name}</TD>
                    <TD>{m.user?.name || '—'}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState('balances');
  const [modal, setModal] = useState(null); // 'receive' | 'adjust' | 'damage'

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Live balances and the full movement ledger.">
        <Button variant="secondary" onClick={() => setModal('damage')}>Record damage</Button>
        <Button variant="secondary" onClick={() => setModal('adjust')}><SlidersHorizontal className="h-4 w-4" /> Adjust</Button>
        <Button onClick={() => setModal('receive')}><PackagePlus className="h-4 w-4" /> Receive stock</Button>
      </PageHeader>

      <div className="mb-4 flex gap-2">
        {[['balances', 'Stock balances'], ['movements', 'Movement ledger']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? 'bg-brand-600 text-slate-950' : 'bg-surface text-muted hover:bg-elevated'}`}>{label}</button>
        ))}
      </div>

      {tab === 'balances' ? <Balances /> : <Movements />}

      {modal === 'receive' && <ReceiveModal onClose={() => setModal(null)} />}
      {modal === 'adjust' && <AdjustModal mode="adjust" onClose={() => setModal(null)} />}
      {modal === 'damage' && <AdjustModal mode="damage" onClose={() => setModal(null)} />}
    </div>
  );
}
