import { useState, useEffect, useCallback } from 'react';
import { FiList, FiSearch, FiUser, FiClock, FiFilter, FiRefreshCw, FiChevronLeft, FiChevronRight, FiShield, FiBox, FiCpu } from 'react-icons/fi';
import axios from 'axios';

// Color and icon mapping for different action types
const ACTION_META = {
  'Security Check Uploaded':   { color: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/30',  icon: FiShield },
  'Device Restart Triggered':  { color: 'text-primary',  bg: 'bg-primary/10',  border: 'border-primary/30',  icon: FiCpu },
  'Device Shutdown Triggered': { color: 'text-danger',   bg: 'bg-danger/10',   border: 'border-danger/30',   icon: FiCpu },
  'Firmware Update Triggered': { color: 'text-success',  bg: 'bg-success/10',  border: 'border-success/30',  icon: FiCpu },
  'default':                   { color: 'text-slate-400',bg: 'bg-slate-800',   border: 'border-slate-700',   icon: FiList },
};

const getActionMeta = (action) => ACTION_META[action] || ACTION_META['default'];

const AuditLog = () => {
  const [logs, setLogs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expanded, setExpanded]   = useState(null);
  const LIMIT = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.append('search', search);
      if (actionFilter !== 'all') params.append('action', actionFilter);

      const res = await axios.get(`http://localhost:5000/api/dashboard/audit-logs-full?${params}`, config);
      setLogs(res.data.logs || res.data || []);
      setTotal(res.data.total || res.data?.length || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      // Fallback to the basic endpoint
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('http://localhost:5000/api/dashboard/audit-logs', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLogs(res.data || []);
        setTotal(res.data?.length || 0);
      } catch (e) {
        console.error('Fallback audit log fetch failed:', e);
        setLogs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT) || 1;

  const formatTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const timeAgo = (dateStr) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'Just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    } catch { return ''; }
  };

  const uniqueActions = ['all', ...new Set(logs.map(l => l.action).filter(Boolean))];

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiList className="text-primary" /> SYSTEM <span className="text-primary">AUDIT LOG</span>
          </h1>
          <p className="text-slate-400 text-sm">Full chronological record of all actions performed in the system</p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-primary text-slate-300 hover:text-white rounded-lg transition-all text-sm font-mono"
        >
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> REFRESH
        </button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Log Entries', value: total || logs.length, color: 'text-primary', border: 'border-t-primary' },
          { label: 'This Page', value: logs.length, color: 'text-white', border: 'border-t-slate-600' },
          { label: 'Unique Users', value: new Set(logs.map(l => l.user_id).filter(Boolean)).size, color: 'text-success', border: 'border-t-success' },
        ].map(s => (
          <div key={s.label} className={`glass-panel p-4 border-t-2 ${s.border}`}>
            <div className={`text-2xl font-mono font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 mb-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[220px] max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by action or entity..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="cyber-input pl-10 w-full text-sm"
          />
        </form>
        <div className="flex items-center gap-2">
          <FiFilter className="text-slate-500 text-sm" />
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="cyber-input text-sm py-2 min-w-[200px]"
          >
            {uniqueActions.map(a => (
              <option key={a} value={a}>{a === 'all' ? 'All Action Types' : a}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-xs font-mono text-slate-500">
          Page <span className="text-white font-bold">{page}</span> of <span className="text-white font-bold">{totalPages}</span>
        </div>
      </div>

      {/* Log Table */}
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <FiList className="text-5xl mb-4 opacity-20" />
              <p className="font-mono text-sm">NO AUDIT LOG ENTRIES FOUND</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {logs.map((log, i) => {
                const meta = getActionMeta(log.action);
                const Icon = meta.icon;
                const isOpen = expanded === i;
                return (
                  <div key={log.id || i}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className="w-full text-left px-6 py-4 hover:bg-white/[0.02] transition-colors flex items-center gap-4"
                    >
                      {/* Action badge */}
                      <div className={`flex-shrink-0 p-2 rounded-lg border ${meta.bg} ${meta.border}`}>
                        <Icon className={`text-sm ${meta.color}`} />
                      </div>

                      {/* Action info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className={`text-sm font-bold font-mono ${meta.color}`}>{log.action}</span>
                          {log.entity && (
                            <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded font-mono">
                              {log.entity}{log.entity_id ? `: ${log.entity_id}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                          <span className="flex items-center gap-1">
                            <FiUser className="text-[10px]" />
                            {log.user_name || `User #${log.user_id}` || 'System'}
                          </span>
                          {log.ip_address && (
                            <span className="text-slate-600">IP: {log.ip_address}</span>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-slate-300 font-mono">{timeAgo(log.created_at)}</div>
                        <div className="text-[10px] text-slate-600 font-mono flex items-center gap-1 justify-end mt-1">
                          <FiClock className="text-[9px]" /> {formatTime(log.created_at)}
                        </div>
                      </div>

                      <span className={`text-slate-600 transition-transform ${isOpen ? 'rotate-90' : ''} text-xs ml-2 flex-shrink-0`}>▶</span>
                    </button>

                    {/* Expanded detail panel */}
                    {isOpen && log.details && (
                      <div className="px-6 pb-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="ml-10 p-4 bg-slate-950/70 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300">
                          <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-2 font-bold">Event Details</div>
                          <pre className="whitespace-pre-wrap break-words text-success/90 leading-relaxed">
                            {typeof log.details === 'string'
                              ? JSON.stringify(JSON.parse(log.details), null, 2)
                              : JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="border-t border-slate-800 p-4 flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-mono"
          >
            <FiChevronLeft /> PREV
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i));
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-lg text-sm font-mono font-bold transition-colors ${p === page ? 'bg-primary text-black' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-mono"
          >
            NEXT <FiChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
