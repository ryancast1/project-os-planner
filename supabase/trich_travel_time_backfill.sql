-- One-time Trich correction. Replace the UUID with the Trich account's Supabase user ID.
-- Requires the local-time columns from 20261121_local_tracking_time.sql.
with target_account(user_id) as (
  values ('YOUR_SUPABASE_USER_UUID'::uuid)
),
trips(first_day, last_day, zone) as (
  values
    (date '2026-03-22', date '2026-03-27', 'Europe/Bucharest'),
    (date '2026-03-28', date '2026-03-30', 'Europe/Vienna'),
    (date '2026-05-25', date '2026-06-06', 'America/Anchorage'),
    (date '2026-07-07', date '2026-07-10', 'America/Denver'),
    (date '2026-11-13', date '2026-11-15', 'Europe/Berlin'),
    (date '2026-11-16', date '2026-11-20', 'Europe/Bucharest')
),
trip_windows as (
  select *,
    first_day::timestamp at time zone zone as starts_at,
    (last_day + 1)::timestamp at time zone zone as ends_at
  from trips
),
candidates as (
  select e.id, e.user_id, e.submitted_at, e.occurred_on as old_tracking_day,
    e.submitted_at at time zone trip.zone as new_local_time,
    trip.zone
  from public.trich_events e
  join target_account a on a.user_id = e.user_id
  -- When adjacent trips overlap in UTC, the later destination takes precedence.
  cross join lateral (
    select w.*
    from trip_windows w
    where e.submitted_at >= w.starts_at and e.submitted_at < w.ends_at
    order by w.starts_at desc
    limit 1
  ) trip
  where e.submitted_at is not null
    and e.time_zone is null
    and e.local_date is null
    and e.local_time is null
    and e.trich in (1, 2)
),
updated as (
  update public.trich_events e
  set occurred_on = (c.new_local_time - interval '3 hours')::date,
      local_date = c.new_local_time::date,
      local_time = c.new_local_time::time,
      time_zone = c.zone
  from candidates c
  where e.id = c.id
    and e.user_id = c.user_id
    and e.submitted_at = c.submitted_at
    and e.occurred_on is not distinct from c.old_tracking_day
    and e.time_zone is null
    and e.local_date is null
    and e.local_time is null
  returning e.id, e.trich, e.submitted_at, c.old_tracking_day,
    e.occurred_on as new_tracking_day, e.local_date, e.local_time, e.time_zone
)
select * from updated order by submitted_at, id;
