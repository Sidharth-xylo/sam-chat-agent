require("dotenv").config();
const fetch = require("node-fetch");

const BASE_URL      = process.env.SAM_BASE_URL || "https://sam-be.idzone.app/api/v2";
const SERVICE_TOKEN = process.env.SAM_SERVICE_TOKEN;

// User token — set after login
let userToken     = null;
let currentUserId = null;

function setSession(token, uid) {
  userToken     = token;
  currentUserId = uid;
  console.log("[Auth] session set | userId:", uid);
}

function clearSession() {
  userToken     = null;
  currentUserId = null;
}

// Strip base64 images to save tokens
function stripBase64(obj) {
  if (typeof obj === "string") {
    return obj.length > 200 && /^data:image|^[A-Za-z0-9+/]{100,}={0,2}$/.test(obj)
      ? "[image]" : obj;
  }
  if (Array.isArray(obj))            return obj.map(stripBase64);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = stripBase64(obj[k]);
    return out;
  }
  return obj;
}

async function serviceGet(path) {
  const res  = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}`, "Content-Type": "application/json" }
  });
  const data = await res.json();
  if (!res.ok) return { error: true, message: data?.message || "Request failed" };
  return stripBase64(data);
}

// ── Tool implementations ──────────────────────────────────────────

async function get_venues() {
  const data   = await serviceGet("/venues");
  const venues = data.data || data;
  return Array.isArray(venues)
    ? venues.map(v => ({ venueId: v.venueId||v.id, name: v.name||v.venueName, city: v.city||"" }))
    : [];
}

async function get_sports_by_venue({ venueId }) {
  const data   = await serviceGet(`/sports/by-venue?venueId=${venueId}`);
  const sports = data.data || data;
  return Array.isArray(sports)
    ? sports.map(s => ({ id: s.id, name: s.name||s.sportName }))
    : [];
}

async function get_courts_by_sport({ sportId }) {
  const data   = await serviceGet(`/courts/sport/${sportId}`);
  const courts = data.data || data;
  return Array.isArray(courts)
    ? courts.map(c => ({ id: c.courtId||c.id, name: c.courtName||c.name||`Court ${c.courtId||c.id}`, type: c.courtType||c.type||"" }))
    : [];
}

async function get_slots({ sportId, courtId, venueId, date }) {
  const data  = await serviceGet(`/slots?sportId=${sportId}&courtId=${courtId}&date=${date}&venueId=${venueId}`);
  const slots = data.data || data;
  return Array.isArray(slots)
    ? slots
        .filter(s => s.availabilityStatus === "available")
        .map(s => ({
          slotId:    s.slotId || s.id,
          startTime: s.startTime,
          endTime:   s.endTime,
          rate:      s.rate,
          availabilityStatus: "available"
        }))
    : [];
}

async function create_booking({ userId, slotIds, bookedFor }) {
  const uid   = userId || currentUserId;
  const token = userToken;
  if (!uid || !token) return { error: true, message: "Not authenticated." };

  const res  = await fetch(`${BASE_URL}/bookings/book-now`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ userId: uid, slotIds, bookedFor })
  });
  const data = await res.json();
  console.log("[Booking] raw:", JSON.stringify(data));

  if (!res.ok) return { error: true, message: data?.message || "Booking failed" };

  // Return exactly what the AI needs — use actual field names from API
  return {
    success:    data.success,
    razorpayOrderId: data.razorpayOrderId || null,
    keyId:      data.keyId      || null,
    amount:     data.amount     || 0,       // paise
    bookingRef: data.bookingRef || null,
    receipt:    data.receipt    || null,
  };
}

// ── Dispatcher ────────────────────────────────────────────────────
const executors = { get_venues, get_sports_by_venue, get_courts_by_sport, get_slots, create_booking };

async function executeTool(name, args) {
  const fn = executors[name];
  if (!fn) return { error: true, message: `Unknown tool: ${name}` };
  try   { return await fn(args); }
  catch (e) { return { error: true, message: e.message }; }
}

module.exports = { executeTool, setSession, clearSession };