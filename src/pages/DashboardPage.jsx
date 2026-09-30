import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getMeetingUrl } from '../lib/routes';
import AppHeader from '../components/AppHeader';
import ErrorMessage from '../components/ErrorMessage';

function makeRoomCode() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
}

export default function DashboardPage({ user, profile, routeError, onEnterMeeting, onSignOut }) {
  const [meetingName, setMeetingName] = useState('Friends Hangout');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState(routeError || '');
  const [busy, setBusy] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  useEffect(() => {
    if (routeError) setError(routeError);
  }, [routeError]);

  const isAllowed = Boolean(profile?.isAllowed ?? profile?.is_allowed);

  async function createMeeting() {
    if (!isAllowed) return;

    setBusy(true);
    setError('');
    setCreatedLink('');

    try {
      const { data, error: insertError } = await supabase
        .from('meetings')
        .insert({
          room_code: makeRoomCode(),
          name: meetingName.trim() || 'Friends Hangout',
          host_id: user.id,
          max_participants: 5,
          require_approval: true,
          allow_chat: true,
          allow_screen_share: true,
          connection_mode: 'p2p',
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
      setCreatedLink(getMeetingUrl(data.room_code));
      onEnterMeeting(data);
    } catch (createError) {
      setError(createError.message || 'Could not create the meeting.');
    } finally {
      setBusy(false);
    }
  }

  async function joinMeeting() {
    if (!isAllowed) return;

    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError('Enter a room code or use a shared MEnU Meet link.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const { data, error: selectError } = await supabase
        .from('meetings')
        .select('*')
        .eq('room_code', code)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!data) throw new Error('Meeting not found. Check the room code.');

      onEnterMeeting(data);
    } catch (joinError) {
      setError(joinError.message || 'Could not join the meeting.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setError('Meeting link copied.');
    } catch {
      setError(createdLink);
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

      <section className="hero-copy">
        <div>
          <div className="eyebrow">MEnU MEET</div>
          <h1>Your meeting space</h1>
          <p className="muted">Create a private room or share a Google-Meet-style room link.</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-icon">+</div>
          <h2>Create a meeting</h2>
          <p className="muted">Start a new room and become its host.</p>
          <label>
            Meeting name
            <input
              value={meetingName}
              onChange={(event) => setMeetingName(event.target.value)}
              placeholder="Friends Hangout"
              maxLength={100}
            />
          </label>
          <button className="button" disabled={!isAllowed || busy} onClick={createMeeting}>
            {busy ? 'Working…' : 'Create meeting'}
          </button>
          {createdLink && (
            <div className="share-link-box">
              <span>{createdLink}</span>
              <button className="button button-secondary button-small" onClick={copyCreatedLink}>
                Copy link
              </button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-icon">↗</div>
          <h2>Join a meeting</h2>
          <p className="muted">Paste the room code from a shared MEnU Meet link.</p>
          <label>
            Room code
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="AB12CD34"
              maxLength={12}
            />
          </label>
          <button className="button" disabled={!isAllowed || busy} onClick={joinMeeting}>
            {busy ? 'Working…' : 'Join meeting'}
          </button>
        </div>
      </section>

      <ErrorMessage className="dashboard-error">{error}</ErrorMessage>
    </main>
  );
}
