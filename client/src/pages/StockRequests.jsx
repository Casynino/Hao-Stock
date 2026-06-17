import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Plus, Minus, X, Search, ShoppingCart, ClipboardList, Eye,
  ArrowLeft, Loader2, CheckCircle2,
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

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#09090b] text-white"
    >
      {/* Header + search — one unified block */}
      <div className="shrink-0 border-b border-white/8 px-4 pb-3 pt-3.5">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex-1 text-[15px] font-semibold text-white">New stock request</span>
          {cartCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-slate-950">
              {cartCount}
            </span>
          )}
        </div>
        {/* Search inline under header */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg border border-white/10 bg-[#141416] py-2.5 pl-9 pr-8 text-[13px] text-white placeholder-white/25 outline-none transition focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {productsLoading ? (
          <div className="flex items-center justify-center py-16 text-white/25">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {filtered.map((product) => {
              const pkg = defaultPkg(product);
              const price = pkgPrice(product, pkg);
              const qty = cart[product.id] || 0;
              const inCart = qty > 0;

              return (
                <li
                  key={product.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${inCart ? 'bg-brand-500/5' : 'hover:bg-white/[0.02]'}`}
                >
                  <div className="flex w-4 shrink-0 items-center justify-center">
                    {inCart
                      ? <CheckCircle2 className="h-4 w-4 text-brand-400" />
                      : <span className="h-1 w-1 rounded-full bg-white/15" />
                    }
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-medium ${inCart ? 'text-white' : 'text-white/70'}`}>
                      {product.name}
                    </div>
                    <div className="text-[11px] text-white/30">
                      {formatCurrency(price)} / {pkg?.packagingUnit?.name || 'box'}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => dec(product.id)}
                      disabled={qty === 0}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition active:scale-90 disabled:opacity-20 hover:border-white/25 hover:text-white"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <motion.span
                      key={qty}
                      initial={qty > 0 ? { scale: 1.3 } : false}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className={`w-6 text-center text-[14px] font-bold tabular-nums ${qty > 0 ? 'text-brand-400' : 'text-white/20'}`}
                    >
                      {qty}
                    </motion.span>
                    <button
                      onClick={() => inc(product.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-slate-950 transition active:scale-90 hover:bg-brand-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-12 text-center text-[13px] text-white/25">No products found</li>
            )}
          </ul>
        )}

        {/* Notes — always dark, never white */}
        <div className="border-t border-white/[0.05] px-4 py-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/25">Notes (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. restock for next week…"
            rows={2}
            style={{ backgroundColor: '#141416', colorScheme: 'dark' }}
            className="w-full resize-none rounded-lg border border-white/10 px-3 py-2.5 text-[13px] text-white placeholder-white/20 outline-none transition focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/10"
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-white/8 bg-[#09090b] px-4 pb-8 pt-3">
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mb-2 flex items-baseline justify-between"
            >
              <span className="text-[12px] text-white/35">
                {formatNumber(totalBoxes)} box{totalBoxes !== 1 ? 'es' : ''} · {cartCount} product{cartCount !== 1 ? 's' : ''}
              </span>
              <span className="text-[15px] font-bold text-white">{formatCurrency(totalAmount)}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          disabled={cartCount === 0 || create.isPending}
          onClick={() => create.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-[15px] font-bold text-slate-950 transition active:scale-[0.98] disabled:opacity-25"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          {cartCount === 0 ? 'Select products above' : 'Submit for approval'}
        </button>
      </div>
    </motion.div>
  );
}

// ── Order detail (admin / staff review + rep view) ────────────────────────────

function OrderDetailModal({ request, isRep, staff, onClose }) {
  const qc = useQueryClient();
  const pending = request.status === 'PENDING';
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

  const approvedTotal = request.items.reduce(
    (s, i) => s + (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0), 0,
  );

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
          <div><div className="text-xs text-faint">Lines</div><div className="font-medium">{request.items.length}</div></div>
        </div>

        <Table>
          <THead><TR><TH>Product</TH><TH>Requested</TH>{editable && <TH>Approve qty</TH>}<TH>Unit price</TH><TH>Line total</TH></TR></THead>
          <TBody>
            {request.items.map((i) => (
              <TR key={i.id}>
                <TD className="font-medium text-foreground">{i.product.name}</TD>
                <TD>{i.quantityRequested} {i.packagingUnit.name}</TD>
                {editable && (
                  <TD>
                    <Input type="number" min="0" value={qtys[i.id]} onChange={(e) => setQtys({ ...qtys, [i.id]: e.target.value })} className="w-20" />
                  </TD>
                )}
                <TD>{formatCurrency(i.unitPrice)}</TD>
                <TD>{formatCurrency(editable ? (Number(qtys[i.id]) || 0) * Number(i.unitPrice || 0) : i.lineTotal)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>

        <div className="flex items-center justify-between rounded-xl bg-elevated px-4 py-3">
          <span className="text-sm font-medium text-muted">{editable ? 'Approved order value' : 'Order value'}</span>
          <span className="text-xl font-bold text-foreground">{formatCurrency(editable ? approvedTotal : request.totalValue)}</span>
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
                    <TD>{r.items.length} line(s)</TD>
                    <TD className="font-medium">{formatCurrency(r.totalValue)}</TD>
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
