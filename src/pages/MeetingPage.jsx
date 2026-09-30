import { useEffect, useState } from 'react';
import { PreJoin } from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '../lib/supabase';
import { getLiveKitToken } from '../lib/livekit';
import { getMeetingUrl } from '../lib/routes';
import ErrorMessage from '../components/ErrorMessage';
import ConnectionModeSwitch from '../components/ConnectionModeSwitch';
import P2PMeeting from '../components/P2PMeeting';
import LiveKitMeeting from '../components/LiveKitMeeting';

function mediaErrorMessage(error, kind) {
  const message = error?.message || '';
  if (/permission|denied|notallowed/i.test(message)) return `Browser permission was denied for the ${kind || 'camera/microphone'}. Allow access and try again.`;
  if (/notfound|not found/i.test(message)) return `No ${kind || 'camera or microphone'} was found on this device.`;
  if (/inuse|in use|busy/i.test(message)) return `The ${kind || 'camera/microphone'} is already being used by another application.`;
  return message || `Could not start the ${kind || 'camera/microphone'}.`;
}

export default function MeetingPage({ meeting: initialMeeting, profile, user, onLeave }) {
  const [meeting, setMeeting] = useState({ ...initialMeeting, connection_mode: initialMeeting.connection_mode || 'p2p' });
  const [connection, setConnection] = useState(null);
  const [mediaChoices, setMediaChoices] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isHost = meeting.host_id === user.id;
  const mode = meeting.connection_mode || 'p2p';

  useEffect(() => {
    const channel = supabase.channel(`meeting-mode:${meeting.id}`);
    channel.on('broadcast', { event: 'connection-mode' }, ({ payload }) => {
      const nextMode = payload?.connection_mode;
      if (nextMode === 'p2p' || nextMode === 'sfu') {
        setError(''); setConnection(null); setMediaChoices(null);
        setMeeting((current) => ({ ...current, connection_mode: nextMode }));
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meeting.id]);

  useEffect(() => {
    const channel = supabase.channel(`meeting-row:${meeting.id}`);
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${meeting.id}` }, (payload) => {
      const next = payload.new;
      setMeeting((current) => ({ ...current, ...next }));
      if (next.connection_mode && next.connection_mode !== mode) { setConnection(null); setMediaChoices(null); }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [meeting.id, mode]);

  useEffect(() => {
    if (mode !== 'sfu' || connection) return;
    let mounted = true;
    async function prepareLiveKit() {
      setLoading(true); setError('');
      try {
        const result = await getLiveKitToken(meeting.id);
        if (mounted) setConnection(result);
      } catch (connectError) {
        if (mounted) setError(connectError.message || 'Unable to prepare the LiveKit connection.');
      } finally { if (mounted) setLoading(false); }
    }
    prepareLiveKit();
    return () => { mounted = false; };
  }, [meeting.id, mode, connection]);

  async function copyMeetingLink() {
    const url = getMeetingUrl(meeting.room_code);
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError(`Copy this meeting link: ${url}`); }
  }

  function handleModeChanged(nextMode, modeError) {
    if (modeError) { setError(modeError); return; }
    setError(''); setConnection(null); setMediaChoices(null); setMeeting((current) => ({ ...current, connection_mode: nextMode }));
  }

  if (loading) return <main className="center-page"><div className="loader-card"><div className="spinner" /><h2>Connecting to MEnU Meet</h2><p className="muted">Preparing the secure SFU connection…</p></div></main>;
  if (mode === 'sfu' && (error || !connection)) return <main className="center-page"><div className="error-card"><div className="eyebrow">CONNECTION ISSUE</div><h2>Unable to join</h2><ErrorMessage>{error || 'LiveKit returned an incomplete token response.'}</ErrorMessage><button className="button" onClick={onLeave}>Back to dashboard</button></div></main>;

  return (
    <div className="meeting-page">
      <header className="meeting-topbar">
        <div className="meeting-brand"><span className="brand-mark">M</span><div><strong>MEnU Meet</strong><span>{meeting.name}</span></div></div>
        <div className="meeting-actions">
          <span className="live-pill"><i /> Live</span>
          <span className="mode-badge">{mode === 'p2p' ? 'Direct WebRTC' : 'LiveKit SFU'}</span>
          {isHost && <ConnectionModeSwitch meeting={meeting} onModeChanged={handleModeChanged} />}
          <button className="icon-action" onClick={() => setShowDetails((v) => !v)} title="Meeting details">i</button>
          <button className="share-action" onClick={copyMeetingLink}>{copied ? 'Copied' : 'Share'}</button>
          <button className="leave-action" onClick={onLeave}>Leave</button>
        </div>
      </header>

      {showDetails && <aside className="meeting-details"><div className="details-head"><strong>Meeting details</strong><button onClick={() => setShowDetails(false)}>×</button></div><p className="muted">Share this link with the person you want to invite.</p><div className="detail-link">{getMeetingUrl(meeting.room_code)}</div><button className="button button-secondary" onClick={copyMeetingLink}>{copied ? 'Link copied' : 'Copy meeting link'}</button><div className="detail-row"><span>Connection</span><strong>{mode === 'p2p' ? 'P2P WebRTC' : 'LiveKit SFU'}</strong></div><div className="detail-row"><span>Role</span><strong>{isHost ? 'Host' : profile?.username || 'Participant'}</strong></div></aside>}
      {error && <div className="meeting-alert"><ErrorMessage>{error}</ErrorMessage></div>}

      <main className="meeting-stage">
        {mode === 'p2p' ? <P2PMeeting meeting={meeting} user={user} profile={profile} onError={setError} /> : !mediaChoices ? (
          <div className="prejoin-shell"><div className="prejoin-card"><div className="eyebrow">LIVEKIT SFU</div><h2>Ready to join?</h2><p className="muted">Check your camera and microphone before entering {meeting.name}.</p><PreJoin defaults={{ cameraEnabled: true, microphoneEnabled: true }} persistUserChoices joinLabel="Join meeting" onError={(e) => setError(mediaErrorMessage(e))} onSubmit={(choices) => { setError(''); setMediaChoices(choices); }} /></div></div>
        ) : <LiveKitMeeting connection={connection} mediaChoices={mediaChoices} onLeave={onLeave} onError={setError} />}
      </main>
    </div>
  );
}
