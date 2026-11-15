-- مرآة | الملف الشامل · 0405 · إشعارات شريط المستخدم (قراءة فقط من audit_logs).
-- لكل منسوب: تعديلات صلاحياته في مرآة. ولمدير النواة ومدير المدرسة ومنسق مرآة أيضاً: آخر العمليات من غيرهم
-- (اطلاع، تصدير، رفض وصول، تعديل صلاحيات)، و«مشاهدة الكل» تفتح سجلات المشاهدة. قابل لإعادة التنفيذ.
create or replace function public.mr_my_notifications(p_limit int default 20) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare me uuid; mg boolean := public.mr_can_manage(); lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  select id into me from public.staff_members where user_id = auth.uid() and is_active;
  if me is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
    select a.id, to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') at, a.action, split_part(a.table_name, '.', 2) kind,
      coalesce(sa.full_name, 'مستخدم') actor, a.record_id target_id,
      coalesce(st.full_name, sm.full_name, a.new_data->>'staff') target,
      a.old_data->'permissions' old, a.new_data->'permissions' new, a.new_data->>'op' op,
      (split_part(a.table_name, '.', 2) = 'permissions' and a.record_id = me) mine
    from public.audit_logs a
    left join public.staff_members sa on sa.user_id = a.actor_id
    left join public.students st on split_part(a.table_name, '.', 2) = 'student' and st.id = a.record_id
    left join public.staff_members sm on split_part(a.table_name, '.', 2) in ('staff', 'permissions') and sm.id = a.record_id
    where a.table_name like 'mirat.%' and a.actor_id is distinct from auth.uid()
      and ((a.table_name = 'mirat.permissions' and a.action = 'PERMISSION' and a.record_id = me) or mg)
    order by a.created_at desc limit lim) x);
end $$;
revoke all on function public.mr_my_notifications(int) from public, anon;
grant execute on function public.mr_my_notifications(int) to authenticated;
