import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Globe, ChevronRight, Ban, BadgeCheck } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useProducts } from '@/lib/hooks';
import { ORDER_STATUS_META, ORDER_PAYMENT_META, ORDER_FLOW } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/format';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Input, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function OrderModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [form, setForm] = useState({ customerName: '', customerPhone: '', region: '', address: '', courierName: '', discount: 0, amountPaid: 0, notes: '' });
  const [items, setItems] = useState([]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const subtotal = useMemo(() => items.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0), [items]);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0));

  const create = useMutation({
    mutationFn: () => api.post('/online-orders', {
      ...form,
      discount: Number(form.discount) || 0,
      amountPaid: Number(form.amountPaid) || 0,
      items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || undefined })),
    }),
    onSuccess: () => { toast.success('Order created'); qc.invalidateQueries({ queryKey: ['online-orders'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <Modal open onClose={onClose} size="lg" title="New online order"
      footer={<><div className="mr-auto text-sm"><span className="text-muted">Total</span> <b>{formatCurrency(total)}</b></div><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!form.customerName || !items.some((l) => l.productId && l.quantity > 0)} onClick={() => create.mutate()}>Create order</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer name" required><Input value={form.customerName} onChange={set('customerName')} /></Field>
          <Field label="Phone"><Input value={form.customerPhone} onChange={set('customerPhone')} /></Field>
          <Field label="Region"><Input value={form.region} onChange={set('region')} /></Field>
          <Field label="Courier"><Input value={form.courierName} onChange={set('courierName')} /></Field>
        </div>
        <Field label="Delivery address"><Input value={form.address} onChange={set('address')} /></Field>
        <ItemLines products={products} value={items} onChange={setItems} showPrice />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Discount"><Input type="number" min="0" value={form.discount} onChange={set('discount')} /></Field>
          <Field label="Amount paid"><Input type="number" min="0" value={form.amountPaid} onChange={set('amountPaid')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

export default function OnlineOrders() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['online-orders', { page, status }],
    queryFn: async () => unwrap(await api.get('/online-orders', { params: { page, limit: 15, status: status || undefined } })),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }) => api.post(`/online-orders/${id}/status`, { status }),
    onSuccess: () => { toast.success('Order updated'); qc.invalidateQueries({ queryKey: ['online-orders'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (e) => toast.error(apiError(e)),
  });
  const pay = useMutation({
    mutationFn: ({ id, total }) => api.post(`/online-orders/${id}/payment`, { paymentStatus: 'PAID', amountPaid: total }),
    onSuccess: () => { toast.success('Marked paid'); qc.invalidateQueries({ queryKey: ['online-orders'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const nextStatus = (s) => { const i = ORDER_FLOW.indexOf(s); return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null; };

  return (
    <div>
      <PageHeader title="Online Orders" subtitle="Track orders from placement to delivery.">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New order</Button>
      </PageHeader>
      <Card>
        <div className="border-b border-border p-4">
          <select className="input sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.entries(ORDER_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No online orders" icon={Globe} action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New order</Button>} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Order</TH><TH>Customer</TH><TH>Total</TH><TH>Status</TH><TH>Payment</TH><TH>Placed</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((o) => {
                  const next = nextStatus(o.status);
                  const terminal = o.status === 'DELIVERED' || o.status === 'CANCELLED';
                  return (
                    <TR key={o.id}>
                      <TD className="font-medium">{o.orderNumber}</TD>
                      <TD>{o.customerName}{o.region ? <span className="text-xs text-faint"> · {o.region}</span> : null}</TD>
                      <TD>{formatCurrency(o.total)}</TD>
                      <TD><Badge className={ORDER_STATUS_META[o.status]?.cls}>{ORDER_STATUS_META[o.status]?.label}</Badge></TD>
                      <TD><Badge className={ORDER_PAYMENT_META[o.paymentStatus]?.cls}>{ORDER_PAYMENT_META[o.paymentStatus]?.label}</Badge></TD>
                      <TD className="text-faint">{formatDate(o.placedAt)}</TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          {o.paymentStatus !== 'PAID' && !terminal && <button className="btn-ghost px-2 py-1 text-emerald-600" title="Mark paid" onClick={() => pay.mutate({ id: o.id, total: o.total })}><BadgeCheck className="h-4 w-4" /></button>}
                          {next && <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => advance.mutate({ id: o.id, status: next })}>{ORDER_STATUS_META[next].label} <ChevronRight className="h-3 w-3" /></Button>}
                          {!terminal && <button className="btn-ghost px-2 py-1 text-rose-600" title="Cancel" onClick={() => { if (confirm(`Cancel ${o.orderNumber}?`)) advance.mutate({ id: o.id, status: 'CANCELLED' }); }}><Ban className="h-4 w-4" /></button>}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <OrderModal onClose={() => setOpen(false)} />}
    </div>
  );
}
