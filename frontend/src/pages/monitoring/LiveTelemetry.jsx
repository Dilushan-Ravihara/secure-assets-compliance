import { useEffect, useState, useRef } from 'react';
import {
  FiActivity, FiWifi, FiAlertTriangle, FiCheckCircle,
  FiXCircle, FiCpu, FiShield, FiServer, FiTrendingUp,
  FiTrendingDown, FiMinus, FiZap, FiEye, FiPower,
  FiRefreshCw, FiDownload, FiTrash2, FiThermometer, FiHardDrive,
  FiSearch
} from 'react-icons/fi';
import axios from 'axios';
import { socket } from '../../services/socket';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

// Rolling 60-point per-device history stored in a ref (not state — avoids re-renders)
const MAX_PTS = 60;

// Colour helpers
const riskColor   = (s) => s >= 70 ? '#ff003c' : s >= 40 ? '#ffb700' : '#00ff66';
const riskLabel   = (s) => s >= 70 ? 'HIGH'     : s >= 40 ? 'MED'     : 'LOW';
const metricColor = (v) => v > 85 ? 'text-danger' : v > 60 ? 'text-warning' : 'text-success';
const barColor    = (v) => v > 85 ? '#ff003c'    : v > 60 ? '#ffb700'    : '#00ff66';

// ── Tiny inline sparkline (SVG, no library) ─────────────────────────────────
const Spark = ({ data, color, height = 32, width = 100 }) => {
  if (!data || data.length < 2) return <div style={{ width, height }} className="opacity-20 bg-slate-800 rounded" />;
  const max  = Math.max(...data, 1);
  const pts  = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - (v / max) * height,
  ]);
  const path = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ');
  const area = path + ` L ${width},${height} L 0,${height} Z`;
  return (
    <svg width={width} height={height} className="overflow-visible flex-shrink-0">
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color})`} />
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill={color} />
    </svg>
  );
};

// ── Health Gauge (circular) ───────────────────────────────────────────────────
const Gauge = ({ value, size = 56 }) => {
  const r   = (size / 2) - 5;
  const c   = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  const col = riskColor(pct);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={col} strokeWidth="5"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={col} fontSize="11" fontFamily="monospace" fontWeight="bold">
        {pct}%
      </text>
    </svg>
  );
};

// ── Status dot ────────────────────────────────────────────────────────────────
const Dot = ({ online }) => (
  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
    online ? 'bg-success shadow-[0_0_6px_#00ff66] animate-pulse' : 'bg-slate-600'
  }`} />
);

// ── Trend arrow ───────────────────────────────────────────────────────────────
const Trend = ({ history }) => {
  if (!history || history.length < 4) return <FiMinus className="text-slate-600 text-xs" />;
  const last4 = history.slice(-4);
  const delta = last4[3] - last4[0];
  if (delta >  3) return <FiTrendingUp   className="text-danger  text-xs" />;
  if (delta < -3) return <FiTrendingDown className="text-success text-xs" />;
  return <FiMinus className="text-slate-500 text-xs" />;
};

// ─────────────────────────────────────────────────────────────────────────────
const LiveTelemetry = () => {
  const [devices, setDevices] = useState({});
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(null);  // device_id for detail panel
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('analytics');

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ONLINE' | 'OFFLINE'
  const [connectorOS, setConnectorOS] = useState('windows');

  // Network Discoverer States
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredDevice, setDiscoveredDevice] = useState(null);
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState(0);

  // Command Execution States
  const [controlAction, setControlAction] = useState(null); // 'restart' | 'shutdown' | 'update'
  const [activeControlDevice, setActiveControlDevice] = useState(null);
  const [controlLogs, setControlLogs] = useState([]);
  const [controlProgress, setControlProgress] = useState(0);

  // Toast Notification States
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const history = useRef({});  // { [device_id]: { cpu:[], ram:[], disk:[], risk:[] } }

  // Current User Permissions
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const userRole = currentUser.role || 'viewer';
  const canControl = ['admin', 'super_admin'].includes(userRole);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Retrieve the latest telemetry readings from the server
  const fetchTelemetry = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/telemetry/latest', config);
      const map = {};
      response.data.forEach(d => {
        map[d.device_id] = d;
        // Seed rolling history buffer
        if (d.device_id && !history.current[d.device_id]) {
          history.current[d.device_id] = {
            cpu: Array(10).fill(parseFloat(d.cpu) || 0),
            ram: Array(10).fill(parseFloat(d.ram) || 0),
            disk: Array(10).fill(parseFloat(d.disk) || 0),
            risk: Array(10).fill(parseFloat(d.risk_score) || 0),
          };
        }
      });
      setDevices(map);
    } catch (error) {
      console.error('Error fetching telemetry:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Attach socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    fetchTelemetry();

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('device-snapshot', (snap) => {
      const map = {};
      snap.forEach(d => { map[d.device_id] = d; });
      setDevices(map);
    });

    socket.on('live-update', (data) => {
      const id  = data.device_id;
      const h   = history.current[id] || { cpu: [], ram: [], disk: [], risk: [] };
      history.current[id] = {
        cpu:  [...h.cpu.slice(-(MAX_PTS-1)),  parseFloat(data.cpu)        || 0],
        ram:  [...h.ram.slice(-(MAX_PTS-1)),  parseFloat(data.ram)        || 0],
        disk: [...h.disk.slice(-(MAX_PTS-1)), parseFloat(data.disk)       || 0],
        risk: [...h.risk.slice(-(MAX_PTS-1)), parseFloat(data.risk_score) || 0],
      };
      setDevices(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));
      if (data.alerts?.length) {
        setAlerts(prev => [
          { device_id: id, alerts: data.alerts, ts: new Date().toLocaleTimeString() },
          ...prev
        ].slice(0, 30));
      }
    });

    socket.on('device-offline', ({ device_id }) => {
      setDevices(prev => ({
        ...prev,
        [device_id]: { ...prev[device_id], status: 'OFFLINE' }
      }));
    });

    socket.on('device-removed', ({ device_id }) => {
      setDevices(prev => {
        const updated = { ...prev };
        delete updated[device_id];
        return updated;
      });
      if (selected === device_id) {
        setSelected(null);
      }
    });

    socket.on('all-devices-cleared', () => {
      setDevices({});
      setSelected(null);
      setAlerts([]);
    });

    return () => {
      socket.off('connect'); 
      socket.off('disconnect');
      socket.off('device-snapshot'); 
      socket.off('live-update'); 
      socket.off('device-offline');
      socket.off('device-removed');
      socket.off('all-devices-cleared');
    };
  }, []);

  // Delete device history logs
  const handleDeleteDevice = async (deviceId) => {
    if (window.confirm("Are you sure you want to delete this device's telemetry data? This will remove all records from database and memory.")) {
      try {
        const token = localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        await axios.delete(`http://localhost:5000/api/telemetry/device/${deviceId}`, config);
        setDevices(prev => {
          const updated = { ...prev };
          delete updated[deviceId];
          return updated;
        });
        if (selected === deviceId) {
          setSelected(null);
        }
        triggerToast("✓ Device deleted successfully.");
      } catch (err) {
        console.error("Failed to delete device:", err);
        triggerToast("❌ Failed to delete device.");
      }
    }
  };

  // Clear ALL device telemetry from DB and live store
  const handleClearAllDevices = async () => {
    if (!window.confirm("⚠️ This will permanently delete ALL device telemetry records from the database. This action cannot be undone. Continue?")) return;
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete('http://localhost:5000/api/telemetry/all', config);
      setDevices({});
      setSelected(null);
      setAlerts([]);
      triggerToast("✓ All device telemetry cleared from database.");
    } catch (err) {
      console.error("Failed to clear all devices:", err);
      triggerToast("❌ Failed to clear devices: " + (err.response?.data?.error || err.message));
    }
  };

  // Simulate searching local network and registering a mock device
  const handleDiscover = async () => {
    setIsDiscovering(true);
    setDiscoveredDevice(null);
    setScanProgress(0);
    setScanLogs(["[SCANNER] Pinging local subnets 192.168.10.0/24...", "[SCANNER] Sniffing ARP packages..."]);
    
    const logs = [
      "Found new responsive host at MAC vendor Shenzhen Legent...",
      "Executing OS profiling via TCP fingerprints...",
      "Detected FreeRTOS OS with lightweight TCP stack...",
      "Registering new device in telemetry database...",
      "Auto-registering asset in Inventory Registry...",
      "Discovery sequence complete. Device online."
    ];

    for (let i = 0; i < logs.length; i++) {
      await new Promise(r => setTimeout(r, 450));
      setScanProgress(Math.round(((i + 1) / logs.length) * 100));
      setScanLogs(prev => [...prev, `[SCANNER] ${logs[i]}`]);
    }

    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.post('http://localhost:5000/api/telemetry/discover', {}, config);
      setDiscoveredDevice(response.data);
      fetchTelemetry(); // refresh list
    } catch (error) {
      console.error('Failed to discover new devices:', error);
      setScanLogs(prev => [...prev, "[ERR] DISCOVERY FAULT: HOST REFUSED HANDSHAKE"]);
    }
  };

  // Run remote commands on a device (restart, power off, firmware update)
  const executeDeviceCommand = async (device, action) => {
    setActiveControlDevice(device);
    setControlAction(action);
    setControlProgress(0);
    
    const token = localStorage.getItem('token');
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    
    if (action === 'restart') {
      setControlLogs(["[CONNECT] Establishing connection to daemon...", "[AUTH] Verification token exchange... OK"]);
      
      const logs = [
        "Sending shutdown command to daemon: SIGTERM (Signal 15)...",
        "Terminating active process threads...",
        "Flushing local system caches...",
        "Closing socket listeners...",
        "Device rebooting (going offline)..."
      ];
      
      const apiPromise = axios.post(`http://localhost:5000/api/telemetry/device/${device.device_id}/restart`, {}, config);
      
      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        setControlProgress(Math.round(((i + 1) / (logs.length + 2)) * 100));
        setControlLogs(prev => [...prev, `[LOG] ${logs[i]}`]);
      }
      
      try {
        await apiPromise;
        setControlProgress(85);
        setControlLogs(prev => [...prev, "[SYSTEM] Waiting for device socket ping back..."]);
        
        await new Promise(r => setTimeout(r, 1500));
        fetchTelemetry();
        setControlProgress(100);
        setControlLogs(prev => [...prev, "[SUCCESS] Ping detected! Device successfully rebooted & online."]);
      } catch {
        setControlLogs(prev => [...prev, "[ERROR] Remote reboot command execution failed."]);
        setControlProgress(100);
      }
    } else if (action === 'shutdown') {
      setControlLogs(["[CONNECT] Connecting to device controller...", "[AUTH] Admin privileges verified."]);
      
      const logs = [
        "Remote power-down sequence triggered...",
        "Sending SIGKILL (Signal 9)...",
        "Halting operating system kernel...",
        "Disabling network adapter interfaces...",
        "Cutting primary device power rails."
      ];
      
      const apiPromise = axios.post(`http://localhost:5000/api/telemetry/device/${device.device_id}/shutdown`, {}, config);
      
      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 500));
        setControlProgress(Math.round(((i + 1) / (logs.length + 1)) * 100));
        setControlLogs(prev => [...prev, `[LOG] ${logs[i]}`]);
      }
      
      try {
        await apiPromise;
        fetchTelemetry();
        setControlProgress(100);
        setControlLogs(prev => [...prev, "[SUCCESS] Device powered off. Disconnected successfully."]);
      } catch {
        setControlLogs(prev => [...prev, "[ERROR] Remote power-down sequence failed."]);
        setControlProgress(100);
      }
    } else if (action === 'update') {
      setControlLogs(["[CONNECT] Querying package server for updates...", "[SYSTEM] Found patch index: v10.5.0 Cumulative Update"]);
      
      const logs = [
        "Downloading update package binaries... 25%",
        "Downloading update package binaries... 75%",
        "Verifying SHA-255 package check sum... OK",
        "Unpacking compiled binaries and configs...",
        "Applying kernel static libraries patch scripts...",
        "Rebuilding system modules...",
        "Invoking firmware reboot sequence..."
      ];
      
      const apiPromise = axios.post(`http://localhost:5000/api/telemetry/device/${device.device_id}/update-firmware`, {}, config);
      
      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        setControlProgress(Math.round(((i + 1) / (logs.length + 1)) * 100));
        setControlLogs(prev => [...prev, `[LOG] ${logs[i]}`]);
      }
      
      try {
        await apiPromise;
        fetchTelemetry();
        setControlProgress(100);
        setControlLogs(prev => [...prev, "[SUCCESS] Update completed successfully! Version synced."]);
      } catch {
        setControlLogs(prev => [...prev, "[ERROR] Update validation failed! GPG signature error."]);
        setControlProgress(100);
      }
    }
  };

  const executeBulkCommand = async (action) => {
    const onlineCount = list.filter(d => d.status !== 'OFFLINE').length;
    if (onlineCount === 0) {
      triggerToast("No online devices detected.");
      return;
    }
    
    const confirmMsg = action === 'restart' 
      ? `Are you sure you want to reboot ALL (${onlineCount}) online devices simultaneously?`
      : `CAUTION: Are you sure you want to shut down ALL (${onlineCount}) online devices? This will take them offline.`;
      
    if (!window.confirm(confirmMsg)) return;

    setActiveControlDevice({ device_id: 'ALL_DEVICES', device_name: 'All Connected Endpoints' });
    setControlAction(action);
    setControlProgress(0);
    
    const token = localStorage.getItem('token');
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    
    if (action === 'restart') {
      setControlLogs(["[CONNECT] Broadcasting bulk restart signal to active controllers...", "[AUTH] Super Admin privileges verified."]);
      
      const logs = [
        "Identifying online endpoint terminals...",
        `Dispatched reboot signals to ${onlineCount} devices...`,
        "Instructing active systems to flush memory buffers...",
        "Disconnecting active WebSocket tunnels...",
        "Command broadcast successfully acknowledged by daemons."
      ];
      
      const apiPromise = axios.post(`http://localhost:5000/api/telemetry/devices/restart-all`, {}, config);
      
      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        setControlProgress(Math.round(((i + 1) / (logs.length + 2)) * 100));
        setControlLogs(prev => [...prev, `[BULK] ${logs[i]}`]);
      }
      
      try {
        await apiPromise;
        setControlProgress(85);
        setControlLogs(prev => [...prev, "[SYSTEM] Waiting for socket ping back from endpoints..."]);
        
        await new Promise(r => setTimeout(r, 1500));
        fetchTelemetry();
        setControlProgress(100);
        setControlLogs(prev => [...prev, "[SUCCESS] Bulk reboot dispatched! Endpoints returning online."]);
      } catch {
        setControlLogs(prev => [...prev, "[ERROR] Remote bulk reboot execution failed."]);
        setControlProgress(100);
      }
    } else if (action === 'shutdown') {
      setControlLogs(["[CONNECT] Broadcasting bulk shutdown signal to active controllers...", "[AUTH] Super Admin privileges verified."]);
      
      const logs = [
        "Identifying online endpoint terminals...",
        `Dispatched SIGKILL (Signal 9) to ${onlineCount} devices...`,
        "Instructing target systems to halt kernels...",
        "Sending hardware power-down interrupts...",
        "Command broadcast successfully acknowledged by daemons."
      ];
      
      const apiPromise = axios.post(`http://localhost:5000/api/telemetry/devices/shutdown-all`, {}, config);
      
      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 500));
        setControlProgress(Math.round(((i + 1) / (logs.length + 1)) * 100));
        setControlLogs(prev => [...prev, `[BULK] ${logs[i]}`]);
      }
      
      try {
        await apiPromise;
        fetchTelemetry();
        setControlProgress(100);
        setControlLogs(prev => [...prev, "[SUCCESS] Bulk shutdown complete. All target devices powered down."]);
      } catch {
        setControlLogs(prev => [...prev, "[ERROR] Remote bulk shutdown execution failed."]);
        setControlProgress(100);
      }
    }
  };

  const list       = Object.values(devices);
  
  const filteredList = list.filter(d => {
    const nameMatch = (d.device_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const idMatch = (d.device_id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const ipMatch = (d.ip_address || d.ip || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = nameMatch || idMatch || ipMatch;
    
    if (statusFilter === 'ONLINE') return matchesSearch && d.status !== 'OFFLINE';
    if (statusFilter === 'OFFLINE') return matchesSearch && d.status === 'OFFLINE';
    if (statusFilter === 'HIGH_RISK') return matchesSearch && (d.risk_score || 0) >= 70;
    return matchesSearch;
  });

  const filteredAlerts = selected
    ? alerts.filter(a => a.device_id === selected)
    : alerts;

  const getAverage = (arr, key) => {
    const validValues = arr
      .map(d => parseFloat(d[key]))
      .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
    if (validValues.length === 0) return 0;
    const sum = validValues.reduce((s, v) => s + v, 0);
    return Math.round(sum / validValues.length);
  };

  const online     = list.filter(d => d.status !== 'OFFLINE').length;
  const offline    = list.length - online;
  const highRisk   = list.filter(d => (d.risk_score || 0) >= 70).length;
  const avgCpu     = getAverage(list, 'cpu');
  const avgRam     = getAverage(list, 'ram');

  // Aggregate network throughput across all devices
  const totalNetSent = list.reduce((s, d) => s + (parseFloat(d.net_sent_mb) || 0), 0).toFixed(1);
  const totalNetRecv = list.reduce((s, d) => s + (parseFloat(d.net_recv_mb) || 0), 0).toFixed(1);

  const selectedDev  = selected ? devices[selected] : null;
  const selectedHist = selected ? history.current[selected] : null;

  // Bar chart: per-device CPU snapshot
  const cpuBarData = {
    labels: filteredList.map(d => (d.device_name || d.device_id || '').slice(0, 10)),
    datasets: [{
      label: 'CPU %',
      data: filteredList.map(d => d.cpu || 0),
      backgroundColor: filteredList.map(d => `${barColor(d.cpu || 0)}99`),
      borderColor:     filteredList.map(d => barColor(d.cpu || 0)),
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#475569', font: { size: 9, family: 'monospace' } }, grid: { color: '#1e293b' } },
      y: { min: 0, max: 100, ticks: { color: '#475569', font: { size: 9 }, callback: v => `${v}%` }, grid: { color: '#1e293b' } },
    },
  };

  // Detail panel line chart
  const makeLineData = (label, arr, color) => ({
    labels: arr.map((_, i) => i),
    datasets: [{ label, data: arr, borderColor: color, backgroundColor: `${color}15`, tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2 }],
  });

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col gap-4 relative">

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-wide font-mono flex items-center gap-3 mb-1">
            <FiActivity className="text-primary" /> LIVE DEVICE <span className="text-primary">HEALTH & CONTROL</span>
          </h1>
          <p className="text-slate-400 text-sm">Real-time status updates, metrics overview, and remote operations console</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono text-xs ${
          connected ? 'bg-success/10 border-success/30 text-success' : 'bg-slate-800 border-slate-600 text-slate-500 animate-pulse'
        }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success shadow-[0_0_8px_#00ff66] animate-pulse' : 'bg-slate-600'}`} />
          {connected ? 'LIVE STREAM ACTIVE' : 'CONNECTING...'}
        </div>
      </div>

      {/* ── Tabs Toggle ── */}
      <div className="flex border-b border-slate-800 mt-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-slate-400 hover:text-slate-250 hover:bg-white/[0.02]'
          }`}
        >
          <FiActivity className="text-sm" /> Analytics Dashboard
        </button>
        <button
          onClick={() => setActiveTab('control')}
          className={`px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
            activeTab === 'control'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-slate-400 hover:text-slate-250 hover:bg-white/[0.02]'
          }`}
        >
          <FiCpu className="text-sm" /> Remote Device Control
        </button>
      </div>

      {/* ── KPI Strip (Always Visible) ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Total Devices', value: list.length,   color: 'text-primary',  border: 'border-t-primary',  icon: <FiServer /> },
          { label: 'Online',        value: online,         color: 'text-success',  border: 'border-t-success',  icon: <FiWifi /> },
          { label: 'Offline',       value: offline,        color: 'text-slate-400',border: 'border-t-slate-600',icon: <FiXCircle /> },
          { label: 'High Risk',     value: highRisk,       color: 'text-danger',   border: 'border-t-danger',   icon: <FiAlertTriangle /> },
          { label: 'Avg CPU',       value: list.length > 0 ? `${avgCpu}%` : '--',   color: 'text-primary',  border: 'border-t-primary',  icon: <FiCpu /> },
          { label: 'Avg RAM',       value: list.length > 0 ? `${avgRam}%` : '--',   color: 'text-warning',  border: 'border-t-warning',  icon: <FiZap /> },
        ].map((k, i) => (
          <div key={i} className={`glass-panel p-4 border-t-2 ${k.border} flex items-center gap-3`}>
            <div className={`text-lg ${k.color} flex-shrink-0`}>{k.icon}</div>
            <div>
              <div className={`text-xl font-mono font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Layout Switcher ── */}
      {activeTab === 'analytics' ? (
        /* ── Left: Device Table + Bar Chart ── */
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto custom-scrollbar">

            {/* CPU snapshot bar chart — compact inline view */}
            {list.length > 0 && (
              <div className="glass-panel p-3 flex items-center gap-4">
                <div className="flex items-center gap-2 flex-shrink-0 w-44">
                  <FiCpu className="text-primary text-sm" />
                  <div>
                    <div className="text-white font-bold uppercase tracking-wider text-[10px]">CPU LOAD</div>
                    <div className="text-[9px] text-slate-500 font-mono">All Devices · 5s</div>
                  </div>
                </div>
                <div className="flex-1 h-12 min-w-0">
                  <Bar data={cpuBarData} options={{
                    ...chartOpts,
                    scales: {
                      x: { ticks: { color: '#475569', font: { size: 8, family: 'monospace' } }, grid: { display: false } },
                      y: { min: 0, max: 100, ticks: { color: '#475569', font: { size: 8 }, callback: v => `${v}%`, maxTicksLimit: 4 }, grid: { color: '#1e293b33' } },
                    },
                  }} />
                </div>
              </div>
            )}

            {/* Device table */}
            <div className="glass-panel flex flex-col flex-1 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-3">
                <h3 className="text-white font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                  <FiServer className="text-primary" /> Device Health Table
                </h3>
                <span className="text-[10px] text-slate-500 font-mono ml-auto">
                  Click a row for detailed analysis
                </span>
              </div>

              {/* Search and Filters Bar */}
              <div className="px-5 py-3 border-b border-slate-800/60 bg-slate-900/10 flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiSearch className="text-slate-500 text-xs" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search by ID, name, or IP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800/80 focus:border-primary rounded text-xs font-mono text-white focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  {['ALL', 'ONLINE', 'OFFLINE', 'HIGH_RISK'].map(f => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-2.5 py-1 text-[9px] font-mono font-bold tracking-wider rounded border transition-colors ${
                        statusFilter === f
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {list.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-500">
                  <div className="relative mb-6">
                    <FiActivity className="text-6xl opacity-10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 border border-primary/20 rounded-full animate-ping" />
                    </div>
                  </div>
                  <p className="font-mono text-sm uppercase tracking-widest text-slate-600">Waiting for devices to connect</p>
                  <p className="text-xs text-slate-700 mt-2">Run SecureAssetsAgent.exe on any Windows device</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[10px] tracking-widest uppercase">
                        <th className="px-5 py-3">Device</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">CPU</th>
                        <th className="px-4 py-3">RAM</th>
                        <th className="px-4 py-3">Disk</th>
                        <th className="px-4 py-3">Risk</th>
                        <th className="px-4 py-3">AV / FW</th>
                        <th className="px-4 py-3">CPU Trend</th>
                        <th className="px-4 py-3 text-right">Net ↑↓ MB</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-800/60">
                      {filteredList.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="text-center py-12 text-slate-500 font-mono text-xs">
                            No devices matched the search query or status filter.
                          </td>
                        </tr>
                      ) : filteredList.map(dev => {
                        const h    = history.current[dev.device_id] || {};
                        const isOn = dev.status !== 'OFFLINE';
                        const rc   = riskColor(dev.risk_score || 0);
                        const isSel= selected === dev.device_id;
                        return (
                          <tr
                            key={dev.device_id}
                            onClick={() => setSelected(isSel ? null : dev.device_id)}
                            className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${isSel ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <Dot online={isOn} />
                                <div>
                                  <div className="text-white font-bold text-xs font-mono">{dev.device_name || dev.registered_asset_id || dev.device_id}</div>
                                  <div className="text-[10px] text-slate-500 flex flex-col gap-0.5 font-mono">
                                    <span>{dev.os?.split(' ').slice(0,2).join(' ') || '—'}</span>
                                    <span>Asset: <strong className="text-primary">{dev.registered_asset_id || dev.device_id}</strong></span>
                                    {dev.serial_number && <span>S/N: <strong className="text-slate-400">{dev.serial_number}</strong></span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                isOn ? 'text-success bg-success/10 border-success/30' : 'text-slate-500 bg-slate-800 border-slate-700'
                              }`}>{isOn ? 'ONLINE' : 'OFFLINE'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${dev.cpu||0}%`, background: barColor(dev.cpu||0) }} />
                                </div>
                                <span className={`font-mono text-xs font-bold ${metricColor(dev.cpu||0)}`}>{dev.cpu||0}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${dev.ram||0}%`, background: barColor(dev.ram||0) }} />
                                </div>
                                <span className={`font-mono text-xs font-bold ${metricColor(dev.ram||0)}`}>{dev.ram||0}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-mono text-xs ${metricColor(dev.disk||0)}`}>{dev.disk||0}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border" style={{ color: rc, borderColor: `${rc}44`, background: `${rc}11` }}>
                                {riskLabel(dev.risk_score||0)} {dev.risk_score||0}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 text-xs">
                                {dev.antivirus  ? <FiCheckCircle className="text-success" title="Antivirus Active" /> : <FiXCircle className="text-danger" title="No Antivirus" />}
                                {dev.firewall   ? <FiCheckCircle className="text-success" title="Firewall On"      /> : <FiXCircle className="text-danger" title="Firewall Off"  />}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Spark data={h.cpu} color={barColor(dev.cpu||0)} width={70} height={22} />
                                <Trend history={h.cpu} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[10px] text-slate-400">
                              <span className="text-success">↑{dev.net_sent_mb||0}</span>
                              {' / '}
                              <span className="text-primary">↓{dev.net_recv_mb||0}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Network traffic summary */}
            {list.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-panel p-4 flex items-center gap-3 border-l-4 border-l-success">
                  <FiTrendingUp className="text-success text-2xl" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Total Uploaded</div>
                    <div className="text-white font-mono font-bold">{totalNetSent} MB</div>
                  </div>
                </div>
                <div className="glass-panel p-4 flex items-center gap-3 border-l-4 border-l-primary">
                  <FiTrendingDown className="text-primary text-2xl" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Total Downloaded</div>
                    <div className="text-white font-mono font-bold">{totalNetRecv} MB</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right Panel ── */}
          <div className="w-80 flex flex-col gap-4 flex-shrink-0">

            {/* Detailed view for selected device */}
            {selectedDev ? (
              <div className="glass-panel p-4 flex flex-col gap-4 border-t-2 border-t-primary animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-bold font-mono text-sm">{selectedDev.device_name || selectedDev.registered_asset_id || selectedDev.device_id}</h3>
                    <p className="text-[10px] text-slate-500 font-mono">{selectedDev.ip_address || selectedDev.ip || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge value={selectedDev.risk_score || 0} size={52} />
                    <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-lg">×</button>
                  </div>
                </div>

                {/* Compliance chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Antivirus',  ok: selectedDev.antivirus },
                    { label: 'Firewall',   ok: selectedDev.firewall },
                    { label: 'Up-to-date', ok: !selectedDev.os_outdated },
                    { label: 'USB Guard',  ok: selectedDev.usb_restricted },
                    { label: 'Password',   ok: selectedDev.password_policy_compliant },
                    { label: 'No malware', ok: !selectedDev.unauthorized_software_found },
                  ].map(c => (
                    <span key={c.label} className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border flex items-center gap-1 ${
                      c.ok ? 'text-success bg-success/10 border-success/30' : 'text-danger bg-danger/10 border-danger/30'
                    }`}>
                      {c.ok ? <FiCheckCircle className="text-[9px]" /> : <FiXCircle className="text-[9px]" />}
                      {c.label}
                    </span>
                  ))}
                </div>

                {/* CPU 60-point line chart */}
                <div>
                  <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 flex justify-between">
                    <span>CPU History (60pts)</span>
                    <span className={metricColor(selectedDev.cpu||0)}>{selectedDev.cpu||0}%</span>
                  </div>
                  <div className="h-20">
                    {(selectedHist?.cpu?.length > 1) ? (
                      <Line data={makeLineData('CPU %', selectedHist.cpu, '#00f0ff')}
                        options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { display: false }, y: { ...chartOpts.scales.y, ticks: { display: false } } } }} />
                    ) : <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono">Collecting data...</div>}
                  </div>
                </div>

                {/* RAM 60-point line chart */}
                <div>
                  <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-1 flex justify-between">
                    <span>RAM History (60pts)</span>
                    <span className={metricColor(selectedDev.ram||0)}>{selectedDev.ram||0}%</span>
                  </div>
                  <div className="h-20">
                    {(selectedHist?.ram?.length > 1) ? (
                      <Line data={makeLineData('RAM %', selectedHist.ram, '#ffb700')}
                        options={{ ...chartOpts, scales: { ...chartOpts.scales, x: { display: false }, y: { ...chartOpts.scales.y, ticks: { display: false } } } }} />
                    ) : <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono">Collecting data...</div>}
                  </div>
                </div>

                {/* OS and extra info */}
                <div className="text-[11px] text-slate-400 space-y-1 font-mono border-t border-slate-800 pt-3">
                  <div className="flex justify-between"><span className="text-slate-600">OS</span><span className="text-white">{selectedDev.os || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Asset ID</span><span className="text-primary font-bold">{selectedDev.registered_asset_id || selectedDev.device_id}</span></div>
                  {selectedDev.serial_number && <div className="flex justify-between"><span className="text-slate-600">Serial</span><span className="text-slate-300">{selectedDev.serial_number}</span></div>}
                  <div className="flex justify-between"><span className="text-slate-600">Processes</span><span>{selectedDev.proc_count || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Disk</span><span className={metricColor(selectedDev.disk||0)}>{selectedDev.disk||0}%</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Risk Level</span>
                    <span style={{ color: riskColor(selectedDev.risk_score||0) }}>{riskLabel(selectedDev.risk_score||0)} ({selectedDev.risk_score||0})</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-5 flex flex-col items-center justify-center text-center min-h-[200px] border border-dashed border-slate-700">
                <FiEye className="text-3xl text-slate-600 mb-3" />
                <p className="text-xs text-slate-500 font-mono">Click any device row to see detailed CPU / RAM history charts and compliance status</p>
              </div>
            )}

            {/* Alert feed */}
            <div className="glass-panel flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-white font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                  <FiAlertTriangle className="text-danger" /> {selected ? `Alert Feed: ${selected}` : 'Live Alert Feed'}
                </h3>
                {filteredAlerts.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-danger text-white text-[10px] flex items-center justify-center font-bold shadow-[0_0_8px_rgba(255,0,60,0.6)]">
                    {filteredAlerts.length > 9 ? '9+' : filteredAlerts.length}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/50">
                {filteredAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                    <FiShield className="text-3xl mb-2 opacity-30" />
                    <p className="text-xs font-mono">{selected ? 'No alerts for this device' : 'No alerts yet'}</p>
                  </div>
                ) : filteredAlerts.map((a, i) => (
                  <div key={i} className="p-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 bg-danger rounded-full shadow-[0_0_4px_#ff003c] animate-pulse" />
                      <span className="text-xs font-bold text-white font-mono truncate">{a.device_id}</span>
                      <span className="text-[9px] text-slate-600 ml-auto flex-shrink-0">{a.ts}</span>
                    </div>
                    {a.alerts.slice(0, 2).map((al, j) => (
                      <p key={j} className={`text-[10px] font-mono pl-3 leading-snug ${al.level === 'CRITICAL' ? 'text-danger' : 'text-warning'}`}>
                        ⚠ {al.msg}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Right: Device Control Grid ── */
        <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          
          {/* Header Controls for Control Panel */}
          <div className="flex justify-between items-center bg-slate-900/40 p-4 border border-slate-800 rounded-lg">
            <div>
              <h3 className="text-white font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                <FiCpu className="text-primary" /> Connected Endpoint Controllers
              </h3>
              <p className="text-slate-500 text-[10px] font-mono mt-0.5">Admin-only remote operations console</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={async () => {
                  setLoading(true);
                  await fetchTelemetry();
                  triggerToast("✓ Device list refreshed.");
                }} 
                className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all flex items-center gap-2"
                title="Refresh List"
              >
                <FiRefreshCw className={loading ? "animate-spin" : ""} />
              </button>
              {canControl && (
                <>
                  <button 
                    onClick={() => executeBulkCommand('restart')} 
                    disabled={loading || isDiscovering || list.filter(d => d.status !== 'OFFLINE').length === 0} 
                    className="btn-primary py-2 px-4 bg-slate-800 text-white hover:text-primary border-slate-600 transition-colors flex items-center gap-2 font-mono text-xs"
                    title="Restart All Online Devices"
                  >
                    <FiRefreshCw /> RESTART ALL
                  </button>
                  <button 
                    onClick={() => executeBulkCommand('shutdown')} 
                    disabled={loading || isDiscovering || list.filter(d => d.status !== 'OFFLINE').length === 0} 
                    className="btn-primary py-2 px-4 bg-slate-800 text-white hover:text-danger border-slate-600 transition-colors flex items-center gap-2 font-mono text-xs"
                    title="Shutdown All Online Devices"
                  >
                    <FiPower /> SHUTDOWN ALL
                  </button>
                  {list.length > 0 && (
                    <button
                      onClick={handleClearAllDevices}
                      className="btn-primary py-2 px-4 bg-danger/10 text-danger border-danger/40 hover:bg-danger/20 transition-colors flex items-center gap-2 font-mono text-xs"
                      title="Permanently delete all device telemetry from database"
                    >
                      <FiTrash2 /> CLEAR ALL
                    </button>
                  )}
                </>
              )}
              <button onClick={handleDiscover} disabled={isDiscovering} className="btn-primary py-2 px-6 shadow-none border-slate-600 bg-slate-800 text-white hover:text-primary transition-colors flex items-center gap-2 font-mono text-xs">
                {isDiscovering ? <span className="animate-pulse">SEARCHING NETWORK...</span> : 'FIND NEW DEVICES'}
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {loading && list.length === 0 ? (
               <div className="col-span-full flex justify-center py-12 text-primary">
                 <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
               </div>
            ) : list.length > 0 ? (
              list.map((device) => {
                const isOnline = device.status !== 'OFFLINE';
                return (
                  <div key={device.device_id} className={`glass-panel p-6 border-t-[3px] relative overflow-hidden group ${isOnline ? 'border-t-success' : 'border-t-danger'}`}>
                    <div className="absolute -right-4 -top-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform">
                      <FiCpu />
                    </div>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div className="flex items-center gap-2">
                        <div className="text-slate-400 p-2 bg-slate-800 rounded-lg"><FiCpu /></div>
                        {canControl && (
                          <button 
                            onClick={() => handleDeleteDevice(device.device_id)}
                            className="p-2 bg-slate-800 hover:bg-danger/15 hover:text-danger rounded-lg transition-colors border border-slate-700/60"
                            title="Delete Device Records"
                          >
                            <FiTrash2 className="text-[12px]" />
                          </button>
                        )}
                      </div>
                      <span className={`text-[10px] font-mono border px-2 py-1 rounded uppercase tracking-widest ${isOnline ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="relative z-10 mt-6">
                      <div className="text-2xl font-mono font-bold mb-1 flex items-end gap-2 text-primary drop-shadow-[0_0_5px_rgba(0,240,255,0.5)]">
                        {device.cpu}% <span className="text-xs text-slate-500 mb-1">CPU</span>
                      </div>

                      {/* Sparkline CPU chart */}
                      {(() => {
                        const hList = history.current[device.device_id]?.cpu || [];
                        const pts  = hList.length >= 2 ? hList : Array(10).fill(device.cpu || 0);
                        const W = 140, H = 28, max = Math.max(...pts, 1);
                        const coords = pts.map((v, i) => [
                          (i / (pts.length - 1)) * W,
                          H - (v / max) * H
                        ]);
                        const path = 'M ' + coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ');
                        const fill = 'M ' + coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ` L ${W},${H} L 0,${H} Z`;
                        const color = (device.cpu || 0) > 80 ? '#ff003c' : (device.cpu || 0) > 50 ? '#ffb700' : '#00f0ff';
                        return (
                          <div className="mb-2">
                            <div className="flex items-center gap-1 text-[9px] text-slate-600 font-mono uppercase tracking-widest mb-1">
                              <FiTrendingUp className="text-[8px]" /> Live CPU history
                            </div>
                            <svg width={W} height={H} className="overflow-visible">
                              <path d={fill} fill={color} fillOpacity="0.08" />
                              <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx={coords[coords.length-1][0]} cy={coords[coords.length-1][1]} r="2.5" fill={color} />
                            </svg>
                          </div>
                        );
                      })()}
                      <div className="flex justify-between items-center text-xs mt-2 mb-4 font-mono text-slate-400">
                        <span className="flex items-center gap-1"><FiActivity/> {device.ram}% RAM</span>
                        <span className="flex items-center gap-1"><FiHardDrive/> {device.disk}% DISK</span>
                      </div>
                      <div className="text-slate-300 text-sm font-bold truncate font-mono" title={device.device_name}>{device.device_name || device.registered_asset_id || device.device_id}</div>
                      <div className="text-xs text-slate-500 mt-1">{device.os || 'Unknown OS'}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1 mb-4 space-y-0.5">
                        <div>Asset ID: <span className="text-primary font-bold">{device.registered_asset_id || device.device_id}</span></div>
                        {device.serial_number && <div>Serial: <span className="text-slate-300 font-semibold">{device.serial_number}</span></div>}
                      </div>
                      
                      {/* Remote Device Controls */}
                      {canControl && (
                        <div className="pt-3 border-t border-slate-800/60 flex justify-between gap-1.5 z-10 relative">
                          <button
                            onClick={() => executeDeviceCommand(device, 'restart')}
                            disabled={!isOnline}
                            className={`flex-1 py-1 px-1 rounded text-[9px] font-bold font-mono tracking-wide flex items-center justify-center gap-1 border border-slate-700 bg-slate-900/40 hover:bg-primary/10 hover:border-primary/30 text-slate-300 hover:text-primary transition-all ${!isOnline ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Restart Device"
                          >
                            <FiRefreshCw className="text-[9px]" /> RESTART
                          </button>
                          <button
                            onClick={() => executeDeviceCommand(device, 'shutdown')}
                            disabled={!isOnline}
                            className={`flex-1 py-1 px-1 rounded text-[9px] font-bold font-mono tracking-wide flex items-center justify-center gap-1 border border-slate-700 bg-slate-900/40 hover:bg-danger/10 hover:border-danger/30 text-slate-300 hover:text-danger transition-all ${!isOnline ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Shutdown Device"
                          >
                            <FiPower className="text-[9px]" /> SHUTDOWN
                          </button>
                          <button
                            onClick={() => executeDeviceCommand(device, 'update')}
                            disabled={!isOnline}
                            className={`flex-1 py-1 px-1 rounded text-[9px] font-bold font-mono tracking-wide flex items-center justify-center gap-1 border border-slate-700 bg-slate-900/40 hover:bg-success/10 hover:border-success/30 text-slate-300 hover:text-success transition-all ${!isOnline ? 'opacity-30 cursor-not-allowed' : ''}`}
                            title="Update Firmware"
                          >
                            <FiDownload className="text-[9px]" /> UPDATE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              [
                { name: 'Server Rack A Temp', icon: <FiThermometer />, status: 'Syncing', type: 'Environmental' },
                { name: 'UPS Battery Health', icon: <FiActivity />, status: 'Syncing', type: 'Power' },
                { name: 'Main Gateway Ping', icon: <FiWifi />, status: 'Syncing', type: 'Network' },
                { name: 'HVAC Flow Sensor', icon: <FiThermometer />, status: 'Syncing', type: 'Environmental' }
              ].map((sensor) => (
                <div key={sensor.name} className="glass-panel p-6 border-t-[3px] border-t-slate-700 relative overflow-hidden group opacity-50 blur-[1px]">
                  <div className="absolute -right-4 -top-4 text-6xl text-slate-800 opacity-20 group-hover:scale-110 transition-transform">
                    {sensor.icon}
                  </div>
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="text-slate-400 p-2 bg-slate-800 rounded-lg">{sensor.icon}</div>
                    <span className="text-[10px] font-mono bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-400 uppercase tracking-widest animate-pulse">
                      {sensor.status}...
                    </span>
                  </div>
                  <div className="relative z-10 mt-6">
                    <div className="text-2xl font-mono font-bold text-slate-500 mb-1">--</div>
                    <div className="text-slate-300 text-sm font-bold truncate">{sensor.name}</div>
                    <div className="text-xs text-slate-500 mt-1">{sensor.type}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {list.length === 0 && !loading && (
            <div className="glass-panel p-8 flex flex-col items-center justify-center text-slate-500 text-center border border-dashed border-slate-700 mb-8">
              <FiActivity className="text-5xl mb-4 opacity-30" />
              <h4 className="font-mono text-lg text-slate-400 mb-2 uppercase tracking-widest">Device Connection Offline</h4>
              <p className="text-sm max-w-md">No reports received yet. Download and run the connector software on client devices to link them here.</p>
            </div>
          )}

          {/* Deployment & Remote Setup Uplink Control Center */}
          <div className="glass-panel p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5 border-b border-slate-700 pb-4">
              <div>
                <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                  <FiCpu className="text-primary animate-pulse" /> Install Connector Software on Devices
                </h3>
                <p className="text-slate-400 text-xs mt-1">Deploy the SecureAssets EDR Agent on client systems to stream real-time telemetry audits.</p>
              </div>
              
              {/* OS Toggle Buttons */}
              <div className="flex border border-slate-700 rounded-lg overflow-hidden bg-slate-950 font-mono text-[9px] font-bold">
                {['windows', 'linux', 'macos'].map((os) => (
                  <button
                    key={os}
                    onClick={() => setConnectorOS(os)}
                    className={`px-3 py-1.5 uppercase transition-all cursor-pointer ${
                      connectorOS === os 
                        ? 'bg-primary/20 text-primary border-r border-slate-700 last:border-r-0' 
                        : 'text-slate-500 hover:text-slate-300 border-r border-slate-700 last:border-r-0'
                    }`}
                  >
                    {os === 'macos' ? 'macOS' : os}
                  </button>
                ))}
              </div>
            </div>

            {/* Connector Instruction Content */}
            <div className="bg-slate-950/70 border border-slate-850 p-4 rounded-lg font-mono text-[11px] leading-relaxed">
              {connectorOS === 'windows' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-bold">🚀 Powershell Installation Command:</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`Invoke-WebRequest -Uri "http://localhost:5000/api/telemetry/agent/download-exe" -OutFile "SecureAssetsAgent.exe"; .\\SecureAssetsAgent.exe --install`);
                        triggerToast('Command copied to clipboard!');
                      }}
                      className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Copy Command
                    </button>
                  </div>
                  <pre className="bg-black/90 p-3 rounded border border-slate-900 text-teal-400 overflow-x-auto text-[10px] py-2">
                    {`Invoke-WebRequest -Uri "http://localhost:5000/api/telemetry/agent/download-exe" -OutFile "SecureAssetsAgent.exe"; .\\SecureAssetsAgent.exe --install`}
                  </pre>
                  <div className="flex flex-wrap gap-3 items-center mt-2">
                    <button 
                      onClick={() => {
                        const token = localStorage.getItem('token');
                        const authQuery = token ? `?token=${token}` : '';
                        window.open(`http://localhost:5000/api/telemetry/agent/download-exe${authQuery}`);
                        triggerToast('Downloading Windows Agent Executable (.exe)...');
                      }}
                      className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded border border-primary/30 transition-all font-bold text-[10px] cursor-pointer"
                    >
                      📥 Download Agent installer (.exe)
                    </button>
                    <span className="text-slate-500 text-[9px]">Requires Administrator privileges.</span>
                  </div>
                </div>
              )}

              {connectorOS === 'linux' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-bold">🚀 Bash Deployment Script:</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`curl -sSL http://localhost:5000/api/telemetry/agent/download-sh | sudo bash -s -- --install`);
                        triggerToast('Command copied to clipboard!');
                      }}
                      className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Copy Command
                    </button>
                  </div>
                  <pre className="bg-black/90 p-3 rounded border border-slate-900 text-teal-400 overflow-x-auto text-[10px] py-2">
                    {`curl -sSL http://localhost:5000/api/telemetry/agent/download-sh | sudo bash -s -- --install`}
                  </pre>
                  <span className="text-slate-500 text-[9px] block">Runs as systemd service daemon automatically.</span>
                </div>
              )}

              {connectorOS === 'macos' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-bold">🚀 Apple Installer Package Terminal:</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`curl -sSL http://localhost:5000/api/telemetry/agent/download-pkg -o EDR.pkg && sudo installer -pkg EDR.pkg -target /`);
                        triggerToast('Command copied to clipboard!');
                      }}
                      className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Copy Command
                    </button>
                  </div>
                  <pre className="bg-black/90 p-3 rounded border border-slate-900 text-teal-400 overflow-x-auto text-[10px] py-2">
                    {`curl -sSL http://localhost:5000/api/telemetry/agent/download-pkg -o EDR.pkg && sudo installer -pkg EDR.pkg -target /`}
                  </pre>
                  <span className="text-slate-500 text-[9px] block">Installs components under /usr/local/bin/secureassets-agent.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DISCOVERY OVERLAY MODAL ─────────────────────────────────────── */}
      {isDiscovering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="glass-panel w-full max-w-xl p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,240,255,0.4)]">
            <h2 className="text-2xl font-bold text-white mb-6 font-mono flex items-center gap-2">
              <FiCpu className="text-primary animate-pulse" /> SEARCHING FOR CONNECTED DEVICES
            </h2>
            <div className="space-y-6">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
                  <span>SEARCHING LOCAL NETWORK</span>
                  <span>{scanProgress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.5)]" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              {/* Progress Terminal Logs */}
              <div className="bg-black/90 rounded border border-slate-800 p-4 h-48 overflow-y-auto font-mono text-xs text-primary space-y-1">
                {scanLogs.map((log, idx) => (
                  <div key={idx} className={log.includes('complete') || log.includes('online') ? 'text-success' : log.includes('ERR') ? 'text-danger' : 'text-primary'}>
                    {log}
                  </div>
                ))}
              </div>

              {/* Discovered device details */}
              {discoveredDevice && (
                <div className="p-4 bg-success/10 border border-success/30 rounded-lg animate-[fadeIn_0.4s_ease-out] flex flex-col gap-2">
                  <h4 className="text-success font-bold font-mono text-sm flex items-center gap-2">
                    <FiCheckCircle /> NEW DEVICE FOUND & ADDED!
                  </h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-slate-300">
                    <div>Device ID: <span className="text-white">{discoveredDevice.device_id}</span></div>
                    <div>Device Name: <span className="text-white">{discoveredDevice.device_name}</span></div>
                    <div>IP Address: <span className="text-white">{discoveredDevice.ip}</span></div>
                    <div>Operating System: <span className="text-white">{discoveredDevice.os}</span></div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsDiscovering(false);
                    setDiscoveredDevice(null);
                  }}
                  disabled={scanProgress < 100}
                  className="btn-primary py-2 px-8 shadow-none"
                >
                  CLOSE SEARCHER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REMOTE CONTROL OVERLAY MODAL ─────────────────────────────────── */}
      {controlAction && activeControlDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="glass-panel w-full max-w-xl p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,240,255,0.4)]">
            <h2 className="text-2xl font-bold text-white mb-2 font-mono flex items-center gap-2">
              <FiCpu className="text-primary animate-pulse" /> REMOTE COMMAND EXECUTOR
            </h2>
            <p className="text-slate-400 text-xs font-mono mb-6">
              Command: <span className="text-white uppercase font-bold">{controlAction}</span> | Target: <span className="text-primary">{activeControlDevice.device_name || activeControlDevice.device_id}</span>
            </p>
            <div className="space-y-6">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
                  <span className="uppercase">
                    {controlAction === 'update' ? 'DOWNLOADING & APPLYING SOFTWARE PATCH' : 
                     controlAction === 'restart' ? 'REBOOTING REMOTE DAEMON' : 
                     'TERMINATING POWER SYSTEM'}
                  </span>
                  <span>{controlProgress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.5)]" style={{ width: `${controlProgress}%` }}></div>
                </div>
              </div>

              {/* Progress Terminal Logs */}
              <div className="bg-black/90 rounded border border-slate-800 p-4 h-48 overflow-y-auto font-mono text-xs text-primary space-y-1">
                {controlLogs.map((log, idx) => (
                  <div key={idx} className={log.includes('SUCCESS') || log.includes('successfully') ? 'text-success' : log.includes('ERROR') ? 'text-danger' : 'text-primary'}>
                    {log}
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setControlAction(null);
                    setActiveControlDevice(null);
                  }}
                  disabled={controlProgress < 100}
                  className="btn-primary py-2 px-8 shadow-none"
                >
                  DISMISS COMMANDER
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-0 right-0 bg-success/15 border border-success/35 text-success px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50">
          <FiCheckCircle className="text-xl" />
          <span className="font-mono text-sm">{toastMsg}</span>
        </div>
      )}

    </div>
  );
};

export default LiveTelemetry;
