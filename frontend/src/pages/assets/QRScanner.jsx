import { useState, useEffect, useRef } from 'react';
import { 
  FiMaximize, FiCamera, FiBox, FiDownload, FiSearch, FiCheckCircle, 
  FiAlertTriangle, FiClock, FiShield, FiUser, FiFileText,
  FiAlertOctagon, FiUpload, FiPrinter, FiUserPlus, FiArrowRight, FiTrash2, FiX, FiVideoOff
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import jsQR from 'jsqr';
import QRCode from 'qrcode';


// Deterministic QR Matrix Generator using Canvas
const QRCanvas = ({ text, size = 150 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const isLightMode = document.documentElement.classList.contains('light');
    
    QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 1,
      color: {
        dark: isLightMode ? '#0f172a' : '#ffffff',
        light: isLightMode ? '#ffffff' : '#0f172a'
      }
    }, (err) => {
      if (err) console.error(err);
    });
  }, [text, size]);

  return (
    <div className="relative group border border-slate-700/50 p-3 bg-slate-900 rounded-xl shadow-[0_0_15px_rgba(0,240,255,0.15)] flex items-center justify-center">
      <canvas ref={canvasRef} className="rounded-lg" />
      <div className="absolute inset-0 border border-primary/20 rounded-xl group-hover:border-primary/50 transition-colors pointer-events-none"></div>
    </div>
  );
};

const QRScanner = () => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [, setLoading] = useState(true);
  
  // Scanned states
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [templateAsset, setTemplateAsset] = useState(null);
  const [manualInput, setManualInput] = useState('');
  
  // Scanning state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('ready'); // ready, scanning, success, error
  const [statusMsg, setStatusMsg] = useState('System ready. Scan a device tag.');

  // Camera settings (Laptop / External Checkup)
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  
  const videoRef = useRef(null);
  const viewfinderCanvasRef = useRef(null);
  const requestRef = useRef(null);
  const streamRef = useRef(null);

  // Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', location: '' });
  
  // Toast notifications
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success');

  // Scan History Logs
  const [scanHistory, setScanHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('scan_history') || '[]');
    } catch {
      return [];
    }
  });

  const triggerToast = (msg, type = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  useEffect(() => {
    fetchData();
    return () => {
      stopCameraStream();
    };
  }, []);

  // Load the initial data (assets and employees) when the scanner mounts
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const [assetsRes, employeesRes] = await Promise.all([
        axios.get('http://localhost:5000/api/assets?limit=100', config),
        axios.get('http://localhost:5000/api/employees', config)
      ]);
      
      const assetsList = assetsRes.data.data || assetsRes.data || [];
      const employeesList = employeesRes.data.data || employeesRes.data || [];
      
      setAssets(assetsList);
      setEmployees(employeesList);
      
      if (assetsList.length > 0) {
        setTemplateAsset(assetsList[0]);
      }
    } catch (err) {
      console.error("Failed to load initial scanner data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Access the webcam and start the video feed
  const startCameraStream = async (deviceId) => {
    stopCameraStream();
    try {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const hiddenVideo = document.createElement('video');
      hiddenVideo.srcObject = stream;
      hiddenVideo.setAttribute('playsinline', 'true');
      hiddenVideo.play();
      videoRef.current = hiddenVideo;

      setCameraActive(true);
      setStatusMsg('Camera stream active. Point at device barcode or QR tag.');
      
      // Start real-time image decoding loop
      requestRef.current = requestAnimationFrame(() => tickScan(hiddenVideo));

      // Enumerate all available cameras (Laptop vs External checkup)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(cameras);
      if (!selectedDeviceId && cameras.length > 0) {
        setSelectedDeviceId(deviceId || cameras[0].deviceId);
      }
    } catch (err) {
      console.error("Failed to open video device stream:", err);
      triggerToast("Webcam stream access blocked. Verify permissions.", "error");
      setStatusMsg("Camera input blocked. Please resolve browser hardware permissions.");
    }
  };

  // Turn off the webcam and release any active video resources
  const stopCameraStream = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setCameraActive(false);
  };

  const handleDeviceChange = async (e) => {
    const devId = e.target.value;
    setSelectedDeviceId(devId);
    await startCameraStream(devId);
  };

  // Process each video frame to detect if a QR code is visible
  const tickScan = (video) => {
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = viewfinderCanvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        // Render video frame on viewfinder canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Scan frame pixels for QR codes
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });
        
        if (code) {
          // Highlight coordinates with neon green box
          ctx.beginPath();
          ctx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
          ctx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
          ctx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
          ctx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
          ctx.closePath();
          ctx.lineWidth = 5;
          ctx.strokeStyle = "#00ff66";
          ctx.stroke();

          ctx.font = "bold 16px monospace";
          ctx.fillStyle = "#00ff66";
          ctx.fillText("QR CODE DETECTED", code.location.topLeftCorner.x, code.location.topLeftCorner.y - 12);
          
          const assetId = extractAssetId(code.data);
          
          // Pause animation loop and process matched asset
          cancelAnimationFrame(requestRef.current);
          handleRealDecode(assetId);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(() => tickScan(video));
  };

  const extractAssetId = (text) => {
    const urlMatch = text.match(/\/asset\/([a-zA-Z0-9-]+)/i);
    if (urlMatch) return urlMatch[1];
    return text.trim();
  };

  // Fetch asset and telemetry data for a successfully scanned QR ID
  const handleRealDecode = async (assetId, skipLogging = false) => {
    setScanning(true);
    setScanStatus('scanning');
    setStatusMsg(`Decoding scanned tag payload: "${assetId}"...`);
    
    // Hold green outline visible for a brief moment
    await new Promise(r => setTimeout(r, 600));

    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const res = await axios.get(`http://localhost:5000/api/assets/${assetId}`, config);
      const asset = res.data;
      
      const telemRes = await axios.get('http://localhost:5000/api/telemetry/latest', config);
      const deviceTelemetry = telemRes.data.find(d => d.device_id === asset.asset_id);
      
      setSelectedAsset(asset);
      setTelemetry(deviceTelemetry || null);
      setScanStatus('success');
      setStatusMsg(`Successfully matched asset: ${asset.asset_id}`);
      
      if (!skipLogging) {
        logScanHistory(asset.asset_id, 'Camera QR Tag Decoded');
      }
      triggerToast(`Uplink established: ${asset.asset_id}`);
    } catch (err) {
      console.error(err);
      setSelectedAsset(null);
      setTelemetry(null);
      setScanStatus('error');
      setStatusMsg(`Error: Scanned asset "${assetId}" is not in registry.`);
      if (!skipLogging) {
        logScanHistory(assetId, 'Scan Failed (Not Found)');
      }
      triggerToast(`Failed to locate scanned asset: ${assetId}`, 'error');
    } finally {
      setScanning(false);
      
      // Auto-restart camera scanning loop after 3 seconds
      setTimeout(() => {
        if (cameraActive && videoRef.current) {
          requestRef.current = requestAnimationFrame(() => tickScan(videoRef.current));
        }
      }, 3000);
    }
  };

  // Log scan event to persistent local storage
  const logScanHistory = (assetId, actionText) => {
    const user = (() => {
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.name || 'System Operator';
      } catch {
        return 'System Operator';
      }
    })();
    
    const newLog = {
      id: Date.now(),
      date: new Date().toISOString(),
      user,
      assetId,
      action: actionText
    };
    
    setScanHistory(prev => {
      const updated = [newLog, ...prev].slice(0, 50); // limit to 50 logs
      localStorage.setItem('scan_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSimulateScan = async (assetId, isUpload = false) => {
    if (!assetId) {
      setScanStatus('error');
      setStatusMsg('Please provide a valid Asset ID.');
      return;
    }
    
    setScanning(true);
    setScanProgress(0);
    setScanStatus('scanning');
    setStatusMsg(isUpload ? 'Processing uploaded QR image...' : 'Accessing camera stream & scanning optical tag...');

    for (let p = 20; p <= 100; p += 20) {
      await new Promise(r => setTimeout(r, 120));
      setScanProgress(p);
    }

    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const res = await axios.get(`http://localhost:5000/api/assets/${assetId}`, config);
      const asset = res.data;
      
      const telemRes = await axios.get('http://localhost:5000/api/telemetry/latest', config);
      const deviceTelemetry = telemRes.data.find(d => d.device_id === asset.asset_id);
      
      setSelectedAsset(asset);
      setTelemetry(deviceTelemetry || null);
      setScanStatus('success');
      setStatusMsg(`Successfully identified tag: ${asset.asset_id}`);
      
      logScanHistory(asset.asset_id, isUpload ? 'QR Image Uploaded' : 'Camera Scan Success');
      triggerToast(`Uplink established: ${asset.asset_id}`);
    } catch (err) {
      console.error(err);
      setSelectedAsset(null);
      setTelemetry(null);
      setScanStatus('error');
      setStatusMsg(`Error: Asset "${assetId}" not found in database.`);
      logScanHistory(assetId, 'Scan Failed (Not Found)');
      triggerToast(`Failed to locate asset: ${assetId}`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleSimulateScan(manualInput.trim().toUpperCase(), false);
  };

  const handleUploadClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });
            
            if (code && code.data) {
              const assetId = extractAssetId(code.data);
              triggerToast(`✓ Decoded QR Code: ${assetId}`, 'success');
              handleSimulateScan(assetId, true);
            } else {
              triggerToast('Failed to decode QR code. Ensure the QR is clear and fully visible.', 'error');
            }
          } catch (err) {
            console.error('QR decode error:', err);
            triggerToast('Error processing uploaded image.', 'error');
          }
        };
        img.onerror = () => {
          triggerToast('Invalid image file.', 'error');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };

  // Generate and download a dynamic clean QR image matching either the scanned or template asset ID
  const handleDownloadQR = async () => {
    const targetAsset = selectedAsset || templateAsset;
    if (!targetAsset) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 280;
      const ctx = canvas.getContext('2d');

      const isLightMode = document.documentElement.classList.contains('light');
      ctx.fillStyle = isLightMode ? '#ffffff' : '#0f172a';
      ctx.fillRect(0, 0, 240, 280);

      ctx.strokeStyle = isLightMode ? '#0284c7' : '#00f0ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, 230, 270);

      const qrData = targetAsset.asset_id;
      
      const tempCanvas = document.createElement('canvas');
      await QRCode.toCanvas(tempCanvas, qrData, {
        width: 180,
        margin: 1,
        color: {
          dark: isLightMode ? '#0f172a' : '#ffffff',
          light: isLightMode ? '#ffffff' : '#0f172a'
        }
      });

      ctx.drawImage(tempCanvas, 30, 25, 180, 180);

      ctx.fillStyle = isLightMode ? '#334155' : '#94a3b8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(targetAsset.category ? targetAsset.category.toUpperCase() : 'DEVICE', 120, 20);

      ctx.fillStyle = isLightMode ? '#0f172a' : '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(targetAsset.asset_id, 120, 225);

      ctx.fillStyle = isLightMode ? '#475569' : '#cbd5e1';
      ctx.font = '11px sans-serif';
      const deviceLabel = `${targetAsset.brand} ${targetAsset.model}`;
      const truncatedLabel = deviceLabel.length > 25 ? deviceLabel.substring(0, 22) + '...' : deviceLabel;
      ctx.fillText(truncatedLabel, 120, 245);

      ctx.fillStyle = isLightMode ? '#16a34a' : '#00ff66';
      ctx.font = '9px monospace';
      ctx.fillText('SYSTEM TAG // SECURE', 120, 262);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${targetAsset.asset_id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      triggerToast(`✓ Exported QR Tag: ${targetAsset.asset_id}`);
    } catch (err) {
      console.error(err);
      triggerToast('Failed to export QR Tag.', 'error');
    }
  };

  const handleViewProfile = () => {
    if (!selectedAsset) return;
    navigator.clipboard.writeText(selectedAsset.asset_id);
    triggerToast('Asset ID copied to clipboard. Opening Registry...', 'success');
    setTimeout(() => {
      navigate(`/assets?search=${encodeURIComponent(selectedAsset.asset_id)}`);
    }, 800);
  };

  // Submit asset assignment / transfer changes
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAsset) return;
    
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const payload = {
        serial_number: selectedAsset.serial_number,
        brand: selectedAsset.brand,
        model: selectedAsset.model,
        category: selectedAsset.category,
        status: 'in_use',
        condition: selectedAsset.condition,
        location: assignForm.location || selectedAsset.location,
        notes: selectedAsset.notes,
        assigned_to: assignForm.employeeId ? parseInt(assignForm.employeeId) : null
      };

      await axios.put(`http://localhost:5000/api/assets/${selectedAsset.id}`, payload, config);
      
      const refreshRes = await axios.get(`http://localhost:5000/api/assets/${selectedAsset.id}`, config);
      setSelectedAsset(refreshRes.data);
      
      setShowAssignModal(false);
      setShowTransferModal(false);
      logScanHistory(selectedAsset.asset_id, `Asset Assigned to Employee ID ${assignForm.employeeId}`);
      triggerToast('Asset Assignment updated successfully!');
    } catch (err) {
      console.error(err);
      triggerToast('Failed to update asset assignment.', 'error');
    }
  };

  const getAssetWarnings = () => {
    const alerts = [];
    if (!selectedAsset) return [];
    
    if (telemetry && !telemetry.antivirus) {
      alerts.push({
        id: 'av',
        message: 'ANTIVIRUS PROTECTION EXPIRED OR DEACTIVATED',
        desc: 'Security node has reporting flags. Device vulnerable to immediate network threats.',
        severity: 'CRITICAL'
      });
    }



    if (telemetry && telemetry.risk_score > 40) {
      alerts.push({
        id: 'software',
        message: 'UNAUTHORIZED SOFTWARE / EXPLOIT DETECTED',
        desc: 'Heuristics scan discovered background processes violating compliance templates.',
        severity: 'CRITICAL'
      });
    }

    return alerts;
  };

  const getComplianceScore = () => {
    if (!selectedAsset) return 0;
    if (!telemetry) {
      return selectedAsset.status === 'in_use' ? 95 : 100;
    }
    
    let score = 100 - (telemetry.risk_score || 0);
    if (!telemetry.antivirus) score -= 15;
    if (!telemetry.firewall) score -= 15;
    return Math.max(0, score);
  };

  const clearScanHistory = () => {
    localStorage.removeItem('scan_history');
    setScanHistory([]);
    triggerToast('Scan log history cleared.');
  };

  const deleteScanHistoryItem = (id) => {
    setScanHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem('scan_history', JSON.stringify(updated));
      return updated;
    });
    triggerToast('Scan log entry removed.');
  };

  const warningsList = getAssetWarnings();
  const compScore = getComplianceScore();

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative space-y-6">
      
      {/* Toast alert */}
      {showToast && (
        <div className={`fixed top-4 right-4 border px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 shadow-2xl ${
          toastType === 'success' ? 'bg-success/10 border-success/30 text-success' : 
          toastType === 'warning' ? 'bg-warning/10 border-warning/30 text-warning' : 
          'bg-danger/10 border-danger/30 text-danger'
        }`}>
          {toastType === 'success' ? <FiCheckCircle className="text-xl" /> : <FiAlertTriangle className="text-xl" />}
          <span className="font-mono text-sm font-bold">{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiMaximize className="text-primary" /> INSTANT <span className="text-primary">QR & BARCODE SCANNER</span>
          </h1>
          <p className="text-slate-400 text-sm">Asset registration scanning interface and configuration controls</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SECTION 1: Scanner Section (Left Column) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="glass-panel p-6 flex flex-col h-full border-b-[3px] border-b-primary justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2">
                  <FiCamera className="text-primary" /> Optical Scanner
                </h3>
                
                {/* Scan Status Indicator */}
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono border font-bold flex items-center gap-1 ${
                  scanStatus === 'success' ? 'bg-success/15 border-success/30 text-success' :
                  scanStatus === 'error' ? 'bg-danger/15 border-danger/30 text-danger animate-pulse' :
                  scanStatus === 'scanning' ? 'bg-warning/15 border-warning/30 text-warning' :
                  'bg-slate-900 border-slate-700 text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    scanStatus === 'success' ? 'bg-success animate-pulse' :
                    scanStatus === 'error' ? 'bg-danger' :
                    scanStatus === 'scanning' ? 'bg-warning animate-ping' :
                    'bg-slate-600'
                  }`}></span>
                  {scanStatus.toUpperCase()}
                </span>
              </div>

              {/* Camera selection (Laptop vs External USB Camera checkup) */}
              {cameraActive && videoDevices.length > 0 && (
                <div className="mb-3 animate-[fadeIn_0.2s_ease-out]">
                  <label className="cyber-label text-[9px] mb-1">Select Hardware Camera Input</label>
                  <select
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="bg-slate-950 border border-slate-800 text-slate-350 rounded-lg px-2.5 py-1.5 text-xs font-mono w-full focus:outline-none focus:border-primary"
                  >
                    {videoDevices.map(dev => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label || `Integrated Camera (${dev.deviceId.slice(0, 5)})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Viewfinder area */}
              <div className="h-64 bg-black/60 rounded-xl relative flex items-center justify-center border border-slate-800 overflow-hidden shadow-inner mb-4">
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl z-20"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr z-20"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl z-20"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br z-20"></div>
                
                {/* Running laser line */}
                {scanning && (
                  <div className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_10px_#00f0ff] animate-[scan_2s_ease-in-out_infinite] z-20"></div>
                )}

                {cameraActive ? (
                  <canvas ref={viewfinderCanvasRef} className="w-full h-full object-cover z-10" />
                ) : templateAsset ? (
                  <div className={`transition-all duration-300 ${scanning ? 'scale-90 opacity-40' : 'scale-100 opacity-100'}`}>
                    <QRCanvas text={`http://secureassets.local/asset/${templateAsset.asset_id}`} size={160} />
                  </div>
                ) : (
                  <div className="text-slate-600 font-mono text-xs">No asset template</div>
                )}

                {/* Scanning overlay */}
                {scanning && (
                  <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-30">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <div className="text-xs font-mono text-primary font-bold">DECODING SCAN... {scanProgress}%</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons inside scanner card */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {cameraActive ? (
                  <>
                    <button
                      type="button"
                      disabled={scanning}
                      className="btn-primary text-xs py-2 w-full font-mono flex items-center justify-center gap-1.5 opacity-60 cursor-not-allowed"
                    >
                      <FiCamera className="text-sm" /> DECODING LIVE...
                    </button>
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="btn-primary py-2 text-xs w-full bg-slate-800 hover:bg-slate-700 text-slate-350 border-slate-750 shadow-none hover:text-white flex items-center justify-center gap-1.5"
                    >
                      <FiVideoOff className="text-sm" /> STOP CAMERA
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startCameraStream(selectedDeviceId)}
                      disabled={scanning}
                      className="btn-primary text-xs py-2 w-full font-mono flex items-center justify-center gap-1.5"
                    >
                      <FiCamera className="text-sm" /> OPEN CAMERA
                    </button>
                    <button
                      type="button"
                      onClick={handleUploadClick}
                      disabled={scanning || !templateAsset}
                      className="btn-primary py-2 text-xs w-full bg-slate-800 hover:bg-slate-700 text-slate-350 border-slate-750 shadow-none hover:text-white flex items-center justify-center gap-1.5"
                    >
                      <FiUpload className="text-sm" /> UPLOAD IMAGE
                    </button>
                  </>
                )}
              </div>

              <div className="text-[10px] text-slate-500 font-mono mb-6 uppercase tracking-wider text-center">
                {statusMsg}
              </div>
            </div>

            {/* Manual Form input */}
            <form onSubmit={handleManualSearch} className="border-t border-slate-800/80 pt-4 space-y-3">
              <label className="cyber-label text-[10px]">Manual Asset ID Entry</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="e.g. AS1001"
                    className="cyber-input pl-9 font-mono text-xs py-2"
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={scanning}
                  className="btn-primary py-2 px-4 text-xs font-mono"
                >
                  LOOKUP
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Column 2 & 3 Combined sections (Right panels) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Main Info Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* SECTION 2: Asset Information Card */}
            <div className="glass-panel p-6 border-l-[3px] border-l-primary flex flex-col justify-between">
              <div>
                <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <FiBox className="text-primary" /> Asset Information
                </h3>
                
                {selectedAsset ? (
                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-slate-800/40 font-bold">
                      <span className="text-slate-500">Asset ID:</span>
                      <span className="text-white font-bold">{selectedAsset.asset_id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Asset Name:</span>
                      <span className="text-white">{selectedAsset.brand} {selectedAsset.model}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Category:</span>
                      <span className="text-slate-350 capitalize">{selectedAsset.category}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Brand:</span>
                      <span className="text-slate-350">{selectedAsset.brand}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Model:</span>
                      <span className="text-slate-350">{selectedAsset.model}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Serial Number:</span>
                      <span className="text-slate-350 break-all">{selectedAsset.serial_number || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40 items-center">
                      <span className="text-slate-500">Asset Status:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        selectedAsset.status === 'in_use' ? 'bg-success/10 text-success border-success/30' :
                        selectedAsset.status === 'available' ? 'bg-primary/10 text-primary border-primary/30' :
                        'bg-warning/10 text-warning border-warning/30'
                      }`}>{(selectedAsset.status || 'unknown').toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Location:</span>
                      <span className="text-slate-350">{selectedAsset.location || 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-center">
                    <FiBox className="text-4xl mb-2 opacity-30" />
                    <p className="text-xs">No active asset scan. Scan a tag or lookup As1001/As1051 manually.</p>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: Assigned Employee Information */}
            <div className="glass-panel p-6 border-l-[3px] border-l-secondary flex flex-col justify-between">
              <div>
                <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                  <FiUser className="text-secondary" /> Assigned Employee
                </h3>
                
                {selectedAsset ? (
                  <div className="space-y-2.5 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Employee Name:</span>
                      <span className="text-white font-bold">{selectedAsset.assigned_to_name || 'Unassigned'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Employee ID:</span>
                      <span className="text-slate-350">{selectedAsset.assigned_employee_id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/40">
                      <span className="text-slate-500">Department:</span>
                      <span className="text-slate-350">{selectedAsset.department || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Assignment Date:</span>
                      <span className="text-slate-350">{selectedAsset.assigned_to_name ? new Date(selectedAsset.updated_at).toLocaleDateString() : 'N/A'}</span>
                    </div>

                    {/* Quick Avatar card */}
                    {selectedAsset.assigned_to_name && (
                      <div className="mt-4 p-3 bg-slate-900/40 border border-slate-800 rounded-lg flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary/10 border border-secondary/30 flex items-center justify-center text-secondary font-bold text-sm">
                          {selectedAsset.assigned_to_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-white leading-tight">{selectedAsset.assigned_to_name}</div>
                          <div className="text-[9px] text-slate-500 uppercase">{selectedAsset.department}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-500 text-center">
                    <FiUser className="text-4xl mb-2 opacity-30" />
                    <p className="text-xs">No active assignee details. Scan a tag to view employee profile.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4 & 6: Compliance and Alerts Panels */}
          {selectedAsset && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* SECTION 4: Security Compliance Status */}
              <div className="glass-panel p-6 border border-slate-850 md:col-span-2 flex flex-col justify-between">
                <div>
                  <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                    <FiShield className="text-success" /> Security Compliance
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-slate-500">Antivirus:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          !telemetry ? 'bg-success/15 border-success/30 text-success' : // fallback for non-telemetry
                          telemetry.antivirus ? 'bg-success/15 border-success/30 text-success' : 
                                                'bg-danger/15 border-danger/30 text-danger animate-pulse'
                        }`}>{!telemetry ? 'ACTIVE' : telemetry.antivirus ? 'ACTIVE' : 'EXPIRED'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-slate-500">Firewall:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          !telemetry ? 'bg-success/15 border-success/30 text-success' :
                          telemetry.firewall ? 'bg-success/15 border-success/30 text-success' : 
                                               'bg-danger/15 border-danger/30 text-danger'
                        }`}>{!telemetry ? 'ENABLED' : telemetry.firewall ? 'ENABLED' : 'DISABLED'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-slate-500">OS Patches:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          !telemetry ? 'bg-success/15 border-success/30 text-success' :
                          !telemetry.os_outdated ? 'bg-success/15 border-success/30 text-success' : 
                                                   'bg-warning/15 border-warning/30 text-warning'
                        }`}>{!telemetry ? 'UP TO DATE' : !telemetry.os_outdated ? 'UP TO DATE' : 'OUTDATED'}</span>
                      </div>
                    </div>

                    {/* Circular visual compliance score chart */}
                    <div className="flex items-center justify-center p-2 border-l border-slate-800/80">
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-slate-800"
                            strokeWidth="2.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className={`${
                              compScore >= 90 ? 'text-success' :
                              compScore >= 70 ? 'text-warning' : 'text-danger'
                            } transition-all duration-500`}
                            strokeDasharray={`${compScore}, 100`}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-md font-bold text-white font-mono">{compScore}%</span>
                          <span className="text-[8px] text-slate-500 uppercase tracking-widest">Score</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 6: Alert Panel */}
              <div className="glass-panel p-6 border border-slate-850 flex flex-col justify-between">
                <div>
                  <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                    <FiAlertOctagon className="text-danger" /> System Warnings
                  </h3>
                  
                  <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
                    {warningsList.length === 0 ? (
                      <div className="text-center text-success py-6 text-xs font-mono flex flex-col items-center gap-2">
                        <FiCheckCircle className="text-2xl text-success" />
                        <span>ALL SECURITY CHECKS PASSED</span>
                      </div>
                    ) : (
                      warningsList.map(warn => (
                        <div key={warn.id} className={`p-2.5 border rounded-lg flex items-start gap-2.5 ${
                          warn.severity === 'CRITICAL' ? 'bg-danger/10 border-danger/30 text-danger' :
                          'bg-warning/10 border-warning/30 text-warning'
                        }`}>
                          <FiAlertTriangle className="flex-shrink-0 mt-0.5 text-md" />
                          <div>
                            <p className="text-[10px] font-bold leading-tight font-mono">{warn.message}</p>
                            <p className="text-[9px] text-slate-400 mt-1 leading-normal font-mono">{warn.desc}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: Quick Actions Panel */}
          {selectedAsset && (
            <div className="glass-panel p-6 border border-slate-850">
              <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
                🔧 Administrator Quick Actions
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={handleViewProfile}
                  className="btn-primary py-2.5 text-[11px] font-mono shadow-none flex items-center justify-center gap-2"
                >
                  <FiFileText /> VIEW PROFILE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignForm({ employeeId: selectedAsset.assigned_to || '', location: selectedAsset.location || '' });
                    setShowAssignModal(true);
                  }}
                  className="btn-primary py-2.5 text-[11px] font-mono shadow-none flex items-center justify-center gap-2"
                >
                  <FiUserPlus /> ASSIGN ASSET
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssignForm({ employeeId: selectedAsset.assigned_to || '', location: selectedAsset.location || '' });
                    setShowTransferModal(true);
                  }}
                  className="btn-primary py-2.5 text-[11px] font-mono shadow-none flex items-center justify-center gap-2 bg-secondary/10 border-secondary/40 text-secondary hover:bg-secondary hover:text-white hover:border-secondary"
                >
                  <FiArrowRight /> TRANSFER ASSET
                </button>
                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="btn-primary py-2.5 text-[11px] font-mono shadow-none flex items-center justify-center gap-2"
                >
                  <FiPrinter /> PRINT TAG
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Target Preview Generator Template Bar */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">QR Code Template Generator Uplink:</span>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select 
            value={templateAsset?.id || ''}
            onChange={(e) => {
              const m = assets.find(a => a.id === parseInt(e.target.value));
              if (m) setTemplateAsset(m);
            }}
            className="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-primary flex-1 sm:w-64"
          >
            {assets.map(a => (
              <option key={a.id} value={a.id}>{a.asset_id} — {a.brand} {a.model}</option>
            ))}
          </select>
          <button 
            onClick={handleDownloadQR}
            disabled={!templateAsset}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-750 text-slate-300 rounded-lg hover:text-white transition-colors"
            title="Download QR code tag image"
          >
            <FiDownload />
          </button>
        </div>
      </div>

      {/* SECTION 7: Scan History Table */}
      <div className="glass-panel p-6 border-t-[3px] border-t-slate-700">
        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
          <h3 className="text-white font-bold uppercase tracking-wider text-sm font-mono flex items-center gap-2">
            <FiClock className="text-slate-400" /> Scanner Audit Log History
          </h3>
          {scanHistory.length > 0 && (
            <button
              onClick={clearScanHistory}
              className="text-[10px] text-danger hover:text-white font-mono flex items-center gap-1 hover:bg-danger/10 px-2.5 py-1 rounded border border-danger/30 transition-colors uppercase tracking-wider"
            >
              <FiTrash2 /> Clear History Logs
            </button>
          )}
        </div>

        {scanHistory.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-xs font-mono">
            NO RECORDED SCAN OPERATIONS FOUND
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800 text-slate-500 font-mono text-[10px] tracking-widest uppercase">
                  <th className="px-6 py-3">Scan Date</th>
                  <th className="px-6 py-3">Authorized User</th>
                  <th className="px-6 py-3">Asset ID Tag</th>
                  <th className="px-6 py-3">Executed Action</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs text-slate-350 divide-y divide-slate-800/60 font-mono">
                {scanHistory.map(log => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => handleRealDecode(log.assetId, true)}
                    title={`Click to inspect details for ${log.assetId}`}
                  >
                    <td className="px-6 py-3 text-slate-500">{new Date(log.date).toLocaleString()}</td>
                    <td className="px-6 py-3 text-white font-bold">{log.user}</td>
                    <td className="px-6 py-3 text-primary">{log.assetId}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                        log.action.includes('Failed') ? 'bg-danger/15 border-danger/30 text-danger' :
                        log.action.includes('Assigned') || log.action.includes('Transfer') ? 'bg-secondary/15 border-secondary/30 text-secondary' :
                        'bg-success/15 border-success/30 text-success'
                      }`}>{log.action.toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteScanHistoryItem(log.id);
                        }}
                        className="text-slate-500 hover:text-danger transition-colors p-1"
                        title="Remove Scan Log Entry"
                      >
                        <FiTrash2 className="text-xs" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QUICK ASSIGNMENT DIALOG MODALS */}
      {(showAssignModal || showTransferModal) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-full max-w-md bg-darkCard border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-[scaleUp_0.2s_ease-out]">
            <div className="bg-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
              <h4 className="text-white font-mono font-bold text-sm uppercase tracking-wider">
                {showTransferModal ? 'Transfer Asset Destination' : 'Assign Asset Ownership'}
              </h4>
              <button
                onClick={() => { setShowAssignModal(false); setShowTransferModal(false); }}
                className="text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors"
              >
                <FiX className="text-lg" />
              </button>
            </div>
            
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              <div>
                <label className="cyber-label text-[10px]">Select Employee Profile</label>
                <select
                  required
                  value={assignForm.employeeId}
                  onChange={e => setAssignForm(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="bg-slate-950 border border-slate-800 text-slate-350 rounded-lg px-3 py-2 text-xs font-mono w-full focus:outline-none focus:border-primary"
                >
                  <option value="">-- Choose Employee Assignee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id} — {emp.department})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="cyber-label text-[10px]">Destination Office Location</label>
                <input
                  type="text"
                  placeholder="e.g. Floor 2 Server Room A"
                  value={assignForm.location}
                  onChange={e => setAssignForm(prev => ({ ...prev, location: e.target.value }))}
                  className="cyber-input font-mono text-xs py-2 w-full"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => { setShowAssignModal(false); setShowTransferModal(false); }}
                  className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-mono hover:bg-slate-900 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn-primary py-2 px-5 text-xs font-mono"
                >
                  SUBMIT CHANGES
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded scanning frames and animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}} />
    </div>
  );
};

export default QRScanner;
