// Floating sports icons in the background
const SPORTS_ICONS = [
  { icon: '🏸', size: 80,  x: 5,  y: 10, dur: 8  },,
  { icon: '⚽', size: 100, x: 15, y: 70, dur: 14 },,
  { icon: '🏓', size: 65,  x: 45, y: 85, dur: 12 },
  { icon: '🥊', size: 55,  x: 90, y: 40, dur: 10 },,
  { icon: '💪', size: 60,  x: 60, y: 15, dur: 7  },
  { icon: '🏋️', size: 80,  x: 30, y: 30, dur: 15 },,
  { icon: '🏸', size: 50,  x: 50, y: 50, dur: 9  },
,
];

export default function SportsBackground() {
  return (
    <div className="bg-wrap">
      <div className="court-lines" />
      {SPORTS_ICONS.map((s, i) => (
        <span
          key={i}
          className="sports-icon"
          style={{
            fontSize:         s.size,
            left:             `${s.x}%`,
            top:              `${s.y}%`,
            animationDuration:`${s.dur}s`,
            animationDelay:   `${i * 0.7}s`,
          }}
        >
          {s.icon}
        </span>
      ))}
    </div>
  );
}
