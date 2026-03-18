import { useState } from 'react';

const SAM = 'https://sam-be.idzone.app/api/v2';

export default function LoginCard({ onLogin, busy }) {
  const [tab, setTab]    = useState('login');
  const [err, setErr]    = useState('');
  const [loading, setLd] = useState(false);
  const [otp, setOtp]    = useState({ step: false, email: '', code: '' });
  const [reg, setReg]    = useState({ name:'',email:'',mobile:'',password:'',pinCode:'',city:'',state:'',country:'India' });
  const [log, setLog]    = useState({ email:'', password:'' });

  const setR = (k, v) => setReg(f => ({ ...f, [k]: v }));
  const setL = (k, v) => setLog(f => ({ ...f, [k]: v }));

  const doLogin = async () => {
    if (!log.email || !log.password) { setErr('Please fill in all fields'); return; }
    setLd(true); setErr('');
    try {
      const res  = await fetch(`${SAM}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(log) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.message || 'Login failed');
      const token = data.token || data.accessToken || data.data?.token;
      let uid = data.userId || data.user?.id || data.data?.userId || data.data?.user?.id;
      if (!uid && token) { try { const p = JSON.parse(atob(token.split('.')[1])); uid = p.userId || p.id || p.sub; } catch(e){} }
      onLogin(token, uid, data.user?.name || data.data?.name || log.email.split('@')[0], log.email);
    } catch(e) { setErr(e.message); }
    finally { setLd(false); }
  };

  const doRegister = async () => {
    const fields = ['name','email','mobile','password','pinCode','city','state','country'];
    if (fields.some(k => !reg[k])) { setErr('Please fill in all fields'); return; }
    setLd(true); setErr('');
    try {
      const res  = await fetch(`${SAM}/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(reg) });
      const data = await res.json();
      if (!res.ok || data.status === 'error') throw new Error(data.message || 'Registration failed');
      await fetch(`${SAM}/auth/send-otp`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email: reg.email }) });
      setOtp({ step: true, email: reg.email, code: '' });
    } catch(e) { setErr(e.message); }
    finally { setLd(false); }
  };

  const doVerifyOtp = async () => {
    if (!otp.code) { setErr('Enter the OTP'); return; }
    setLd(true); setErr('');
    try {
      const res  = await fetch(`${SAM}/auth/verify-otp`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email: otp.email, otp: otp.code }) });
      const data = await res.json();
      if (!res.ok || data.status === 'error') throw new Error(data.message || 'OTP verification failed');
      const lr   = await fetch(`${SAM}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email: reg.email, password: reg.password }) });
      const ld   = await lr.json();
      const token = ld.token || ld.accessToken || ld.data?.token;
      let uid = ld.userId || ld.user?.id || ld.data?.userId;
      if (!uid && token) { try { const p = JSON.parse(atob(token.split('.')[1])); uid = p.userId || p.id || p.sub; } catch(e){} }
      onLogin(token, uid, reg.name, reg.email);
    } catch(e) { setErr(e.message); }
    finally { setLd(false); }
  };

  const inp = (label, key, type = 'text', placeholder = '') => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} placeholder={placeholder}
        value={tab === 'login' ? log[key] : reg[key]}
        onChange={e => tab === 'login' ? setL(key, e.target.value) : setR(key, e.target.value)}
        onKeyDown={e => e.key === 'Enter' && (tab === 'login' ? doLogin() : null)}
      />
    </div>
  );

  if (otp.step) return (
    <div className="row-a">
      <div className="av">🤖</div>
      <div className="form-card">
        <div className="form-card-title">📬 Verify OTP</div>
        <div className="form-sub">Code sent to {otp.email}</div>
        {err && <div className="form-err">{err}</div>}
        <div className="form-group">
          <label className="form-label">OTP Code</label>
          <input className="form-input" placeholder="6-digit code" value={otp.code}
            onChange={e => setOtp(o => ({ ...o, code: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && doVerifyOtp()} />
        </div>
        <button className="form-submit" onClick={doVerifyOtp} disabled={loading}>
          {loading ? 'Verifying…' : 'Verify & Book'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="form-card">
        <div className="form-card-title">🔐 Login to confirm booking</div>
        <div className="form-sub">Almost there! Log in to complete your booking.</div>
        <div className="form-tabs">
          <button className={`form-tab${tab === 'login' ? ' active' : ''}`} onClick={() => { setTab('login'); setErr(''); }}>Log In</button>
          <button className={`form-tab${tab === 'register' ? ' active' : ''}`} onClick={() => { setTab('register'); setErr(''); }}>Register</button>
        </div>
        {err && <div className="form-err">{err}</div>}

        {tab === 'login' ? (
          <>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@example.com"
                value={log.email} onChange={e => setL('email', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()} />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={log.password} onChange={e => setL('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()} />
            </div>
            <button className="form-submit" onClick={doLogin} disabled={loading || busy}>
              {loading ? 'Logging in…' : 'Log In & Book'}
            </button>
          </>
        ) : (
          <>
            <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" placeholder="John Doe" value={reg.name} onChange={e => setR('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" placeholder="you@example.com" value={reg.email} onChange={e => setR('email', e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Mobile</label><input className="form-input" placeholder="9999999999" value={reg.mobile} onChange={e => setR('mobile', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Pin Code</label><input className="form-input" placeholder="641001" value={reg.pinCode} onChange={e => setR('pinCode', e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="••••••••" value={reg.password} onChange={e => setR('password', e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">City</label><input className="form-input" placeholder="Coimbatore" value={reg.city} onChange={e => setR('city', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">State</label><input className="form-input" placeholder="Tamil Nadu" value={reg.state} onChange={e => setR('state', e.target.value)} /></div>
            </div>
            <div className="form-group"><label className="form-label">Country</label><input className="form-input" placeholder="India" value={reg.country} onChange={e => setR('country', e.target.value)} /></div>
            <button className="form-submit" onClick={doRegister} disabled={loading || busy}>
              {loading ? 'Creating account…' : 'Create Account & Book'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
