import { useState, useEffect } from 'react';
import { FiX, FiCheckCircle, FiAlertCircle, FiPlus } from 'react-icons/fi';
import axios from 'axios';
import QRCode from 'qrcode';

const AddAssetModal = ({ isOpen, onClose, onAssetAdded, onAssetUpdated, initialData }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    asset_id: '',
    serial_number: '',
    brand: '',
    model: '',
    category: 'Laptop',
    location: '',
  });

  // Populate form if editing an existing asset, otherwise keep it blank
  useEffect(() => {
    if (initialData) {
      setFormData({
        asset_id: initialData.asset_id || '',
        serial_number: initialData.serial_number || '',
        brand: initialData.brand || '',
        model: initialData.model || '',
        category: initialData.category || 'Laptop',
        location: initialData.location || '',
      });
    } else {
      setFormData({
        asset_id: '',
        serial_number: '',
        brand: '',
        model: '',
        category: 'Laptop',
        location: '',
      });
    }
  }, [initialData, isOpen]);

  // QR preview rendering side-effect inside the edit modal
  useEffect(() => {
    if (initialData && isOpen) {
      setTimeout(() => {
        const canvas = document.getElementById('modal-qr-canvas');
        if (canvas) {
          QRCode.toCanvas(canvas, initialData.asset_id, {
            width: 140,
            margin: 1,
            color: {
              dark: '#0f172a',
              light: '#ffffff'
            }
          }).catch(err => console.error(err));
        }
      }, 100);
    }
  }, [initialData, isOpen, formData.asset_id]);

  const downloadQR = async () => {
    if (!initialData) return;
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

      const qrData = formData.asset_id;
      
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
      ctx.fillText(formData.category ? formData.category.toUpperCase() : 'DEVICE', 120, 20);

      ctx.fillStyle = isLightMode ? '#0f172a' : '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(formData.asset_id, 120, 225);

      ctx.fillStyle = isLightMode ? '#475569' : '#cbd5e1';
      ctx.font = '11px sans-serif';
      const deviceLabel = `${formData.brand} ${formData.model}`;
      const truncatedLabel = deviceLabel.length > 25 ? deviceLabel.substring(0, 22) + '...' : deviceLabel;
      ctx.fillText(truncatedLabel, 120, 245);

      ctx.fillStyle = isLightMode ? '#16a34a' : '#00ff66';
      ctx.font = '9px monospace';
      ctx.fillText('SYSTEM TAG // SECURE', 120, 262);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${formData.asset_id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
    }
  };

  // Don't show modal if isOpen is false
  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Send form data to backend on submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      if (initialData) {
        const response = await axios.put(`http://localhost:5000/api/assets/${initialData.id}`, formData, config);
        if (onAssetUpdated) onAssetUpdated(response.data);
      } else {
        const response = await axios.post('http://localhost:5000/api/assets', formData, config);
        onAssetAdded(response.data);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || `Failed to ${initialData ? 'update' : 'create'} asset.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className={`glass-panel w-full ${initialData ? 'max-w-2xl' : 'max-w-lg'} p-6 relative border-t-4 border-t-primary shadow-[0_0_40px_rgba(0,0,0,0.8)]`}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <FiX className="text-2xl" />
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-6 font-mono flex items-center gap-2">
          <FiPlus className="text-primary" /> {initialData ? 'EDIT' : 'NEW'} <span className="text-primary">ASSET</span>
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-start gap-2">
            <FiAlertCircle className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className={`grid ${initialData ? 'grid-cols-1 md:grid-cols-3 gap-6' : 'grid-cols-1'}`}>
          <div className={initialData ? 'md:col-span-2' : ''}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="cyber-label">Asset ID (Required)</label>
                  <input type="text" name="asset_id" required value={formData.asset_id} onChange={handleChange} className="cyber-input w-full animate-none" placeholder="e.g. AST-1001" />
                </div>
                <div>
                  <label className="cyber-label">Serial Number</label>
                  <input type="text" name="serial_number" value={formData.serial_number} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. SN-998877" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="cyber-label">Brand (Required)</label>
                  <input type="text" name="brand" required value={formData.brand} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. Dell" />
                </div>
                <div>
                  <label className="cyber-label">Model (Required)</label>
                  <input type="text" name="model" required value={formData.model} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. XPS 15" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="cyber-label">Category</label>
                  <select name="category" value={formData.category} onChange={handleChange} className="cyber-input w-full text-slate-300">
                    <option value="Laptop">Laptop</option>
                    <option value="Desktop">Desktop</option>
                    <option value="Server">Server</option>
                    <option value="Network">Network Device</option>
                    <option value="Peripherals">Peripherals</option>
                  </select>
                </div>
                <div>
                  <label className="cyber-label">Location</label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. HQ - Floor 3" />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 flex justify-end gap-3 mt-8">
                <button type="button" onClick={onClose} className="px-6 py-2 rounded font-bold font-mono text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                  CANCEL
                </button>
                <button type="submit" disabled={loading} className="btn-primary py-2 px-8 shadow-none flex items-center gap-2">
                  {loading ? 'SAVING...' : <><FiCheckCircle /> {initialData ? 'UPDATE ASSET' : 'CREATE ASSET'}</>}
                </button>
              </div>
            </form>
          </div>

          {initialData && (
            <div className="flex flex-col items-center justify-center border-l border-slate-800/80 pl-6 text-center font-mono animate-[fadeIn_0.3s_ease-out]">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Asset Identity Tag</span>
              <div className="bg-white p-3 rounded-lg mb-3 flex items-center justify-center">
                <canvas id="modal-qr-canvas" className="w-32 h-32"></canvas>
              </div>
              <button 
                type="button" 
                onClick={downloadQR} 
                className="btn-primary py-1.5 px-4 text-[10px] tracking-wider uppercase font-bold w-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
              >
                DOWNLOAD TAG
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddAssetModal;
