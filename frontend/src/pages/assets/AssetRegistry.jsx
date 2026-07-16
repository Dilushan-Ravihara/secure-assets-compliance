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
  const activeTab = 'inventory';

  // Refresh and QR Preview states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewingQrAsset, setViewingQrAsset] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const location = useLocation();



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

  // Background auto-refresh loop (20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAssets(searchQuery, filterCategory, filterStatus, true);
    }, 20000);

    return () => clearInterval(interval);
  }, [searchQuery, filterCategory, filterStatus]);

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

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchAssets(searchQuery, filterCategory, filterStatus);
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
            disabled={isRefreshing || loading}
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
