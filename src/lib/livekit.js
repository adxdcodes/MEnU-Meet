import { supabase } from './supabase';

async function readFunctionError(error) {
  if (error?.context instanceof Response) {
    try {
      const payload = await error.context.clone().json();
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    } catch {
      // Fall back to the SDK error message.
    }
  }

  return error?.message || 'Unable to prepare the LiveKit connection.';
}

export async function getLiveKitToken(meeting, user, profile) {
  if (!meeting?.id) throw new Error('Meeting ID is missing.');
  if (!meeting?.room_code) throw new Error('Meeting room code is missing.');
  if (!user?.id) throw new Error('Authenticated user is missing.');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const participantName = user.id;
  const roomName = meeting.room_code;

  const { data, error } = await supabase.functions.invoke('livekit-token', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      // New contract.
      room_id: meeting.id,
      roomName,
      participantName,
      // Useful fallback for the currently deployed function if it still
      // expects the older roomName/participantName contract.
      participant_name: profile?.username || user.email || user.id,
    },
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  const token = data?.participant_token || data?.token;
  const serverUrl = data?.server_url || data?.serverUrl;

  if (!token || !serverUrl) {
    console.error('Incomplete LiveKit response:', data);
    throw new Error('LiveKit token response is incomplete.');
  }

  return {
    token,
    serverUrl,
    roomName: data?.room_name || data?.roomName || roomName,
  };
}
