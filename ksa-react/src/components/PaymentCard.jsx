import { useState, useRef } from 'react';

const SAM          = 'https://sam-be.idzone.app/api/v2';
const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_YOUR_KEY_HERE';

export default function PaymentCard({ booking, userRef, onPaid }) {
  const [status, setStatus] = useState('pending');
  const [payId, setPayId]   = useState('');
  const statusRef           = useRef('pending'); // ← fix stale closure

  const updateStatus = (s) => { statusRef.current = s; setStatus(s); };

  const openRazorpay = () => {
    if (!window.Razorpay) { alert('Razorpay SDK not loaded. Check internet connection.'); return; }
    updateStatus('paying');

    // Detect if amount is in rupees or paise
    // create_booking returns amount — if it's <= 10000 assume rupees, multiply by 100
    // if it's already large (e.g. 50000) it's already paise
    const amountPaise = booking.amount < 1000
      ? booking.amount * 100
      : booking.amount;

    const rzp = new window.Razorpay({
      key:         RAZORPAY_KEY,
      amount:      amountPaise,
      currency:    'INR',
      name:        'KSA-SAM',
      description: 'Court Booking',
      order_id:    booking.orderId,
      prefill: {
        name:  userRef.current?.name  || '',
        email: userRef.current?.email || '',
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
            updateStatus('success');
            if (onPaid) onPaid(response.razorpay_payment_id);
          } else {
            console.error('Verify failed:', data);
            updateStatus('failed');
          }
        } catch (e) {
          console.error('Verify error:', e);
          updateStatus('failed');
        }
      },
      modal: {
        ondismiss: () => {
          if (statusRef.current === 'paying') updateStatus('pending'); // ← use ref
        }
      }
    });

    rzp.on('payment.failed', (response) => {
      console.error('Payment failed:', response.error);
      updateStatus('failed');
    });

    rzp.open();
  };

  const displayAmount = booking.amount < 1000 ? booking.amount : Math.round(booking.amount / 100);

  if (status === 'success') return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="form-card">
        <div className="success-box">
          <div className="success-icon">🎉</div>
          <div className="success-title">Booking Confirmed!</div>
          <div className="success-sub">Payment ID: {payId}<br />See you on the court! 🏸</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="row-a" style={{ alignItems: 'flex-start' }}>
      <div className="av" style={{ marginTop: 6 }}>🤖</div>
      <div className="form-card">
        <div className="form-card-title">💳 Complete Payment</div>
        <div className="form-sub">Your slot is reserved. Pay now to confirm.</div>
        <div className="order-box">
          <div className="order-row">
            <span className="order-key">Order ID</span>
            <span className="order-val">{booking.orderId}</span>
          </div>
          <div className="order-row">
            <span className="order-key">Amount</span>
            <span className="order-val" style={{ color: 'var(--red-dark)' }}>₹{displayAmount}</span>
          </div>
        </div>
        {status === 'failed' && <div className="form-err">Payment failed. Please try again.</div>}
        <button className="pay-btn" onClick={openRazorpay} disabled={status === 'paying'}>
          {status === 'paying' ? '⏳ Opening Razorpay…' : `⚡ Pay ₹${displayAmount}`}
        </button>
      </div>
    </div>
  );
}