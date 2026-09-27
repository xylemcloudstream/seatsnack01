import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken, getSessionInfo, saveSession, clearSession } from '../lib/api.js';
import GoogleSignIn from '../components/GoogleSignIn.jsx';

export default function OrderPage() {
  const { theatreSlug, seatCode } = useParams();
  const [seatInfo, setSeatInfo] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(getSessionInfo());
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [phone, setPhone] = useState('');
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({}); // menuItemId -> qty
  const [placing, setPlacing] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);

  useEffect(() => {
    api(`/theatres/${theatreSlug}/seats/${seatCode}`, { auth: false })
      .then(setSeatInfo)
      .catch((e) => setError(e.message));
  }, [theatreSlug, seatCode]);

  const loadMenu = useCallback(() => {
    api(`/theatres/${theatreSlug}/menu`, { auth: false }).then((d) => setMenu(d.items));
  }, [theatreSlug]);

  useEffect(() => {
    if (seatInfo?.orderingOpen) loadMenu();
  }, [seatInfo, loadMenu]);

  const onSignedIn = (data) => {
    setSession(data);
    if (data.phoneRequired) setPhoneRequired(true);
  };

  const submitPhone = async () => {
    try {
      await api('/auth/phone', { method: 'POST', body: { phone } });
      setPhoneRequired(false);
    } catch (e) {
      alert(e.message);
    }
  };

  const setQty = (id, qty) => setCart((c) => ({ ...c, [id]: Math.max(0, qty) }));

  const items = Object.entries(cart).filter(([, q]) => q > 0);
  const total = items.reduce((sum, [id, q]) => {
    const item = menu.find((m) => m.id === id);
    return sum + (item ? Number(item.price) * q : 0);
  }, 0);

  const checkout = async () => {
    if (!getToken()) return;
    setPlacing(true);
    try {
      const order = await api('/orders/create', {
        method: 'POST',
        body: {
          theatreSlug,
          seatCode,
          items: items.map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
        }
      });

      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.razorpayOrderId,
        name: seatInfo.theatre.name,
        description: `Seat ${seatCode} · ${seatInfo.screen.name}`,
        prefill: { email: session.email, name: session.name },
        theme: { color: '#E3A62F' },
        handler: async (response) => {
          try {
            await api('/orders/verify', {
              method: 'POST',
              body: { orderId: order.orderId, ...response }
            });
            setConfirmedOrderId(order.orderId);
            setCart({});
          } catch (e) {
            alert('Payment verification failed: ' + e.message);
          }
        },
        modal: { ondismiss: () => setPlacing(false) }
      });
      rzp.open();
    } catch (e) {
      alert(e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (error) {
    return <div className="shell"><div className="card"><h2>Can't find that seat</h2><p className="muted">{error}</p></div></div>;
  }
  if (!seatInfo) return <div className="shell muted">Loading seat…</div>;

  if (confirmedOrderId) {
    return (
      <div className="shell">
        <div className="card stack" style={{ textAlign: 'center' }}>
          <span className="pill green" style={{ margin: '0 auto' }}>Order placed</span>
          <h2>We'll bring it to Seat {seatCode}</h2>
          <p className="muted">Your order will be delivered at the interval. Sit back and enjoy the film.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar row between">
        <span className="brand">{seatInfo.theatre.name}</span>
        <span className="pill gold">Seat {seatCode} · {seatInfo.seat.class}</span>
      </div>

      <div className="shell stack">
        <div className="row between">
          <div>
            <h1 style={{ fontSize: '1.6rem' }}>{seatInfo.screen.name}</h1>
            <p className="muted small">Row {seatInfo.seat.row}, Seat {seatInfo.seat.number}</p>
          </div>
        </div>

        {!seatInfo.orderingOpen && (
          <div className="card">
            <h3>Ordering isn't open right now</h3>
            <p className="muted">Food ordering opens once the show starts, and closes as the interval approaches. Check back after the movie begins.</p>
          </div>
        )}

        {seatInfo.orderingOpen && !session && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h3>Sign in to order</h3>
            <p className="muted small">Quick Google sign-in — we'll just ask for your mobile number once, so staff can reach you about your order.</p>
            <GoogleSignIn onSignedIn={onSignedIn} />
          </div>
        )}

        {seatInfo.orderingOpen && session && phoneRequired && (
          <div className="card stack">
            <h3>What's your mobile number?</h3>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
            <button onClick={submitPhone}>Continue</button>
          </div>
        )}

        {seatInfo.orderingOpen && session && !phoneRequired && (
          <div className="card">
            <h3>Menu</h3>
            {menu.length === 0 && <p className="muted">No items available right now.</p>}
            {menu.map((item) => (
              <div className="menu-item" key={item.id}>
                <div>
                  <div>{item.name}</div>
                  {item.description && <div className="muted small">{item.description}</div>}
                  <div className="small" style={{ color: 'var(--gold)' }}>₹{item.price}</div>
                </div>
                <div className="qty-control">
                  <button className="secondary" onClick={() => setQty(item.id, (cart[item.id] || 0) - 1)}>−</button>
                  <span>{cart[item.id] || 0}</span>
                  <button className="secondary" onClick={() => setQty(item.id, (cart[item.id] || 0) + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {seatInfo.orderingOpen && session && !phoneRequired && items.length > 0 && (
        <div className="cart-bar">
          <div>
            <div className="small muted">{items.reduce((n, [, q]) => n + q, 0)} items</div>
            <div style={{ fontWeight: 700 }}>₹{total}</div>
          </div>
          <button onClick={checkout} disabled={placing}>{placing ? 'Placing order…' : `Pay ₹${total}`}</button>
        </div>
      )}
    </div>
  );
}
