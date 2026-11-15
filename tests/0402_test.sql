-- اختبارات تفاصيل ملف المعلم (0402)
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin assert public.mr_staff_extra('30000000-0000-0000-0000-000000000002')->>'error' = 'forbidden', 'teacher forbidden on another file'; end $$;
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
do $$ declare x jsonb; s jsonb; begin
  x := public.mr_staff_extra('30000000-0000-0000-0000-000000000003');
  s := x->'sections'->0;
  assert s->>'status' = 'ok', 'se ok: ' || s::text;
  assert jsonb_array_length(s->'rows') = 3, 'direct indicator + 2 via domain: ' || s::text;
  assert (select count(*) from jsonb_array_elements(s->'rows') r where r->>'via' = 'ضمن مجال' and r->>'role' = 'مقيّم المؤشر') = 2, 'domain expansion';
  assert (select count(*) from jsonb_array_elements(s->'rows') r where r->>'lvl' = 'التقدم' and r->>'pct' = '80' and r->>'evn' = '1' and r->>'st' = 'approved') = 1, 'evaluation details';
  assert (select count(*) from jsonb_array_elements(s->'rows') r where r->>'st' = 'not_evaluated' and r->>'due' = '2026-12-15' and r->>'std' = '1.1 القيادة') = 1, 'direct assignment details';
  assert jsonb_array_length(x->'sp'->'records') = 4 and jsonb_array_length(x->'sp'->'staff') = 4, 'sp records + staff dir';
  assert public.mr_staff_extra(gen_random_uuid())->>'error' = 'not_found';
end $$;
reset role;
set role anon;
do $$ begin perform public.mr_staff_extra('30000000-0000-0000-0000-000000000003'); raise exception 'anon reached';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ALL 0402 TESTS PASSED';
