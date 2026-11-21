-- Run before deploying local-time logging. Existing rows are left unchanged.
begin;

alter table public.trich_events
  add column if not exists local_date date,
  add column if not exists local_time time without time zone,
  add column if not exists time_zone text;

alter table public.weed_hits
  add column if not exists time_zone text;

alter table public.alcohol_entries
  add column if not exists time_zone text;

-- These overloads accept the phone's IANA timezone (e.g. Europe/Bucharest).
-- Existing shortcuts that omit p_time_zone keep their existing behavior.
create or replace function public.log_trich_shortcut(
  p_token text,
  p_trich integer,
  p_time_zone text,
  p_request_id uuid default gen_random_uuid(),
  p_preview boolean default false
) returns text
language plpgsql security definer set search_path = ''
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
  select k.user_id into v_user from private.trich_shortcut_keys k
  where k.token_hash = sha256(convert_to(p_token, 'UTF8')) and k.revoked_at is null;
  if v_user is null then
    raise exception 'Invalid shortcut key' using errcode = '28000';
  end if;
  if p_trich is null or p_trich not in (1, 2) or p_request_id is null or p_preview is null then
    raise exception 'Expected T1 or T2 and a request ID' using errcode = '22023';
  end if;
  if p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Expected a valid IANA timezone' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_now := clock_timestamp();
  v_local := v_now at time zone p_time_zone;
  v_current_day := (v_local - interval '3 hours')::date;
  v_day := v_current_day;
  if not p_preview then
    insert into public.trich_events(id, user_id, trich, occurred_on, submitted_at, local_date, local_time, time_zone)
    values(p_request_id, v_user, p_trich, v_day, v_now, v_local::date, date_trunc('second', v_local)::time, p_time_zone)
    on conflict(id) do nothing;
    select e.occurred_on into v_day from public.trich_events e
    where e.id = p_request_id and e.user_id = v_user and e.trich = p_trich;
    if not found then
      raise exception 'Request ID already used' using errcode = '22023';
    end if;
  end if;
  select count(*) into v_count from public.trich_events e
  where e.user_id = v_user and e.trich = p_trich and e.occurred_on = v_day;
  return format('T%s: %s pulls%s', p_trich, v_count,
    case when v_day = v_current_day then ' today' else ' on ' || v_day::text end);
end;
$$;
revoke all on function public.log_trich_shortcut(text, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.log_trich_shortcut(text, integer, text, uuid, boolean) to anon;

create or replace function public.log_weed_shortcut(
  p_token text,
  p_time_zone text,
  p_request_id uuid default gen_random_uuid(),
  p_preview boolean default false
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_now timestamptz;
  v_local timestamp;
  v_day date;
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
  if p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'Expected a valid IANA timezone' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('weed:' || v_user::text, 0));
  v_now := clock_timestamp();
  v_local := v_now at time zone p_time_zone;
  v_day := (v_local - interval '4 hours')::date;
  if not p_preview then
    insert into public.weed_hits(id, user_id, created_at, occurred_on, occurred_at, time_zone)
    values(p_request_id, v_user, v_now, v_local::date, date_trunc('second', v_local)::time, p_time_zone)
    on conflict(id) do nothing;
    select (h.occurred_on - case when h.occurred_at < time '04:00' then 1 else 0 end)
    into v_day from public.weed_hits h where h.id = p_request_id and h.user_id = v_user;
    if not found then
      raise exception 'Request ID already used' using errcode = '22023';
    end if;
  end if;
  select count(*) into v_count from public.weed_hits h
  where h.user_id = v_user and (
    (h.occurred_on = v_day and h.occurred_at >= time '04:00') or
    (h.occurred_on = v_day + 1 and h.occurred_at < time '04:00')
  );
  return format('W: %s hits on %s', v_count, v_day);
end;
$$;
revoke all on function public.log_weed_shortcut(text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.log_weed_shortcut(text, text, uuid, boolean) to anon;

commit;
