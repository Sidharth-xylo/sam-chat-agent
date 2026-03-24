import { useState, useMemo, useEffect } from 'react';

const PERIODS = [
  { key: 'all', label: 'All Day', icon: 'ALL', range: 'All slots' },
  { key: 'morning', label: 'Morning', icon: 'AM', range: '4AM to 11AM' },
  { key: 'afternoon', label: 'Afternoon', icon: 'PM', range: '11AM to 4PM' },
  { key: 'evening', label: 'Evening', icon: 'EV', range: '4PM to 8PM' },
  { key: 'night', label: 'Night', icon: 'NT', range: '8PM onwards' },
];

function getHour(timeStr = '') {
  return parseInt((timeStr.split('–')[0] || timeStr.split('-')[0] || '').split(':')[0], 10) || 0;
}

function periodForHour(hour) {
  if (hour >= 4 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 20) return 'evening';
  return 'night';
}

function slotMatchesTime(slotTime = '', preferredTime = '') {
  if (!preferredTime) return false;
  const slotStart = (slotTime.split('–')[0] || slotTime.split('-')[0] || '').trim();
  return slotStart === preferredTime;
}

function countAvailable(slots = []) {
  return slots.filter((slot) => slot.available !== false).length;
}

export default function SlotGrid({
  slots = [],
  courts = [],
  preferredPeriod,
  preferredTime,
  preferredCourtId,
  unavailableNotice,
  onPick,
  busy,
}) {
  const [selectedCourt, setSelectedCourt] = useState(
    preferredCourtId != null ? String(preferredCourtId) : 'all'
  );
  const [selectedSlot, setSelectedSlot] = useState(null);

  const courtMap = useMemo(() => {
    const map = new Map();
    courts.forEach((court) => map.set(String(court.id), court.name));
    return map;
  }, [courts]);

  const filteredByCourt = useMemo(
    () => slots.filter((slot) => selectedCourt === 'all' || String(slot.courtId) === selectedCourt),
    [slots, selectedCourt]
  );

  const slotsByPeriod = useMemo(() => {
    const grouped = { all: [...filteredByCourt], morning: [], afternoon: [], evening: [], night: [] };
    filteredByCourt.forEach((slot) => {
      grouped[periodForHour(getHour(slot.time))].push(slot);
    });
    return grouped;
  }, [filteredByCourt]);

  const initialPeriod = useMemo(() => {
    if (preferredPeriod && slotsByPeriod[preferredPeriod]?.length > 0) return preferredPeriod;
    const firstWithAvailability = PERIODS.filter((period) => period.key !== 'all').find(
      (period) => countAvailable(slotsByPeriod[period.key]) > 0
    );
    if (firstWithAvailability) return firstWithAvailability.key;
    return 'all';
  }, [preferredPeriod, slotsByPeriod]);

  const [activePeriod, setActivePeriod] = useState(initialPeriod);

  useEffect(() => {
    setActivePeriod(initialPeriod);
    setSelectedSlot(null);
  }, [initialPeriod]);

  useEffect(() => {
    if (preferredCourtId != null) setSelectedCourt(String(preferredCourtId));
  }, [preferredCourtId]);

  const visibleSlots = (slotsByPeriod[activePeriod] || []).slice(0, 12);
  const preferredTimeUnavailable =
    preferredTime &&
    !visibleSlots.some((slot) => slot.available !== false && slotMatchesTime(slot.time, preferredTime));

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>AI</div>
      <div className="tile-wrap" style={{ width: '100%' }}>
        {courts.length > 0 && (
          <>
            <div className="tile-lbl">Filter by court</div>
            <div className="tile-grid tile-grid-2" style={{ marginBottom: 12 }}>
              <button
                className={`choice-tile${selectedCourt === 'all' ? ' selected' : ''}`}
                onClick={() => {
                  setSelectedCourt('all');
                  setSelectedSlot(null);
                }}
              >
                <span className="choice-icon">ALL</span>
                <span className="choice-name">All Courts</span>
                <span className="choice-sub">{slots.length} slots</span>
              </button>
              {courts.map((court) => {
                const courtSlots = slots.filter((slot) => String(slot.courtId) === String(court.id));
                return (
                  <button
                    key={court.id}
                    className={`choice-tile${selectedCourt === String(court.id) ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedCourt(String(court.id));
                      setSelectedSlot(null);
                    }}
                  >
                    <span className="choice-icon">CT</span>
                    <span className="choice-name">{court.name}</span>
                    <span className="choice-sub">{countAvailable(courtSlots)} available</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="tile-lbl">Filter by time of day</div>
        <div className="tile-grid tile-grid-2" style={{ marginBottom: 12 }}>
          {PERIODS.map((period) => {
            const periodSlots = slotsByPeriod[period.key] || [];
            const availableCount = countAvailable(periodSlots);
            return (
              <button
                key={period.key}
                className={`choice-tile${activePeriod === period.key ? ' selected' : ''}`}
                onClick={() => {
                  setActivePeriod(period.key);
                  setSelectedSlot(null);
                }}
                style={{
                  opacity: periodSlots.length === 0 ? 0.6 : 1,
                  cursor: 'pointer',
                }}
              >
                <span className="choice-icon">{period.icon}</span>
                <span className="choice-name">{period.label}</span>
                <span className="choice-sub">
                  {periodSlots.length === 0 ? 'No slots' : `${availableCount} available`}
                </span>
              </button>
            );
          })}
        </div>

        {(unavailableNotice || (preferredTime && preferredTimeUnavailable)) && (
          <div
            style={{
              fontSize: 12,
              color: '#c0392b',
              background: '#fff5f5',
              border: '1px solid #f5c6cb',
              borderRadius: 8,
              padding: '7px 12px',
              margin: '8px 0 12px',
              fontWeight: 500,
            }}
          >
            {unavailableNotice || `${preferredTime} is not available in this filter. Try another slot.`}
          </div>
        )}

        {visibleSlots.length > 0 ? (
          <>
            <div className="tile-lbl">Choose a slot</div>
            <div className="tile-grid tile-grid-2">
              {visibleSlots.map((slot) => {
                const isBooked = slot.available === false;
                const isSelected = !isBooked && selectedSlot?.id === slot.id;
                const isHighlight = !isBooked && preferredTime && slotMatchesTime(slot.time, preferredTime);

                return (
                  <button
                    key={slot.id}
                    className={`choice-tile${isSelected ? ' selected' : ''}`}
                    disabled={isBooked}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      opacity: isBooked ? 0.45 : 1,
                      cursor: isBooked ? 'not-allowed' : 'pointer',
                      background: isHighlight && !isSelected ? '#fff8e1' : undefined,
                      border: isHighlight && !isSelected ? '1.5px solid #f0a500' : undefined,
                    }}
                  >
                    <span className="choice-icon">{isBooked ? 'FULL' : 'SL'}</span>
                    <span className="choice-name">{slot.time}</span>
                    <span className="choice-sub">
                      {courtMap.get(String(slot.courtId)) || 'Court'} · {slot.price}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: '#888',
              padding: '12px 0',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            No slots for this filter. Try another court or time of day.
          </div>
        )}

        <button
          className="sconfirm"
          disabled={!selectedSlot || busy}
          onClick={() =>
            selectedSlot &&
            onPick({
              id: selectedSlot.id,
              time: selectedSlot.time,
              price: selectedSlot.price,
              courtId: selectedSlot.courtId,
            })
          }
        >
          {selectedSlot ? `Book ${selectedSlot.time}` : 'Select a slot'}
        </button>
      </div>
    </div>
  );
}
