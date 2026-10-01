import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ErrorMessage from '../components/ErrorMessage';

export default function DashboardPage({ profile, routeError, onEnterMeeting, onSignOut, onJoin }) {
  const [error, setError] = useState(routeError || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (routeError) setError(routeError);
  }, [routeError]);

  const isAllowed = Boolean(profile?.isAllowed ?? profile?.is_allowed);

  async function joinMeeting() {
    if (!isAllowed || busy) return;
    setBusy(true);
    setError('');
    try {
      const meeting = await onJoin();
      onEnterMeeting(meeting);
    } catch (joinError) {
      setError(joinError.message || 'Could not join MEnU Meet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-page">
      <AppHeader username={profile?.username} onSignOut={onSignOut} />

      {!isAllowed && (
        <div className="notice warning">
          Your account has been created, but an administrator has not enabled access yet.
        </div>
      )}

      <section className="hero-copy single-meeting-hero">
        <div>
          <div className="eyebrow">MEnU MEET</div>
          <h1>Your private meeting space</h1>
          <p className="muted">One private room. Click Join and you're in.</p>
        </div>
      </section>

      <section className="single-meeting-panel panel">
        <div className="panel-icon">M</div>
        <h2>Ready to meet?</h2>
        <p className="muted">
          MEnU Meet is built around one private two-person meeting. No room codes, no meeting selection.
        </p>
        <button className="button join-main-button" disabled={!isAllowed || busy} onClick={joinMeeting}>
          {busy ? 'Joining…' : 'Join meeting'}
        </button>
        <div className="meeting-features">
          <span>Camera</span>
          <span>Microphone</span>
          <span>Screen share</span>
          <span>Private connection</span>
        </div>
      </section>

      <ErrorMessage className="dashboard-error">{error}</ErrorMessage>
    </main>
  );
}
