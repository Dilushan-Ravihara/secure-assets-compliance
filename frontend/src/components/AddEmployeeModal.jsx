import { useState, useEffect } from 'react';
import { FiX, FiCheckCircle, FiUser, FiAlertCircle, FiCpu } from 'react-icons/fi';
import axios from 'axios';

const AddEmployeeModal = ({ isOpen, onClose, onEmployeeAdded, onEmployeeUpdated, initialData }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    employee_id: '',
    name: '',
    email: '',
    department: 'Engineering',
    designation: '',
    location: '',
  });

  const [assignedAssets, setAssignedAssets] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [selectedAssetToAllocate, setSelectedAssetToAllocate] = useState('');

  // Load employee data into the form if we are editing an existing record
  useEffect(() => {
    if (initialData) {
      setFormData({
        employee_id: initialData.employee_id || '',
        name: initialData.name || '',
        email: initialData.email || '',
        department: initialData.department || 'Engineering',
        designation: initialData.designation || '',
        location: initialData.location || '',
      });
    } else {
      setFormData({
        employee_id: '',
        name: '',
        email: '',
        department: 'Engineering',
        designation: '',
        location: '',
      });
    }
  }, [initialData, isOpen]);

  // Fetch employee allocated assets and available assets on load
  useEffect(() => {
    if (isOpen && initialData) {
      fetchEmployeeAssets();
      fetchAvailableAssets();
    } else {
      setAssignedAssets([]);
      setAvailableAssets([]);
      setSelectedAssetToAllocate('');
    }
  }, [isOpen, initialData]);

  const fetchEmployeeAssets = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get(`http://localhost:5000/api/employees/${initialData.id}`, config);
      setAssignedAssets(response.data.assigned_assets || []);
    } catch (err) {
      console.error("Failed to fetch employee assets:", err);
    }
  };

  const fetchAvailableAssets = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/assets?status=available&limit=100', config);
      setAvailableAssets(response.data.data || []);
    } catch (err) {
      console.error("Failed to fetch available assets:", err);
    }
  };

  const handleAllocate = async () => {
    if (!selectedAssetToAllocate) return;
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.post(`http://localhost:5000/api/employees/${initialData.id}/allocate`, {
        assetDbId: parseInt(selectedAssetToAllocate, 10)
      }, config);
      setSelectedAssetToAllocate('');
      fetchEmployeeAssets();
      fetchAvailableAssets();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to allocate asset.");
    }
  };

  const handleDeallocate = async (assetId) => {
    if (!window.confirm("Are you sure you want to remove this device allocation?")) return;
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.post(`http://localhost:5000/api/employees/${initialData.id}/deallocate`, {
        assetDbId: assetId
      }, config);
      fetchEmployeeAssets();
      fetchAvailableAssets();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to deallocate asset.");
    }
  };

  // Close modal if hidden
  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Save employee records when submitted
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      if (initialData) {
        const response = await axios.put(`http://localhost:5000/api/employees/${initialData.id}`, formData, config);
        if (onEmployeeUpdated) onEmployeeUpdated(response.data);
      } else {
        const response = await axios.post('http://localhost:5000/api/employees', formData, config);
        onEmployeeAdded(response.data);
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || `Failed to ${initialData ? 'update' : 'create'} employee.`);
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
          <FiUser className="text-primary" /> {initialData ? 'EDIT' : 'NEW'} <span className="text-primary">EMPLOYEE</span>
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-start gap-2">
            <FiAlertCircle className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="cyber-label">Employee ID (Required)</label>
              <input type="text" name="employee_id" required value={formData.employee_id} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. EMP-001" />
            </div>
            <div>
              <label className="cyber-label">Full Name (Required)</label>
              <input type="text" name="name" required value={formData.name} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. John Doe" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="cyber-label">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="cyber-input w-full" placeholder="john@company.com" />
            </div>
            <div>
              <label className="cyber-label">Department</label>
              <select name="department" value={formData.department} onChange={handleChange} className="cyber-input w-full text-slate-350">
                <option value="Engineering">Engineering</option>
                <option value="IT Security">IT Security</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Finance">Finance</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="cyber-label">Designation</label>
              <input type="text" name="designation" value={formData.designation} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="cyber-label">Location</label>
              <input type="text" name="location" value={formData.location} onChange={handleChange} className="cyber-input w-full" placeholder="e.g. Colombo HQ" />
            </div>
          </div>

          {/* Allocated Assets Management Section */}
          {initialData && (
            <div className="pt-6 border-t border-slate-800 mt-6">
              <h3 className="text-white font-mono font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                <FiCpu className="text-primary animate-pulse" /> Allocated Devices & Assets
              </h3>
              
              <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {assignedAssets.length === 0 ? (
                  <div className="text-slate-500 text-[11px] font-mono py-3 bg-slate-900/30 border border-dashed border-slate-800 rounded text-center">
                    No devices allocated to this employee.
                  </div>
                ) : (
                  assignedAssets.map((asset) => (
                    <div key={asset.id} className="flex justify-between items-center bg-slate-900/40 border border-slate-800 p-2.5 rounded text-[11px]">
                      <div>
                        <span className="font-mono font-bold text-white mr-2">{asset.asset_id}</span>
                        <span className="text-slate-400">{asset.brand} {asset.model} ({asset.category})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeallocate(asset.id)}
                        className="text-danger hover:underline font-mono text-[10px] font-bold"
                      >
                        REMOVE
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedAssetToAllocate}
                  onChange={(e) => setSelectedAssetToAllocate(e.target.value)}
                  className="cyber-input text-xs flex-1 bg-darkBase/50 border-slate-700/80 text-slate-300"
                >
                  <option value="">-- Select Device to Allocate --</option>
                  {availableAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_id} - {asset.brand} {asset.model} ({asset.category})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAllocate}
                  disabled={!selectedAssetToAllocate}
                  className="btn-primary text-xs py-1.5 px-4 shadow-none font-mono font-bold bg-slate-800 text-white border border-slate-700 hover:text-primary transition-colors disabled:opacity-40"
                >
                  ALLOCATE
                </button>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-800 flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-6 py-2 rounded font-bold font-mono text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              CANCEL
            </button>
            <button type="submit" disabled={loading} className="btn-primary py-2 px-8 shadow-none flex items-center gap-2">
              {loading ? 'SAVING...' : <><FiCheckCircle /> {initialData ? 'UPDATE EMPLOYEE' : 'ADD EMPLOYEE'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEmployeeModal;
