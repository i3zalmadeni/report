-- مرآة | الملف الشامل · 0402 · تفاصيل إضافية لملف المعلم (دوال قراءة فقط، دون جداول جديدة).
-- 1) الخطط الذكية: قائمة البرامج نفسها محفوظة في موقع الخطط الذكية (DATA.progs)، والقاعدة تحفظ تعديلات المنسق
--    والتوثيقات وربط أسماء المنفذين بحساباتهم (sp_records). تعيد الدالة هذه السجلات وأسماء المنسوبين الفعّالين
--    لتطبّق الواجهة التعديلات فوق القائمة الأصلية بالطريقة نفسها التي يعمل بها موقع الخطط الذكية.
-- 2) التقويم الذاتي: إسنادات المؤشرات تفصيلياً (المجال، المعيار، نص المؤشر، الدور، الموعد، حالة التقييم، المستوى، الشواهد).
--    الإسناد عبر مجال كامل يُفصَّل إلى مؤشراته.

create or replace function public.mr_staff_extra(p_id uuid) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare sp jsonb; dir jsonb; se jsonb;
begin
  if not public.mr_can() then return jsonb_build_object('error', 'forbidden'); end if;
  if not exists (select 1 from public.staff_members where id = p_id) then return jsonb_build_object('error', 'not_found'); end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'col', r.col, 'data', r.data, 'at', public.mr__t(r.created_at)) order by r.created_at), '[]') into sp
      from public.sp_records r;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name)), '[]') into dir
      from public.staff_members s where s.is_active;
  exception when others then sp := null; dir := null;
  end;
  se := public.mr__sec('se_assign', 'evaluation', 'المؤشرات المسندة في التقويم الذاتي', 'التقويم الذاتي',
    '[["cyc","الدورة"],["dom","المجال"],["std","المعيار"],["ind","المؤشر"],["role","الدور"],["via","طريقة الإسناد"],["due","موعد الإنجاز"],["st","حالة التقييم"],["lvl","المستوى"],["pct","نسبة التحقق"],["evn","الشواهد"]]',
    $q$ select x.id::text || ':' || i.id::text id, public.mr__t(x.created_at) d, 'إسناد مؤشر' ev,
         concat_ws(' ', i.code, left(i.official_text, 160)) ds, coalesce(e.status, 'not_evaluated') st,
         cy.name cyc, concat_ws(' ', dm.code, dm.name_ar) dom, concat_ws(' ', sd.code, sd.name_ar) std,
         concat_ws(' — ', i.code, i.official_text) ind,
         case x.role_kind when 'responsible' then 'مسؤول المؤشر' when 'evaluator' then 'مقيّم المؤشر' else x.role_kind end role,
         x.via, x.due_date::text due, lv.label_ar lvl, e.achievement_pct::text pct,
         (select count(*) from public.se_evidence ev where ev.cycle_id = x.cycle_id
            and (ev.indicator_id = i.id or exists (select 1 from public.se_evidence_indicators l where l.evidence_id = ev.id and l.indicator_id = i.id)))::text evn
       from (select a.id, a.cycle_id, a.indicator_id, a.role_kind, a.due_date, a.created_at, 'مؤشر مباشر' via from public.se_indicator_assignments a where a.staff_id = $1
             union all
             select a.id, a.cycle_id, i2.id, a.role_kind, null::date, a.created_at, 'ضمن مجال' from public.se_domain_assignments a
               join public.se_standards s2 on s2.domain_id = a.domain_id join public.se_indicators i2 on i2.standard_id = s2.id where a.staff_id = $1) x
       join public.se_indicators i on i.id = x.indicator_id
       join public.se_standards sd on sd.id = i.standard_id join public.se_domains dm on dm.id = sd.domain_id
       left join public.se_cycles cy on cy.id = x.cycle_id
       left join public.se_evaluations e on e.cycle_id = x.cycle_id and e.indicator_id = i.id
       left join public.se_levels lv on lv.id = e.level_id $q$, p_id, true,
    'من جداول إسناد المجالات والمؤشرات في نظام التقويم الذاتي. الإسناد عبر مجال كامل مُفصَّل إلى مؤشراته.');
  return jsonb_build_object('sp', case when sp is null then null else jsonb_build_object('records', sp, 'staff', dir) end,
    'sp_error', case when sp is null then 'تعذرت قراءة سجلات الخطط الذكية' end, 'sections', jsonb_build_array(se));
end $$;

revoke all on function public.mr_staff_extra(uuid) from public, anon;
grant execute on function public.mr_staff_extra(uuid) to authenticated;
