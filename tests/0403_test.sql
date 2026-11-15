-- اختبارات صلاحيات المصرح لهم (تقرير المتعلم وتقرير المعلم) ولوحة إدارتها.
\set ON_ERROR_STOP 1
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false) $$;
-- المستخدمون في البيانات: 1 مدير (core_admin)، 2 و4 بصلاحية mirat:view القديمة، 3 معلم بلا صلاحية
-- منسوب خامس لاختبار المنسق
insert into public.staff_members (id, user_id, full_name, category, job_title, account_status, is_active) values
  ('30000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'منسق مرآة', 'teaching', 'teacher', 'active', true),
  ('30000000-0000-0000-0000-000000000006', null, 'منسوب بلا حساب', 'teaching', 'teacher', null, true)
on conflict (id) do nothing;

-- 1) الصلاحيات الثلاث مسجلة في النواة
do $$ begin
  assert (select count(*) from public.permissions where code in ('mirat:view_student', 'mirat:view_staff', 'mirat:approve')) = 3, 'permissions registered';
end $$;

-- 2) المعلم بلا صلاحية لا يدير ولا يرى القائمة، ويُسجَّل الرفض
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  assert public.mr_perm_list()->>'error' = 'forbidden', 'teacher cannot list';
  assert public.mr_perm_set('30000000-0000-0000-0000-000000000003', true, true)->>'error' = 'forbidden', 'teacher cannot grant himself';
  assert (public.mr_whoami()->>'manage')::boolean = false, 'teacher manage false';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.staff_permissions where staff_id = '30000000-0000-0000-0000-000000000003'), 'no grant happened';
  assert exists (select 1 from public.audit_logs where action = 'DENIED' and table_name = 'mirat.permissions'), 'denied logged';
end $$;

-- 3) صاحب الصلاحية القديمة يرى النوعين، ولا يدير
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
set role authenticated;
do $$ begin
  assert (public.mr_whoami()->>'can_student')::boolean and (public.mr_whoami()->>'can_staff')::boolean, 'legacy view = both kinds';
  assert (public.mr_whoami()->>'manage')::boolean = false, 'viewer cannot manage';
end $$;
reset role;

-- 4) المدير: القائمة تشمل المنسوبين الفعّالين، والقيادة أولاً، ومن بلا حساب يظهر
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare l jsonb := public.mr_perm_list(); r jsonb; begin
  assert (public.mr_whoami()->>'manage')::boolean, 'admin manages';
  assert jsonb_array_length(l->'staff') = 6, 'all active staff listed: ' || jsonb_array_length(l->'staff');
  assert (l->'staff'->0->>'leader')::boolean, 'leaders first';
  select x into r from jsonb_array_elements(l->'staff') x where x->>'id' = '30000000-0000-0000-0000-000000000002';
  assert (r->>'legacy')::boolean and (r->>'student')::boolean and (r->>'staff')::boolean, 'legacy shown as both';
  select x into r from jsonb_array_elements(l->'staff') x where x->>'id' = '30000000-0000-0000-0000-000000000006';
  assert (r->>'has_account')::boolean = false, 'no-account flagged';
  -- لا يُعدَّل صاحب القيادة
  assert public.mr_perm_set('30000000-0000-0000-0000-000000000001', false, false)->>'error' = 'leader', 'leader immutable';
  -- منح المعلم تقرير المتعلم فقط
  r := public.mr_perm_set('30000000-0000-0000-0000-000000000003', true, false);
  assert (r->>'student')::boolean and not (r->>'staff')::boolean and (r->>'changed')::boolean, 'grant student only';
  -- تحويل الصلاحية القديمة: المطّلع يبقى بالمعلم فقط
  r := public.mr_perm_set('30000000-0000-0000-0000-000000000002', false, true);
  assert not (r->>'student')::boolean and (r->>'staff')::boolean, 'legacy converted';
  -- تعيين منسق مرآة
  r := public.mr_perm_set('30000000-0000-0000-0000-000000000005', false, false, true);
  assert (r->>'coord')::boolean, 'coordinator set';
  -- تكرار الحالة نفسها لا يكتب شيئاً
  assert (public.mr_perm_set('30000000-0000-0000-0000-000000000005', false, false, true)->>'changed')::boolean = false, 'no-op';
end $$;
reset role;
do $$ begin
  assert (select array_agg(permission_code order by permission_code) from public.staff_permissions where staff_id = '30000000-0000-0000-0000-000000000002') = array['mirat:view_staff'], 'legacy row removed';
  assert (select array_agg(permission_code) from public.staff_permissions where staff_id = '30000000-0000-0000-0000-000000000003') = array['mirat:view_student'], 'teacher has student only';
  assert (select count(*) from public.audit_logs where action = 'PERMISSION' and table_name = 'mirat.permissions') = 3, 'each change logged once';
end $$;

-- 5) المعلم الآن: ملفات المتعلمين فقط
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  assert (public.mr_whoami()->>'can')::boolean and (public.mr_whoami()->>'can_student')::boolean and not (public.mr_whoami()->>'can_staff')::boolean, 'student kind only';
  assert jsonb_typeof(public.mr_search('student', 'احمد')) = 'array', 'student search allowed';
  assert public.mr_search('staff', 'منسق')->>'error' = 'forbidden', 'staff search forbidden';
  assert public.mr_student_profile('40000000-0000-0000-0000-000000000001')->>'error' is null, 'student profile allowed';
  assert public.mr_staff_profile('30000000-0000-0000-0000-000000000002')->>'error' = 'forbidden', 'staff profile forbidden';
  assert public.mr_staff_extra('30000000-0000-0000-0000-000000000002')->>'error' = 'forbidden', 'staff extra forbidden';
  assert public.mr_log_export('staff', '30000000-0000-0000-0000-000000000002')->>'error' = 'forbidden', 'staff export forbidden';
  assert public.mr_log_export('student', '40000000-0000-0000-0000-000000000001')->>'error' is null, 'student export allowed';
end $$;
reset role;

-- 6) المطّلع المحوَّل: ملفات المعلمين فقط
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
set role authenticated;
do $$ begin
  assert public.mr_student_profile('40000000-0000-0000-0000-000000000001')->>'error' = 'forbidden', 'converted viewer lost student';
  assert public.mr_staff_profile('30000000-0000-0000-0000-000000000003')->>'error' is null, 'converted viewer keeps staff';
end $$;
reset role;

-- 7) منسق مرآة: يطّلع على النوعين ويدير، ولا يغيّر المنسقين
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005');
set role authenticated;
do $$ begin
  assert (public.mr_whoami()->>'manage')::boolean and (public.mr_whoami()->>'can_staff')::boolean and (public.mr_whoami()->>'can_student')::boolean, 'coordinator manages and sees both';
  assert (public.mr_perm_set('30000000-0000-0000-0000-000000000004', true, true)->>'student')::boolean, 'coordinator grants';
  assert public.mr_perm_set('30000000-0000-0000-0000-000000000004', true, true, true)->>'error' = 'admin_only', 'coordinator cannot appoint coordinator';
  assert public.mr_perm_set('30000000-0000-0000-0000-000000000005', true, true, false)->>'error' = 'admin_only', 'coordinator cannot remove himself';
  -- تعديل صلاحيات منسق دون تغيير المنسق يُبقي المنسق
  assert (public.mr_perm_set('30000000-0000-0000-0000-000000000005', true, false)->>'coord')::boolean, 'coord kept when null';
end $$;
reset role;

-- 8) الزائر المجهول لا يصل
set role anon;
do $$ begin perform public.mr_perm_set('30000000-0000-0000-0000-000000000003', true, true); raise exception 'anon reached mr_perm_set';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ALL 0403 TESTS PASSED';
