import { useState } from 'react';
import { FiFileText, FiDownloadCloud, FiDatabase, FiLock, FiCheckCircle, FiInfo, FiCpu, FiXCircle } from 'react-icons/fi';
import axios from 'axios';

const REPORT_TYPES = [
  {
    id: 'inventory',
    label: 'Asset Inventory',
    icon: FiDatabase,
    desc: 'All hardware assets, assignments, specs, and warranty info',
    endpoint: '/api/assets/export',
    filename: 'SecureAssets_Assets',
    color: 'text-primary',
    borderActive: 'border-primary bg-primary/10',
  },
  {
    id: 'security',
    label: 'Security & Compliance',
    icon: FiLock,
    desc: 'All threat alerts, severity levels, and resolution history',
    endpoint: '/api/security/export',
    filename: 'SecureAssets_Security',
    color: 'text-danger',
    borderActive: 'border-danger bg-danger/10',
  },
  {
    id: 'maintenance',
    label: 'Maintenance History',
    icon: FiFileText,
    desc: 'Repair tickets, downtime events, assignments, and costs',
    endpoint: '/api/maintenance/export',
    filename: 'SecureAssets_Maintenance',
    color: 'text-warning',
    borderActive: 'border-warning bg-warning/10',
  },
  {
    id: 'telemetry',
    label: 'Device Telemetry',
    icon: FiCpu,
    desc: 'Live device health snapshot — CPU, RAM, risk score, compliance status',
    endpoint: '/api/telemetry/export',
    filename: 'SecureAssets_DeviceTelemetry',
    color: 'text-success',
    borderActive: 'border-success bg-success/10',
  },
];

const Reports = () => {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState('inventory');
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState({ text: '', type: 'success' });

  const selectedReport = REPORT_TYPES.find(r => r.id === selectedType);

  const showNotif = (text, type = 'success') => {
    setToastMsg({ text, type });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Pull real data from backend and download it
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      };
      const url = `http://localhost:5000${selectedReport.endpoint}?format=${selectedFormat}`;
      const response = await axios.get(url, config);

      const ext = selectedFormat === 'json' ? 'json' : 'csv';
      const blob = new Blob([response.data], {
        type: selectedFormat === 'json' ? 'application/json' : 'text/csv'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${selectedReport.filename}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      showNotif(`${selectedReport.label} report downloaded successfully!`, 'success');
      setStep(1);
    } catch (err) {
      console.error('Export error:', err);
      showNotif('Export failed. Please check the server connection.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col items-center relative">
      {/* Toast Notification */}
      {showToast && (
        <div className={`absolute top-0 right-0 px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 border font-mono text-sm ${
          toastMsg.type === 'error'
            ? 'bg-danger/10 border-danger/30 text-danger'
            : 'bg-success/10 border-success/30 text-success'
        }`}>
          {toastMsg.type === 'error' ? <FiXCircle className="text-xl" /> : <FiCheckCircle className="text-xl" />}
          <div>
            <span className="font-bold block">{toastMsg.type === 'error' ? 'Export Failed' : 'Report Generated'}</span>
            <span className="text-xs">{toastMsg.text}</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center justify-center gap-3">
            <FiDownloadCloud className="text-primary" /> DATA <span className="text-primary">EXTRACTION</span>
          </h1>
          <p className="text-slate-400 text-sm">Generate and download real compliance, asset, and security reports</p>
        </div>

        {/* Wizard Progress */}
        <div className="flex justify-between items-center mb-12 relative">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-800 -z-10 -translate-y-1/2">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}></div>
          </div>
          {[
            { n: 1, label: 'Data Type' },
            { n: 2, label: 'Format' },
            { n: 3, label: 'Export' },
          ].map(s => (
            <div key={s.n} className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-mono border-2 bg-darkBase ${step >= s.n ? 'border-primary text-primary shadow-[0_0_15px_rgba(0,240,255,0.3)]' : 'border-slate-700 text-slate-500'}`}>{s.n}</div>
              <span className={`text-xs uppercase tracking-widest mt-2 font-bold ${step >= s.n ? 'text-slate-400' : 'text-slate-600'}`}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Wizard Content */}
        <div className="glass-panel p-8 min-h-[400px] flex flex-col border-t-[3px] border-t-primary">

          {/* Step 1: Select Report Type */}
          {step === 1 && (
            <div className="animate-[fadeIn_0.3s_ease-out] flex-1 flex flex-col">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Step 1: Select Data Source
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                {REPORT_TYPES.map(rt => {
                  const Icon = rt.icon;
                  const isSelected = selectedType === rt.id;
                  return (
                    <button
                      key={rt.id}
                      onClick={() => setSelectedType(rt.id)}
                      className={`border-2 rounded-xl p-6 flex items-start gap-4 transition-all text-left group ${isSelected ? rt.borderActive : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                    >
                      <Icon className={`text-3xl flex-shrink-0 mt-1 transition-transform ${isSelected ? rt.color : 'text-slate-500 group-hover:scale-110'}`} />
                      <div>
                        <h4 className={`font-bold mb-1 ${isSelected ? 'text-white' : 'text-slate-300'}`}>{rt.label}</h4>
                        <p className={`text-xs leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>{rt.desc}</p>
                      </div>
                      {isSelected && (
                        <FiCheckCircle className={`ml-auto flex-shrink-0 text-lg ${rt.color}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Select Format */}
          {step === 2 && (
            <div className="animate-[fadeIn_0.3s_ease-out] flex-1 flex flex-col">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Step 2: Export Format
              </h3>
              <div className="flex gap-4 flex-wrap mb-8">
                {[
                  { fmt: 'csv', label: 'CSV Spreadsheet', desc: 'Open in Excel, Google Sheets, or any spreadsheet app', icon: '📊' },
                  { fmt: 'json', label: 'JSON Data', desc: 'Raw structured data for developers or API integration', icon: '{ }' },
                ].map(f => (
                  <button
                    key={f.fmt}
                    onClick={() => setSelectedFormat(f.fmt)}
                    className={`flex-1 min-w-[200px] border-2 rounded-xl p-6 flex flex-col items-center gap-3 transition-all ${selectedFormat === f.fmt ? 'border-primary bg-primary/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}
                  >
                    <span className="text-3xl font-mono font-bold text-white">{f.icon}</span>
                    <div className="text-center">
                      <div className={`font-bold mb-1 ${selectedFormat === f.fmt ? 'text-white' : 'text-slate-300'}`}>{f.label}</div>
                      <div className={`text-xs ${selectedFormat === f.fmt ? 'text-slate-300' : 'text-slate-500'}`}>{f.desc}</div>
                    </div>
                    {selectedFormat === f.fmt && <FiCheckCircle className="text-primary text-lg" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review & Export */}
          {step === 3 && (
            <div className="animate-[fadeIn_0.3s_ease-out] flex-1 flex flex-col">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
                Step 3: Confirm & Export
              </h3>
              <div className="p-6 border border-primary/30 bg-primary/5 rounded-xl mb-6 max-w-2xl">
                <h4 className="text-primary font-bold text-sm mb-4 flex items-center gap-2"><FiInfo className="inline" /> Export Summary</h4>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Report Type', value: selectedReport?.label },
                    { label: 'Format', value: selectedFormat.toUpperCase() },
                    { label: 'Source', value: `http://localhost:5000${selectedReport?.endpoint}?format=${selectedFormat}` },
                    { label: 'Filename', value: `${selectedReport?.filename}.${selectedFormat}` },
                    { label: 'Data', value: 'Live data from database (real-time)' },
                  ].map(item => (
                    <div key={item.label} className="flex gap-3">
                      <span className="text-slate-500 w-28 flex-shrink-0">{item.label}:</span>
                      <span className="text-white font-mono text-xs break-all">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-success/5 border border-success/20 rounded-lg text-xs text-slate-400 max-w-2xl">
                <FiCheckCircle className="inline text-success mr-2" />
                This report will fetch <strong className="text-white">live data</strong> from your database and download it immediately. No data is cached or simulated.
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-700">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)} className="px-6 py-2 rounded font-bold font-mono text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                ← BACK
              </button>
            ) : <div />}
            
            {step < 3 ? (
              <button onClick={() => setStep(s => s + 1)} className="btn-primary py-2 px-8">CONTINUE →</button>
            ) : (
              <button onClick={handleExport} disabled={isExporting} className="btn-success py-2 px-8 flex items-center gap-2">
                {isExporting
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> EXPORTING...</>
                  : <><FiDownloadCloud /> EXPORT REPORT</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
