-- Run after trich_shortcuts.sql. All test keys and pulls are rolled back.
begin;
do $$
declare
  owner_id uuid := '605f4c7b-4d2d-4f7d-b215-1461cf1a5779';
  test_key text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  request_id uuid;
  day_key date := (clock_timestamp() at time zone 'America/Los_Angeles')::date;
  before_count bigint;
  after_count bigint;
  result_text text;
  kind integer;
begin
  insert into private.trich_shortcut_keys(token_hash, user_id)
    values (sha256(convert_to(test_key, 'UTF8')), owner_id);
  for kind in 1..2 loop
    request_id := gen_random_uuid();
    select count(*) into before_count from public.trich_events
      where user_id = owner_id and occurred_on = day_key and trich = kind;
    result_text := public.log_trich_shortcut(test_key, kind, request_id);
    if result_text <> format('T%s: %s pulls today', kind, before_count + 1) then
      raise exception 'Incorrect count: %', result_text;
    end if;
    if not exists (select 1 from public.trich_events
      where id = request_id and user_id = owner_id and trich = kind
        and occurred_on = day_key and submitted_at >= transaction_timestamp()) then
      raise exception 'Incorrect saved timestamp, day, owner, or type';
    end if;
    perform public.log_trich_shortcut(test_key, kind, request_id);
    perform public.log_trich_shortcut(test_key, kind, gen_random_uuid(), true);
    select count(*) into after_count from public.trich_events
      where user_id = owner_id and occurred_on = day_key and trich = kind;
    if after_count <> before_count + 1 then
      raise exception 'Retry or preview created an extra row';
    end if;
  end loop;
  begin
    perform public.log_trich_shortcut(repeat('0', 64), 1);
    raise exception 'Invalid key was accepted';
  exception when invalid_authorization_specification then null;
  end;
  begin
    perform public.log_trich_shortcut(test_key, 3);
    raise exception 'Invalid type was accepted';
  exception when invalid_parameter_value then null;
  end;
  if has_table_privilege('anon', 'private.trich_shortcut_keys', 'SELECT')
     or has_table_privilege('authenticated', 'private.trich_shortcut_keys', 'SELECT') then
    raise exception 'Key table is exposed';
  end if;
end;
$$;
rollback;
select 'Passed: T1/T2 counts, timestamps, retry, preview, invalid input, key privacy. Test pulls rolled back.' as verification;
