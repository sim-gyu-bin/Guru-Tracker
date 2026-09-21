-- Michael Burry(Scion Asset Management, LLC) 전용 캐시. 현재/직전만 보존하며 원문 객체는 별도 승인 없이 삭제하지 않는다.
-- Stanley와 RPC·테이블 이름만 다르고 펜싱 토큰·lease·검증·원자 회전 규칙은 같은 계약을 따른다.
-- 기존 stanley_state/stanley_events는 이 마이그레이션에서 변환·삭제하지 않는다.
create table public.burry_state (
  id boolean primary key default true check (id),
  dataset_version bigint not null default 0 check (dataset_version between 0 and 9007199254740991),
  current_snapshot jsonb,
  previous_snapshot jsonb,
  document_hash text,
  normalized_hash text,
  raw_prefix text,
  last_attempt_at timestamptz,
  previous_raw_prefix text,
  last_success_at timestamptz,
  last_error text check (last_error is null or last_error in ('SEC_ACCESS','SEC_VALIDATION','STORAGE_ERROR','DATABASE_ERROR','SYNC_FAILED')),
  lease_until timestamptz,
  fence bigint not null default 0
);
insert into public.burry_state(id) values (true);

-- 이벤트는 변경 transaction 안에서만 생성한다. Push/outbox는 이번 범위에 포함하지 않는다.
-- 운영 보존 기준: 30일 이후 정리 대상. 실제 삭제 작업은 별도 사용자 승인 후 수행한다.
create table public.burry_events (
  event_key text primary key,
  dataset_version bigint not null unique,
  accession text not null,
  document_hash text not null unique,
  normalized_hash text not null,
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '30 days')
);
alter table public.burry_state enable row level security;
alter table public.burry_events enable row level security;
revoke all on public.burry_state, public.burry_events from public, anon, authenticated, service_role;
grant select on public.burry_state to service_role;

-- 행 잠금과 펜싱 토큰으로 만료 실행을 차단한다. lease는 null, 60초 재시도 제한은 cooldown을 반환한다.
-- Stanley와 lease를 공유하지 않으므로 두 대상의 동기화는 서로를 막지 않는다. 같은 대상의 중복 실행만 차단한다.
create function public.burry_acquire() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.burry_state;
begin
  select * into strict s from public.burry_state where id for update;
  if s.lease_until > clock_timestamp() then return null; end if;
  if s.last_attempt_at > clock_timestamp() - interval '60 seconds' then return 'cooldown'; end if;
  update public.burry_state set fence = fence + 1,
    lease_until = clock_timestamp() + interval '90 seconds',
    last_attempt_at = clock_timestamp(), last_error = null where id
    returning * into s;
  return s.fence::text;
end $$;

-- 완료·실패도 현재 lease 소유자만 기록한다. 공급자 응답은 허용 코드로 축약한다.
create function public.burry_fail(p_fence text, p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.burry_state set lease_until = null,
    last_error = case when p_error in ('SEC_ACCESS','SEC_VALIDATION','STORAGE_ERROR','DATABASE_ERROR') then p_error else 'SYNC_FAILED' end
    where id and fence = p_fence::bigint and lease_until > clock_timestamp();
  return found;
end $$;

-- Storage 업로드 후 호출한다. 같은 문서와 같은 정규화 데이터를 구분하되 실제 변경만 회전한다.
-- CIK·제출자 이름·원문 접두사를 Burry 값으로 고정해 다른 관리자의 스냅샷 커밋을 거부한다.
create function public.burry_commit(p_fence text, p_snapshot jsonb, p_document_hash text, p_normalized_hash text, p_raw_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.burry_state; next_version bigint;
begin
  select * into strict s from public.burry_state where id for update;
  if p_fence is null or s.fence <> p_fence::bigint or s.lease_until is null or s.lease_until <= clock_timestamp() then return 'busy'; end if;
  if p_snapshot is null or p_document_hash is null or p_normalized_hash is null or p_raw_prefix is null
    or jsonb_typeof(p_snapshot) <> 'object'
    or p_snapshot->>'cik' is distinct from '0001649339'
    or p_snapshot->>'managerName' is distinct from 'Scion Asset Management, LLC'
    or jsonb_typeof(p_snapshot->'holdings') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'holdings') = 0
    or p_document_hash !~ '^[0-9a-f]{64}$' or p_normalized_hash !~ '^[0-9a-f]{64}$'
    or p_raw_prefix is distinct from ('burry/' || p_document_hash)
    or coalesce(p_snapshot->>'accession', '') !~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'
    or coalesce(p_snapshot->>'reportDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_snapshot->>'filingDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Invalid verified snapshot'; end if;
  if s.current_snapshot is not null and (
    p_snapshot->>'reportDate' < s.current_snapshot->>'reportDate'
    or (p_snapshot->>'reportDate' = s.current_snapshot->>'reportDate' and
      (p_snapshot->>'filingDate', p_snapshot->>'accession') < (s.current_snapshot->>'filingDate', s.current_snapshot->>'accession'))
  ) then raise exception 'Stale filing'; end if;
  if s.document_hash = p_document_hash and s.normalized_hash is distinct from p_normalized_hash then
    raise exception 'Same document normalized differently';
  end if;
  if s.document_hash = p_document_hash or s.normalized_hash = p_normalized_hash then
    -- 정규화가 같으면 version/직전/event는 보존하고 검증된 최신 출처 메타데이터만 갱신한다.
    update public.burry_state set current_snapshot = p_snapshot || jsonb_build_object('version', s.dataset_version),
      document_hash = p_document_hash, raw_prefix = p_raw_prefix,
      last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
    return 'unchanged';
  end if;
  next_version := s.dataset_version + 1;
  update public.burry_state set previous_snapshot = current_snapshot, previous_raw_prefix = raw_prefix,
    current_snapshot = p_snapshot || jsonb_build_object('version', next_version), dataset_version = next_version,
    document_hash = p_document_hash, normalized_hash = p_normalized_hash, raw_prefix = p_raw_prefix,
    last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
  insert into public.burry_events(event_key, dataset_version, accession, document_hash, normalized_hash)
    values ('burry:' || next_version::text || ':' || p_document_hash, next_version, p_snapshot->>'accession', p_document_hash, p_normalized_hash);
  return 'updated';
end $$;

revoke all on function public.burry_acquire() from public, anon, authenticated;
revoke all on function public.burry_fail(text,text) from public, anon, authenticated;
revoke all on function public.burry_commit(text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.burry_acquire() to service_role;
grant execute on function public.burry_fail(text,text) to service_role;
grant execute on function public.burry_commit(text,jsonb,text,text,text) to service_role;

-- 비공개 원문 버킷 sec-originals는 Stanley와 공유한다. 버킷과 비서버 접근 차단 정책의 소유자는
-- 202609140001_stanley.sql이며 여기서 다시 만들거나 넓히지 않는다. 존재와 비공개 여부만 확인한다.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'sec-originals') then
    raise exception 'sec-originals 버킷이 없습니다. 202609140001_stanley.sql을 먼저 적용하세요.';
  end if;
  if exists (select 1 from storage.buckets where id = 'sec-originals' and public) then
    raise exception 'sec-originals must be private';
  end if;
end $$;
