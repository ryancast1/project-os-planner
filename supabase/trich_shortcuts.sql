-- T1 / T2 Apple Shortcuts endpoint. No changes to existing app logging or RLS.
begin;

create schema if not exists private;
create table if not exists private.trich_shortcut_keys (
  token_hash bytea primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table private.trich_shortcut_keys enable row level security;
revoke all on private.trich_shortcut_keys from public, anon, authenticated;

create or replace function public.log_trich_shortcut(
  p_token text,
  p_trich integer,
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
  v_day date;
  v_count bigint;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Invalid shortcut key' using errcode = '28000';
  end if;
  select k.user_id into v_user
  from private.trich_shortcut_keys k
  where k.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and k.revoked_at is null;
  if v_user is null then
    raise exception 'Invalid shortcut key' using errcode = '28000';
  end if;
  if p_trich is null or p_trich not in (1, 2) or p_request_id is null
      or p_preview is null then
    raise exception 'Expected T1 or T2 and a request ID' using errcode = '22023';
  end if;

  -- Serialize shortcut taps for this account, then capture the current time.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'America/Los_Angeles')::date;

  if not p_preview then
    insert into public.trich_events(id, user_id, trich, occurred_on, submitted_at)
    values (p_request_id, v_user, p_trich, v_day, v_now)
    on conflict (id) do nothing;

    -- A retried request must refer to the same user's same pull type.
    select e.occurred_on into v_day from public.trich_events e
    where e.id = p_request_id and e.user_id = v_user and e.trich = p_trich;
    if not found then
      raise exception 'Request ID already used' using errcode = '22023';
    end if;
  end if;

  select count(*) into v_count from public.trich_events e
  where e.user_id = v_user and e.trich = p_trich and e.occurred_on = v_day;
  return format('T%s: %s pulls%s', p_trich, v_count,
    case when v_day = (v_now at time zone 'America/Los_Angeles')::date
      then ' today' else ' on ' || v_day::text end);
end;
$$;

revoke all on function public.log_trich_shortcut(text, integer, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.log_trich_shortcut(text, integer, uuid, boolean)
  to anon;
commit;

-- Provision a random 64-character key separately; store only its SHA-256 hash
-- in private.trich_shortcut_keys. The raw key belongs only in the shortcuts.
-- Revoke it by setting revoked_at = now() on its row.
