-- Nancy Pelosi 화면 전용 PTR 캐시. 최신 제출 문서 1건만 현재 스냅샷으로 두고 직전 1건만 보존한다.
-- 금액은 공식 PTR의 거래금액 범위 문자열이며 정확한 금액·보유량이 아니다. 보유 목록은 만들지 않는다.
create table public.house_ptr_state (
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
  last_error text check (last_error is null or last_error in ('HOUSE_ACCESS','HOUSE_VALIDATION','STORAGE_ERROR','DATABASE_ERROR','SYNC_FAILED')),
  lease_until timestamptz,
  fence bigint not null default 0
);
insert into public.house_ptr_state(id) values (true);

-- 이벤트는 변경 transaction 안에서만 생성한다. Push/outbox는 이번 범위에 포함하지 않는다.
-- 운영 보존 기준: 30일 이후 정리 대상. 실제 삭제 작업은 별도 사용자 승인 후 수행한다.
create table public.house_ptr_events (
  event_key text primary key,
  dataset_version bigint not null unique,
  document_id text not null,
  document_hash text not null unique,
  normalized_hash text not null,
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '30 days')
);
alter table public.house_ptr_state enable row level security;
alter table public.house_ptr_events enable row level security;
revoke all on public.house_ptr_state, public.house_ptr_events from public, anon, authenticated, service_role;
grant select on public.house_ptr_state to service_role;

-- 행 잠금과 펜싱 토큰으로 만료 실행을 차단한다. lease는 null, 60초 재시도 제한은 cooldown을 반환한다.
create function public.house_ptr_acquire() returns text
language plpgsql security definer set search_path = '' as $$
declare s public.house_ptr_state;
begin
  select * into strict s from public.house_ptr_state where id for update;
  if s.lease_until > clock_timestamp() then return null; end if;
  if s.last_attempt_at > clock_timestamp() - interval '60 seconds' then return 'cooldown'; end if;
  update public.house_ptr_state set fence = fence + 1,
    lease_until = clock_timestamp() + interval '90 seconds',
    last_attempt_at = clock_timestamp(), last_error = null where id
    returning * into s;
  return s.fence::text;
end $$;

-- 완료·실패도 현재 lease 소유자만 기록한다. 공급자 응답은 허용 코드로 축약한다.
create function public.house_ptr_fail(p_fence text, p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.house_ptr_state set lease_until = null,
    last_error = case when p_error in ('HOUSE_ACCESS','HOUSE_VALIDATION','STORAGE_ERROR','DATABASE_ERROR') then p_error else 'SYNC_FAILED' end
    where id and fence = p_fence::bigint and lease_until > clock_timestamp();
  return found;
end $$;

-- Storage 업로드 후 호출한다. 표시 값은 전부 원문에서 대조한 형태만 허용하며 그 밖의 값은 커밋을 거부한다.
-- 같은 문서와 같은 정규화 데이터를 구분하되 실제 변경만 회전한다.
create function public.house_ptr_commit(p_fence text, p_snapshot jsonb, p_document_hash text, p_normalized_hash text, p_raw_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.house_ptr_state; next_version bigint;
begin
  select * into strict s from public.house_ptr_state where id for update;
  if p_fence is null or s.fence <> p_fence::bigint or s.lease_until is null or s.lease_until <= clock_timestamp() then return 'busy'; end if;
  if p_snapshot is null or p_document_hash is null or p_normalized_hash is null or p_raw_prefix is null
    or jsonb_typeof(p_snapshot) <> 'object'
    or p_document_hash !~ '^[0-9a-f]{64}$' or p_normalized_hash !~ '^[0-9a-f]{64}$'
    or p_raw_prefix is distinct from ('house/' || p_document_hash)
    or coalesce(p_snapshot->>'documentId', '') !~ '^[0-9]{8}$'
    or p_snapshot->>'filerName' is distinct from 'Hon. Nancy Pelosi'
    or coalesce(p_snapshot->>'filerStatus', '') = ''
    or coalesce(p_snapshot->>'stateDistrict', '') !~ '^[A-Z]{2}[0-9]{2}$'
    or coalesce(p_snapshot->>'filingDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (coalesce(p_snapshot->>'signedAt', '') <> '' and coalesce(p_snapshot->>'signedAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or coalesce(p_snapshot->>'sourceUrl', '') !~ '^https://disclosures-clerk\.house\.gov/public_disc/ptr-pdfs/[0-9]{4}/[0-9]{8}\.pdf$'
    or coalesce(p_snapshot->>'indexUrl', '') !~ '^https://disclosures-clerk\.house\.gov/public_disc/financial-pdfs/[0-9]{4}FD\.zip$'
    or jsonb_typeof(p_snapshot->'transactions') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'transactions') = 0
    or jsonb_array_length(p_snapshot->'transactions') > 500
    or exists (
      select 1 from jsonb_array_elements(p_snapshot->'transactions') as t
      where jsonb_typeof(t) <> 'object'
        or coalesce(t->>'asset', '') = '' or length(t->>'asset') > 300
        or coalesce(t->>'assetTypeCode', '') !~ '^[A-Z0-9]{2}$'
        or coalesce(t->>'transactionType', '') not in ('P','S','S (partial)','E')
        or coalesce(t->>'transactionDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or (coalesce(t->>'notificationDate', '') <> '' and coalesce(t->>'notificationDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        or coalesce(t->>'amountRange', '') !~ '^(Over )?\$[0-9][0-9,]*(\.[0-9]{2})?( - (Over )?\$[0-9][0-9,]*(\.[0-9]{2})?)?$'
        or coalesce(t->>'ownerCode', '') !~ '^(SP|DC|JT)?$'
        or jsonb_typeof(t->'details') is distinct from 'array'
    )
  then raise exception 'Invalid verified snapshot'; end if;
  -- PTR은 제출일과 문서번호 순서로만 최신을 판정한다. 문서번호는 8자리 연번이라 문자열 비교가 시간 순서와 같다.
  if s.current_snapshot is not null and
    (p_snapshot->>'filingDate', p_snapshot->>'documentId') < (s.current_snapshot->>'filingDate', s.current_snapshot->>'documentId')
  then raise exception 'Stale filing'; end if;
  if s.document_hash = p_document_hash and s.normalized_hash is distinct from p_normalized_hash then
    raise exception 'Same document normalized differently';
  end if;
  if s.document_hash = p_document_hash or s.normalized_hash = p_normalized_hash then
    -- 정규화가 같으면 version/직전/event는 보존하고 검증된 최신 출처 메타데이터만 갱신한다.
    update public.house_ptr_state set current_snapshot = p_snapshot || jsonb_build_object('version', s.dataset_version),
      document_hash = p_document_hash, raw_prefix = p_raw_prefix,
      last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
    return 'unchanged';
  end if;
  next_version := s.dataset_version + 1;
  update public.house_ptr_state set previous_snapshot = current_snapshot, previous_raw_prefix = raw_prefix,
    current_snapshot = p_snapshot || jsonb_build_object('version', next_version), dataset_version = next_version,
    document_hash = p_document_hash, normalized_hash = p_normalized_hash, raw_prefix = p_raw_prefix,
    last_success_at = clock_timestamp(), last_error = null, lease_until = null where id;
  insert into public.house_ptr_events(event_key, dataset_version, document_id, document_hash, normalized_hash)
    values ('house:' || next_version::text || ':' || p_document_hash, next_version, p_snapshot->>'documentId', p_document_hash, p_normalized_hash);
  return 'updated';
end $$;

revoke all on function public.house_ptr_acquire() from public, anon, authenticated;
revoke all on function public.house_ptr_fail(text,text) from public, anon, authenticated;
revoke all on function public.house_ptr_commit(text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.house_ptr_acquire() to service_role;
grant execute on function public.house_ptr_fail(text,text) to service_role;
grant execute on function public.house_ptr_commit(text,jsonb,text,text,text) to service_role;

-- 비공개 원문 버킷. 공개 읽기 정책을 만들지 않으며 service_role의 서버 요청만 사용한다.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('house-originals', 'house-originals', false, 20000000, array['application/pdf','application/xml'])
on conflict (id) do nothing;

-- 기존 공개 버킷을 조용히 재사용하지 않는다. 기존 정책이 넓어도 이 버킷은 비서버 접근을 차단한다.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'house-originals' and public) then
    raise exception 'house-originals must be private';
  end if;
end $$;
create policy house_originals_private on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'house-originals') with check (bucket_id <> 'house-originals');
