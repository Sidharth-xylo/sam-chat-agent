import { useState } from 'react';

const SAM = 'https://sam-be.idzone.app/api/v2';

export default function LoginCard({ onLogin, busy }) {
  const [tab, setTab]     = useState('login');   // 'login' | 'register'
  const [err, setErr]     = useState('');
  const [loading, setLd]  = useState(false);

  const [log, setLog] = useState({ identifier: '', password: '' });
  const [reg, setReg] = useState({
    name: '', email: '', mobile: '', password: '',
    // optional
    pinCode: '', city: '', state: '', country: 'India',
  });

  const setL = (k, v) => setLog(f => ({ ...f, [k]: v }));
  const setR = (k, v) => setReg(f => ({ ...f, [k]: v }));

  // ── Existing user login (email or mobile + password) ──────────────────────
  const doLogin = async () => {
    if (!log.identifier || !log.password) {
      setErr('Please enter your email / mobile and password');
      return;
    }
    setLd(true); setErr('');
    try {
      const res  = await fetch(`${SAM}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: log.identifier, password: log.password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.message || 'Login failed');
      const token = data.token || data.accessToken || data.data?.token;
      let uid = data.userId || data.user?.id || data.data?.userId || data.data?.user?.id;
      if (!uid && token) {
        try {
          const p = JSON.parse(atob(token.split('.')[1]));
          uid = p.userId || p.id || p.sub;
        } catch (_) {}
      }
      onLogin(token, uid, data.user?.name || data.data?.name || log.identifier, log.identifier);
    } catch (e) { setErr(e.message); }
    finally { setLd(false); }
  };

  // ── New user register — no API call here, data held until after payment ───
  const doRegister = () => {
    if (!reg.name || !reg.email || !reg.mobile || !reg.password) {
      setErr('Name, email, mobile and password are required');
      return;
    }
    if (!/^\d{10}$/.test(reg.mobile)) {
      setErr('Mobile must be a 10-digit number');
      return;
    }
    if (reg.password.length < 6) {
      setErr('Password must be at least 6 characters');
      return;
    }
    // Pass all data to App — actual /auth/register is called after payment succeeds
    onLogin(null, null, reg.name, reg.email, {
      name:     reg.name,
      email:    reg.email,
      mobile:   reg.mobile,
      password: reg.password,
      pinCode:  reg.pinCode  || '000000',
      city:     reg.city     || 'N/A',
      state:    reg.state    || 'N/A',
      country:  reg.country  || 'India',
    });
  };

  const Err = () => err ? <div className="form-err">{err}</div> : null;

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>AI</div>
      <div className="form-card">
        <div className="form-card-title">Login to confirm booking</div>
        <div className="form-sub">Almost there — log in or create an account to book.</div>

        <div className="form-tabs">
          <button
            className={`form-tab${tab === 'login' ? ' active' : ''}`}
            onClick={() => { setTab('login'); setErr(''); }}
          >Log In</button>
          <button
            className={`form-tab${tab === 'register' ? ' active' : ''}`}
            onClick={() => { setTab('register'); setErr(''); }}
          >New User</button>
        </div>

        <Err />

        {tab === 'login' && (
          <>
            <div className="form-group">
              <label className="form-label">Email or Mobile</label>
              <input
                className="form-input"
                placeholder="you@example.com or 9999999999"
                value={log.identifier}
                onChange={e => setL('identifier', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={log.password}
                onChange={e => setL('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
            </div>
            <button className="form-submit" onClick={doLogin} disabled={loading || busy}>
              {loading ? 'Logging in…' : 'Log In & Book'}
            </button>
          </>
        )}

        {tab === 'register' && (
          <>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" placeholder="John Doe"
                value={reg.name} onChange={e => setR('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" placeholder="you@example.com"
                value={reg.email} onChange={e => setR('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile *</label>
              <input className="form-input" placeholder="10-digit number"
                value={reg.mobile} onChange={e => setR('mobile', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Password * <span style={{ fontWeight: 400, fontSize: 11 }}>(min 6 chars)</span></label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={reg.password} onChange={e => setR('password', e.target.value)} />
            </div>

            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>
                Optional details
              </summary>
              <div style={{ paddingTop: 8 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Pin Code</label>
                    <input className="form-input" placeholder="641001"
                      value={reg.pinCode} onChange={e => setR('pinCode', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input className="form-input" placeholder="Coimbatore"
                      value={reg.city} onChange={e => setR('city', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input className="form-input" placeholder="Tamil Nadu"
                      value={reg.state} onChange={e => setR('state', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <input className="form-input" placeholder="India"
                      value={reg.country} onChange={e => setR('country', e.target.value)} />
                  </div>
                </div>
              </div>
            </details>

            <div className="form-sub" style={{ fontSize: 11, marginBottom: 10 }}>
              Your account is created only after payment is confirmed.
            </div>
            <button className="form-submit" onClick={doRegister} disabled={busy}>
              Register & Book
            </button>
          </>
        )}
      </div>
    </div>
  );
}
