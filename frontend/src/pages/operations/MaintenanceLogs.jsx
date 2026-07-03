import { useState, useEffect, useRef } from 'react';
import { FiTool, FiClock, FiCheckCircle, FiAlertCircle, FiTrash2, FiX, FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import AddTicketModal from '../../components/AddTicketModal';

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pending Triage', color: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/30' },
  { value: 'in_progress', label: 'In Repair',      color: 'text-primary',  bg: 'bg-primary/10',  border: 'border-primary/30' },
  { value: 'completed',  label: 'Completed',       color: 'text-success',  bg: 'bg-success/10',  border: 'border-success/30' },
];

const PRIORITY_COLORS = {
  high:   { dot: 'bg-danger',   badge: 'text-danger border-danger/30 bg-danger/10' },
  medium: { dot: 'bg-warning',  badge: 'text-warning border-warning/30 bg-warning/10' },
  low:    { dot: 'bg-primary',  badge: 'text-primary border-primary/30 bg-primary/10' },
};

const MaintenanceLogs = () => {
  const [tickets, setTickets]           = useState([]);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu]           = useState(null); // { ticket, x, y }
  const ctxRef                          = useRef(null);

  // Detail modal
  const [detailTicket, setDetailTicket] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Get all tickets when page mounts
  useEffect(() => {
    fetchTickets();
  }, []);

  // Background auto-refresh loop (20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTickets(true);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Retrieve tickets list from backend
  const fetchTickets = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token  = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.get('http://localhost:5000/api/maintenance', config);
      setTickets(response.data);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      if (!silent) showToast('Failed to fetch tickets', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchTickets();
      showToast('✓ Tickets list updated.');
    } catch (err) {
      console.error(err);
      showToast('Failed to refresh tickets.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTicketAdded = (newTicket) => {
    setTickets(prev => [newTicket, ...prev]);
    showToast(`Ticket ${newTicket.ticket_id} created successfully.`);
  };

  // Update the status of a specific ticket (e.g. to in-progress or completed)
  const setStatus = async (ticketId, newStatus) => {
    try {
      const token  = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      const response = await axios.put(
        `http://localhost:5000/api/maintenance/${ticketId}`,
        { status: newStatus },
        config
      );
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: response.data.status } : t));
      const label = STATUS_OPTIONS.find(s => s.value === newStatus)?.label;
      showToast(`Status updated to "${label}"`);
    } catch (error) {
      console.error('Error updating ticket status:', error);
      showToast('Failed to update status', 'error');
    }
    setCtxMenu(null);
  };

  // Delete ticket record
  const deleteTicket = async (ticket) => {
    if (!window.confirm(`Permanently delete ticket ${ticket.ticket_id}? This cannot be undone.`)) return;
    try {
      const token  = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      await axios.delete(`http://localhost:5000/api/maintenance/${ticket.id}`, config);
      setTickets(prev => prev.filter(t => t.id !== ticket.id));
      showToast(`Ticket ${ticket.ticket_id} deleted from database.`);
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete ticket from database.', 'error');
    }
    setCtxMenu(null);
    setDetailTicket(null);
  };

  // Open options menu when right clicking a ticket
  const openCtxMenu = (e, ticket) => {
    e.preventDefault();
    setCtxMenu({ ticket, x: e.clientX, y: e.clientY });
  };

  const pendingTickets    = tickets.filter(t => t.status === 'pending');
  const inProgressTickets = tickets.filter(t => t.status === 'in_progress');
  const completedTickets  = tickets.filter(t => t.status === 'completed');

  const TicketCard = ({ ticket }) => {
    const prio = PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.low;
    return (
      <div
        onContextMenu={(e) => openCtxMenu(e, ticket)}
        onClick={() => setDetailTicket(ticket)}
        className="bg-slate-800/80 border border-slate-700 p-3 rounded-lg w-full text-left hover:border-primary/50 transition-all shadow-lg cursor-pointer mb-3 relative overflow-hidden group"
      >
        {/* Hover hint */}
        <div className="absolute top-0 right-0 bg-primary/20 text-primary text-[8px] font-bold px-2 py-1 rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity font-mono">
          RIGHT-CLICK TO MANAGE
        </div>

        {/* Header row */}
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded">{ticket.ticket_id}</span>
          <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${prio.badge}`}>
            {ticket.priority}
          </span>
        </div>

        <h4 className="text-white text-sm font-bold mb-1 leading-tight">{ticket.title}</h4>
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
          {ticket.description || 'No description provided'}
        </p>

        {ticket.asset_code && (
          <div className="text-[10px] font-mono text-primary/70 bg-primary/5 border border-primary/10 px-2 py-1 rounded mb-2">
            🖥 {ticket.asset_code} — {ticket.brand} {ticket.model}
          </div>
        )}

        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
          {ticket.assigned_to_name && (
            <span className="text-slate-500">👤 {ticket.assigned_to_name}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col relative">

      {/* ── Toast ─────────────────────────────────── */}
      {toast && (
        <div className={`absolute top-0 right-0 px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-[100] border font-mono text-sm font-bold ${
          toast.type === 'error'   ? 'bg-danger/10 border-danger/30 text-danger' :
          toast.type === 'warning' ? 'bg-warning/10 border-warning/30 text-warning' :
          'bg-success/10 border-success/30 text-success'
        }`}>
          {toast.type === 'error' ? <FiAlertCircle /> : <FiCheckCircle />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ──────────────────────────────────── */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiTool className="text-primary" /> MAINTENANCE <span className="text-primary">LOGS</span>
          </h1>
          <p className="text-slate-400 text-sm">Right-click any ticket to change status or delete • Click to view details</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs font-mono">
            <span className="bg-warning/10 border border-warning/20 text-warning px-3 py-1.5 rounded-lg">{pendingTickets.length} Pending</span>
            <span className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-lg">{inProgressTickets.length} In Repair</span>
            <span className="bg-success/10 border border-success/20 text-success px-3 py-1.5 rounded-lg">{completedTickets.length} Done</span>
          </div>
          <button 
            onClick={handleManualRefresh}
            disabled={isRefreshing || loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Refresh Tickets"
          >
            <FiRefreshCw className={`text-base ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary text-sm py-2 px-6">
            + CREATE TICKET
          </button>
        </div>
      </div>

      {/* ── Kanban Board ──────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 min-h-0">

        {/* Column 1: Pending Triage */}
        <div className="glass-panel flex flex-col border-t-4 border-t-warning">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-warning/5 rounded-t-xl">
            <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <FiAlertCircle className="text-warning" /> Pending Triage
            </h3>
            <span className="bg-warning/20 text-warning text-xs px-2 py-1 rounded font-mono border border-warning/30">{pendingTickets.length}</span>
          </div>
          <div className="flex-1 p-4 flex flex-col overflow-y-auto bg-black/20">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-warning border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pendingTickets.length === 0 ? (
              <div className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center opacity-50 mt-6">
                <span className="text-xs font-mono uppercase text-slate-500">No Pending Tickets</span>
              </div>
            ) : (
              pendingTickets.map(t => <TicketCard key={t.id} ticket={t} />)
            )}
          </div>
        </div>

        {/* Column 2: In Repair */}
        <div className="glass-panel flex flex-col border-t-4 border-t-primary">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-primary/5 rounded-t-xl">
            <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <FiClock className="text-primary" /> In Repair
            </h3>
            <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded font-mono border border-primary/30">{inProgressTickets.length}</span>
          </div>
          <div className="flex-1 p-4 flex flex-col overflow-y-auto bg-black/20">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : inProgressTickets.length === 0 ? (
              <div className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center opacity-50 mt-6">
                <span className="text-xs font-mono uppercase text-slate-500">No Tickets In Repair</span>
              </div>
            ) : (
              inProgressTickets.map(t => <TicketCard key={t.id} ticket={t} />)
            )}
          </div>
        </div>

        {/* Column 3: Completed */}
        <div className="glass-panel flex flex-col border-t-4 border-t-success">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-success/5 rounded-t-xl">
            <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
              <FiCheckCircle className="text-success" /> Completed
            </h3>
            <span className="bg-success/20 text-success text-xs px-2 py-1 rounded font-mono border border-success/30">{completedTickets.length}</span>
          </div>
          <div className="flex-1 p-4 flex flex-col overflow-y-auto bg-black/20">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-success border-t-transparent rounded-full animate-spin" />
              </div>
            ) : completedTickets.length === 0 ? (
              <div className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center opacity-50 mt-6">
                <span className="text-xs font-mono uppercase text-slate-500">No Completed Tickets</span>
              </div>
            ) : (
              completedTickets.map(t => <TicketCard key={t.id} ticket={t} />)
            )}
          </div>
        </div>
      </div>

      {/* ── Context Menu ─────────────────────────────────── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-[200] w-56 glass-panel border border-slate-600 shadow-[0_0_30px_rgba(0,0,0,0.8)] py-1 animate-[fadeIn_0.12s_ease-out]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-slate-700 mb-1">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Manage Ticket</div>
            <div className="text-xs font-bold text-white truncate">{ctxMenu.ticket.ticket_id}</div>
          </div>

          {/* Status options */}
          <div className="px-2 mb-1">
            <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest px-1 mb-1">Set Status</div>
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatus(ctxMenu.ticket.id, opt.value)}
                disabled={ctxMenu.ticket.status === opt.value}
                className={`w-full text-left px-3 py-2 rounded text-xs font-mono flex items-center gap-2 transition-colors ${
                  ctxMenu.ticket.status === opt.value
                    ? `${opt.bg} ${opt.color} cursor-default font-bold`
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {ctxMenu.ticket.status === opt.value ? (
                  <FiCheckCircle className={`${opt.color} text-sm`} />
                ) : (
                  <FiChevronRight className="text-slate-600 text-sm" />
                )}
                {opt.label}
                {ctxMenu.ticket.status === opt.value && <span className="ml-auto text-[9px] font-bold">CURRENT</span>}
              </button>
            ))}
          </div>

          {/* Delete */}
          <div className="px-2 pt-1 border-t border-slate-700 mt-1">
            <button
              onClick={() => deleteTicket(ctxMenu.ticket)}
              className="w-full text-left px-3 py-2 rounded text-xs font-mono flex items-center gap-2 text-danger hover:bg-danger/10 transition-colors"
            >
              <FiTrash2 className="text-sm" /> Delete from Database
            </button>
          </div>
        </div>
      )}

      {/* ── Ticket Detail Modal ──────────────────────────── */}
      {detailTicket && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDetailTicket(null)}>
          <div
            className="glass-panel w-full max-w-lg p-6 relative border-t-4 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-[fadeIn_0.2s_ease-out]"
            style={{ borderTopColor: detailTicket.status === 'completed' ? '#00ff66' : detailTicket.status === 'in_progress' ? '#00f0ff' : '#f59e0b' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setDetailTicket(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <FiX className="text-xl" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <FiTool className="text-primary text-2xl" />
              <div>
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">{detailTicket.ticket_id}</div>
                <h2 className="text-xl font-bold text-white">{detailTicket.title}</h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Status</div>
                <div className={`text-sm font-bold font-mono ${detailTicket.status === 'completed' ? 'text-success' : detailTicket.status === 'in_progress' ? 'text-primary' : 'text-warning'}`}>
                  {STATUS_OPTIONS.find(s => s.value === detailTicket.status)?.label}
                </div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Priority</div>
                <div className={`text-sm font-bold font-mono uppercase ${PRIORITY_COLORS[detailTicket.priority]?.badge?.split(' ')[0]}`}>
                  {detailTicket.priority}
                </div>
              </div>
              {detailTicket.asset_code && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 col-span-2">
                  <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Target Asset</div>
                  <div className="text-sm font-bold text-primary font-mono">{detailTicket.asset_code} — {detailTicket.brand} {detailTicket.model}</div>
                </div>
              )}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Created</div>
                <div className="text-xs text-slate-300 font-mono">{new Date(detailTicket.created_at).toLocaleString()}</div>
              </div>
              {detailTicket.assigned_to_name && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Assigned To</div>
                  <div className="text-xs text-slate-300 font-mono">{detailTicket.assigned_to_name}</div>
                </div>
              )}
            </div>

            {detailTicket.description && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mb-5">
                <div className="text-[10px] font-mono text-slate-500 uppercase mb-2">Description</div>
                <p className="text-sm text-slate-300 leading-relaxed">{detailTicket.description}</p>
              </div>
            )}

            {/* Quick status actions */}
            <div className="flex gap-2 flex-wrap mb-4">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setStatus(detailTicket.id, opt.value); setDetailTicket(prev => ({ ...prev, status: opt.value })); }}
                  disabled={detailTicket.status === opt.value}
                  className={`px-4 py-1.5 rounded text-xs font-mono font-bold border transition-all ${
                    detailTicket.status === opt.value
                      ? `${opt.bg} ${opt.color} ${opt.border} cursor-default`
                      : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-700">
              <button
                onClick={() => deleteTicket(detailTicket)}
                className="flex items-center gap-2 text-xs font-mono text-danger hover:text-white hover:bg-danger px-4 py-2 rounded transition-all border border-danger/30"
              >
                <FiTrash2 /> DELETE FROM DATABASE
              </button>
            </div>
          </div>
        </div>
      )}

      <AddTicketModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onTicketAdded={handleTicketAdded} />
    </div>
  );
};

export default MaintenanceLogs;
