// VenueGrid.jsx
export default function VenueGrid({ venues, onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">🏟️ Choose a Venue</div>
        <div className="tile-grid tile-grid-1">
          {venues.map(v => (
            <button key={v.venueId} className="choice-tile choice-tile-wide" onClick={() => onPick(v)}>
              <span className="choice-icon">🏟️</span>
              <div className="choice-text">
                <span className="choice-name">{v.name}</span>
                {v.city && <span className="choice-sub">{v.city}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}