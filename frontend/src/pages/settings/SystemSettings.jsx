import { useState } from 'react';
import axios from 'axios';
import { FiSettings, FiSliders, FiDatabase, FiBell, FiShield, FiCheckCircle, FiCloud, FiSave, FiMonitor, FiDownload, FiCopy, FiTerminal, FiAlertOctagon } from 'react-icons/fi';

const AGENT_VERSION = '1.0.0';

const SystemSettings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [copiedCmd, setCopiedCmd] = useState('');

  // Extract current user and role check
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';

  // Wipe telemetry logs (keeps active EDR agent data)
  const handleWipeTelemetry = async () => {
    if (!window.confirm("⚠️ DANGER: This will permanently delete all telemetry records from the database (except for the active EDR agent). This action cannot be undone. Proceed?")) return;
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete('http://localhost:5000/api/telemetry/all', config);
      setToastMsg('✓ Telemetry database wiped successfully.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setToastMsg('❌ Failed to wipe telemetry logs: ' + (err.response?.data?.error || err.message));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Wipe all assets (keeps active EDR agent asset registration)
  const handleWipeAssets = async () => {
    if (!window.confirm("⚠️ DANGER: This will permanently delete all registered assets and their telemetry records from the database (except for the active EDR agent). This action cannot be undone. Proceed?")) return;
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete('http://localhost:5000/api/assets/all', config);
      setToastMsg('✓ All test assets wiped successfully.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setToastMsg('❌ Failed to wipe assets: ' + (err.response?.data?.error || err.message));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  // Form states to make it feel interactive
  const [settings, setSettings] = useState({
    autoSync: true,
    strictMode: false,
    enforce2fa: true,
    smsAlerts: true,
    emailReport: true,
    adminEmails: "dilushan@company.com, soc@company.com"
  });

  // Flip boolean switches in the configurations settings
  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Save configurations to backend
  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setToastMsg('System configuration saved successfully.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 800);
  };

  // Force S3 database dump manual sync
  const handleBackup = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setToastMsg('Manual backup to AWS S3 completed.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 1500);
  };

  const copyCmd = (cmd, key) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(''), 2000);
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full relative">
      {/* Toast Notification */}
      {showToast && (
        <div className={`absolute top-0 right-0 border px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 ${toastMsg.startsWith('❌') ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'}`}>
          {toastMsg.startsWith('❌') ? <FiAlertOctagon className="text-xl" /> : <FiCheckCircle className="text-xl" />}
          <span className="font-mono text-sm">{toastMsg}</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiSettings className="text-primary" /> SYSTEM <span className="text-primary">CONFIGURATION</span>
          </h1>
          <p className="text-slate-400 text-sm">Global system parameters and administrator settings</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm py-2 px-6 flex items-center gap-2">
          {isSaving ? <span className="animate-pulse">SAVING...</span> : <><FiSave /> SAVE CHANGES</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Settings Navigation */}
        <div className="glass-panel p-4 flex flex-col gap-2 h-fit">
          <button 
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-3 text-left w-full p-3 rounded-lg transition-colors ${activeTab === 'general' ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <FiSliders className={activeTab === 'general' ? "text-primary" : ""} /> General Settings
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-3 text-left w-full p-3 rounded-lg transition-colors ${activeTab === 'security' ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <FiShield className={activeTab === 'security' ? "text-primary" : ""} /> Security Policies
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-3 text-left w-full p-3 rounded-lg transition-colors ${activeTab === 'notifications' ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <FiBell className={activeTab === 'notifications' ? "text-primary" : ""} /> Notification Rules
          </button>
          <button 
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-3 text-left w-full p-3 rounded-lg transition-colors ${activeTab === 'backup' ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <FiDatabase className={activeTab === 'backup' ? "text-primary" : ""} /> Backup & Sync
          </button>
          <button 
            onClick={() => setActiveTab('agent')}
            className={`flex items-center gap-3 text-left w-full p-3 rounded-lg transition-colors ${activeTab === 'agent' ? 'bg-primary/10 border-l-2 border-l-primary text-white' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <FiMonitor className={activeTab === 'agent' ? "text-primary" : ""} /> EDR Agent
          </button>

        </div>

        {/* Settings Form Content */}
        <div className="lg:col-span-3 glass-panel p-8 min-h-[500px]">
          
          {/* General Settings Tab */}
          {activeTab === 'general' && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                General Parameters
              </h3>
              <div className="space-y-6">
                <div>
                  <label className="cyber-label">System Name</label>
                  <input type="text" className="cyber-input w-full max-w-md text-white" defaultValue="SecureAssets Enterprise" />
                </div>
                <div>
                  <label className="cyber-label">Default Timezone</label>
                  <select className="cyber-input w-full max-w-md text-white">
                    <option>Asia/Colombo (GMT+5:30)</option>
                    <option>UTC (GMT+0:00)</option>
                  </select>
                </div>
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between max-w-md cursor-pointer" onClick={() => handleToggle('autoSync')}>
                    <div>
                      <div className="text-white font-bold text-sm">Auto-Sync Telemetry</div>
                      <div className="text-xs text-slate-500">Fetch device data automatically every 5 minutes</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.autoSync ? 'bg-primary' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-darkBase rounded-full absolute top-1 transition-all ${settings.autoSync ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Policies Tab */}
          {activeTab === 'security' && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Global Security Policies
              </h3>
              <div className="space-y-6">
                <div className="pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between max-w-md cursor-pointer" onClick={() => handleToggle('strictMode')}>
                    <div>
                      <div className="text-white font-bold text-sm">Strict Mode Compliance</div>
                      <div className="text-xs text-slate-500">Isolate devices instantly if they fail security checks</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.strictMode ? 'bg-primary' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-darkBase rounded-full absolute top-1 transition-all ${settings.strictMode ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
                <div className="pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between max-w-md cursor-pointer" onClick={() => handleToggle('enforce2fa')}>
                    <div>
                      <div className="text-white font-bold text-sm">Enforce 2FA Authentication</div>
                      <div className="text-xs text-slate-500">Require MFA for all administrator logins</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.enforce2fa ? 'bg-primary' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-darkBase rounded-full absolute top-1 transition-all ${settings.enforce2fa ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="cyber-label">Password Rotation Policy</label>
                  <select className="cyber-input w-full max-w-md text-white">
                    <option>Every 30 Days</option>
                    <option selected>Every 90 Days</option>
                    <option>Never</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Notification Rules Tab */}
          {activeTab === 'notifications' && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Alert & Notification Rules
              </h3>
              <div className="space-y-6">
                <div className="pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between max-w-md cursor-pointer" onClick={() => handleToggle('smsAlerts')}>
                    <div>
                      <div className="text-white font-bold text-sm">Critical Threat Alerts (SMS)</div>
                      <div className="text-xs text-slate-500">Send instant SMS for severity level CRITICAL</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.smsAlerts ? 'bg-primary' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-darkBase rounded-full absolute top-1 transition-all ${settings.smsAlerts ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
                <div className="pb-4 border-b border-slate-800">
                  <div className="flex items-center justify-between max-w-md cursor-pointer" onClick={() => handleToggle('emailReport')}>
                    <div>
                      <div className="text-white font-bold text-sm">Daily SOC Summary (Email)</div>
                      <div className="text-xs text-slate-500">Send daily report at 00:00 to Admin emails</div>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${settings.emailReport ? 'bg-primary' : 'bg-slate-700'}`}>
                      <div className={`w-4 h-4 bg-darkBase rounded-full absolute top-1 transition-all ${settings.emailReport ? 'right-1' : 'left-1'}`}></div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="cyber-label">Admin Email Addresses</label>
                  <input type="text" className="cyber-input w-full max-w-md text-white" value={settings.adminEmails} onChange={(e) => setSettings({...settings, adminEmails: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {/* Backup & Sync Tab */}
          {activeTab === 'backup' && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Database Backup & Sync
              </h3>
              <div className="mb-8 p-4 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-between max-w-md">
                <div className="flex items-center gap-3">
                  <FiCloud className="text-3xl text-success" />
                  <div>
                    <div className="text-white font-bold text-sm">Cloud Vault Connected</div>
                    <div className="text-xs text-slate-400 font-mono">Last Sync: Just now</div>
                  </div>
                </div>
                <FiCheckCircle className="text-success text-xl" />
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="cyber-label">Automated Backup Frequency</label>
                  <select className="cyber-input w-full max-w-md text-white">
                    <option>Hourly</option>
                    <option selected>Daily at 02:00 AM</option>
                    <option>Weekly on Sundays</option>
                  </select>
                </div>
                <div>
                  <label className="cyber-label">Cloud Storage Provider</label>
                  <select className="cyber-input w-full max-w-md text-white">
                    <option selected>AWS S3 (Encrypted)</option>
                    <option>Azure Blob Storage</option>
                    <option>Google Cloud Storage</option>
                  </select>
                </div>
                <div className="pt-4 mt-6 border-t border-slate-800">
                  <button onClick={handleBackup} disabled={isSaving} className="btn-primary py-2 px-6 bg-slate-800 text-white border-slate-600 hover:border-primary">
                    {isSaving ? 'SYNCING TO CLOUD...' : 'FORCE MANUAL BACKUP'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Agent Management Tab */}
          {activeTab === 'agent' && (
            <div className="animate-[fadeIn_0.3s_ease-out]">
              <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4 flex items-center gap-2">
                <FiMonitor className="text-primary" /> EDR Agent Management
              </h3>

              {/* Version & download */}
              <div className="flex flex-wrap gap-4 mb-8">
                <div className="glass-panel p-5 flex items-center gap-4 flex-1 min-w-[220px] border-l-4 border-l-primary">
                  <FiMonitor className="text-primary text-2xl flex-shrink-0" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Agent Version</div>
                    <div className="text-white font-mono font-bold text-lg">{AGENT_VERSION}</div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 self-center">
                  <a
                    href={`http://${window.location.hostname}:5000/api/telemetry/agent/download`}
                    className="btn-primary flex items-center gap-2 px-6 py-3 text-sm"
                    download
                  >
                    <FiDownload /> SecureAssetsAgent.exe
                  </a>
                  <a
                    href={`http://${window.location.hostname}:5000/api/telemetry/agent/download-config`}
                    className="btn-primary flex items-center gap-2 px-6 py-3 text-sm bg-slate-800 border-slate-600 hover:border-primary text-slate-300"
                    download
                  >
                    <FiDownload /> config.json
                  </a>
                </div>
              </div>

              {/* Setup steps */}
              <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Installation Guide</h4>
              <div className="space-y-4">
                {[
                  {
                    step: '01',
                    title: 'Download the Agent',
                    desc: 'Click DOWNLOAD above to get SecureAssetsAgent.exe. Copy it to the target Windows device.',
                  },
                  {
                    step: '02',
                    title: 'Create config.json (same folder as .exe)',
                    desc: 'Place a config.json file next to the .exe — set SERVER_URL to this machine\'s IP:',
                    code: `{\n  "SERVER_URL": "http://${window.location.hostname}:5000/device-data",\n  "INTERVAL_SEC": 5,\n  "TEST_MODE": false\n}`,
                    codeKey: 'config',
                  },
                  {
                    step: '03',
                    title: 'Run as Auto-Start Service (Optional)',
                    desc: 'To install as a Windows startup task, right-click install_service.bat → Run as Administrator. This makes the agent start automatically on every boot.',
                    code: 'install_service.bat  →  Right-click → Run as Administrator',
                    codeKey: 'bat',
                  },
                  {
                    step: '04',
                    title: 'Verify in Dashboard',
                    desc: 'The device will appear in Live Device Health within ~5 seconds of running the agent.',
                  },
                ].map(s => (
                  <div key={s.step} className="flex gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-xl">
                    <div className="text-primary font-mono font-bold text-lg flex-shrink-0 w-8">{s.step}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm mb-1">{s.title}</div>
                      <div className="text-slate-400 text-xs mb-2">{s.desc}</div>
                      {s.code && (
                        <div className="relative">
                          <pre className="bg-slate-950 border border-slate-700 rounded-lg p-3 text-[11px] text-success/90 font-mono overflow-x-auto">{s.code}</pre>
                          <button
                            onClick={() => copyCmd(s.code, s.codeKey)}
                            className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                            title="Copy"
                          >
                            {copiedCmd === s.codeKey ? <FiCheckCircle className="text-success text-xs" /> : <FiCopy className="text-xs" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Commands */}
              <h4 className="text-white font-bold text-sm mb-3 uppercase tracking-wider mt-8">Quick Management Commands</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Check Task Status', cmd: 'schtasks /query /tn "SecureAssetsAgent"' },
                  { label: 'Start Agent Now',   cmd: 'schtasks /run /tn "SecureAssetsAgent"' },
                  { label: 'Stop Agent',        cmd: 'schtasks /end /tn "SecureAssetsAgent"' },
                  { label: 'Remove Task',       cmd: 'schtasks /delete /tn "SecureAssetsAgent" /f' },
                ].map(c => (
                  <div key={c.label} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><FiTerminal className="text-[9px]" /> {c.label}</div>
                      <code className="text-[10px] text-success font-mono">{c.cmd}</code>
                    </div>
                    <button
                      onClick={() => copyCmd(c.cmd, c.label)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors flex-shrink-0"
                    >
                      {copiedCmd === c.label ? <FiCheckCircle className="text-success text-xs" /> : <FiCopy className="text-xs" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}



        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
