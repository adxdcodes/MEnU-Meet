import { useEffect, useState } from 'react';
import { PreJoin } from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '../lib/supabase';
import { getLiveKitToken } from '../lib/livekit';
import { getMeetingUrl } from '../lib/routes';
import ErrorMessage from '../components/ErrorMessage';
import P2PMeeting from '../components/P2PMeeting';
import LiveKitMeeting from '../components/LiveKitMeeting';

function mediaErrorMessage(error, kind) {
  const message = error?.message || '';
  if (/permission|denied|notallowed/i.test(message)) return `Browser permission was denied for the ${kind || 'camera/microphone'}. Allow access and try again.`;
  if (/notfound|not found/i.test(message)) return `No ${kind || 'camera or microphone'} was found on this device.`;
  if (/inuse|in use|busy/i.test(message)) return `The ${kind || 'camera/microphone'} is already being used by another application.`;
  return message || `Could not start the ${kind || 'camera/microphone'}.`;
}

function shouldFallbackToLiveKit(message = '') {
  return /direct webrtc|p2p|signaling|negotiat|ice|connection failed|connection timed out|failed to connect/i.test(message)
    && !/permission|camera|microphone|device/i.test(message);
}

export default function MeetingPage({ meeting: initialMeeting, profile, user, onLeave }) {
  const [meeting] = useState({ ...initialMeeting, connection_mode: 'p2p' });
  const [transport, setTransport] = useState('p2p');
  const [connection, setConnection] = useState(null);
  const [mediaChoices, setMediaChoices] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');

  useEffect(() => {
    if (transport !== 'sfu' || connection) return;
    let mounted = true;

    async function prepareLiveKit() {
      setLoading(true);
      setError('');
      try {
        const result = await getLiveKitToken(meeting.id);
        if (mounted) setConnection(result);
      } catch (connectError) {
        if (mounted) setError(connectError.message || 'Unable to prepare the LiveKit connection.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    prepareLiveKit();
    return () => { mounted = false; };
  }, [meeting.id, transport, connection]);

  async function copyMeetingLink() {
    const url = getMeetingUrl(meeting.room_code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Copy this meeting link: ${url}`);
    }
  }

  function handleP2PError(message) {
    if (shouldFallbackToLiveKit(message)) {
      setFallbackMessage('Direct connection was unavailable. Switching to the reliable meeting connection…');
      setTransport('sfu');
      setConnection(null);
      setMediaChoices(null);
      setError('');
      return;
    }
    setError(message);
  }

  if (loading) {
    return (
      <main className="center-page">
        <div className="loader-card">
          <div className="spinner" />
          <h2>Connecting to MEnU Meet</h2>
          <p className="muted">Setting up the reliable meeting connection…</p>
        </div>
      </main>
    );
  }

  if (transport === 'sfu' && connection && mediaChoices) {
    return (
      <div className="meeting-page">
        <header className="meeting-topbar">
          <div className="meeting-brand"><span className="brand-mark">M</span><div><strong>MEnU Meet</strong><span>Private meeting</span></div></div>
          <div className="meeting-actions">
            <span className="live-pill"><i /> Live</span>
            <span className="mode-badge">Reliable connection</span>
            <button className="icon-action" onClick={() => setShowDetails((v) => !v)} title="Meeting details">i</button>
            <button className="share-action" onClick={copyMeetingLink}>{copied ? 'Copied' : 'Share'}</button>
            <button className="leave-action" onClick={onLeave}>Leave</button>
          </div>
        </header>
        {showDetails && <aside className="meeting-details"><div className="details-head"><strong>Meeting details</strong><button onClick={() => setShowDetails(false)}>×</button></div><p className="muted">This is the single private MEnU Meet room.</p><div className="detail-link">{getMeetingUrl(meeting.room_code)}</div><button className="button button-secondary" onClick={copyMeetingLink}>{copied ? 'Link copied' : 'Copy meeting link'}</button><div className="detail-row"><span>Connection</span><strong>Reliable LiveKit</strong></div><div className="detail-row"><span>Participants</span><strong>2 maximum</strong></div></aside>}
        {fallbackMessage && <div className="meeting-alert"><div className="notice">{fallbackMessage}</div></div>}
        <main className="meeting-stage"><LiveKitMeeting connection={connection} mediaChoices={mediaChoices} onLeave={onLeave} onError={setError} /></main>
        {error && <div className="meeting-alert"><ErrorMessage>{error}</ErrorMessage></div>}
      </div>
    );
  }

  if (transport === 'sfu' && !mediaChoices) {
    return (
      <div className="meeting-page">
        <header className="meeting-topbar">
          <div className="meeting-brand"><span className="brand-mark">M</span><div><strong>MEnU Meet</strong><span>Private meeting</span></div></div>
          <div className="meeting-actions"><span className="mode-badge">Reliable connection</span><button className="leave-action" onClick={onLeave}>Leave</button></div>
        </header>
        <main className="meeting-stage">
          <div className="prejoin-shell">
            <div className="prejoin-card">
              <div className="eyebrow">SECURE FALLBACK</div>
              <h2>Almost there</h2>
              <p className="muted">The direct browser connection was unavailable, so MEnU Meet is using its reliable connection instead.</p>
              <PreJoin
                defaults={{ cameraEnabled: true, microphoneEnabled: true }}
                persistUserChoices
                joinLabel="Join meeting"
                onError={(e) => setError(mediaErrorMessage(e))}
                onSubmit={(choices) => { setError(''); setMediaChoices(choices); }}
              />
              {error && <ErrorMessage>{error}</ErrorMessage>}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="meeting-page">
      <header className="meeting-topbar">
        <div className="meeting-brand"><span className="brand-mark">M</span><div><strong>MEnU Meet</strong><span>Private meeting</span></div></div>
        <div className="meeting-actions">
          <span className="live-pill"><i /> Live</span>
          <span className="mode-badge">Direct connection</span>
          <button className="icon-action" onClick={() => setShowDetails((v) => !v)} title="Meeting details">i</button>
          <button className="share-action" onClick={copyMeetingLink}>{copied ? 'Copied' : 'Share'}</button>
          <button className="leave-action" onClick={onLeave}>Leave</button>
        </div>
      </header>

      {showDetails && <aside className="meeting-details"><div className="details-head"><strong>Meeting details</strong><button onClick={() => setShowDetails(false)}>×</button></div><p className="muted">This is the single private MEnU Meet room.</p><div className="detail-link">{getMeetingUrl(meeting.room_code)}</div><button className="button button-secondary" onClick={copyMeetingLink}>{copied ? 'Link copied' : 'Copy meeting link'}</button><div className="detail-row"><span>Connection</span><strong>Direct WebRTC</strong></div><div className="detail-row"><span>Participants</span><strong>2 maximum</strong></div></aside>}
      {error && <div className="meeting-alert"><ErrorMessage>{error}</ErrorMessage></div>}
      <main className="meeting-stage">
        <P2PMeeting meeting={meeting} user={user} profile={profile} onError={handleP2PError} />
      </main>
    </div>
  );
}
