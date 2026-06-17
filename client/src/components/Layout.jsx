import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, Boxes, Truck, ShoppingCart, Users, HandCoins, Undo2,
  ClipboardCheck, UserCog, Repeat, BarChart3, ScrollText, ShieldCheck, Settings,
  Bell, Menu, X, LogOut, ChevronDown,
  Ship, Globe, ClipboardList, Timer, Coins, NotebookPen, Activity, Flag,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { NAV, ROLE_LABELS } from '@/lib/constants';
import { initials } from '@/lib/format';
import api, { unwrap } from '@/lib/api';

const ICONS = {
  LayoutDashboard, Package, Boxes, Truck, ShoppingCart, Users, HandCoins, Undo2,
  ClipboardCheck, UserCog, Repeat, BarChart3, ScrollText, ShieldCheck, Settings,
  Ship, Globe, ClipboardList, Timer, Coins, NotebookPen, Activity, Flag,
};

function NavItems({ items, onNavigate }) {
  const location = useLocation();
  const primary = items.filter((i) => i.group !== 'advanced');
  const advanced = items.filter((i) => i.group === 'advanced');
  const onAdvanced = advanced.some((i) => location.pathname === i.to);
  const [showMore, setShowMore] = useState(onAdvanced);

  const renderLink = (item) => {
    const Icon = ICONS[item.icon] || Package;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
            isActive
              ? 'bg-brand-600 text-slate-950 shadow-[0_4px_16px_-4px_rgba(190,242,100,0.45)]'
              : 'text-muted hover:bg-white/5 hover:text-white'
          }`
        }
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {item.label}
      </NavLink>
    );
  };

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {primary.map(renderLink)}
      {advanced.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowMore((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted transition hover:bg-slate-800 hover:text-muted"
          >
            <span>More tools</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>
          {showMore && <div className="mt-1 space-y-1">{advanced.map(renderLink)}</div>}
        </div>
      )}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 font-extrabold text-slate-950 shadow-[0_4px_16px_-4px_rgba(163,230,53,0.5)]">H</div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">Hao Stock</div>
        <div className="text-[10px] uppercase tracking-wider text-faint">Distribution ERP</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((n) => hasRole(...n.roles));

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => unwrap(await api.get('/notifications/unread-count')).data.unread,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex min-h-screen bg-elevated">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 flex-col border-r border-border bg-[#0c0c0e] lg:flex">
        <Brand />
        <NavItems items={items} />
        <div className="border-t border-white/5 p-3 text-[11px] text-muted">v1.0 · Tanzania</div>
      </aside>

      {/* Sidebar (mobile drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-border bg-[#0c0c0e]">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-faint hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavItems items={items} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 lg:px-6">
          <button className="rounded-lg p-2 text-muted hover:bg-elevated lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />

          <button
            onClick={() => navigate('/notifications')}
            className="relative rounded-lg p-2 text-muted hover:bg-elevated"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {initials(user?.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight text-foreground">{user?.name}</span>
                <span className="block text-[11px] text-muted">{ROLE_LABELS[user?.role] || user?.role}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-faint sm:block" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
                  <div className="border-b border-border px-4 py-2">
                    <div className="truncate text-sm font-medium text-foreground">{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted hover:bg-elevated"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </button>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
