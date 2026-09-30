import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('id, username, is_allowed').eq('id', user.id).single();
    if (profileError || !profile?.is_allowed) throw new Error('You are not allowed to use this application.');

    const { room_id } = await req.json();
    if (!room_id) throw new Error('room_id is required');

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings').select('id, room_code, host_id, max_participants, is_locked, allow_screen_share')
      .eq('id', room_id).single();
    if (meetingError || !meeting) throw new Error('Meeting not found');
    if (meeting.is_locked && meeting.host_id !== user.id) throw new Error('This meeting is locked.');

    const { count } = await supabase
      .from('meeting_participants').select('*', { count: 'exact', head: true })
      .eq('meeting_id', room_id).is('left_at', null);
    if ((count ?? 0) >= meeting.max_participants && meeting.host_id !== user.id) throw new Error('Meeting is full.');

    const identity = user.id; // opaque UUID; don't use email/real name as LiveKit identity.
    const token = new AccessToken(Deno.env.get('LIVEKIT_API_KEY')!, Deno.env.get('LIVEKIT_API_SECRET')!, {
      identity,
      name: profile.username,
      ttl: '2h',
    });
    token.addGrant({
      roomJoin: true,
      room: meeting.room_code,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: meeting.host_id === user.id,
    });
    const participantToken = await token.toJwt();

    await supabase.from('meeting_participants').upsert({
      meeting_id: room_id,
      user_id: user.id,
      role: meeting.host_id === user.id ? 'host' : 'participant',
      left_at: null,
    }, { onConflict: 'meeting_id,user_id' });

    return new Response(JSON.stringify({ server_url: Deno.env.get('LIVEKIT_URL'), participant_token: participantToken }), {
      headers: { ...cors, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      headers: { ...cors, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});
