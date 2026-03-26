const ICONS = {
  badminton: '🏸',
  tennis: '🎾',
  squash: '🎾',
  football: '⚽',
  futsal: '⚽',
  cricket: '🏏',
  pickleball: '🏓',
  table: '🏓',
  gym: '💪',
  default: '⚽',
};

function iconFor(name = '') {
  const key = name.toLowerCase();
  if (key.includes('badminton')) return ICONS.badminton;
  if (key.includes('tennis')) return ICONS.tennis;
  if (key.includes('squash')) return ICONS.squash;
  if (key.includes('football')) return ICONS.football;
  if (key.includes('futsal')) return ICONS.futsal;
  if (key.includes('cricket')) return ICONS.cricket;
  if (key.includes('pickle')) return ICONS.pickleball;
  if (key.includes('table')) return ICONS.table;
  if (key.includes('gym')) return ICONS.gym;
  return ICONS.default;
}

export default function SportGrid({ sports = [], onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">Choose a Sport</div>
        {sports.length > 0 ? (
          <div className="tile-grid tile-grid-2">
            {sports.map((sport) => (
              <button key={sport.id} className="choice-tile" onClick={() => onPick(sport)}>
                <span className="choice-icon">{iconFor(sport.name)}</span>
                <span className="choice-name">{sport.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="choice-tile choice-tile-wide" style={{ cursor: 'default', opacity: 0.75 }}>
            <span className="choice-icon">!</span>
            <span className="choice-name">No sports returned for this venue</span>
          </div>
        )}
      </div>
    </div>
  );
}
