import { useState, useEffect } from 'react';
import { FiCpu, FiTrendingDown, FiActivity, FiTool, FiZap, FiAlertCircle, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import { socket } from '../../services/socket';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const AIPrediction = () => {
  // Local states to track analysis status, toast alerts, raw asset records and ticket submissions
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [hasData, setHasData] = useState(false);
  const [assets, setAssets] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState(null);
  const [ticketStatus, setTicketStatus] = useState({}); // { [index]: 'idle' | 'loading' | 'success' | 'error' }

  // Dynamic AI data
  const [fleetStats, setFleetStats] = useState({
    fleetHealth: 100,
    onlineCount: 0,
    totalCount: 0,
    predictedFailures: 0,
    warningDevices: 0,
    optimalDevices: 0,
    recommendations: []
  });

  const [degradationChart, setDegradationChart] = useState({
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun (Pred)', 'Jul (Pred)', 'Aug (Pred)'],
    values: [100, 100, 100, 100, 100, 100, 100, 100]
  });

  // Fetch registered assets and devices on component mount
  useEffect(() => {
    fetchAssets();
    fetchDevicesAndPredictions();

    // Listen to real-time telemetry updates to automatically keep predictions updated
    socket.on('live-update', () => {
      fetchDevicesAndPredictions(true); // silent update
    });

    socket.on('device-offline', () => {
      fetchDevicesAndPredictions(true); // silent update
    });

    return () => {
      socket.off('live-update');
      socket.off('device-offline');
    };
  }, []);

  // Fetch degradation curve when selected device changes
  useEffect(() => {
    if (selectedDeviceId) {
      fetchDegradation(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // Get full assets list from backend to cross-reference asset IDs with their database primary keys
  const fetchAssets = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/assets', config);
      setAssets(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch assets in AIPrediction:', err);
    }
  };

  // Fetch devices list and predictions
  const fetchDevicesAndPredictions = async (silent = false) => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const [devRes, predRes] = await Promise.all([
        axios.get('http://localhost:5000/api/telemetry/latest', config),
        axios.get('http://localhost:5000/api/ai/predictions', config)
      ]);

      const activeDevs = devRes.data || [];
      setDevices(activeDevs);
      setFleetStats(predRes.data);
      
      if (!silent) {
        setHasData(true);
      }

      // Default select the first device if none is selected
      if (activeDevs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(activeDevs[0].device_id);
      }
    } catch (err) {
      console.error('Failed to fetch AI data:', err);
    }
  };

  const fetchDegradation = async (deviceId) => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get(`http://localhost:5000/api/ai/degradation/${deviceId}`, config);
      setDegradationChart(res.data);
    } catch (err) {
      console.error('Failed to fetch degradation data:', err);
    }
  };

  // Run the AI progress bar
  const handleRunAnalysis = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      fetchDevicesAndPredictions();
      setIsAnalyzing(false);
      setToastMessage('AI Analysis completed successfully.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }, 1500);
  };

  // Convert an AI recommendation into an actual maintenance ticket in the database
  const handleCreateTicket = async (rec, index) => {
    setTicketStatus(prev => ({ ...prev, [index]: 'loading' }));
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      // Look up our local assets to find the database ID matching the recommendation's text label
      const matchedAsset = assets.find(a => 
        a.asset_id === rec.asset_code || 
        rec.asset_code.includes(a.asset_id) || 
        a.asset_id.includes(rec.asset_code)
      );
      
      const payload = {
        asset_id: matchedAsset ? matchedAsset.id : null,
        title: rec.title,
        description: rec.desc,
        priority: rec.severity.toLowerCase()
      };

      await axios.post('http://localhost:5000/api/maintenance', payload, config);
      setTicketStatus(prev => ({ ...prev, [index]: 'success' }));
      setToastMessage(`Maintenance ticket created successfully for ${rec.asset_code || 'device'}.`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error(err);
      setTicketStatus(prev => ({ ...prev, [index]: 'error' }));
    }
  };

  // Chart visual configuration for the degradation forecast chart
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Fira Code' } } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { family: 'Fira Code' } } }
    }
  };

  // Chart dataset representing predicted health drop
  const degradationData = {
    labels: degradationChart.labels,
    datasets: [{
      label: 'Component Health %',
      data: degradationChart.values,
      borderColor: '#ffb700',
      backgroundColor: 'rgba(255, 183, 0, 0.1)',
      borderDash: [5, 5],
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#050b14',
      pointBorderColor: '#ffb700',
      pointBorderWidth: 2,
    }]
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] relative">
      {/* Dynamic toast alert that slides in when tickets or analysis complete */}
      {showToast && (
        <div className="absolute top-0 right-0 bg-secondary/10 border border-secondary/30 text-secondary px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50">
          <FiCheckCircle className="text-xl" />
          <span className="font-mono text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Page header with execution controls and accuracy metric */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiCpu className="text-secondary" /> AI <span className="text-secondary">PREDICTIVE ENGINE</span>
          </h1>
          <p className="text-slate-400 text-sm">Machine learning driven proactive maintenance and risk forecasting</p>
        </div>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-2 text-sm font-mono text-slate-400">
            MODEL ACCURACY: <span className="text-success font-bold">94.2%</span>
          </div>
          <button onClick={handleRunAnalysis} disabled={isAnalyzing} className="btn-primary bg-secondary/10 text-secondary border-secondary/40 hover:bg-secondary hover:border-secondary shadow-[0_0_15px_rgba(188,19,254,0.15)] text-sm py-2 px-6 flex items-center gap-2">
            <FiZap className={isAnalyzing ? "animate-spin" : ""} /> {isAnalyzing ? 'ANALYZING...' : 'RUN ANALYSIS'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Hardware degradation chart widget showing degradation predictions */}
        <div className="xl:col-span-2 glass-panel p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-bold flex items-center gap-2 uppercase tracking-wider text-sm">
              <FiTrendingDown className="text-warning" /> Component Degradation Forecast
            </h3>
            
            {/* Device selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono">Target Device:</span>
              <select 
                value={selectedDeviceId} 
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-xs font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-secondary"
              >
                {devices.map(d => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_id} ({d.device_name || 'Generic'})
                  </option>
                ))}
                {devices.length === 0 && (
                  <option value="">No Active Devices</option>
                )}
              </select>
            </div>
          </div>
          
          <div className="h-64 mb-4">
            <Line data={degradationData} options={chartOptions} />
          </div>
          
          {selectedDeviceId ? (
            <p className="text-sm text-warning font-mono">
              <FiAlertCircle className="inline text-warning mr-1" /> 
              Showing 12-month hardware degradation path and forecast for {selectedDeviceId}.
            </p>
          ) : (
            <p className="text-sm text-slate-500 font-mono">
              <FiAlertCircle className="inline text-slate-500 mr-1" /> 
              Awaiting active devices to build forecasting data...
            </p>
          )}
        </div>

        {/* System fleet health radial score and breakdown metrics */}
        <div className="glass-panel p-6 flex flex-col">
          <h3 className="text-white font-bold mb-6 flex items-center gap-2 uppercase tracking-wider text-sm"><FiActivity className="text-primary" /> System Fleet Health</h3>
          <div className="flex-1 flex flex-col justify-center items-center gap-6">
            <div className={`relative w-40 h-40 rounded-full border-4 ${hasData ? (fleetStats.fleetHealth >= 80 ? 'border-success shadow-[0_0_30px_rgba(34,197,94,0.2)]' : fleetStats.fleetHealth >= 50 ? 'border-warning shadow-[0_0_30px_rgba(234,179,8,0.2)]' : 'border-danger shadow-[0_0_30px_rgba(239,68,68,0.2)]') : 'border-slate-800'} flex items-center justify-center`}>
              <div className="text-center">
                <div className={`text-4xl font-bold font-mono ${hasData ? (fleetStats.fleetHealth >= 80 ? 'text-success' : fleetStats.fleetHealth >= 50 ? 'text-warning' : 'text-danger') : 'text-slate-500'}`}>
                  {hasData ? fleetStats.fleetHealth : '0'}
                  <span className={`text-lg ${hasData ? 'opacity-80' : 'text-slate-600'}`}>%</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Health Score</div>
              </div>
            </div>
            <div className="w-full space-y-3 mt-4">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Predicted Failures (30d):</span>
                <span className={`font-bold ${hasData && fleetStats.predictedFailures > 0 ? 'text-danger' : 'text-slate-400'}`}>
                  {hasData ? `${fleetStats.predictedFailures} Devices` : '0 Devices'}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Maintenance Required:</span>
                <span className={`font-bold ${hasData && fleetStats.warningDevices > 0 ? 'text-warning' : 'text-slate-400'}`}>
                  {hasData ? `${fleetStats.warningDevices} Devices` : '0 Devices'}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Optimal State:</span>
                <span className={`font-bold ${hasData && fleetStats.optimalDevices > 0 ? 'text-success' : 'text-slate-400'}`}>
                  {hasData ? `${fleetStats.optimalDevices} Devices` : '0 Devices'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested proactive actions cards generated from hardware metrics */}
      <h3 className="text-white font-bold mb-4 flex items-center gap-2 uppercase tracking-wider text-sm mt-8"><FiZap className="text-secondary" /> AI Recommended Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {fleetStats.recommendations.length === 0 ? (
          <div className="col-span-3 glass-panel p-8 flex flex-col items-center justify-center text-slate-500 border-t-[3px] border-t-slate-700">
            <FiZap className="text-4xl mb-4 opacity-50" />
            <h4 className="font-bold text-white mb-2">No AI Recommendations Available</h4>
            <p className="text-sm">Install devices to automatically generate real-time predictive insights.</p>
          </div>
        ) : (
          fleetStats.recommendations.map((rec, i) => {
            const status = ticketStatus[i] || 'idle';
            return (
              <div key={i} className={`glass-panel p-6 border-t-[3px] ${rec.severity === 'Critical' ? 'border-t-danger' : rec.severity === 'Warning' ? 'border-t-warning' : 'border-t-primary'} flex flex-col justify-between`}>
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded bg-slate-800 ${rec.severity === 'Critical' ? 'text-danger' : rec.severity === 'Warning' ? 'text-warning' : 'text-primary'}`}><FiTool /></div>
                    <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-1 border rounded ${rec.severity === 'Critical' ? 'text-danger border-danger/30 bg-danger/10' : rec.severity === 'Warning' ? 'text-warning border-warning/30 bg-warning/10' : 'text-primary border-primary/30 bg-primary/10'}`}>{rec.severity}</span>
                  </div>
                  <h4 className="font-bold text-white mb-2">{rec.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">{rec.desc}</p>
                  
                  <button 
                    onClick={() => {
                      setSelectedRecommendation(rec);
                      setSelectedRecommendationIndex(i);
                    }}
                    className="text-xs text-secondary hover:text-white hover:underline font-mono font-bold flex items-center gap-1.5 transition-colors mb-4 cursor-pointer"
                  >
                    🔍 VIEW DETAILED DIAGNOSTICS
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-500 font-mono">Device: {rec.asset_code}</span>
                  {status === 'success' ? (
                    <span className="text-xs text-success font-mono font-bold flex items-center gap-1">
                      <FiCheckCircle /> TICKET CREATED
                    </span>
                  ) : (
                    <button 
                      onClick={() => handleCreateTicket(rec, i)}
                      disabled={status === 'loading'}
                      className="text-xs text-white uppercase tracking-wider font-bold hover:text-secondary transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {status === 'loading' ? 'CREATING...' : <>Create Ticket <FiTrendingDown className="rotate-180"/></>}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* AI Recommendation Details Modal */}
      {selectedRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]" onClick={() => { setSelectedRecommendation(null); setSelectedRecommendationIndex(null); }}>
          <div className="glass-panel w-full max-w-2xl p-6 relative border-t-4 border-t-secondary shadow-[0_0_50px_rgba(188,19,254,0.3)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setSelectedRecommendation(null); setSelectedRecommendationIndex(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <FiXCircle className="text-2xl" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono flex items-center gap-3">
              <FiZap className="text-secondary" /> AI ACTION DIAGNOSTICS
            </h2>
            <div className="border-b border-slate-800 pb-4 mb-4 flex justify-between items-start gap-4">
              <div>
                <strong className="text-sm text-slate-400 font-mono block mb-1">RECOMMENDED WORKFLOW</strong>
                <h3 className="text-lg font-bold text-white leading-snug">{selectedRecommendation.title}</h3>
              </div>
              <span className={`text-[10px] font-mono px-2.5 py-1 rounded font-bold border ${
                selectedRecommendation.severity === 'Critical' ? 'bg-danger/25 text-danger border-danger/45 shadow-[0_0_12px_rgba(239,68,68,0.25)]' :
                selectedRecommendation.severity === 'Warning'  ? 'bg-warning/25 text-warning border-warning/45' :
                                                                 'bg-primary/25 text-primary border-primary/45'
              }`}>{selectedRecommendation.severity}</span>
            </div>

            <div className="space-y-4 font-mono text-xs max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Threat Context / Description</span>
                <p className="text-slate-350 font-sans leading-relaxed text-xs p-3 bg-slate-900/40 border border-slate-850 rounded">
                  {selectedRecommendation.desc}
                </p>
              </div>

              {selectedRecommendation.impact && (
                <div>
                  <span className="text-[10px] text-danger uppercase tracking-widest font-bold block mb-1">Potential Threat Impact</span>
                  <p className="text-danger/90 font-sans leading-relaxed text-xs p-3 bg-danger/5 border border-danger/20 rounded">
                    {selectedRecommendation.impact}
                  </p>
                </div>
              )}

              {selectedRecommendation.mitigation && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">EDR Remediation & Mitigation Protocols</span>
                  <p className="text-slate-300 font-sans leading-relaxed text-xs p-3 bg-slate-900 border border-slate-800 rounded whitespace-pre-line">
                    {selectedRecommendation.mitigation}
                  </p>
                </div>
              )}

              {/* Recommended EDR Terminal Command */}
              <div>
                <span className="text-[10px] text-secondary uppercase tracking-widest font-bold block mb-1">Recommended EDR Command</span>
                <div className="flex items-center justify-between p-3 bg-black/90 border border-slate-800 rounded font-mono text-xs text-primary">
                  <code>
                    {selectedRecommendation.title.toLowerCase().includes("antivirus") ? "net start WinDefend" :
                     selectedRecommendation.title.toLowerCase().includes("firewall") ? "netsh advfirewall set allprofiles state on" :
                     selectedRecommendation.title.toLowerCase().includes("patch") || selectedRecommendation.title.toLowerCase().includes("update") ? "UsoClient StartScan" :
                     selectedRecommendation.title.toLowerCase().includes("storage") || selectedRecommendation.title.toLowerCase().includes("usb") ? "reg add HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR /v Start /t REG_DWORD /d 4 /f" :
                     selectedRecommendation.title.toLowerCase().includes("credential") ? "net accounts /minpwlen:12 /maxpwage:90" :
                     "secure_agent.py --mitigate " + selectedRecommendation.asset_code}
                  </code>
                  <span className="text-[10px] text-slate-500 uppercase font-mono">EDR SHELL</span>
                </div>
              </div>
            </div>

            <div className="pt-5 mt-6 border-t border-slate-850 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">Target Asset ID: <strong className="text-white">{selectedRecommendation.asset_code}</strong></span>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setSelectedRecommendation(null); setSelectedRecommendationIndex(null); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs uppercase tracking-wider rounded border border-slate-700 transition-all cursor-pointer font-bold"
                >
                  Close
                </button>
                {ticketStatus[selectedRecommendationIndex] === 'success' ? (
                  <span className="px-4 py-2 text-xs text-success font-mono font-bold flex items-center gap-1">
                    <FiCheckCircle /> TICKET CREATED
                  </span>
                ) : (
                  <button 
                    onClick={() => handleCreateTicket(selectedRecommendation, selectedRecommendationIndex)}
                    disabled={ticketStatus[selectedRecommendationIndex] === 'loading'}
                    className="btn-primary py-2 px-4 text-xs font-mono font-bold tracking-wider flex items-center gap-2 disabled:opacity-50"
                  >
                    {ticketStatus[selectedRecommendationIndex] === 'loading' ? 'CREATING...' : 'CREATE MAINTENANCE TICKET'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIPrediction;
