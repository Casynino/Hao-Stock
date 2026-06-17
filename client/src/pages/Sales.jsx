import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, ShoppingCart, Eye } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts, useCustomers, useWarehouses, useSalesReps } from '@/lib/hooks';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { ROLES, SALE_STATUS_META } from '@/lib/constants';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Input,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function NewSaleModal({ open, onClose }) {
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const isRep = user?.role === ROLES.SALES_REP;

  const { data: products = [] } = useProducts();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useWarehouses();
  const { data: reps = [] } = useSalesReps();

  const [type, setType] = useState('CASH');
  const [customerId, setCustomerId] = useState('');
  const [source, setSource] = useState(''); // "w:<id>" or "r:<id>"
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState('');
  const [dueDate, setDueDate] = useState('');

  const subtotal = useMemo(
    () => items.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0),
    [items],
  );
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        type,
        customerId: customerId || null,
        items: items
          .filter((l) => l.productId && l.packagingUnitId && l.quantity > 0)
          .map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || undefined })),
        discount: Number(discount) || 0,
      };
      if (type === 'CASH') payload.amountPaid = amountPaid === '' ? total : Number(amountPaid);
      else {
        payload.amountPaid = Number(amountPaid) || 0;
        if (dueDate) payload.dueDate = new Date(dueDate).toISOString();
      }
      if (!isRep) {
        if (source.startsWith('w:')) payload.warehouseId = source.slice(2);
        else if (source.startsWith('r:')) payload.salesRepId = source.slice(2);
      }
      return api.post('/sales', payload);
    },
    onSuccess: () => {
      toast.success('Sale recorded');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const canSubmit =
    items.some((l) => l.productId && l.quantity > 0) &&
    (type !== 'CREDIT' || customerId) &&
    (isRep || source);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Record a sale"
      footer={
        <>
          <div className="mr-auto text-sm">
            <span className="text-muted">Total</span> <span className="text-lg font-bold text-foreground">{formatCurrency(total)}</span>
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>Complete sale</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {['CASH', 'CREDIT'].map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold ${type === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-muted'}`}>
              {t === 'CASH' ? 'Cash sale' : 'Credit sale'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer" required={type === 'CREDIT'} hint={type === 'CASH' ? 'Optional for walk-ins' : undefined}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{type === 'CASH' ? 'Walk-in customer' : 'Select customer…'}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.region ? ` · ${c.region}` : ''}</option>)}
            </Select>
          </Field>
          {!isRep && (
            <Field label="Sell from" required hint="Warehouse or a rep's van stock">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Select source…</option>
                <optgroup label="Warehouses">
                  {warehouses.map((w) => <option key={w.id} value={`w:${w.id}`}>{w.name}</option>)}
                </optgroup>
                <optgroup label="Sales reps">
                  {reps.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.user?.name} ({r.code})</option>)}
                </optgroup>
              </Select>
            </Field>
          )}
        </div>

        <ItemLines products={products} value={items} onChange={setItems} showPrice />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Discount"><Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label={type === 'CASH' ? 'Amount paid' : 'Down payment'} hint={type === 'CASH' ? 'Defaults to total' : 'Optional'}>
            <Input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={String(total)} />
          </Field>
          {type === 'CREDIT' && (
            <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          )}
        </div>

        <div className="rounded-lg bg-elevated p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Discount</span><span>-{formatCurrency(Number(discount) || 0)}</span></div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
        </div>
      </div>
    </Modal>
  );
}

function SaleDetail({ id, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => unwrap(await api.get(`/sales/${id}`)).data,
    enabled: !!id,
  });
  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={data ? `Sale ${data.saleNumber}` : 'Sale'}>
      {isLoading || !data ? <PageSpinner /> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted">Customer</span><div className="font-medium">{data.customer?.name || 'Walk-in'}</div></div>
            <div><span className="text-muted">Sales rep</span><div className="font-medium">{data.salesRep?.user?.name || '—'}</div></div>
            <div><span className="text-muted">Type</span><div className="font-medium">{data.type}</div></div>
            <div><span className="text-muted">Date</span><div className="font-medium">{formatDateTime(data.soldAt)}</div></div>
          </div>
          <Table>
            <THead><TR><TH>Item</TH><TH>Qty</TH><TH>Unit price</TH><TH>Total</TH></TR></THead>
            <TBody>
              {data.items.map((it) => (
                <TR key={it.id}>
                  <TD>{it.product.name}</TD>
                  <TD>{it.quantity} {it.packagingUnit.name}</TD>
                  <TD>{formatCurrency(it.unitPrice)}/base</TD>
                  <TD>{formatCurrency(it.lineTotal)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="rounded-lg bg-elevated p-3">
            <div className="flex justify-between"><span className="text-muted">Total</span><span className="font-semibold">{formatCurrency(data.total)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Paid</span><span>{formatCurrency(data.amountPaid)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Balance</span><span className={data.balanceDue > 0 ? 'text-rose-600' : ''}>{formatCurrency(data.balanceDue)}</span></div>
          </div>
          {data.creditSale && (
            <div>
              <div className="mb-1 font-medium text-foreground">Payment history</div>
              {data.creditSale.payments.length === 0 ? <p className="text-faint">No payments yet.</p> : (
                <ul className="space-y-1">
                  {data.creditSale.payments.map((p) => (
                    <li key={p.id} className="flex justify-between text-muted">
                      <span>{formatDateTime(p.paidAt)} · {p.method}</span><span className="font-medium">{formatCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Sales() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['sales', { page, type, status }],
    queryFn: async () => unwrap(await api.get('/sales', { params: { page, limit: 15, type: type || undefined, status: status || undefined } })),
  });

  return (
    <div>
      <PageHeader title="Sales" subtitle="Cash & credit sales across the business.">
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New sale</Button>
      </PageHeader>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="">All types</option><option value="CASH">Cash</option><option value="CREDIT">Credit</option>
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44">
            <option value="">All statuses</option>
            {Object.entries(SALE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>

        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No sales yet" message="Record your first sale." icon={ShoppingCart} action={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New sale</Button>} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Sale</TH><TH>Customer</TH><TH>Rep</TH><TH>Type</TH><TH>Total</TH><TH>Balance</TH><TH>Status</TH><TH>Date</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((s) => {
                  const meta = SALE_STATUS_META[s.status] || {};
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium text-foreground">{s.saleNumber}</TD>
                      <TD>{s.customer?.name || 'Walk-in'}</TD>
                      <TD>{s.salesRep?.user?.name || '—'}</TD>
                      <TD>{s.type}</TD>
                      <TD>{formatCurrency(s.total)}</TD>
                      <TD className={s.balanceDue > 0 ? 'text-rose-600' : 'text-faint'}>{formatCurrency(s.balanceDue)}</TD>
                      <TD><Badge className={meta.cls}>{meta.label}</Badge></TD>
                      <TD className="text-faint">{formatDate(s.soldAt)}</TD>
                      <TD><button className="btn-ghost px-2 py-1" onClick={() => setDetailId(s.id)}><Eye className="h-4 w-4" /></button></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>

      {modalOpen && <NewSaleModal open={modalOpen} onClose={() => setModalOpen(false)} />}
      {detailId && <SaleDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
