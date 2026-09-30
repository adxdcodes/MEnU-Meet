-- Run from the Supabase SQL Editor as an administrator.
-- Replace the UUID with the auth.users.id of the person you want to allow.
-- Do NOT expose the service-role key or this SQL capability to the browser.
update public.profiles
set is_allowed = true
where id = 'REPLACE_WITH_USER_UUID';

-- To inspect allowed users:
select id, username, is_allowed, created_at
from public.profiles
order by created_at desc;
