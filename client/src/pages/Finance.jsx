import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Wallet, TrendingUp, TrendingDown, Banknote, Landmark, Smartphone, Coins,
  Plus, Trash2, ArrowDownLeft, ArrowUpRight, Boxes, Receipt, PiggyBank,
} from 'lucide-react';
import api, { unwrap, apiError } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '@/lib/format';
import { DonutChart, BarChartCard } from '@/components/charts';
import {
  PageHeader, Card, CardHeader, CardBody, StatCard, PageSpinner, EmptyState, Badge, Button,
  Modal, Field, Input, Select, Textarea, Table, THead, TBody, TR, TH, TD, Pagination,
} from '@/components/ui';

const PERIODS = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All time']];
const ACCOUNT_ICON = { CASH: Banknote, BANK: Landmark, MOBILE_MONEY: Smartphone, OTHER: Wallet };
const TXN_TYPE_LABEL = {
  SETTLEMENT: 'Settlement received', WAREHOUSE_SALE: 'Warehouse sale', INCOME: 'Income',
  EXPENSE: 'Expense', STOCK_PURCHASE: 'Stock purchase', COMMISSION_PAYMENT: 'Commission paid',
  TRANSFER: 'Transfer', ADJUSTMENT: 'Adjustment',
};

function usePeriod() { return useState('month'); }

const invalidateFinance = (qc) => ['finance'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

// ── Modals ───────────────────────────────────────────────────────────────────
function AddAccountModal({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', type: 'BANK', openingBalance: '', notes: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => api.post('/finance/accounts', { name: form.name.trim(), type: form.type, openingBalance: Number(form.openingBalance) || 0, notes: form.notes.trim() || undefined }),
    onSuccess: () => { toast.success('Account created'); invalidateFinance(qc); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  return (
    <Modal open onClose={onClose} title="New business account"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>Create account</Button></>}>
      <div className="space-y-4">
        <Field label="Account name" required><Input value={form.name} onChange={set('name')} placeholder="e.g. Equity Bank" /></Field>
        <Field label="Type"><Select value={form.type} onChange={set('type')}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Opening balance (TZS)" hint="What's in this account right now"><Input type="number" min="0" value={form.openingBalance} onChange={set('openingBalance')} placeholder="0" /></Field>
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function MoneyModal({ mode, accounts, categories, onClose }) {
  const qc = useQueryClient();
  const isExpense = mode === 'expense';
  const [form, setForm] = useState({
    accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
    amount: '', category: isExpense ? (categories[0]?.name || '') : '', description: '',
    occurredAt: new Date().toISOString().slice(0, 10), notes: '', newCategory: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () => {
      let category = form.category;
      if (isExpense && form.category === '__new' && form.newCategory.trim()) {
        await api.post('/finance/categories', { name: form.newCategory.trim() });
        category = form.newCategory.trim();
      }
      return api.post(isExpense ? '/finance/expenses' : '/finance/income', {
        accountId: form.accountId, amount: Number(form.amount),
        category: category || undefined, description: form.description.trim() || undefined,
        occurredAt: form.occurredAt, notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: () => { toast.success(isExpense ? 'Expense recorded' : 'Income recorded'); invalidateFinance(qc); onClose(); },
    onError: (e) => toast.error(apiError(e)),
  });
  const valid = form.accountId && Number(form.amount) > 0 && (!isExpense || form.category);
  return (
    <Modal open onClose={onClose} title={isExpense ? 'Record expense' : 'Record income'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{isExpense ? 'Save expense' : 'Save income'}</Button></>}>
      <div className="space-y-4">
        <Field label="Amount (TZS)" required><Input type="number" min="0" value={form.amount} onChange={set('amount')} autoFocus placeholder="0" /></Field>
        {isExpense && (
          <Field label="Category" required>
            <Select value={form.category} onChange={set('category')}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="__new">+ New category…</option>
            </Select>
          </Field>
        )}
        {isExpense && form.category === '__new' && (
          <Field label="New category name" required><Input value={form.newCategory} onChange={set('newCategory')} placeholder="e.g. Repairs" /></Field>
        )}
        {!isExpense && <Field label="Source"><Input value={form.category} onChange={set('category')} placeholder="e.g. Investment, refund" /></Field>}
        <Field label={isExpense ? 'Paid from account' : 'Deposit to account'} required>
          <Select value={form.accountId} onChange={set('accountId')}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={form.occurredAt} onChange={set('occurredAt')} /></Field>
        <Field label="Description"><Input value={form.description} onChange={set('description')} placeholder="What was this for?" /></Field>
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function Overview() {
  const [period, setPeriod] = usePeriod();
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'overview', period],
    queryFn: async () => unwrap(await api.get('/finance/overview', { params: { period } })).data,
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <PageSpinner />;
  const flow = data.flow?.[period] || data.flow?.month || { moneyIn: 0, moneyOut: 0, net: 0 };
  const donut = data.expenseBreakdown.map((e) => ({ name: e.category, value: e.amount }));
  const brand = (data.byBrand || []).map((b) => ({ name: b.name, value: b.profit }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(([k, label]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${period === k ? 'bg-brand-500 text-slate-950' : 'border border-border text-muted hover:bg-elevated'}`}>{label}</button>
        ))}
      </div>

      {/* Hero: cash position + flow */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Cash position" value={formatCurrency(data.cashPosition)} icon={PiggyBank} tone="brand" hint="across all accounts" />
        <StatCard label="Money in" value={formatCurrency(flow.moneyIn)} icon={ArrowDownLeft} tone="emerald" hint={PERIODS.find((p) => p[0] === period)[1]} />
        <StatCard label="Money out" value={formatCurrency(flow.moneyOut)} icon={ArrowUpRight} tone="rose" hint={PERIODS.find((p) => p[0] === period)[1]} />
        <StatCard label="Net cash flow" value={formatCurrency(flow.net)} icon={flow.net >= 0 ? TrendingUp : TrendingDown} tone={flow.net >= 0 ? 'emerald' : 'rose'} />
      </div>

      {/* Profit waterfall */}
      <Card>
        <CardHeader title="Real business profit" subtitle={`Revenue − cost of goods − expenses · ${PERIODS.find((p) => p[0] === period)[1].toLowerCase()}`} />
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Money label="Revenue" value={data.revenue} tone="emerald" />
            <Money label="− COGS" value={data.cogs} tone="slate" />
            <Money label="= Gross profit" value={data.grossProfit} tone="brand" />
            <Money label="− Expenses" value={data.expenses} tone="rose" />
            <Money label="= Net profit" value={data.netProfit} tone={data.netProfit >= 0 ? 'emerald' : 'rose'} big />
          </div>
        </CardBody>
      </Card>

      {/* Accounts + expense breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Accounts" subtitle="Where the money is" />
          <CardBody className="space-y-2">
            {data.accounts.map((a) => {
              const Icon = ACCOUNT_ICON[a.type] || Wallet;
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-elevated p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{a.name}{a.isDefault && <span className="ml-1.5 text-[10px] text-faint">· default</span>}</div>
                    <div className="text-xs text-faint">In {formatCurrency(a.moneyIn)} · Out {formatCurrency(a.moneyOut)}</div>
                  </div>
                  <div className={`text-right font-bold tabular-nums ${a.balance < 0 ? 'text-rose-500' : 'text-foreground'}`}>{formatCurrency(a.balance)}</div>
                </div>
              );
            })}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Expense breakdown" subtitle={`Where money went · ${PERIODS.find((p) => p[0] === period)[1].toLowerCase()}`} />
          <CardBody>
            {donut.length ? <DonutChart data={donut} /> : <EmptyState title="No expenses in this period" icon={Receipt} />}
          </CardBody>
        </Card>
      </div>

      {/* Inventory value + commission + profit by brand */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Inventory (cost)" value={formatCurrency(data.inventoryValue.cost)} icon={Boxes} tone="slate" hint={`${formatNumber(data.inventoryValue.units)} boxes`} />
        <StatCard label="Inventory (selling)" value={formatCurrency(data.inventoryValue.selling)} icon={Boxes} tone="emerald" />
        <StatCard label="Potential profit" value={formatCurrency(data.inventoryValue.potential)} icon={TrendingUp} tone="brand" hint="locked in stock" />
        <StatCard label="Outstanding commission" value={formatCurrency(data.outstandingCommission)} icon={Coins} tone="amber" hint="owed to reps" />
      </div>

      {brand.length > 0 && (
        <Card>
          <CardHeader title="Profit by brand" subtitle="Gross profit this month" />
          <CardBody>{<BarChartCard data={brand} color="#84cc16" height={200} />}</CardBody>
        </Card>
      )}
    </div>
  );
}

function Money({ label, value, tone, big }) {
  const tones = { emerald: 'text-emerald-500', rose: 'text-rose-500', brand: 'text-brand-400', slate: 'text-muted', default: 'text-foreground' };
  return (
    <div className={`rounded-xl border border-border bg-elevated p-3 ${big ? 'ring-1 ring-brand-500/30' : ''}`}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${big ? 'text-xl' : 'text-base'} ${tones[tone] || tones.default}`}>{formatCurrency(value)}</div>
    </div>
  );
}

// ── Accounts tab ──────────────────────────────────────────────────────────────
function Accounts({ onQuick }) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: accounts = [], isLoading } = useQuery({ queryKey: ['finance', 'accounts'], queryFn: async () => unwrap(await api.get('/finance/accounts')).data });
  if (isLoading) return <PageSpinner />;
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><div className="text-xs uppercase tracking-wide text-faint">Total cash position</div><div className="text-2xl font-black text-brand-400 tabular-nums">{formatCurrency(total)}</div></div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onQuick('income')}><ArrowDownLeft className="h-4 w-4" /> Income</Button>
          <Button variant="secondary" onClick={() => onQuick('expense')}><ArrowUpRight className="h-4 w-4" /> Expense</Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Account</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const Icon = ACCOUNT_ICON[a.type] || Wallet;
          return (
            <Card key={a.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400"><Icon className="h-5 w-5" /></span>
                  {a.isDefault && <Badge className="bg-brand-500/15 text-brand-400">Default</Badge>}
                </div>
                <div className="mt-3 text-sm font-semibold text-foreground">{a.name}</div>
                <div className={`text-2xl font-black tabular-nums ${a.balance < 0 ? 'text-rose-500' : 'text-foreground'}`}>{formatCurrency(a.balance)}</div>
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-xs">
                  <span className="text-emerald-500">In {formatCurrency(a.moneyIn)}</span>
                  <span className="text-rose-400">Out {formatCurrency(a.moneyOut)}</span>
                </div>
                <div className="mt-1 text-[11px] text-faint">Opening {formatCurrency(a.openingBalance)}</div>
              </CardBody>
            </Card>
          );
        })}
      </div>
      {addOpen && <AddAccountModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// ── Transactions / Expenses tab ───────────────────────────────────────────────
function Ledger({ expensesOnly }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [account, setAccount] = useState('');
  const [type, setType] = useState('');
  const { data: accounts = [] } = useQuery({ queryKey: ['finance', 'accounts'], queryFn: async () => unwrap(await api.get('/finance/accounts')).data });
  const params = { page, limit: 25, accountId: account || undefined };
  if (expensesOnly) params.direction = 'OUT';
  else if (type) params.type = type;
  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'transactions', { page, account, type, expensesOnly }],
    queryFn: async () => unwrap(await api.get('/finance/transactions', { params })),
  });
  const del = useMutation({
    mutationFn: (id) => api.delete(`/finance/transactions/${id}`, { data: { reason: 'Removed from finance ledger' } }),
    onSuccess: () => { toast.success('Transaction deleted'); invalidateFinance(qc); },
    onError: (e) => toast.error(apiError(e)),
  });
  const rows = data?.data || [];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <Select className="sm:w-44" value={account} onChange={(e) => { setAccount(e.target.value); setPage(1); }}>
          <option value="">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        {!expensesOnly && (
          <Select className="sm:w-48" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {Object.entries(TXN_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </div>
      {isLoading ? <PageSpinner /> : !rows.length ? (
        <EmptyState title={expensesOnly ? 'No expenses yet' : 'No transactions yet'} message="Record income or expenses, or approve a settlement." icon={Receipt} />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Date</TH><TH>Type</TH><TH>Description</TH><TH>Account</TH><TH className="text-right">Amount</TH><TH /></TR></THead>
            <TBody>
              {rows.map((t) => (
                <TR key={t.id}>
                  <TD className="whitespace-nowrap text-faint">{formatDate(t.occurredAt)}</TD>
                  <TD><Badge className={t.direction === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{TXN_TYPE_LABEL[t.type] || t.type}</Badge></TD>
                  <TD className="max-w-[220px] truncate text-foreground">{t.category || t.description || t.reference || '—'}</TD>
                  <TD className="text-muted">{t.account?.name}</TD>
                  <TD className={`text-right font-semibold tabular-nums ${t.direction === 'IN' ? 'text-emerald-500' : 'text-rose-500'}`}>{t.direction === 'IN' ? '+' : '−'}{formatCurrency(t.amount)}</TD>
                  <TD><button onClick={() => del.mutate(t.id)} className="text-faint hover:text-rose-500"><Trash2 className="h-4 w-4" /></button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={data.meta?.totalPages} total={data.meta?.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function Finance() {
  const [tab, setTab] = useState('overview');
  const [money, setMoney] = useState(null); // 'income' | 'expense'
  const { data: accounts = [] } = useQuery({ queryKey: ['finance', 'accounts'], queryFn: async () => unwrap(await api.get('/finance/accounts')).data });
  const { data: categories = [] } = useQuery({ queryKey: ['finance', 'categories'], queryFn: async () => unwrap(await api.get('/finance/categories')).data });

  const TABS = [['overview', 'Overview'], ['accounts', 'Accounts'], ['expenses', 'Expenses'], ['ledger', 'Transactions']];

  return (
    <div>
      <PageHeader title="Finance" subtitle="Your complete business money picture — accounts, cash flow, expenses and real profit.">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMoney('income')}><ArrowDownLeft className="h-4 w-4" /> Income</Button>
          <Button onClick={() => setMoney('expense')}><ArrowUpRight className="h-4 w-4" /> Expense</Button>
        </div>
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === k ? 'bg-elevated text-foreground shadow-sm' : 'text-muted hover:bg-elevated/60'}`}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'accounts' && <Accounts onQuick={setMoney} />}
      {tab === 'expenses' && <Ledger expensesOnly />}
      {tab === 'ledger' && <Ledger />}

      {money && <MoneyModal mode={money} accounts={accounts} categories={categories} onClose={() => setMoney(null)} />}
    </div>
  );
}
