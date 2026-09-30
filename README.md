# FriendMeet MVP

React + Supabase + LiveKit SFU. Designed for small private browser meetings (max 5 participants).

## Stack
- React + Vite
- Supabase Auth/Postgres/Realtime
- LiveKit SFU for real-time audio/video/screen sharing
- Supabase Edge Function for secure LiveKit access tokens

## Setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Create a LiveKit Cloud project (or later self-host LiveKit).
4. Deploy the `livekit-token` Edge Function and configure:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
5. Put Supabase URL and anon key in `.env`.
6. `npm install && npm run dev`

## Important
Set `profiles.is_allowed = true` from a trusted admin context for the users who may use the app. Never expose a Supabase service-role key in the browser.

The browser connects to the LiveKit SFU. Supabase does not carry the media stream.
