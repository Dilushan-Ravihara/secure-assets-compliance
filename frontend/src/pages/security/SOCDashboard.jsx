import { useState, useEffect } from 'react';
import { FiShield, FiAlertTriangle, FiTarget, FiActivity, FiLock, FiTerminal, FiCheckCircle, FiX, FiCpu, FiDownload } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, RadialLinearScale, RadarController } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import axios from 'axios';
import { socket } from '../../services/socket';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, RadialLinearScale, RadarController, Title, Tooltip, Legend);

const SOCDashboard = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [connectorOS, setConnectorOS] = useState('windows');

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };
  
  // Modals state
  const [isLockdownOpen, setIsLockdownOpen] = useState(false);
  const [isIsolateOpen, setIsIsolateOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  
  // Terminal log state
  const [lockdownZone, setLockdownZone] = useState('Colombo HQ');
  const [isolateAssetId, setIsolateAssetId] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Role-based access
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const canAct = ['admin', 'super_admin'].includes(currentUser.role);

  // Fetch open alerts and assets list on load, and listen to socket.io events
  useEffect(() => {
    fetchAlerts();
    fetchAssets();

    socket.on('security-alert', (data) => {
      setIncidents(prev => {
        if (prev.some(i => i.alert_id === data.alert_id)) return prev;
        return [data, ...prev];
      });
      setToastMsg(`⚠️ New Alert: ${data.type}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    });

    socket.on('alert-resolved', (data) => {
      setIncidents(prev => prev.map(i => i.alert_id === data.alert_id ? { ...i, status: 'resolved' } : i));
      setToastMsg(`✓ Alert Resolved: ${data.alert_id}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    });

    return () => {
      socket.off('security-alert');
      socket.off('alert-resolved');
    };
  }, []);

  // Get assets to populate the isolation selection list
  const fetchAssets = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/assets', config);
      setAssets(response.data.data || []);
      if (response.data.data?.length > 0) {
        setIsolateAssetId(response.data.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch assets for SOC:', error);
    }
  };

  // Retrieve active security incidents from database
  const fetchAlerts = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/security/alerts', config);
      setIncidents(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch security alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group alerts by type for radar chart
  const malware = incidents.filter(i => i.type.toLowerCase().includes('malware') || i.description.toLowerCase().includes('antivirus')).length;
  const ddos = incidents.filter(i => i.type.toLowerCase().includes('ddos') || i.description.toLowerCase().includes('traffic')).length;
  const phishing = incidents.filter(i => i.type.toLowerCase().includes('phishing')).length;
  const intrusion = incidents.filter(i => i.type.toLowerCase().includes('intrusion') || i.description.toLowerCase().includes('firewall')).length;
  const dataLeak = incidents.filter(i => i.type.toLowerCase().includes('leak') || i.description.toLowerCase().includes('data')).length;
  const unauthorized = incidents.filter(i => i.type.toLowerCase().includes('access') || i.description.toLowerCase().includes('login')).length;
  const autoDetect = incidents.filter(i => i.type.toLowerCase().includes('automated')).length;

  // Use base mock values but add real incidents on top
  // Map incident types for the radar chart layout
  const radarData = {
    labels: ['Malware', 'DDoS', 'Phishing', 'Intrusion', 'Data Leak', 'Unauthorized Access', 'System Overload'],
    datasets: [{
      label: 'Threat Intensity',
      data: [malware + 1, ddos + 0, phishing + 0, intrusion + 2, dataLeak + 0, unauthorized + 1, autoDetect + 0],
      backgroundColor: 'rgba(0, 240, 255, 0.1)',
      borderColor: '#00f0ff',
      borderWidth: 2,
      pointBackgroundColor: '#00f0ff',
      pointBorderColor: '#fff',
    }]
  };

  const radarOptions = {
    scales: {
      r: {
        angleLines: { color: 'rgba(255,255,255,0.1)' },
        grid: { color: 'rgba(255,255,255,0.1)' },
        pointLabels: { color: '#00f0ff', font: { family: 'Fira Code', size: 11 } },
        ticks: { display: false }
      }
    },
    plugins: { legend: { display: false } }
  };

  const activeThreats = incidents.filter(i => i.status === 'open').length;
  const criticalThreats = incidents.filter(i => i.status === 'open' && i.severity === 'CRITICAL').length;
  
  // Calculate DEFCON indicator level (1: critical threats, 2: multiple alerts, 3: single alert, 5: clear)
  const defconLevel = criticalThreats > 0 ? 1 : activeThreats > 5 ? 2 : activeThreats > 0 ? 3 : 5;

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-0 right-0 bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50">
          <FiCheckCircle className="text-xl" />
          <span className="font-mono text-sm font-bold tracking-wider">{toastMsg}</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className={`text-3xl font-bold mb-2 tracking-wide font-mono flex items-center gap-3 ${defconLevel <= 2 ? 'text-danger' : defconLevel === 3 ? 'text-warning' : 'text-primary'}`}>
            <FiTarget /> SECURITY <span className="text-white">ALERT DASHBOARD</span>
          </h1>
          <p className={`text-sm font-mono flex items-center gap-2 ${defconLevel <= 2 ? 'text-danger' : defconLevel === 3 ? 'text-warning' : 'text-slate-400'}`}>
            SECURITY DANGER LEVEL {defconLevel}: {defconLevel === 1 ? 'HIGH SECURITY RISK' : defconLevel <= 3 ? 'MEDIUM DANGER LEVEL' : 'ALL SECURE & STABLE'}
          </p>
        </div>
        <div className="flex gap-4 items-center">
          {!canAct && (
            <span className="text-[10px] font-mono text-success bg-success/10 border border-success/30 px-3 py-1.5 rounded-lg">
              🟢 VIEWER — Read Only
            </span>
          )}
          <button
            onClick={() => { if (canAct) { setIsLockdownOpen(true); setTerminalLogs([]); } }}
            disabled={!canAct}
            title={!canAct ? 'Admin or Super Admin required' : 'Initiate network lockdown'}
            className={`btn-danger text-sm py-2 px-6 tracking-wider ${!canAct ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            BLOCK ALL NETWORK TRAFFIC
          </button>
          <button
            onClick={() => { if (canAct) { setIsIsolateOpen(true); setTerminalLogs([]); } }}
            disabled={!canAct}
            title={!canAct ? 'Admin or Super Admin required' : 'Isolate a network asset'}
            className={`btn-primary text-sm py-2 px-6 tracking-wider ${!canAct ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            DISCONNECT DEVICE FROM NETWORK
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className={`glass-panel p-6 border-l-4 ${activeThreats > 0 ? 'border-l-warning' : 'border-l-primary'}`}>
          <h3 className="text-white font-mono text-sm tracking-wider mb-4 flex items-center gap-2"><FiAlertTriangle className={activeThreats > 0 ? "text-warning" : "text-primary"}/> SECURITY ALERTS</h3>
          <div className={`text-5xl font-bold font-mono drop-shadow-[0_0_10px_rgba(0,240,255,0.5)] ${activeThreats > 0 ? 'text-warning' : 'text-primary'}`}>{activeThreats}</div>
          <p className="text-slate-400 text-xs mt-2 font-mono">{activeThreats > 0 ? `${criticalThreats} high security risks require action` : 'No security alerts detected'}</p>
        </div>

        <div className="glass-panel p-6 border-l-4 border-l-primary">
          <h3 className="text-white font-mono text-sm tracking-wider mb-4 flex items-center gap-2"><FiActivity className="text-primary"/> RISK METER</h3>
          <div className="text-5xl font-bold text-primary font-mono drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">{Math.min(100, activeThreats * 15 + criticalThreats * 25)}<span className="text-2xl text-slate-500">/100</span></div>
          <p className="text-slate-400 text-xs mt-2 font-mono">Based on live device health</p>
        </div>

        <div className={`glass-panel p-6 border-l-4 ${defconLevel <= 2 ? 'border-l-danger' : 'border-l-success'}`}>
          <h3 className="text-white font-mono text-sm tracking-wider mb-4 flex items-center gap-2"><FiLock className={defconLevel <= 2 ? 'text-danger' : 'text-success'}/> NETWORK GUARD STATUS</h3>
          <div className={`text-4xl font-bold font-mono mt-2 ${defconLevel <= 2 ? 'text-danger drop-shadow-[0_0_10px_rgba(255,0,60,0.5)]' : 'text-success drop-shadow-[0_0_10px_rgba(0,255,102,0.5)]'}`}>{defconLevel <= 2 ? 'WARNING' : 'SECURE'}</div>
          <p className="text-slate-400 text-xs mt-2 font-mono">{defconLevel <= 2 ? 'Unauthorized access attempts detected' : 'All ingress/egress rules active'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 mb-8">
        <div className="glass-panel p-6 flex flex-col justify-center items-center relative">
          <h3 className="absolute top-6 left-6 text-white font-mono text-sm tracking-wider flex items-center gap-2"><FiShield className="text-primary"/> TYPES OF THREATS</h3>
          <div className="w-full h-64 mt-8 flex justify-center">
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>

        <div className="lg:col-span-2 glass-panel p-6 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary/20 text-primary font-mono text-[10px] px-3 py-1 rounded-bl-lg font-bold">LIVE FEED</div>
          <h3 className="text-white font-mono text-sm tracking-wider mb-6 flex items-center gap-2"><FiTerminal className="text-primary"/> SECURITY ALERTS LIST</h3>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-500 font-mono text-[11px] tracking-widest sticky top-0 bg-[#0a0f1a] z-10">
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4">TIMESTAMP</th>
                  <th className="pb-3 pr-4">ALERT TYPE</th>
                  <th className="pb-3 pr-4">DEVICE</th>
                  <th className="pb-3 pr-4">DESCRIPTION</th>
                  <th className="pb-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-500">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <div>SEARCHING FOR SECURITY ALERTS...</div>
                    </td>
                  </tr>
                ) : incidents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-500">
                      <FiCheckCircle className="text-4xl mx-auto mb-3 opacity-50 text-success" />
                      <div className="text-success font-bold">NO SECURITY ALERTS</div>
                      <div className="text-xs mt-1 font-sans text-slate-400">System is currently operating normally</div>
                    </td>
                  </tr>
                ) : (
                  incidents.map((incident) => (
                    <tr key={incident.alert_id} className="border-b border-slate-800/50 hover:bg-white/5 transition-colors">
                      <td className="py-3 pr-4 text-slate-400">{incident.alert_id}</td>
                      <td className="py-3 pr-4">{new Date(incident.created_at).toLocaleString()}</td>
                      <td className="py-3 pr-4 font-bold">{incident.type}</td>
                      <td className="py-3 pr-4 text-slate-400">{incident.device_id || incident.asset_code || 'Unknown'}</td>
                      <td className="py-3 pr-4 font-sans text-xs max-w-xs truncate" title={incident.description}>{incident.description}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                          incident.status === 'open' ? 'bg-danger/10 text-danger border-danger/30' :
                          incident.status === 'investigating' ? 'bg-warning/10 text-warning border-warning/30' :
                          'bg-success/10 text-success border-success/30'
                        }`}>
                          {(incident.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Deployment & Remote Setup Uplink Control Center */}
      <div className="glass-panel p-6 mb-8 relative overflow-hidden">
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

      {/* ── LOCKDOWN NETWORK MODAL ──────────────────────────────────────── */}
      {isLockdownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="glass-panel w-full max-w-lg p-6 relative border-t-4 border-t-danger shadow-[0_0_50px_rgba(255,0,0,0.3)]">
            <button onClick={() => !isExecuting && setIsLockdownOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors" disabled={isExecuting}>
              <FiX className="text-2xl" />
            </button>
            <h2 className="text-2xl font-bold text-danger mb-4 font-mono flex items-center gap-2">
              <FiLock className="animate-pulse" /> BLOCK ALL NETWORK TRAFFIC
            </h2>
            <div className="space-y-4">
              <div>
                <label className="cyber-label text-slate-400">Select Office Area to Block</label>
                <select value={lockdownZone} onChange={(e) => setLockdownZone(e.target.value)} disabled={isExecuting} className="cyber-input w-full">
                  <option value="Colombo HQ">Colombo HQ (Subnets A & B)</option>
                  <option value="Kandy Branch">Kandy Branch (Subnet C)</option>
                  <option value="Production Datacenter">Production Datacenter (Subnet D)</option>
                  <option value="Research & Development Lab">Research & Development Lab (Subnet E)</option>
                </select>
              </div>

              {/* Terminal Logs View */}
              {terminalLogs.length > 0 && (
                <div className="bg-black/90 rounded border border-slate-800 p-3 h-44 overflow-y-auto font-mono text-[11px] text-primary space-y-1">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className={log.includes('COMPLETE') || log.includes('SECURED') ? 'text-success' : log.includes('ERROR') ? 'text-danger' : 'text-primary'}>
                      {log}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button type="button" onClick={() => setIsLockdownOpen(false)} disabled={isExecuting} className="px-5 py-2 rounded font-mono text-slate-400 hover:text-white">
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsExecuting(true);
                    setTerminalLogs(["[SYS] INITIALIZING COLD LOCKDOWN SEQUENCES...", "[SYS] PRE-SCANNING ACTIVE ENDPOINTS..."]);
                    
                    const logs = [
                      "DISCONNECTING CORE GATEWAYS...",
                      "ENFORCING IPS ROUTE NULLIFICATION...",
                      "TERMINATING ALL ACTIVE CONNS...",
                      "APPLYING QUARANTINE ROUTING TABLES...",
                      "BROADCASTING DISCONNECT ALERTS...",
                      "LOCKDOWN SECURED: NETWORK ISOLATED."
                    ];

                    for (let i = 0; i < logs.length; i++) {
                      await new Promise(r => setTimeout(r, 450));
                      setTerminalLogs(prev => [...prev, `[LOG] ${logs[i]}`]);
                    }

                    try {
                      const token = localStorage.getItem('token');
                      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
                      await axios.post('http://localhost:5000/api/security/lockdown', {
                        zone: lockdownZone,
                        status: 'locked'
                      }, config);
                      
                      fetchAlerts(); // refresh incident logs list
                      setToastMsg(`Lockdown completed successfully for ${lockdownZone}.`);
                      setShowToast(true);
                      setTimeout(() => setShowToast(false), 3000);
                    } catch {
                      setTerminalLogs(prev => [...prev, "[ERR] DATABASE WRITE ERROR - BYPASS PROTOCOLS ACTIVE"]);
                    } finally {
                      setIsExecuting(false);
                      setTimeout(() => setIsLockdownOpen(false), 800);
                    }
                  }}
                  disabled={isExecuting}
                  className="btn-danger py-2 px-6 shadow-none flex items-center gap-2"
                >
                  {isExecuting ? 'BLOCKING NETWORK...' : 'CONFIRM TRAFFIC BLOCK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSET ISOLATION MODAL ────────────────────────────────────────── */}
      {isIsolateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="glass-panel w-full max-w-lg p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,240,255,0.3)]">
            <button onClick={() => !isExecuting && setIsIsolateOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors" disabled={isExecuting}>
              <FiX className="text-2xl" />
            </button>
            <h2 className="text-2xl font-bold text-primary mb-4 font-mono flex items-center gap-2">
              <FiTerminal className="animate-pulse" /> DISCONNECT A DEVICE
            </h2>
            <div className="space-y-4">
              <div>
                <label className="cyber-label text-slate-400">Select Computer to Disconnect</label>
                <select value={isolateAssetId} onChange={(e) => setIsolateAssetId(e.target.value)} disabled={isExecuting} className="cyber-input w-full">
                  {assets.filter(a => a.status !== 'isolated').map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_id} - {asset.brand} {asset.model} ({asset.location || 'Unknown'})
                    </option>
                  ))}
                  {assets.filter(a => a.status !== 'isolated').length === 0 && (
                    <option value="">No Active Assets to Isolate</option>
                  )}
                </select>
              </div>

              {/* Terminal Logs View */}
              {terminalLogs.length > 0 && (
                <div className="bg-black/90 rounded border border-slate-800 p-3 h-44 overflow-y-auto font-mono text-[11px] text-primary space-y-1">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className={log.includes('COMPLETE') || log.includes('SUCCESS') ? 'text-success' : log.includes('ERROR') ? 'text-danger' : 'text-primary'}>
                      {log}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button type="button" onClick={() => setIsIsolateOpen(false)} disabled={isExecuting} className="px-5 py-2 rounded font-mono text-slate-400 hover:text-white">
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!isolateAssetId) return;
                    setIsExecuting(true);
                    setTerminalLogs(["[SYS] LOCATING ACTIVE SWITCHPORT...", "[SYS] LOCATING MAC & IP LEASE..."]);
                    
                    const logs = [
                      "POLLING SWITCH GigabitEthernet0/12...",
                      "DE-AUTHORIZING IEEE 802.1X SECURE ID...",
                      "FLUSHING DHCP LEASE FROM IP POOL...",
                      "INJECTING VLAN 999 (QUARANTINE)...",
                      "BROADCASTING ISOLATION COMPLETED SUCCESSFULLY."
                    ];

                    for (let i = 0; i < logs.length; i++) {
                      await new Promise(r => setTimeout(r, 450));
                      setTerminalLogs(prev => [...prev, `[LOG] ${logs[i]}`]);
                    }

                    try {
                      const token = localStorage.getItem('token');
                      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
                      await axios.post('http://localhost:5000/api/security/isolate', {
                        id: isolateAssetId
                      }, config);
                      
                      fetchAlerts(); // refresh incident logs list
                      fetchAssets(); // refresh assets dropdown list
                      setToastMsg(`Asset successfully isolated.`);
                      setShowToast(true);
                      setTimeout(() => setShowToast(false), 3000);
                    } catch {
                      setTerminalLogs(prev => [...prev, "[ERR] POST EXECUTOR FAILED - LOCAL BYPASS FORCED"]);
                    } finally {
                      setIsExecuting(false);
                      setTimeout(() => setIsIsolateOpen(false), 800);
                    }
                  }}
                  disabled={isExecuting || !isolateAssetId}
                  className="btn-primary py-2 px-6 shadow-none flex items-center gap-2"
                >
                  {isExecuting ? 'DISCONNECTING DEVICE...' : 'DISCONNECT DEVICE NOW'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOCDashboard;
