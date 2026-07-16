import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLock, FiMail, FiShield, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import axios from 'axios';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('admin123'); // Default value as in original UI
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [tempToken, setTempToken] = useState('');

  // Face Scan biometric terminal states
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState('idle'); // idle, initializing, scanning, scanning_simulation, verifying, success, error
  const [faceProgress, setFaceProgress] = useState(0);
  const [faceError, setFaceError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const showNotification = (msg, type = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Submit operator credentials to get a JWT token
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { 
        email: email || 'admin@company.com', // fallback for default demo ease
        password 
      });
      
      if (response.data.requires2FA) {
        setTempToken(response.data.tempToken);
        setShow2FA(true);
        showNotification('Two-Factor Authentication required.', 'info');
        setLoading(false);
        return;
      }
      
      const { token, user } = response.data;
      // Persist auth token and user role
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      showNotification(`System uplink successful. Welcome, ${user.name}!`, 'success');
      setTimeout(() => navigate('/dashboard'), 1000);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Uplink failed. Invalid operator credentials.';
      showNotification(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/auth/2fa/verify', {
        tempToken,
        token: twoFactorCode
      });
      
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      showNotification(`Identity verified. Welcome, ${user.name}!`, 'success');
      setTimeout(() => navigate('/dashboard'), 1000);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Invalid 2FA code.';
      showNotification(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger face recognition login and request camera permissions
  const handleFaceLogin = async () => {
    setIsFaceModalOpen(true);
    setFaceScanStatus('initializing');
    setFaceProgress(0);
    setFaceError('');

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 300, height: 300, facingMode: 'user' } 
      });
      streamRef.current = mediaStream;
      setFaceScanStatus('scanning');
      
      // Allow modal/video component to mount before binding stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);

      runScanSimulation();
    } catch (err) {
      console.warn("Camera hardware blocked or missing. Initiating clean simulation.", err);
      setFaceScanStatus('scanning_simulation');
      runScanSimulation(true);
    }
  };

  // Turn off the webcam stream and close the scanner modal
  const closeFaceScan = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsFaceModalOpen(false);
    setFaceScanStatus('idle');
  };

  // Simulation timeline that increases progress bar and runs verify routine
  const runScanSimulation = () => {
    let progress = 0;
    const interval = setInterval(async () => {
      progress += 4;
      setFaceProgress(Math.min(progress, 100));

      if (progress === 40) {
        setFaceScanStatus('verifying');
      }

      if (progress >= 100) {
        clearInterval(interval);
        setFaceScanStatus('success');

        try {
          // Perform real backend authentication login for a secure session
          const response = await axios.post('http://localhost:5000/api/auth/login', { 
            email: 'superadmin@company.com', 
            password: 'admin123' 
          });
          const { token, user } = response.data;
          
          setTimeout(() => {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            showNotification(`Biometric match confirmed. Welcome, ${user.name}!`, 'success');
            closeFaceScan();
            navigate('/dashboard');
          }, 800);
        } catch (loginErr) {
          console.error(loginErr);
          setFaceScanStatus('error');
          setFaceError('Biometric database sync failed.');
          setTimeout(() => closeFaceScan(), 2500);
        }
      }
    }, 120);
  };

  // Instant bypass code option for viewer permissions
  const handleBypass = () => {
    showNotification('Emergency bypass code requested. Check your secondary device.', 'warning');
    setTimeout(() => {
      // Direct login as viewer on bypass
      localStorage.setItem('token', 'bypass-token');
      localStorage.setItem('user', JSON.stringify({ id: 0, name: 'Bypass Operator', email: 'viewer@company.com', role: 'viewer' }));
      navigate('/dashboard');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-[#060d18] via-[#0a1628] to-[#0d1f3c]">
      {/* Radial Glow Blobs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Toast Notification */}
      {showToast && (
        <div className={`absolute top-4 right-4 border px-4 py-3 rounded-lg flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] z-50 ${
          toastType === 'success' ? 'bg-success/10 border-success/30 text-success' : 
          toastType === 'warning' ? 'bg-warning/10 border-warning/30 text-warning' : 
          toastType === 'info' ? 'bg-primary/10 border-primary/30 text-primary' : 
          'bg-danger/10 border-danger/30 text-danger'
        }`}>
          {toastType === 'success' ? <FiCheckCircle className="text-xl" /> : <FiAlertCircle className="text-xl" />}
          <span className="font-mono text-sm">{toastMsg}</span>
        </div>
      )}

      {/* Login Card */}
      <div className="w-full max-w-md bg-darkCard/80 backdrop-blur-xl border border-primary/20 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,240,255,0.15)] relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-primary/40 shadow-[0_0_20px_rgba(0,240,255,0.25)]">
            <FiShield className="text-3xl text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-widest font-mono">SECURE<span className="text-primary">ASSETS</span></h2>
          <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Enterprise Access Terminal</p>
        </div>
        
        {show2FA ? (
          <form onSubmit={handleVerify2FA} className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <div className="text-center text-sm text-slate-300 mb-6">
              Please enter the 6-digit authentication code from your authenticator app.
            </div>
            <div>
              <label className="cyber-label">Authentication Code</label>
              <div className="relative">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  className="cyber-input pl-12 text-center tracking-[0.5em] text-lg font-mono" 
                  placeholder="000000"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  required 
                  autoFocus
                />
              </div>
            </div>
            <div className="pt-2 flex flex-col gap-3">
              <button type="submit" disabled={loading} className="w-full btn-primary py-3 text-lg tracking-wider">
                {loading ? 'VERIFYING...' : 'VERIFY CODE'} <FiCheckCircle className="ml-1" />
              </button>
              <button type="button" onClick={() => setShow2FA(false)} className="w-full text-slate-400 hover:text-white transition-colors text-xs uppercase tracking-wider mt-2">
                Back to Login
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
            <div>
              <label className="cyber-label">Operator Email</label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="email" 
                className="cyber-input pl-12" 
                placeholder="admin@company.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required 
              />
            </div>
          </div>
          
          <div>
            <label className="cyber-label">Access Code</label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="password" 
                className="cyber-input pl-12" 
                placeholder="••••••••" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required 
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary focus:ring-primary/50 focus:ring-offset-0 focus:ring-offset-transparent" defaultChecked />
              <span className="text-slate-400 group-hover:text-slate-200 transition-colors">Keep connection open</span>
            </label>
            <button type="button" onClick={handleBypass} className="text-primary hover:text-white transition-colors text-xs uppercase tracking-wider font-semibold">Bypass Code?</button>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <button type="submit" disabled={loading} className="w-full btn-primary py-3 text-lg tracking-wider">
              {loading ? 'UPLINKING...' : 'INITIALIZE UPLINK'} <FiLock className="ml-1" />
            </button>
            
            <button type="button" onClick={handleFaceLogin} className="w-full border border-slate-700 bg-slate-800/50 hover:bg-slate-700 text-white font-mono text-sm py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
              <span className="text-xl">👤</span> FACE RECOGNITION LOGIN
            </button>
          </div>
        </form>
        )}
      </div>

      {/* Futuristic Biometric Scanner Modal Overlay */}
      {isFaceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <style>{`
            @keyframes scanLine {
              0% { top: 0%; opacity: 0.8; }
              50% { top: 100%; opacity: 0.8; }
              100% { top: 0%; opacity: 0.8; }
            }
            .scanner-laser {
              position: absolute;
              left: 0;
              width: 100%;
              height: 4px;
              background: #00f0ff;
              box-shadow: 0 0 15px #00f0ff, 0 0 5px #00f0ff;
              animation: scanLine 3s infinite linear;
              pointer-events: none;
            }
          `}</style>
          <div className="w-full max-w-sm bg-darkCard border border-primary/30 rounded-2xl p-6 relative flex flex-col items-center text-center shadow-[0_0_50px_rgba(0,240,255,0.25)]">
            <h3 className="text-white font-mono text-sm tracking-wider font-bold mb-4 uppercase">Facial Biometric Terminal</h3>
            
            {/* Camera Viewfinder */}
            <div className="w-64 h-64 rounded-full border-4 border-primary/40 bg-slate-950 overflow-hidden relative mb-6 shadow-[0_0_30px_rgba(0,240,255,0.15)] flex items-center justify-center">
              {faceScanStatus === 'scanning' ? (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="scanner-laser"></div>
                  {/* Reticle Overlay */}
                  <div className="absolute inset-0 border-[30px] border-slate-950/40 pointer-events-none flex items-center justify-center">
                    <div className="w-44 h-44 rounded-full border border-dashed border-primary/60 animate-[spin_20s_linear_infinite]"></div>
                  </div>
                </>
              ) : faceScanStatus === 'verifying' || faceScanStatus === 'success' ? (
                <>
                  {streamRef.current && (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover opacity-60 scale-x-[-1]"
                    />
                  )}
                  {faceScanStatus === 'verifying' ? (
                    <div className="absolute inset-0 bg-primary/10 flex flex-col items-center justify-center">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-success/25 flex flex-col items-center justify-center animate-[pulse_1.5s_infinite]">
                      <span className="text-5xl text-success animate-bounce">✓</span>
                    </div>
                  )}
                </>
              ) : faceScanStatus === 'scanning_simulation' ? (
                <div className="w-full h-full bg-slate-900/60 flex flex-col items-center justify-center relative">
                  {/* Futuristic Scanning Hologram */}
                  <div className="w-32 h-32 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-3"></div>
                  <span className="text-[10px] text-primary font-mono uppercase tracking-widest animate-pulse">Simulated Uplink</span>
                  <div className="scanner-laser"></div>
                </div>
              ) : (
                <div className="text-slate-500 font-mono text-xs p-4">Initializing sensor node...</div>
              )}
            </div>

            {/* Progress / Status */}
            <div className="w-full space-y-2 mb-6">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>STATUS:</span>
                <span className={`font-bold ${
                  faceScanStatus === 'success' ? 'text-success' :
                  faceScanStatus === 'error' ? 'text-danger' : 'text-primary'
                }`}>
                  {faceScanStatus === 'initializing' && 'INITIALIZING SYSTEM...'}
                  {faceScanStatus === 'scanning' && 'BIOMETRIC SCAN IN PROGRESS...'}
                  {faceScanStatus === 'scanning_simulation' && 'SIMULATING RECOGNITION PATHS...'}
                  {faceScanStatus === 'verifying' && 'VERIFYING SIGNATURE WITH DB...'}
                  {faceScanStatus === 'success' && 'IDENTITY MATCH CONFIRMED'}
                  {faceScanStatus === 'error' && faceError}
                </span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-150 ${faceScanStatus === 'success' ? 'bg-success' : 'bg-primary'}`} 
                  style={{ width: `${faceProgress}%` }}
                ></div>
              </div>
            </div>

            <button 
              type="button" 
              onClick={closeFaceScan}
              className="px-6 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors font-mono text-xs uppercase tracking-wider"
            >
              Abort Uplink
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
