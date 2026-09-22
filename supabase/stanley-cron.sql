-- Stanley Druckenmiller SEC 13F의 시간별 동기화 운영 설정.
-- 배포된 보호 API의 인증·수집 응답을 확인한 뒤 운영자가 적용한다.
-- 비밀값은 Vault에서 실행 시점에만 읽고 이 파일·cron.job 명령·로그에 문자열로 남기지 않는다.
-- Vault 항목은 Supabase Dashboard의 Project Settings > Vault 화면에서 추가한다.
--   guru_tracker_base_url    : 자격 증명·경로·쿼리·프래그먼트가 없는 배포 https origin.
--   guru_tracker_sync_secret : 서버 SYNC_SECRET과 같은 32자 이상 값. 공백·줄바꿈 없이 저장한다.
-- 기존 job은 삭제하지 않는다. 같은 이름이 있으면 그 job의 일정과 명령만 갱신한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $outer$
declare
  v_job_id bigint;
  v_duplicates integer;
  v_base text;
  v_secret text;
  v_command text;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'guru_tracker_base_url';
  v_base := rtrim(btrim(coalesce(v_base, '')), '/');
  if v_base = '' then
    raise exception 'Vault에 guru_tracker_base_url이 없습니다. Dashboard의 Vault 화면에서 값을 추가한 뒤 다시 실행하세요.';
  end if;
  if v_base !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?$' then
    raise exception 'guru_tracker_base_url은 자격 증명·경로·쿼리·프래그먼트가 없는 https origin이어야 합니다.';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'guru_tracker_sync_secret';
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'Vault에 guru_tracker_sync_secret(32자 이상)이 없습니다. 서버 SYNC_SECRET과 같은 값을 Dashboard의 Vault 화면에서 추가한 뒤 다시 실행하세요.';
  end if;
  if v_secret ~ '^[[:space:]]' or v_secret ~ '[[:space:]]$' or v_secret ~ '[\r\n\t]' then
    raise exception 'guru_tracker_sync_secret 앞뒤에 공백이 있거나 줄바꿈이 포함되어 있습니다. Vault에서 값을 수정한 뒤 다시 실행하세요.';
  end if;

  -- 화면 접근 갱신과 같은 조정자·Stanley 전용 lease를 사용한다. 응답 한도는 API와 같은 60초다.
  v_command := $command$
select net.http_post(
  url := rtrim(btrim((select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_base_url')), '/')
    || '/api/internal/sync/stanley',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'guru_tracker_sync_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
$command$;

  -- 기존 ARK(7분)·PTR(13분)·Burry(19분)·나머지 SEC(25/31/37/43분)와 겹치지 않는다.
  select jobid into v_job_id from cron.job where jobname = 'guru_tracker_stanley_hourly';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '1 * * * *',
      command := v_command,
      database := current_database(),
      active := true
    );
  else
    perform cron.schedule('guru_tracker_stanley_hourly', '1 * * * *', v_command);
  end if;

  select count(*) into v_duplicates from cron.job where jobname like 'guru_tracker_stanley%';
  if v_duplicates > 1 then
    raise exception 'guru_tracker_stanley%% 이름의 cron job이 %개 있습니다. 중복 job은 삭제하지 않으니 운영자가 직접 확인하세요.', v_duplicates;
  end if;
end $outer$;

-- 확인용: select jobname, schedule, active from cron.job where jobname = 'guru_tracker_stanley_hourly';
-- net.http_request_queue에는 전송 전 Authorization 헤더가 남으므로 조회·복사·로그 출력을 하지 않는다.
