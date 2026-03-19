import { useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SAM = 'https://sam-be.idzone.app/api/v2';

export default function PaymentCard({ booking, userRef, onPaid }) {
  const [status, setStatus] = useState('pending');
  const [payId, setPayId]   = useState('');
  const statusRef           = useRef('pending');

  const update = (s) => { statusRef.current = s; setStatus(s); };

  // From API: amount is in paise, razorpayOrderId is the order ID, keyId is the Razorpay key
  const amountPaise   = booking.amount || 0;
  const displayAmount = Math.round(amountPaise / 100);
  const orderId       = booking.orderId || booking.razorpayOrderId;
  const razorpayKey   = booking.keyId || import.meta.env.VITE_RAZORPAY_KEY || '';

  const pay = () => {
    if (!orderId)      { alert('Order ID missing. Try booking again.'); return; }
    if (!razorpayKey)  { alert('Razorpay key missing. Check .env'); return; }
    if (!window.Razorpay) { alert('Razorpay SDK not loaded.'); return; }

    update('paying');

    const rzp = new window.Razorpay({
      key:         razorpayKey,
      amount:      amountPaise,   // paise — do NOT multiply again
      currency:    'INR',
      name:        'KSA-SAM',
      description: 'Court Booking',
      order_id:    orderId,
      prefill: {
        name:  userRef.current?.name  || '',
        email: userRef.current?.email || ''
      },
      theme: { color: '#ca3210' },
      handler: async (response) => {
        try {
          const res = await fetch(`${SAM}/bookings/verify-payment`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${userRef.current?.token}`
            },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              paymentMethod:       'razorpay'
            })
          });
          const data = await res.json();
          if (res.ok && data.status !== 'error') {
            setPayId(response.razorpay_payment_id);
            update('success');
            onPaid?.(response.razorpay_payment_id);
          } else {
            console.error('Verify failed:', data);
            update('failed');
          }
        } catch(e) {
          console.error(e);
          update('failed');
        }
      },
      modal: { ondismiss: () => { if (statusRef.current === 'paying') update('pending'); } }
    });

    rzp.on('payment.failed', () => update('failed'));
    rzp.open();
  };

  if (status === 'success') return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="form-card">
        <div className="success-box">
          <div className="success-icon">🎉</div>
          <div className="success-title">Booking Confirmed!</div>
          <div className="success-sub">
            Payment ID: {payId}<br/>
            {booking.bookingRef && <>Ref: {booking.bookingRef}<br/></>}
            See you on the court! 🏸
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="form-card">
        <div className="form-card-title">💳 Complete Payment</div>
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
        {status === 'failed' && <div className="form-err">Payment failed. Please try again.</div>}
        {!orderId && <div className="form-err">Order ID missing — please try booking again.</div>}
        <button className="pay-btn" onClick={pay} disabled={status === 'paying' || !orderId}>
          {status === 'paying' ? '⏳ Opening Razorpay…' : `⚡ Pay ₹${displayAmount}`}
        </button>
      </div>
    </div>
  );
}