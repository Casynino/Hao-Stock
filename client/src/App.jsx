import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { ROLES } from '@/lib/constants';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import RepDashboard from '@/pages/RepDashboard';
import Products from '@/pages/Products';
import Inventory from '@/pages/Inventory';
import Transfers from '@/pages/Transfers';
import Sales from '@/pages/Sales';
import Customers from '@/pages/Customers';
import Debts from '@/pages/Debts';
import Returns from '@/pages/Returns';
import StockCounts from '@/pages/StockCounts';
import SalesReps from '@/pages/SalesReps';
import SalesRepProfile from '@/pages/SalesRepProfile';
import Reorder from '@/pages/Reorder';
import Reports from '@/pages/Reports';
import AuditLogs from '@/pages/AuditLogs';
import Users from '@/pages/Users';
import Settings from '@/pages/Settings';
import Notifications from '@/pages/Notifications';
import Purchases from '@/pages/Purchases';
import StockRequests from '@/pages/StockRequests';
import Settlements from '@/pages/Settlements';
import Commissions from '@/pages/Commissions';
import OnlineOrders from '@/pages/OnlineOrders';
import DailyReports from '@/pages/DailyReports';
import Activity from '@/pages/Activity';
import Profile from '@/pages/Profile';
import NotFound from '@/pages/NotFound';

// Sales reps get a personal dashboard; everyone else gets the management one.
function DashboardRouter() {
  const { role } = useAuth();
  return role === ROLES.SALES_REP ? <RepDashboard /> : <Dashboard />;
}

const W = [ROLES.WAREHOUSE_STAFF]; // ADMIN always allowed by hasRole

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardRouter />} />
        <Route path="/products" element={<ProtectedRoute roles={W}><Products /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute roles={W}><Inventory /></ProtectedRoute>} />
        <Route path="/purchases" element={<ProtectedRoute roles={W}><Purchases /></ProtectedRoute>} />
        <Route path="/transfers" element={<ProtectedRoute roles={W}><Transfers /></ProtectedRoute>} />
        <Route path="/stock-requests" element={<StockRequests />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/online-orders" element={<ProtectedRoute roles={W}><OnlineOrders /></ProtectedRoute>} />
        <Route path="/commissions" element={<Commissions />} />
        <Route path="/daily-reports" element={<DailyReports />} />
        <Route path="/activity" element={<ProtectedRoute roles={W}><Activity /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute roles={W}><Sales /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute roles={W}><Customers /></ProtectedRoute>} />
        <Route path="/debts" element={<ProtectedRoute roles={W}><Debts /></ProtectedRoute>} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/stock-counts" element={<StockCounts />} />
        <Route path="/reps" element={<ProtectedRoute roles={W}><SalesReps /></ProtectedRoute>} />
        <Route path="/reps/:id" element={<ProtectedRoute roles={W}><SalesRepProfile /></ProtectedRoute>} />
        <Route path="/reorder" element={<ProtectedRoute roles={W}><Reorder /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={W}><Reports /></ProtectedRoute>} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/audit" element={<ProtectedRoute roles={[ROLES.ADMIN]}><AuditLogs /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute roles={[ROLES.ADMIN]}><Users /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={[ROLES.ADMIN]}><Settings /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
