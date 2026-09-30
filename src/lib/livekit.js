import { supabase } from './supabase';

async function readFunctionError(error) {
  if (error?.context instanceof Response) {
    try {
      const payload = await error.context.clone().json();
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    } catch {
      // Fall back to the SDK error message below.
    }
  }

  return error?.message || 'Unable to prepare the LiveKit connection.';
}

export async function getLiveKitToken(roomId) {
  if (!roomId) throw new Error('Meeting ID is missing.');

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const { data, error } = await supabase.functions.invoke('livekit-token', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      room_id: roomId,
    },
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }

  const token = data?.participant_token ?? data?.token;
  const serverUrl = data?.server_url ?? data?.serverUrl;

  if (!token || !serverUrl) {
    throw new Error('LiveKit token response is incomplete.');
  }

  return {
    token,
    serverUrl,
    roomName: data?.room_name ?? data?.roomName,
  };
}
