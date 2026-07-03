import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import Login from './pages/auth/Login';
import AdminLayout from './layouts/AdminLayout';
import MainDashboard from './pages/dashboard/MainDashboard';
import SOCDashboard from './pages/security/SOCDashboard';
import AssetRegistry from './pages/assets/AssetRegistry';
import AIPrediction from './pages/ai/AIPrediction';
import QRScanner from './pages/assets/QRScanner';
import GeoTracking from './pages/geo/GeoTracking';
import ComplianceCenter from './pages/security/ComplianceCenter';
import MaintenanceLogs from './pages/operations/MaintenanceLogs';
import Reports from './pages/operations/Reports';
import AuditLog from './pages/operations/AuditLog';
import SystemSettings from './pages/settings/SystemSettings';
import PersonnelDirectory from './pages/employees/PersonnelDirectory';
import UsersManagement from './pages/employees/UsersManagement';
import LiveTelemetry from './pages/monitoring/LiveTelemetry';

// Main app component containing all the routes. AdminLayout wraps all pages except Login.
function App() {
  return (
    <LanguageProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<MainDashboard />} />
            <Route path="/assets" element={<AssetRegistry />} />
            <Route path="/employees" element={<PersonnelDirectory />} />
            <Route path="/users" element={<UsersManagement />} />
            <Route path="/security" element={<ComplianceCenter />} />
            <Route path="/threats" element={<SOCDashboard />} />
            <Route path="/ai-predict" element={<AIPrediction />} />
            <Route path="/monitoring" element={<LiveTelemetry />} />
            <Route path="/geo-track" element={<GeoTracking />} />
            <Route path="/qr-scan" element={<QRScanner />} />
            <Route path="/maintenance" element={<MaintenanceLogs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/settings" element={<SystemSettings />} />
          </Route>
        </Routes>
      </Router>
    </LanguageProvider>
  );
}

export default App;
