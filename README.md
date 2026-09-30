# MEnU Meet MVP

React + Supabase + LiveKit Cloud for private browser meetings.

## Structure

- `src/App.jsx` — application state and page switching
- `src/pages/AuthPage.jsx` — sign in / sign up
- `src/pages/DashboardPage.jsx` — create and join meetings
- `src/pages/MeetingPage.jsx` — LiveKit meeting UI
- `src/components/` — reusable UI components
- `src/lib/supabase.js` — Supabase client
- `src/lib/livekit.js` — secure Edge Function invocation and token response handling
- `supabase/functions/livekit-token/index.ts` — server-side LiveKit token generation
- `supabase/schema.sql` — database schema and RLS policies

## Environment

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Never put `LIVEKIT_API_SECRET` in the Vite frontend environment.

## Supabase Edge Function secrets

Configure these secrets for `livekit-token`:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Then deploy the function:

```bash
supabase functions deploy livekit-token
```

## Access control

New profiles default to `is_allowed = false`. Enable a user from a trusted Supabase SQL Editor/admin context using `supabase/admin.sql`.

## Run locally

```bash
npm install
npm run dev
```

The current frontend calls the Supabase Edge Function to mint LiveKit access tokens. The LiveKit API secret stays server-side. LiveKit access tokens encode the participant identity, room, and permissions and are signed using the API secret. See the LiveKit server SDK documentation for the current token API. 
