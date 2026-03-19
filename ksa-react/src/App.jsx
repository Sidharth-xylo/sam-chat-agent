import { useState, useEffect, useRef } from 'react';
import SportsBackground from './components/SportsBackground';
import VenueGrid   from './components/VenueGrid';
import SportGrid   from './components/SportGrid';
import CourtGrid   from './components/CourtGrid';
import SlotGrid    from './components/SlotGrid';
import LoginCard   from './components/LoginCard';
import PaymentCard from './components/PaymentCard';
import DatePicker  from './components/DatePicker';
import logo from './assets/logo.png';

const API    = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const nowStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function fmt(t = '') {
  return t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function askAgent({ message, sessionId, authToken, userId }) {
  const res = await fetch(`${API}/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, sessionId, authToken, userId })
  });
  if (!res.ok) throw new Error('Server unreachable. Is "node server.js" running?');
  return res.json();
}

export default function App() {
  const [msgs, setMsgs] = useState([{
    role: 'agent',
    ui:   { type: 'text', data: null },
    text: 'Hi! 👋 Welcome to KSA-SAM!\n\nTell me what you\'d like to book — e.g. "badminton tomorrow evening at Maya" — or just say "book" and I\'ll guide you step by step.',
    time: nowStr()
  }]);

  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);

  const bottomRef = useRef(null);
  const taRef     = useRef(null);
  const tokenRef  = useRef(null);
  const userIdRef = useRef(null);
  const userRef   = useRef(null);
  const sidRef    = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  // ── THIS WAS MISSING — defines push ──────────────────────────
  const push = (msg) => setMsgs(p => [...p, { ...msg, time: nowStr() }]);

  const handleSend = async (serverMsg, displayMsg) => {
    const t = (serverMsg || input).trim();
    if (!t || busy) return;

    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';

    if (displayMsg !== null && displayMsg !== undefined) {
      push({ role: 'user', text: displayMsg || t, ui: null });
    }

    setBusy(true);
    try {
      const { reply, sessionId } = await askAgent({
        message:   t,
        sessionId: sidRef.current,
        authToken: tokenRef.current,
        userId:    userIdRef.current
      });
      sidRef.current = sessionId;

      push({
        role: 'agent',
        text: reply.message || '',
        ui:   reply.ui || { type: 'text', data: null }
      });
    } catch(e) {
      push({ role: 'agent', text: '⚠️ ' + e.message, ui: { type: 'text', data: null } });
    } finally {
      setBusy(false);
    }
  };

  const onVenuePick = (venue) => handleSend(`I want to book at ${venue.name} (venueId: ${venue.venueId})`, venue.name);
  const onSportPick = (sport) => handleSend(`I want to play ${sport.name} (sportId: ${sport.id})`, sport.name);
  const onCourtPick = (court) => handleSend(`I'll use ${court.name} (courtId: ${court.id})`, court.name);
  const onDatePick  = (date)  => handleSend(`My date is ${date}`, date);
  const onSlotPick  = (slot)  => handleSend(`Book slot ${slot.id} — ${slot.time}`, `Book ${slot.time}`);

  const onLogin = (token, uid, name, email) => {
    tokenRef.current  = token;
    userIdRef.current = uid;
    userRef.current   = { token, name, email };
    push({ role: 'user', text: `Logged in as ${name}`, ui: null });
    handleSend(
      `I'm now logged in as ${name} with userId ${uid}. Please create my booking.`,
      null
    );
  };

  const onPaid = (paymentId) => {
    push({
      role: 'agent',
      text: `🎉 Payment confirmed! ID: ${paymentId}\nSee you on the court! 🏸`,
      ui: { type: 'text', data: null }
    });
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const onInp = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  };

  return (
    <div className="app-layout">
      <div className="shell">
        <SportsBackground />

        <div className="header">
          <div className="header-logo">
            {logo
              ? <img src={logo} alt="KSA-SAM" />
              : <span className="header-logo-fallback">🏸</span>}
          </div>
          <div className="header-info">
            <h2>KSA-SAM</h2>
            <p>Sports Court Booking Assistant</p>
          </div>
          <div className="online-pip" />
        </div>

        <div className="messages">
          {msgs.map((m, i) => {
            if (m.role === 'user') return (
              <div key={i} className="row-u">
                <div className="bwrap u">
                  <div className="bbl u" dangerouslySetInnerHTML={{ __html: fmt(m.text) }} />
                  <span className="bt">{m.time}</span>
                </div>
              </div>
            );

            const uiType = m.ui?.type;
            const uiData = m.ui?.data;

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {m.text && (
                  <div className="row-a">
                    <div className="av">🤖</div>
                    <div className="bwrap">
                      <div className="bbl a" dangerouslySetInnerHTML={{ __html: fmt(m.text) }} />
                      <span className="bt">{m.time}</span>
                    </div>
                  </div>
                )}

                {uiType === 'venues'     && uiData?.length && <VenueGrid  key={`ui-${i}`} venues={uiData}  onPick={onVenuePick} />}
                {uiType === 'sports'     && uiData?.length && <SportGrid  key={`ui-${i}`} sports={uiData}  onPick={onSportPick} />}
                {uiType === 'courts'     && uiData?.length && <CourtGrid  key={`ui-${i}`} courts={uiData}  onPick={onCourtPick} />}
                {uiType === 'datepicker' && <DatePicker    key={`ui-${i}`} onPick={onDatePick} />}
                {uiType === 'slots'      && uiData?.length && <SlotGrid   key={`ui-${i}`} slots={uiData}   onPick={onSlotPick} busy={busy} />}
                {uiType === 'login'      && <LoginCard     key={`ui-${i}`} onLogin={onLogin} busy={busy} />}
                {uiType === 'payment'    && uiData         && <PaymentCard key={`ui-${i}`} booking={uiData} userRef={userRef} onPaid={onPaid} />}
              </div>
            );
          })}

          {busy && (
            <div className="row-a">
              <div className="av">🤖</div>
              <div className="typing-bbl">
                <div className="dot"/><div className="dot"/><div className="dot"/>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="ibar">
          <textarea
            ref={taRef} className="ibox" rows={1}
            placeholder="Type anything — 'book badminton tomorrow at Maya'…"
            value={input} onChange={onInp} onKeyDown={onKey}
          />
          <button className="sbtn" onClick={() => handleSend()} disabled={busy || !input.trim()}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}