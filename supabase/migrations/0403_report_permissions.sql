-- مرآة | الملف الشامل · 0403 · صلاحيات المصرح لهم: تقرير المتعلم وتقرير المعلم، تُدار من لوحة تحكم مرآة.
-- دون جداول جديدة: الصلاحيات صفوف في جدول صلاحيات النواة (permissions / staff_permissions) كبقية الأنظمة.
--   mirat:view_student  تقرير المتعلم: البحث عن المتعلمين وفتح ملفاتهم الشاملة واستخراج تقاريرها
--   mirat:view_staff    تقرير المعلم: البحث عن منسوبي المدرسة وفتح ملفاتهم الشاملة واستخراج تقاريرها
--   mirat:approve       منسق مرآة: إدارة المصرح لهم (ويطّلع على النوعين)
-- يدير الصلاحيات: مدير النواة ومدير المدرسة ومنسق مرآة. تعيين المنسق نفسه لمدير النواة ومدير المدرسة فقط.
-- الصلاحية القديمة mirat:view تبقى تعني النوعين معاً، وتتحول إلى الصلاحيتين الجديدتين عند أول تعديل من اللوحة.
-- كل منح أو سحب يُسجَّل في سجل عمليات النواة (audit_logs). قابل لإعادة التنفيذ.

insert into public.permissions (code, system_code, level, name_ar) values
  ('mirat:view_student', 'mirat', 'view', 'مرآة | الملف الشامل: تقرير المتعلم'),
  ('mirat:view_staff', 'mirat', 'view', 'مرآة | الملف الشامل: تقرير المعلم'),
  ('mirat:approve', 'mirat', 'approve', 'مرآة | الملف الشامل: منسق (إدارة المصرح لهم)')
on conflict (code) do nothing;

-- ===== لوحة المصرح لهم =====
-- قائمة منسوبي المدرسة الفعّالين وصلاحياتهم في مرآة
create or replace function public.mr_perm_list() returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v jsonb;
begin
  if not public.mr_can_manage() then return jsonb_build_object('error', 'forbidden'); end if;
  select coalesce(jsonb_agg(r order by r.leader desc, r.coord desc, (r.student or r.staff) desc, r.name), '[]') into v from (
    select s.id, s.full_name name, coalesce(jt.name_ar, s.job_title) job, s.specialty,
      s.user_id is not null as has_account, coalesce(s.account_status, '') = 'active' and s.user_id is not null as account_active,
      public.mr__leader(s.id) leader,
      ('mirat:approve' = any (pc.codes)) or exists (select 1 from public.staff_roles r where r.staff_id = s.id and r.role_code = 'coordinator' and r.system_code = 'mirat' and r.ended_on is null) coord,
      ('mirat:view' = any (pc.codes)) legacy,
      ('mirat:view_student' = any (pc.codes) or 'mirat:view' = any (pc.codes)) student,
      ('mirat:view_staff' = any (pc.codes) or 'mirat:view' = any (pc.codes)) staff
    from public.staff_members s
    left join public.job_titles jt on jt.code = s.job_title
    left join lateral (select coalesce(array_agg(p.permission_code), '{}') codes from public.staff_permissions p where p.staff_id = s.id and p.permission_code like 'mirat:%') pc on true
    where s.is_active) r;
  return jsonb_build_object('staff', v, 'me', (select id from public.staff_members where user_id = auth.uid() and is_active limit 1),
    'is_admin', public.mr__flag('is_core_admin'));
end $$;

-- تعديل صلاحيات منسوب واحد. p_coord اختياري (null = دون تغيير)، وتعديله لمدير النواة ومدير المدرسة فقط.
create or replace function public.mr_perm_set(p_staff_id uuid, p_student boolean, p_staff boolean, p_coord boolean default null)
returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare old_codes text[]; new_codes text[]; was_coord boolean; adm boolean := public.mr__flag('is_core_admin'); c text;
begin
  if not public.mr_can_manage() then
    perform public.mr__log('DENIED', 'permissions', p_staff_id, '{"op":"perm_set"}'); return jsonb_build_object('error', 'forbidden'); end if;
  if p_student is null or p_staff is null then return jsonb_build_object('error', 'bad_request'); end if;
  if not exists (select 1 from public.staff_members where id = p_staff_id and is_active) then return jsonb_build_object('error', 'not_found'); end if;
  if public.mr__leader(p_staff_id) then return jsonb_build_object('error', 'leader'); end if;
  select coalesce(array_agg(permission_code order by permission_code), '{}') into old_codes
    from public.staff_permissions where staff_id = p_staff_id and permission_code like 'mirat:%';
  was_coord := 'mirat:approve' = any (old_codes);
  if p_coord is not null and p_coord <> was_coord and not adm then return jsonb_build_object('error', 'admin_only'); end if;

  new_codes := array_remove(array_remove(array_remove(array_remove(old_codes, 'mirat:view'), 'mirat:view_student'), 'mirat:view_staff'), 'mirat:approve');
  if p_student then new_codes := array_append(new_codes, 'mirat:view_student'); end if;
  if p_staff then new_codes := array_append(new_codes, 'mirat:view_staff'); end if;
  if coalesce(p_coord, was_coord) then new_codes := array_append(new_codes, 'mirat:approve'); end if;
  select coalesce(array_agg(x order by x), '{}') into new_codes from unnest(new_codes) x;

  if new_codes is distinct from old_codes then
    foreach c in array old_codes loop
      if not c = any (new_codes) then delete from public.staff_permissions where staff_id = p_staff_id and permission_code = c; end if; end loop;
    foreach c in array new_codes loop
      if not c = any (old_codes) then insert into public.staff_permissions (staff_id, permission_code) values (p_staff_id, c); end if; end loop;
    insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'PERMISSION', 'mirat.permissions', p_staff_id,
      jsonb_build_object('system', 'mirat', 'permissions', to_jsonb(old_codes)),
      jsonb_build_object('system', 'mirat', 'permissions', to_jsonb(new_codes), 'staff', public.mr__sn(p_staff_id)));
  end if;
  return jsonb_build_object('id', p_staff_id, 'student', 'mirat:view_student' = any (new_codes), 'staff', 'mirat:view_staff' = any (new_codes),
    'coord', 'mirat:approve' = any (new_codes), 'legacy', false, 'changed', new_codes is distinct from old_codes);
end $$;

revoke all on function public.mr_perm_list(),
  public.mr_perm_set(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.mr_perm_list(),
  public.mr_perm_set(uuid, boolean, boolean, boolean) to authenticated;
