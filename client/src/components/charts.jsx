import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/format';

const AXIS = { fontSize: 11, fill: '#94a3b8' };
const PALETTE = ['#a3e635', '#84cc16', '#f59e0b', '#e11d48', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ data, series = [{ key: 'revenue', name: 'Revenue', color: '#a3e635' }], height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v, { compact: true })} width={48} />
        <Tooltip content={<MoneyTooltip />} />
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarChartCard({ data, dataKey = 'value', labelKey = 'name', money = true, height = 280, color = '#a3e635' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v, { compact: true })} />
        <YAxis type="category" dataKey={labelKey} tick={AXIS} tickLine={false} axisLine={false} width={130} />
        <Tooltip
          cursor={false}
          formatter={(v) => (money ? formatCurrency(v) : formatNumber(v))}
          contentStyle={{ fontSize: 12, borderRadius: 8, background: '#151517', border: '1px solid #2a2a30', color: '#f4f4f5' }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, dataKey = 'value', nameKey = 'name', height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={dataKey} nameKey={nameKey} innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8, background: '#151517', border: '1px solid #2a2a30', color: '#f4f4f5' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
