-- laffont/gerstner/tepper 신규 job만 관리한다. 기존 다른 관리자 job·Vault 값은 변경하지 않는다.
-- 기본은 비활성이다. 각 블록의 v_endpoint_verified를 배포 API 확인 완료한 대상만 true로 바꾼다.
-- false로 재적용하면 해당 신규 대상 job도 비활성화된다.

-- Philippe Laffont(COATUE MANAGEMENT LLC) SEC 13F의 시간별 동기화 운영 설정.
-- 마이그레이션에서 자동 활성화하지 않는다. 운영자가 Vault 값을 넣은 뒤 이 파일을 직접 실행한다.
-- 비밀값은 Vault에서 실행 시점에만 읽고 이 파일·cron.job 명령·로그에 문자열로 남기지 않는다.
-- Vault 항목은 Supabase Dashboard의 Project Settings > Vault 화면에서 추가한다.
-- SQL Editor에 비밀값을 넣은 create_secret 문을 실행하지 않는다. SQL 실행 이력에 그대로 남는다.
--   guru_tracker_base_url    : 배포 https origin. 경로·쿼리·프래그먼트·사용자 정보 없이 넣는다.
--   guru_tracker_sync_secret : 서버 SYNC_SECRET과 같은 32자 이상 값. 앞뒤 공백·줄바꿈 없이 넣는다.
-- 기존 cron job을 삭제·unschedule하지 않는다. 같은 이름이 있으면 일정과 명령만 갱신한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $outer$
declare
  -- 메인이 배포된 이 대상의 보호 API를 확인한 뒤에만 true로 바꿔 적용한다.
  v_endpoint_verified boolean := false;
  v_job_id bigint;
  v_duplicates integer;
  v_base text;
  v_secret text;
  v_command text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'guru_tracker_base_url';
  -- 값은 여기서만 다루며 예외 메시지·로그에 원문을 남기지 않는다.
  v_base := rtrim(btrim(coalesce(v_base, '')), '/');
  if v_base = '' then
    raise exception 'Vault에 guru_tracker_base_url이 없습니다. Dashboard의 Vault 화면에서 값을 추가한 뒤 다시 실행하세요.';
  end if;
  -- origin만 허용한다. 자격 증명·경로·쿼리·프래그먼트가 붙으면 호출 URL이 오염된다.
  if v_base !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?$' then
    raise exception 'guru_tracker_base_url은 자격 증명·경로·쿼리·프래그먼트가 없는 https origin이어야 합니다.';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'guru_tracker_sync_secret';
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'Vault에 guru_tracker_sync_secret(32자 이상)이 없습니다. 서버 SYNC_SECRET과 같은 값을 Dashboard의 Vault 화면에서 추가한 뒤 다시 실행하세요.';
  end if;
  -- 서버 SYNC_SECRET과 바이트 단위로 같아야 하고 HTTP 헤더 값으로 그대로 들어가므로 공백·줄바꿈을 거부한다.
  if v_secret ~ '^[[:space:]]' or v_secret ~ '[[:space:]]$' or v_secret ~ '[\r\n\t]' then
    raise exception 'guru_tracker_sync_secret 앞뒤에 공백이 있거나 줄바꿈이 포함되어 있습니다. Vault에서 값을 수정한 뒤 다시 실행하세요.';
  end if;

  -- 대상은 최신 13F 1건이므로 한 번만 호출한다. 응답은 60초 한도이며 엔드포인트의 maxDuration과 같다.
  -- Philippe Laffont는 Stanley와 다른 lease를 쓰므로 두 동기화는 서로를 막지 않는다. 같은 대상의 중복 실행만 busy로 끝난다.
  v_command := $command$
select net.http_post(
  url := rtrim(btrim((select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_base_url')), '/')
    || '/api/internal/sync/laffont',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_sync_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$command$;

  -- 기존 ARK(7분)·PTR(13분)·Burry 예정(19분)과 겹치지 않게 매시 25분에 실행한다.
  select jobid into v_job_id from cron.job where jobname = 'guru_tracker_laffont_hourly';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '25 * * * *',
      command := v_command,
      database := current_database(),
      active := v_endpoint_verified
    );
  else
    v_job_id := cron.schedule('guru_tracker_laffont_hourly', '25 * * * *', v_command);
    -- 등록과 비활성화를 같은 transaction에서 끝내어 미확인 API 호출을 막는다.
    perform cron.alter_job(job_id := v_job_id, active := v_endpoint_verified);
  end if;

  select count(*) into v_duplicates from cron.job where jobname like 'guru_tracker_laffont%';
  if v_duplicates > 1 then
    raise exception 'guru_tracker_laffont%% 이름의 cron job이 %개 있습니다. 중복 job은 여기서 삭제하지 않으니 운영자가 직접 확인하세요.', v_duplicates;
  end if;
end $outer$;

-- 확인용(선택): 실행 job과 최근 응답 상태를 조회한다. 응답 본문·헤더는 남기지 않는다.
--   select jobid, jobname, schedule, active from cron.job where jobname = 'guru_tracker_laffont_hourly';
--   select id, status_code, timed_out, created from net._http_response order by created desc limit 12;
-- Authorization 헤더는 pg_net이 전송할 때까지 net.http_request_queue에 남는다. 이 표를 조회·복사해 로그나 문서로 남기지 않는다.


-- Brad Gerstner(Altimeter Capital Management, LP) SEC 13F의 시간별 동기화 운영 설정.
-- 마이그레이션에서 자동 활성화하지 않는다. 운영자가 Vault 값을 넣은 뒤 이 파일을 직접 실행한다.
-- 비밀값은 Vault에서 실행 시점에만 읽고 이 파일·cron.job 명령·로그에 문자열로 남기지 않는다.
-- Vault 항목은 Supabase Dashboard의 Project Settings > Vault 화면에서 추가한다.
-- SQL Editor에 비밀값을 넣은 create_secret 문을 실행하지 않는다. SQL 실행 이력에 그대로 남는다.
--   guru_tracker_base_url    : 배포 https origin. 경로·쿼리·프래그먼트·사용자 정보 없이 넣는다.
--   guru_tracker_sync_secret : 서버 SYNC_SECRET과 같은 32자 이상 값. 앞뒤 공백·줄바꿈 없이 넣는다.
-- 기존 cron job을 삭제·unschedule하지 않는다. 같은 이름이 있으면 일정과 명령만 갱신한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $outer$
declare
  -- 메인이 배포된 이 대상의 보호 API를 확인한 뒤에만 true로 바꿔 적용한다.
  v_endpoint_verified boolean := false;
  v_job_id bigint;
  v_duplicates integer;
  v_base text;
  v_secret text;
  v_command text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'guru_tracker_base_url';
  -- 값은 여기서만 다루며 예외 메시지·로그에 원문을 남기지 않는다.
  v_base := rtrim(btrim(coalesce(v_base, '')), '/');
  if v_base = '' then
    raise exception 'Vault에 guru_tracker_base_url이 없습니다. Dashboard의 Vault 화면에서 값을 추가한 뒤 다시 실행하세요.';
  end if;
  -- origin만 허용한다. 자격 증명·경로·쿼리·프래그먼트가 붙으면 호출 URL이 오염된다.
  if v_base !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?$' then
    raise exception 'guru_tracker_base_url은 자격 증명·경로·쿼리·프래그먼트가 없는 https origin이어야 합니다.';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'guru_tracker_sync_secret';
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'Vault에 guru_tracker_sync_secret(32자 이상)이 없습니다. 서버 SYNC_SECRET과 같은 값을 Dashboard의 Vault 화면에서 추가한 뒤 다시 실행하세요.';
  end if;
  -- 서버 SYNC_SECRET과 바이트 단위로 같아야 하고 HTTP 헤더 값으로 그대로 들어가므로 공백·줄바꿈을 거부한다.
  if v_secret ~ '^[[:space:]]' or v_secret ~ '[[:space:]]$' or v_secret ~ '[\r\n\t]' then
    raise exception 'guru_tracker_sync_secret 앞뒤에 공백이 있거나 줄바꿈이 포함되어 있습니다. Vault에서 값을 수정한 뒤 다시 실행하세요.';
  end if;

  -- 대상은 최신 13F 1건이므로 한 번만 호출한다. 응답은 60초 한도이며 엔드포인트의 maxDuration과 같다.
  -- Brad Gerstner는 Stanley와 다른 lease를 쓰므로 두 동기화는 서로를 막지 않는다. 같은 대상의 중복 실행만 busy로 끝난다.
  v_command := $command$
select net.http_post(
  url := rtrim(btrim((select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_base_url')), '/')
    || '/api/internal/sync/gerstner',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_sync_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$command$;

  -- 기존 ARK(7분)·PTR(13분)·Burry 예정(19분)과 겹치지 않게 매시 31분에 실행한다.
  select jobid into v_job_id from cron.job where jobname = 'guru_tracker_gerstner_hourly';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '31 * * * *',
      command := v_command,
      database := current_database(),
      active := v_endpoint_verified
    );
  else
    v_job_id := cron.schedule('guru_tracker_gerstner_hourly', '31 * * * *', v_command);
    -- 등록과 비활성화를 같은 transaction에서 끝내어 미확인 API 호출을 막는다.
    perform cron.alter_job(job_id := v_job_id, active := v_endpoint_verified);
  end if;

  select count(*) into v_duplicates from cron.job where jobname like 'guru_tracker_gerstner%';
  if v_duplicates > 1 then
    raise exception 'guru_tracker_gerstner%% 이름의 cron job이 %개 있습니다. 중복 job은 여기서 삭제하지 않으니 운영자가 직접 확인하세요.', v_duplicates;
  end if;
end $outer$;

-- 확인용(선택): 실행 job과 최근 응답 상태를 조회한다. 응답 본문·헤더는 남기지 않는다.
--   select jobid, jobname, schedule, active from cron.job where jobname = 'guru_tracker_gerstner_hourly';
--   select id, status_code, timed_out, created from net._http_response order by created desc limit 12;
-- Authorization 헤더는 pg_net이 전송할 때까지 net.http_request_queue에 남는다. 이 표를 조회·복사해 로그나 문서로 남기지 않는다.


-- David Tepper(Appaloosa LP) SEC 13F의 시간별 동기화 운영 설정.
-- 마이그레이션에서 자동 활성화하지 않는다. 운영자가 Vault 값을 넣은 뒤 이 파일을 직접 실행한다.
-- 비밀값은 Vault에서 실행 시점에만 읽고 이 파일·cron.job 명령·로그에 문자열로 남기지 않는다.
-- Vault 항목은 Supabase Dashboard의 Project Settings > Vault 화면에서 추가한다.
-- SQL Editor에 비밀값을 넣은 create_secret 문을 실행하지 않는다. SQL 실행 이력에 그대로 남는다.
--   guru_tracker_base_url    : 배포 https origin. 경로·쿼리·프래그먼트·사용자 정보 없이 넣는다.
--   guru_tracker_sync_secret : 서버 SYNC_SECRET과 같은 32자 이상 값. 앞뒤 공백·줄바꿈 없이 넣는다.
-- 기존 cron job을 삭제·unschedule하지 않는다. 같은 이름이 있으면 일정과 명령만 갱신한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $outer$
declare
  -- 메인이 배포된 이 대상의 보호 API를 확인한 뒤에만 true로 바꿔 적용한다.
  v_endpoint_verified boolean := false;
  v_job_id bigint;
  v_duplicates integer;
  v_base text;
  v_secret text;
  v_command text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'guru_tracker_base_url';
  -- 값은 여기서만 다루며 예외 메시지·로그에 원문을 남기지 않는다.
  v_base := rtrim(btrim(coalesce(v_base, '')), '/');
  if v_base = '' then
    raise exception 'Vault에 guru_tracker_base_url이 없습니다. Dashboard의 Vault 화면에서 값을 추가한 뒤 다시 실행하세요.';
  end if;
  -- origin만 허용한다. 자격 증명·경로·쿼리·프래그먼트가 붙으면 호출 URL이 오염된다.
  if v_base !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?$' then
    raise exception 'guru_tracker_base_url은 자격 증명·경로·쿼리·프래그먼트가 없는 https origin이어야 합니다.';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'guru_tracker_sync_secret';
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'Vault에 guru_tracker_sync_secret(32자 이상)이 없습니다. 서버 SYNC_SECRET과 같은 값을 Dashboard의 Vault 화면에서 추가한 뒤 다시 실행하세요.';
  end if;
  -- 서버 SYNC_SECRET과 바이트 단위로 같아야 하고 HTTP 헤더 값으로 그대로 들어가므로 공백·줄바꿈을 거부한다.
  if v_secret ~ '^[[:space:]]' or v_secret ~ '[[:space:]]$' or v_secret ~ '[\r\n\t]' then
    raise exception 'guru_tracker_sync_secret 앞뒤에 공백이 있거나 줄바꿈이 포함되어 있습니다. Vault에서 값을 수정한 뒤 다시 실행하세요.';
  end if;

  -- 대상은 최신 13F 1건이므로 한 번만 호출한다. 응답은 60초 한도이며 엔드포인트의 maxDuration과 같다.
  -- David Tepper는 Stanley와 다른 lease를 쓰므로 두 동기화는 서로를 막지 않는다. 같은 대상의 중복 실행만 busy로 끝난다.
  v_command := $command$
select net.http_post(
  url := rtrim(btrim((select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_base_url')), '/')
    || '/api/internal/sync/tepper',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_sync_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$command$;

  -- 기존 ARK(7분)·PTR(13분)·Burry 예정(19분)과 겹치지 않게 매시 37분에 실행한다.
  select jobid into v_job_id from cron.job where jobname = 'guru_tracker_tepper_hourly';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '37 * * * *',
      command := v_command,
      database := current_database(),
      active := v_endpoint_verified
    );
  else
    v_job_id := cron.schedule('guru_tracker_tepper_hourly', '37 * * * *', v_command);
    -- 등록과 비활성화를 같은 transaction에서 끝내어 미확인 API 호출을 막는다.
    perform cron.alter_job(job_id := v_job_id, active := v_endpoint_verified);
  end if;

  select count(*) into v_duplicates from cron.job where jobname like 'guru_tracker_tepper%';
  if v_duplicates > 1 then
    raise exception 'guru_tracker_tepper%% 이름의 cron job이 %개 있습니다. 중복 job은 여기서 삭제하지 않으니 운영자가 직접 확인하세요.', v_duplicates;
  end if;
end $outer$;

-- 확인용(선택): 실행 job과 최근 응답 상태를 조회한다. 응답 본문·헤더는 남기지 않는다.
--   select jobid, jobname, schedule, active from cron.job where jobname = 'guru_tracker_tepper_hourly';
--   select id, status_code, timed_out, created from net._http_response order by created desc limit 12;
-- Authorization 헤더는 pg_net이 전송할 때까지 net.http_request_queue에 남는다. 이 표를 조회·복사해 로그나 문서로 남기지 않는다.
