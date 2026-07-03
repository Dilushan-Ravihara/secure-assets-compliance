import { useState, useEffect } from 'react';
import { FiMapPin, FiSearch, FiAlertTriangle, FiNavigation, FiTag, FiActivity, FiCompass, FiCrosshair } from 'react-icons/fi';
import axios from 'axios';
import { socket } from '../../services/socket';

const OFFICE_COORDINATES = {
  'colombo head office': { lat: 6.9271, lon: 79.8612 },
  'colombo hq': { lat: 6.9271, lon: 79.8612 },
  'colombo': { lat: 6.9271, lon: 79.8612 },
  'kandy lab': { lat: 7.2906, lon: 80.6337 },
  'kandy branch': { lat: 7.2906, lon: 80.6337 },
  'kandy': { lat: 7.2906, lon: 80.6337 },
  'galle office': { lat: 6.0535, lon: 80.2117 },
  'galle': { lat: 6.0535, lon: 80.2117 },
  'server room b': { lat: 6.9312, lon: 79.8422 },
  'smart lab annex': { lat: 6.9152, lon: 79.8824 },
  'kandy control gateway': { lat: 7.2985, lon: 80.6212 },
  'corporate hq floor 2': { lat: 6.9288, lon: 79.8550 },
  'hq': { lat: 6.9271, lon: 79.8612 }
};

const GeoTracking = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredAsset, setHoveredAsset] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Retrieve assets and telemetry list from API
  const fetchLocations = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      
      const [assetsRes, telemetryRes] = await Promise.all([
        axios.get('http://localhost:5000/api/assets?limit=100', config),
        axios.get('http://localhost:5000/api/telemetry/latest', config)
      ]);

      const assetsData = assetsRes.data.data || [];
      const telemetryData = telemetryRes.data || [];

      // Merge telemetry latitude/longitude and stats into assets
      const merged = assetsData.map(asset => {
        const tel = telemetryData.find(t => t.device_id === asset.asset_id);
        if (tel) {
          return {
            ...asset,
            latitude: tel.latitude,
            longitude: tel.longitude,
            location: tel.location || asset.location,
            risk_score: tel.risk_score,
            risk_level: tel.risk_level
          };
        }
        return asset;
      });

      // Append telemetry items that are NOT in assets
      telemetryData.forEach(tel => {
        const exists = merged.some(a => a.asset_id === tel.device_id);
        if (!exists) {
          merged.push({
            id: tel.device_id,
            asset_id: tel.device_id,
            brand: 'IoT EDR',
            model: tel.device_name || 'Device',
            category: 'IoT Device',
            status: tel.status || 'in_use',
            location: tel.location || 'Unknown',
            latitude: tel.latitude,
            longitude: tel.longitude,
            risk_score: tel.risk_score,
            risk_level: tel.risk_level
          });
        }
      });

      setAssets(merged);
    } catch (err) {
      console.error("Failed to fetch locations", err);
    } finally {
      setLoading(false);
    }
  };

  // Load locations and listen to WebSocket updates in real-time
  useEffect(() => {
    fetchLocations();

    // Listen to telemetry updates
    socket.on('live-update', (updatedDev) => {
      setAssets(prev => {
        const exists = prev.some(a => a.asset_id === updatedDev.device_id);
        if (exists) {
          return prev.map(a => a.asset_id === updatedDev.device_id ? {
            ...a,
            latitude: updatedDev.latitude,
            longitude: updatedDev.longitude,
            location: updatedDev.location || a.location,
            status: updatedDev.status || a.status,
            risk_score: updatedDev.risk_score,
            risk_level: updatedDev.risk_level
          } : a);
        } else {
          return [
            ...prev,
            {
              id: updatedDev.device_id,
              asset_id: updatedDev.device_id,
              brand: 'IoT EDR',
              model: updatedDev.device_name || 'Device',
              category: 'IoT Device',
              status: updatedDev.status || 'ONLINE',
              location: updatedDev.location || 'Unknown',
              latitude: updatedDev.latitude,
              longitude: updatedDev.longitude,
              risk_score: updatedDev.risk_score,
              risk_level: updatedDev.risk_level
            }
          ];
        }
      });
    });

    socket.on('telemetry-update', (updatedDev) => {
      setAssets(prev => {
        const exists = prev.some(a => a.asset_id === updatedDev.device_id);
        if (exists) {
          return prev.map(a => a.asset_id === updatedDev.device_id ? {
            ...a,
            latitude: updatedDev.latitude,
            longitude: updatedDev.longitude,
            location: updatedDev.location || a.location,
            status: updatedDev.status || a.status,
            risk_score: updatedDev.risk_score,
            risk_level: updatedDev.risk_level
          } : a);
        } else {
          return [
            ...prev,
            {
              id: updatedDev.device_id,
              asset_id: updatedDev.device_id,
              brand: 'IoT EDR',
              model: updatedDev.device_name || 'Device',
              category: 'IoT Device',
              status: updatedDev.status || 'ONLINE',
              location: updatedDev.location || 'Unknown',
              latitude: updatedDev.latitude,
              longitude: updatedDev.longitude,
              risk_score: updatedDev.risk_score,
              risk_level: updatedDev.risk_level
            }
          ];
        }
      });
    });

    socket.on('device-offline', (payload) => {
      setAssets(prev => prev.map(a => a.asset_id === payload.device_id ? { ...a, status: 'offline' } : a));
    });

    socket.on('device-removed', (payload) => {
      setAssets(prev => prev.filter(a => a.asset_id !== payload.device_id));
    });

    return () => {
      socket.off('live-update');
      socket.off('telemetry-update');
      socket.off('device-offline');
      socket.off('device-removed');
    };
  }, []);

  const missingAssets = assets.filter(a => a.status === 'lost' || a.status === 'stolen').length;
  
  // Count how many assets are in each location
  const locations = assets.reduce((acc, asset) => {
    const loc = asset.location || 'Unknown';
    acc[loc] = (acc[loc] || 0) + 1;
    return acc;
  }, {});

  const topLocations = Object.entries(locations).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Hash code helper for static plotting
  const hashCode = (str) => {
    if (!str) return 0;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  // Helper to resolve coordinates
  const getCoordinates = (asset) => {
    if (asset.latitude !== undefined && asset.latitude !== null && asset.longitude !== undefined && asset.longitude !== null) {
      return { lat: parseFloat(asset.latitude), lon: parseFloat(asset.longitude), isLive: true };
    }
    // Check standard office catalog
    const locStr = (asset.location || '').toLowerCase().trim();
    if (OFFICE_COORDINATES[locStr]) {
      return { ...OFFICE_COORDINATES[locStr], isLive: false };
    }
    // Static coordinate distribution to avoid overlapping
    const hash = hashCode(asset.asset_id || asset.id.toString());
    const fallbackLat = 6.9271 + ((hash % 100) / 2000) - 0.025;
    const fallbackLon = 79.8612 + (((hash >> 7) % 100) / 2000) - 0.025;
    return { lat: fallbackLat, lon: fallbackLon, isLive: false };
  };

  // Filter assets
  const filteredAssets = assets.filter(asset => {
    const q = searchQuery.toLowerCase();
    return (
      asset.asset_id?.toLowerCase().includes(q) ||
      asset.brand?.toLowerCase().includes(q) ||
      asset.model?.toLowerCase().includes(q) ||
      asset.location?.toLowerCase().includes(q)
    );
  });

  // Map coordinate coordinates
  const plottedAssets = filteredAssets.map(asset => ({
    ...asset,
    coords: getCoordinates(asset)
  }));

  // Find dynamic coordinate bounds
  let minLat = 5.9, maxLat = 9.9;
  let minLon = 79.5, maxLon = 81.9;

  if (plottedAssets.length > 0) {
    const lats = plottedAssets.map(a => a.coords.lat);
    const lons = plottedAssets.map(a => a.coords.lon);

    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lonSpan = Math.max(...lons) - Math.min(...lons);

    if (latSpan < 0.03) {
      minLat = Math.min(...lats) - 0.02;
      maxLat = Math.max(...lats) + 0.02;
    } else {
      minLat = Math.min(...lats) - latSpan * 0.15;
      maxLat = Math.max(...lats) + latSpan * 0.15;
    }

    if (lonSpan < 0.03) {
      minLon = Math.min(...lons) - 0.02;
      maxLon = Math.max(...lons) + 0.02;
    } else {
      minLon = Math.min(...lons) - lonSpan * 0.15;
      maxLon = Math.max(...lons) + lonSpan * 0.15;
    }
  }

  const getXY = (coords) => {
    // Lat increases upwards, Screen Y increases downwards
    const y = 85 - ((coords.lat - minLat) / (maxLat - minLat)) * 70;
    const x = 10 + ((coords.lon - minLon) / (maxLon - minLon)) * 80;
    return {
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y))
    };
  };

  return (
    <div className="animate-[fadeIn_0.5s_ease-out] h-full flex flex-col">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-wide font-mono flex items-center gap-3">
            <FiMapPin className="text-primary" /> GEO-SATELLITE <span className="text-primary">LIVE TRACKING</span>
          </h1>
          <p className="text-slate-400 text-sm">Real-time GPS coordinate telemetry monitoring for active network devices</p>
        </div>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text" 
            placeholder="Locate specific device ID..." 
            className="cyber-input pl-10 w-64 text-white" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-6 min-h-[600px]">
        {/* Vector Map Grid Panel */}
        <div className="flex-1 glass-panel relative overflow-hidden bg-[#050b14] border-t-2 border-t-primary min-h-[400px]">
          {/* Neon grid overlay */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}></div>

          <div className="absolute top-2 left-2 text-[9px] font-mono text-primary/40 select-none">
            GRID // SATELLITE_LINK_ACTIVE // VIEWPORT: Sri Lanka GPS Grid
          </div>

          {/* Radar Circles */}
          <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] -ml-[400px] -mt-[400px] border border-primary/5 rounded-full pointer-events-none"></div>
          <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] -ml-[250px] -mt-[250px] border border-primary/10 rounded-full pointer-events-none"></div>
          <div className="absolute top-1/2 left-1/2 w-[200px] h-[200px] -ml-[100px] -mt-[100px] border border-primary/20 rounded-full pointer-events-none"></div>

          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-darkBase/50 backdrop-blur-sm z-30">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="font-mono text-xs text-primary tracking-widest animate-pulse">CONNECTING GPS TELEMETRY...</span>
              </div>
            </div>
          ) : plottedAssets.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center p-8 bg-darkBase/85 border border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] text-center">
                <FiNavigation className="text-4xl text-warning mb-3 animate-pulse" />
                <h3 className="font-mono text-white text-sm mb-1">NO TELEMETRY RECORDED</h3>
                <p className="text-xs text-slate-500 max-w-xs">Run the python device agent to start broadcasting coordinates.</p>
              </div>
            </div>
          ) : (
            plottedAssets.map((asset) => {
              const { x, y } = getXY(asset.coords);
              const isStolen = asset.status === 'lost' || asset.status === 'stolen';
              const isRepair = asset.status === 'repair';
              const isOffline = asset.status?.toLowerCase() === 'offline';
              const isSelected = selectedAsset && selectedAsset.asset_id === asset.asset_id;

              return (
                <div
                  key={asset.id}
                  className="absolute cursor-pointer transition-all duration-300 z-10"
                  style={{ 
                    left: `${x}%`, 
                    top: `${y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  onMouseEnter={() => setHoveredAsset(asset)}
                  onMouseLeave={() => setHoveredAsset(null)}
                  onClick={() => setSelectedAsset(asset)}
                >
                  {/* Neon Target Scope for Selected Asset */}
                  {isSelected && (
                    <div className="absolute -inset-4 border border-dashed border-primary rounded-full animate-spin pointer-events-none flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    </div>
                  )}

                  {/* Ping Animation for Live GPS Tracked assets */}
                  {(asset.coords.isLive && !isOffline) && (
                    <div className={`absolute -inset-3.5 rounded-full animate-ping border opacity-60 pointer-events-none ${isStolen ? 'border-danger' : 'border-success'}`}></div>
                  )}

                  {/* Node Dot marker */}
                  <div className={`w-3.5 h-3.5 rounded-full border border-darkBase shadow-xl relative ${
                    isStolen ? 'bg-danger shadow-[0_0_12px_rgba(255,0,60,0.9)]' : 
                    isRepair ? 'bg-warning shadow-[0_0_12px_rgba(255,183,0,0.9)]' :
                    isOffline ? 'bg-slate-600 shadow-none opacity-60' :
                    'bg-success shadow-[0_0_12px_rgba(0,255,102,0.9)]'
                  }`}>
                    {/* Small inner core for live status */}
                    <div className={`absolute inset-1 rounded-full bg-white ${asset.coords.isLive ? 'animate-pulse' : 'opacity-30'}`}></div>
                  </div>
                </div>
              );
            })
          )}

          {/* Map Hover Tooltip popup */}
          {hoveredAsset && (
            <div className="absolute bottom-4 left-4 z-40 bg-darkBase/95 border border-slate-700 p-4 rounded-lg shadow-2xl max-w-xs animate-[fadeIn_0.15s_ease-out] backdrop-blur font-mono text-xs">
              <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-800">
                <FiCompass className="text-primary text-xs animate-spin" />
                <span className="font-bold text-white tracking-wider uppercase">{hoveredAsset.asset_id}</span>
                {hoveredAsset.coords.isLive && (
                  <span className="text-[8px] bg-primary/10 border border-primary/30 text-primary px-1 rounded font-bold uppercase tracking-widest animate-pulse">LIVE GPS</span>
                )}
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <FiTag className="text-slate-500" />
                  <span>{hoveredAsset.brand} {hoveredAsset.model}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <FiMapPin className="text-slate-500" />
                  <span>{hoveredAsset.location || 'Unknown location'}</span>
                </div>
                <div className="text-primary/70 font-semibold text-[9px] pt-1">
                  LAT: {hoveredAsset.coords.lat.toFixed(6)} <br />
                  LON: {hoveredAsset.coords.lon.toFixed(6)}
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-6 right-6 flex flex-wrap gap-2 text-[10px] font-mono z-20">
            <span className="badge-safe bg-slate-900/90 border-slate-800 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success inline-block mr-1.5"></span> ONLINE</span>
            <span className="badge-safe bg-slate-900/90 border-slate-800 text-warning"><span className="w-1.5 h-1.5 rounded-full bg-warning inline-block mr-1.5"></span> IN REPAIR</span>
            <span className="badge-safe bg-slate-900/90 border-slate-800 text-danger"><span className="w-1.5 h-1.5 rounded-full bg-danger inline-block mr-1.5"></span> LOST</span>
            <span className="badge-safe bg-slate-900/90 border-slate-800 text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block mr-1.5"></span> OFFLINE</span>
          </div>
        </div>

        {/* Selected Target details side panel */}
        <div className="w-full lg:w-80 flex flex-col gap-6 font-mono">
          {selectedAsset ? (
            <div className="glass-panel p-6 border-l-4 border-l-primary flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <FiCrosshair className="text-primary animate-pulse" /> TARGET LOCK
                </h3>
                <button onClick={() => setSelectedAsset(null)} className="text-[10px] text-slate-500 hover:text-white border border-slate-800 px-2 py-0.5 rounded">CLEAR</button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block">Host ID</span>
                  <span className="text-white font-bold text-sm">{selectedAsset.asset_id}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">Risk Factor</span>
                    <span className={`font-bold ${selectedAsset.risk_score >= 70 ? 'text-danger' : selectedAsset.risk_score >= 40 ? 'text-warning' : 'text-success'}`}>
                      {selectedAsset.risk_score !== undefined ? `${selectedAsset.risk_score}%` : 'nominal'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">Telemetry IP</span>
                    <span className="text-slate-300 font-bold">{selectedAsset.ip_address || '192.168.1.X'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[9px] text-slate-500 uppercase block">GPS Latitude</span>
                  <span className="text-primary text-[11px] font-bold">{getCoordinates(selectedAsset).lat.toFixed(6)} N</span>
                </div>

                <div>
                  <span className="text-[9px] text-slate-500 uppercase block">GPS Longitude</span>
                  <span className="text-primary text-[11px] font-bold">{getCoordinates(selectedAsset).lon.toFixed(6)} E</span>
                </div>

                <div>
                  <span className="text-[9px] text-slate-500 uppercase block">Office Location Name</span>
                  <span className="text-slate-350 text-[11px] font-bold flex items-center gap-1">
                    <FiMapPin className="text-slate-500" /> {selectedAsset.location || 'Unknown'}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg flex items-start gap-2.5">
                  <FiActivity className="text-success mt-0.5 animate-pulse" />
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">Satellite Status</span>
                    <span className="text-success text-[10px] uppercase font-bold">Transmitting telemetry packets</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`glass-panel p-6 border-l-4 flex flex-col justify-between ${missingAssets > 0 ? 'border-l-danger bg-danger/5' : 'border-l-success bg-success/5'}`}>
              <h3 className={`font-bold mb-4 flex items-center gap-2 uppercase tracking-wider text-sm ${missingAssets > 0 ? 'text-danger' : 'text-success'}`}>
                <FiAlertTriangle className={missingAssets > 0 ? 'animate-bounce' : ''} /> Lost / Stolen Assets
              </h3>
              <div className={`flex flex-col items-center justify-center py-6 border border-dashed rounded-lg bg-darkBase/30 ${missingAssets > 0 ? 'border-danger/30 text-danger' : 'border-success/30 text-success'}`}>
                <span className="text-5xl mb-2 font-bold">{missingAssets}</span>
                <p className="text-[10px] uppercase tracking-widest">{missingAssets > 0 ? 'Action Required' : 'No Missing Assets'}</p>
              </div>
            </div>
          )}
          
          <div className="glass-panel p-6 border-l-4 border-l-primary flex-1 flex flex-col">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 uppercase tracking-wider text-sm">
              <FiCompass className="text-primary animate-spin" /> Active GPS Zones
            </h3>
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar">
              {loading ? (
                <div className="flex justify-center mt-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : topLocations.length > 0 ? (
                topLocations.map(([loc, count], idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-350 truncate pr-2" title={loc}>{loc}</span>
                    <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">{count}</span>
                  </div>
                ))
              ) : (
                <div className="opacity-40 filter blur-[1px] space-y-4">
                  <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                    <span className="text-slate-400">HQ - Colombo</span>
                    <span className="text-white">—</span>
                  </div>
                </div>
              )}
            </div>
            {topLocations.length === 0 && !loading && (
              <p className="text-[9px] text-center text-slate-500 mt-6 uppercase tracking-widest">Awaiting active GPS coordinates...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeoTracking;
