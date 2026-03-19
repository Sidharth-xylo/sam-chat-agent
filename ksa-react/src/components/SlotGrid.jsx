import { useState, useMemo } from 'react';

const PERIODS = [
  { key: 'morning',   label: 'Morning',   icon: '🌅', range: '4AM–11AM' },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️',  range: '11AM–4PM' },
  { key: 'evening',   label: 'Evening',   icon: '🌇', range: '4PM–8PM'  },
  { key: 'night',     label: 'Night',     icon: '🌙', range: '8PM–4AM'  },
];

function getHour(timeStr = '') {
  return parseInt((timeStr.split('–')[0] || '').split(':')[0]) || 0;
}

function periodForHour(h) {
  if (h >= 4  && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'afternoon';
  if (h >= 16 && h < 20) return 'evening';
  return 'night';
}

export default function SlotGrid({ slots, onPick, busy }) {
  const byPeriod = useMemo(() => {
    const g = { morning: [], afternoon: [], evening: [], night: [] };
    slots.forEach(s => g[periodForHour(getHour(s.time))].push(s));
    return g;
  }, [slots]);

  const defaultPeriod = useMemo(() =>
    Object.entries(byPeriod).sort((a,b) => b[1].length - a[1].length)[0][0]
  , [byPeriod]);

  const [period, setPeriod] = useState(defaultPeriod);
  const [sel, setSel]       = useState(null);

  const filtered = (byPeriod[period] || []).slice(0, 6);

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="slots-wrap">
        <div className="slots-lbl">🕐 Pick a time of day</div>
        <div className="period-tabs">
          {PERIODS.map(p => {
            const count = byPeriod[p.key]?.length || 0;
            const empty = count === 0;
            return (
              <button
                key={p.key}
                className={`period-tab${period === p.key ? ' active' : ''}${empty ? ' empty' : ''}`}
                onClick={() => !empty && (setPeriod(p.key), setSel(null))}
              >
                <span className="period-icon" style={{ opacity: empty ? 0.4 : 1 }}>{p.icon}</span>
                <span className="period-name">{p.label}</span>
                <span className="period-range">{p.range}</span>
                {empty && <span className="period-full">Full</span>}
              </button>
            );
          })}
        </div>

        {filtered.length > 0 ? (
          <>
            <div className="slots-lbl" style={{ marginTop: 10 }}>📅 Available Slots</div>
            <div className="slots-grid">
              {filtered.map(s => (
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
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#888', padding: '10px 0', textAlign: 'center', fontStyle: 'italic' }}>
            All {period} slots are booked. Try another period.
          </div>
        )}

        <button
          className="sconfirm"
          disabled={!sel || busy}
          onClick={() => sel && onPick(sel.id, sel.time, sel.price)}
        >
          {sel ? `⚡ Book ${sel.time}` : 'Select a slot'}
        </button>
      </div>
    </div>
  );
}