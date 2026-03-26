const PERIODS = [
  { key: 'morning', label: 'Morning', icon: '🌅', hint: '4AM to 11AM' },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️', hint: '11AM to 4PM' },
  { key: 'evening', label: 'Evening', icon: '🌅', hint: '4PM to 8PM' },
  { key: 'night', label: 'Night', icon: '🌙', hint: '8PM onwards' },
];

export default function TimeOfDayPicker({ onPick }) {
  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="tile-wrap">
        <div className="tile-lbl">Choose a time of day</div>
        <div className="tile-grid tile-grid-2">
          {PERIODS.map((period) => (
            <button
              key={period.key}
              className="choice-tile"
              onClick={() => onPick(period.key)}
            >
              <span className="choice-icon">{period.icon}</span>
              <span className="choice-name">{period.label}</span>
              <span className="choice-sub">{period.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
