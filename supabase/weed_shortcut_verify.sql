-- All test keys and hits are rolled back, including cutoff fixtures.
begin;
do $$
declare
  owner_id uuid := '605f4c7b-4d2d-4f7d-b215-1461cf1a5779';
  test_key text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  request_id uuid := gen_random_uuid();
  day_key date := ((clock_timestamp() at time zone 'America/New_York') - interval '4 hours')::date;
  before_count bigint;
  after_count bigint;
  result_text text;
  saved public.weed_hits%rowtype;
begin
  insert into private.weed_shortcut_keys(token_hash,user_id)
  values(sha256(convert_to(test_key,'UTF8')),owner_id);
  select count(*) into before_count from public.weed_hits
  where user_id=owner_id and
    occurred_on - case when occurred_at < time '04:00' then 1 else 0 end = day_key;

  -- Only the middle two fixtures belong to the current tracking day.
  insert into public.weed_hits(user_id,occurred_on,occurred_at) values
    (owner_id,day_key,time '03:59:59'),
    (owner_id,day_key,time '04:00:00'),
    (owner_id,day_key+1,time '03:59:59'),
    (owner_id,day_key+1,time '04:00:00');
  result_text := public.log_weed_shortcut(test_key,gen_random_uuid(),true);
  if result_text <> format('W: %s hits today',before_count+2) then
    raise exception '4am boundary count mismatch: %',result_text;
  end if;

  result_text := public.log_weed_shortcut(test_key,request_id);
  select * into saved from public.weed_hits where id=request_id;
  if saved.user_id is distinct from owner_id
    or saved.created_at < transaction_timestamp()
    or saved.occurred_on is distinct from (saved.created_at at time zone 'America/New_York')::date
    or saved.occurred_at is distinct from (saved.created_at at time zone 'America/New_York')::time(0) then
    raise exception 'Saved owner/date/time mismatch';
  end if;
  select count(*) into after_count from public.weed_hits
  where user_id=owner_id and
    occurred_on - case when occurred_at < time '04:00' then 1 else 0 end = day_key;
  if result_text <> format('W: %s hits today',after_count) then
    raise exception 'Returned count does not match app rule';
  end if;
  perform public.log_weed_shortcut(test_key,request_id);
  if (select count(*) from public.weed_hits where id=request_id) <> 1 then
    raise exception 'Retry inserted a duplicate';
  end if;

  begin
    perform public.log_weed_shortcut(repeat('0',64));
    raise exception 'Invalid key accepted';
  exception when invalid_authorization_specification then null;
  end;
  update private.weed_shortcut_keys set revoked_at=now()
    where token_hash=sha256(convert_to(test_key,'UTF8'));
  begin
    perform public.log_weed_shortcut(test_key);
    raise exception 'Revoked key accepted';
  exception when invalid_authorization_specification then null;
  end;
  if has_table_privilege('anon','private.weed_shortcut_keys','SELECT')
    or has_table_privilege('authenticated','private.weed_shortcut_keys','SELECT') then
    raise exception 'Key table exposed';
  end if;

  -- New York cutoff stays at 04:00 across spring and fall DST changes.
  if ((timestamptz '2026-03-08 07:59:59+00' at time zone 'America/New_York') - interval '4 hours')::date <> date '2026-03-07'
    or ((timestamptz '2026-03-08 08:00:00+00' at time zone 'America/New_York') - interval '4 hours')::date <> date '2026-03-08'
    or ((timestamptz '2026-11-01 08:59:59+00' at time zone 'America/New_York') - interval '4 hours')::date <> date '2026-10-31'
    or ((timestamptz '2026-11-01 09:00:00+00' at time zone 'America/New_York') - interval '4 hours')::date <> date '2026-11-01' then
    raise exception 'DST boundary mismatch';
  end if;
end;
$$;
rollback;
select 'Passed: W count, timestamp, 4am boundary, DST, retry, preview, invalid/revoked keys. Test hits rolled back.' as verification;
