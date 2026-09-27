import { useEffect, useRef } from 'react';
import { api, saveSession } from '../lib/api.js';

// Reads the Google OAuth Client ID injected at build time via Vite env var.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleSignIn({ onSignedIn }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const data = await api('/auth/google', { method: 'POST', body: { credential: response.credential }, auth: false });
          saveSession(data.token, data);
          onSignedIn(data);
        } catch (e) {
          alert('Sign-in failed: ' + e.message);
        }
      }
    });
    window.google.accounts.id.renderButton(ref.current, {
      theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with'
    });
  }, [onSignedIn]);

  if (!GOOGLE_CLIENT_ID) {
    return <p className="muted small">Set VITE_GOOGLE_CLIENT_ID to enable Google Sign-In.</p>;
  }
  return <div className="g-signin-target" ref={ref} />;
}
