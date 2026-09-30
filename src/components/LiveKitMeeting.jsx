import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function LiveKitMeeting({ connection, mediaChoices, onLeave, onError }) {
  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.serverUrl}
      connect
      audio={mediaChoices.microphoneEnabled}
      video={mediaChoices.cameraEnabled}
      options={{ adaptiveStream: true, dynacast: true }}
      onDisconnected={onLeave}
      onError={(error) => onError(error?.message || 'LiveKit connection failed.')}
      onMediaDeviceFailure={(failure, kind) => onError(failure?.message || `LiveKit ${kind || 'media'} device failure.`)}
    >
      <VideoConference />
      <RoomAudioRenderer />
      <StartAudio label="Click to enable audio" />
    </LiveKitRoom>
  );
}
