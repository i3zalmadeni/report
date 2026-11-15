-- اختبارات ملف المنسوب الشخصي وسجلات المشاهدة
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false) $$;
-- منسوب بلا أي صلاحية في مرآة
insert into public.staff_members (id, user_id, full_name, category, job_title, account_status, is_active) values
  ('30000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007', 'خالد الذاتي', 'teaching', 'teacher', 'active', true)
on conflict (id) do nothing;
insert into public.staff_private (staff_id, employee_no, phone) values ('30000000-0000-0000-0000-000000000007', '7788990', '0511111111') on conflict do nothing;

-- 1) يطّلع على ملفه ويصدّره، ويرى رقمه الوظيفي وتواصله، ولا يصل إلى غيره ولا إلى البحث
select pg_temp.as_user('a0000000-0000-0000-0000-000000000007');
set role authenticated;
do $$ declare p jsonb; begin
  assert (public.mr_whoami()->>'can')::boolean = false, 'self-only user has no search access';
  assert public.mr_whoami()->>'staff_id' = '30000000-0000-0000-0000-000000000007', 'whoami returns own id';
  p := public.mr_staff_profile('30000000-0000-0000-0000-000000000007');
  assert p->>'error' is null and p->'person'->>'no' = '7788990' and p->'person'->'contact'->>'phone' = '0511111111', 'own profile with own private data';
  assert public.mr_staff_extra('30000000-0000-0000-0000-000000000007')->>'error' is null, 'own extra';
  assert public.mr_log_export('staff', '30000000-0000-0000-0000-000000000007')->>'ok' = 'true', 'own export';
  assert public.mr_staff_profile('30000000-0000-0000-0000-000000000003')->>'error' = 'forbidden', 'other staff forbidden';
  assert public.mr_staff_extra('30000000-0000-0000-0000-000000000003')->>'error' = 'forbidden', 'other extra forbidden';
  assert public.mr_log_export('staff', '30000000-0000-0000-0000-000000000003')->>'error' = 'forbidden', 'other export forbidden';
  assert public.mr_student_profile('40000000-0000-0000-0000-000000000001')->>'error' = 'forbidden', 'students forbidden';
  assert public.mr_search('staff', 'خالد')->>'error' = 'forbidden', 'search forbidden';
  assert public.mr_audit_list()->>'error' = 'forbidden', 'self user cannot read log';
end $$;
reset role;

-- 2) سجلات المشاهدة للمدير
create temp table _n as select count(*) n from public.audit_logs where table_name like 'mirat.%';
grant select on _n to authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare l jsonb; r jsonb; begin
  l := public.mr_audit_list();
  assert (l->>'total')::int = (select n from _n), 'all mirat log lines';
  assert jsonb_array_length(l->'rows') = least((l->>'total')::int, 50), 'page size';
  -- اطلاع خالد على ملفه
  l := public.mr_audit_list(p_actor => '30000000-0000-0000-0000-000000000007', p_action => 'VIEW');
  r := l->'rows'->0;
  assert r->>'actor' = 'خالد الذاتي' and r->>'target' = 'خالد الذاتي' and (r->>'self')::boolean, 'self view logged with names';
  assert (l->'by_user'->0->>'views')::int >= 1, 'per-user summary';
  -- اسم المتعلم في سطر الاطلاع
  l := public.mr_audit_list(p_kind => 'student', p_action => 'VIEW');
  assert l->'rows'->0->>'target' = 'أحمد عبدالله الحربي' and l->'rows'->0->>'target_info' like '%الثاني المتوسط%', 'student target name and class';
  -- البحث بالاسم (يوحّد الهمزات)
  assert (public.mr_audit_list(p_q => 'ابراهيم')->>'total')::int >= 1, 'name search';
  assert (public.mr_audit_list(p_action => 'PERMISSION')->'rows'->0->'new') is not null, 'permission rows carry new set';
  assert jsonb_array_length(public.mr_audit_list()->'users') >= 3, 'users list';
  assert (public.mr_audit_list(p_from => '2000-01-01', p_to => '2000-01-02')->>'total')::int = 0, 'date filter';
  assert jsonb_array_length(public.mr_audit_list(p_limit => 2, p_offset => 1)->'rows') = 2, 'paging';
end $$;
reset role;
set role anon;
do $$ begin perform public.mr_audit_list(); raise exception 'anon reached mr_audit_list';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ALL 0404 TESTS PASSED';
