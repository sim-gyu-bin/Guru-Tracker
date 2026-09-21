-- 승인 기반 접근 제어. 최초 Google 로그인은 pending 가입 요청을 만들고, 관리자 결정으로만 상태가 바뀐다.
-- 이메일은 사용자 PII이므로 로그·문서에 남기지 않고 이 표와 관리자 화면에서만 다룬다.
-- 관리자 지정은 ADMIN_EMAIL(서버 전용)과 실제 auth.identities의 확인된 Google identity를 대조해서만 이뤄진다.
create table public.access_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  status text not null default 'pending' check (status in ('pending','approved','rejected','revoked')),
  is_admin boolean not null default false,
  -- revision은 결정의 세대 번호다. 기대 revision이 다르면 이전 의도를 실행하지 않는다(ABA 방지).
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  requested_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,
  decided_by uuid,
  updated_at timestamptz not null default clock_timestamp()
);

-- 한 사람당 한 행만 둔다. 같은 이메일로 두 행이 생기면 관리자 화면의 결정 대상이 모호해진다.
create unique index access_users_email_key on public.access_users (email);
-- 관리자는 한 명만 존재한다. ADMIN_EMAIL 변경이나 같은 이메일 계정 재생성으로 관리자가 둘이 되는 것을 DB가 막는다.
create unique index access_users_single_admin on public.access_users (is_admin) where is_admin;

alter table public.access_users enable row level security;
-- 브라우저(anon/authenticated)는 이 표에 접근하지 않는다. 서버의 service 역할만 읽는다.
revoke all on public.access_users from public, anon, authenticated, service_role;
grant select on public.access_users to service_role;

-- 최초 로그인 가입 요청. 같은 사용자에 대해 몇 번을 호출해도 pending 행은 하나만 생긴다(멱등).
-- rejected/revoked는 로그인만으로 되돌리지 않는다. 재승인은 관리자 결정 함수로만 한다.
-- 반환값의 created는 이 호출이 행을 처음 만들었는지를 같은 문장에서 확정한 값이다.
-- 동시 콜백이 겹쳐도 created가 한 번만 true이므로 관리자 알림이 중복되지 않는다.
create function public.access_request_submit(p_user_id uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.access_users; e text; created boolean;
begin
  e := lower(btrim(coalesce(p_email, '')));
  if p_user_id is null or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(e) > 320 then
    raise exception 'Invalid access request';
  end if;
  insert into public.access_users (user_id, email) values (p_user_id, e)
  on conflict (user_id) do nothing;
  created := found;
  if not created then
    -- 표시 신원이 바뀌면 관리자가 보던 대상이 달라지므로 revision을 올려 이전 메일의 의도를 무효화한다.
    update public.access_users
      set email = e, revision = revision + 1, updated_at = clock_timestamp()
      where user_id = p_user_id and email is distinct from e;
  end if;
  select * into strict r from public.access_users where user_id = p_user_id;
  return jsonb_build_object('created', created, 'user', to_jsonb(r));
end $$;

-- 관리자 bootstrap. 호출자가 넘긴 user id와 이메일만 믿지 않고 auth.users와 auth.identities를 직접 확인한다.
-- 일반 사용자는 이 함수를 호출할 수 없고(service 역할 전용), 호출돼도 확인된 Google identity가 아니면 승격되지 않는다.
create function public.access_confirm_admin(p_user_id uuid, p_admin_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare e text; r public.access_users; u record;
begin
  e := lower(btrim(coalesce(p_admin_email, '')));
  if p_user_id is null or e = '' then return 'unconfigured'; end if;
  select usr.email as email, usr.email_confirmed_at as confirmed_at into u
    from auth.users as usr where usr.id = p_user_id;
  if not found or u.email is null or lower(u.email) is distinct from e or u.confirmed_at is null then
    return 'unverified';
  end if;
  if not exists (
    select 1 from auth.identities as i
    where i.user_id = p_user_id and i.provider = 'google'
      and lower(coalesce(i.identity_data ->> 'email', '')) = e
      and coalesce(i.identity_data ->> 'email_verified', 'false') = 'true'
  ) then
    return 'unverified';
  end if;
  select * into r from public.access_users where user_id = p_user_id for update;
  if not found then return 'missing'; end if;
  if r.is_admin then return 'admin'; end if;
  -- 다른 관리자가 이미 있으면 두 번째 관리자를 만들지 않는다. 이전 관리자는 운영자가 직접 정리한다.
  if exists (select 1 from public.access_users as other where other.is_admin and other.user_id <> p_user_id) then
    return 'admin_exists';
  end if;
  update public.access_users
    set is_admin = true, status = 'approved', decided_at = clock_timestamp(), decided_by = p_user_id,
      revision = revision + 1, updated_at = clock_timestamp()
    where user_id = p_user_id;
  return 'admin';
end $$;

-- 관리자 결정. 행 잠금 안에서 기대 revision을 대조하는 원자 compare-and-set이다.
-- 오래된 메일이나 동시 요청은 'stale'로 끝나며 이미 내린 결정을 덮어쓰지 않는다.
create function public.access_decide(p_actor uuid, p_user_id uuid, p_action text, p_expected_revision bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare actor public.access_users; target public.access_users; next_status text;
begin
  if p_actor is null or p_user_id is null or p_expected_revision is null then return 'invalid'; end if;
  -- p_action이 null이면 `not in`이 null로 평가되어 else로 흘러 거절 결정이 될 수 있으므로 먼저 막는다.
  if p_action is null or p_action not in ('approve','reject','revoke') then return 'invalid'; end if;
  select * into actor from public.access_users where user_id = p_actor;
  if not found or not actor.is_admin or actor.status <> 'approved' then return 'forbidden'; end if;
  -- 관리자 자신의 권한은 이 경로로 해제할 수 없다.
  if p_user_id = p_actor then return 'self'; end if;
  select * into target from public.access_users where user_id = p_user_id for update;
  if not found then return 'missing'; end if;
  if target.revision <> p_expected_revision then return 'stale'; end if;
  -- 관리자 행은 일반 결정 경로로 바꾸지 않는다.
  if target.is_admin then return 'forbidden'; end if;
  if p_action = 'revoke' then
    if target.status <> 'approved' then return 'invalid'; end if;
    next_status := 'revoked';
  else
    -- 재승인은 rejected/revoked에서도 가능하지만, 사용자 재로그인으로는 만들어지지 않는다.
    if target.status not in ('pending','rejected','revoked') then return 'invalid'; end if;
    next_status := case p_action when 'approve' then 'approved' else 'rejected' end;
  end if;
  if target.status = next_status then return 'unchanged'; end if;
  update public.access_users
    set status = next_status, decided_at = clock_timestamp(), decided_by = p_actor,
      revision = revision + 1, updated_at = clock_timestamp()
    where user_id = p_user_id;
  return 'updated';
end $$;

revoke all on function public.access_request_submit(uuid,text) from public, anon, authenticated;
revoke all on function public.access_confirm_admin(uuid,text) from public, anon, authenticated;
revoke all on function public.access_decide(uuid,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.access_request_submit(uuid,text) to service_role;
grant execute on function public.access_confirm_admin(uuid,text) to service_role;
grant execute on function public.access_decide(uuid,uuid,text,bigint) to service_role;
