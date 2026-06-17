import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import {
  Plus, Minus, X, Search, Package, ShoppingCart, ClipboardList, Eye,
  ChevronDown, ChevronUp, ArrowLeft, Loader2,
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

// ── Cart-style order sheet (rep only) ────────────────────────────────────────

function CartOrderSheet({ onClose }) {
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const [cart, setCart] = useState({});   // { [productId]: qty }
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [cartExpanded, setCartExpanded] = useState(true);
  const qc = useQueryClient();

  // ── cart helpers ──────────────────────────────────────────────────────────
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

  // ── filtered catalog ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  // ── submit ────────────────────────────────────────────────────────────────
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
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#09090b] text-white"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/8 bg-[#09090b] px-4 py-4">
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white/70 hover:bg-white/12"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold tracking-tight">Build your order</h1>
          {cartCount > 0 && (
            <p className="text-xs text-white/40">{cartCount} product{cartCount !== 1 ? 's' : ''} · {formatCurrency(totalAmount)}</p>
          )}
        </div>
        {cartCount > 0 && (
          <motion.span
            key={cartCount}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-brand-500 px-2 text-xs font-black text-slate-950"
          >
            {cartCount}
          </motion.span>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* Cart section */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-b border-white/8"
            >
              <div className="px-4 pt-4">
                <button
                  onClick={() => setCartExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/40"
                >
                  <span>Your order ({cartCount} product{cartCount !== 1 ? 's' : ''})</span>
                  {cartExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              <AnimatePresence>
                {cartExpanded && (
                  <motion.ul
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2 px-4 py-3"
                  >
                    {cartEntries.map(({ productId, product, qty, lineTotal }) => (
                      <motion.li
                        key={productId}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        className="flex items-center gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/8 p-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                          <Package className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{product.name}</div>
                          <div className="text-xs text-white/45">{formatCurrency(lineTotal)}</div>
                        </div>
                        {/* Qty controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => dec(productId)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-white hover:bg-white/15"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
                          <button
                            onClick={() => inc(productId)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-slate-950 hover:bg-brand-400"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => setQty(productId, 0)}
                          className="ml-1 text-white/20 hover:text-rose-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search bar */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-9 pr-4 text-sm text-white placeholder-white/25 outline-none transition focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Catalog label */}
        <div className="px-4 pb-2 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Product cards */}
        {productsLoading ? (
          <div className="flex items-center justify-center py-12 text-white/30">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 px-4 pb-4">
            {filtered.map((product) => {
              const pkg = defaultPkg(product);
              const price = pkgPrice(product, pkg);
              const qty = cart[product.id] || 0;
              const inCart = qty > 0;

              return (
                <motion.div
                  key={product.id}
                  layout
                  className={`rounded-2xl border p-4 transition-colors duration-150 ${
                    inCart
                      ? 'border-brand-500/35 bg-brand-500/8'
                      : 'border-white/8 bg-white/4 hover:bg-white/7'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${inCart ? 'bg-brand-500/25 text-brand-400' : 'bg-white/8 text-white/40'}`}>
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-snug text-white">{product.name}</div>
                      <div className="mt-0.5 text-xs text-white/45">
                        {formatCurrency(price)} / {pkg?.packagingUnit?.name || 'box'}
                      </div>
                    </div>
                    {inCart && (
                      <motion.span
                        key={qty}
                        initial={{ scale: 1.25 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        className="shrink-0 rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-black text-slate-950"
                      >
                        {qty}
                      </motion.span>
                    )}
                  </div>

                  {/* +/- controls */}
                  <div className="mt-4 flex items-center justify-end gap-3">
                    <button
                      onClick={() => dec(product.id)}
                      disabled={qty === 0}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white transition active:scale-95 disabled:opacity-25"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <motion.span
                      key={qty}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="w-10 text-center text-xl font-black tabular-nums"
                    >
                      {qty}
                    </motion.span>
                    <button
                      onClick={() => inc(product.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-slate-950 shadow-[0_4px_16px_-4px_rgba(163,230,53,0.5)] transition hover:bg-brand-400 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-white/30">No products match "{search}"</div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="px-4 pb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/30">Notes (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. restock for the week…"
            rows={2}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm text-white placeholder-white/20 outline-none transition focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/* ── Sticky footer ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/8 bg-[#09090b] px-4 pb-8 pt-4">
        {cartCount > 0 && (
          <div className="mb-3 flex items-center justify-between text-sm text-white/50">
            <span>{formatNumber(totalBoxes)} box{totalBoxes !== 1 ? 'es' : ''}</span>
            <span className="font-semibold text-white">{formatCurrency(totalAmount)}</span>
          </div>
        )}
        <button
          disabled={cartCount === 0 || create.isPending}
          onClick={() => create.mutate()}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 py-4 text-base font-black text-slate-950 shadow-[0_8px_32px_-8px_rgba(163,230,53,0.5)] transition hover:bg-brand-400 active:scale-[0.98] disabled:opacity-35 disabled:shadow-none"
        >
          {create.isPending
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <ShoppingCart className="h-5 w-5" />
          }
          {cartCount === 0 ? 'Add products above' : 'Submit for approval'}
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
