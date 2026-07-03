import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FiBox, FiSearch, FiFilter, FiPlus, FiEdit2, FiTrash2, FiServer, FiAlertCircle, FiCheckCircle, FiDownload, FiPrinter, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import AddAssetModal from '../../components/AddAssetModal';
import QRCode from 'qrcode';
import { useLanguage } from '../../context/LanguageContext';

const AssetRegistry = () => {
  const { t } = useLanguage();
  const [assets, setAssets]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editAsset, setEditAsset]   = useState(null);
  const [showToast, setShowToast]   = useState(false);
  const [toastMsg, setToastMsg]     = useState('');
  const [toastType, setToastType]   = useState('success');
  const [activeTab, setActiveTab]   = useState('inventory'); // 'inventory' | 'financial'
  const [forecastData, setForecastData] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  // Refresh and QR Preview states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewingQrAsset, setViewingQrAsset] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const location = useLocation();

  // Dynamic parameters for depreciation & forecaster custom inputs
  const [slRate, setSlRate] = useState(25); 
  const [rbRate, setRbRate] = useState(30); 
  const [salvagePct, setSalvagePct] = useState(10); 
  const [lifespans, setLifespans] = useState({
    laptop: 4,
    server: 7,
    network: 5,
    mobile: 3,
    other: 5
  });
  const [showParams, setShowParams] = useState(false);

  const [financialCurrency, setFinancialCurrency] = useState('USD');
  const [excludeRetired, setExcludeRetired] = useState(false);
  const [strictDepreciation, setStrictDepreciation] = useState(false);
  const [onlyDueReplacement, setOnlyDueReplacement] = useState(false);

  const currencyRates = {
    USD: { symbol: '$', rate: 1.0 },
    LKR: { symbol: 'Rs. ', rate: 300.0 },
    EUR: { symbol: '€', rate: 0.92 },
    GBP: { symbol: '£', rate: 0.78 },
    JPY: { symbol: '¥', rate: 155.0 },
    AUD: { symbol: 'A$', rate: 1.50 }
  };

  const getT = (key) => t(key);

  const formatCost = (val) => {
    const currencyInfo = currencyRates[financialCurrency] || { symbol: '$', rate: 1.0 };
    const converted = parseFloat(val || 0) * currencyInfo.rate;
    return `${currencyInfo.symbol}${converted.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  };

  // Recalculate straight-line and reducing-balance depreciation, and project future replacements dynamically
  const getDynamicForecast = () => {
    if (!forecastData || !forecastData.assets) return null;
    
    let filteredAssets = forecastData.assets;
    
    // Checkbox filter: Exclude Retired Assets
    if (excludeRetired) {
      filteredAssets = filteredAssets.filter(item => item.status !== 'retired');
    }
    
    const calculatedAssets = filteredAssets.map(item => {
      const cost = parseFloat(item.purchase_cost || 0);
      const age = parseFloat(item.age_years || 0);
      const category = (item.category || '').toLowerCase();
      const lifespan = lifespans[category] || lifespans.other;
      
      const slRateDec = slRate / 100;
      const rbRateDec = rbRate / 100;
      
      // Strict straight-line depreciation option check (salvage is 0% vs standard %)
      const activeSalvagePct = strictDepreciation ? 0 : salvagePct;
      const salvageVal = cost * (activeSalvagePct / 100);
      
      // Calculate Straight-Line Value
      let slValue = cost - (cost * slRateDec * age);
      if (slValue < salvageVal) slValue = salvageVal;
      if (slValue < 0) slValue = 0;
      
      // Calculate Reducing-Balance Value
      let rbValue = cost * Math.pow(1 - rbRateDec, age);
      if (rbValue < salvageVal) rbValue = salvageVal;
      if (rbValue < 0) rbValue = 0;
      
      // Lifecycle Replacement
      const purchaseYear = new Date(item.purchase_date).getFullYear();
      const currentYear = new Date().getFullYear();
      const replacementYear = purchaseYear + lifespan;
      const yearsUntilReplacement = replacementYear - currentYear;
      
      const requiresReplacement = yearsUntilReplacement <= 0 || item.status === 'retired';
      
      return {
        ...item,
        lifespan_years: lifespan,
        straight_line_value: slValue,
        reducing_balance_value: rbValue,
        requires_replacement: requiresReplacement,
        years_until_replacement: yearsUntilReplacement
      };
    });
    
    // Checkbox filter: Show only assets requiring replacement
    let finalAssets = calculatedAssets;
    if (onlyDueReplacement) {
      finalAssets = finalAssets.filter(asset => asset.requires_replacement);
    }
    
    // Projections
    const projections = {
      year1_budget: 0,
      year1_count: 0,
      year2_budget: 0,
      year2_count: 0,
      year3_budget: 0,
      year3_count: 0
    };
    
    finalAssets.forEach(asset => {
      const cost = parseFloat(asset.purchase_cost || 0);
      const y = asset.years_until_replacement;
      if (y <= 1 || asset.requires_replacement) {
        projections.year1_budget += cost;
        projections.year1_count += 1;
      } else if (y === 2) {
        projections.year2_budget += cost;
        projections.year2_count += 1;
      } else if (y === 3) {
        projections.year3_budget += cost;
        projections.year3_count += 1;
      }
    });
    
    return {
      assets: finalAssets,
      projections
    };
  };

  // Role-based access
  const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const userRole    = currentUser.role || 'viewer';
  const canWrite    = ['admin', 'super_admin'].includes(userRole);
  const canDelete   = ['admin', 'super_admin'].includes(userRole);

  const showNotification = (msg, type = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Delete asset (admin checks apply)
  const handleDelete = async (id, assetId) => {
    if (!canDelete) {
      showNotification('Access denied: Only Admins can delete assets.', 'error');
      return;
    }
    if (window.confirm(`Permanently delete asset ${assetId} from the database?`)) {
      try {
        const token  = localStorage.getItem('token');
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
        await axios.delete(`http://localhost:5000/api/assets/${id}`, config);
        setAssets(prev => prev.filter(asset => asset.id !== id));
        setError(null);
        showNotification(`✓ Asset ${assetId} deleted from database.`);
      } catch (err) {
        console.error('Delete asset error:', err);
        const msg = err.response?.data?.error || 'Failed to delete asset.';
        showNotification(msg, 'error');
        setError(msg);
      }
    }
  };

  // Delete ALL assets (admin only — also clears linked telemetry)
  const handleDeleteAll = async () => {
    if (!canDelete) {
      showNotification('Access denied: Only Admins can delete assets.', 'error');
      return;
    }
    if (!window.confirm(`⚠️ This will permanently delete ALL ${assets.length} assets AND all associated telemetry data from the database.\n\nThis action CANNOT be undone. Are you absolutely sure?`)) return;
    try {
      const token  = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const resp = await axios.delete('http://localhost:5000/api/assets/all', config);
      setAssets([]);
      setError(null);
      showNotification(`✓ ${resp.data.count || 'All'} assets and all telemetry cleared successfully.`);
    } catch (err) {
      console.error('Delete all assets error:', err);
      const msg = err.response?.data?.error || 'Failed to delete all assets.';
      showNotification(msg, 'error');
      setError(msg);
    }
  };

  const handleEdit = (asset) => {
    setEditAsset(asset);
    setIsModalOpen(true);
  };

  const handleAssetUpdated = (updatedAsset) => {
    setAssets(assets.map(asset => asset.id === updatedAsset.id ? { ...asset, ...updatedAsset } : asset));
    showNotification(`Asset ${updatedAsset.asset_id} updated successfully.`);
  };

  const searchTimerRef = useRef(null);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchAssets(value, filterCategory, filterStatus);
    }, 300);
  };

  const handleCategoryChange = (val) => {
    setFilterCategory(val);
    fetchAssets(searchQuery, val, filterStatus);
  };

  const handleStatusChange = (val) => {
    setFilterStatus(val);
    fetchAssets(searchQuery, filterCategory, val);
  };

  // Export the calculated valuation and replacement budget to a CSV spreadsheet
  const handleExportFinancials = () => {
    const dynamicData = getDynamicForecast();
    if (!dynamicData || !dynamicData.assets || dynamicData.assets.length === 0) {
      showNotification('No data to export', 'error');
      return;
    }

    const currInfo = currencyRates[financialCurrency] || { symbol: '$', rate: 1.0 };
    const symbol = currInfo.symbol.trim();
    const rate = currInfo.rate;

    const headers = [
      'Asset ID',
      'Brand',
      'Model',
      'Category',
      `Purchase Cost (${symbol})`,
      'Purchase Date',
      'Age (Years)',
      'Lifespan (Years)',
      `Even Annual Decline Value (${symbol})`,
      `Accelerated Decline Value (${symbol})`,
      'Lifecycle Status'
    ];

    const rows = dynamicData.assets.map(asset => {
      let statusStr = getT('activeSecure');
      if (asset.requires_replacement) {
        statusStr = getT('replaceNow');
      } else if (asset.warranty_expired) {
        statusStr = getT('warrantyExpired');
      }

      return [
        asset.asset_id,
        asset.brand,
        asset.model,
        asset.category,
        (parseFloat(asset.purchase_cost || 0) * rate).toFixed(2),
        asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : '',
        asset.age_years,
        asset.lifespan_years,
        (parseFloat(asset.straight_line_value || 0) * rate).toFixed(2),
        (parseFloat(asset.reducing_balance_value || 0) * rate).toFixed(2),
        statusStr
      ];
    });

    rows.push([]);
    rows.push(['LIFECYCLE PROJECTIONS SUMMARY']);
    rows.push([`${getT('year1')} (${symbol})`, (parseFloat(dynamicData.projections?.year1_budget || 0) * rate).toFixed(2)]);
    rows.push(['Year 1 Devices Due', dynamicData.projections?.year1_count]);
    rows.push([`${getT('year2')} (${symbol})`, (parseFloat(dynamicData.projections?.year2_budget || 0) * rate).toFixed(2)]);
    rows.push(['Year 2 Devices Due', dynamicData.projections?.year2_count]);
    rows.push([`${getT('year3')} (${symbol})`, (parseFloat(dynamicData.projections?.year3_budget || 0) * rate).toFixed(2)]);
    rows.push(['Year 3 Devices Due', dynamicData.projections?.year3_count]);

    const csvString = [headers.join(','), ...rows.map(e => e.map(val => {
        if (val === undefined || val === null) return '';
        const strVal = String(val);
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(','))].join('\r\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Asset_Valuation_Budget_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotification('✓ Budget & Valuation report downloaded.');
  };

  // Render asset tag with QR code on HTML canvas and download as PNG
  const handleDownloadQR = async (targetAsset) => {
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
      showNotification(`✓ Exported QR Tag for ${targetAsset.asset_id}`);
    } catch (err) {
      console.error(err);
      showNotification('Failed to generate QR Tag.', 'error');
    }
  };

  // Fetch data on mount & query parameters change
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const searchParam = queryParams.get('search') || '';
    const categoryParam = queryParams.get('category') || '';
    const statusParam = queryParams.get('status') || '';
    
    setSearchQuery(searchParam);
    setFilterCategory(categoryParam);
    setFilterStatus(statusParam);
    
    if (searchParam || categoryParam || statusParam) {
      setShowFilters(true);
    }
    
    fetchAssets(searchParam, categoryParam, statusParam);
  }, [location.search]);

  useEffect(() => {
    if (activeTab === 'financial') {
      fetchForecast();
    }
  }, [activeTab]);

  // Background auto-refresh loop (20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'inventory') {
        fetchAssets(searchQuery, filterCategory, filterStatus, true);
      } else if (activeTab === 'financial') {
        fetchForecast(true);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [activeTab, searchQuery, filterCategory, filterStatus]);

  // QR preview canvas rendering side-effect
  useEffect(() => {
    if (viewingQrAsset) {
      setTimeout(() => {
        const canvas = document.getElementById('qr-preview-canvas');
        if (canvas) {
          QRCode.toCanvas(canvas, viewingQrAsset.asset_id, {
            width: 192,
            margin: 1,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          });
        }
      }, 100);
    }
  }, [viewingQrAsset]);

  // Fetch assets list from API using active search & filter values
  const fetchAssets = async (search = searchQuery, category = filterCategory, status = filterStatus, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (status) params.append('status', status);
      params.append('limit', '1000');
      
      const res = await axios.get(`http://localhost:5000/api/assets?${params.toString()}`, config);
      setAssets(res.data.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load assets. Is the backend running?');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Get baseline depreciation data from backend
  const fetchForecast = async (silent = false) => {
    if (!silent) setLoadingForecast(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/assets/stats/forecast', config);
      setForecastData(res.data);
    } catch (err) {
      console.error(err);
      if (!silent) showNotification('Failed to load financial forecasts', 'error');
    } finally {
      if (!silent) setLoadingForecast(false);
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'inventory') {
        await fetchAssets(searchQuery, filterCategory, filterStatus);
      } else if (activeTab === 'financial') {
        await fetchForecast();
      }
      showNotification('✓ Asset state updated.');
    } catch (err) {
      console.error("Manual refresh error:", err);
      showNotification('Failed to refresh assets.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAssetAdded = (newAsset) => {
    setAssets([newAsset, ...assets]);
    showNotification('New asset added successfully.');
    if (activeTab === 'financial') fetchForecast();
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">
      {/* Toast Notification */}
      {showToast && (
        <div className={`absolute top-0 right-0 px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 border font-mono text-sm ${toastType === 'error' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'}`}>
          {toastType === 'error' ? <FiAlertCircle className="text-xl" /> : <FiCheckCircle className="text-xl" />}
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiServer className="text-primary" /> ASSET <span className="text-primary">REGISTRY</span>
          </h1>
          <p className="text-slate-400 text-sm">Comprehensive inventory of all registered network devices</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Role badge */}
          <span className={`text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded-lg border ${
            userRole === 'super_admin' ? 'text-danger bg-danger/10 border-danger/30' :
            userRole === 'admin'       ? 'text-warning bg-warning/10 border-warning/30' :
                                        'text-success bg-success/10 border-success/30'
          }`}>
            {userRole === 'super_admin' ? '🔴 SUPER ADMIN' : userRole === 'admin' ? '🟠 ADMIN' : '🟢 VIEWER — READ ONLY'}
          </span>
          <button 
            onClick={handleManualRefresh}
            disabled={isRefreshing || loading || loadingForecast}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Refresh inventory"
          >
            <FiRefreshCw className={`text-base ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
          {canWrite && (
            <button onClick={() => { setEditAsset(null); setIsModalOpen(true); }} className="btn-primary text-sm py-2 px-6 flex items-center gap-2">
              <FiPlus /> NEW ASSET
            </button>
          )}

        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-slate-800/80 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-all font-bold ${
            activeTab === 'inventory'
              ? 'border-primary text-primary shadow-[0_4px_10px_-4px_rgba(0,240,255,0.4)] bg-primary/5'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          📁 ASSET INVENTORY
        </button>
        <button
          onClick={() => setActiveTab('financial')}
          className={`px-6 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-all font-bold ${
            activeTab === 'financial'
              ? 'border-primary text-primary shadow-[0_4px_10px_-4px_rgba(0,240,255,0.4)] bg-primary/5'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          📉 VALUATION & FUTURE BUDGET
        </button>
      </div>

      {activeTab === 'inventory' && (
        <div className="flex flex-col flex-1 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
          <div className="glass-panel p-6 mb-8 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 flex-1">
              <div className="relative w-full max-w-md">
                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search by ID, Name, User, or Serial Number..." 
                  className="cyber-input pl-12 bg-darkBase/50 border-slate-700/80 w-full" 
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className={`btn-primary border-slate-700 hover:bg-slate-700 hover:text-white shadow-none hover:shadow-none transition-all ${showFilters ? 'bg-primary/20 text-primary border-primary' : 'bg-slate-800 text-slate-300'}`}
              >
                <FiFilter className="inline mr-2" /> Filters
              </button>
            </div>
            <div className="text-sm font-mono text-slate-500">
              SHOWING <span className="text-white font-bold">{assets.length}</span> OF <span className="text-primary font-bold">{assets.length}</span> ASSETS
            </div>
          </div>

          {showFilters && (
            <div className="glass-panel p-5 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-[fadeIn_0.2s_ease-out]">
              <div>
                <label className="cyber-label">Category Filter</label>
                <select 
                  value={filterCategory} 
                  onChange={(e) => handleCategoryChange(e.target.value)} 
                  className="cyber-input w-full bg-slate-900 border border-slate-700 text-slate-300"
                >
                  <option value="">All Categories</option>
                  <option value="Laptop">Laptop</option>
                  <option value="Desktop">Desktop</option>
                  <option value="Server">Server</option>
                  <option value="Network">Network Device</option>
                  <option value="Peripherals">Peripherals</option>
                </select>
              </div>
              <div>
                <label className="cyber-label">Status Filter</label>
                <select 
                  value={filterStatus} 
                  onChange={(e) => handleStatusChange(e.target.value)} 
                  className="cyber-input w-full bg-slate-900 border border-slate-700 text-slate-300"
                >
                  <option value="">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="repair">Under Repair</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-center gap-2">
              <FiAlertCircle />
              <span>{error}</span>
              <button onClick={fetchAssets} className="ml-auto underline font-bold">RETRY</button>
            </div>
          )}

          <div className="glass-panel flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[11px] tracking-widest uppercase">
                    <th className="px-6 py-4">Asset ID</th>
                    <th className="px-6 py-4">Device Info</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Assigned To</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-300 divide-y divide-slate-800/80">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-16 text-center">
                        <div className="flex justify-center items-center h-full">
                          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      </td>
                    </tr>
                  ) : assets.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <FiBox className="text-4xl mb-4 opacity-50" />
                          <p className="font-mono text-lg mb-1">NO ASSETS FOUND</p>
                          <p className="text-sm">Click 'New Asset' to add your first device to the database.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    assets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-white">{asset.asset_id}</td>
                        <td className="px-6 py-4">
                          <div className="font-bold">{asset.brand} {asset.model}</div>
                          <div className="text-xs text-slate-500 font-mono mt-1">{asset.serial_number || 'No SN'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs border border-slate-700">{asset.category}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-300">{asset.assigned_to_name || 'Unassigned'}</div>
                          {asset.assigned_department && <div className="text-[10px] text-slate-500">{asset.assigned_department}</div>}
                        </td>
                        <td className="px-6 py-4 text-slate-400">{asset.location || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold font-mono border ${
                            asset.status === 'in_use' ? 'bg-success/10 text-success border-success/30' :
                            asset.status === 'available' ? 'bg-primary/10 text-primary border-primary/30' :
                            'bg-warning/10 text-warning border-warning/30'
                          }`}>
                            {(asset.status || 'unknown').replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => setViewingQrAsset(asset)} className="p-2 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white mr-1" title="View & Generate QR Tag">
                            <FiPrinter />
                          </button>
                          {canWrite ? (
                            <>
                              <button onClick={() => handleEdit(asset)} className="p-2 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white mr-1" title="Edit asset">
                                <FiEdit2 />
                              </button>
                              <button onClick={() => handleDelete(asset.id, asset.asset_id)} className="p-2 hover:bg-danger/20 rounded transition-colors text-slate-400 hover:text-danger" title="Delete asset">
                                <FiTrash2 />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest ml-2">READ ONLY</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="flex flex-col flex-1 overflow-hidden animate-[fadeIn_0.3s_ease-out] gap-6">
          {loadingForecast ? (
            <div className="flex justify-center items-center py-20 flex-1">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : !forecastData ? (
            <div className="text-center py-20 text-slate-500 font-mono">No forecasting data available. Make sure assets have purchase cost and purchase date.</div>
          ) : (() => {
            const dynamicData = getDynamicForecast() || { assets: [], projections: {} };
            return (
              <div className="flex flex-col flex-1 overflow-y-auto p-1 gap-6">
                
                {/* 🌐 Currency, Language & Option Checkboxes Toolbar */}
                <div className="glass-panel p-5 border border-slate-700/60 flex flex-col lg:flex-row gap-5 justify-between items-start lg:items-center">
                  
                  {/* Selectors */}
                  <div className="flex flex-wrap gap-4 items-center w-full lg:w-auto">
                    
                    {/* Currency Selector */}
                    <div className="flex flex-col gap-1 w-full sm:w-auto">
                      <label className="text-[10px] text-slate-400 font-mono uppercase tracking-wider font-bold">{getT('currencyLabel')}</label>
                      <select
                        value={financialCurrency}
                        onChange={(e) => setFinancialCurrency(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-primary w-full sm:w-36 cursor-pointer"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="LKR">LKR (Rs.)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="JPY">JPY (¥)</option>
                        <option value="AUD">AUD (A$)</option>
                      </select>
                    </div>

                  </div>

                  {/* Checkbox Options */}
                  <div className="flex flex-col gap-2.5 font-mono text-xs text-slate-350 w-full lg:w-auto">
                    
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={excludeRetired}
                        onChange={(e) => setExcludeRetired(e.target.checked)}
                        className="rounded accent-primary border-slate-700 cursor-pointer w-4 h-4"
                      />
                      <span>{getT('optExcludeRetired')}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={strictDepreciation}
                        onChange={(e) => setStrictDepreciation(e.target.checked)}
                        className="rounded accent-primary border-slate-700 cursor-pointer w-4 h-4"
                      />
                      <span>{getT('optStrictDep')}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyDueReplacement}
                        onChange={(e) => setOnlyDueReplacement(e.target.checked)}
                        className="rounded accent-primary border-slate-700 cursor-pointer w-4 h-4"
                      />
                      <span>{getT('optOnlyDue')}</span>
                    </label>

                  </div>

                </div>

                {/* ⚙️ Interactive Parameter Adjuster Panel */}
                <div className="glass-panel p-5 border border-slate-700/60">
                  <button 
                    onClick={() => setShowParams(!showParams)}
                    className="w-full flex justify-between items-center text-white font-mono text-xs uppercase tracking-widest font-bold focus:outline-none"
                  >
                    <span>⚙️ {getT('settingsTitle')}</span>
                    <span className="text-primary hover:text-white transition-colors">
                      {showParams ? '[- HIDE CONTROLS]' : '[+ SHOW CONTROLS]'}
                    </span>
                  </button>

                  {showParams && (
                    <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-[fadeIn_0.2s_ease-out]">
                      {/* Left Side: Sliders */}
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-xs font-mono text-slate-350 mb-1">
                            <span>Even Annual Decline (Straight-Line Rate):</span>
                            <span className="text-primary font-bold">{slRate}% p.a.</span>
                          </div>
                          <input 
                            type="range" 
                            min="5" 
                            max="50" 
                            value={slRate} 
                            onChange={(e) => setSlRate(parseInt(e.target.value))}
                            className="w-full accent-primary h-1 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-mono text-slate-350 mb-1">
                            <span>Accelerated Decline (Reducing-Balance Rate):</span>
                            <span className="text-teal-400 font-bold">{rbRate}% p.a.</span>
                          </div>
                          <input 
                            type="range" 
                            min="5" 
                            max="50" 
                            value={rbRate} 
                            onChange={(e) => setRbRate(parseInt(e.target.value))}
                            className="w-full accent-teal-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-mono text-slate-350 mb-1">
                            <span>Minimum Value Floor:</span>
                            <span className="text-slate-400 font-bold">{salvagePct}% of cost</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="30" 
                            value={salvagePct} 
                            onChange={(e) => setSalvagePct(parseInt(e.target.value))}
                            className="w-full accent-slate-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Right Side: Category Lifespans */}
                      <div className="flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold font-mono uppercase tracking-wider block mb-2">CUSTOMIZE LIFESPANS (YEARS)</span>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {Object.keys(lifespans).map((cat) => (
                              <div key={cat} className="flex flex-col gap-1">
                                <label className="text-[9px] font-mono text-slate-450 uppercase truncate">{cat}</label>
                                <input 
                                  type="number" 
                                  min="1" 
                                  max="20"
                                  value={lifespans[cat]}
                                  onChange={(e) => setLifespans({ ...lifespans, [cat]: parseInt(e.target.value) || 1 })}
                                  className="bg-slate-900 border border-slate-700/60 rounded p-1 text-center font-mono text-xs text-white focus:outline-none focus:border-primary"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800/40">
                          <button 
                            onClick={() => {
                              setSlRate(25);
                              setRbRate(30);
                              setSalvagePct(10);
                              setLifespans({ laptop: 4, server: 7, network: 5, mobile: 3, other: 5 });
                              setFinancialCurrency('USD');
                              setExcludeRetired(false);
                              setStrictDepreciation(false);
                              setOnlyDueReplacement(false);
                              showNotification("✓ Settings restored to baseline standard.");
                            }}
                            className="text-[10px] font-mono text-slate-500 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            {getT('resetSettings')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Projections KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-panel p-6 border-l-4 border-l-danger bg-danger/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-danger/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-bold block mb-1">{getT('year1')}</span>
                    <h2 className="text-3xl font-extrabold text-white font-mono">{formatCost(dynamicData.projections?.year1_budget || 0)}</h2>
                    <p className="text-xs text-slate-400 mt-2 font-mono">Devices: <span className="text-danger font-bold">{dynamicData.projections?.year1_count} due for replacement</span></p>
                  </div>
                  <div className="glass-panel p-6 border-l-4 border-l-warning bg-warning/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-warning/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-bold block mb-1">{getT('year2')}</span>
                    <h2 className="text-3xl font-extrabold text-white font-mono">{formatCost(dynamicData.projections?.year2_budget || 0)}</h2>
                    <p className="text-xs text-slate-400 mt-2 font-mono">Devices: <span className="text-warning font-bold">{dynamicData.projections?.year2_count} soon to replace</span></p>
                  </div>
                  <div className="glass-panel p-6 border-l-4 border-l-primary bg-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono font-bold block mb-1">{getT('year3')}</span>
                    <h2 className="text-3xl font-extrabold text-white font-mono">{formatCost(dynamicData.projections?.year3_budget || 0)}</h2>
                    <p className="text-xs text-slate-400 mt-2 font-mono">Devices: <span className="text-primary font-bold">{dynamicData.projections?.year3_count} future replacement</span></p>
                  </div>
                </div>

                {/* Financial Table */}
                <div className="glass-panel overflow-hidden flex flex-col flex-1">
                  <div className="p-4 border-b border-slate-800/80 bg-slate-900/30 flex justify-between items-center">
                    <div>
                      <h3 className="font-mono text-sm font-bold text-slate-300 uppercase">{getT('title')}</h3>
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mt-0.5">
                        {getT('sub')}: Even Decline ({slRate}%) vs Accelerated Decline ({rbRate}%)
                      </span>
                    </div>
                    <button 
                      onClick={handleExportFinancials} 
                      className="btn-primary py-1.5 px-4 text-xs flex items-center gap-2 font-mono bg-slate-800 hover:bg-slate-700"
                    >
                      <FiDownload className="text-sm" /> {getT('exportReport')}
                    </button>
                  </div>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[11px] tracking-widest uppercase">
                          <th className="px-6 py-4">Asset ID</th>
                          <th className="px-6 py-4">Asset Details</th>
                          <th className="px-6 py-4">{getT('purchaseCost')}</th>
                          <th className="px-6 py-4">{getT('ageLifespan')}</th>
                          <th className="px-6 py-4 text-right">{getT('evenDecline')}</th>
                          <th className="px-6 py-4 text-right">{getT('accDecline')}</th>
                          <th className="px-6 py-4 text-center">{getT('lifecycleStatus')}</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-slate-300 divide-y divide-slate-800/80">
                        {dynamicData.assets?.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="px-6 py-16 text-center text-slate-500 font-mono">
                              {getT('noEntries')}
                            </td>
                          </tr>
                        ) : (
                          dynamicData.assets?.map((item) => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-4 font-mono font-bold text-white">{item.asset_id}</td>
                              <td className="px-6 py-4">
                                <div className="font-bold">{item.brand} {item.model}</div>
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono uppercase border border-slate-700 mt-1 inline-block">{item.category}</span>
                              </td>
                              <td className="px-6 py-4 font-mono font-bold text-slate-300">{formatCost(item.purchase_cost || 0)}</td>
                              <td className="px-6 py-4 font-mono text-slate-400">{item.age_years} {getT('yearsShort')} / {item.lifespan_years} {getT('yearsShort')}</td>
                              <td className="px-6 py-4 text-right font-mono text-primary font-bold">{formatCost(item.straight_line_value || 0)}</td>
                              <td className="px-6 py-4 text-right font-mono text-teal-400 font-bold">{formatCost(item.reducing_balance_value || 0)}</td>
                              <td className="px-6 py-4 text-center">
                                {item.requires_replacement ? (
                                  <span className="bg-danger/10 text-danger border border-danger/30 text-[9px] font-mono px-2 py-1 rounded font-bold uppercase tracking-wider">{getT('replaceNow')}</span>
                                ) : item.warranty_expired ? (
                                  <span className="bg-warning/10 text-warning border border-warning/30 text-[9px] font-mono px-2 py-1 rounded font-bold uppercase tracking-wider">{getT('warrantyExpired')}</span>
                                ) : (
                                  <span className="bg-success/10 text-success border border-success/30 text-[9px] font-mono px-2 py-1 rounded font-bold uppercase tracking-wider font-bold">{getT('activeSecure')}</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <AddAssetModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditAsset(null); }} 
        onAssetAdded={handleAssetAdded} 
        onAssetUpdated={handleAssetUpdated}
        initialData={editAsset}
      />

      {/* Qr Preview Modal */}
      {viewingQrAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={() => setViewingQrAsset(null)}>
          <div className="glass-panel w-full max-w-sm p-6 relative border-t-4 border-t-primary shadow-[0_0_40px_rgba(0,240,255,0.3)] text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingQrAsset(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              ✕
            </button>
            <h3 className="text-white font-mono text-sm font-bold mb-4 uppercase tracking-widest">Asset QR Tag</h3>
            <div className="bg-white p-4 rounded-lg inline-block mb-4">
              <canvas id="qr-preview-canvas" className="w-48 h-48"></canvas>
            </div>
            <div className="font-mono text-xs text-slate-400 mb-6">
              <strong className="text-white block text-sm">{viewingQrAsset.asset_id}</strong>
              {viewingQrAsset.brand} {viewingQrAsset.model}
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { handleDownloadQR(viewingQrAsset); setViewingQrAsset(null); }} className="btn-primary py-2 px-6 text-xs font-mono">
                DOWNLOAD PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetRegistry;
