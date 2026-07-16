import { useState, useEffect } from 'react';
import { FiUsers, FiUserPlus, FiSearch, FiCheckCircle, FiXCircle, FiTrash2 } from 'react-icons/fi';
import axios from 'axios';

const UsersManagement = () => {
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // New user form state
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [newDept, setNewDept] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Notifications
  const [toast, setToast] = useState(null);

  const showToastMsg = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch user accounts from API
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const res = await axios.get('http://localhost:5000/api/auth/users', config);
      setUsers(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch users list.');
    } finally {
      setLoading(false);
    }
  };

  // Load accounts on page mount
  useEffect(() => {
    fetchUsers();
  }, []);

  // Update a user's role access level
  const handleRoleChange = async (userId, newRole) => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.put(`http://localhost:5000/api/auth/users/${userId}/role`, { role: newRole }, config);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToastMsg('User role updated successfully.');
    } catch (err) {
      console.error(err);
      showToastMsg('Failed to update user role.', 'error');
    }
  };

  // Enable or disable a user account
  const handleStatusToggle = async (userId, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.put(`http://localhost:5000/api/auth/users/${userId}/status`, { is_active: !currentStatus }, config);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
      showToastMsg(`User status updated to ${!currentStatus ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      console.error(err);
      showToastMsg('Failed to update user status.', 'error');
    }
  };

  // Delete a user account from database
  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`⚠️ Are you absolutely sure you want to delete the account for "${userName}"?\n\nThis will remove the user permanently from the database.`)) return;
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete(`http://localhost:5000/api/auth/users/${userId}`, config);
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToastMsg(`User "${userName}" deleted successfully.`);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to delete user account.';
      showToastMsg(errMsg, 'error');
    }
  };

  // Create a new user profile
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        department: newDept
      };
      await axios.post('http://localhost:5000/api/auth/register', payload);
      showToastMsg('New user created successfully.');
      setShowModal(false);
      // Clear inputs
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('viewer');
      setNewDept('');
      fetchUsers();
    } catch (err) {
      console.error(err);
      showToastMsg(err.response?.data?.error || 'Failed to create user.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || (u.department && u.department.toLowerCase().includes(search.toLowerCase()));
    const matchesRole = roleFilter === 'all' ? true : u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-0 right-0 px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-[100] border font-mono text-sm ${
          toast.type === 'error' ? 'bg-danger/10 border-danger/30 text-danger' : 'bg-success/10 border-success/30 text-success'
        }`}>
          {toast.type === 'error' ? <FiXCircle /> : <FiCheckCircle />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiUsers className="text-primary" /> USER <span className="text-primary">ACCOUNTS</span>
          </h1>
          <p className="text-slate-400 text-sm">Assign role-based access and manage platform credentials</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm py-2 px-6 flex items-center gap-2">
            <FiUserPlus /> ADD USER
          </button>
        )}
      </div>

      {/* Search & Filter */}
      <div className="glass-panel p-6 mb-8 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 flex-1">
          <div className="relative w-full max-w-md">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search by name, email, department..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="cyber-input pl-12 bg-darkBase/50 border-slate-700/80 w-full" 
            />
          </div>
          <select 
            value={roleFilter} 
            onChange={e => setRoleFilter(e.target.value)}
            className="cyber-input bg-darkBase/50 border-slate-700/80 max-w-[200px]"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        <div className="text-sm font-mono text-slate-500">
          SHOWING <span className="text-white font-bold">{filteredUsers.length}</span> OF <span className="text-primary font-bold">{users.length}</span> USERS
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-700/50 text-slate-400 font-mono text-[11px] tracking-widest uppercase">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Role / Access</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-300 divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center">
                    <div className="flex justify-center items-center h-full">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center text-slate-500 font-mono">
                    NO USER ACCOUNTS FOUND
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-primary font-bold font-mono">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      {user.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-400">{user.email}</td>
                    <td className="px-6 py-4">{user.department || '—'}</td>
                    <td className="px-6 py-4">
                      {user.role === 'super_admin' && currentUser.role !== 'super_admin' ? (
                        <span className="text-xs text-danger bg-danger/10 border border-danger/20 px-2 py-1 rounded font-bold font-mono">
                          🔴 SUPER ADMIN
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          disabled={!isAdmin || user.id === currentUser.id}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className={`bg-slate-900 border border-slate-700 text-xs text-slate-200 px-2.5 py-1 rounded focus:outline-none focus:border-primary font-mono ${isAdmin && user.id !== currentUser.id ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'}`}
                        >
                          <option value="admin">🟠 ADMIN</option>
                          <option value="viewer">🟢 VIEWER</option>
                          {currentUser.role === 'super_admin' && (
                            <option value="super_admin">🔴 SUPER ADMIN</option>
                          )}
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => isAdmin && handleStatusToggle(user.id, user.is_active)}
                        className={`text-xs font-mono font-bold px-3 py-1 rounded-full border transition-all ${
                          user.is_active 
                            ? 'bg-success/10 text-success border-success/30' + (isAdmin ? ' hover:bg-success/20' : '') 
                            : 'bg-danger/10 text-danger border-danger/30' + (isAdmin ? ' hover:bg-danger/20' : '')
                        } ${!isAdmin ? 'cursor-not-allowed opacity-75' : ''}`}
                      >
                        {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-4">
                        <span className="text-[11px] font-mono text-slate-500">
                          Created: {new Date(user.created_at).toLocaleDateString()}
                        </span>
                        {isAdmin && user.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="text-danger hover:text-red-400 p-1 bg-danger/10 border border-danger/20 hover:bg-danger/20 rounded transition-all"
                            title="Delete User Account"
                          >
                            <FiTrash2 className="text-sm" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for adding user */}
      {showModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative border-t-4 border-t-primary shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-[fadeIn_0.2s_ease-out]">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <FiXCircle className="text-xl" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <FiUserPlus className="text-primary text-2xl" />
              <div>
                <h2 className="text-xl font-bold text-white font-mono">Create User Account</h2>
                <p className="text-xs text-slate-500">Add credentials for new team member</p>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="cyber-label">Full Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  className="cyber-input" 
                  placeholder="e.g. Dilushan Silva" 
                  required 
                />
              </div>

              <div>
                <label className="cyber-label">Email Address</label>
                <input 
                  type="email" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  className="cyber-input" 
                  placeholder="e.g. dilushan@company.com" 
                  required 
                />
              </div>

              <div>
                <label className="cyber-label">Password</label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="cyber-input" 
                  placeholder="Minimum 6 characters" 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="cyber-label">Role Access</label>
                  <select 
                    value={newRole} 
                    onChange={e => setNewRole(e.target.value)} 
                    className="cyber-input"
                  >
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="admin">Admin (Full Access)</option>
                    {currentUser.role === 'super_admin' && (
                      <option value="super_admin">Super Admin (System Owner)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="cyber-label">Department</label>
                  <input 
                    type="text" 
                    value={newDept} 
                    onChange={e => setNewDept(e.target.value)} 
                    className="cyber-input" 
                    placeholder="IT Security, Ops" 
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="bg-slate-800 text-slate-400 px-4 py-2 rounded text-sm hover:bg-slate-700 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submitting} 
                  className="btn-primary py-2 px-6 text-sm"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersManagement;
