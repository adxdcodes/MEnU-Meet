import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
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
      return json({ error: 'Supabase function configuration is incomplete.' }, 500);
    }

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
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
      return json({ error: 'Your Supabase session is invalid or expired.' }, 401);
    }

    let payload: {
      room_id?: string;
      roomName?: string;
      participantName?: string;
    };

    try {
      payload = await req.json();
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400);
    }

    const roomId = payload.room_id?.trim();
    const requestedRoomName = payload.roomName?.trim();

    if (!roomId && !requestedRoomName) {
      return json({ error: 'room_id or roomName is required.' }, 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, is_allowed')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return json({ error: 'Could not load your application profile.' }, 500);
    }

    if (!profile?.is_allowed) {
      return json({ error: 'Your account is not allowed to use this application yet.' }, 403);
    }

    let meetingQuery = supabase
      .from('meetings')
      .select('id, room_code, host_id, max_participants, is_locked, ended_at');

    const { data: meeting, error: meetingError } = roomId
      ? await meetingQuery.eq('id', roomId).maybeSingle()
      : await meetingQuery.eq('room_code', requestedRoomName).maybeSingle();

    if (meetingError) {
      return json({ error: 'Could not load the meeting.' }, 500);
    }

    if (!meeting) {
      return json({ error: 'Meeting not found.' }, 404);
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
      return json({ error: 'Could not check meeting capacity.' }, 500);
    }

    if ((count ?? 0) >= meeting.max_participants && !isHost) {
      return json({ error: 'This meeting is full.' }, 409);
    }

    // LiveKit recommends an opaque participant identity rather than email/name.
    const identity = user.id;
    const participantName = profile.username || payload.participantName || 'MEnU Meet user';

    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: participantName,
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
      return json({ error: 'Could not register you as a meeting participant.' }, 500);
    }

    return json({
      participant_token: participantToken,
      server_url: livekitUrl,
      room_name: meeting.room_code,
    }, 201);
  } catch (error) {
    console.error('livekit-token unexpected error:', error);
    return json({
      error: error instanceof Error ? error.message : 'Unexpected server error.',
    }, 500);
  }
});
