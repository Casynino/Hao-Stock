import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Undo2 } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProducts, useCustomers, useSalesReps, useWarehouses } from '@/lib/hooks';
import { ROLES } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

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
  const [items, setItems] = useState([]);
  const [reason, setReason] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        type,
        customerId: customerId || null,
        items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity), condition: l.condition })),
        reason: reason || undefined,
      };
      if (!isRep && salesRepId) payload.salesRepId = salesRepId;
      if (warehouseId) payload.warehouseId = warehouseId;
      return api.post('/returns', payload);
    },
    onSuccess: () => { toast.success('Return processed'); qc.invalidateQueries({ queryKey: ['returns'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const valid = items.some((l) => l.productId && l.quantity > 0) && (
    type === 'SALES_RETURN' ? (isRep ? warehouseId : salesRepId && warehouseId) : (isRep || salesRepId || warehouseId)
  );

  return (
    <Modal open onClose={onClose} size="lg" title="Process a return"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Process</Button></>}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {[['CUSTOMER_RETURN', 'Customer return'], ['SALES_RETURN', 'Rep → warehouse']].map(([k, label]) => (
            <button key={k} onClick={() => setType(k)} className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold ${type === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-muted'}`}>{label}</button>
          ))}
        </div>

        {type === 'CUSTOMER_RETURN' && (
          <Field label="Customer" hint="Optional">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— None —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isRep && (type === 'SALES_RETURN' || type === 'CUSTOMER_RETURN') && (
            <Field label={type === 'SALES_RETURN' ? 'From rep' : 'Into rep stock'} required={type === 'SALES_RETURN'} hint={type === 'CUSTOMER_RETURN' ? 'Or pick a warehouse →' : undefined}>
              <Select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
                <option value="">{type === 'SALES_RETURN' ? 'Select rep…' : '— None —'}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.user?.name} ({r.code})</option>)}
              </Select>
            </Field>
          )}
          {(type === 'SALES_RETURN' || !isRep) && (
            <Field label={type === 'SALES_RETURN' ? 'Into warehouse' : 'Into warehouse'} required={type === 'SALES_RETURN'} hint={type === 'CUSTOMER_RETURN' ? 'Or pick a rep ←' : undefined}>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{type === 'SALES_RETURN' ? 'Select warehouse…' : '— None —'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <ItemLines products={products} value={items} onChange={setItems} showCondition />
        <Field label="Reason"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged in transit, customer over-ordered" /></Field>
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
