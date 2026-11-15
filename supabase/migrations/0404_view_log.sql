-- مرآة | الملف الشامل · 0404 · سجلات المشاهدة: من اطّلع على أي ملف، ومتى، ومن صدّر تقريراً، ومن رُفض وصوله، وتعديلات الصلاحيات.
-- قراءة فقط من سجل عمليات النواة الموجود (audit_logs، الأسطر التي يكتبها مرآة: table_name = 'mirat.*'). دون جداول جديدة.
-- الاطلاع على السجل: مدير النواة ومدير المدرسة ومنسق مرآة. قابل لإعادة التنفيذ.

-- p_actor: معرّف المنسوب المستخدم (اختياري). p_action: VIEW | EXPORT | DENIED | PERMISSION. p_kind: student | staff | permissions.
-- p_q: جزء من اسم المستخدم أو اسم صاحب الملف. التواريخ بتوقيت الرياض.
create or replace function public.mr_audit_list(p_actor uuid default null, p_action text default null, p_kind text default null, p_q text default null,
  p_from date default null, p_to date default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare lim int := least(greatest(coalesce(p_limit, 50), 1), 200); off int := greatest(coalesce(p_offset, 0), 0);
  q text := nullif(public.mr__norm(btrim(coalesce(p_q, ''))), ''); v jsonb;
begin
  if not public.mr_can_manage() then return jsonb_build_object('error', 'forbidden'); end if;
  with l as (
    select a.id, a.created_at at_, sa.id actor, coalesce(sa.full_name, 'حساب غير مرتبط بمنسوب') actor_name, coalesce(jt.name_ar, sa.job_title) actor_job,
      a.action, split_part(a.table_name, '.', 2) kind, a.record_id target,
      coalesce(st.full_name, sm.full_name, a.new_data->>'staff') target_name,
      case when split_part(a.table_name, '.', 2) = 'student' then (select concat_ws(' · ', gl.name_ar, 'فصل ' || cs.name) from public.student_enrollments e
          left join public.academic_years ay on ay.id = e.year_id left join public.grade_levels gl on gl.code = e.grade_code left join public.class_sections cs on cs.id = e.section_id
          where e.student_id = a.record_id order by (ay.status = 'current') desc nulls last, ay.starts_on desc nulls last limit 1)
        else coalesce(jm.name_ar, sm.job_title) end target_info,
      a.new_data->>'op' op, a.old_data->'permissions' old_p, a.new_data->'permissions' new_p
    from public.audit_logs a
    left join public.staff_members sa on sa.user_id = a.actor_id
    left join public.job_titles jt on jt.code = sa.job_title
    left join public.students st on split_part(a.table_name, '.', 2) = 'student' and st.id = a.record_id
    left join public.staff_members sm on split_part(a.table_name, '.', 2) in ('staff', 'permissions') and sm.id = a.record_id
    left join public.job_titles jm on jm.code = sm.job_title
    where a.table_name like 'mirat.%'
      and (p_actor is null or sa.id = p_actor)
      and (p_action is null or a.action = p_action)
      and (p_kind is null or split_part(a.table_name, '.', 2) = p_kind)
      and (p_from is null or (a.created_at at time zone 'Asia/Riyadh')::date >= p_from)
      and (p_to is null or (a.created_at at time zone 'Asia/Riyadh')::date <= p_to)
      and (q is null or public.mr__norm(coalesce(sa.full_name, '') || ' ' || coalesce(st.full_name, sm.full_name, a.new_data->>'staff', '')) like '%' || q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from l),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'at', public.mr__t(x.at_), 'actor_id', x.actor, 'actor', x.actor_name, 'actor_job', x.actor_job,
        'action', x.action, 'kind', x.kind, 'target_id', x.target, 'target', x.target_name, 'target_info', x.target_info, 'op', x.op,
        'self', x.kind = 'staff' and x.actor = x.target, 'old', x.old_p, 'new', x.new_p) order by x.at_ desc, x.id), '[]')
      from (select * from l order by at_ desc, id limit lim offset off) x),
    -- ملخص لكل مستخدم ضمن التصفية الحالية
    'by_user', (select coalesce(jsonb_agg(u order by u.last desc), '[]') from (
      select actor id, actor_name name, actor_job job, count(*) filter (where action = 'VIEW') views, count(*) filter (where action = 'EXPORT') exports,
        count(*) filter (where action = 'DENIED') denied, count(distinct target) filter (where action in ('VIEW', 'EXPORT')) files, public.mr__t(max(at_)) last
      from l group by actor, actor_name, actor_job) u),
    'limit', lim, 'offset', off) into v;
  -- المستخدمون الذين لهم أي سطر في السجل (لقائمة التصفية)، دون تقييد بالتصفية
  v := v || jsonb_build_object('users', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.full_name) order by x.full_name), '[]')
    from (select distinct s.id, s.full_name from public.audit_logs a join public.staff_members s on s.user_id = a.actor_id where a.table_name like 'mirat.%') x));
  return v;
end $$;

revoke all on function public.mr_audit_list(uuid, text, text, text, date, date, int, int) from public, anon;
grant execute on function public.mr_audit_list(uuid, text, text, text, date, date, int, int) to authenticated;
