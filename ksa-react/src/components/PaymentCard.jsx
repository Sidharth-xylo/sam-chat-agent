import { useState, useRef } from 'react';

const SAM = 'https://sam-be.idzone.app/api/v2';

export default function PaymentCard({ booking, userRef, pendingRegRef, onPaid, summary }) {
  const [status, setStatus] = useState('pending');
  const [payId, setPayId]   = useState('');
  const [regErr, setRegErr] = useState('');
  const statusRef           = useRef('pending');

  const update = (s) => { statusRef.current = s; setStatus(s); };

  const amountPaise   = booking.amount || 0;
  const displayAmount = Math.round(amountPaise / 100);
  const orderId       = booking.orderId || booking.razorpayOrderId;
  const razorpayKey   = booking.keyId || import.meta.env.VITE_RAZORPAY_KEY || '';

  const pay = () => {
    if (!orderId)           { alert('Order ID missing. Try booking again.'); return; }
    if (!razorpayKey)       { alert('Razorpay key missing. Check .env'); return; }
    if (!window.Razorpay)   { alert('Razorpay SDK not loaded.'); return; }

    update('paying');

    const rzp = new window.Razorpay({
      key:         razorpayKey,
      amount:      amountPaise,
      currency:    'INR',
      name:        'KSA-SAM',
      description: 'Court Booking',
      order_id:    orderId,
      prefill: {
        name:  userRef.current?.name  || '',
        email: userRef.current?.email || '',
      },
      theme: { color: '#ca3210' },
      handler: async (response) => {
        try {
          // ── Step 1: Register + login for new users (before verify-payment) ──
          // This ensures we have a valid auth token for the verify-payment call.
          let authToken = userRef.current?.token || null;

          if (pendingRegRef?.current) {
            const { name, email, mobile, password, pinCode, city, state: st, country } = pendingRegRef.current;

            // Register — creates the User account now that payment is captured
            try {
              await fetch(`${SAM}/auth/register`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ name, email, mobile, password, pinCode, city, state: st, country }),
              });
              // Non-fatal if it fails (e.g. account already exists from a retry)
            } catch (_) {}

            // Login — get a real auth token
            const loginRes  = await fetch(`${SAM}/auth/login`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ email, password }),
            });
            const loginData = await loginRes.json();
            authToken = loginData.token || loginData.accessToken || loginData.data?.token || null;

            if (authToken && userRef.current) {
              userRef.current.token = authToken;
            }

            pendingRegRef.current = null;
          }

          // ── Step 2: Verify payment with the platform ──────────────────────
          const res  = await fetch(`${SAM}/bookings/verify-payment`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              paymentMethod:       'razorpay',
            }),
          });
          const data = await res.json();

          if (res.ok && data.status !== 'error' && data.success !== false) {
            setPayId(response.razorpay_payment_id);
            update('success');
            onPaid?.(response.razorpay_payment_id);
          } else {
            console.error('Verify failed:', data);
            setRegErr(data.message || 'Payment verification failed. Contact support.');
            update('failed');
          }
        } catch (e) {
          console.error(e);
          update('failed');
        }
      },
      modal: { ondismiss: () => { if (statusRef.current === 'paying') update('pending'); } },
    });

    rzp.on('payment.failed', () => update('failed'));
    rzp.open();
  };

  const SummaryBlock = () => (
    <div className="order-box" style={{ marginTop: 8 }}>
      {summary?.user   && <div className="order-row"><span className="order-key">Player</span><span className="order-val">{summary.user}</span></div>}
      {summary?.sport  && <div className="order-row"><span className="order-key">Sport</span><span className="order-val">{summary.sport}</span></div>}
      {summary?.venue  && <div className="order-row"><span className="order-key">Venue</span><span className="order-val">{summary.venue}</span></div>}
      {summary?.court  && <div className="order-row"><span className="order-key">Court</span><span className="order-val">{summary.court}</span></div>}
      {summary?.date   && <div className="order-row"><span className="order-key">Date</span><span className="order-val">{summary.date}</span></div>}
      {summary?.time   && <div className="order-row"><span className="order-key">Time</span><span className="order-val">{summary.time}</span></div>}
      {summary?.price  && <div className="order-row"><span className="order-key">Price</span><span className="order-val">{summary.price}</span></div>}
    </div>
  );

  if (status === 'success') return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>AI</div>
      <div className="form-card">
        <div className="success-box">
          <div className="success-icon">🎉</div>
          <div className="success-title">Booking Confirmed!</div>
          <div className="success-sub">
            Payment ID: {payId}<br />
            {booking.bookingRef && <>Ref: {booking.bookingRef}<br /></>}
            Check your email for booking details and login credentials.<br />
            See you on the court!
          </div>
        </div>
        <SummaryBlock />
      </div>
    </div>
  );

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>AI</div>
      <div className="form-card">
        <div className="form-card-title">Complete Payment</div>
        <div className="form-sub">Slot reserved — pay to confirm.</div>
        <div className="order-box">
          <div className="order-row">
            <span className="order-key">Order ID</span>
            <span className="order-val">{orderId || '—'}</span>
          </div>
          {booking.bookingRef && (
            <div className="order-row">
              <span className="order-key">Booking Ref</span>
              <span className="order-val">{booking.bookingRef}</span>
            </div>
          )}
          <div className="order-row">
            <span className="order-key">Amount</span>
            <span className="order-val" style={{ color: 'var(--red-dark)' }}>₹{displayAmount}</span>
          </div>
        </div>
        <SummaryBlock />
        {regErr && <div className="form-err">{regErr}</div>}
        {status === 'failed' && !regErr && <div className="form-err">Payment failed. Please try again.</div>}
        {!orderId && <div className="form-err">Order ID missing — please try booking again.</div>}
        <button className="pay-btn" onClick={pay} disabled={status === 'paying' || !orderId}>
          {status === 'paying' ? '⏳ Processing…' : `Pay ₹${displayAmount}`}
        </button>
      </div>
    </div>
  );
}
