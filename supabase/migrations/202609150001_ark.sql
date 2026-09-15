-- ARK 6개 펀드 전용 캐시. 현재/직전만 보존하며 원문 객체는 별도 승인 없이 삭제하지 않는다.
-- 펀드마다 독립 행으로 관리하므로 한 펀드의 실패가 다른 펀드의 스냅샷을 막지 않는다.
create table public.ark_state (
  fund text primary key check (fund in ('ARKK','ARKQ','ARKW','ARKG','ARKF','ARKX')),
  dataset_version bigint not null default 0 check (dataset_version between 0 and 9007199254740991),
  current_snapshot jsonb,
  previous_snapshot jsonb,
  document_hash text,
  normalized_hash text,
  raw_prefix text,
  previous_raw_prefix text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (last_error is null or last_error in ('ARK_ACCESS','ARK_VALIDATION','STORAGE_ERROR','DATABASE_ERROR','SYNC_FAILED')),
  lease_until timestamptz,
  fence bigint not null default 0
);
insert into public.ark_state(fund)
values ('ARKK'), ('ARKQ'), ('ARKW'), ('ARKG'), ('ARKF'), ('ARKX');

-- 이벤트는 실제 보유 변경 transaction 안에서만 생성한다. ARK 파일에 매매 내역이 없으므로
-- 매매 추론이 아니라 공개 보유 데이터(수량·평가액·비중 변화 포함)의 변경을 기록한다.
-- 운영 보존 기준: 30일 이후 정리 대상. 실제 삭제 작업은 별도 사용자 승인 후 수행한다.
create table public.ark_events (
  event_key text primary key,
  fund text not null check (fund in ('ARKK','ARKQ','ARKW','ARKG','ARKF','ARKX')),
  dataset_version bigint not null check (dataset_version between 1 and 9007199254740991),
  document_hash text not null,
  normalized_hash text not null,
  report_date text not null check (report_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '30 days'),
  unique (fund, dataset_version),
  unique (fund, document_hash)
);
alter table public.ark_state enable row level security;
alter table public.ark_events enable row level security;
revoke all on public.ark_state, public.ark_events from public, anon, authenticated, service_role;
grant select on public.ark_state to service_role;

-- 펀드 행 잠금과 펜싱 토큰으로 만료 실행을 차단한다. lease는 null, 60초 재시도 제한은 cooldown을 반환한다.
create function public.ark_acquire(p_fund text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ark_state;
begin
  if p_fund is null or p_fund not in ('ARKK','ARKQ','ARKW','ARKG','ARKF','ARKX') then
    raise exception 'Unknown fund';
  end if;
  select * into strict s from public.ark_state where fund = p_fund for update;
  if s.lease_until > clock_timestamp() then return null; end if;
  if s.last_attempt_at > clock_timestamp() - interval '60 seconds' then return 'cooldown'; end if;
  update public.ark_state set fence = fence + 1,
    lease_until = clock_timestamp() + interval '90 seconds',
    last_attempt_at = clock_timestamp(), last_error = null where fund = p_fund
    returning * into s;
  return s.fence::text;
end $$;

-- 완료·실패도 현재 lease 소유자만 기록한다. 공급자 응답은 허용 코드로 축약한다.
create function public.ark_fail(p_fund text, p_fence text, p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_fence is null or p_fence !~ '^[0-9]+$' then return false; end if;
  update public.ark_state set lease_until = null,
    last_error = case when p_error in ('ARK_ACCESS','ARK_VALIDATION','STORAGE_ERROR','DATABASE_ERROR') then p_error else 'SYNC_FAILED' end
    where fund = p_fund and fence = p_fence::bigint and lease_until > clock_timestamp();
  return found;
end $$;

-- Storage 업로드 후 호출한다. 공식 ARK 원문만 받고, 같은 원문과 같은 정규화 데이터를 구분하되 실제 변경만 회전한다.
-- 검증 실패·오래된 기준일은 예외로 거부해 호출 측이 기존 스냅샷을 유지하도록 한다.
create function public.ark_commit(p_fund text, p_fence text, p_snapshot jsonb, p_document_hash text, p_normalized_hash text, p_raw_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.ark_state; next_version bigint; v_report date;
begin
  if p_fund is null or p_fund not in ('ARKK','ARKQ','ARKW','ARKG','ARKF','ARKX') then
    raise exception 'Unknown fund';
  end if;
  select * into strict s from public.ark_state where fund = p_fund for update;
  if p_fence is null or p_fence !~ '^[0-9]+$' or s.fence <> p_fence::bigint
    or s.lease_until is null or s.lease_until <= clock_timestamp() then return 'busy'; end if;
  -- 기준일은 하루짜리 파일이므로 문자열 형식만으로는 부족하다. 펀드·공식 URL·보유 필드 형태를 함께 확인한다.
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object'
    or p_document_hash is null or p_normalized_hash is null or p_raw_prefix is null
    or p_snapshot->>'fund' is distinct from p_fund
    or coalesce(p_snapshot->>'reportDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or rtrim(coalesce(p_snapshot->>'sourceUrl', ''), '/') is distinct from ('https://www.ark-funds.com/funds/' || lower(p_fund))
    -- 실제 공식 파일명에는 앰퍼샌드·마침표·밑줄이 섞인다(예: ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv).
    -- 경로 구분자·쿼리·프래그먼트·공백만 막고 펀드별 파일명 접미사는 고정한다.
    or coalesce(p_snapshot->>'holdingsUrl', '') !~ ('^https://assets\.ark-funds\.com/fund-documents/funds-etf-csv/[^/?#[:space:]]*_' || p_fund || '_HOLDINGS\.csv$')
    or jsonb_typeof(p_snapshot->'holdings') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'holdings') = 0
    or p_document_hash !~ '^[0-9a-f]{64}$'
    or p_normalized_hash !~ '^[0-9a-f]{64}$'
    or p_raw_prefix is distinct from ('ark/' || p_fund || '/' || p_document_hash)
  then raise exception 'Invalid verified snapshot'; end if;
  begin
    v_report := (p_snapshot->>'reportDate')::date;
  exception when others then
    raise exception 'Invalid verified snapshot';
  end;
  -- ARK 기준일은 미국 시장 날짜다. ET 기준 오늘보다 미래인 값은 공식 파일로 보지 않는다.
  if v_report > (clock_timestamp() at time zone 'America/New_York')::date then
    raise exception 'Invalid verified snapshot';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_snapshot->'holdings') as h
    where jsonb_typeof(h) <> 'object'
      -- 모든 필수 필드는 JSON 문자열이어야 한다. ->> 비교만으로는 JSON 숫자가 통과한다.
      or jsonb_typeof(h->'id') is distinct from 'string'
      or jsonb_typeof(h->'company') is distinct from 'string'
      or jsonb_typeof(h->'identifier') is distinct from 'string'
      or jsonb_typeof(h->'shares') is distinct from 'string'
      or jsonb_typeof(h->'valueUsd') is distinct from 'string'
      or jsonb_typeof(h->'weightPercent') is distinct from 'string'
      or coalesce(h->>'id', '') = ''
      or coalesce(h->>'company', '') = ''
      -- 티커는 null을 허용하되 키와 타입은 고정한다. 식별자는 비표준 값을 보정하지 않는다.
      or not (h ? 'ticker') or jsonb_typeof(h->'ticker') not in ('string','null')
      or coalesce(h->>'identifier', '') = ''
      -- CSV 정규화 뒤에는 쉼표·통화·퍼센트 장식이 없다. 수량·비중은 부호와 십진 정밀도를 보존하고
      -- 음수 수량도 원문 그대로 두며, 금액은 센트 2자리로 고정된다.
      or coalesce(h->>'shares', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
      or coalesce(h->>'weightPercent', '') !~ '^-?[0-9]+(\.[0-9]+)?$'
      or coalesce(h->>'valueUsd', '') !~ '^-?[0-9]+\.[0-9]{2}$'
  ) then raise exception 'Invalid verified snapshot'; end if;
  if s.current_snapshot is not null
    and v_report < (s.current_snapshot->>'reportDate')::date then
    raise exception 'Stale snapshot';
  end if;
  if s.document_hash = p_document_hash and s.normalized_hash is distinct from p_normalized_hash then
    raise exception 'Same document normalized differently';
  end if;
  if s.document_hash = p_document_hash or s.normalized_hash = p_normalized_hash then
    -- 정규화가 같으면 version/직전/event는 보존하고 검증된 최신 출처 메타데이터만 갱신한다.
    -- 시간별 재확인은 여기서 last_success_at만 올리므로 주말에도 갱신 시각을 거짓 표시하지 않는다.
    update public.ark_state set current_snapshot = p_snapshot || jsonb_build_object('version', s.dataset_version),
      document_hash = p_document_hash, raw_prefix = p_raw_prefix,
      last_success_at = clock_timestamp(), last_error = null, lease_until = null where fund = p_fund;
    return 'unchanged';
  end if;
  next_version := s.dataset_version + 1;
  update public.ark_state set previous_snapshot = current_snapshot, previous_raw_prefix = raw_prefix,
    current_snapshot = p_snapshot || jsonb_build_object('version', next_version), dataset_version = next_version,
    document_hash = p_document_hash, normalized_hash = p_normalized_hash, raw_prefix = p_raw_prefix,
    last_success_at = clock_timestamp(), last_error = null, lease_until = null where fund = p_fund;
  -- 같은 문서·다른 버전이 이미 기록된 원문이 다시 나타나면 문서 중복 키 충돌로 회전 전체가 롤백된다.
  -- 기존 이벤트와 버전을 덮어쓰지 않고, 기존 캐시·이력은 그대로 보존한다.
  insert into public.ark_events(event_key, fund, dataset_version, document_hash, normalized_hash, report_date)
    values ('ark:' || p_fund || ':' || next_version::text || ':' || p_document_hash,
      p_fund, next_version, p_document_hash, p_normalized_hash, p_snapshot->>'reportDate');
  return 'updated';
end $$;

revoke all on function public.ark_acquire(text) from public, anon, authenticated;
revoke all on function public.ark_fail(text,text,text) from public, anon, authenticated;
revoke all on function public.ark_commit(text,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.ark_acquire(text) to service_role;
grant execute on function public.ark_fail(text,text,text) to service_role;
grant execute on function public.ark_commit(text,text,jsonb,text,text,text) to service_role;

-- 비공개 원문 버킷. 공개 읽기 정책을 만들지 않으며 service_role의 서버 요청만 사용한다.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ark-originals', 'ark-originals', false, 20000000, array['text/csv'])
on conflict (id) do nothing;

-- 기존 공개 버킷을 조용히 재사용하지 않는다. 기존 정책이 넓어도 이 버킷은 비서버 접근을 차단한다.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'ark-originals' and public) then
    raise exception 'ark-originals must be private';
  end if;
end $$;
-- 다른 버킷의 기존 정책은 건드리지 않고 이 버킷만 비서버 접근에서 제외한다.
create policy ark_originals_private on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'ark-originals') with check (bucket_id <> 'ark-originals');
