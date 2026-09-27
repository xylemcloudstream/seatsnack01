import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getSessionInfo, clearSession } from '../lib/api.js';
import GoogleSignIn from '../components/GoogleSignIn.jsx';

export default function AdminDashboard() {
  const { theatreSlug } = useParams();
  const [session, setSession] = useState(getSessionInfo());
  const [tab, setTab] = useState('menu');

  const authorized = session && (session.role === 'admin' || session.role === 'superadmin') &&
    (session.role === 'superadmin' || session.slug === theatreSlug);

  if (!session) {
    return (
      <div className="shell" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <h2>Theatre admin sign-in</h2>
        <GoogleSignIn onSignedIn={setSession} />
      </div>
    );
  }
  if (!authorized) {
    return (
      <div className="shell">
        <div className="card">
          <h3>Not authorized</h3>
          <p className="muted">{session.email} isn't an admin for "{theatreSlug}".</p>
          <button className="secondary" onClick={() => { clearSession(); setSession(null); }}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar row between">
        <span className="brand">{theatreSlug} · Admin</span>
        <button className="ghost" onClick={() => { clearSession(); setSession(null); }}>Sign out ({session.email})</button>
      </div>
      <div className="shell">
        <div className="tabs">
          <button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>Menu</button>
          <button className={tab === 'shows' ? 'active' : ''} onClick={() => setTab('shows')}>Shows</button>
          <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Staff</button>
          <button className={tab === 'qr' ? 'active' : ''} onClick={() => setTab('qr')}>QR codes</button>
        </div>
        {tab === 'menu' && <MenuTab theatreSlug={theatreSlug} />}
        {tab === 'shows' && <ShowsTab theatreSlug={theatreSlug} />}
        {tab === 'staff' && <StaffTab theatreSlug={theatreSlug} />}
        {tab === 'qr' && <QrTab theatreSlug={theatreSlug} />}
      </div>
    </div>
  );
}

function MenuTab({ theatreSlug }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', price: '', description: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api(`/theatres/${theatreSlug}/menu`, { auth: false }).then((d) => setItems(d.items));
  useEffect(() => { load(); }, [theatreSlug]);

  const addItem = async () => {
    if (!form.name || !form.price) return;
    setBusy(true);
    try {
      await api(`/theatres/${theatreSlug}/menu`, { method: 'POST', body: { ...form, price: Number(form.price) } });
      setForm({ name: '', price: '', description: '' });
      load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const toggleAvailable = async (item) => {
    await api(`/theatres/${theatreSlug}/menu/${item.id}`, { method: 'PATCH', body: { isAvailable: !item.is_available } });
    load();
  };
  const remove = async (item) => {
    if (!confirm(`Delete ${item.name}?`)) return;
    await api(`/theatres/${theatreSlug}/menu/${item.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Add menu item</h3>
        <div className="row wrap">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Price (₹)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ maxWidth: 140 }} />
        </div>
        <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button onClick={addItem} disabled={busy} style={{ alignSelf: 'flex-start' }}>Add item</button>
      </div>

      <div className="card">
        <h3>Current menu</h3>
        {items.map((item) => (
          <div className="menu-item" key={item.id}>
            <div>
              <div>{item.name} <span className="muted small">₹{item.price}</span></div>
              {item.description && <div className="muted small">{item.description}</div>}
            </div>
            <div className="row">
              <span className={`pill ${item.is_available ? 'green' : 'velvet'}`}>{item.is_available ? 'Available' : 'Hidden'}</span>
              <button className="secondary" onClick={() => toggleAvailable(item)}>{item.is_available ? 'Hide' : 'Show'}</button>
              <button className="danger" onClick={() => remove(item)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShowsTab({ theatreSlug }) {
  const [screenName, setScreenName] = useState('4K LASER');
  const [title, setTitle] = useState('Now Showing');
  const [windowMinutes, setWindowMinutes] = useState(90);
  const [lastShow, setLastShow] = useState(null);

  const start = async () => {
    try {
      const res = await api(`/theatres/${theatreSlug}/admin/shows/start`, {
        method: 'POST',
        body: { screenName, title, orderingWindowMinutes: Number(windowMinutes) }
      });
      setLastShow(res.show);
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="card stack">
      <h3>Start a show</h3>
      <p className="muted small">This opens the food-ordering window for the screen. QR codes at every seat start working the moment you hit start, and ordering closes automatically once the window ends (default: first 90 minutes).</p>
      <div className="row wrap">
        <input placeholder="Screen name" value={screenName} onChange={(e) => setScreenName(e.target.value)} />
        <input placeholder="Movie title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Ordering window (min)" type="number" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} style={{ maxWidth: 200 }} />
      </div>
      <button onClick={start} style={{ alignSelf: 'flex-start' }}>Start show</button>
      {lastShow && (
        <p className="small muted">Started. Ordering closes at {new Date(lastShow.ordering_closes_at).toLocaleTimeString()}.</p>
      )}
    </div>
  );
}

function QrTab({ theatreSlug }) {
  const [seats, setSeats] = useState([]);
  useEffect(() => { api(`/theatres/${theatreSlug}/admin/seats`).then((d) => setSeats(d.seats)); }, [theatreSlug]);

  const origin = window.location.origin;
  return (
    <div className="card">
      <h3>Seat QR codes ({seats.length})</h3>
      <p className="muted small">Stick one of these in front of each seat. Each code links straight to that seat's ordering page — right-click → save image, or screenshot this page to send to a printer.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16, marginTop: 14 }}>
        {seats.map((s) => {
          const url = `${origin}/o/${theatreSlug}/${s.seat_code}`;
          const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
          return (
            <div key={s.seat_code} style={{ textAlign: 'center' }}>
              <img src={qrSrc} alt={s.seat_code} width={100} height={100} style={{ borderRadius: 8, background: '#fff', padding: 4 }} />
              <div className="small">{s.seat_code}</div>
              <div className="muted small">{s.class_name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffTab({ theatreSlug }) {
  const [staff, setStaff] = useState([]);
  const [email, setEmail] = useState('');

  const load = () => api(`/theatres/${theatreSlug}/admin/staff`).then((d) => setStaff(d.staff));
  useEffect(() => { load(); }, [theatreSlug]);

  const add = async () => {
    if (!email) return;
    try {
      await api(`/theatres/${theatreSlug}/admin/staff`, { method: 'POST', body: { email, role: 'staff' } });
      setEmail('');
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="card stack">
      <h3>Counter staff</h3>
      <p className="muted small">Add the Google account of anyone who should see the order-fulfillment dashboard at /staff/{theatreSlug}.</p>
      <div className="row wrap">
        <input placeholder="staff@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={add}>Add staff</button>
      </div>
      <table>
        <thead><tr><th>Email</th><th>Role</th></tr></thead>
        <tbody>
          {staff.map((s) => <tr key={s.email}><td>{s.email}</td><td>{s.role}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
