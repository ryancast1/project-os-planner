-- W Apple Shortcut. Matches app/vice/page.tsx: tracking days reset at 04:00 NY.
begin;
create schema if not exists private;
create table if not exists private.weed_shortcut_keys (
  token_hash bytea primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table private.weed_shortcut_keys enable row level security;
revoke all on private.weed_shortcut_keys from public, anon, authenticated;

create or replace function public.log_weed_shortcut(
  p_token text,
  p_request_id uuid default gen_random_uuid(),
  p_preview boolean default false
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_now timestamptz;
  v_local timestamp;
  v_day date;
  v_current_day date;
  v_count bigint;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Invalid shortcut key' using errcode = '28000';
  end if;
  select k.user_id into v_user from private.weed_shortcut_keys k
  where k.token_hash = sha256(convert_to(p_token, 'UTF8')) and k.revoked_at is null;
  if v_user is null then
    raise exception 'Invalid shortcut key' using errcode = '28000';
  end if;
  if p_request_id is null or p_preview is null then
    raise exception 'Expected a request ID and preview flag' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('weed:' || v_user::text, 0));
  v_now := clock_timestamp();
  v_local := v_now at time zone 'America/New_York';
  v_current_day := (v_local - interval '4 hours')::date;
  v_day := v_current_day;

  if not p_preview then
    insert into public.weed_hits(id, user_id, created_at, occurred_on, occurred_at)
    values(p_request_id, v_user, v_now, v_local::date, v_local::time(0))
    on conflict(id) do nothing;
    if not exists(select 1 from public.weed_hits where id = p_request_id and user_id = v_user) then
      raise exception 'Request ID already used' using errcode = '22023';
    end if;
  end if;

  -- Use editable local date/time fields, exactly as the vice module does.
  select count(*) into v_count from public.weed_hits h
  where h.user_id = v_user and (
    (h.occurred_on = v_day and h.occurred_at >= time '04:00') or
    (h.occurred_on = v_day + 1 and h.occurred_at < time '04:00')
  );
  return format('W: %s hits today', v_count);
end;
$$;
revoke all on function public.log_weed_shortcut(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.log_weed_shortcut(text, uuid, boolean) to anon;
commit;

-- Provision a separate random 64-character W key; store only its SHA-256 hash
-- in private.weed_shortcut_keys. Revoke with revoked_at = now().
