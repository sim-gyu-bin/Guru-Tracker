-- Stanley 전용 캐시. 현재/직전만 보존하며 원문 객체는 별도 승인 없이 삭제하지 않는다.
create table public.stanley_state (
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
insert into public.stanley_state(id) values (true);

-- 이벤트는 변경 transaction 안에서만 생성한다. Push/outbox는 이번 범위에 포함하지 않는다.
-- 운영 보존 기준: 30일 이후 정리 대상. 실제 삭제 작업은 별도 사용자 승인 후 수행한다.
create table public.stanley_events (
  event_key text primary key,
  dataset_version bigint not null unique,
  accession text not null,
  document_hash text not null unique,
  normalized_hash text not null,
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '30 days')
);
alter table public.stanley_state enable row level security;
alter table public.stanley_events enable row level security;
revoke all on public.stanley_state, public.stanley_events from public, anon, authenticated, service_role;
grant select on public.stanley_state to service_role;

-- 행 잠금과 펜싱 토큰으로 만료 실행을 차단한다. lease는 null, 60초 재시도 제한은 cooldown을 반환한다.
create function public.stanley_acquire() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.stanley_state;
begin
  select * into strict s from public.stanley_state where id for update;
  if s.lease_until > clock_timestamp() then return null; end if;
  if s.last_attempt_at > clock_timestamp() - interval '60 seconds' then return 'cooldown'; end if;
  update public.stanley_state set fence = fence + 1,
    lease_until = clock_timestamp() + interval '90 seconds',
    last_attempt_at = clock_timestamp(), last_error = null where id
    returning * into s;
  return s.fence::text;
end $$;

-- 완료·실패도 현재 lease 소유자만 기록한다. 공급자 응답은 허용 코드로 축약한다.
create function public.stanley_fail(p_fence text, p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.stanley_state set lease_until = null,
    last_error = case when p_error in ('SEC_ACCESS','SEC_VALIDATION','STORAGE_ERROR','DATABASE_ERROR') then p_error else 'SYNC_FAILED' end
    where id and fence = p_fence::bigint and lease_until > clock_timestamp();
  return found;
end $$;

-- Storage 업로드 후 호출한다. 같은 문서와 같은 정규화 데이터를 구분하되 실제 변경만 회전한다.
create function public.stanley_commit(p_fence text, p_snapshot jsonb, p_document_hash text, p_normalized_hash text, p_raw_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.stanley_state; next_version bigint;
begin
  select * into strict s from public.stanley_state where id for update;
  if p_fence is null or s.fence <> p_fence::bigint or s.lease_until is null or s.lease_until <= clock_timestamp() then return 'busy'; end if;
  if p_snapshot is null or p_document_hash is null or p_normalized_hash is null or p_raw_prefix is null
    or jsonb_typeof(p_snapshot) <> 'object'
    or p_snapshot->>'cik' is distinct from '0001536411'
    or p_snapshot->>'managerName' is distinct from 'Duquesne Family Office LLC'
    or jsonb_typeof(p_snapshot->'holdings') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'holdings') = 0
    or p_document_hash !~ '^[0-9a-f]{64}$' or p_normalized_hash !~ '^[0-9a-f]{64}$'
    or p_raw_prefix is distinct from ('stanley/' || p_document_hash)
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
    update public.stanley_state set current_snapshot = p_snapshot || jsonb_build_object('version', s.dataset_version),
      document_hash = p_document_hash, raw_prefix = p_raw_prefix,
      last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
    return 'unchanged';
  end if;
  next_version := s.dataset_version + 1;
  update public.stanley_state set previous_snapshot = current_snapshot, previous_raw_prefix = raw_prefix,
    current_snapshot = p_snapshot || jsonb_build_object('version', next_version), dataset_version = next_version,
    document_hash = p_document_hash, normalized_hash = p_normalized_hash, raw_prefix = p_raw_prefix,
    last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
  insert into public.stanley_events(event_key, dataset_version, accession, document_hash, normalized_hash)
    values ('stanley:' || next_version::text || ':' || p_document_hash, next_version, p_snapshot->>'accession', p_document_hash, p_normalized_hash);
  return 'updated';
end $$;

revoke all on function public.stanley_acquire() from public, anon, authenticated;
revoke all on function public.stanley_fail(text,text) from public, anon, authenticated;
revoke all on function public.stanley_commit(text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.stanley_acquire() to service_role;
grant execute on function public.stanley_fail(text,text) to service_role;
grant execute on function public.stanley_commit(text,jsonb,text,text,text) to service_role;

-- 비공개 원문 버킷. 공개 읽기 정책을 만들지 않으며 service_role의 서버 요청만 사용한다.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('sec-originals', 'sec-originals', false, 20000000, array['application/json','application/xml'])
on conflict (id) do nothing;

-- 기존 공개 버킷을 조용히 재사용하지 않는다. 기존 정책이 넓어도 이 버킷은 비서버 접근을 차단한다.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'sec-originals' and public) then
    raise exception 'sec-originals must be private';
  end if;
end $$;
create policy stanley_originals_private on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'sec-originals') with check (bucket_id <> 'sec-originals');
