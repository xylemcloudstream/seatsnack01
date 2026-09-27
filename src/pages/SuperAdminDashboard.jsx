import { useEffect, useState } from 'react';
import { api, getSessionInfo, clearSession } from '../lib/api.js';
import GoogleSignIn from '../components/GoogleSignIn.jsx';

export default function SuperAdminDashboard() {
  const [session, setSession] = useState(getSessionInfo());
  const [tab, setTab] = useState('theatres');
  const [viewSlug, setViewSlug] = useState(null);

  if (!session) {
    return (
      <div className="shell" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <h2>Superadmin sign-in</h2>
        <GoogleSignIn onSignedIn={setSession} />
      </div>
    );
  }
  if (session.role !== 'superadmin') {
    return (
      <div className="shell"><div className="card">
        <h3>Not authorized</h3>
        <p className="muted">{session.email} is not a superadmin account.</p>
        <button className="secondary" onClick={() => { clearSession(); setSession(null); }}>Sign out</button>
      </div></div>
    );
  }

  return (
    <div>
      <div className="topbar row between">
        <span className="brand">Superadmin</span>
        <button className="ghost" onClick={() => { clearSession(); setSession(null); }}>Sign out ({session.email})</button>
      </div>
      <div className="shell">
        {!viewSlug && (
          <>
            <div className="tabs">
              <button className={tab === 'theatres' ? 'active' : ''} onClick={() => setTab('theatres')}>Theatres</button>
              <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>New theatre</button>
            </div>
            {tab === 'theatres' && <TheatreList onView={setViewSlug} />}
            {tab === 'new' && <NewTheatre onCreated={() => setTab('theatres')} />}
          </>
        )}
        {viewSlug && <TheatreDetail slug={viewSlug} onBack={() => setViewSlug(null)} />}
      </div>
    </div>
  );
}

function TheatreList({ onView }) {
  const [theatres, setTheatres] = useState([]);
  useEffect(() => { api('/superadmin/theatres').then((d) => setTheatres(d.theatres)); }, []);
  return (
    <div className="card">
      <h3>All theatres</h3>
      <table>
        <thead><tr><th>Name</th><th>Slug</th><th>Owner</th><th>Screens</th><th>Menu items</th><th></th></tr></thead>
        <tbody>
          {theatres.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td><td>{t.slug}</td><td>{t.owner_email}</td>
              <td>{t.screen_count}</td><td>{t.menu_count}</td>
              <td><button className="secondary" onClick={() => onView(t.slug)}>View data</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TheatreDetail({ slug, onBack }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/superadmin/theatres/${slug}`).then(setData); }, [slug]);
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <button className="ghost" onClick={onBack}>← Back</button>
      <div className="card">
        <h3>{data.theatre.name} <span className="muted small">/{data.theatre.slug}</span></h3>
        <p className="muted small">Owner: {data.theatre.owner_email} · Ordering window: {data.theatre.ordering_window_minutes} min</p>
      </div>
      <div className="card">
        <h3>Seats by class</h3>
        <table><thead><tr><th>Class</th><th>Count</th></tr></thead>
          <tbody>{data.seatCounts.map((s) => <tr key={s.class_name}><td>{s.class_name}</td><td>{s.seat_count}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Menu</h3>
        <table><thead><tr><th>Name</th><th>Price</th><th>Available</th></tr></thead>
          <tbody>{data.menuItems.map((m) => <tr key={m.id}><td>{m.name}</td><td>₹{m.price}</td><td>{m.is_available ? 'Yes' : 'No'}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Staff</h3>
        <table><thead><tr><th>Email</th><th>Role</th></tr></thead>
          <tbody>{data.staff.map((s) => <tr key={s.email}><td>{s.email}</td><td>{s.role}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card">
        <h3>Recent orders</h3>
        <table><thead><tr><th>Seat</th><th>Status</th><th>Amount</th><th>When</th></tr></thead>
          <tbody>{data.recentOrders.map((o) => <tr key={o.id}><td>{o.seat_code}</td><td>{o.status}</td><td>₹{o.subtotal}</td><td>{new Date(o.created_at).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function NewTheatre({ onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [screenName, setScreenName] = useState('');
  const [classes, setClasses] = useState([{ name: 'GOLD', price: 150 }, { name: 'BOX', price: 160 }]);
  const [ranges, setRanges] = useState([{ rows: 'A,B,C,D,E,F', start: 1, end: 33, className: 'GOLD' }]);
  const [busy, setBusy] = useState(false);

  const addRange = () => setRanges((r) => [...r, { rows: '', start: 1, end: 10, className: classes[0]?.name || '' }]);
  const updateRange = (i, patch) => setRanges((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeRange = (i) => setRanges((r) => r.filter((_, idx) => idx !== i));

  const buildSeats = () => {
    const seats = [];
    for (const range of ranges) {
      const rows = range.rows.split(',').map((r) => r.trim()).filter(Boolean);
      for (const row of rows) {
        for (let n = Number(range.start); n <= Number(range.end); n++) {
          seats.push({ row, number: n, seatCode: `${row}${n}`, className: range.className });
        }
      }
    }
    return seats;
  };

  const submit = async () => {
    if (!name || !slug || !ownerEmail || !screenName) return alert('Fill in theatre, slug, owner email and screen name');
    setBusy(true);
    try {
      const seats = buildSeats();
      await api('/superadmin/theatres', {
        method: 'POST',
        body: { name, slug, ownerEmail, screen: { name: screenName }, seatClasses: classes, seats }
      });
      alert(`Created "${name}" with ${seats.length} seats.`);
      onCreated();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Theatre details</h3>
        <div className="row wrap">
          <input placeholder="Theatre name (e.g. Surabhi Theatre)" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Slug (e.g. surabhi)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <div className="row wrap">
          <input placeholder="Owner's Google email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
          <input placeholder="Screen name (e.g. 4K LASER)" value={screenName} onChange={(e) => setScreenName(e.target.value)} />
        </div>
      </div>

      <div className="card stack">
        <h3>Seat classes &amp; pricing</h3>
        {classes.map((c, i) => (
          <div className="row wrap" key={i}>
            <input placeholder="Class name" value={c.name} onChange={(e) => setClasses((cs) => cs.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
            <input placeholder="Price" type="number" value={c.price} onChange={(e) => setClasses((cs) => cs.map((x, idx) => idx === i ? { ...x, price: Number(e.target.value) } : x))} style={{ maxWidth: 140 }} />
          </div>
        ))}
        <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setClasses((c) => [...c, { name: '', price: 0 }])}>+ Add class</button>
      </div>

      <div className="card stack">
        <h3>Seat matrix</h3>
        <p className="muted small">Describe seats as row ranges — e.g. rows "A,B,C,D,E,F", numbers 1–33, class GOLD. Add one range per contiguous block (a row with an aisle gap needs two ranges).</p>
        {ranges.map((r, i) => (
          <div className="row wrap" key={i}>
            <input placeholder="Rows, comma separated" value={r.rows} onChange={(e) => updateRange(i, { rows: e.target.value })} style={{ minWidth: 200 }} />
            <input placeholder="Start #" type="number" value={r.start} onChange={(e) => updateRange(i, { start: e.target.value })} style={{ maxWidth: 100 }} />
            <input placeholder="End #" type="number" value={r.end} onChange={(e) => updateRange(i, { end: e.target.value })} style={{ maxWidth: 100 }} />
            <select value={r.className} onChange={(e) => updateRange(i, { className: e.target.value })} style={{ maxWidth: 140 }}>
              {classes.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button className="ghost" onClick={() => removeRange(i)}>Remove</button>
          </div>
        ))}
        <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={addRange}>+ Add range</button>
        <p className="small muted">This will create {buildSeats().length} seats.</p>
      </div>

      <button onClick={submit} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Creating…' : 'Create theatre'}</button>
    </div>
  );
}
