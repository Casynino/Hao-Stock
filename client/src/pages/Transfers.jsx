import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Truck, Ban } from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { useProducts, useWarehouses, useSalesReps } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import ItemLines from '@/components/ItemLines';
import {
  PageHeader, Card, PageSpinner, EmptyState, Badge, Button, Modal, Field, Select, Textarea,
  Pagination, Table, THead, TBody, TR, TH, TD,
} from '@/components/ui';

const DIR_LABEL = {
  WAREHOUSE_TO_REP: 'Warehouse → Rep',
  REP_TO_WAREHOUSE: 'Rep → Warehouse',
  WAREHOUSE_TO_WAREHOUSE: 'Warehouse → Warehouse',
};

function TransferModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: reps = [] } = useSalesReps();

  const [direction, setDirection] = useState('WAREHOUSE_TO_REP');
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toRepId, setToRepId] = useState('');
  const [fromRepId, setFromRepId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        direction,
        items: items.filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, packagingUnitId: l.packagingUnitId, quantity: Number(l.quantity) })),
        notes: notes || undefined,
      };
      if (direction === 'WAREHOUSE_TO_REP') { payload.fromWarehouseId = fromWarehouseId; payload.toRepId = toRepId; }
      if (direction === 'REP_TO_WAREHOUSE') { payload.fromRepId = fromRepId; payload.toWarehouseId = toWarehouseId; }
      if (direction === 'WAREHOUSE_TO_WAREHOUSE') { payload.fromWarehouseId = fromWarehouseId; payload.toWarehouseId = toWarehouseId; }
      return api.post('/transfers', payload);
    },
    onSuccess: () => { toast.success('Transfer completed'); qc.invalidateQueries({ queryKey: ['transfers'] }); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });

  const needsFromWh = direction !== 'REP_TO_WAREHOUSE';
  const needsToWh = direction !== 'WAREHOUSE_TO_REP';
  const valid = items.some((l) => l.productId && l.quantity > 0) &&
    (direction === 'WAREHOUSE_TO_REP' ? fromWarehouseId && toRepId :
     direction === 'REP_TO_WAREHOUSE' ? fromRepId && toWarehouseId :
     fromWarehouseId && toWarehouseId && fromWarehouseId !== toWarehouseId);

  return (
    <Modal open onClose={onClose} size="lg" title="New stock transfer"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>Dispatch</Button></>}>
      <div className="space-y-4">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
            {Object.entries(DIR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {needsFromWh && direction !== 'REP_TO_WAREHOUSE' && (
            <Field label="From warehouse" required>
              <Select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
                <option value="">Select…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
          {direction === 'REP_TO_WAREHOUSE' && (
            <Field label="From rep" required>
              <Select value={fromRepId} onChange={(e) => setFromRepId(e.target.value)}>
                <option value="">Select…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.user?.name} ({r.code})</option>)}
              </Select>
            </Field>
          )}
          {direction === 'WAREHOUSE_TO_REP' && (
            <Field label="To rep" required>
              <Select value={toRepId} onChange={(e) => setToRepId(e.target.value)}>
                <option value="">Select…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.user?.name} ({r.code})</option>)}
              </Select>
            </Field>
          )}
          {needsToWh && (
            <Field label="To warehouse" required>
              <Select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                <option value="">Select…</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <ItemLines products={products} value={items} onChange={setItems} />
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function Transfers() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', { page }],
    queryFn: async () => unwrap(await api.get('/transfers', { params: { page, limit: 15 } })),
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/transfers/${id}/cancel`, {}),
    onSuccess: () => { toast.success('Transfer cancelled'); qc.invalidateQueries({ queryKey: ['transfers'] }); },
    onError: (e) => toast.error(apiError(e)),
  });

  const endpoint = (t) =>
    t.direction === 'WAREHOUSE_TO_REP' ? `${t.fromWarehouse?.name} → ${t.toRep?.user?.name}`
      : t.direction === 'REP_TO_WAREHOUSE' ? `${t.fromRep?.user?.name} → ${t.toWarehouse?.name}`
        : `${t.fromWarehouse?.name} → ${t.toWarehouse?.name}`;

  return (
    <div>
      <PageHeader title="Transfers" subtitle="Move stock between warehouses and sales reps.">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New transfer</Button>
      </PageHeader>
      <Card>
        {isLoading ? <PageSpinner /> : !data?.data?.length ? (
          <EmptyState title="No transfers yet" icon={Truck} action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New transfer</Button>} />
        ) : (
          <>
            <Table>
              <THead><TR><TH>Transfer</TH><TH>Direction</TH><TH>Route</TH><TH>Items</TH><TH>Date</TH><TH>Status</TH><TH /></TR></THead>
              <TBody>
                {data.data.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.transferNumber}</TD>
                    <TD><Badge className="bg-elevated text-muted">{DIR_LABEL[t.direction]}</Badge></TD>
                    <TD>{endpoint(t)}</TD>
                    <TD>{t.items.length}</TD>
                    <TD className="text-faint">{formatDate(t.dispatchedAt)}</TD>
                    <TD><Badge className={t.status === 'CANCELLED' ? 'bg-elevated text-muted' : 'bg-emerald-100 text-emerald-700'}>{t.status}</Badge></TD>
                    <TD>{t.status !== 'CANCELLED' && (
                      <button className="btn-ghost px-2 py-1 text-rose-600" title="Cancel & reverse" onClick={() => { if (confirm(`Cancel ${t.transferNumber}? Stock will be returned.`)) cancel.mutate(t.id); }}><Ban className="h-4 w-4" /></button>
                    )}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <TransferModal onClose={() => setOpen(false)} />}
    </div>
  );
}
