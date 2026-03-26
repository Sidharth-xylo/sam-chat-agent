import { useState, useEffect, useRef } from 'react';
import SportsBackground from './components/SportsBackground';
import VenueGrid from './components/VenueGrid';
import SportGrid from './components/SportGrid';
import CourtGrid from './components/CourtGrid';
import SlotGrid from './components/SlotGrid';
import LoginCard from './components/LoginCard';
import PaymentCard from './components/PaymentCard';
import DatePicker from './components/DatePicker';
import TimeOfDayPicker from './components/TimeOfDayPicker';
import logo from './assets/logo.png';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const nowStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function fmt(t = '') {
  return t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function askAgent({ message, pickerEvent, sessionId, authToken, userId }) {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, pickerEvent, sessionId, authToken, userId }),
  });
  if (!res.ok) throw new Error('Server unreachable. Is the Python backend running?');
  return res.json();
}

export default function App() {
  const [msgs, setMsgs] = useState([
    {
      role: 'agent',
      ui: { type: 'text', data: null },
      text:
        'Hi, welcome to KSA-SAM.\n\nTell me what you want to book, and I will guide you step by step.',
      time: nowStr(),
    },
  ]);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const tokenRef = useRef(null);
  const userIdRef = useRef(null);
  const userRef = useRef(null);
  const pendingRegRef = useRef(null);
  const sidRef = useRef(null);
  const venueRef = useRef(null);
  const sportRef = useRef(null);
  const courtRef = useRef(null);
  const slotRef = useRef(null);
  const dateRef = useRef(null);
  const courtsRef = useRef([]);

  useEffect(() => {
    sidRef.current = null;
    tokenRef.current = null;
    userIdRef.current = null;
    userRef.current = null;
    venueRef.current = null;
    sportRef.current = null;
    courtRef.current = null;
    slotRef.current = null;
    dateRef.current = null;
    courtsRef.current = [];
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const push = (msg) => setMsgs((prev) => [...prev, { ...msg, time: nowStr() }]);

  const requestAgent = async (payload, displayMsg) => {
    try {
      const { reply, sessionId } = await askAgent({
        ...payload,
        sessionId: sidRef.current,
        authToken: tokenRef.current,
        userId: userIdRef.current,
      });
      sidRef.current = sessionId;
      if (reply?.ui?.type === 'courts' && Array.isArray(reply.ui.data)) {
        courtsRef.current = reply.ui.data;
      }
      if (reply?.ui?.type === 'slots' && Array.isArray(reply.ui?.data?.courts)) {
        courtsRef.current = reply.ui.data.courts;
      }
      if (reply?.ui?.data?.date) {
        dateRef.current = reply.ui.data.date;
      }
      if (reply?.ui?.data?.venueName) {
        venueRef.current = { ...(venueRef.current || {}), name: reply.ui.data.venueName };
      }
      if (reply?.ui?.data?.sportName) {
        sportRef.current = { ...(sportRef.current || {}), name: reply.ui.data.sportName };
      }
      if (reply?.ui?.data?.courtName || reply?.ui?.data?.courtId) {
        courtRef.current = {
          ...(courtRef.current || {}),
          id: reply.ui.data.courtId || courtRef.current?.id,
          name: reply.ui.data.courtName || courtRef.current?.name,
        };
      }
      if ((reply?.ui?.type === 'login' || reply?.ui?.type === 'payment') && reply?.ui?.data?.id) {
        slotRef.current = {
          ...(slotRef.current || {}),
          id: reply.ui.data.id,
          time: reply.ui.data.time || slotRef.current?.time,
          price: reply.ui.data.price || slotRef.current?.price,
          court:
            (reply.ui.data.courtId && courtsRef.current.find((court) => court.id === reply.ui.data.courtId)) ||
            (reply.ui.data.courtName ? { id: reply.ui.data.courtId, name: reply.ui.data.courtName } : slotRef.current?.court),
        };
      }
      push({
        role: 'agent',
        text: reply.message || '',
        ui: reply.ui || { type: 'text', data: null },
      });
    } catch (error) {
      push({
        role: 'agent',
        text: 'Sorry, ' + error.message,
        ui: { type: 'text', data: null },
      });
    }
  };

  const handleSend = async (serverMsg, displayMsg) => {
    const text = (serverMsg || input).trim();
    if (!text || busy) return;

    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';

    if (displayMsg !== null) {
      push({ role: 'user', text: displayMsg !== undefined ? displayMsg : text, ui: null });
    }

    setBusy(true);
    try {
      await requestAgent({ message: text });
    } finally {
      setBusy(false);
    }
  };

  const sendPickerEvent = async (event, displayText) => {
    if (displayText) push({ role: 'user', text: displayText, ui: null });
    setBusy(true);
    try {
      await requestAgent({ pickerEvent: event });
    } finally {
      setBusy(false);
    }
  };

  const onVenuePick = (venue) => {
    venueRef.current = venue;
    sendPickerEvent(
      {
        type: 'venue',
        venueId: venue.venueId,
        name: venue.name,
        ...(venue.sportId ? { sportId: venue.sportId, sportName: venue.sportName } : {}),
      },
      venue.name
    );
  };

  const onSportPick = (sport) => {
    sportRef.current = sport;
    const hasSelectedVenue = Boolean(venueRef.current?.venueId);
    sendPickerEvent(
      {
        type: 'sport',
        name: sport.name,
        ...(hasSelectedVenue && sport.id ? { sportId: sport.id } : {}),
      },
      sport.name
    );
  };

  const onCourtPick = (court) => {
    courtRef.current = court;
    sendPickerEvent({ type: 'court', courtId: court.id, name: court.name }, court.name);
  };

  const onDatePick = (pickedDate) => {
    dateRef.current = pickedDate;
    sendPickerEvent({ type: 'date', date: pickedDate }, pickedDate);
  };

  const onTimeOfDayPick = (timeOfDay) => {
    sendPickerEvent({ type: 'timeOfDay', period: timeOfDay }, timeOfDay[0].toUpperCase() + timeOfDay.slice(1));
  };

  const onSlotPick = (slot) => {
    slotRef.current = {
      id: slot.id,
      time: slot.time,
      price: slot.price,
      court: courtsRef.current.find((court) => court.id === slot.courtId) || courtRef.current,
    };
    sendPickerEvent(
      { type: 'slot', slotId: slot.id, time: slot.time, ...(slot.courtId ? { courtId: slot.courtId } : {}) },
      `Book ${slot.time}`
    );
  };

  const onLogin = (token, uid, name, email, pendingReg = null) => {
    if (pendingReg) {
      // New user — hold registration data until payment completes
      pendingRegRef.current = pendingReg;
      userRef.current = { name, email };
      push({ role: 'user', text: `Registering as ${name}`, ui: null });
      sendPickerEvent({
        type:        'pendingRegistration',
        guestName:   name,
        guestEmail:  email,
        guestMobile: pendingReg.mobile,
      }, null);
    } else {
      // Existing user — normal login
      tokenRef.current = token;
      userIdRef.current = uid;
      userRef.current = { token, name, email };
      push({ role: 'user', text: `Logged in as ${name}`, ui: null });
      sendPickerEvent({ type: 'login', userId: uid, name }, null);
    }
  };

  const onPaid = (paymentId) => {
    push({
      role: 'agent',
      text: `Payment confirmed. ID: ${paymentId}\nSee you on the court!`,
      ui: { type: 'text', data: null },
    });
  };

  const onKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const onInp = (event) => {
    setInput(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = Math.min(event.target.scrollHeight, 100) + 'px';
  };

  const tile = (condition, component) => (condition ? component : null);

  return (
    <div className="app-layout">
      <div className="shell">
        <SportsBackground />
        <div className="header">
          <div className="header-logo">
            {logo ? <img src={logo} alt="KSA-SAM" /> : <span className="header-logo-fallback">K</span>}
          </div>
          <div className="header-info">
            <h2>KSA-SAM</h2>
            <p>Sports Court Booking Assistant</p>
          </div>
          <div className="online-pip" />
        </div>

        <div className="messages">
          {msgs.map((message, index) => {
            if (message.role === 'user') {
              return (
                <div key={index} className="row-u">
                  <div className="bwrap u">
                    <div className="bbl u" dangerouslySetInnerHTML={{ __html: fmt(message.text) }} />
                    <span className="bt">{message.time}</span>
                  </div>
                </div>
              );
            }

            const uiType = message.ui?.type;
            const uiData = message.ui?.data;
            const hasArrayData = Array.isArray(uiData);

            return (
              <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {message.text && (
                  <div className="row-a">
                    <div className="av">🤖</div>
                    <div className="bwrap">
                      <div className="bbl a" dangerouslySetInnerHTML={{ __html: fmt(message.text) }} />
                      <span className="bt">{message.time}</span>
                    </div>
                  </div>
                )}
                {tile(uiType === 'sports' && hasArrayData, <SportGrid key={`u${index}`} sports={uiData} onPick={onSportPick} />)}
                {tile(uiType === 'venues' && hasArrayData, <VenueGrid key={`u${index}`} venues={uiData} onPick={onVenuePick} />)}
                {tile(uiType === 'courts' && hasArrayData, <CourtGrid key={`u${index}`} courts={uiData} onPick={onCourtPick} />)}
                {tile(uiType === 'datepicker', <DatePicker key={`u${index}`} onPick={onDatePick} />)}
                {tile(uiType === 'timeofday', <TimeOfDayPicker key={`u${index}`} onPick={onTimeOfDayPick} />)}
                {tile(
                  uiType === 'slots' && uiData?.slots?.length > 0,
                  <SlotGrid
                    key={`u${index}`}
                    slots={uiData?.slots || []}
                    courts={uiData?.courts || []}
                    preferredPeriod={uiData?.preferredPeriod}
                    preferredTime={uiData?.preferredTime}
                    preferredCourtId={uiData?.preferredCourtId}
                    unavailableNotice={uiData?.unavailableNotice}
                    onPick={onSlotPick}
                    busy={busy}
                  />
                )}
                {tile(uiType === 'login', <LoginCard key={`u${index}`} onLogin={onLogin} busy={busy} />)}
                {tile(
                  uiType === 'payment' && uiData,
                  <PaymentCard
                    key={`u${index}`}
                    booking={uiData}
                    userRef={userRef}
                    pendingRegRef={pendingRegRef}
                    summary={{
                      user: userRef.current?.name,
                      venue: uiData?.venueName || venueRef.current?.name,
                      sport: uiData?.sportName || sportRef.current?.name,
                      court: uiData?.courtName || slotRef.current?.court?.name || courtRef.current?.name,
                      date: uiData?.date || dateRef.current,
                      time: uiData?.time || slotRef.current?.time,
                      price: uiData?.price || slotRef.current?.price,
                    }}
                    onPaid={onPaid}
                  />
                )}
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

        <div className="ibar">
          <textarea
            ref={taRef}
            className="ibox"
            rows={1}
            placeholder="Type here"
            value={input}
            onChange={onInp}
            onKeyDown={onKey}
          />
          <button className="sbtn" onClick={() => handleSend()} disabled={busy || !input.trim()} title="Send message">
            {busy ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}

