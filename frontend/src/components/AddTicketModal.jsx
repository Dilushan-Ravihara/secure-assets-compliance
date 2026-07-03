import { useState, useEffect } from 'react';
import { FiX, FiCheckCircle, FiTool, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';

const AddTicketModal = ({ isOpen, onClose, onTicketAdded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assets, setAssets] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    asset_id: '',
  });

  // When the modal opens, reset fields and fetch the list of assets
  useEffect(() => {
    if (isOpen) {
      fetchAssets();
      // Reset form
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        asset_id: '',
      });
    }
  }, [isOpen]);

  // Pull assets list from the server to fill the asset selector dropdown
  const fetchAssets = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/assets', config);
      setAssets(response.data.data || []);
    } catch (err) {
      console.error("Error fetching assets for ticket dropdown:", err);
    }
  };

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Post ticket data to the backend API on form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const payload = {
        ...formData,
        asset_id: formData.asset_id ? parseInt(formData.asset_id) : null
      };
      const response = await axios.post('http://localhost:5000/api/maintenance', payload, config);
      onTicketAdded(response.data);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to create ticket. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="glass-panel w-full max-w-lg p-6 relative border-t-4 border-t-primary shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <FiX className="text-2xl" />
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-6 font-mono flex items-center gap-2">
          <FiTool className="text-primary" /> NEW <span className="text-primary">TICKET</span>
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-start gap-2">
            <FiAlertCircle className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="cyber-label">Title (Required)</label>
            <input type="text" name="title" required value={formData.title} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. Server Update" />
          </div>

          <div>
            <label className="cyber-label">Target Asset (Optional)</label>
            <select name="asset_id" value={formData.asset_id} onChange={handleChange} className="cyber-input w-full text-slate-300">
              <option value="">-- No Specific Asset --</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.asset_id} - {asset.brand} {asset.model} ({asset.location || 'No Loc'})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="cyber-label">Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} className="cyber-input w-full h-24" placeholder="Brief issue description..." />
          </div>

          <div>
            <label className="cyber-label">Priority</label>
            <select name="priority" value={formData.priority} onChange={handleChange} className="cyber-input w-full text-slate-300">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="pt-6 border-t border-slate-800 flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-6 py-2 rounded font-bold font-mono text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              CANCEL
            </button>
            <button type="submit" disabled={loading} className="btn-primary py-2 px-8 shadow-none flex items-center gap-2">
              {loading ? 'SAVING...' : <><FiCheckCircle /> CREATE TICKET</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTicketModal;
