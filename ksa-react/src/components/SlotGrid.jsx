import { useState } from 'react';

export default function SlotGrid({ slots, onSend, busy }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="slots-wrap">
        <div className="slots-lbl">📅 Available Slots</div>
        <div className="slots-grid">
          {slots.map(s => (
            <div
              key={s.id}
              className={`stile${sel?.id === s.id ? ' sel' : ''}`}
              onClick={() => setSel(s)}
            >
              <div className="stime">{(s.time || '').replace('–', '\n')}</div>
              <div className="sprice">{s.price}</div>
            </div>
          ))}
        </div>
        <button
          className="sconfirm"
          disabled={!sel || busy}
          onClick={() => sel && onSend(`Book slot ${sel.id} — ${sel.time}`)}
        >
          {sel ? `⚡ Book ${sel.time}` : 'Select a slot'}
        </button>
      </div>
    </div>
  );
}
