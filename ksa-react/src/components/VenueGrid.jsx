export default function VenueGrid({ venues = [], onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">Choose a Venue</div>
        {venues.length > 0 ? (
          <div className="tile-grid tile-grid-1">
            {venues.map((venue) => (
              <button
                key={venue.venueId}
                className="choice-tile choice-tile-wide"
                onClick={() => onPick(venue)}
              >
                <span className="choice-icon">🏟️</span>
                <div className="choice-text">
                  <span className="choice-name">{venue.name}</span>
                  {venue.city && <span className="choice-sub">{venue.city}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="choice-tile choice-tile-wide" style={{ cursor: 'default', opacity: 0.75 }}>
            <span className="choice-icon">!</span>
            <div className="choice-text">
              <span className="choice-name">No venues returned</span>
              <span className="choice-sub">The backend did not return any venue data for the picker.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
