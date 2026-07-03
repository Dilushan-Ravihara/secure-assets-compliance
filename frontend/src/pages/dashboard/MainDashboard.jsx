import { useState, useEffect } from 'react';
import { FiShield, FiAlertOctagon, FiCpu, FiCheckCircle, FiActivity, FiServer } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import axios from 'axios';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

const MainDashboard = () => {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [threatHistory, setThreatHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch stats on load and set a 5-second interval timer to keep things fresh
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // Pull counts and active alerts in parallel
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const [statsRes, alertsRes, historyRes] = await Promise.all([
        axios.get('http://localhost:5000/api/dashboard/stats', config),
        axios.get('http://localhost:5000/api/dashboard/recent-alerts', config),
        axios.get('http://localhost:5000/api/dashboard/threat-history', config)
      ]);
      
      setStats(statsRes.data);
      setAlerts(alertsRes.data);
      setThreatHistory(historyRes.data || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  // Export dashboard statistics to a CSV file
  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      // Create and download a dashboard overview file
      const dummyData = `System Overview Report - Generated ${new Date().toLocaleString()}\n` +
        `Total Assets,${stats?.assets?.total_assets || 0}\n` +
        `Compliance,${complianceVal}%\n` +
        `Open Alerts,${stats?.security?.total_open || 0}\n` +
        `Critical Incidents,${stats?.security?.critical_open || 0}\n` +
        `IoT Devices Online,${stats?.telemetry?.online_devices || 0}\n`;
      const blob = new Blob([dummyData], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SecureAssets_Dashboard_Overview.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 1500);
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#00f0ff',
        bodyColor: '#e2e8f0',
        borderColor: '#1e293b',
        borderWidth: 1,
        padding: 12
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { family: 'Fira Code' } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { family: 'Fira Code' } } }
    }
  };

  const threatData = {
    labels: threatHistory.length > 0
      ? threatHistory.map(d => d.label)
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    datasets: [
      {
        label: 'Critical',
        data: threatHistory.length > 0
          ? threatHistory.map(d => d.critical)
          : [0, 0, 0, 0, 0, 0, stats?.security?.critical_open || 0],
        borderColor: '#ff003c',
        backgroundColor: 'rgba(255,0,60,0.08)',
        tension: 0.4, fill: true,
        pointBackgroundColor: '#050b14',
        pointBorderColor: '#ff003c',
        pointBorderWidth: 2, pointHoverRadius: 6,
      },
      {
        label: 'All Threats',
        data: threatHistory.length > 0
          ? threatHistory.map(d => d.total)
          : [0, 0, 0, 0, 0, 0, stats?.security?.total_open || 0],
        borderColor: '#00f0ff',
        backgroundColor: 'rgba(0,240,255,0.06)',
        tension: 0.4, fill: true,
        pointBackgroundColor: '#050b14',
        pointBorderColor: '#00f0ff',
        pointBorderWidth: 2, pointHoverRadius: 6,
      }
    ]
  };

  // Figure out compliance score (percentage of assets that have no active security alerts)
  const complianceVal = stats?.assets?.total_assets > 0 
    ? Math.round(((stats.assets.total_assets - (stats.security?.total_open || 0)) / stats.assets.total_assets) * 100) 
    : 100;

  const complianceData = {
    labels: ['Compliant', 'Warning', 'Critical'],
    datasets: [{
      data: [complianceVal, Math.max(0, 100 - complianceVal - 5), Math.min(5, 100 - complianceVal)],
      backgroundColor: ['#00ff66', '#ffb700', '#ff003c'],
      borderWidth: 0,
      hoverOffset: 6
    }]
  };

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-0 right-0 bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50">
          <FiCheckCircle className="text-xl" />
          <span className="font-mono text-sm">Dashboard report downloaded successfully.</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono">OFFICE DEVICE <span className="text-primary">OVERVIEW</span></h1>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(0,255,102,0.8)]"></span>
            Live device speed and security checks are active
          </p>
        </div>
        <button onClick={handleExport} disabled={isExporting} className="btn-primary text-sm py-2 px-6 tracking-wider flex items-center gap-2">
          {isExporting ? <span className="animate-pulse">DOWNLOADING...</span> : 'DOWNLOAD REPORT'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        <div className="glass-panel p-6 border-b-[3px] border-b-primary group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-slate-800 rounded-xl text-primary group-hover:scale-110 transition-transform"><FiServer className="text-2xl" /></div>
            <span className="text-xs text-primary font-mono">{stats?.assets?.active_assets || 0} Active</span>
          </div>
          <div>
            <div className="text-4xl font-mono font-bold text-white mb-1">{stats?.assets?.total_assets || 0}</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Assets</div>
          </div>
        </div>
        
        <div className={`glass-panel p-6 border-b-[3px] group ${complianceVal >= 90 ? 'border-b-success' : complianceVal >= 70 ? 'border-b-warning' : 'border-b-danger'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-slate-800 rounded-xl text-slate-300 group-hover:scale-110 transition-transform"><FiCheckCircle className="text-2xl" /></div>
            <span className="text-xs text-slate-500 font-mono">Target: 95%</span>
          </div>
          <div>
            <div className={`text-4xl font-mono font-bold mb-1 ${complianceVal >= 90 ? 'text-success' : complianceVal >= 70 ? 'text-warning' : 'text-danger'}`}>{complianceVal}%</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Rules Passed</div>
          </div>
        </div>

        <div className="glass-panel p-6 border-b-[3px] border-b-warning group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-slate-800 rounded-xl text-warning group-hover:scale-110 transition-transform"><FiAlertOctagon className="text-2xl" /></div>
            <span className="text-xs text-warning font-mono">Requires Action</span>
          </div>
          <div>
            <div className="text-4xl font-mono font-bold text-white mb-1">{stats?.security?.total_open || 0}</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Security Alerts</div>
          </div>
        </div>

        <div className="glass-panel p-6 border-b-[3px] border-b-danger group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-slate-800 rounded-xl text-danger group-hover:scale-110 transition-transform"><FiShield className="text-2xl" /></div>
            <span className="text-xs text-danger font-mono">Immediate</span>
          </div>
          <div>
            <div className="text-4xl font-mono font-bold text-white mb-1">{stats?.security?.critical_open || 0}</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">High Security Risks</div>
          </div>
        </div>

        <div className="glass-panel p-6 border-b-[3px] border-b-[#00f0ff] group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-slate-800 rounded-xl text-[#00f0ff] group-hover:scale-110 transition-transform"><FiCpu className="text-2xl" /></div>
            <span className="text-xs text-[#00f0ff] font-mono animate-pulse">Live Stream</span>
          </div>
          <div>
            <div className="text-4xl font-mono font-bold text-white mb-1">{stats?.telemetry?.online_devices || 0}</div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Connected Devices Online</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="col-span-2 glass-panel p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-bold flex items-center gap-2 uppercase tracking-wider text-sm"><FiActivity className="text-primary" /> Security Incidents Over Time</h3>
            <div className="text-xs text-primary font-mono bg-primary/10 px-3 py-1 rounded-full border border-primary/30">LIVE DATA</div>
          </div>
          <div className="h-72">
            <Line data={threatData} options={lineOptions} />
          </div>
        </div>
        
        <div className="glass-panel p-6 flex flex-col">
          <h3 className="text-white font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-sm"><FiCheckCircle className="text-primary" /> Security Rules Success Rate</h3>
          <div className="flex-1 relative flex justify-center items-center pb-4">
            <Doughnut data={complianceData} options={{ 
              responsive: true, maintainAspectRatio: false, cutout: '80%', 
              plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Fira Code', size: 11 }, padding: 20, usePointStyle: true } } } 
            }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center -mt-6 pointer-events-none">
              <span className="text-3xl font-mono font-bold text-white">{complianceVal}%</span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Rules Passed</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Alerts */}
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 uppercase tracking-wider text-sm mt-8"><FiAlertOctagon className="text-danger" /> High Risk Incidents</h3>
      
      {alerts.length === 0 ? (
        <div className="glass-panel p-8 text-center border-t-[3px] border-t-success text-success">
          <FiShield className="text-4xl mx-auto mb-4 opacity-50" />
          <h4 className="font-bold text-white mb-2 font-mono">ALL SYSTEMS SECURE</h4>
          <p className="text-sm">All computers are safe. No urgent threats found.</p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[11px] tracking-widest uppercase">
                <th className="px-6 py-4">Alert ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Severity</th>
                <th className="px-6 py-4">Device</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-300 divide-y divide-slate-800/80">
              {alerts.map(alert => (
                <tr key={alert.alert_id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-white">{alert.alert_id}</td>
                  <td className="px-6 py-4">{alert.type}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono border ${
                      alert.severity === 'CRITICAL' ? 'bg-danger/10 text-danger border-danger/30' :
                      alert.severity === 'HIGH' ? 'bg-warning/10 text-warning border-warning/30' :
                      'bg-primary/10 text-primary border-primary/30'
                    }`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono">{alert.asset_code || alert.device_id || 'Unknown'}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono">{new Date(alert.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MainDashboard;
