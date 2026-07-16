import { useState, useEffect, useRef } from 'react';
import { FiShield, FiCheckCircle, FiXCircle, FiInfo, FiActivity, FiUploadCloud, FiAlertTriangle, FiDownload, FiCheck, FiCpu, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import axios from 'axios';
import { socket } from '../../services/socket';
import { useNavigate } from 'react-router-dom';

const AUDIT_TEMPLATES = [
  {
    id: 'compliant',
    title: '✅ Compliant Client',
    desc: 'Windows 11 system with active antivirus/firewall, zero violations, and nominal resource levels.',
    data: {
      host_id: "AS1001",
      device_name: "Executive Dell Latitude",
      os_name: "Windows 11",
      os_version: "23H2 Enterprise",
      ip_address: "192.168.1.15",
      antivirus: true,
      firewall: true,
      cpu: 14.2,
      ram: 45.6,
      disk: 38.1,
      os_outdated: false,
      installed_apps: ["Google Chrome", "Slack", "Microsoft Teams", "VS Code"]
    }
  },
  {
    id: 'critical-risk',
    title: '⚠️ Critical Threat Host',
    desc: 'Workstation with disabled firewall, high RAM/CPU load, and dangerous software processes.',
    data: {
      host_id: "AS1051",
      device_name: "Developer Machine",
      os_name: "Ubuntu Linux",
      os_version: "22.04 LTS",
      ip_address: "192.168.1.85",
      antivirus: false,
      firewall: false,
      cpu: 82.5,
      ram: 91.8,
      disk: 74.3,
      os_outdated: false,
      usb_restricted: false,
      installed_apps: ["Google Chrome", "uTorrent", "wireshark", "keylogger"]
    }
  },
  {
    id: 'outdated-iot',
    title: '🛡️ Outdated FreeRTOS IoT',
    desc: 'Legacy IoT micro-controller running an outdated and vulnerable stack version.',
    data: {
      host_id: "AST-1088",
      device_name: "HVAC Thermostat Gateway",
      os_name: "FreeRTOS",
      os_version: "10.4.3",
      ip_address: "192.168.1.122",
      antivirus: true,
      firewall: true,
      cpu: 8.5,
      ram: 18.2,
      disk: 12.0,
      os_outdated: true,
      installed_apps: ["Modbus Controller", "Mqtt Broker"]
    }
  },
  {
    id: 'remote-control',
    title: '🌐 Remote Device Control',
    desc: 'System with active remote access sessions, open administrative ports, and TeamViewer/AnyDesk software.',
    data: {
      host_id: "AS1099",
      device_name: "Support Desk Station",
      os_name: "Windows 11",
      os_version: "22H2 Pro",
      ip_address: "192.168.1.99",
      antivirus: true,
      firewall: false,
      cpu: 32.8,
      ram: 58.1,
      disk: 44.5,
      os_outdated: false,
      installed_apps: ["Google Chrome", "TeamViewer", "AnyDesk", "VNC Server"]
    }
  },
  {
    id: 'invalid-schema',
    title: '❌ Schema Error Tester',
    desc: 'Payload containing invalid type formats to test structured backend validations.',
    data: {
      os_name: "Linux Server",
      antivirus: "not-a-boolean",
      cpu: 150.0,
      installed_apps: "should-be-array"
    }
  }
];

const ComplianceCenter = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('policies'); // 'policies' | 'vulnerabilities' | 'importer'
  const activeTabRef = useRef('policies'); // Bug #5 fix: ref always tracks latest tab for socket closures
  const [policies, setPolicies] = useState([]);
  const [, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLogs, setScanLogs] = useState([]);

  // Vulnerability states
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [loadingCves, setLoadingCves] = useState(false);

  // Importer states
  const [dragActive, setDragActive] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inputMode, setInputMode] = useState('upload'); // 'upload' | 'editor'
  
  // Advanced importer state
  const [auditHistory, setAuditHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [patchingState, setPatchingState] = useState({});
  const [modalPatchingState, setModalPatchingState] = useState({});
  const [selectedAuditIds, setSelectedAuditIds] = useState([]);
  const [jsonError, setJsonError] = useState(null);
  const [assetsList, setAssetsList] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  
  const [jsonInput, setJsonInput] = useState(JSON.stringify(AUDIT_TEMPLATES[0].data, null, 2));

  // Refresh states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [selectedCve, setSelectedCve] = useState(null);

  // Notification states
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success');

  const showNotification = (msg, type = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  useEffect(() => {
    fetchComplianceData();

    // Listen to WebSocket events to update stats & policies in real-time
    // Bug #5 fix: use activeTabRef instead of activeTab to avoid stale closure
    socket.on('live-update', () => {
      fetchComplianceData(true);
      if (activeTabRef.current === 'importer') fetchAuditHistory(true);
    });

    socket.on('security-alert', () => {
      fetchComplianceData(true);
      if (activeTabRef.current === 'importer') fetchAuditHistory(true);
    });

    socket.on('alert-resolved', () => {
      fetchComplianceData(true);
      if (activeTabRef.current === 'importer') fetchAuditHistory(true);
    });

    return () => {
      socket.off('live-update');
      socket.off('security-alert');
      socket.off('alert-resolved');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount once — socket handlers use ref so no re-registration needed


  useEffect(() => {
    if (activeTab === 'vulnerabilities') {
      fetchVulnerabilities();
    } else if (activeTab === 'importer') {
      fetchAuditHistory();
      fetchAssetsForImport();
    }
  }, [activeTab]);

  // Background auto-refresh loop (20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'policies') {
        fetchComplianceData(true);
      } else if (activeTab === 'vulnerabilities') {
        fetchVulnerabilities(true);
      } else if (activeTab === 'importer') {
        fetchComplianceData(true);
        fetchAuditHistory(true);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Fetch active policies and general dashboard counts
  const fetchComplianceData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const [policiesRes, statsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/security/compliance', config),
        axios.get('http://localhost:5000/api/dashboard/stats', config)
      ]);

      // If a policy is currently inspected, update its instance too
      if (selectedPolicy) {
        const updatedPolicy = policiesRes.data.find(p => p.id === selectedPolicy.id);
        if (updatedPolicy) setSelectedPolicy(updatedPolicy);
      }

      setPolicies(policiesRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Error fetching compliance data:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch vulnerabilities catalogue
  const fetchVulnerabilities = async (silent = false) => {
    if (!silent) setLoadingCves(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/security/vulnerabilities', config);

      // If a CVE is currently inspected, update its instance too
      if (selectedCve) {
        const updatedCve = res.data.find(c => c.id === selectedCve.id);
        if (updatedCve) setSelectedCve(updatedCve);
      }

      setVulnerabilities(res.data);
    } catch (err) {
      console.error("Error fetching vulnerabilities:", err);
      if (!silent) showNotification('Failed to fetch vulnerabilities catalog.', 'error');
    } finally {
      if (!silent) setLoadingCves(false);
    }
  };

  // Trigger compliance audit check on all devices
  const handleScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanLogs(["[DAEMON] Compliance audit process spawned...", "[DAEMON] Connecting to PostgreSQL schema..."]);
    
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const apiPromise = axios.post('http://localhost:5000/api/security/compliance/scan', {}, config);
      
      const logs = [
        "Verifying EDR/Antivirus status logs...",
        "Validating operating system patch indexes...",
        "Analyzing active software processes against blacklist...",
        "Validating IAM permissions & password rotation guidelines...",
        "Analyzing open threats from Incident Matrix...",
        "Generating cryptographic report summary..."
      ];

      for (let i = 0; i < logs.length; i++) {
        await new Promise(r => setTimeout(r, 350));
        setScanProgress(Math.round(((i + 0.5) / (logs.length + 1)) * 100));
        setScanLogs(prev => [...prev, `[AUDIT] ${logs[i]}`]);
      }
      
      const response = await apiPromise;
      setScanProgress(90);
      
      if (response.data && response.data.logs) {
        response.data.logs.forEach(log => {
          setScanLogs(prev => [...prev, log]);
        });
      }
      
      await new Promise(r => setTimeout(r, 200));
      setScanProgress(100);
      setScanLogs(prev => [...prev, "[DAEMON] Compliance Scan successfully resolved. Policies synced."]);
      
      await fetchComplianceData();
      if (activeTab === 'vulnerabilities') fetchVulnerabilities();
    } catch (err) {
      console.error(err);
      setScanLogs(prev => [...prev, "[ERR] Compliance Scan failed! Contact systems administration."]);
      setScanProgress(100);
    } finally {
      setTimeout(() => {
        setIsScanning(false);
      }, 1000);
    }
  };

  // Drag and Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await handleFileProcess(e.target.files[0]);
    }
  };

  // Fetch recent safety checks log history
  const fetchAuditHistory = async (silent = false) => {
    if (!silent) setLoadingHistory(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/security/audit-history', config);
      setAuditHistory(res.data);
    } catch (err) {
      console.error("Error fetching audit history:", err);
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  };

  const fetchAssetsForImport = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const [assetsRes, telemetryRes] = await Promise.all([
        axios.get('http://localhost:5000/api/assets?limit=100', config),
        axios.get('http://localhost:5000/api/telemetry/latest', config)
      ]);
      
      const list = assetsRes.data.data || assetsRes.data || [];
      const telemsList = telemetryRes.data || [];
      
      // Combine them uniquely by ID
      const deviceMap = new Map();
      
      // Add registered assets
      list.forEach(a => {
        if (a.asset_id) {
          deviceMap.set(a.asset_id, {
            id: a.asset_id,
            label: `${a.asset_id} — ${a.brand} ${a.model} (Registered)`,
            type: 'registered'
          });
        }
      });
      
      // Add live telemetry devices
      telemsList.forEach(t => {
        if (t.device_id) {
          const existing = deviceMap.get(t.device_id);
          if (existing) {
            // Upgrade label to show it is both registered and active
            deviceMap.set(t.device_id, {
              ...existing,
              label: `${t.device_id} — ${t.device_name || 'Active Host'} (Registered & Online)`,
              type: 'both'
            });
          } else {
            deviceMap.set(t.device_id, {
              id: t.device_id,
              label: `${t.device_id} — ${t.device_name || 'Active Host'} (Live Telemetry)`,
              type: 'live'
            });
          }
        }
      });
      
      const combined = Array.from(deviceMap.values());
      setAssetsList(combined);
      
      if (combined.length > 0 && !selectedAssetId) {
        setSelectedAssetId(combined[0].id);
      }
    } catch (err) {
      console.error("Failed to load assets and live telemetry devices list for importer:", err);
    }
  };

  const handleAssetSelect = (assetId) => {
    setSelectedAssetId(assetId);
    if (!assetId) return;
    try {
      const currentPayload = JSON.parse(jsonInput);
      currentPayload.host_id = assetId;
      setJsonInput(JSON.stringify(currentPayload, null, 2));
    } catch {
      const defaultData = { ...AUDIT_TEMPLATES[0].data, host_id: assetId };
      setJsonInput(JSON.stringify(defaultData, null, 2));
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'policies') {
        await fetchComplianceData();
      } else if (activeTab === 'vulnerabilities') {
        await fetchVulnerabilities();
      } else if (activeTab === 'importer') {
        await Promise.all([fetchComplianceData(), fetchAuditHistory(), fetchAssetsForImport()]);
      }
      showNotification('✓ System state refreshed.');
    } catch (err) {
      console.error("Manual refresh error:", err);
      showNotification('Failed to refresh system state.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Real-time JSON format validator
  const validateJsonInput = (val) => {
    if (!val.trim()) {
      setJsonError("Payload content is empty.");
      return false;
    }
    try {
      JSON.parse(val);
      setJsonError(null);
      return true;
    } catch (err) {
      setJsonError(`Invalid JSON format: ${err.message}`);
      return false;
    }
  };

  const handleSelectTemplate = (template) => {
    const dataWithSelectedAsset = { ...template.data };
    if (selectedAssetId && template.id !== 'invalid-schema') {
      dataWithSelectedAsset.host_id = selectedAssetId;
    }
    const jsonStr = JSON.stringify(dataWithSelectedAsset, null, 2);
    setJsonInput(jsonStr);
    setInputMode('editor');
    validateJsonInput(jsonStr);
    showNotification(`Loaded template: ${template.title}`);
  };

  const handleSelectHistory = (audit) => {
    try {
      const parsedDetails = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
      setUploadResult({
        host_id: audit.entity_id,
        risk_score: parsedDetails.risk_score,
        risk_level: parsedDetails.risk_level,
        violations: parsedDetails.violations || [],
        details: parsedDetails,
        scan_time: audit.created_at
      });
      showNotification(`Loaded details for host ${audit.entity_id}`);
    } catch (err) {
      console.error("Failed to parse history details:", err);
    }
  };

  const getRemediationType = (policyName) => {
    const name = policyName.toLowerCase();
    if (name.includes("antivirus")) return "antivirus";
    if (name.includes("firewall")) return "firewall";
    if (name.includes("patch") || name.includes("update")) return "os_patch";
    if (name.includes("usb") || name.includes("storage restriction")) return "usb_restrict";
    if (name.includes("unauthorized") || name.includes("software")) return "kill_apps";
    return null;
  };

  const handleRunRemediation = async (hostId, violationType) => {
    const actionLabel = 
      violationType === 'antivirus' ? 'Enable Antivirus' :
      violationType === 'firewall' ? 'Enable Firewall' :
      violationType === 'os_patch' ? 'Apply OS Hotfix' :
      violationType === 'kill_apps' ? 'Terminate Blacklisted Processes' :
      violationType === 'usb_restrict' ? 'Block USB Ports / Restrict Storage' : 'Apply Remediation';

    if (!window.confirm(`Are you sure you want to trigger "${actionLabel}" on device "${hostId}"?`)) {
      return;
    }

    const patchKey = `${hostId}-${violationType}`;
    setPatchingState(prev => ({ ...prev, [patchKey]: 'running' }));
    
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      await axios.post(`http://localhost:5000/api/telemetry/device/${hostId}/remediate`, { type: violationType }, config);
      
      setPatchingState(prev => ({ ...prev, [patchKey]: 'done' }));
      showNotification(`✓ Synced & Patched: ${violationType} successfully resolved on ${hostId}`);
      
      // Update uploadResult violations and detail flags optimistically (Bug #8 fix: no local risk calc)
      setUploadResult(prev => {
        if (!prev || prev.host_id !== hostId) return prev;
        
        // Update boolean flags for immediate visual feedback
        const updatedDetails = { ...prev.details };
        if (violationType === 'antivirus') updatedDetails.antivirus = true;
        if (violationType === 'firewall') updatedDetails.firewall = true;
        if (violationType === 'os_patch') updatedDetails.os_outdated = false;
        if (violationType === 'kill_apps') updatedDetails.unauthorized_software_found = false;
        if (violationType === 'usb_restrict') updatedDetails.usb_restricted = true;
        
        // Remove resolved violations from the list
        const updatedViolations = prev.violations.filter(v => {
          if (violationType === 'antivirus' && v.toLowerCase().includes('antivirus')) return false;
          if (violationType === 'firewall' && v.toLowerCase().includes('firewall')) return false;
          if (violationType === 'os_patch' && (v.toLowerCase().includes('operating system') || v.toLowerCase().includes('outdated os'))) return false;
          if (violationType === 'kill_apps' && v.toLowerCase().includes('blacklisted')) return false;
          if (violationType === 'usb_restrict' && (v.toLowerCase().includes('usb') || v.toLowerCase().includes('unrestricted'))) return false;
          return true;
        });
        
        // Note: risk_score and risk_level are NOT recalculated here (Bug #8 fix).
        // Backend formula differs from frontend. The score will update via the next WebSocket push.
        return {
          ...prev,
          violations: updatedViolations,
          details: updatedDetails
        };
      });
      
      // Auto refresh compliance status
      fetchComplianceData(true);
      fetchAuditHistory(true);
    } catch (err) {
      console.error("Remediation call failed:", err);
      setPatchingState(prev => ({ ...prev, [patchKey]: 'idle' }));
      showNotification('Failed to apply remediation.', 'error');
    }
  };

  const handleModalRemediation = async (deviceId, violationType) => {
    const actionLabel = 
      violationType === 'antivirus' ? 'Enable Antivirus' :
      violationType === 'firewall' ? 'Enable Firewall' :
      violationType === 'os_patch' ? 'Apply OS Hotfix' :
      violationType === 'kill_apps' ? 'Terminate Blacklisted Processes' :
      violationType === 'usb_restrict' ? 'Block USB Ports / Restrict Storage' : 'Apply Remediation';

    if (!window.confirm(`Are you sure you want to trigger "${actionLabel}" on device "${deviceId}"?`)) {
      return;
    }

    const patchKey = `${deviceId}-${violationType}`;
    setModalPatchingState(prev => ({ ...prev, [patchKey]: 'running' }));
    
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      await axios.post(`http://localhost:5000/api/telemetry/device/${deviceId}/remediate`, { type: violationType }, config);
      
      setModalPatchingState(prev => ({ ...prev, [patchKey]: 'done' }));
      showNotification(`✓ Synced & Patched: ${violationType} successfully resolved on ${deviceId}`);
      
      // Auto refresh compliance status
      fetchComplianceData(true);
      fetchAuditHistory(true);
    } catch (err) {
      console.error("Remediation call failed:", err);
      setModalPatchingState(prev => ({ ...prev, [patchKey]: 'idle' }));
      showNotification('Failed to apply remediation.', 'error');
    }
  };

  const handleDeleteAuditLog = async (id, e) => {
    e.stopPropagation(); // prevent loading details in right panel when clicking delete
    if (!window.confirm("Are you sure you want to delete this safety check import log entry?")) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete(`http://localhost:5000/api/security/audit-log/${id}`, config);
      showNotification("✓ Audit log entry deleted successfully.");
      
      // Update local state
      setAuditHistory(prev => prev.filter(item => item.id !== id));
      setSelectedAuditIds(prev => prev.filter(checkedId => checkedId !== id));
      
      // If the currently displayed report is this device's, clear the right panel
      const deletedEntry = auditHistory.find(item => item.id === id);
      if (uploadResult && deletedEntry && uploadResult.host_id === deletedEntry.entity_id) {
        setUploadResult(null);
      }
    } catch (err) {
      console.error("Failed to delete audit log:", err);
      showNotification("Failed to delete audit log entry.", "error");
    }
  };

  const handleDeleteSelectedAuditLogs = async () => {
    if (selectedAuditIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedAuditIds.length} selected safety check import logs?`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.post("http://localhost:5000/api/security/audit-logs/delete-bulk", { ids: selectedAuditIds }, config);
      showNotification(`✓ Successfully deleted ${selectedAuditIds.length} audit log entries.`);
      
      // Update local state
      setAuditHistory(prev => prev.filter(item => !selectedAuditIds.includes(item.id)));
      
      // Clear selected list
      setSelectedAuditIds([]);
      
      // If the currently displayed report's entity is in the deleted set, clear it
      const deletedEntities = auditHistory.filter(item => selectedAuditIds.includes(item.id)).map(item => item.entity_id);
      if (uploadResult && deletedEntities.includes(uploadResult.host_id)) {
        setUploadResult(null);
      }
    } catch (err) {
      console.error("Failed to perform bulk delete:", err);
      showNotification("Failed to delete selected audit logs.", "error");
    }
  };

  const handleSelectAllAudits = (e) => {
    if (e.target.checked) {
      setSelectedAuditIds(auditHistory.map(item => item.id));
    } else {
      setSelectedAuditIds([]);
    }
  };

  const handleSelectAudit = (id, checked) => {
    if (checked) {
      setSelectedAuditIds(prev => [...prev, id]);
    } else {
      setSelectedAuditIds(prev => prev.filter(checkedId => checkedId !== id));
    }
  };

  // Parse and upload drag-and-dropped JSON audit files
  const handleFileProcess = async (file) => {
    if (file.type !== "application/json" && !file.name.endsWith('.json')) {
      setUploadError("Invalid file type. Please upload a valid JSON audit file.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const payload = JSON.parse(event.target.result);
          const token = localStorage.getItem('token');
          const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
          
          const res = await axios.post('http://localhost:5000/api/security/audit-upload', payload, config);
          setUploadResult(res.data);
          showNotification('✓ Audit file successfully processed and saved.');
          fetchComplianceData();
          fetchAuditHistory();
        } catch {
          setUploadError("Malformed JSON file. Ensure correct key-value structuring.");
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setUploadError(err.response?.data?.error || "Failed to import audit configuration.");
      setIsUploading(false);
    }
  };


  const handlePayloadSubmit = async () => {
    if (!validateJsonInput(jsonInput)) {
      showNotification("Please resolve JSON syntax errors first.", "error");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const payload = JSON.parse(jsonInput);
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.post('http://localhost:5000/api/security/audit-upload', payload, config);
      setUploadResult(res.data);
      showNotification('✓ Audit payload successfully processed and saved.');
      fetchComplianceData();
      fetchAuditHistory();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.details) {
        setUploadError(`Failed: ${err.response.data.details.join(" | ")}`);
      } else {
        setUploadError(err.response?.data?.error || "Malformed JSON payload structure. Please verify formatting.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const complianceVal = policies.length > 0
    ? Math.round(policies.reduce((sum, p) => sum + (p.pass_rate || 0), 0) / policies.length)
    : 100;

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">
      {/* Toast Notification */}
      {showToast && (
        <div className={`absolute top-0 right-0 px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 border font-mono text-sm ${toastType === 'error' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'}`}>
          {toastType === 'error' ? <FiAlertTriangle className="text-xl" /> : <FiCheckCircle className="text-xl" />}
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiShield className="text-primary" /> SECURITY <span className="text-primary">RULE CENTER</span>
          </h1>
          <p className="text-slate-400 text-sm">Check security rules, known system risks, and import device health logs</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleManualRefresh} 
            disabled={isRefreshing || loading || loadingCves || loadingHistory}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Refresh Data"
          >
            <FiRefreshCw className={`text-base ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button onClick={handleScan} className="btn-primary py-2 px-6">
            <FiActivity className="inline mr-2" /> CHECK ALL SECURITY RULES NOW
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 mb-6 gap-2">
        <button
          onClick={() => { setActiveTab('policies'); activeTabRef.current = 'policies'; }}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-all font-bold ${
            activeTab === 'policies'
              ? 'border-primary text-primary shadow-[0_4px_10px_-4px_rgba(0,240,255,0.4)] bg-primary/5'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          ✅ SECURITY RULES
        </button>
        <button
          onClick={() => { setActiveTab('vulnerabilities'); activeTabRef.current = 'vulnerabilities'; }}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-all font-bold ${
            activeTab === 'vulnerabilities'
              ? 'border-primary text-primary shadow-[0_4px_10px_-4px_rgba(0,240,255,0.4)] bg-primary/5'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          🛡️ KNOWN SYSTEM RISKS
        </button>
        <button
          onClick={() => { setActiveTab('importer'); activeTabRef.current = 'importer'; }}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-all font-bold ${
            activeTab === 'importer'
              ? 'border-primary text-primary shadow-[0_4px_10px_-4px_rgba(0,240,255,0.4)] bg-primary/5'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          📄 IMPORT SECURITY CHECKS
        </button>
      </div>

      {/* Policies Tab Content */}
      {activeTab === 'policies' && (
        <div className="flex flex-col lg:flex-row flex-1 gap-6 animate-[fadeIn_0.3s_ease-out]">
          {/* Policies List */}
          <div className="flex-1 glass-panel p-6 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
              <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <FiCheckCircle className="text-success" /> Active Security Rules
              </h3>
              <span className="text-xs font-mono text-primary border border-primary/30 bg-primary/10 px-2 py-1 rounded">SYSTEM ACTIVE</span>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {loading ? (
                <div className="flex justify-center items-center h-32">
                   <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : policies.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono">No security policies configured.</div>
              ) : (
                policies.map((policy, i) => (
                  <div 
                    key={i} 
                    onClick={() => setSelectedPolicy(policy)}
                    className="flex flex-col p-4 bg-slate-800/50 border border-slate-700 hover:border-primary/50 cursor-pointer transition-all rounded-lg group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-white font-bold text-sm mb-1 group-hover:text-primary transition-colors flex items-center gap-2">
                          {policy.name} <FiInfo className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />
                        </h4>
                        <p className="text-xs text-slate-400">{policy.description}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span className="text-[10px] font-mono text-slate-500">
                          {policy.passed_devices}/{policy.total_devices} devices
                        </span>
                        <div className="w-20 h-2 bg-slate-900 rounded-full overflow-hidden hidden sm:block">
                          <div 
                            className={`h-full transition-all duration-500 ${policy.pass_rate === 100 ? 'bg-success' : policy.pass_rate >= 50 ? 'bg-warning' : 'bg-danger'}`} 
                            style={{ width: `${policy.pass_rate}%` }}
                          ></div>
                        </div>
                        <span className={`font-bold font-mono text-xs ${policy.pass_rate === 100 ? 'text-success' : policy.pass_rate >= 50 ? 'text-warning' : 'text-danger'}`}>
                          {policy.pass_rate}%
                        </span>
                        {policy.pass_rate === 100 ? (
                          <FiCheckCircle className="text-success text-lg" />
                        ) : (
                          <FiXCircle className="text-danger text-lg" />
                        )}
                      </div>
                    </div>
                    
                    {policy.failing_devices && policy.failing_devices.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-700/40">
                        <span className="text-[9px] text-danger/80 uppercase font-mono tracking-wider font-bold">Violations Detected (Click to inspect):</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {policy.failing_devices.map((dev, idx) => (
                            <span key={idx} className="text-[9px] font-mono bg-danger/10 border border-danger/25 text-danger px-2 py-0.5 rounded" title={`${dev.device_name} (${dev.ip_address})`}>
                              {dev.device_id} ({dev.value})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Audit Score Panel */}
          <div className="w-full lg:w-80 glass-panel p-6 flex flex-col items-center text-center">
            <h3 className="text-white font-bold mb-8 uppercase tracking-wider text-sm w-full border-b border-slate-700 pb-4">
              Security Rules Passed
            </h3>
            
            <div className={`relative w-48 h-48 rounded-full border-8 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${complianceVal >= 90 ? 'border-success' : complianceVal >= 70 ? 'border-warning' : 'border-danger'}`}>
              <div className="text-center">
                <div className={`text-5xl font-bold font-mono ${complianceVal >= 90 ? 'text-success' : complianceVal >= 70 ? 'text-warning' : 'text-danger'}`}>
                  {complianceVal}%
                </div>
                <div className="text-xs text-slate-400 uppercase tracking-widest mt-2">Score</div>
              </div>
            </div>

            <div className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-lg flex items-start gap-3 text-left">
              <FiInfo className="text-primary mt-1 flex-shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                This score shows how many security rules your office devices are passing. A score above 90% is recommended.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Vulnerability Matrix Tab Content */}
      {activeTab === 'vulnerabilities' && (
        <div className="flex-1 glass-panel p-6 flex flex-col relative overflow-hidden animate-[fadeIn_0.3s_ease-out]">
          <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
            <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <FiAlertTriangle className="text-warning animate-pulse" /> Known Software Weaknesses & Threats
            </h3>
            <span className="text-xs font-mono text-slate-500 uppercase">Automatically updated from the global security database</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {loadingCves ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : vulnerabilities.length === 0 ? (
              <div className="text-center py-16 text-slate-500 font-mono">No vulnerabilities records initialized.</div>
            ) : (
              vulnerabilities.map((cve) => (
                <div 
                  key={cve.id} 
                  onClick={() => setSelectedCve(cve)}
                  className="p-5 bg-slate-800/40 border border-slate-700/80 rounded-lg hover:border-primary/50 cursor-pointer transition-all flex flex-col gap-4 group"
                >
                  <div className="flex flex-wrap justify-between items-start gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border mr-2 ${
                        cve.severity === 'CRITICAL' ? 'bg-danger/20 text-danger border-danger/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]' :
                        cve.severity === 'HIGH'     ? 'bg-warning/20 text-warning border-warning/40' :
                                                      'bg-primary/20 text-primary border-primary/40'
                      }`}>{cve.severity}</span>
                      <strong className="text-white font-mono text-sm group-hover:text-primary transition-colors flex items-center gap-2 inline-flex">
                        {cve.cve_id} <FiInfo className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />
                      </strong>
                      <span className="text-slate-400 text-xs ml-3 font-mono">Target: {cve.os_name} {cve.os_version}</span>
                    </div>
                    <span className="text-[10px] text-danger font-mono font-bold uppercase bg-danger/10 px-2.5 py-1 rounded border border-danger/30">
                      ⚠️ {cve.affected_count || 0} Unsafe Devices
                    </span>
                  </div>

                  <div>
                    <h4 className="text-white font-bold text-sm mb-1">{cve.title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">{cve.description}</p>
                    <div className="p-3 bg-darkBase/60 rounded border border-slate-700/50 flex items-start gap-2">
                      <FiCheck className="text-success mt-0.5 flex-shrink-0" />
                      <div className="text-xs">
                        <strong className="text-slate-300 block mb-1">Recommended Mitigation:</strong>
                        <span className="text-slate-400">{cve.mitigation}</span>
                      </div>
                    </div>
                  </div>

                  {cve.affected_devices?.length > 0 && (
                    <div className="mt-2 border-t border-slate-800/80 pt-3">
                      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block mb-2">Affected Devices (Click to inspect):</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {cve.affected_devices.map(dev => (
                          <div key={dev.device_id} className="p-2.5 bg-darkBase/40 rounded border border-slate-850 flex items-center justify-between text-xs">
                            <div>
                              <strong className="text-white block font-mono">{dev.device_id}</strong>
                              <span className="text-[10px] text-slate-500">{dev.os}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">{dev.ip_address}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Agent Importer Tab Content */}
      {activeTab === 'importer' && (
        <div className="flex-1 flex flex-col xl:flex-row gap-6 animate-[fadeIn_0.3s_ease-out] overflow-hidden">
          {/* Left panel: Templates + Uploader/Editor + Recent History */}
          <div className="flex-1 glass-panel p-6 flex flex-col overflow-y-auto custom-scrollbar min-h-[500px]">
            {/* Target Device Dropdown Selector */}
            <div className="mb-5 bg-slate-900/40 p-4 border border-slate-800/60 rounded-lg flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <div>
                <h4 className="text-white font-bold text-xs uppercase font-mono mb-1">Target Inspection Device</h4>
                <p className="text-slate-500 text-[9px] font-mono leading-normal">Select an asset from registry to automatically pre-populate the host ID.</p>
              </div>
              <select
                value={selectedAssetId}
                onChange={(e) => handleAssetSelect(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-350 rounded px-2.5 py-1.5 text-xs font-mono w-full sm:w-64 focus:outline-none focus:border-primary"
              >
                <option value="">-- Choose Target Device --</option>
                {assetsList.map(device => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Templates Library Section */}
            <div className="mb-6 border-b border-slate-800 pb-5">
              <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block mb-3">
                💡 Select a Pre-configured Safety Check Template to Load
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {AUDIT_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl)}
                    className="flex flex-col text-left p-3 bg-slate-800/20 hover:bg-slate-800/60 border border-slate-700/50 hover:border-primary/50 rounded-lg transition-all"
                  >
                    <strong className="text-xs text-white font-mono mb-1 flex items-center gap-1.5">
                      {tmpl.title}
                    </strong>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      {tmpl.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>


            {/* Importer Input Mode Selectors */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 mb-5 gap-3">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setInputMode('upload')} 
                  className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border rounded-lg transition-all font-bold ${inputMode === 'upload' ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                  📁 UPLOAD FILE
                </button>
                <button 
                  onClick={() => setInputMode('editor')} 
                  className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border rounded-lg transition-all font-bold ${inputMode === 'editor' ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                  ✍️ EDIT JSON
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <button 
                  onClick={() => navigate('/monitoring')}
                  className="text-xs font-mono text-success bg-success/10 border border-success/30 px-3 py-1.5 rounded flex items-center gap-2 hover:bg-success/20 transition-all cursor-pointer font-bold"
                >
                  <FiActivity /> LIVE DEVICE HEALTH
                </button>
                <button 
                  onClick={() => navigate('/threats')}
                  className="text-xs font-mono text-primary bg-primary/10 border border-primary/30 px-3 py-1.5 rounded flex items-center gap-2 hover:bg-primary/20 transition-all cursor-pointer font-bold"
                >
                  <FiShield /> EDR THREAT CENTER
                </button>
              </div>
            </div>

            {inputMode === 'upload' ? (
              /* Drag Area */
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`flex-1 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[200px] ${
                  dragActive ? 'border-primary bg-primary/10' : 'border-slate-700 bg-slate-800/20 hover:border-slate-500'
                }`}
              >
                <FiUploadCloud className={`text-5xl mb-4 ${dragActive ? 'text-primary scale-110' : 'text-slate-500'} transition-transform`} />
                <h4 className="text-white font-bold mb-2">Drag and drop your device health file here</h4>
                <p className="text-slate-500 text-xs mb-6 max-w-sm">These files are created by running our safety checks program on Windows, Mac, or Linux.</p>
                
                <label className="btn-primary cursor-pointer text-xs py-2 px-6">
                  CHOOSE REPORT FILE
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={handleFileInput}
                    className="hidden" 
                  />
                </label>
              </div>
            ) : (
              /* JSON Code Editor Area */
              <div className="flex-1 flex flex-col">
                <div className="flex bg-black/95 border border-slate-700 rounded-lg focus-within:border-primary overflow-hidden font-mono text-xs mb-3">
                  {/* Line numbers gutter */}
                  <div className="bg-slate-950/80 text-slate-600 select-none py-4 px-2.5 border-r border-slate-800 text-right min-w-[2.5rem] overflow-hidden leading-relaxed">
                    {jsonInput.split('\n').map((_, idx) => (
                      <div key={idx} style={{ height: '20px', lineHeight: '20px' }}>{idx + 1}</div>
                    ))}
                  </div>
                  {/* Editor Textarea */}
                  <textarea 
                    value={jsonInput} 
                    onChange={(e) => {
                      setJsonInput(e.target.value);
                      validateJsonInput(e.target.value);
                    }} 
                    className="w-full bg-transparent text-primary font-mono py-4 px-4 focus:outline-none resize-none overflow-y-auto leading-relaxed custom-scrollbar h-72" 
                    style={{ color: '#00f0ff', textShadow: '0 0 2px rgba(0, 240, 255, 0.2)', height: '288px', lineHeight: '20px' }}
                    placeholder="Paste JSON security report here..."
                  />
                </div>
                
                {jsonError && (
                  <div className="text-[10px] font-mono text-danger mb-3 flex items-center gap-1.5">
                    <span>❌</span> <span>{jsonError}</span>
                  </div>
                )}

                <button 
                  onClick={handlePayloadSubmit} 
                  disabled={isUploading || !!jsonError} 
                  className={`btn-primary w-full py-2.5 tracking-wider font-mono font-bold text-xs uppercase flex items-center justify-center gap-2 ${jsonError ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiCpu className={isUploading ? "animate-spin" : ""} /> EXECUTE PAYLOAD NOW
                </button>
              </div>
            )}

            {isUploading && (
              <div className="mt-4 p-4 bg-primary/10 border border-primary/25 rounded flex items-center justify-center gap-3 text-sm text-primary font-mono">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                Analyzing and digesting security attributes...
              </div>
            )}

            {uploadError && (
              <div className="mt-4 p-4 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-center gap-2 font-mono">
                <FiXCircle />
                {uploadError}
              </div>
            )}

            {/* Recent History log section */}
            <div className="mt-6 border-t border-slate-800/80 pt-5">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-white font-bold font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  🕒 Recent Safety Check Imports
                </h4>
                {selectedAuditIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelectedAuditLogs}
                    className="px-2.5 py-1 bg-danger/10 hover:bg-danger/25 text-danger font-mono text-[9px] uppercase tracking-wider rounded border border-danger/30 transition-all font-bold cursor-pointer flex items-center gap-1"
                  >
                    <FiTrash2 className="text-xs" /> Remove Selected ({selectedAuditIds.length})
                  </button>
                )}
              </div>
              
              {loadingHistory ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : auditHistory.length === 0 ? (
                <div className="text-center py-6 text-slate-500 font-mono text-[11px] border border-dashed border-slate-800 rounded-lg">
                  No recent safety check logs found.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-48 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left font-mono text-[10px]">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 border-b border-slate-800 w-8">
                          <input 
                            type="checkbox" 
                            checked={selectedAuditIds.length === auditHistory.length && auditHistory.length > 0}
                            onChange={handleSelectAllAudits}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 border-b border-slate-800">Time</th>
                        <th className="p-2.5 border-b border-slate-800">Host ID</th>
                        <th className="p-2.5 border-b border-slate-800">Risk</th>
                        <th className="p-2.5 border-b border-slate-800">Violations</th>
                        <th className="p-2.5 border-b border-slate-800">Operator</th>
                        <th className="p-2.5 border-b border-slate-800 text-center w-12">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {auditHistory.map((audit) => {
                        const details = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
                        const riskScore = details?.risk_score || 0;
                        const riskLevel = details?.risk_level || 'LOW';
                        const violationsCount = details?.violations_count || 0;
                        const isChecked = selectedAuditIds.includes(audit.id);
                        
                        return (
                          <tr 
                            key={audit.id} 
                            onClick={() => handleSelectHistory(audit)}
                            className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${isChecked ? 'bg-primary/5' : ''}`}
                          >
                            <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={(e) => handleSelectAudit(audit.id, e.target.checked)}
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="p-2.5 text-slate-400 whitespace-nowrap">
                              {new Date(audit.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </td>
                            <td className="p-2.5 font-bold text-white">{audit.entity_id}</td>
                            <td className="p-2.5">
                              <span className={`px-1.5 py-0.5 rounded font-bold ${
                                riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'bg-danger/10 text-danger border border-danger/25' :
                                riskLevel === 'MEDIUM' ? 'bg-warning/10 text-warning border border-warning/25' :
                                                         'bg-success/10 text-success border border-success/25'
                              }`}>
                                {riskScore}%
                              </span>
                            </td>
                            <td className="p-2.5">
                              {violationsCount > 0 ? (
                                <span className="text-danger font-bold">⚠️ {violationsCount} fail</span>
                              ) : (
                                <span className="text-success font-bold">✓ passed</span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-400 truncate max-w-[80px]">
                              {audit.user_name || 'System'}
                            </td>
                            <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={(e) => handleDeleteAuditLog(audit.id, e)}
                                className="text-slate-500 hover:text-danger transition-colors p-1"
                                title="Delete Log Entry"
                              >
                                <FiTrash2 className="text-xs" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Visualized report details with gauges & actions */}
          <div className="w-full xl:w-96 glass-panel p-6 flex flex-col min-h-[500px]">
            <h3 className="text-white font-bold mb-6 uppercase tracking-wider text-sm border-b border-slate-700 pb-4">
              Report Details
            </h3>

            {uploadResult ? (
              <div className="flex-1 flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out] overflow-y-auto pr-1 custom-scrollbar">
                {/* Device Title Card */}
                <div className="p-3 bg-darkBase/50 border border-slate-700/80 rounded-lg flex flex-col gap-1 text-center font-mono">
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest">Device Inspected</span>
                  <strong className="text-base text-white">{uploadResult.host_id}</strong>
                  <span className="text-[10px] text-slate-400">
                    {uploadResult.details?.os_name} {uploadResult.details?.os_version} | IP: {uploadResult.details?.ip_address}
                  </span>
                </div>

                {/* Score and Rating badges */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/30 p-3 rounded border border-slate-700/60 text-center">
                    <span className="text-[9px] text-slate-400 block uppercase font-mono">Risk Score</span>
                    <strong className={`text-xl font-mono ${
                      uploadResult.risk_score >= 75 ? 'text-danger' :
                      uploadResult.risk_score >= 45 ? 'text-warning' :
                                                       'text-success'
                    }`}>{uploadResult.risk_score} / 100</strong>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded border border-slate-700/60 text-center">
                    <span className="text-[9px] text-slate-400 block uppercase font-mono">Risk Rating</span>
                    <strong className={`text-xl font-mono ${
                      uploadResult.risk_level === 'CRITICAL' || uploadResult.risk_level === 'HIGH' ? 'text-danger' : 'text-success'
                    }`}>{uploadResult.risk_level}</strong>
                  </div>
                </div>

                {/* Hardware Resource progress bars */}
                {uploadResult.details && (
                  <div className="space-y-3 bg-slate-900/30 p-3 border border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block">
                      📊 Device Performance Metrics
                    </span>
                    
                    {/* CPU */}
                    {uploadResult.details.cpu !== undefined && (
                      <div>
                        <div className="flex justify-between text-[9px] font-mono mb-1">
                          <span className="text-slate-400">CPU Load</span>
                          <span className={uploadResult.details.cpu >= 80 ? 'text-danger font-bold' : 'text-slate-300'}>
                            {uploadResult.details.cpu}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${uploadResult.details.cpu >= 80 ? 'bg-danger' : uploadResult.details.cpu >= 50 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${uploadResult.details.cpu}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* RAM */}
                    {uploadResult.details.ram !== undefined && (
                      <div>
                        <div className="flex justify-between text-[9px] font-mono mb-1">
                          <span className="text-slate-400">RAM Usage</span>
                          <span className={uploadResult.details.ram >= 85 ? 'text-danger font-bold' : 'text-slate-300'}>
                            {uploadResult.details.ram}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${uploadResult.details.ram >= 85 ? 'bg-danger' : uploadResult.details.ram >= 60 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${uploadResult.details.ram}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Disk */}
                    {uploadResult.details.disk !== undefined && (
                      <div>
                        <div className="flex justify-between text-[9px] font-mono mb-1">
                          <span className="text-slate-400">Disk Capacity</span>
                          <span className={uploadResult.details.disk >= 90 ? 'text-danger font-bold' : 'text-slate-300'}>
                            {uploadResult.details.disk}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${uploadResult.details.disk >= 90 ? 'bg-danger' : uploadResult.details.disk >= 70 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${uploadResult.details.disk}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* EDR Status Checklist */}
                {uploadResult.details && (
                  <div className="grid grid-cols-1 gap-1.5 bg-slate-900/20 p-2 border border-slate-800 rounded-lg">
                    <div className="flex items-center justify-between p-2 bg-slate-800/40 rounded text-[11px] font-mono">
                      <span className="text-slate-400">Antivirus EDR</span>
                      {uploadResult.details.antivirus ? (
                        <span className="text-success font-bold">✓ ENABLED</span>
                      ) : (
                        <span className="text-danger font-bold">✗ INACTIVE</span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between p-2 bg-slate-800/40 rounded text-[11px] font-mono">
                      <span className="text-slate-400">Firewall Protection</span>
                      {uploadResult.details.firewall ? (
                        <span className="text-success font-bold">✓ ACTIVE</span>
                      ) : (
                        <span className="text-danger font-bold">✗ DISABLED</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 bg-slate-800/40 rounded text-[11px] font-mono">
                      <span className="text-slate-400">Operating System Patch</span>
                      {!uploadResult.details.os_outdated ? (
                        <span className="text-success font-bold">✓ UP TO DATE</span>
                      ) : (
                        <span className="text-danger font-bold">⚠️ OUTDATED</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Security Violations list with auto-remediation triggers */}
                <div className="flex-1 bg-slate-900/40 p-4 border border-slate-800 rounded-lg">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-bold block mb-3 font-mono">
                    🛡️ System Intervention Center
                  </span>
                  {uploadResult.violations?.length === 0 ? (
                    <div className="flex items-center gap-2 text-success font-mono text-[11px] p-3 bg-success/5 border border-success/20 rounded">
                      <FiCheckCircle /> System matches compliance checklist parameters. No action needed.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {uploadResult.violations.map((v, i) => {
                        let remediationText;
                        let actionLabel;
                        let patchType = "";
                        
                        if (v.toLowerCase().includes("antivirus")) {
                          remediationText = "Enable Windows Defender/Real-time agent checks.";
                          actionLabel = "Enable Antivirus";
                          patchType = "antivirus";
                        } else if (v.toLowerCase().includes("firewall")) {
                          remediationText = "Start inbound/outbound connection protection.";
                          actionLabel = "Start Firewall";
                          patchType = "firewall";
                        } else if (v.toLowerCase().includes("operating system") || v.toLowerCase().includes("outdated os")) {
                          remediationText = "Deploy remote cumulative hotfix patch updates.";
                          actionLabel = "Run Auto-Patch";
                          patchType = "os_patch";
                        } else if (v.toLowerCase().includes("blacklisted")) {
                          remediationText = "Terminate unauthorized P2P background threads.";
                          actionLabel = "Kill Processes";
                          patchType = "kill_apps";
                        } else {
                          remediationText = "Apply custom corporate security guidelines.";
                          actionLabel = "Enforce Rules";
                          patchType = "general";
                        }
                        
                        const patchKey = `${uploadResult.host_id}-${patchType}`;
                        const currentPatchState = patchingState[patchKey] || 'idle';
                        
                        return (
                          <div key={i} className="p-3 bg-danger/5 border border-danger/25 rounded-lg flex flex-col gap-2">
                            <div className="flex items-start gap-2 text-[11px] text-danger font-mono font-bold leading-tight">
                              <span>⚠️</span>
                              <span>{v}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono pl-5 leading-normal">
                              {remediationText}
                            </p>
                            <div className="pl-5 mt-1">
                              {currentPatchState === 'idle' && (
                                <button 
                                  onClick={() => handleRunRemediation(uploadResult.host_id, patchType)}
                                  className="px-2.5 py-1 bg-danger/10 hover:bg-danger/25 text-danger font-mono text-[9px] uppercase tracking-wider rounded border border-danger/30 transition-all font-bold"
                                >
                                  🛠️ {actionLabel}
                                </button>
                              )}
                              {currentPatchState === 'running' && (
                                <span className="flex items-center gap-1.5 text-warning font-mono text-[9px] uppercase tracking-wider">
                                  <span className="w-2.5 h-2.5 border border-warning border-t-transparent rounded-full animate-spin"></span>
                                  Patching...
                                </span>
                              )}
                              {currentPatchState === 'done' && (
                                <span className="text-success font-mono text-[9px] uppercase tracking-wider font-bold flex items-center gap-1">
                                  ✓ Synced & Patched
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-500 p-6 border border-dashed border-slate-800 rounded-lg">
                <FiCpu className="text-4xl mb-3 opacity-30" />
                <p className="text-xs font-mono">Ready to process security audit logs.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPLIANCE SCANNING MODAL ────────────────────────────────────── */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="glass-panel w-full max-w-xl p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,240,255,0.4)]">
            <h2 className="text-2xl font-bold text-white mb-6 font-mono flex items-center gap-2">
              <FiActivity className="text-primary animate-pulse" /> RUNNING SAFETY CHECKS...
            </h2>
            <div className="space-y-6">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
                  <span>CHECKING ALL COMPUTERS & SECURITY RULES</span>
                  <span>{scanProgress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.5)]" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              {/* Progress Terminal Logs */}
              <div className="bg-black/90 rounded border border-slate-800 p-4 h-48 overflow-y-auto font-mono text-xs text-primary space-y-1">
                {scanLogs.map((log, idx) => (
                  <div key={idx} className={log.includes('successfully') || log.includes('synced') ? 'text-success' : log.includes('ERR') ? 'text-danger' : 'text-primary'}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Policy Details Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]" onClick={() => setSelectedPolicy(null)}>
          <div className="glass-panel w-full max-w-2xl p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,240,255,0.3)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPolicy(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <FiXCircle className="text-2xl" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono flex items-center gap-3">
              <FiShield className="text-primary" /> POLICY DETAILS
            </h2>
            <div className="border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white mb-1">{selectedPolicy.name}</h3>
              <p className="text-xs text-slate-400">{selectedPolicy.description}</p>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800/40 border border-slate-700/50 p-3 rounded text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Category</span>
                <strong className="text-sm text-primary font-mono">{selectedPolicy.category || 'GENERAL'}</strong>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 p-3 rounded text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Pass Rate</span>
                <strong className={`text-lg font-mono ${selectedPolicy.pass_rate === 100 ? 'text-success' : selectedPolicy.pass_rate >= 50 ? 'text-warning' : 'text-danger'}`}>{selectedPolicy.pass_rate}%</strong>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 p-3 rounded text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Devices Passed</span>
                <strong className="text-lg font-mono text-white">{selectedPolicy.passed_devices} / {selectedPolicy.total_devices}</strong>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
                Compliance Inspection Results
              </h4>
              
              {selectedPolicy.failing_devices && selectedPolicy.failing_devices.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  <span className="text-[10px] text-danger font-mono font-bold uppercase tracking-wider block">⚠️ Failing Devices ({selectedPolicy.failing_devices.length})</span>
                  {selectedPolicy.failing_devices.map((dev, idx) => (
                    <div key={idx} className="p-3 bg-danger/5 border border-danger/20 rounded flex items-center justify-between gap-4">
                      <div>
                        <strong className="text-white font-mono text-xs block">{dev.device_name} ({dev.device_id})</strong>
                        <span className="text-[10px] text-slate-500 font-mono">IP: {dev.ip_address}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded uppercase font-bold">
                          {dev.value}
                        </span>
                        {getRemediationType(selectedPolicy.name) && (
                          <button
                            onClick={() => handleModalRemediation(dev.device_id, getRemediationType(selectedPolicy.name))}
                            disabled={modalPatchingState[`${dev.device_id}-${getRemediationType(selectedPolicy.name)}`] === 'running'}
                            className="px-2.5 py-1 bg-danger/10 hover:bg-danger/25 text-danger font-mono text-[9px] uppercase tracking-wider rounded border border-danger/30 transition-all font-bold cursor-pointer"
                          >
                            {modalPatchingState[`${dev.device_id}-${getRemediationType(selectedPolicy.name)}`] === 'running' ? 'Patching...' : 
                             modalPatchingState[`${dev.device_id}-${getRemediationType(selectedPolicy.name)}`] === 'done' ? '✓ Patched' : '🛠️ Remediate'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-success font-mono text-xs border border-dashed border-success/20 rounded bg-success/5 flex items-center justify-center gap-2">
                  <FiCheckCircle /> All active system devices match this policy requirement.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CVE Details Modal */}
      {selectedCve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]" onClick={() => setSelectedCve(null)}>
          <div className="glass-panel w-full max-w-2xl p-6 relative border-t-4 border-t-warning shadow-[0_0_50px_rgba(245,158,11,0.2)]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedCve(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <FiXCircle className="text-2xl" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono flex items-center gap-3">
              <FiAlertTriangle className="text-warning animate-pulse" /> CVE THREAT INFORMATION
            </h2>
            <div className="border-b border-slate-800 pb-4 mb-4 flex justify-between items-start gap-4">
              <div>
                <strong className="text-base text-white font-mono block mb-1">{selectedCve.cve_id}</strong>
                <h3 className="text-sm font-bold text-slate-350">{selectedCve.title}</h3>
              </div>
              <span className={`text-[10px] font-mono px-2 py-1 rounded font-bold border ${
                selectedCve.severity === 'CRITICAL' ? 'bg-danger/20 text-danger border-danger/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]' :
                selectedCve.severity === 'HIGH'     ? 'bg-warning/20 text-warning border-warning/40' :
                                                      'bg-primary/20 text-primary border-primary/40'
              }`}>{selectedCve.severity}</span>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Target Operating System</span>
                <span className="text-slate-300">{selectedCve.os_name} {selectedCve.os_version}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Threat Description</span>
                <p className="text-slate-350 font-sans leading-relaxed text-xs p-3 bg-slate-900/40 border border-slate-850 rounded">{selectedCve.description}</p>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Required Remediation / Mitigation</span>
                <p className="text-slate-350 font-sans leading-relaxed text-xs p-3 bg-success/5 border border-success/20 rounded">{selectedCve.mitigation}</p>
              </div>

              {selectedCve.affected_devices && selectedCve.affected_devices.length > 0 && (
                <div>
                  <span className="text-[10px] text-danger uppercase tracking-widest font-bold block mb-2">Affected Active Assets ({selectedCve.affected_devices.length})</span>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                    {selectedCve.affected_devices.map(dev => (
                      <div key={dev.device_id} className="p-2 bg-slate-850 border border-slate-800 rounded flex items-center justify-between text-[11px]">
                        <div>
                          <strong className="text-white block font-mono">{dev.device_id}</strong>
                          <span className="text-[9px] text-slate-500">{dev.os}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-900/60 px-1.5 py-0.5 rounded">{dev.ip_address}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplianceCenter;
