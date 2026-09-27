import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getSessionInfo, clearSession } from '../lib/api.js';
import GoogleSignIn from '../components/GoogleSignIn.jsx';

const STATUS_LABEL = { paid: 'New', preparing: 'Preparing', delivered: 'Delivered' };

export default function StaffDashboard() {
  const { theatreSlug } = useParams();
  const [session, setSession] = useState(getSessionInfo());
  const [orders, setOrders] = useState([]);

  const authorized = session && ['admin', 'staff', 'superadmin'].includes(session.role) &&
    (session.role === 'superadmin' || session.slug === theatreSlug);

  useEffect(() => {
    if (!authorized) return;
    const load = () => api(`/theatres/${theatreSlug}/staff/orders`).then((d) => setOrders(d.orders)).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [authorized, theatreSlug]);

  const setStatus = async (orderId, status) => {
    await api(`/theatres/${theatreSlug}/staff/orders/${orderId}`, { method: 'PATCH', body: { status } });
    setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, status } : o)));
  };

  if (!session) {
    return (
      <div className="shell" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <h2>Staff sign-in</h2>
        <GoogleSignIn onSignedIn={setSession} />
      </div>
    );
  }
  if (!authorized) {
    return (
      <div className="shell"><div className="card">
        <h3>Not authorized</h3>
        <p className="muted">{session.email} isn't staff at "{theatreSlug}".</p>
        <button className="secondary" onClick={() => { clearSession(); setSession(null); }}>Sign out</button>
      </div></div>
    );
  }

  const active = orders.filter((o) => o.status !== 'delivered');
  const delivered = orders.filter((o) => o.status === 'delivered');

  return (
    <div>
      <div className="topbar row between">
        <span className="brand">{theatreSlug} · Orders</span>
        <button className="ghost" onClick={() => { clearSession(); setSession(null); }}>Sign out</button>
      </div>
      <div className="shell stack">
        <h2>To pack &amp; deliver ({active.length})</h2>
        {active.length === 0 && <p className="muted">No pending orders.</p>}
        {active.map((o) => <OrderCard key={o.id} order={o} onStatus={setStatus} />)}

        {delivered.length > 0 && (
          <>
            <h3 className="muted" style={{ marginTop: 20 }}>Delivered ({delivered.length})</h3>
            {delivered.map((o) => <OrderCard key={o.id} order={o} onStatus={setStatus} dimmed />)}
          </>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order, onStatus, dimmed }) {
  return (
    <div className="card" style={{ opacity: dimmed ? 0.55 : 1 }}>
      <div className="row between">
        <div>
          <strong style={{ fontSize: '1.2rem' }}>Seat {order.seat}</strong>{' '}
          <span className={`pill ${order.status === 'paid' ? 'gold' : order.status === 'preparing' ? 'velvet' : 'green'}`}>{STATUS_LABEL[order.status]}</span>
        </div>
        <span className="muted small">₹{order.subtotal}</span>
      </div>
      <ul className="muted small" style={{ margin: '10px 0' }}>
        {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
      </ul>
      <div className="row between">
        <span className="small muted">{order.customerName} · {order.customerPhone}</span>
        <div className="row">
          {order.status === 'paid' && <button onClick={() => onStatus(order.id, 'preparing')}>Start packing</button>}
          {order.status === 'preparing' && <button onClick={() => onStatus(order.id, 'delivered')}>Mark delivered</button>}
        </div>
      </div>
    </div>
  );
}
