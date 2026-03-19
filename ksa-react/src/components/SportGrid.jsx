import { useState, useMemo } from 'react';

const PERIODS = [
  { key:'morning',   label:'Morning',   icon:'🌅', range:'4AM–11AM' },
  { key:'afternoon', label:'Afternoon', icon:'☀️',  range:'11AM–4PM' },
  { key:'evening',   label:'Evening',   icon:'🌇', range:'4PM–8PM'  },
  { key:'night',     label:'Night',     icon:'🌙', range:'8PM–4AM'  },
];

const hour    = (t='') => parseInt((t.split('–')[0]||'').split(':')[0]) || 0;
const period  = (h) => h>=4&&h<11?'morning':h>=11&&h<16?'afternoon':h>=16&&h<20?'evening':'night';

export default function SlotGrid({ slots, onPick, busy }) {
  const byP = useMemo(() => {
    const g = { morning:[], afternoon:[], evening:[], night:[] };
    slots.forEach(s => g[period(hour(s.time))].push(s));
    return g;
  }, [slots]);

  const def = useMemo(() =>
    Object.entries(byP).sort((a,b)=>b[1].length-a[1].length)[0][0]
  , [byP]);

  const [p, setP] = useState(def);
  const [sel, setSel] = useState(null);
  const list = (byP[p]||[]).slice(0,6);

  return (
    <div className="row-a" style={{ alignItems:'flex-start' }}>
      <div className="av" style={{ marginTop:6 }}>🤖</div>
      <div className="slots-wrap">
        <div className="slots-lbl">🕐 Pick a time</div>
        <div className="period-tabs">
          {PERIODS.map(pd => {
            const cnt   = byP[pd.key]?.length||0;
            const empty = cnt===0;
            return (
              <button key={pd.key}
                className={`period-tab${p===pd.key?' active':''}${empty?' empty':''}`}
                onClick={() => !empty&&(setP(pd.key),setSel(null))}>
                <span className="period-icon" style={{opacity:empty?.4:1}}>{pd.icon}</span>
                <span className="period-name">{pd.label}</span>
                <span className="period-range">{pd.range}</span>
                {empty&&<span className="period-full">Full</span>}
              </button>
            );
          })}
        </div>

        {list.length>0 ? (
          <>
            <div className="slots-lbl" style={{marginTop:10}}>📅 Available Slots</div>
            <div className="slots-grid">
              {list.map(s=>(
                <div key={s.id} className={`stile${sel?.id===s.id?' sel':''}`} onClick={()=>setSel(s)}>
                  <div className="stime">{(s.time||'').replace('–','\n')}</div>
                  <div className="sprice">{s.price}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{fontSize:12,color:'#888',padding:'10px 0',textAlign:'center',fontStyle:'italic'}}>
            All {p} slots are booked. Try another period.
          </div>
        )}

        <button className="sconfirm" disabled={!sel||busy}
          onClick={()=>sel&&onPick(sel)}>
          {sel?`⚡ Book ${sel.time}`:'Select a slot'}
        </button>
      </div>
    </div>
  );
}