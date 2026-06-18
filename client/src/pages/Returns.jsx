import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Undo2, Search, X } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts, useCustomers, useSalesReps, useWarehouses } from '@/lib/hooks';
import { ROLES } from '@/lib/constants';
import { formatDate, formatNumber } from '@/lib/format';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function defaultPkg(product) {
  if (!product?.packagings?.length) return null;
  return product.packagings.find((p) => p.isBaseUnit) || product.packagings[0];
}

function ReturnModal({ onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;
  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: reps = [] } = useSalesReps();
  const { data: warehouses = [] } = useWarehouses();

  const [type, setType] = useState('CUSTOMER_RETURN');
  const [customerId, setCustomerId] = useState('');
  const [salesRepId, setSalesRepId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');

  // cart: { [productId]: qty }
  const [cart, setCart] = useState({});
  function setQty(productId, qty) {
    setCart((prev) => {
      if (qty <= 0) { const n = { ...prev }; delete n[productId]; return n; }
      return { ...prev, [productId]: qty };
    });
  }
  const inc = (id) => setQty(id, (cart[id] || 0) + 1);
  const dec = (id) => setQty(id, (cart[id] || 0) - 1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const totalBoxes = Object.values(cart).reduce((s, q) => s + q, 0);
  const hasCart = totalBoxes > 0;

  const create = useMutation({
    mutationFn: () => {
      const items = Object.entries(cart).map(([productId, quantity]) => {
        const product = products.find((p) => p.id === productId);
        const pkg = defaultPkg(product);
        return { productId, packagingUnitId: pkg?.packagingUnitId, quantity };
      });
      const payload = { type, items, reason: reason || undefined, customerId: customerId || null };
      if (!isRep && salesRepId) payload.salesRepId = salesRepId;
      if (warehouseId) payload.warehouseId = warehouseId;
      return api.post('/returns', payload);
    },
    onSuccess: () => { toast.success('Return processed'); qc.invalidateQueries({ queryKey: ['returns'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const valid = hasCart && (
    type === 'SALES_RETURN' ? (isRep ? warehouseId : salesRepId && warehouseId) : (isRep || salesRepId || warehouseId)
  );

  const footer = (
    <>
      {hasCart && (
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">{formatNumber(totalBoxes)} box{totalBoxes !== 1 ? 'es' : ''} selected</span>
        </div>
      )}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Process</Button>
    </>
  );

  return (
    <Modal open onClose={onClose} size="lg" title="Process a return" footer={footer}>
      <div className="space-y-4">
        {/* Type toggle */}
        <div className="flex gap-2">
          {[['CUSTOMER_RETURN', 'Customer return'], ['SALES_RETURN', 'Rep → warehouse']].map(([k, label]) => (
            <button key={k} onClick={() => { setType(k); setCart({}); }}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition ${type === k ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-border text-muted hover:bg-elevated'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Routing selectors */}
        {type === 'CUSTOMER_RETURN' && (
          <Field label="Customer" hint="Optional">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— None —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isRep && (
            <Field label={type === 'SALES_RETURN' ? 'From rep' : 'Into rep stock'} required={type === 'SALES_RETURN'}
              hint={type === 'CUSTOMER_RETURN' ? 'Or pick a warehouse →' : undefined}>
              <Select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
                <option value="">{type === 'SALES_RETURN' ? 'Select rep…' : '— None —'}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.user?.name} ({r.code})</option>)}
              </Select>
            </Field>
          )}
          {(type === 'SALES_RETURN' || !isRep) && (
            <Field label="Into warehouse" required={type === 'SALES_RETURN'}
              hint={type === 'CUSTOMER_RETURN' ? 'Or pick a rep ←' : undefined}>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{type === 'SALES_RETURN' ? 'Select warehouse…' : '— None —'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        {/* Product search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…" className="input pl-9 pr-8" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Product list */}
        <div className="-mx-1 max-h-56 divide-y divide-border overflow-y-auto">
          {filtered.map((product) => {
            const qty = cart[product.id] || 0;
            const inCart = qty > 0;
            return (
              <div key={product.id} className={`flex items-center gap-3 px-1 py-3 transition ${inCart ? 'bg-brand-500/5' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium leading-snug ${inCart ? 'text-foreground' : 'text-muted'}`}>{product.name}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => dec(product.id)} disabled={qty === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-elevated text-lg font-bold text-muted transition hover:bg-surface disabled:opacity-30">−</button>
                  <input type="number" min="0" value={qty === 0 ? '' : qty}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); setQty(product.id, isNaN(v) || v < 0 ? 0 : v); }}
                    placeholder="0"
                    className="h-8 w-14 rounded-lg border border-border bg-elevated text-center text-sm font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  <button onClick={() => inc(product.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-slate-950 transition hover:bg-brand-400">+</button>
                </div>
              </div>
            );
          })}
        </div>

        <Field label="Reason">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. damaged in transit, customer over-ordered" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Returns() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['returns', { page, type }],
    queryFn: async () => unwrap(await api.get('/returns', { params: { page, limit: 15, type: type || undefined } })),
  });

  return (
    <div>
      <PageHeader title="Returns" subtitle="Customer returns and rep stock returned to the warehouse.">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New return</Button>
      </PageHeader>
      <Card>
        <div className="border-b border-border p-4">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="sm:w-56">
            <option value="">All returns</option><option value="CUSTOMER_RETURN">Customer returns</option><option value="SALES_RETURN">Sales returns</option>
          </Select>
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No returns yet" icon={Undo2} action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New return</Button>} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Return</TH><TH>Type</TH><TH>Rep / Customer</TH><TH>Items</TH><TH>Date</TH></TR></THead>
              <TBody>
                {data.data.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.returnNumber}</TD>
                    <TD><Badge className={r.type === 'CUSTOMER_RETURN' ? 'bg-teal-100 text-teal-700' : 'bg-cyan-100 text-cyan-700'}>{r.type === 'CUSTOMER_RETURN' ? 'Customer' : 'Sales'}</Badge></TD>
                    <TD>{r.salesRep?.user?.name || r.customer?.name || '—'}</TD>
                    <TD>{r.items.length}</TD>
                    <TD className="text-faint">{formatDate(r.processedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <ReturnModal onClose={() => setOpen(false)} />}
    </div>
  );
}
