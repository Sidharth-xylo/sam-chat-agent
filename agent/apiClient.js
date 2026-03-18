require("dotenv").config();
const fetch = require("node-fetch");

const BASE_URL      = process.env.SAM_BASE_URL      || "https://sam-be.idzone.app/api/v2";
const SERVICE_TOKEN = process.env.SAM_SERVICE_TOKEN;

let userToken     = null;
let currentUserId = null;

function getSession()           { return { userToken, currentUserId }; }
function clearSession()         { userToken = null; currentUserId = null; }
function setSession(token, uid) {
  userToken     = token;
  currentUserId = uid;
  console.log("[Auth] user session set | userId:", uid);
}

function stripBase64(obj) {
  if (typeof obj === "string") {
    return obj.length > 200 && /^data:image|^[A-Za-z0-9+/]{100,}={0,2}$/.test(obj)
      ? "[image]" : obj;
  }
  if (Array.isArray(obj)) return obj.map(stripBase64);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = stripBase64(obj[k]);
    return out;
  }
  return obj;
}

// Add this after stripBase64 function
function compressResult(name, data) {
  try {
    if(name === 'get_venues') {
      const venues = data.data || data;
      return { data: (Array.isArray(venues)?venues:[venues]).map(v=>({ venueId:v.venueId||v.id, name:v.name, city:v.city })) };
    }
    if(name === 'get_sports_by_venue') {
      const sports = data.data || data;
      return { data: (Array.isArray(sports)?sports:[sports]).map(s=>({ id:s.id, name:s.name })) };
    }
    if(name === 'get_courts_by_sport') {
  const courts = data.data || data;
  return { data: (Array.isArray(courts)?courts:[courts]).map(c=>({
    id:   c.courtId || c.id,
    name: c.courtName || c.name || `Court ${c.courtId||c.id}`,
    type: c.courtType || c.type || ''
  })) };
}
    if(name === 'get_slots') {
      const slots = data.data || data;
      return { data: (Array.isArray(slots)?slots:[slots])
        .filter(s=>s.availabilityStatus==='available')
        .map(s=>({ id:s.slotId||s.id, date:s.slotDate, start:s.startTime, end:s.endTime, rate:s.rate })) };
    }
    if(name === 'create_booking') {
      return { success: data.success, orderId: data.data?.razorpay_order_id||data.razorpay_order_id, amount: data.data?.amount||data.amount };
    }
  } catch(e) {}
  return data;
}

// useUserToken=false → service token (browse)
// useUserToken=true  → user token (booking)
async function apiCall(method, path, body = null, useUserToken = false) {
  const token = useUserToken ? userToken : SERVICE_TOKEN;
  if (!token) return { error: true, message: useUserToken ? "Please login first." : "Service token missing in .env" };

  const headers = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`
  };
  const url     = `${BASE_URL}${path}`;
  const options = { method, headers, ...(body && { body: JSON.stringify(body) }) };

  console.log(`\n[API] ${method} ${url}`);
  const res  = await fetch(url, options);
  const data = await res.json();

  if (!res.ok) {
    return { error: true, status: res.status, message: data?.message || "API request failed" };
  }
  return stripBase64(data);
}

// ── Auth (no token needed) ────────────────────────────────────────
async function register(args) {
  const res  = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args)
  });
  return stripBase64(await res.json());
}

async function login({ email, password }) {
  const res  = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password })
  });
  const data = stripBase64(await res.json());
  if (!res.ok) return { error: true, message: data?.message || "Login failed" };

  userToken     = data.token || data.accessToken || data.data?.token;
  currentUserId = data.userId || data.user?.id || data.data?.userId || data.data?.user?.id;

  if (!currentUserId && userToken) {
    try {
      const p = JSON.parse(Buffer.from(userToken.split(".")[1], "base64").toString());
      currentUserId = p.userId || p.id || p.sub;
    } catch {}
  }
  console.log("[Auth] user logged in | userId:", currentUserId);
  return { success: true, message: "Login successful", userId: currentUserId };
}

async function send_otp({ email }) {
  const res = await fetch(`${BASE_URL}/auth/send-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
  });
  return stripBase64(await res.json());
}

async function verify_otp({ email, otp }) {
  const res  = await fetch(`${BASE_URL}/auth/verify-otp`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp })
  });
  const data = stripBase64(await res.json());
  if (data.token || data.data?.token) {
    userToken = data.token || data.data?.token;
    try {
      const p = JSON.parse(Buffer.from(userToken.split(".")[1], "base64").toString());
      currentUserId = p.userId || p.id || p.sub;
    } catch {}
  }
  return data;
}

// ── Read-only (service token) ─────────────────────────────────────
async function get_venues()                        { return apiCall("GET", "/venues"); }
async function get_sports_by_venue({ venueId })    { return apiCall("GET", `/sports/by-venue?venueId=${venueId}`); }
async function get_courts_by_sport({ sportId })    { return apiCall("GET", `/courts/sport/${sportId}`); }
async function get_slots({ sportId, courtId, venueId, date }) {
  return apiCall("GET", `/slots?sportId=${sportId}&courtId=${courtId}&date=${date}&venueId=${venueId}`);
}

// ── Booking (user token) ──────────────────────────────────────────
async function create_booking({ userId, slotIds, bookedFor }) {
  const uid = userId || currentUserId;
  if (!uid)       return { error: true, message: "Not logged in." };
  if (!userToken) return { error: true, message: "Not logged in." };
  const data = await apiCall("POST", "/bookings/book-now", { userId: uid, slotIds, bookedFor }, true);
  console.log('[Booking] FULL response:', JSON.stringify(data)); // ← see exact shape
  return data;
}

async function verify_payment({ razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentMethod = "razorpay" }) {
  return apiCall("POST", "/bookings/verify-payment", {
    razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentMethod
  }, true);
}

const executors = {
  register, login, send_otp, verify_otp,
  get_venues, get_sports_by_venue, get_courts_by_sport,
  get_slots, create_booking, verify_payment
};

async function executeTool(name, args) {
  const fn = executors[name];
  if (!fn) return { error: true, message: `Unknown tool: ${name}` };
  try {
    const result = await fn(args);
    return compressResult(name, result); // ← compress before storing in history
  } catch (err) {
    return { error: true, message: err.message };
  }
}

module.exports = { executeTool, getSession, setSession, clearSession };