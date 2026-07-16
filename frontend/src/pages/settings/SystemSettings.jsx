import { useState, useEffect } from 'react';
import axios from 'axios';
import { FiSettings, FiSliders, FiDatabase, FiBell, FiShield, FiCheckCircle, FiCloud, FiSave, FiMonitor, FiDownload, FiCopy, FiTerminal, FiAlertOctagon, FiKey, FiLock } from 'react-icons/fi';

const AGENT_VERSION = '1.0.0';

const SystemSettings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [copiedCmd, setCopiedCmd] = useState('');

  // 2FA Setup States
  const [show2FA, setShow2FA] = useState(false);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [twoFactorSecret, setTwoFactorSecret] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [is2FAEnabledForUser, setIs2FAEnabledForUser] = useState(false);

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

  // Form states to make it feel interactive & persistent
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('system_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error loading system settings:", e);
      }
    }
    return {
      systemName: "SecureAssets Enterprise",
      timezone: "Asia/Colombo (GMT+5:30)",
      autoSync: true,
      strictMode: false,
      enforce2fa: true,
      passwordPolicy: "Every 90 Days",
      smsAlerts: true,
      emailReport: true,
      adminEmails: "dilushan@company.com, soc@company.com",
      backupFrequency: "Daily at 02:00 AM",
      cloudProvider: "AWS S3 (Encrypted)",
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      smtpFrom: "alerts@secureassets.local"
    };
  });

  // Fetch settings from backend on mount
  useState(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        const res = await axios.get('http://localhost:5000/api/settings', config);
        if (res.data.success && Object.keys(res.data.data).length > 0) {
          setSettings(res.data.data);
          localStorage.setItem('system_settings', JSON.stringify(res.data.data));
        }
      } catch (err) {
        console.error('Failed to load backend settings', err);
      }
    };
    fetchSettings();
    
    // Check if user has 2FA enabled
    const fetchUserMe = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const res = await axios.get('http://localhost:5000/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
          // Note: The backend doesn't return is_2fa_enabled in /me yet, but we can assume they can set it up if it's not checked
        }
      } catch (err) {}
    };
    fetchUserMe();
  }, []);

  // Flip boolean switches in the configurations settings
  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Save configurations to local storage & backend
  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('system_settings', JSON.stringify(settings));
      
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.post('http://localhost:5000/api/settings', settings, config);
      
      setToastMsg('System configuration saved successfully.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setToastMsg('Failed to save settings to server.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate2FA = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/auth/2fa/generate', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQrCodeData(res.data.qrCodeUrl);
      setTwoFactorSecret(res.data.secret);
      setShow2FA(true);
    } catch (err) {
      setToastMsg('❌ Failed to generate 2FA token.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    }
  };

  const handleEnable2FA = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/auth/2fa/enable', {
        secret: twoFactorSecret,
        token: verifyCode
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setToastMsg('✓ Two-Factor Authentication enabled successfully.');
      setShowToast(true);
      setShow2FA(false);
      setIs2FAEnabledForUser(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      setToastMsg('❌ Invalid authentication code.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    }
  };

  // Force programmatically generated database backup download
  const handleBackup = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const res = await axios.post('http://localhost:5000/api/settings/backup', {}, config);
      
      if (res.data && res.data.downloadUrl) {
        // Trigger file download in browser
        const link = document.createElement('a');
        link.href = res.data.downloadUrl;
        link.setAttribute('download', res.data.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Update last backup timestamp
        setSettings(prev => {
          const next = { ...prev, lastBackupTime: new Date().toLocaleTimeString() };
          localStorage.setItem('system_settings', JSON.stringify(next));
          return next;
        });
        
        setToastMsg(`✓ Database backup completed successfully.`);
      } else {
        setToastMsg('❌ Backup response did not return a valid download link.');
      }
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setToastMsg('❌ Failed to trigger database backup: ' + (err.response?.data?.error || err.message));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } finally {
      setIsSaving(false);
    }
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
                  <input 
                    type="text" 
                    className="cyber-input w-full max-w-md text-white" 
                    value={settings.systemName} 
                    onChange={(e) => setSettings({ ...settings, systemName: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="cyber-label">Default Timezone</label>
                  <select 
                    className="cyber-input w-full max-w-md text-white"
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  >
                    <option value="Asia/Colombo (GMT+5:30)">Asia/Colombo (GMT+5:30)</option>
                    <option value="UTC (GMT+0:00)">UTC (GMT+0:00)</option>
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
                  <select 
                    className="cyber-input w-full max-w-md text-white"
                    value={settings.passwordPolicy}
                    onChange={(e) => setSettings({ ...settings, passwordPolicy: e.target.value })}
                  >
                    <option value="Every 30 Days">Every 30 Days</option>
                    <option value="Every 90 Days">Every 90 Days</option>
                    <option value="Never">Never</option>
                  </select>
                </div>
                
                <h4 className="text-white font-bold mt-8 mb-4 uppercase tracking-wider text-xs border-b border-slate-700/50 pb-2">
                  My Security Settings
                </h4>
                <div className="bg-slate-800/50 border border-slate-700 p-5 rounded-lg max-w-md">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded ${is2FAEnabledForUser ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                      <FiLock className="text-xl" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-sm">Two-Factor Authentication</h4>
                      <p className="text-xs text-slate-400">Add an extra layer of security to your account</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleGenerate2FA} 
                    className="btn-primary w-full mt-2 py-2 text-sm flex items-center justify-center gap-2"
                  >
                    <FiKey /> SET UP 2FA APP
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2FA Setup Modal Overlay */}
          {show2FA && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
              <div className="w-full max-w-md bg-darkCard border border-primary/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,240,255,0.15)] relative">
                <h3 className="text-xl font-bold text-white mb-4 text-center font-mono">Configure Authenticator App</h3>
                <p className="text-slate-400 text-sm text-center mb-6">Scan this QR code with Google Authenticator, Authy, or Microsoft Authenticator.</p>
                
                {qrCodeData && (
                  <div className="flex justify-center mb-6 p-4 bg-white rounded-xl mx-auto w-fit">
                    <img src={qrCodeData} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                )}
                
                <div className="mb-6">
                  <label className="cyber-label text-center block">Enter 6-digit code to verify</label>
                  <input 
                    type="text" 
                    className="cyber-input w-full text-center tracking-[0.5em] text-lg font-mono" 
                    placeholder="000000"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                  />
                </div>
                
                <div className="flex gap-3">
                  <button onClick={() => setShow2FA(false)} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                    CANCEL
                  </button>
                  <button onClick={handleEnable2FA} disabled={verifyCode.length !== 6} className="flex-1 btn-primary py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    VERIFY & ENABLE
                  </button>
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
                  <label className="cyber-label">Admin Email Addresses (Comma separated)</label>
                  <input type="text" className="cyber-input w-full max-w-md text-white" value={settings.adminEmails} onChange={(e) => setSettings({...settings, adminEmails: e.target.value})} placeholder="admin@company.com" />
                </div>
                
                <h4 className="text-white font-bold mt-8 mb-4 uppercase tracking-wider text-xs border-b border-slate-700/50 pb-2">
                  SMTP Mail Server Configuration
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <div>
                    <label className="cyber-label">SMTP Host</label>
                    <input type="text" className="cyber-input w-full text-white" value={settings.smtpHost || ''} onChange={(e) => setSettings({...settings, smtpHost: e.target.value})} placeholder="smtp.gmail.com" />
                  </div>
                  <div>
                    <label className="cyber-label">SMTP Port</label>
                    <input type="number" className="cyber-input w-full text-white" value={settings.smtpPort || ''} onChange={(e) => setSettings({...settings, smtpPort: e.target.value})} placeholder="587" />
                  </div>
                  <div>
                    <label className="cyber-label">SMTP Username</label>
                    <input type="text" className="cyber-input w-full text-white" value={settings.smtpUser || ''} onChange={(e) => setSettings({...settings, smtpUser: e.target.value})} placeholder="alerts@company.com" />
                  </div>
                  <div>
                    <label className="cyber-label">SMTP Password</label>
                    <input type="password" className="cyber-input w-full text-white" value={settings.smtpPass || ''} onChange={(e) => setSettings({...settings, smtpPass: e.target.value})} placeholder="••••••••" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="cyber-label">Sender Address (From)</label>
                    <input type="email" className="cyber-input w-full text-white" value={settings.smtpFrom || ''} onChange={(e) => setSettings({...settings, smtpFrom: e.target.value})} placeholder="alerts@secureassets.local" />
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">If left empty, a mock Ethereal test account will be automatically generated to preview emails.</p>
                  </div>
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
                    <div className="text-xs text-slate-400 font-mono">Last Sync: {settings.lastBackupTime ? settings.lastBackupTime : 'Just now'}</div>
                  </div>
                </div>
                <FiCheckCircle className="text-success text-xl" />
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="cyber-label">Automated Backup Frequency</label>
                  <select 
                    className="cyber-input w-full max-w-md text-white"
                    value={settings.backupFrequency}
                    onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value })}
                  >
                    <option value="Hourly">Hourly</option>
                    <option value="Daily at 02:00 AM">Daily at 02:00 AM</option>
                    <option value="Weekly on Sundays">Weekly on Sundays</option>
                  </select>
                </div>
                <div>
                  <label className="cyber-label">Cloud Storage Provider</label>
                  <select 
                    className="cyber-input w-full max-w-md text-white"
                    value={settings.cloudProvider}
                    onChange={(e) => setSettings({ ...settings, cloudProvider: e.target.value })}
                  >
                    <option value="AWS S3 (Encrypted)">AWS S3 (Encrypted)</option>
                    <option value="Azure Blob Storage">Azure Blob Storage</option>
                    <option value="Google Cloud Storage">Google Cloud Storage</option>
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
              {/* One-Click automated deployment */}
              <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl mb-8">
                <h4 className="text-primary font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                  One-Click Automated Deployment (Recommended for 50+ Devices)
                </h4>
                <p className="text-slate-400 text-xs mb-4">
                  Run this single command in PowerShell as **Administrator** on any Windows device. 
                  It will automatically download, configure, and install the agent as a silent startup service (no Python required).
                </p>
                <div className="relative">
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 pr-12 text-[11px] text-success font-mono overflow-x-auto select-all">
                    {`powershell -ExecutionPolicy Bypass -Command "iwr -useb http://${window.location.hostname}:5000/api/telemetry/agent/install | iex"`}
                  </pre>
                  <button
                    onClick={() => copyCmd(`powershell -ExecutionPolicy Bypass -Command "iwr -useb http://${window.location.hostname}:5000/api/telemetry/agent/install | iex"`, 'oneclick')}
                    className="absolute top-3.5 right-3.5 p-1.5 bg-slate-900 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    title="Copy command"
                  >
                    {copiedCmd === 'oneclick' ? <FiCheckCircle className="text-success text-xs" /> : <FiCopy className="text-xs" />}
                  </button>
                </div>
              </div>

              {/* Setup steps */}
              <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Manual Installation Guide (Fallback)</h4>
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
