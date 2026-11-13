-- اختبارات طبقة القراءة. كل اختبار يفشل برسالة واضحة عبر assert.
\set ON_ERROR_STOP 1
create temp table _counts as select 1 x;
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false) $$;
-- عدد صفوف كل جدول (باستثناء سجل العمليات) قبل الاختبارات، للتحقق من عدم وجود أي كتابة
create or replace function pg_temp.snapshot() returns jsonb language plpgsql as $$
declare t text; n bigint; r jsonb := '{}'; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'audit_logs' order by 1 loop
    execute format('select count(*) from public.%I', t) into n; r := r || jsonb_build_object(t, n); end loop; return r; end $$;
create temp table _before as select pg_temp.snapshot() s;
grant select on _before to authenticated;

-- 1) لا جداول جديدة أنشأها مرآة
do $$ begin assert (select count(*) from pg_tables where schemaname = 'public' and tablename like 'mr\_%') = 0, 'mirat must not create tables'; end $$;

-- 2) الزائر المجهول لا يصل إلى أي دالة
set role anon;
do $$ begin perform public.mr_search('student', 'احمد'); raise exception 'anon reached mr_search';
exception when insufficient_privilege then null; end $$;
reset role;

-- 3) الدوال الداخلية غير متاحة للمستخدم المسجل
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
set role authenticated;
do $$ begin perform public.mr__sec('x','x','x','x','[]','select 1 id, null::text d', null); raise exception 'mr__sec callable';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.mr__log('VIEW','student',null); raise exception 'mr__log callable';
exception when insufficient_privilege then null; end $$;
reset role;

-- 4) معلم بلا صلاحية: مرفوض، ويُسجَّل الرفض
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  assert (public.mr_whoami()->>'can')::boolean = false, 'teacher can must be false';
  assert public.mr_search('student', 'احمد')->>'error' = 'forbidden', 'teacher search must be forbidden';
  assert public.mr_student_profile('40000000-0000-0000-0000-000000000001')->>'error' = 'forbidden', 'teacher profile must be forbidden';
  assert public.mr_staff_profile('30000000-0000-0000-0000-000000000001')->>'error' = 'forbidden', 'teacher staff profile must be forbidden';
end $$;
reset role;
do $$ begin assert (select count(*) from public.audit_logs where action = 'DENIED' and actor_id = 'a0000000-0000-0000-0000-000000000003') = 2, 'denials logged'; end $$;

-- 5) مستخدم بلا جلسة
select pg_temp.as_user(null);
set role authenticated;
do $$ begin assert public.mr_whoami() is null, 'no session -> null whoami'; assert public.mr_search('student','احمد')->>'error' = 'forbidden'; end $$;
reset role;

-- 6) المطّلع المخوّل: البحث بتوحيد الكتابة العربية وبالرقم
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
set role authenticated;
do $$ declare r jsonb; begin
  r := public.mr_search('student', 'احمد');
  assert jsonb_array_length(r) = 1 and r->0->>'name' = 'أحمد عبدالله الحربي', 'normalized search: ' || r::text;
  assert r->0->>'grade' = 'الثاني المتوسط' and r->0->>'section' = '2/3', 'current enrollment in search';
  r := public.mr_search('student', '1122334466'); assert r->0->>'no' = '1122334466' and jsonb_array_length(r) = 1, 'search by no';
  r := public.mr_search('student', 'ا'); assert jsonb_array_length(r) = 0, 'too short query';
  r := public.mr_search('staff', 'ابراهيم'); assert r->0->>'name' = 'إبراهيم المعلم' and r->0->>'no' is null, 'staff search hides employee_no without personnel:view';
  r := public.mr_search('staff', '4455667'); assert jsonb_array_length(r) = 0, 'employee_no search requires personnel:view';
  assert public.mr_search('x', 'ابراهيم')->>'error' = 'bad_request';
end $$;

-- 7) ملف المتعلم: الأقسام والمصادر والحساسية ومنع التكرار
do $$ declare p jsonb; s jsonb; begin
  p := public.mr_student_profile('40000000-0000-0000-0000-000000000001');
  assert p->'person'->>'name' = 'أحمد عبدالله الحربي' and p->'person'->>'grade' = 'الثاني المتوسط', 'person';
  assert p->'person'->>'birth_date' is null and p->'person'->'contact' is null, 'basic/contact hidden without core permissions';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'enroll'; assert jsonb_array_length(s->'rows') = 2 and s->>'system' = 'النواة الرقمية', 'enroll';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'attendance'; assert jsonb_array_length(s->'rows') = 2 and s->'rows'->0->>'d' = '2026-11-09', 'attendance sorted desc';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'lateness'; assert s->'rows'->0->>'mins' = '15' and s->'rows'->0->>'arr' = '07:20', 'lateness';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'excuses'; assert s->>'status' = 'restricted' and jsonb_array_length(s->'rows') = 0, 'excuses restricted';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'incidents'; assert s->>'status' = 'restricted' and jsonb_array_length(s->'rows') = 0, 'incidents restricted';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'progress'; assert s->>'status' = 'restricted', 'progress restricted';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'points';
  assert jsonb_array_length(s->'rows') = 3, 'ledger rows kept in its section';
  assert (select count(*) from jsonb_array_elements(s->'rows') r where (r->>'dup')::boolean) = 2, 'ledger entries mirroring reinforcement/badge are flagged dup';
  assert (select sum((r->>'n')::int) from jsonb_array_elements(s->'rows') r) = 13, 'points total';
  assert (select count(*) from jsonb_array_elements(p->'sections') x where x->>'status' not in ('ok', 'restricted')) = 0, 'no errors: ' || p::text;
  -- متعلم بلا سجلات: الأقسام سليمة وفارغة، دون أي بيانات مصطنعة
  p := public.mr_student_profile('40000000-0000-0000-0000-000000000002');
  assert (select count(*) from jsonb_array_elements(p->'sections') x where x->>'key' <> 'enroll' and jsonb_array_length(x->'rows') > 0) = 0, 'empty student has no rows';
  assert public.mr_student_profile(gen_random_uuid())->>'error' = 'not_found', 'not found';
end $$;

-- 8) ملف المعلم
do $$ declare p jsonb; s jsonb; begin
  p := public.mr_staff_profile('30000000-0000-0000-0000-000000000003');
  assert p->'person'->>'job' = 'معلم' and p->'person'->'pro'->>'headline' = 'معلم رياضيات', 'staff person + pro';
  assert p->'person'->>'no' is null and p->'person'->'contact' is null, 'staff private hidden';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'plans';
  assert jsonb_array_length(s->'rows') = 2 and s->>'system' = 'الخطط الذكية', 'plans linked by staff id in json only: ' || s::text;
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'contrib';
  assert (select count(*) from jsonb_array_elements(s->'rows')) = 5, 'contrib aggregated: ' || s::text;
  assert not (s->'rows'->0 ? 'student_id') and not (s::text like '%أحمد%'), 'no student names in contrib';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'growth'; assert s->'rows'->0->>'hours' = '6', 'growth';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'bookings'; assert jsonb_array_length(s->'rows') = 1, 'bookings';
  assert (select count(*) from jsonb_array_elements(p->'sections') x where x->>'status' <> 'ok') = 0, 'staff no errors: ' || p::text;
end $$;
reset role;

-- 9) الموجه المخوّل يرى الأقسام الإرشادية؛ والمدير يرى التواصل
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004');
set role authenticated;
do $$ declare p jsonb; s jsonb; begin
  p := public.mr_student_profile('40000000-0000-0000-0000-000000000001');
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'incidents'; assert s->>'status' = 'ok' and jsonb_array_length(s->'rows') = 1, 'counselor incidents';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'progress'; assert s->'rows'->0->>'imp' = '3', 'counselor progress';
end $$;
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare p jsonb; begin
  p := public.mr_student_profile('40000000-0000-0000-0000-000000000001');
  assert p->'person'->'contact'->>'phone' = '0555555555' and p->'person'->>'birth_date' = '2013-03-01', 'admin sees contact + basic';
  p := public.mr_staff_profile('30000000-0000-0000-0000-000000000003');
  assert p->'person'->>'no' = '4455667' and p->'person'->'contact'->>'email' = 'teacher@example.invalid', 'admin sees staff private';
  assert public.mr_log_export('student', '40000000-0000-0000-0000-000000000001')->>'ok' = 'true', 'export logged';
end $$;
reset role;

-- 10) تعذّر مصدر: يظهر في قسمه ولا يُسقط الملف
begin;
alter table public.pc_outputs rename to pc_outputs_off;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare p jsonb; s jsonb; begin
  p := public.mr_staff_profile('30000000-0000-0000-0000-000000000003');
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'outputs'; assert s->>'status' = 'unavailable' and s->>'error' is not null, 'missing source flagged';
  select x into s from jsonb_array_elements(p->'sections') x where x->>'key' = 'growth'; assert s->>'status' = 'ok', 'other sections intact';
end $$;
reset role;
rollback;

-- 11) لا كتابة على أي جدول سوى سجل العمليات، والاطلاع مسجل
do $$ begin
  assert (select s from _before) = pg_temp.snapshot(), 'no writes to source tables';
  assert (select count(*) from public.audit_logs where action = 'VIEW' and table_name = 'mirat.student') >= 3, 'views logged';
  assert (select count(*) from public.audit_logs where action = 'EXPORT') = 1, 'export logged once';
end $$;
select 'ALL 0401 TESTS PASSED';
