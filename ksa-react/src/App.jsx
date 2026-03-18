
import { useState, useEffect, useRef } from 'react';
import SportsBackground from './components/SportsBackground';
import SlotGrid from './components/SlotGrid';
import LoginCard from './components/LoginCard';
import PaymentCard from './components/PaymentCard';
import logo from './assets/logo.png';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const nowStr = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function fmt(t = '') {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`(.+?)`/g,
      '<code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:12px;color:#0f172a">$1</code>'
    )
    .replace(/\n/g, '<br>');
}

function parseReply(text = '') {
  let content = text;
  let slots = null;
  let action = null;
  let booking = null;

  if (content.includes('[ACTION:LOGIN_FORM]')) {
    action = 'login';
    content = content.replace('[ACTION:LOGIN_FORM]', '').trim();
  }

  const bm = content.match(/\[BOOKING:(\{[\s\S]*?\})\]/);
  if (bm) {
    try {
      booking = JSON.parse(bm[1]);
      action = 'payment';
    } catch (e) {}
    content = content.replace(/\[BOOKING:\{[\s\S]*?\}\]/, '').trim();
  }

  const sm = content.match(/\[SLOTS:(\[[\s\S]*?\])\]/);
  if (sm) {
    try {
      slots = JSON.parse(sm[1]);
    } catch (e) {}
    content = content.replace(/\[SLOTS:\[[\s\S]*?\]\]/, '').trim();
  }

  return { content, slots, action, booking };
}

export default function App() {
  const [msgs, setMsgs] = useState([
    {
      role: 'agent',
      type: 'text',
      content: 'Hi! 👋 Which sport would you like to book a court for?',
      time: nowStr(),
    },
  ]);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(null);

  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const tokenRef = useRef(null);
  const userIdRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const push = (msg) =>
    setMsgs((p) => [...p, { ...msg, time: nowStr() }]);

  const send = async (text) => {
    const t = (text || input).trim();
    if (!t || busy) return;

    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';

    push({ role: 'user', type: 'text', content: t });
    setBusy(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: t,
          sessionId: sid,
          authToken: tokenRef.current,
          userId: userIdRef.current,
        }),
      });

      if (!res.ok)
        throw new Error('Server unreachable. Is "node server.js" running?');

      const data = await res.json();
      setSid(data.sessionId);

      const { content, slots, action, booking } = parseReply(data.reply);

      if (content)
        push({ role: 'agent', type: 'text', content });

      if (slots?.length)
        push({ role: 'agent', type: 'slots', data: slots });

      if (action === 'login')
        push({ role: 'agent', type: 'login' });

      if (action === 'payment')
        push({
          role: 'agent',
          type: 'payment',
          booking,
        });
    } catch (e) {
      push({
        role: 'agent',
        type: 'text',
        content: '⚠️ ' + e.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const onLogin = (token, uid, name, email) => {
    tokenRef.current = token;
    userIdRef.current = uid;
    userRef.current = { token, name, email };

    push({
      role: 'user',
      type: 'text',
      content: `Logged in as ${name}`,
    });

    setTimeout(() => {
      send(
        `I'm now logged in as ${name} with userId ${uid}. Please confirm my booking.`
      );
    }, 100);
  };

  const onPaid = (paymentId) => {
    push({
      role: 'agent',
      type: 'text',
      content: `✅ Payment confirmed!\nPayment ID: ${paymentId}\n\nYour court is booked. See you on the court! 🏸`,
    });
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onInp = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height =
      Math.min(e.target.scrollHeight, 100) + 'px';
  };

  return (
    <div className="app-layout">
      <div className="shell">
        <SportsBackground />

        {/* Header */}
        <div className="header">
          <div className="header-logo">
            {logo ? (
              <img src={logo} alt="KSA-SAM Logo" />
            ) : (
              <span className="header-logo-fallback">🏸</span>
            )}
          </div>

          <div className="header-info">
            <h2>KSA-SAM</h2>
            <p>Sports Court Booking Assistant</p>
          </div>

          <div className="online-pip" title="Online" />
        </div>

        {/* Messages */}
        <div className="messages">
          {msgs.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} className="row-u">
                  <div className="bwrap u">
                    <div
                      className="bbl u"
                      dangerouslySetInnerHTML={{
                        __html: fmt(m.content),
                      }}
                    />
                    <span className="bt">{m.time}</span>
                  </div>
                </div>
              );
            }

            if (m.type === 'slots')
              return (
                <SlotGrid
                  key={i}
                  slots={m.data}
                  onSend={send}
                  busy={busy}
                />
              );

            if (m.type === 'login')
              return (
                <LoginCard
                  key={i}
                  onLogin={onLogin}
                  busy={busy}
                />
              );

            if (m.type === 'payment')
              return (
                <PaymentCard
                  key={i}
                  booking={m.booking}
                  userRef={userRef}
                  onPaid={onPaid}
                />
              );

            return (
              <div key={i} className="row-a">
                <div className="av">🤖</div>
                <div className="bwrap">
                  <div
                    className="bbl a"
                    dangerouslySetInnerHTML={{
                      __html: fmt(m.content),
                    }}
                  />
                  <span className="bt">{m.time}</span>
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="row-a">
              <div className="av">🤖</div>
              <div className="typing-bbl">
                <div className="dot" />
                <div className="dot" />
                <div className="dot" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="ibar">
          <textarea
            ref={taRef}
            className="ibox"
            rows={1}
            placeholder="Ask me to book a court…"
            value={input}
            onChange={onInp}
            onKeyDown={onKey}
          />
          <button
            className="sbtn"
            onClick={() => send()}
            disabled={busy || !input.trim()}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

