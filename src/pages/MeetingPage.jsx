import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  PreJoin,
  RoomAudioRenderer,
  StartAudio,
  VideoConference,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { getLiveKitToken } from '../lib/livekit';
import { getMeetingUrl } from '../lib/routes';
import ErrorMessage from '../components/ErrorMessage';

function mediaErrorMessage(error, kind) {
  const message = error?.message || '';
  if (/permission|denied|notallowed/i.test(message)) {
    return `Browser permission was denied for the ${kind || 'camera/microphone'}. Allow access and try again.`;
  }
  if (/notfound|not found/i.test(message)) {
    return `No ${kind || 'camera or microphone'} was found on this device.`;
  }
  if (/inuse|in use|busy/i.test(message)) {
    return `The ${kind || 'camera/microphone'} is already being used by another application.`;
  }
  return message || `Could not start the ${kind || 'camera/microphone'}.`;
}

export default function MeetingPage({ meeting, profile, user, onLeave }) {
  const [connection, setConnection] = useState(null);
  const [mediaChoices, setMediaChoices] = useState(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      setLoading(true);
      setError('');
      setConnectionError('');

      try {
        const result = await getLiveKitToken(meeting.id);
        if (!mounted) return;
        setConnection(result);
      } catch (connectError) {
        if (!mounted) return;
        setError(connectError.message || 'Unable to prepare the meeting.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    connect();
    return () => {
      mounted = false;
    };
  }, [meeting.id]);

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

  if (loading) {
    return (
      <main className="center-page">
        <div className="loader-card">
          <div className="spinner" aria-hidden="true" />
          <h2>Preparing your meeting</h2>
          <p className="muted">Securely requesting a LiveKit participant token…</p>
        </div>
      </main>
    );
  }

  if (error || !connection) {
    return (
      <main className="center-page">
        <div className="error-card">
          <div className="eyebrow">JOIN FAILED</div>
          <h2>Unable to join</h2>
          <ErrorMessage>{error || 'LiveKit returned an incomplete token response.'}</ErrorMessage>
          <button className="button" onClick={onLeave}>Back to dashboard</button>
        </div>
      </main>
    );
  }

  return (
    <div className="meeting-page">
      <div className="meeting-topbar">
        <div className="meeting-title">
          <strong>MEnU Meet</strong>
          <span className="muted">{meeting.name}</span>
          <span className="role-pill">{meeting.host_id === user.id ? 'Host' : profile?.username}</span>
        </div>
        <button className="button button-secondary button-small" onClick={copyMeetingLink}>
          {copied ? 'Copied' : 'Share'}
        </button>
        <button className="button button-danger button-small" onClick={onLeave}>
          Leave
        </button>
      </div>

      {connectionError && (
        <div className="meeting-alert">
          <ErrorMessage>{connectionError}</ErrorMessage>
        </div>
      )}

      <div className="meeting-stage">
        {!mediaChoices ? (
          <div className="prejoin-shell">
            <div className="prejoin-card">
              <div className="eyebrow">MEnU MEET</div>
              <h2>Check your camera and microphone</h2>
              <p className="muted">Choose your devices before entering the room.</p>
              <PreJoin
                defaults={{
                  cameraEnabled: true,
                  microphoneEnabled: true,
                }}
                persistUserChoices
                joinLabel="Join meeting"
                onError={(prejoinError) => setConnectionError(mediaErrorMessage(prejoinError))}
                onSubmit={(choices) => {
                  setConnectionError('');
                  setMediaChoices(choices);
                }}
              />
            </div>
          </div>
        ) : (
          <LiveKitRoom
            token={connection.token}
            serverUrl={connection.serverUrl}
            connect={true}
            audio={mediaChoices.microphoneEnabled}
            video={mediaChoices.cameraEnabled}
            options={{ adaptiveStream: true, dynacast: true }}
            onDisconnected={onLeave}
            onError={(roomError) => setConnectionError(roomError?.message || 'LiveKit connection failed.')}
            onMediaDeviceFailure={(failure, kind) => setConnectionError(mediaErrorMessage(failure, kind))}
          >
            <VideoConference />
            <RoomAudioRenderer />
            <StartAudio label="Click to enable audio" />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
