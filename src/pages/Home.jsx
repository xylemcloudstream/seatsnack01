export default function Home() {
  return (
    <div className="shell" style={{ textAlign: 'center', paddingTop: '18vh' }}>
      <h1 style={{ fontSize: '2.4rem' }}>Seat-side snacks</h1>
      <p className="muted">Scan the QR code on the seat in front of you to order food and drinks — delivered to your seat at the interval.</p>
      <p className="small muted" style={{ marginTop: 40 }}>
        Theatre staff: <a href="/admin" className="pill gold">Admin</a>{' '}
        <a href="/staff" className="pill gold">Staff</a>{' '}
        <a href="/superadmin" className="pill gold">Superadmin</a>
      </p>
    </div>
  );
}
