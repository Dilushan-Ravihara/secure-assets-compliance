import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  FiGrid, FiBox, FiUsers, FiShield, FiActivity, FiAlertTriangle, 
  FiTool, FiFileText, FiCpu, FiMapPin, FiSettings, FiLogOut, FiBell, FiSearch,
  FiSun, FiMoon, FiWifi, FiList, FiGlobe, FiClock
} from 'react-icons/fi';
import axios from 'axios';
import { socket } from '../services/socket';
import { useLanguage } from '../context/LanguageContext';

// Styles and badges for different user roles (super_admin, admin, viewer)
const ROLE_META = {
  super_admin: { label: 'SUPER ADMIN', color: 'text-danger',  bg: 'bg-danger/10',  border: 'border-danger/30'  },
  admin:       { label: 'ADMIN',       color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  viewer:      { label: 'VIEWER',      color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
};

const AdminLayout = () => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { currentLanguage, setCurrentLanguage, t, languageOptions } = useLanguage();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isActive  = (path) => location.pathname === path ? 'active' : '';
  const openAlertCount = alerts => alerts.filter(a => a.status === 'open').length;

  // Read saved theme from localStorage, default to dark base theme
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [alerts, setAlerts] = useState([]);

  // ── Feature 6: Session Timeout ──────────────────────────────────────────────
  const SESSION_MS = 30 * 60 * 1000; // 30 minutes of inactivity
  const WARN_MS    = 60 * 1000;       // warn 60 seconds before expiry
  const [sessionWarning, setSessionWarning] = useState(false);
  const [countdown, setCountdown]           = useState(60);
  const timeoutRef   = useRef(null);
  const warnRef      = useRef(null);
  const countdownRef = useRef(null);

  const doLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  }, [navigate]);

  const resetSessionTimer = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(warnRef.current);
    clearInterval(countdownRef.current);
    setSessionWarning(false);
    setCountdown(60);

    // Show warning 60 seconds before logout
    warnRef.current = setTimeout(() => {
      setSessionWarning(true);
      let secs = 60;
      setCountdown(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0) {
          clearInterval(countdownRef.current);
          doLogout();
        }
      }, 1000);
    }, SESSION_MS - WARN_MS);

    // Hard logout after full timeout
    timeoutRef.current = setTimeout(doLogout, SESSION_MS);
  }, [doLogout, SESSION_MS, WARN_MS]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, resetSessionTimer, { passive: true }));
    resetSessionTimer(); // start timer on mount
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetSessionTimer));
      clearTimeout(timeoutRef.current);
      clearTimeout(warnRef.current);
      clearInterval(countdownRef.current);
    };
  }, [resetSessionTimer]);
  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Pull recent security alerts from backend API
  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get('http://localhost:5000/api/security/alerts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data && response.data.data) {
        setAlerts(response.data.data.slice(0, 10)); // Keep top 10
      }
    } catch (err) {
      console.error('Failed to fetch security alerts:', err);
    }
  };

  // Fetch alerts on load and set up socket updates
  useEffect(() => {
    fetchAlerts();

    const handleNewAlert = (newAlert) => {
      setAlerts(prev => [newAlert, ...prev].slice(0, 10));
    };

    socket.on('security-alert', handleNewAlert);

    return () => {
      socket.off('security-alert', handleNewAlert);
    };
  }, []);

  // Resolve all notifications alerts
  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem('token');
      const openAlerts = alerts.filter(a => a.status === 'open');
      await Promise.all(openAlerts.map(a => 
        axios.put(`http://localhost:5000/api/security/alerts/${a.id || a.alert_id}/resolve`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ));
      fetchAlerts();
    } catch (err) {
      console.error('Failed to resolve alerts:', err);
      setAlerts(prev => prev.map(a => ({ ...a, status: 'resolved' })));
    }
  };

  // Human-readable time helper (e.g. 5 MINS AGO)
  const formatTimeAgo = (dateStr) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'JUST NOW';
      if (diffMins < 60) return `${diffMins} MINS AGO`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'HOUR' : 'HOURS'} AGO`;
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return '';
    }
  };

  // Read current logged-in user
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const roleMeta    = ROLE_META[currentUser.role] || ROLE_META.viewer;
  const userInitial = (currentUser.name || 'U').charAt(0).toUpperCase();

  // Wipe token and user info, then redirect to login page
  const handleLogout = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(warnRef.current);
    clearInterval(countdownRef.current);
    doLogout();
  }, [doLogout]);

  // Handle topbar search — navigate to assets page with query string
  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/assets?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <div className="flex min-h-screen bg-darkBase">

      {/* ── Feature 6: Session Warning Modal ─────────────────────────────────── */}
      {sessionWarning && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass-panel w-96 p-8 text-center border-t-4 border-t-warning shadow-[0_0_60px_rgba(245,158,11,0.3)] animate-[fadeIn_0.3s_ease-out]">
            <div className="w-16 h-16 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center mx-auto mb-4">
              <FiClock className="text-warning text-3xl" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 font-mono tracking-wider">SESSION EXPIRING</h2>
            <p className="text-slate-400 text-sm mb-6">Your session will automatically end in:</p>
            <div className={`text-6xl font-bold font-mono mb-6 tabular-nums transition-colors ${
              countdown <= 10 ? 'text-danger animate-pulse' : 'text-warning'
            }`}>{countdown}s</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={resetSessionTimer}
                className="btn-primary px-8 py-2.5 text-sm font-mono"
              >
                STAY LOGGED IN
              </button>
              <button
                onClick={handleLogout}
                className="px-6 py-2.5 text-sm font-mono text-danger border border-danger/30 rounded-lg hover:bg-danger/10 transition-colors"
              >
                LOGOUT NOW
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-64 bg-darkCard/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col fixed inset-y-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        <div className="h-16 flex items-center px-6 border-b border-slate-800/80 bg-black/20">
          <FiShield className="text-primary text-2xl mr-3 shadow-primary" />
          <span className="font-bold text-lg text-white tracking-wider font-mono">SECURE<span className="text-primary">ASSETS</span></span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-2">{t('sidebarCore')}</div>
          <Link to="/dashboard" className={`nav-item ${isActive('/dashboard')}`}><FiGrid className="text-lg" /> {t('sidebarOverview')}</Link>
          <Link to="/assets" className={`nav-item ${isActive('/assets')}`}><FiBox className="text-lg" /> {t('sidebarAssets')}</Link>
          <Link to="/employees" className={`nav-item ${isActive('/employees')}`}><FiUsers className="text-lg" /> {t('sidebarPersonnel')}</Link>
          <Link to="/users" className={`nav-item ${isActive('/users')}`}><FiUsers className="text-lg" /> {t('sidebarUsers')}</Link>
          
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-6">{t('sidebarSecurity')}</div>
          <Link to="/security" className={`nav-item ${isActive('/security')}`}><FiShield className="text-lg" /> {t('sidebarCompliance')}</Link>
          <Link to="/threats" className={`nav-item ${isActive('/threats')} relative`}>
            <FiAlertTriangle className="text-lg" /> {t('sidebarThreats')}
            {openAlertCount(alerts) > 0 && (
              <span className="ml-auto min-w-[20px] h-5 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-[0_0_6px_rgba(255,0,60,0.7)]">
                {openAlertCount(alerts) > 99 ? '99+' : openAlertCount(alerts)}
              </span>
            )}
          </Link>
          <Link to="/ai-predict" className={`nav-item ${isActive('/ai-predict')}`}><FiCpu className="text-lg" /> {t('sidebarAI')}</Link>
          
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-6">{t('sidebarTracking')}</div>
          <Link to="/monitoring" className={`nav-item ${isActive('/monitoring')}`}><FiWifi className="text-lg" /> {t('sidebarLive')}</Link>
          <Link to="/geo-track" className={`nav-item ${isActive('/geo-track')}`}><FiMapPin className="text-lg" /> {t('sidebarGeo')}</Link>
          <Link to="/qr-scan" className={`nav-item ${isActive('/qr-scan')}`}><FiActivity className="text-lg" /> {t('sidebarQR')}</Link>

          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2 mt-6">{t('sidebarOperations')}</div>
          <Link to="/maintenance" className={`nav-item ${isActive('/maintenance')}`}><FiTool className="text-lg" /> {t('sidebarMaintenance')}</Link>
          <Link to="/reports" className={`nav-item ${isActive('/reports')}`}><FiFileText className="text-lg" /> {t('sidebarReports')}</Link>
          <Link to="/audit-log" className={`nav-item ${isActive('/audit-log')}`}><FiList className="text-lg" /> {t('sidebarAudit')}</Link>
        </div>

        <div className="p-4 border-t border-slate-800 bg-black/20">
          <Link to="/settings" className={`nav-item mb-2 ${isActive('/settings')}`}><FiSettings className="text-lg" /> {t('sidebarSettings')}</Link>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-danger hover:bg-danger/10 hover:text-danger rounded-lg transition-all font-bold text-sm tracking-wide w-full">
            <FiLogOut className="text-lg" /> {t('sidebarLogout')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen relative">
        {/* Background ambient light */}
        <div className="absolute top-0 right-0 w-1/2 h-96 bg-primary/5 rounded-full blur-[150px] pointer-events-none"></div>

        {/* Topbar */}
        <header className="h-16 bg-darkCard/60 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder={t('topbarSearch')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                className="bg-slate-900/50 border border-slate-700/50 text-slate-300 px-4 py-1.5 pl-10 rounded-full text-sm focus:outline-none focus:border-primary/50 focus:bg-slate-900 w-64 transition-all"
              />
            </div>
            <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase">
              <span>{t('topbarUplink')}:</span>
              <span className="text-success flex items-center gap-1"><span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_5px_rgba(0,255,102,1)]"></span> {t('topbarSecure')}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {/* 🌐 Global Language Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-700/60 rounded-full px-2.5 py-1 text-xs hover:border-primary/50 transition-all">
              <FiGlobe className="text-primary text-xs" />
              <select
                value={currentLanguage}
                onChange={(e) => setCurrentLanguage(e.target.value)}
                className="bg-transparent text-slate-300 focus:outline-none text-[10px] font-mono font-bold cursor-pointer"
              >
                {languageOptions.map((opt) => (
                  <option key={opt.code} value={opt.code} className="bg-slate-950 text-slate-300">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={toggleTheme} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full" title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
              {theme === 'light' ? <FiMoon className="text-xl" /> : <FiSun className="text-xl" />}
            </button>

            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="relative text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full">
                <FiBell className="text-xl" />
                {alerts.some(a => a.status === 'open') && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-danger rounded-full shadow-[0_0_8px_rgba(255,0,60,0.8)] animate-pulse"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 glass-panel bg-darkCard/95 border border-slate-700 shadow-2xl rounded-xl overflow-hidden z-50 animate-[fadeIn_0.2s_ease-out]">
                  <div className="bg-slate-800/80 p-3 flex justify-between items-center border-b border-slate-700">
                    <span className="text-white font-bold text-sm uppercase tracking-wider">{t('topbarSystemAlerts')}</span>
                    {alerts.some(a => a.status === 'open') && (
                      <button onClick={handleMarkAllRead} className="text-[10px] text-primary hover:text-white transition-colors font-mono">{t('topbarMarkRead')}</button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs font-mono">
                        NO ACTIVE ALERTS
                      </div>
                    ) : (
                      alerts.map(alert => (
                        <div key={alert.id || alert.alert_id} className="p-4 border-b border-slate-800/80 hover:bg-white/5 transition-colors cursor-pointer flex gap-3">
                          {alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? (
                            <FiAlertTriangle className="text-danger flex-shrink-0 mt-1" />
                          ) : (
                            <FiShield className="text-primary flex-shrink-0 mt-1" />
                          )}
                          <div>
                            <p className="text-sm text-slate-300 font-bold mb-1 leading-tight">{alert.type}</p>
                            <p className="text-xs text-slate-500 font-mono">{alert.description}</p>
                            <p className="text-[10px] text-slate-600 mt-2 font-mono uppercase">{formatTimeAgo(alert.created_at)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div onClick={() => { setShowNotifications(false); navigate('/security'); }} className="bg-black/40 p-2 text-center border-t border-slate-700 hover:bg-white/5 cursor-pointer transition-colors">
                    <button className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">{t('topbarViewLogs')}</button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-700/50">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-white">{currentUser.name || 'User'}</div>
                <div className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${roleMeta.color} ${roleMeta.bg} ${roleMeta.border}`}>
                  {roleMeta.label}
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/50 flex items-center justify-center text-white font-bold shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                {userInitial}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
