const EMOJI = { wooden:'🪵', synthetic:'🟢', concrete:'🔲', grass:'🌿', clay:'🟫', indoor:'🏠', outdoor:'🌤️' };
const e = (t='') => EMOJI[t.toLowerCase()] || '🎾';

export default function CourtGrid({ courts, onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">🎾 Choose a Court</div>
        <div className="tile-grid tile-grid-2">
          {courts.map(c => (
            <button key={c.id} className="choice-tile" onClick={() => onPick(c)}>
              <span className="choice-icon">{e(c.type)}</span>
              <span className="choice-name">{c.name}</span>
              {c.type && <span className="choice-sub">{c.type}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}