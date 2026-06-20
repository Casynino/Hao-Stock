import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Plus, Minus, X, Search, ShoppingCart, ClipboardList, Eye,
  Loader2, CheckCircle2,
} from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/lib/hooks';
import { ROLES, REQUEST_STATUS_META } from '@/lib/constants';
import { formatDateTime, formatCurrency, formatNumber } from '@/lib/format';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Input,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

// ── helpers ───────────────────────────────────────────────────────────────────

// For fulfilled orders, recompute from quantityApproved on each item so that
// partial-approval edits are reflected correctly even on older records.
function orderDisplayValue(r) {
  if (r.status === 'FULFILLED') {
    return r.items.reduce((s, i) => s + (i.quantityApproved ?? 0) * Number(i.unitPrice || 0), 0);
  }
  return Number(r.totalValue || 0);
}

function defaultPkg(product) {
  if (!product?.packagings?.length) return null;
  return product.packagings.find((p) => p.isBaseUnit) || product.packagings[0];
}

function pkgPrice(product, pkg) {
  if (!product || !pkg) return 0;
  if (pkg.unitPrice != null) return Number(pkg.unitPrice);
  return Number(product.sellingPrice || 0) * (pkg.baseQuantity || 1);
}

// ── Order sheet (rep only) ────────────────────────────────────────────────────

function CartOrderSheet({ onClose }) {
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();

  function setQty(productId, qty) {
    setCart((prev) => {
      if (qty <= 0) { const n = { ...prev }; delete n[productId]; return n; }
      return { ...prev, [productId]: qty };
    });
  }
  const inc = (id) => setQty(id, (cart[id] || 0) + 1);
  const dec = (id) => setQty(id, (cart[id] || 0) - 1);

  const cartEntries = useMemo(() =>
    Object.entries(cart).map(([productId, qty]) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      const pkg = defaultPkg(product);
      const price = pkgPrice(product, pkg);
      return { productId, product, pkg, qty, price, lineTotal: price * qty };
    }).filter(Boolean),
  [cart, products]);

  const cartCount = Object.keys(cart).length;
  const totalBoxes = cartEntries.reduce((s, e) => s + e.qty, 0);
  const totalAmount = cartEntries.reduce((s, e) => s + e.lineTotal, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const create = useMutation({
    mutationFn: () => api.post('/stock-requests', {
      items: cartEntries.map(({ productId, pkg, qty }) => ({
        productId,
        packagingUnitId: pkg.packagingUnitId,
        quantity: qty,
      })),
      notes: notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Order submitted for approval!');
      qc.invalidateQueries({ queryKey: ['stock-requests'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'me'] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const footerContent = (
    <>
      {cartCount > 0 && (
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
          <span className="text-xs text-muted">
            {formatNumber(totalBoxes)} box{totalBoxes !== 1 ? 'es' : ''} · {cartCount} product{cartCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button
        disabled={cartCount === 0 || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        <ShoppingCart className="h-4 w-4" />
        Submit for approval
      </Button>
    </>
  );

  return (
    <Modal open onClose={onClose} title="New stock request" size="lg" footer={footerContent}>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="input pl-9 pr-8"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Product list */}
      {productsLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
      ) : (
        <ul className="-mx-5 divide-y divide-border">
          {filtered.map((product) => {
            const pkg = defaultPkg(product);
            const price = pkgPrice(product, pkg);
            const qty = cart[product.id] || 0;
            const inCart = qty > 0;

            return (
              <li
                key={product.id}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${inCart ? 'bg-brand-500/5' : 'hover:bg-elevated'}`}
              >
                {/* selected indicator */}
                <div className="flex w-4 shrink-0 items-center justify-center">
                  {inCart
                    ? <CheckCircle2 className="h-4 w-4 text-brand-500" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  }
                </div>

                {/* name + price */}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium leading-tight ${inCart ? 'text-foreground' : 'text-muted'}`}>
                    {product.name}
                  </div>
                  <div className="mt-0.5 text-xs text-faint">
                    {formatCurrency(price)} / {pkg?.packagingUnit?.name || 'box'}
                  </div>
                </div>

                {/* qty controls — type directly or tap +/- */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => dec(product.id)}
                    disabled={qty === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition hover:border-brand-500/40 hover:text-foreground active:scale-90 disabled:opacity-25"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={qty === 0 ? '' : qty}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setQty(product.id, isNaN(v) || v < 0 ? 0 : v);
                    }}
                    placeholder="0"
                    className={`h-8 w-14 rounded-lg border text-center text-sm font-semibold tabular-nums outline-none transition
                      [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                      ${inCart
                        ? 'border-brand-500/40 bg-brand-500/10 text-brand-400 focus:ring-1 focus:ring-brand-500/30'
                        : 'border-border bg-elevated text-muted focus:border-brand-500/40 focus:text-foreground'
                      }`}
                  />
                  <button
                    onClick={() => inc(product.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-slate-950 transition hover:bg-brand-400 active:scale-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="py-10 text-center text-sm text-muted">No products match your search</li>
          )}
        </ul>
      )}

      {/* Notes */}
      <div className="mt-4">
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. restock for next week…"
            rows={2}
            className="input resize-none"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ── Order detail (admin / staff review + rep view) ────────────────────────────

function OrderDetailModal({ request, isRep, staff, onClose }) {
  const qc = useQueryClient();
  const pending = request.status === 'PENDING';
  const fulfilled = request.status === 'FULFILLED';
  const editable = staff && pending;
  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(request.items.map((i) => [i.id, i.quantityApproved ?? i.quantityRequested])),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stock-requests'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['dashboard', 'me'] });
  };

  const approve = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/approve`, {
      approvals: request.items.map((i) => ({ itemId: i.id, quantityApproved: Number(qtys[i.id]) || 0 })),
    }),
    onSuccess: () => { toast.success('Approved — stock issued & order opened'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/reject`, {}),
    onSuccess: () => { toast.success('Order rejected'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/stock-requests/${request.id}/cancel`, {}),
    onSuccess: () => { toast.success('Order cancelled'); invalidate(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  // While editing: live total from the qty inputs.
  const editingTotal = request.items.reduce(
    (s, i) => s + (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0), 0,
  );

  // For fulfilled orders: always recompute from quantityApproved so stale
  // totalValue / lineTotal on old records never appears.
  const displayItems = fulfilled
    ? request.items.filter((i) => (i.quantityApproved ?? 0) > 0)
    : request.items;
  const displayTotal = fulfilled
    ? request.items.reduce((s, i) => s + (i.quantityApproved ?? 0) * Number(i.unitPrice || 0), 0)
    : editable ? editingTotal : Number(request.totalValue || 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Order ${request.requestNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {editable && <Button variant="ghost" className="text-rose-500" loading={reject.isPending} onClick={() => reject.mutate()}>Reject</Button>}
          {editable && <Button loading={approve.isPending} onClick={() => approve.mutate()}>Approve &amp; issue</Button>}
          {isRep && pending && <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button>}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-faint">Rep</div><div className="font-medium">{request.salesRep?.user?.name}</div></div>
          <div><div className="text-xs text-faint">Status</div><Badge className={REQUEST_STATUS_META[request.status]?.cls}>{REQUEST_STATUS_META[request.status]?.label}</Badge></div>
          <div><div className="text-xs text-faint">Requested</div><div className="font-medium">{formatDateTime(request.requestedAt)}</div></div>
          <div><div className="text-xs text-faint">Lines</div><div className="font-medium">{displayItems.length}</div></div>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH>{fulfilled ? 'Approved' : 'Requested'}</TH>
              {editable && <TH>Approve qty</TH>}
              <TH>Unit price</TH>
              <TH>Line total</TH>
            </TR>
          </THead>
          <TBody>
            {displayItems.map((i) => {
              const lineTotal = fulfilled
                ? (i.quantityApproved ?? 0) * Number(i.unitPrice || 0)
                : editable
                  ? (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0)
                  : Number(i.lineTotal || 0);
              return (
                <TR key={i.id}>
                  <TD className="font-medium text-foreground">{i.product.name}</TD>
                  <TD>
                    {fulfilled
                      ? `${i.quantityApproved} ${i.packagingUnit.name}`
                      : `${i.quantityRequested} ${i.packagingUnit.name}`}
                  </TD>
                  {editable && (
                    <TD>
                      <Input type="number" min="0" value={qtys[i.id]} onChange={(e) => setQtys({ ...qtys, [i.id]: e.target.value })} className="w-20" />
                    </TD>
                  )}
                  <TD>{formatCurrency(i.unitPrice)}</TD>
                  <TD>{formatCurrency(lineTotal)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3">
          <span className="text-sm font-medium text-muted">
            {fulfilled ? 'Approved order value' : editable ? 'Approved order value' : 'Order value'}
          </span>
          <span className="text-xl font-bold text-foreground">{formatCurrency(displayTotal)}</span>
        </div>

        {request.notes && <div className="text-sm"><span className="text-faint">Notes: </span>{request.notes}</div>}
        {editable && <p className="text-xs text-faint">Approving issues the stock to the rep and opens a 72-hour payment order. Set a line to 0 to drop it.</p>}
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StockRequests() {
  const { hasRole, user } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;
  const staff = hasRole(ROLES.WAREHOUSE_STAFF);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [viewing, setViewing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-requests', { page, status }],
    queryFn: async () => unwrap(await api.get('/stock-requests', { params: { page, limit: 15, status: status || undefined } })),
  });

  return (
    <div>
      <PageHeader
        title="Stock Requests"
        subtitle={isRep ? 'Request stock from the warehouse.' : "Approve or reject reps' stock requests."}
      >
        {isRep && (
          <Button onClick={() => setCartOpen(true)}>
            <Plus className="h-4 w-4" /> New request
          </Button>
        )}
      </PageHeader>

      <Card>
        <div className="border-b border-border p-4">
          <select
            className="input sm:w-48"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            {Object.entries(REQUEST_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No stock requests" icon={ClipboardList} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Order</TH>
                  {staff && <TH>Rep</TH>}
                  <TH>Items</TH>
                  <TH>Value</TH>
                  <TH>Status</TH>
                  <TH>Requested</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {data.data.map((r) => (
                  <TR key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                    <TD className="font-medium">{r.requestNumber}</TD>
                    {staff && <TD>{r.salesRep?.user?.name}</TD>}
                    <TD>{r.items.filter((i) => r.status === 'FULFILLED' ? (i.quantityApproved ?? 0) > 0 : true).length} line(s)</TD>
                    <TD className="font-medium">{formatCurrency(orderDisplayValue(r))}</TD>
                    <TD><Badge className={REQUEST_STATUS_META[r.status]?.cls}>{REQUEST_STATUS_META[r.status]?.label}</Badge></TD>
                    <TD className="text-faint">{formatDateTime(r.requestedAt)}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        {staff && r.status === 'PENDING' ? 'Review' : 'View'} <Eye className="h-3.5 w-3.5" />
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Cart sheet — slides up from bottom */}
      <AnimatePresence>
        {cartOpen && <CartOrderSheet onClose={() => setCartOpen(false)} />}
      </AnimatePresence>

      {viewing && (
        <OrderDetailModal
          request={viewing}
          isRep={isRep}
          staff={staff}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
