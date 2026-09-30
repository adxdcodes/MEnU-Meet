# MEnU Meet

MEnU Meet is a browser-based private meeting app built with React, Supabase, and two selectable media transports:

- **P2P WebRTC** — direct browser-to-browser media for two-person calls. Supabase Realtime is used only for signaling.
- **LiveKit SFU** — LiveKit Cloud carries media through an SFU when the host switches the room to SFU mode.

## Connection mode

Every meeting stores `connection_mode` as either `p2p` or `sfu`. New meetings default to P2P. The host can switch the active meeting between P2P WebRTC and LiveKit SFU from the meeting header. The selected mode is persisted in Supabase and broadcast to current participants.

## P2P networking

P2P uses `RTCPeerConnection`, `getUserMedia()` for camera/microphone, and `getDisplayMedia()` for screen sharing. Supabase Realtime broadcasts SDP offers/answers and ICE candidates; it does not carry the media stream.

For production reliability across restrictive NATs/firewalls, configure a TURN server through `VITE_WEBRTC_ICE_SERVERS`. STUN-only development can work for many networks but is not a guarantee of direct connectivity.

## LiveKit

The LiveKit path uses the Supabase `livekit-token` Edge Function to mint short-lived participant tokens. Keep `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` server-side only.

## Run

```bash
npm install
npm run dev
```

Apply `supabase/schema.sql`, configure the Supabase Edge Function secrets, and deploy the function:

```bash
supabase functions deploy livekit-token
```

## Shareable meeting links

Meetings use:

```text
/meet/AB12CD34
```

The full link can be shared from the meeting header.
