-- 관리자 운영 조회 전용. 스냅샷 본문·Cron command·Vault·사용자 정보는 투영하지 않는다.
-- STABLE SQL 함수는 읽기만 수행한다. 누락된 state도 예상 단위의 LEFT JOIN으로 유지한다.
create function public.admin_sync_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with expected(key, jobname, ordinal) as (
    values
      ('stanley', 'guru_tracker_stanley_hourly', 1),
      ('burry', 'guru_tracker_burry_hourly', 2),
      ('laffont', 'guru_tracker_laffont_hourly', 3),
      ('gerstner', 'guru_tracker_gerstner_hourly', 4),
      ('tepper', 'guru_tracker_tepper_hourly', 5),
      ('aschenbrenner', 'guru_tracker_aschenbrenner_hourly', 6),
      ('house', 'guru_tracker_house_hourly', 7),
      ('ark:ARKK', 'guru_tracker_ark_hourly', 8),
      ('ark:ARKQ', 'guru_tracker_ark_hourly', 9),
      ('ark:ARKW', 'guru_tracker_ark_hourly', 10),
      ('ark:ARKG', 'guru_tracker_ark_hourly', 11),
      ('ark:ARKF', 'guru_tracker_ark_hourly', 12),
      ('ark:ARKX', 'guru_tracker_ark_hourly', 13)
  ), states as (
    select 'stanley'::text as key, s.dataset_version, s.current_snapshot is not null as has_snapshot,
      s.last_error is not null as has_error, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.stanley_state as s where s.id
    union all
    select 'burry', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.burry_state as s where s.id
    union all
    select 'laffont', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.laffont_state as s where s.id
    union all
    select 'gerstner', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.gerstner_state as s where s.id
    union all
    select 'tepper', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.tepper_state as s where s.id
    union all
    select 'aschenbrenner', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.aschenbrenner_state as s where s.id
    union all
    select 'house', s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.house_ptr_state as s where s.id
    union all
    select 'ark:' || s.fund, s.dataset_version, s.current_snapshot is not null,
      s.last_error is not null, s.last_attempt_at, s.last_success_at, s.lease_until
    from public.ark_state as s
  ), schedules as (
    -- 중복 이름은 임의의 활성 작업을 선택하지 않는다. count로 별도 표시한다.
    select j.jobname, pg_catalog.count(*) as schedule_count,
      case when pg_catalog.count(*) = 1 then pg_catalog.min(j.schedule) else null end as schedule,
      case when pg_catalog.count(*) = 1 then pg_catalog.bool_and(j.active) else null end as active
    from cron.job as j
    where j.jobname in (select e.jobname from expected as e)
    group by j.jobname
  )
  select pg_catalog.jsonb_build_object(
    'checked_at', pg_catalog.now(),
    'rows', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', e.key,
      'schedule_count', coalesce(c.schedule_count, 0),
      'schedule', c.schedule,
      'active', c.active,
      'has_snapshot', coalesce(s.has_snapshot, false),
      'has_error', coalesce(s.has_error, false),
      'last_attempt_at', s.last_attempt_at,
      'last_success_at', s.last_success_at,
      'lease_until', s.lease_until,
      -- 누락 state는 초기 버전 0과 빈 캐시로 표현한다. bigint를 JSON 숫자로 보내지 않는다.
      'dataset_version', coalesce(s.dataset_version::text, '0')
    ) order by e.ordinal)
  )
  from expected as e
  left join states as s on s.key = e.key
  left join schedules as c on c.jobname = e.jobname;
$$;

-- SECURITY DEFINER의 실행 경계를 service_role로 제한한다. 관리자 인증은 서버 호출 전에 완료한다.
revoke all on function public.admin_sync_health() from public, anon, authenticated;
grant execute on function public.admin_sync_health() to service_role;
