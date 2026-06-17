import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wallet, Undo2, CheckCircle2, Flag } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts, useWarehouses } from '@/lib/hooks';
import { ROLES, SETTLEMENT_STATUS_META, CORRECTION_STATUS_META } from '@/lib/constants';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/format';
import ItemLines from '@/components/ItemLines';
import {
  Modal, Button, Field, Input, Select, Badge, PageSpinner,
  Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

// --- Settle boxes: the rep accounts for boxes by paying for them -----------
// Reps do NOT record customer sales. They settle stock box by box; the money
// is derived (boxes × box price) and those boxes leave the rep's holding.
function SettleBoxesModal({ order, onClose, onDone }) {
  const lines = order.order.lines.filter((l) => l.remaining > 0);
  const [productId, setProductId] = useState(lines[0]?.productId || '');
  const [boxes, setBoxes] = useState('');
  const [method, setMethod] = useState('CASH');

  const line = lines.find((l) => l.productId === productId);
  const max = line?.remaining || 0;
  const value = (Number(boxes) || 0) * (line?.sellingPrice || 0);

  const settle = useMutation({
    mutationFn: () => api.post(`/settlements/${order.id}/settle-boxes`, { productId, boxes: Number(boxes), method }),
    onSuccess: () => { toast.success('Settlement recorded'); onDone(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Settle boxes · ${order.settlementNumber}`}
      footer={<>
        <div className="mr-auto text-sm"><span className="text-muted">Amount</span> <b>{formatCurrency(value)}</b></div>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={settle.isPending} disabled={!productId || !boxes || Number(boxes) <= 0 || Number(boxes) > max} onClick={() => settle.mutate()}>Record settlement</Button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">The rep is paying for boxes they've sold. The amount is calculated automatically and these boxes leave the rep's stock.</p>
        <Field label="Product">
          <Select value={productId} onChange={(e) => { setProductId(e.target.value); setBoxes(''); }}>
            {lines.map((l) => <option key={l.productId} value={l.productId}>{l.name} — {formatNumber(l.remaining)} left</option>)}
          </Select>
        </Field>
        <Field label="Boxes to settle" required hint={`Max ${formatNumber(max)} · ${formatCurrency(line?.sellingPrice || 0)} / box`}>
          <Input type="number" min="1" max={max} value={boxes} onChange={(e) => setBoxes(e.target.value)} autoFocus />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option><option value="OTHER">Other</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

// --- Return unsold boxes (rep → warehouse) against this order --------------
function RecordReturnModal({ order, onClose, onDone }) {
  const { data: allProducts = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const [items, setItems] = useState([]);
  const warehouseId = warehouses[0]?.id;

  const orderProductIds = new Set(order.order.lines.map((l) => l.productId));
  const products = allProducts.filter((p) => orderProductIds.has(p.id));

  const create = useMutation({
    mutationFn: () => api.post('/returns', {
      type: 'SALES_RETURN',
      salesRepId: order.salesRepId,
      warehouseId,
      settlementId: order.id,
      items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity), condition: l.condition })),
      reason: `Return on order ${order.settlementNumber}`,
    }),
    onSuccess: () => { toast.success('Return recorded on this order'); onDone(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} size="lg" title={`Return stock · ${order.settlementNumber}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!warehouseId || !items.some((l) => l.productId && l.quantity > 0)} onClick={() => create.mutate()}>Return to warehouse</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Unsold boxes the rep is handing back. Stock returns to the warehouse and the order updates.</p>
        <ItemLines products={products} value={items} onChange={setItems} showCondition />
      </div>
    </Modal>
  );
}

// --- Flag an issue (rep/staff can't edit; admin corrects) ------------------
function FlagModal({ order, onClose, onDone }) {
  const [message, setMessage] = useState('');
  const flag = useMutation({
    mutationFn: () => api.post('/corrections', { settlementId: order.id, message }),
    onSuccess: () => { toast.success('Correction request sent to admin'); onDone(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal open onClose={onClose} title={`Flag an issue · ${order.settlementNumber}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={flag.isPending} disabled={message.trim().length < 3} onClick={() => flag.mutate()}>Send request</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Spotted a mistake? You can't edit settlements or returns yourself — describe what's wrong and an admin will correct it. Your request is logged.</p>
        <Field label="What needs correcting?" required>
          <textarea className="input min-h-[110px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I settled 5 boxes by mistake, it should be 3." autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

function MoneyCard({ label, value, tone }) {
  const tones = { brand: 'text-brand-600', emerald: 'text-emerald-500', rose: 'text-rose-500', default: 'text-foreground' };
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`mt-0.5 text-lg font-bold ${tones[tone] || tones.default}`}>{value}</div>
    </div>
  );
}

export default function OrderDetailModal({ settlementId, onClose }) {
  const qc = useQueryClient();
  const { hasRole, user } = useAuth();
  const staff = hasRole(ROLES.WAREHOUSE_STAFF);
  const [sub, setSub] = useState(null); // 'settle' | 'return'

  const { data: order, isLoading } = useQuery({
    queryKey: ['settlement', settlementId],
    queryFn: async () => unwrap(await api.get(`/settlements/${settlementId}`)).data,
  });

  const { data: corrections = [] } = useQuery({
    queryKey: ['corrections', settlementId],
    queryFn: async () => unwrap(await api.get('/corrections', { params: { settlementId, limit: 50 } })).data,
    enabled: !!settlementId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['settlement', settlementId] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['commissions'] });
    qc.invalidateQueries({ queryKey: ['corrections'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] }); // refresh rep/admin dashboards live
  };

  const settle = useMutation({
    mutationFn: () => api.post(`/settlements/${settlementId}/settle`, {}),
    onSuccess: () => { toast.success('Order closed'); refresh(); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const isOwnRep = user?.role === ROLES.SALES_REP && order?.salesRepId === user?.salesRepId;
  const canAct = staff || isOwnRep;
  const active = order && order.status !== 'SETTLED';
  const remaining = order?.order?.totals?.remainingBoxes ?? 0;
  const overdue = order?.status === 'OVERDUE';

  return (
    <>
      <Modal open onClose={onClose} size="xl" title={order ? `Order ${order.settlementNumber}` : 'Order'}
        footer={order && (
          <>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {canAct && <Button variant="ghost" onClick={() => setSub('flag')}><Flag className="h-4 w-4" /> Flag issue</Button>}
            {canAct && active && remaining > 0 && <Button variant="secondary" onClick={() => setSub('return')}><Undo2 className="h-4 w-4" /> Return</Button>}
            {canAct && active && remaining > 0 && <Button onClick={() => setSub('settle')}><Wallet className="h-4 w-4" /> Settle boxes</Button>}
            {staff && active && (remaining <= 0
              ? <Button variant="ghost" className="text-emerald-500" loading={settle.isPending} onClick={() => settle.mutate()}><CheckCircle2 className="h-4 w-4" /> Close order</Button>
              : <span className="self-center text-xs text-faint">{formatNumber(remaining)} box(es) left to account for</span>)}
          </>
        )}>
        {isLoading || !order ? <PageSpinner /> : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-faint">Rep</div><div className="font-medium">{order.salesRep?.user?.name}</div></div>
              <div><div className="text-xs text-faint">Status</div><Badge className={SETTLEMENT_STATUS_META[order.status]?.cls}>{SETTLEMENT_STATUS_META[order.status]?.label}</Badge></div>
              <div><div className="text-xs text-faint">Deadline</div><div className="font-medium">{formatDateTime(order.deadlineAt)}</div></div>
              <div><div className="text-xs text-faint">Issued</div><div className="font-medium">{formatDateTime(order.issuedAt)}</div></div>
            </div>

            {/* Money picture — all derived from settled/returned boxes */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MoneyCard label="Order value" value={formatCurrency(order.order.totals.orderValue)} tone="brand" />
              <MoneyCard label="Settled" value={formatCurrency(order.order.totals.settledValue)} tone="emerald" />
              <MoneyCard label="Returned value" value={formatCurrency(order.order.totals.returnedValue)} />
              <MoneyCard label="Outstanding" value={formatCurrency(order.order.totals.outstanding)} tone="rose" />
            </div>

            {/* Box-by-box breakdown: issued vs settled vs returned vs remaining */}
            <div>
              <div className="mb-2 text-sm font-semibold text-foreground">Stock breakdown (boxes)</div>
              <Table>
                <THead><TR><TH>Product</TH><TH>Issued</TH><TH>Settled</TH><TH>Returned</TH><TH>{overdue ? 'Missing' : 'Remaining'}</TH></TR></THead>
                <TBody>
                  {order.order.lines.map((l) => (
                    <TR key={l.productId}>
                      <TD className="font-medium text-foreground">{l.name}</TD>
                      <TD>{formatNumber(l.assigned)}</TD>
                      <TD className="text-emerald-500">{formatNumber(l.settled)}</TD>
                      <TD className="text-sky-400">{formatNumber(l.returned)}</TD>
                      <TD className={l.remaining > 0 && overdue ? 'font-semibold text-rose-500' : 'text-muted'}>{formatNumber(l.remaining)}</TD>
                    </TR>
                  ))}
                  <TR className="font-semibold">
                    <TD>Total</TD>
                    <TD>{formatNumber(order.order.totals.assignedBoxes)}</TD>
                    <TD className="text-emerald-500">{formatNumber(order.order.totals.settledBoxes)}</TD>
                    <TD className="text-sky-400">{formatNumber(order.order.totals.returnedBoxes)}</TD>
                    <TD className={order.order.totals.remainingBoxes > 0 && overdue ? 'text-rose-500' : 'text-muted'}>{formatNumber(order.order.totals.remainingBoxes)}</TD>
                  </TR>
                </TBody>
              </Table>
              <p className="mt-1 text-xs text-faint">Remaining = Issued − Settled − Returned. The order closes only when every box is <span className="text-emerald-500">settled</span> or <span className="text-sky-400">returned</span>. After the 72h deadline, unaccounted boxes show as <span className="text-rose-500">missing</span> · value {formatCurrency(order.order.totals.remainingValue)}.</p>
              <p className="mt-1 text-xs text-faint">Commission earned: <span className="font-medium text-brand-600">{formatCurrency(order.order.totals.commission)}</span> ({formatNumber(order.order.totals.settledBoxes)} boxes settled) · paid via Commissions.</p>
            </div>

            {/* Settlement history — each settle is a recorded sale transaction */}
            <div>
              <div className="mb-2 text-sm font-semibold text-foreground">Settlements</div>
              {!order.sales?.length ? <p className="text-sm text-faint">Nothing settled yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {order.sales.map((s) => (
                    <li key={s.id} className="flex justify-between text-muted">
                      <span>{formatDateTime(s.soldAt)} · {s.items?.map((i) => `${formatNumber(i.quantity)} box(es) ${i.product?.name}`).join(', ')} · {s.saleNumber}</span>
                      <span className="font-medium text-emerald-500">{formatCurrency(s.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Correction requests raised on this order */}
            {corrections.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">Correction requests</div>
                <ul className="space-y-2 text-sm">
                  {corrections.map((c) => (
                    <li key={c.id} className="rounded-lg border border-border bg-elevated p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-faint">{formatDateTime(c.createdAt)} · {c.raisedBy?.name}</span>
                        <Badge className={CORRECTION_STATUS_META[c.status]?.cls}>{CORRECTION_STATUS_META[c.status]?.label}</Badge>
                      </div>
                      <p className="mt-1 text-foreground">{c.message}</p>
                      {c.resolution && <p className="mt-1 text-xs text-faint">Admin: {c.resolution}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {order && sub === 'settle' && <SettleBoxesModal order={order} onClose={() => setSub(null)} onDone={refresh} />}
      {order && sub === 'return' && <RecordReturnModal order={order} onClose={() => setSub(null)} onDone={refresh} />}
      {order && sub === 'flag' && <FlagModal order={order} onClose={() => setSub(null)} onDone={refresh} />}
    </>
  );
}
