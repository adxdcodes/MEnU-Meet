import { useEffect, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { getLiveKitToken } from '../lib/livekit';
import ErrorMessage from '../components/ErrorMessage';

export default function MeetingPage({ meeting, profile, user, onLeave }) {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      setLoading(true);
      setError('');

      try {
        const result = await getLiveKitToken(meeting, user, profile);
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
          <strong>{meeting.name}</strong>
          <span className="muted">Room {meeting.room_code}</span>
          <span className="role-pill">{meeting.host_id === user.id ? 'Host' : profile?.username}</span>
        </div>
        <button className="button button-danger button-small" onClick={onLeave}>
          Leave
        </button>
      </div>

      <div className="meeting-stage">
        <LiveKitRoom
          token={connection.token}
          serverUrl={connection.serverUrl}
          connect
          audio
          video
          options={{ adaptiveStream: true, dynacast: true }}
          onDisconnected={onLeave}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}
