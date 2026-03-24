import { useState } from 'react';

const toDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().split('T')[0];

export default function DatePicker({ onPick }) {
  const [custom, setCustom] = useState('');

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>AI</div>
      <div className="tile-wrap">
        <div className="tile-lbl">Pick a date</div>
        <div className="tile-grid tile-grid-2" style={{ marginBottom: 8 }}>
          <button className="choice-tile" onClick={() => onPick(toDate(0))}>
            <span className="choice-icon">TD</span>
            <span className="choice-name">Today</span>
            <span className="choice-sub">{toDate(0)}</span>
          </button>
          <button className="choice-tile" onClick={() => onPick(toDate(1))}>
            <span className="choice-icon">TM</span>
            <span className="choice-name">Tomorrow</span>
            <span className="choice-sub">{toDate(1)}</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="date"
            className="form-input"
            style={{ flex: 1, fontSize: 12 }}
            min={toDate(0)}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
          <button
            className="sconfirm"
            style={{ width: 'auto', padding: '0 14px', fontSize: 12 }}
            disabled={!custom}
            onClick={() => custom && onPick(custom)}
          >
            Pick
          </button>
        </div>
      </div>
    </div>
  );
}
