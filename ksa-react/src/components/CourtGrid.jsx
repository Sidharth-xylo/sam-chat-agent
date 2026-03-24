const LABELS = {
  wooden: 'Wood',
  synthetic: 'Synthetic',
  concrete: 'Concrete',
  grass: 'Grass',
  clay: 'Clay',
  indoor: 'Indoor',
  outdoor: 'Outdoor',
};

const getIcon = (type = '') => {
  const label = LABELS[type.toLowerCase()] || 'Court';
  return label.slice(0, 2).toUpperCase();
};

export default function CourtGrid({ courts = [], selectedCourtId, onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">Choose a Court</div>
        {courts.length > 0 ? (
          <div className="tile-grid tile-grid-2">
            {courts.map((court) => {
              const isSelected = String(selectedCourtId) === String(court.id);
              const isAvailable = court.available !== false;

              return (
                <button
                  key={court.id}
                  className={`choice-tile${isSelected ? ' selected' : ''}`}
                  onClick={() => onPick(court)}
                  style={{
                    cursor: 'pointer',
                    opacity: isAvailable ? 1 : 0.55,
                    border: isSelected
                      ? '2px solid #8B1A1A'
                      : isAvailable
                        ? '2px solid transparent'
                        : '2px solid #ddd',
                    background: isSelected
                      ? '#fff0f0'
                      : isAvailable
                        ? undefined
                        : '#f7f7f7',
                    position: 'relative',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span className="choice-icon">{getIcon(court.type)}</span>
                  <span className="choice-name">{court.name}</span>
                  {court.type && (
                    <span className="choice-sub" style={{ color: isAvailable ? undefined : '#aaa' }}>
                      {court.type}
                    </span>
                  )}
                  {!isAvailable && (
                    <span className="choice-sub" style={{ color: '#bbb', fontStyle: 'italic', fontSize: 10 }}>
                      Fully Booked
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="choice-tile choice-tile-wide" style={{ cursor: 'default', opacity: 0.75 }}>
            <span className="choice-icon">!</span>
            <span className="choice-name">No courts returned</span>
          </div>
        )}
      </div>
    </div>
  );
}
