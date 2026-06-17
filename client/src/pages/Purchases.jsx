import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Ship, PackageCheck, X, Pencil } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useProducts, useWarehouses } from '@/lib/hooks';
import { PO_STATUS_META } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Input, Select, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

function POModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers', 'opts'], queryFn: async () => unwrap(await api.get('/suppliers', { params: { limit: 200 } })).data });

  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState([{ productId: '', packagingUnitId: '', quantity: 1, unitCost: 0 }]);
  const [costs, setCosts] = useState({ shippingCost: 0, clearingCost: 0, otherCost: 0 });
  const [expectedArrival, setExpectedArrival] = useState('');
  const [orderedAt, setOrderedAt] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');

  const setRow = (i, p) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const onProduct = (i, productId) => {
    const product = products.find((p) => p.id === productId);
    const base = product?.packagings?.find((k) => k.isBaseUnit) || product?.packagings?.[0];
    setRow(i, { productId, packagingUnitId: base?.packagingUnitId || '' });
  };

  const create = useMutation({
    mutationFn: () => api.post('/purchase-orders', {
      supplierId,
      items: rows.filter((r) => r.productId && r.quantity > 0).map((r) => ({ productId: r.productId, packagingUnitId: r.packagingUnitId, quantity: Number(r.quantity), unitCost: Number(r.unitCost) || 0 })),
      shippingCost: Number(costs.shippingCost) || 0,
      clearingCost: Number(costs.clearingCost) || 0,
      otherCost: Number(costs.otherCost) || 0,
      warehouseId: warehouseId || undefined,
      orderedAt: orderedAt || undefined,
      expectedArrival: expectedArrival || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => { toast.success('Purchase order created'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const valid = supplierId && rows.some((r) => r.productId && r.quantity > 0);

  return (
    <Modal open onClose={onClose} size="lg" title="New purchase order (import)"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Create PO</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Receive into warehouse"><Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">Primary warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="label mb-0">Items (cost per base unit)</span>
            <button type="button" onClick={() => setRows([...rows, { productId: '', packagingUnitId: '', quantity: 1, unitCost: 0 }])} className="text-xs font-medium text-brand-600 hover:underline">+ Add</button>
          </div>
          {rows.map((r, i) => {
            const product = products.find((p) => p.id === r.productId);
            const pkgs = (product?.packagings || []).slice().sort((a, b) => a.baseQuantity - b.baseQuantity);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                <Select value={r.productId} onChange={(e) => onProduct(i, e.target.value)} className="min-w-[160px] flex-1"><option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                <Select value={r.packagingUnitId} onChange={(e) => setRow(i, { packagingUnitId: e.target.value })} className="w-32" disabled={!product}>{pkgs.map((pk) => <option key={pk.id} value={pk.packagingUnitId}>{pk.packagingUnit.name} (×{pk.baseQuantity})</option>)}</Select>
                <Input type="number" min="1" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className="w-20" placeholder="Qty" />
                <Input type="number" min="0" value={r.unitCost} onChange={(e) => setRow(i, { unitCost: e.target.value })} className="w-28" placeholder="Cost/base" />
                <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-faint hover:text-rose-600"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Shipping cost (TZS)"><Input type="number" min="0" value={costs.shippingCost} onChange={(e) => setCosts({ ...costs, shippingCost: e.target.value })} /></Field>
          <Field label="Clearing cost (TZS)"><Input type="number" min="0" value={costs.clearingCost} onChange={(e) => setCosts({ ...costs, clearingCost: e.target.value })} /></Field>
          <Field label="Other cost (TZS)"><Input type="number" min="0" value={costs.otherCost} onChange={(e) => setCosts({ ...costs, otherCost: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ordered date"><Input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} /></Field>
          <Field label="Expected arrival"><Input type="date" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-faint">Shipping/clearing/other costs are allocated across items as landed cost when you receive the PO.</p>
      </div>
    </Modal>
  );
}

function SupplierModal({ editing, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(editing || { name: '', country: 'China', contactName: '', phone: '', email: '' });
  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/suppliers/${editing.id}`, form) : api.post('/suppliers', form)),
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['suppliers'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={editing ? 'Edit supplier' : 'New supplier'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!form.name} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required><Input value={form.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Country"><Input value={form.country || ''} onChange={set('country')} /></Field>
          <Field label="Contact"><Input value={form.contactName || ''} onChange={set('contactName')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><Input value={form.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Email"><Input value={form.email || ''} onChange={set('email')} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function PurchaseOrders() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['purchase-orders', { page }], queryFn: async () => unwrap(await api.get('/purchase-orders', { params: { page, limit: 15 } })) });
  const receive = useMutation({
    mutationFn: (id) => api.post(`/purchase-orders/${id}/receive`, {}),
    onSuccess: () => { toast.success('Received into warehouse'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="text-sm font-semibold text-foreground">Purchase orders</span>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New PO</Button>
      </div>
      {isLoading ? <PageSpinner /> : !data?.data?.length ? <EmptyState title="No purchase orders" icon={Ship} /> : (
        <>
          <Table>
            <THead><TR><TH>PO</TH><TH>Supplier</TH><TH>Items</TH><TH>Total cost</TH><TH>Expected</TH><TH>Status</TH><TH /></TR></THead>
            <TBody>
              {data.data.map((po) => (
                <TR key={po.id}>
                  <TD className="font-medium">{po.poNumber}</TD>
                  <TD>{po.supplier?.name}</TD>
                  <TD>{po.items.length}</TD>
                  <TD>{formatCurrency(po.totalCost)}</TD>
                  <TD className="text-faint">{formatDate(po.expectedArrival)}</TD>
                  <TD><Badge className={PO_STATUS_META[po.status]?.cls}>{PO_STATUS_META[po.status]?.label}</Badge></TD>
                  <TD>{po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                    <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => { if (confirm(`Receive ${po.poNumber} into the warehouse?`)) receive.mutate(po.id); }}><PackageCheck className="h-4 w-4" /> Receive</Button>
                  )}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
        </>
      )}
      {open && <POModal onClose={() => setOpen(false)} />}
    </Card>
  );
}

function Suppliers() {
  const [modal, setModal] = useState({ open: false, editing: null });
  const { data, isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: async () => unwrap(await api.get('/suppliers', { params: { limit: 100 } })) });
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="text-sm font-semibold text-foreground">Suppliers</span>
        <Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New supplier</Button>
      </div>
      {isLoading ? <PageSpinner /> : !data?.data?.length ? <EmptyState title="No suppliers" /> : (
        <Table>
          <THead><TR><TH>Name</TH><TH>Country</TH><TH>Contact</TH><TH>Phone</TH><TH>POs</TH><TH /></TR></THead>
          <TBody>{data.data.map((s) => (
            <TR key={s.id}><TD className="font-medium">{s.name}</TD><TD>{s.country}</TD><TD>{s.contactName || '—'}</TD><TD>{s.phone || '—'}</TD><TD>{s._count?.purchaseOrders ?? 0}</TD>
              <TD><button className="btn-ghost px-2 py-1" onClick={() => setModal({ open: true, editing: s })}><Pencil className="h-4 w-4" /></button></TD></TR>
          ))}</TBody>
        </Table>
      )}
      {modal.open && <SupplierModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} />}
    </Card>
  );
}

export default function Purchases() {
  const [tab, setTab] = useState('orders');
  return (
    <div>
      <PageHeader title="Imports & Purchase Orders" subtitle="Order stock from China, track costs, and receive into the warehouse." />
      <div className="mb-4 flex gap-2">
        {[['orders', 'Purchase orders'], ['suppliers', 'Suppliers']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? 'bg-brand-600 text-slate-950' : 'bg-surface text-muted hover:bg-elevated'}`}>{label}</button>
        ))}
      </div>
      {tab === 'orders' ? <PurchaseOrders /> : <Suppliers />}
    </div>
  );
}
