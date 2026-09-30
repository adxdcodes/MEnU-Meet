# MEnU Meet — Join Flow Fix

Replace the files at the exact paths in this archive.

IMPORTANT: deploy `supabase/functions/livekit-token/index.ts` after replacing it. The 400 currently shown by the browser is coming from the older deployed Edge Function.

Deploy:

```bash
supabase functions deploy livekit-token
```

Then restart the Vite dev server.
