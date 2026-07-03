import { useState, useEffect } from 'react';
import { FiUsers, FiSearch, FiFilter, FiPlus, FiEdit2, FiTrash2, FiAlertCircle, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import AddEmployeeModal from '../../components/AddEmployeeModal';

const PersonnelDirectory = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const showNotification = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Delete employee record
  const handleDelete = async (id, employeeId) => {
    if (!window.confirm(`Are you sure you want to permanently delete employee ${employeeId}?`)) return;
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete(`http://localhost:5000/api/employees/${id}`, config);
      setEmployees(employees.filter(emp => emp.id !== id));
      showNotification(`Personnel ${employeeId} deleted successfully.`);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to delete personnel records.';
      showNotification(errMsg);
    }
  };

  const handleEdit = (employee) => {
    setEditEmployee(employee);
    setIsModalOpen(true);
  };

  const handleEmployeeUpdated = (updatedEmployee) => {
    setEmployees(employees.map(emp => emp.id === updatedEmployee.id ? { ...emp, ...updatedEmployee } : emp));
    showNotification(`Personnel ${updatedEmployee.employee_id} updated successfully.`);
  };

  // Load employee directory on mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Background auto-refresh loop (20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEmployees(true);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch employee list from API
  const fetchEmployees = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/employees', config);
      setEmployees(res.data.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load employees. Is the backend running?');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchEmployees();
      showNotification('✓ Personnel directory refreshed.');
    } catch (err) {
      console.error(err);
      showNotification('Failed to refresh personnel.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEmployeeAdded = (newEmployee) => {
    setEmployees([newEmployee, ...employees]);
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-0 right-0 bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50">
          <FiCheckCircle className="text-xl" />
          <span className="font-mono text-sm">{toastMsg}</span>
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiUsers className="text-primary" /> PERSONNEL <span className="text-primary">DIRECTORY</span>
          </h1>
          <p className="text-slate-400 text-sm">Manage employees and their assigned corporate assets</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleManualRefresh}
            disabled={isRefreshing || loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Refresh Personnel"
          >
            <FiRefreshCw className={`text-base ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button onClick={() => { setEditEmployee(null); setIsModalOpen(true); }} className="btn-primary text-sm py-2 px-6 flex items-center">
            <FiPlus className="inline mr-2" /> ADD EMPLOYEE
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 mb-8 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 flex-1">
          <div className="relative w-full max-w-md">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search employee by name, ID, or department..." className="cyber-input pl-12 bg-darkBase/50 border-slate-700/80 w-full" />
          </div>
          <button onClick={() => showNotification('Advanced filtering options toggled.')} className="btn-primary bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white shadow-none hover:shadow-none"><FiFilter className="inline mr-2" /> Filters</button>
        </div>
        <div className="text-sm font-mono text-slate-500 uppercase tracking-widest">
          TOTAL <span className="text-white font-bold">{employees.length}</span> EMPLOYEES
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-danger/10 border border-danger/30 text-danger text-sm rounded flex items-center gap-2">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={fetchEmployees} className="ml-auto underline font-bold">RETRY</button>
        </div>
      )}

      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[11px] tracking-widest uppercase">
                <th className="px-6 py-4">Employee ID</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Designation</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">Assigned Assets</th>
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
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <FiUsers className="text-6xl mb-6 opacity-30" />
                      <h2 className="font-mono text-xl text-slate-400 mb-2 uppercase tracking-widest">No Personnel Records Found</h2>
                      <p className="text-sm max-w-md mb-6">Database connection pending. Click 'ADD EMPLOYEE' to begin.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-white">{emp.employee_id}</td>
                    <td className="px-6 py-4 font-bold">{emp.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs border border-slate-700">{emp.department || '—'}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{emp.designation || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300">{emp.email || '—'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{emp.phone || '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-primary font-bold font-mono">{emp.asset_count || 0}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(emp)} className="p-2 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white mr-1"><FiEdit2 /></button>
                      <button onClick={() => handleDelete(emp.id, emp.employee_id)} className="p-2 hover:bg-danger/20 rounded transition-colors text-slate-400 hover:text-danger"><FiTrash2 /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddEmployeeModal 
        isOpen={isModalOpen} 
        onClose={() => { 
          setIsModalOpen(false); 
          setEditEmployee(null); 
          fetchEmployees(); 
        }} 
        onEmployeeAdded={handleEmployeeAdded} 
        onEmployeeUpdated={handleEmployeeUpdated}
        initialData={editEmployee}
      />
    </div>
  );
};

export default PersonnelDirectory;
