import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return json({ error: 'Missing Supabase user session.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const livekitUrl = Deno.env.get('LIVEKIT_URL');
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase function environment variables.');
      return json({ error: 'Supabase function configuration is incomplete.' }, 500);
    }

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      console.error('Missing LiveKit function secrets.');
      return json({ error: 'LiveKit server configuration is incomplete.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Supabase auth error:', userError?.message);
      return json({ error: 'Your Supabase session is invalid or expired.' }, 401);
    }

    let payload: {
      room_id?: string;
      roomName?: string;
      participantName?: string;
      participant_name?: string;
    };

    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400);
    }

    // Accept both the current contract and the older contract so an old
    // browser/function deployment does not fail with missing-field errors.
    const roomId = payload.room_id?.trim();
    const requestedRoomName = payload.roomName?.trim();
    const requestedParticipantName = payload.participantName?.trim();

    if (!roomId && !requestedRoomName) {
      return json({ error: 'room_id or roomName is required.' }, 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, is_allowed')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile lookup failed:', profileError.message);
      return json({ error: 'Could not load your application profile.' }, 500);
    }

    if (!profile?.is_allowed) {
      return json({ error: 'Your account is not allowed to use this application yet.' }, 403);
    }

    let meeting = null;

    if (roomId) {
      const result = await supabase
        .from('meetings')
        .select('id, room_code, host_id, max_participants, is_locked, ended_at')
        .eq('id', roomId)
        .maybeSingle();

      if (result.error) {
        console.error('Meeting lookup failed:', result.error.message);
        return json({ error: 'Could not load the meeting.' }, 500);
      }

      meeting = result.data;
    } else {
      const result = await supabase
        .from('meetings')
        .select('id, room_code, host_id, max_participants, is_locked, ended_at')
        .eq('room_code', requestedRoomName)
        .maybeSingle();

      if (result.error) {
        console.error('Meeting lookup failed:', result.error.message);
        return json({ error: 'Could not load the meeting.' }, 500);
      }

      meeting = result.data;
    }

    if (!meeting) {
      return json({ error: 'Meeting not found.' }, 404);
    }

    if (requestedRoomName && requestedRoomName !== meeting.room_code) {
      return json({ error: 'The requested room does not match the meeting.' }, 400);
    }

    if (meeting.ended_at) {
      return json({ error: 'This meeting has ended.' }, 409);
    }

    const isHost = meeting.host_id === user.id;

    if (meeting.is_locked && !isHost) {
      return json({ error: 'This meeting is locked by the host.' }, 403);
    }

    const { count, error: participantCountError } = await supabase
      .from('meeting_participants')
      .select('*', { count: 'exact', head: true })
      .eq('meeting_id', meeting.id)
      .is('left_at', null);

    if (participantCountError) {
      console.error('Participant count failed:', participantCountError.message);
      return json({ error: 'Could not check meeting capacity.' }, 500);
    }

    // An already-active participant is allowed to reconnect without being
    // rejected by the capacity check.
    const { data: existingParticipant, error: existingParticipantError } = await supabase
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', meeting.id)
      .eq('user_id', user.id)
      .is('left_at', null)
      .maybeSingle();

    if (existingParticipantError) {
      console.error('Existing participant lookup failed:', existingParticipantError.message);
      return json({ error: 'Could not verify your meeting membership.' }, 500);
    }

    if ((count ?? 0) >= meeting.max_participants && !existingParticipant && !isHost) {
      return json({ error: 'This meeting is full.' }, 409);
    }

    // LiveKit identity must be stable and unique. The Supabase user ID is ideal.
    const identity = user.id;
    const displayName = requestedParticipantName || profile.username || user.email || user.id;

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: displayName,
      ttl: '2h',
    });

    accessToken.addGrant({
      roomJoin: true,
      room: meeting.room_code,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: isHost,
    });

    const participantToken = await accessToken.toJwt();

    const { error: participantError } = await supabase
      .from('meeting_participants')
      .upsert(
        {
          meeting_id: meeting.id,
          user_id: user.id,
          role: isHost ? 'host' : 'participant',
          joined_at: new Date().toISOString(),
          left_at: null,
        },
        { onConflict: 'meeting_id,user_id' },
      );

    if (participantError) {
      console.error('Participant upsert failed:', participantError.message);
      return json({ error: 'Could not register you as a meeting participant.' }, 500);
    }

    return json({
      participant_token: participantToken,
      server_url: livekitUrl,
      room_name: meeting.room_code,
    });
  } catch (error) {
    console.error('livekit-token unexpected error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected server error.' },
      500,
    );
  }
});
