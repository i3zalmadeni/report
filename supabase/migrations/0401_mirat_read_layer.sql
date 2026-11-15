-- مرآة | الملف الشامل · 0401 · طبقة القراءة والربط.
-- دوال فقط: لا جداول جديدة، ولا نسخ للبيانات، ولا كتابة على جداول الأنظمة المصدر.
-- الكتابة الوحيدة: سطر في سجل العمليات الموجود في النواة (audit_logs) عند الاطلاع أو التصدير أو رفض الوصول.
-- كل قسم يُقرأ في كتلة مستقلة: تعذّر مصدرٍ ما يظهر في قسمه بوضوح ولا يُسقط بقية الملف.
-- الربط بالمعرّف الثابت في النواة (students.id وstaff_members.id)، وليس بالاسم. قابل لإعادة التنفيذ.

-- ===== أدوات داخلية (غير متاحة للمستخدمين) =====
create or replace function public.mr__t(p timestamptz) returns text language sql stable set search_path to '' as $$
  select to_char(p at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') $$;

create or replace function public.mr__sn(p uuid) returns text language sql stable security definer set search_path to '' as $$
  select full_name from public.staff_members where id = p $$;

-- توحيد الكتابة العربية للبحث: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والتطويل
create or replace function public.mr__norm(p text) returns text language sql immutable set search_path to '' as $$
  select regexp_replace(translate(lower(coalesce(p, '')), 'أإآٱىة', 'ااااي' || 'ه'), '[ً-ْـ]', '', 'g') $$;

-- قراءة صلاحية من نظام آخر دون أن يُسقط غيابُ الدالة الملفَّ كله
create or replace function public.mr__flag(p_fn text, p_arg text default null) returns boolean language plpgsql stable security definer set search_path to '' as $$
declare v boolean;
begin
  if p_arg is null then execute format('select public.%I()', p_fn) into v;
  else execute format('select public.%I($1)', p_fn) into v using p_arg; end if;
  return coalesce(v, false);
exception when others then return false;
end $$;

-- قسم واحد من الملف: يقرأ استعلاماً ثابتاً معرّفاً في هذا الملف (SELECT فقط، ضمن استعلام فرعي فلا يقبل أي تعديل)
-- الحالة: ok | restricted (لا يملك المستخدم صلاحية المصدر) | unavailable (المصدر غير موجود) | error (تعذرت القراءة)
create or replace function public.mr__sec(p_key text, p_grp text, p_title text, p_sys text, p_cols jsonb, p_sql text, p_id uuid,
  p_allowed boolean default true, p_note text default null) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v jsonb; base jsonb := jsonb_build_object('key', p_key, 'grp', p_grp, 'title', p_title, 'system', p_sys, 'cols', p_cols, 'note', p_note);
begin
  if not p_allowed then return base || jsonb_build_object('status', 'restricted', 'rows', '[]'::jsonb); end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(q) order by q.d desc nulls last, q.id), ''[]''::jsonb) from (%s) q', p_sql) into v using p_id;
  return base || jsonb_build_object('status', 'ok', 'rows', v);
exception
  when undefined_table or undefined_column or undefined_function then
    return base || jsonb_build_object('status', 'unavailable', 'rows', '[]'::jsonb, 'error', 'المصدر غير متاح في القاعدة حالياً');
  when others then
    return base || jsonb_build_object('status', 'error', 'rows', '[]'::jsonb, 'error', 'تعذرت القراءة من المصدر (' || sqlstate || ')');
end $$;

-- تسجيل الاطلاع والتصدير ورفض الوصول في سجل عمليات النواة الموجود
create or replace function public.mr__log(p_action text, p_kind text, p_id uuid, p_extra jsonb default '{}') returns void language sql volatile security definer set search_path to '' as $$
  insert into public.audit_logs (actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), p_action, 'mirat.' || p_kind, p_id, jsonb_build_object('system', 'mirat') || coalesce(p_extra, '{}')) $$;

revoke all on function public.mr__t(timestamptz), public.mr__sn(uuid), public.mr__norm(text), public.mr__flag(text, text),
  public.mr__sec(text, text, text, text, jsonb, text, uuid, boolean, text), public.mr__log(text, text, uuid, jsonb) from public, anon, authenticated;

-- ===== الصلاحية =====
-- الاطلاع نوعان مستقلان: ملفات المتعلمين (mirat:view_student) وملفات المعلمين (mirat:view_staff)، تُمنحان من لوحة «المصرح لهم» (0403).
-- مدير النواة ومدير المدرسة ومنسق مرآة يطّلعون على النوعين. الصلاحية القديمة mirat:view تعني النوعين. الحساب يجب أن يكون فعّالاً.
-- قيادة المدرسة (مدير النواة أو مدير المدرسة) لمنسوب محدد
create or replace function public.mr__leader(p_staff uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.staff_roles r where r.staff_id = p_staff and r.role_code in ('core_admin','principal') and r.ended_on is null) $$;

-- إدارة المصرح لهم: مدير النواة ومدير المدرسة ومنسق مرآة (صلاحية mirat:approve أو دور منسق على النظام)
create or replace function public.mr_can_manage() returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and is_active)
     and (public.mr__flag('is_core_admin') or public.mr__flag('core_can', 'mirat:approve')
       or exists (select 1 from public.staff_members s join public.staff_roles r on r.staff_id = s.id
                  where s.user_id = auth.uid() and r.role_code = 'coordinator' and r.system_code = 'mirat' and r.ended_on is null)) $$;

-- الاطلاع على نوع من الملفات: student أو staff
create or replace function public.mr_can_kind(p_kind text) returns boolean language sql stable security definer set search_path to '' as $$
  select p_kind in ('student', 'staff')
     and exists (select 1 from public.staff_members where user_id = auth.uid() and is_active)
     and (public.mr_can_manage() or public.mr__flag('core_can', 'mirat:view') or public.mr__flag('core_can', 'mirat:view_' || p_kind)) $$;

-- الدخول إلى المنصة: من يملك أحد النوعين على الأقل
create or replace function public.mr_can() returns boolean language sql stable security definer set search_path to '' as $$
  select public.mr_can_kind('student') or public.mr_can_kind('staff') $$;

create or replace function public.mr_whoami() returns jsonb language sql stable security definer set search_path to '' as $$
  select case when s.id is null then null else jsonb_build_object(
    'staff_id', s.id, 'name', s.full_name, 'can', public.mr_can(), 'is_admin', public.mr__flag('is_core_admin'),
    'can_student', public.mr_can_kind('student'), 'can_staff', public.mr_can_kind('staff'), 'manage', public.mr_can_manage(),
    'students_basic', public.mr__flag('core_can', 'students:view'), 'students_contact', public.mr__flag('core_can', 'students_contact:view'),
    'staff_basic', public.mr__flag('core_can', 'personnel:view'), 'staff_contact', public.mr__flag('core_can', 'personnel_contact:view'),
    'guidance', public.mr__flag('is_core_admin') or public.mr__flag('qm_is_support'),
    'excuses', public.mr__flag('is_core_admin') or public.mr__flag('ind_can_oversee')) end
  from (select 1) x left join public.staff_members s on s.user_id = auth.uid() and s.is_active $$;


-- ===== البحث الموحد =====
create or replace function public.mr_search(p_kind text, p_q text, p_limit int default 20) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare q text := public.mr__norm(btrim(p_q)); lim int := least(greatest(coalesce(p_limit, 20), 1), 50); v jsonb;
begin
  if not public.mr_can_kind(p_kind) then return jsonb_build_object('error', case when p_kind in ('student', 'staff') then 'forbidden' else 'bad_request' end); end if;
  if length(q) < 2 then return '[]'::jsonb; end if;
  if p_kind = 'student' then
    select coalesce(jsonb_agg(r order by r.rank, r.name), '[]') into v from (
      select s.id, s.full_name name, s.student_no no, s.study_status status, gl.name_ar grade, cs.name section, y.name as year,
        case when s.student_no = btrim(p_q) then 0 when public.mr__norm(s.full_name) like q || '%' then 1 else 2 end rank
      from public.students s
      left join lateral (select e.* from public.student_enrollments e left join public.academic_years ay on ay.id = e.year_id
        where e.student_id = s.id order by (ay.status = 'current') desc nulls last, ay.starts_on desc nulls last, e.started_on desc nulls last limit 1) e on true
      left join public.grade_levels gl on gl.code = e.grade_code left join public.class_sections cs on cs.id = e.section_id
      left join public.academic_years y on y.id = e.year_id
      where public.mr__norm(s.full_name) like '%' || q || '%' or s.student_no like btrim(p_q) || '%'
      order by rank, s.full_name limit lim) r;
  elsif p_kind = 'staff' then
    select coalesce(jsonb_agg(r order by r.rank, r.name), '[]') into v from (
      select s.id, s.full_name name, case when public.mr__flag('core_can', 'personnel:view') then p.employee_no end no,
        coalesce(jt.name_ar, s.job_title) job, s.specialty, s.is_active active,
        case when p.employee_no = btrim(p_q) then 0 when public.mr__norm(s.full_name) like q || '%' then 1 else 2 end rank
      from public.staff_members s left join public.staff_private p on p.staff_id = s.id left join public.job_titles jt on jt.code = s.job_title
      where public.mr__norm(s.full_name) like '%' || q || '%'
         or (public.mr__flag('core_can', 'personnel:view') and p.employee_no like btrim(p_q) || '%')
      order by rank, s.full_name limit lim) r;
  else return jsonb_build_object('error', 'bad_request'); end if;
  return v;
end $$;

-- ===== ملف المتعلم =====
create or replace function public.mr_student_profile(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare v_p jsonb; v_s jsonb := '[]'; adm boolean; sup boolean; ovs boolean; basic boolean; contact boolean; c jsonb;
begin
  if not public.mr_can_kind('student') then perform public.mr__log('DENIED', 'student', p_id); return jsonb_build_object('error', 'forbidden'); end if;
  adm := public.mr__flag('is_core_admin');
  sup := adm or public.mr__flag('qm_is_support');
  ovs := adm or public.mr__flag('ind_can_oversee');
  basic := public.mr__flag('core_can', 'students:view');
  contact := public.mr__flag('core_can', 'students_contact:view');

  select jsonb_build_object('id', s.id, 'no', s.student_no, 'name', s.full_name, 'status', s.study_status, 'enrollment_type', s.enrollment_type,
      'first_enrolled_on', s.first_enrolled_on, 'exit_on', s.exit_on, 'exit_note', s.exit_note,
      'birth_date', case when basic then s.birth_date end, 'nationality', case when basic then s.nationality end,
      'grade', gl.name_ar, 'section', cs.name, 'year', y.name, 'year_status', y.status)
    into v_p
  from public.students s
  left join lateral (select e.* from public.student_enrollments e left join public.academic_years ay on ay.id = e.year_id
    where e.student_id = s.id order by (ay.status = 'current') desc nulls last, ay.starts_on desc nulls last, e.started_on desc nulls last limit 1) e on true
  left join public.grade_levels gl on gl.code = e.grade_code left join public.class_sections cs on cs.id = e.section_id
  left join public.academic_years y on y.id = e.year_id
  where s.id = p_id;
  if v_p is null then return jsonb_build_object('error', 'not_found'); end if;

  if contact then
    begin
      select jsonb_build_object('phone', sp.phone, 'address', sp.address,
        'guardians', coalesce((select jsonb_agg(jsonb_build_object('name', g.full_name, 'relation', sg.relation, 'phone', g.phone, 'primary', sg.is_primary) order by sg.is_primary desc nulls last)
          from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = p_id), '[]'))
        into c from (select 1) x left join public.student_private sp on sp.student_id = p_id;
      v_p := v_p || jsonb_build_object('contact', c);
    exception when others then v_p := v_p || jsonb_build_object('contact_error', 'تعذرت قراءة بيانات التواصل');
    end;
  end if;

  v_s := jsonb_build_array(
  public.mr__sec('enroll', 'study', 'السجل الدراسي والصف والفصل', 'النواة الرقمية',
    '[["yr","العام الدراسي"],["grade","الصف"],["sec","الفصل"],["st","الحالة"],["from_d","من"],["to_d","إلى"]]',
    $q$ select e.id, coalesce(e.started_on, y.starts_on, e.created_at::date)::text d, 'قيد دراسي' ev,
         concat_ws(' · ', y.name, gl.name_ar, cs.name) ds, e.status st, y.name yr, coalesce(gl.name_ar, e.grade_code) grade, cs.name sec,
         e.started_on::text from_d, e.ended_on::text to_d
       from public.student_enrollments e left join public.academic_years y on y.id = e.year_id
       left join public.grade_levels gl on gl.code = e.grade_code left join public.class_sections cs on cs.id = e.section_id
       where e.student_id = $1 $q$, p_id),
  public.mr__sec('attendance', 'discipline', 'سجل الحضور والغياب', 'انضباطي',
    '[["d","التاريخ"],["st","الحالة"],["sec","الفصل"],["by","المُدخل"]]',
    $q$ select r.id, r.day::text d, case when r.status = 'present' then 'حضور' else 'غياب' end ev, cs.name ds, r.status st,
         cs.name sec, public.mr__sn(r.recorded_by) by
       from public.ind_attendance_records r left join public.class_sections cs on cs.id = r.section_id where r.student_id = $1 $q$, p_id,
    true, 'يحفظ انضباطي حالات الغياب، ويُعد الطالب حاضراً في الأيام المثبتة الأخرى.'),
  public.mr__sec('lateness', 'discipline', 'سجل التأخر الصباحي', 'انضباطي',
    '[["d","التاريخ"],["arr","وقت الوصول"],["mins","دقائق التأخر"],["reason","السبب"],["st","الحالة"],["by","المُدخل"]]',
    $q$ select l.id, l.day::text d, 'تأخر صباحي' ev, concat_ws(' — ', rr.name, nullif(l.reason_text, '')) ds,
         case when l.voided_at is null then 'recorded' else 'voided' end st, to_char(l.arrival_time, 'HH24:MI') arr, l.minutes::text mins,
         concat_ws(' — ', rr.name, nullif(l.reason_text, '')) reason, public.mr__sn(l.recorded_by) by, l.void_reason
       from public.ind_lateness_records l left join public.ind_lateness_reasons rr on rr.id = l.reason_id where l.student_id = $1 $q$, p_id),
  public.mr__sec('excuses', 'discipline', 'أعذار الغياب', 'انضباطي',
    '[["d","يوم الغياب"],["reason","العذر"],["st","الحالة"],["sub","تاريخ التقديم"],["note","ملاحظة المراجعة"]]',
    $q$ select x.id, x.day::text d, 'عذر غياب' ev, x.reason ds, x.status st, x.reason, public.mr__t(x.submitted_at) sub, x.review_note note
       from public.ind_excuses x where x.student_id = $1 $q$, p_id, ovs, 'تفاصيل الأعذار متاحة لمنسق الغياب وشؤون الطلاب وفق صلاحيات انضباطي.'),
  public.mr__sec('escalations', 'discipline', 'الإجراءات النظامية للغياب', 'انضباطي',
    '[["d","التاريخ"],["rule","الإجراء"],["days","عدد الأيام"],["st","الحالة"]]',
    $q$ select e.id, public.mr__t(e.created_at) d, 'إجراء نظامي' ev, r.label ds, e.status st, r.label rule, e.days_count::text days
       from public.ind_escalation_records e left join public.ind_escalation_rules r on r.id = e.rule_id where e.student_id = $1 $q$, p_id),
  public.mr__sec('notifications', 'discipline', 'إشعارات ولي الأمر', 'انضباطي',
    '[["d","التاريخ"],["kind","نوع الإشعار"],["st","الحالة"]]',
    $q$ select n.id, public.mr__t(n.created_at) d, 'إشعار ولي أمر' ev, n.kind ds, n.status st, n.kind
       from public.ind_notifications n where n.student_id = $1 $q$, p_id),
  public.mr__sec('rewards', 'discipline', 'نقاط الانتظام', 'انضباطي',
    '[["d","بداية الأسبوع"],["pts","النقاط"],["st","الحالة"]]',
    $q$ select t.id, t.week_start::text d, 'نقاط انتظام' ev, 'أسبوع كامل دون غياب' ds, t.status st, t.points::text pts
       from public.ind_reward_transactions t where t.student_id = $1 $q$, p_id),
  public.mr__sec('reinforcements', 'values', 'سجل القيم والتعزيز', 'قيمي',
    '[["d","التاريخ"],["type","نوع التعزيز"],["ds","الوصف"],["pts","النقاط"],["by","المعلم"],["st","الحالة"]]',
    $q$ select r.id, public.mr__t(r.created_at) d, 'تعزيز' ev, concat_ws(' — ', t.name_ar, nullif(r.description, '')) ds,
         case when r.voided_at is null then 'active' else 'voided' end st, t.name_ar type, r.points::text pts, public.mr__sn(r.given_by) by, r.void_reason
       from public.qm_reinforcements r left join public.qm_reinforcement_types t on t.id = r.type_id where r.student_id = $1 $q$, p_id),
  public.mr__sec('badges', 'values', 'الأوسمة', 'قيمي',
    '[["d","التاريخ"],["badge","الوسام"],["note","ملاحظة"],["by","المانح"],["st","الحالة"]]',
    $q$ select b.id, public.mr__t(b.created_at) d, 'وسام' ev, g.name_ar ds, case when b.revoked_at is null then 'active' else 'revoked' end st,
         g.name_ar badge, b.note, public.mr__sn(b.awarded_by) by
       from public.qm_student_badges b left join public.qm_badges g on g.id = b.badge_id where b.student_id = $1 $q$, p_id),
  public.mr__sec('positive', 'values', 'السلوك الإيجابي', 'قيمي',
    '[["d","التاريخ"],["cat","التصنيف"],["ds","الوصف"],["by","المسجّل"]]',
    $q$ select p.id, public.mr__t(p.created_at) d, 'سلوك إيجابي' ev, concat_ws(' — ', c.name_ar, nullif(p.description, '')) ds, null::text st,
         c.name_ar cat, public.mr__sn(p.recorded_by) by
       from public.qm_positive_records p left join public.qm_behavior_categories c on c.id = p.category_id where p.student_id = $1 $q$, p_id),
  public.mr__sec('points', 'values', 'دفتر النقاط', 'قيمي',
    '[["d","التاريخ"],["kind","نوع القيد"],["reason","البيان"],["pts","النقاط"]]',
    $q$ select l.id, public.mr__t(l.created_at) d, 'قيد نقاط' ev, l.reason ds, l.kind st, l.kind, l.reason, l.points::text pts, l.points n,
         (l.source_id is not null and l.source_type in ('reinforcement', 'badge', 'indibati_week')) dup
       from public.qm_points_ledger l where l.student_id = $1 $q$, p_id),
  public.mr__sec('incidents', 'guidance', 'سجل الحالات السلوكية', 'قيمي',
    '[["d","التاريخ"],["no","الرقم"],["cat","التصنيف"],["loc","المكان"],["st","الحالة"],["by","الراصد"]]',
    $q$ select i.id, i.occurred_on::text d, 'حالة سلوكية' ev, concat_ws(' — ', c.name_ar, nullif(i.description, '')) ds, coalesce(s.name_ar, i.status) st,
         i.no::text no, c.name_ar cat, i.location loc, public.mr__sn(i.reported_by) by
       from public.qm_incidents i left join public.qm_behavior_categories c on c.id = i.category_id
       left join public.qm_incident_statuses s on s.code = i.status where i.student_id = $1 $q$, p_id, sup, 'متاحة لوكيل شؤون الطلاب والموجه الطلابي وفق صلاحيات قيمي.'),
  public.mr__sec('incident_events', 'guidance', 'الإجراءات التربوية على الحالات', 'قيمي',
    '[["d","التاريخ"],["no","رقم الحالة"],["kind","الإجراء"],["ds","التفاصيل"],["by","المنفذ"]]',
    $q$ select ev.id, public.mr__t(ev.created_at) d, 'إجراء تربوي' ev, concat_ws(' — ', ev.kind, nullif(ev.note, '')) ds,
         ev.to_status st, i.no::text no, ev.kind, public.mr__sn(ev.actor_id) by
       from public.qm_incident_events ev join public.qm_incidents i on i.id = ev.incident_id where i.student_id = $1 $q$, p_id, sup),
  public.mr__sec('support_cases', 'guidance', 'برامج التدخل والمتابعة', 'قيمي',
    '[["d","البداية"],["no","الرقم"],["type","النوع"],["goal","الهدف"],["owner","المسؤول"],["st","الحالة"],["result","النتيجة"]]',
    $q$ select c.id, coalesce(c.started_on, c.created_at::date)::text d, 'برنامج تدخل' ev, concat_ws(' — ', t.name_ar, nullif(c.need_description, '')) ds,
         c.status st, c.no::text no, t.name_ar type, c.goal, public.mr__sn(c.owner_id) owner, c.result
       from public.qm_support_cases c left join public.qm_support_types t on t.id = c.type_id where c.student_id = $1 $q$, p_id, sup),
  public.mr__sec('support_plans', 'guidance', 'الخطط الإرشادية', 'قيمي',
    '[["d","التاريخ"],["title","الخطة"],["strat","الاستراتيجيات"],["review","موعد المراجعة"]]',
    $q$ select p.id, public.mr__t(p.created_at) d, 'خطة إرشادية' ev, p.title ds, null::text st, p.title, p.strategies strat, p.review_on::text review
       from public.qm_support_plans p join public.qm_support_cases c on c.id = p.case_id where c.student_id = $1 $q$, p_id, sup),
  public.mr__sec('progress', 'guidance', 'سجل التقدم والتحسن السلوكي', 'قيمي',
    '[["d","التاريخ"],["kind","نوع المتابعة"],["ds","الملاحظة"],["imp","مستوى التحسن"],["by","المتابع"]]',
    $q$ select e.id, public.mr__t(e.created_at) d, 'متابعة وتحسن' ev, concat_ws(' — ', e.kind, nullif(e.note, '')) ds, null::text st,
         e.kind, e.improvement::text imp, public.mr__sn(e.actor_id) by
       from public.qm_support_events e join public.qm_support_cases c on c.id = e.case_id where c.student_id = $1 $q$, p_id, sup),
  public.mr__sec('achievements', 'achievements', 'الإنجازات', 'قيمي',
    '[["d","التاريخ"],["title","الإنجاز"],["cat","المجال"],["level","المستوى"],["org","الجهة"],["st","الحالة"]]',
    $q$ select a.id, coalesce(a.achieved_on, a.created_at::date)::text d, 'إنجاز' ev, a.title ds, a.status st, a.title, c.name_ar cat, a.level, a.organizer org
       from public.qm_achievement_students x join public.qm_achievements a on a.id = x.achievement_id
       left join public.qm_achievement_categories c on c.id = a.category_id where x.student_id = $1 $q$, p_id),
  public.mr__sec('talents', 'achievements', 'المواهب', 'قيمي',
    '[["d","تاريخ الرصد"],["field","المجال"],["name","الموهبة"],["by","الراصد"]]',
    $q$ select t.id, public.mr__t(t.created_at) d, 'رصد موهبة' ev, concat_ws(' — ', t.field, t.name) ds, case when t.is_active then 'active' else 'inactive' end st,
         t.field, t.name, public.mr__sn(t.noted_by) by
       from public.qm_talents t where t.student_id = $1 $q$, p_id)
  );

  perform public.mr__log('VIEW', 'student', p_id);
  return jsonb_build_object('kind', 'student', 'person', v_p, 'sections', v_s, 'generated_at', public.mr__t(now()));
end $$;

-- ===== ملف المعلم (المنسوب) =====
create or replace function public.mr_staff_profile(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path to '' as $$
declare v_p jsonb; v_s jsonb; basic boolean; contact boolean; c jsonb;
begin
  if not public.mr_can_kind('staff') then perform public.mr__log('DENIED', 'staff', p_id); return jsonb_build_object('error', 'forbidden'); end if;
  basic := public.mr__flag('core_can', 'personnel:view');
  contact := public.mr__flag('core_can', 'personnel_contact:view');

  select jsonb_build_object('id', s.id, 'name', s.full_name, 'category', coalesce(sc.name_ar, s.category), 'job', coalesce(jt.name_ar, s.job_title),
      'specialty', s.specialty, 'qualification', s.qualification, 'department', s.department, 'employment_status', s.employment_status,
      'joined_on', s.joined_on, 'account_status', s.account_status, 'active', s.is_active,
      'no', case when basic then p.employee_no end)
    into v_p
  from public.staff_members s left join public.staff_private p on p.staff_id = s.id
  left join public.job_titles jt on jt.code = s.job_title left join public.staff_categories sc on sc.code = s.category
  where s.id = p_id;
  if v_p is null then return jsonb_build_object('error', 'not_found'); end if;

  if contact then
    select jsonb_build_object('phone', p.phone, 'email', p.email) into c from public.staff_private p where p.staff_id = p_id;
    v_p := v_p || jsonb_build_object('contact', coalesce(c, '{}'));
  end if;
  begin
    select jsonb_build_object('headline', headline, 'bio', bio, 'experience_years', experience_years, 'subjects', subjects, 'grades', grades,
        'strengths', strengths, 'development_areas', development_areas, 'goals', goals,
        'skills', array_remove(array_cat(array_cat(array_cat(coalesce(skills_pedagogical, '{}'), coalesce(skills_digital, '{}')), array_cat(coalesce(skills_specialty, '{}'), coalesce(skills_leadership, '{}'))), array_cat(coalesce(skills_collab, '{}'), coalesce(skills_ai, '{}'))), null))
      into c from public.pc_profiles where staff_id = p_id;
    if c is not null then v_p := v_p || jsonb_build_object('pro', c); end if;
  exception when others then v_p := v_p || jsonb_build_object('pro_error', 'تعذرت قراءة الملف المهني من مجتمع لبيد المهني');
  end;

  v_s := jsonb_build_array(
  public.mr__sec('positions', 'job', 'التاريخ الوظيفي', 'النواة الرقمية',
    '[["from_d","من"],["to_d","إلى"],["job","المسمى"],["cat","الفئة"],["note","ملاحظة"]]',
    $q$ select h.id, coalesce(h.started_on, h.created_at::date)::text d, 'تكليف وظيفي' ev, coalesce(jt.name_ar, h.job_title) ds,
         case when h.ended_on is null then 'current' else 'ended' end st, coalesce(jt.name_ar, h.job_title) job, coalesce(sc.name_ar, h.category) cat,
         h.started_on::text from_d, h.ended_on::text to_d, h.note
       from public.staff_position_history h left join public.job_titles jt on jt.code = h.job_title
       left join public.staff_categories sc on sc.code = h.category where h.staff_id = $1 $q$, p_id),
  public.mr__sec('years', 'job', 'السجل السنوي', 'النواة الرقمية',
    '[["yr","العام الدراسي"],["job","المسمى"],["dept","القسم"],["emp","حالة التوظيف"]]',
    $q$ select r.id, coalesce(y.starts_on, r.created_at::date)::text d, 'سجل سنوي' ev, concat_ws(' · ', y.name, coalesce(jt.name_ar, r.job_title)) ds, null::text st,
         y.name yr, coalesce(jt.name_ar, r.job_title) job, r.department dept, r.employment_status emp, false tl
       from public.staff_year_records r left join public.academic_years y on y.id = r.year_id
       left join public.job_titles jt on jt.code = r.job_title where r.staff_id = $1 $q$, p_id),
  public.mr__sec('leadership', 'job', 'المواقع القيادية', 'النواة الرقمية',
    '[["pos","الموقع"],["from_d","من"],["to_d","إلى"]]',
    $q$ select l.id, coalesce(l.started_on, l.created_at::date)::text d, 'موقع قيادي' ev, l.position ds,
         case when l.ended_on is null then 'current' else 'ended' end st, l.position pos, l.started_on::text from_d, l.ended_on::text to_d
       from public.school_leadership l where l.staff_id = $1 $q$, p_id),
  public.mr__sec('roles', 'job', 'الأدوار في الأنظمة الرقمية', 'النواة الرقمية',
    '[["role","الدور"],["sys","النظام"],["from_d","من"],["st","الحالة"]]',
    $q$ select r.id, r.started_on::text d, 'دور في النواة' ev, concat_ws(' · ', ro.name_ar, sy.name_ar) ds,
         case when r.ended_on is null then 'current' else 'ended' end st, coalesce(ro.name_ar, r.role_code) role, sy.name_ar sys, r.started_on::text from_d
       from public.staff_roles r left join public.roles ro on ro.code = r.role_code left join public.systems sy on sy.code = r.system_code
       where r.staff_id = $1 $q$, p_id),
  public.mr__sec('growth_plans', 'growth', 'خطط النمو المهني', 'مجتمع لبيد المهني',
    '[["yr","العام"],["hours","الساعات المستهدفة"],["goals","الأهداف"]]',
    $q$ select g.id, public.mr__t(g.created_at) d, 'خطة نمو مهني' ev, g.goals ds, null::text st, y.name yr, g.target_hours::text hours, g.goals
       from public.pc_growth_plans g left join public.academic_years y on y.id = g.year_id where g.staff_id = $1 $q$, p_id),
  public.mr__sec('growth', 'growth', 'النمو والتطوير المهني', 'مجتمع لبيد المهني',
    '[["d","التاريخ"],["kind","النوع"],["title","العنوان"],["provider","الجهة"],["hours","الساعات"],["st","الحالة"]]',
    $q$ select g.id, coalesce(g.done_on, g.created_at::date)::text d, 'نمو مهني' ev, g.title ds, g.status st, g.kind, g.title, g.provider, g.hours::text hours, g.hours n
       from public.pc_growth_records g where g.staff_id = $1 $q$, p_id),
  public.mr__sec('profile_items', 'growth', 'السيرة المهنية', 'مجتمع لبيد المهني',
    '[["sect","القسم"],["title","البند"],["org","الجهة"],["years","الفترة"],["st","التوثيق"]]',
    $q$ select i.id, coalesce(i.year_from::text, '') d, 'بند في السيرة المهنية' ev, i.title ds, case when i.verified then 'verified' else 'unverified' end st,
         i.section sect, i.title, i.organization org, concat_ws(' – ', i.year_from, i.year_to) years, false tl
       from public.pc_profile_items i where i.staff_id = $1 $q$, p_id),
  public.mr__sec('communities', 'community', 'مجتمعات التعلم المهنية', 'مجتمع لبيد المهني',
    '[["name","المجتمع"],["role","الدور"],["st","الحالة"],["joined","تاريخ الانضمام"]]',
    $q$ select m.community_id id, public.mr__t(m.joined_at) d, 'عضوية مجتمع تعلم' ev, c.name ds, m.status st, c.name, m.role, public.mr__t(m.joined_at) joined
       from public.pc_community_members m join public.pc_communities c on c.id = m.community_id where m.staff_id = $1 $q$, p_id),
  public.mr__sec('pc_meetings', 'community', 'حضور لقاءات المجتمعات', 'مجتمع لبيد المهني',
    '[["d","الموعد"],["title","اللقاء"],["comm","المجتمع"],["st","الحضور"]]',
    $q$ select a.meeting_id id, public.mr__t(mt.starts_at) d, 'لقاء مجتمع تعلم' ev, mt.title ds, a.status st, mt.title, c.name comm
       from public.pc_meeting_attendance a join public.pc_meetings mt on mt.id = a.meeting_id left join public.pc_communities c on c.id = mt.community_id
       where a.staff_id = $1 $q$, p_id),
  public.mr__sec('initiatives', 'community', 'المبادرات والمشاركات المدرسية', 'مجتمع لبيد المهني',
    '[["d","البداية"],["title","المبادرة"],["role","الدور"],["st","الحالة"]]',
    $q$ select i.id, coalesce(i.start_on, i.created_at::date)::text d, 'مبادرة' ev, i.title ds, i.status st, i.title,
         case when i.owner_id = $1 then 'صاحب المبادرة' else coalesce(p.role, 'مشارك') end role
       from public.pc_initiatives i left join public.pc_initiative_participants p on p.initiative_id = i.id and p.staff_id = $1
       where i.owner_id = $1 or p.staff_id = $1 $q$, p_id),
  public.mr__sec('outputs', 'community', 'مخرجات مجتمعات التعلم', 'مجتمع لبيد المهني',
    '[["d","التاريخ"],["kind","النوع"],["title","العنوان"]]',
    $q$ select o.id, public.mr__t(o.created_at) d, 'مخرج مجتمع تعلم' ev, o.title ds, null::text st, o.kind, o.title
       from public.pc_outputs o where o.created_by = $1 $q$, p_id),
  public.mr__sec('se_team', 'evaluation', 'عضوية فريق التقويم الذاتي', 'التقويم الذاتي',
    '[["d","تاريخ الإضافة"],["st","الحالة"]]',
    $q$ select t.id, public.mr__t(t.created_at) d, 'عضوية فريق التقويم الذاتي' ev, 'عضو في فريق التقويم الذاتي' ds,
         case when t.is_active then 'active' else 'inactive' end st
       from public.se_team_members t where t.staff_id = $1 $q$, p_id),
  public.mr__sec('se_assign', 'evaluation', 'إسنادات المجالات والمؤشرات', 'التقويم الذاتي',
    '[["d","تاريخ الإسناد"],["item","المجال أو المؤشر"],["role","الدور"],["due","الموعد"]]',
    $q$ select a.id, public.mr__t(a.created_at) d, 'إسناد مؤشر' ev, concat_ws(' ', i.code, left(i.official_text, 140)) ds, null::text st,
         concat_ws(' ', i.code, left(i.official_text, 140)) item, a.role_kind role, a.due_date::text due
       from public.se_indicator_assignments a left join public.se_indicators i on i.id = a.indicator_id where a.staff_id = $1
       union all
       select a.id, public.mr__t(a.created_at), 'إسناد مجال', concat_ws(' ', d.code, d.name_ar), null, concat_ws(' ', d.code, d.name_ar), a.role_kind, null
       from public.se_domain_assignments a left join public.se_domains d on d.id = a.domain_id where a.staff_id = $1 $q$, p_id),
  public.mr__sec('se_tasks', 'evaluation', 'مهام التقويم الذاتي', 'التقويم الذاتي',
    '[["d","البداية"],["title","المهمة"],["due","الاستحقاق"],["st","الحالة"]]',
    $q$ select t.id, coalesce(t.start_date, t.created_at::date)::text d, 'مهمة تقويم ذاتي' ev, t.title ds, t.status st, t.title, t.due_date::text due
       from public.se_tasks t where t.assignee_staff_id = $1 $q$, p_id),
  public.mr__sec('se_visits', 'evaluation', 'الزيارات الفنية', 'التقويم الذاتي',
    '[["d","التاريخ"],["purpose","الغرض"],["role","صفته في الزيارة"],["st","الحالة"]]',
    $q$ select v.id, v.visit_date::text d, 'زيارة فنية' ev, v.purpose ds, v.status st, v.purpose,
         case when v.target_staff_id = $1 then 'مستهدف بالزيارة' else 'عضو فريق الزيارة' end role
       from public.se_technical_visits v where v.target_staff_id = $1 or exists (select 1 from public.se_visit_team t where t.visit_id = v.id and t.staff_id = $1) $q$, p_id),
  public.mr__sec('se_evidence', 'evaluation', 'الشواهد المقدمة', 'التقويم الذاتي',
    '[["d","التاريخ"],["title","الشاهد"],["ind","المؤشر"],["st","الحالة"]]',
    $q$ select e.id, coalesce(e.evidence_date, e.created_at::date)::text d, 'تقديم شاهد' ev, e.title ds, e.status st, e.title, i.code ind
       from public.se_evidence e left join public.se_indicators i on i.id = e.indicator_id where e.submitted_by = $1 $q$, p_id),
  public.mr__sec('se_improvement', 'evaluation', 'إجراءات التحسين المسندة', 'التقويم الذاتي',
    '[["d","البداية"],["action","الإجراء"],["end_d","النهاية"],["pct","الإنجاز %"],["st","الحالة"]]',
    $q$ select a.id, coalesce(a.start_date, a.created_at::date)::text d, 'إجراء تحسين' ev, a.action ds, a.status st, a.action, a.end_date::text end_d, a.progress_pct::text pct
       from public.se_improvement_actions a where a.responsible_staff_id = $1 $q$, p_id),
  public.mr__sec('se_meetings', 'evaluation', 'اجتماعات فريق التقويم الذاتي', 'التقويم الذاتي',
    '[["d","التاريخ"],["title","الاجتماع"],["st","الحضور"]]',
    $q$ select i.id, m.meeting_date::text d, 'اجتماع تقويم ذاتي' ev, m.title ds,
         case when i.attended then 'attended' when i.attended = false then 'absent' else coalesce(i.rsvp, 'invited') end st, m.title
       from public.se_meeting_invitees i join public.se_meetings m on m.id = i.meeting_id where i.staff_id = $1 $q$, p_id),
  public.mr__sec('plans', 'plans', 'الخطط والبرامج المرتبطة بالمعلم', 'الخطط الذكية',
    '[["d","التاريخ"],["act","الإجراء"],["name","الخطة أو البرنامج"],["by","بواسطة"]]',
    $q$ select r.id, public.mr__t(r.created_at) d,
         case r.data->>'type' when 'owner-link' then 'ربط المنفذ بحسابه' when 'edit' then 'إسناد تنفيذ برنامج' when 'plan-edit' then 'إسناد مسؤولية خطة' else coalesce(r.data->>'type', 'سجل') end ev,
         case when r.data->>'type' = 'owner-link' then 'ربط اسم «' || coalesce(r.data->>'from', '') || '» بحسابه في النواة' else r.data->>'name' end ds, null::text st,
         case r.data->>'type' when 'owner-link' then 'ربط المنفذ بحسابه' when 'edit' then 'إسناد تنفيذ برنامج' when 'plan-edit' then 'إسناد مسؤولية خطة' else coalesce(r.data->>'type', 'سجل') end act,
         case when r.data->>'type' = 'owner-link' then '—' else r.data->>'name' end name, r.data->>'by' by
       from public.sp_records r where r.col = 'executions' and (r.data->>'staff_id' = $1::text or r.data->'fields'->>'owner_staff_id' = $1::text) $q$, p_id,
    true, 'من سجل إسنادات الخطط الذكية في قاعدة النواة. قائمة البرامج نفسها محفوظة في موقع الخطط الذكية خارج القاعدة.'),
  public.mr__sec('bookings', 'other', 'حجوزات المرافق', 'احجز مرفق',
    '[["d","تاريخ الحجز"],["fac","المرفق"],["purpose","الغرض"],["vis","الحضور"],["st","الحالة"]]',
    $q$ select b.id, b.booking_date::text d, 'حجز مرفق' ev, concat_ws(' — ', f.name, nullif(b.purpose, '')) ds, b.status st, f.name fac, b.purpose, b.visitors::text vis
       from public.fb_bookings b left join public.facilities f on f.id = b.facility_id where b.booked_by = $1 $q$, p_id),
  public.mr__sec('facilities', 'other', 'المرافق المسؤول عنها', 'النواة الرقمية',
    '[["fac","المرفق"],["role","المسؤولية"],["st","حالة المرفق"]]',
    $q$ select f.id, null::text d, 'مسؤولية مرفق' ev, f.name ds, f.status st, f.name fac,
         case when f.primary_staff_id = $1 then 'مسؤول أساسي' else 'مسؤول احتياطي' end role, false tl
       from public.facilities f where f.primary_staff_id = $1 or f.backup_staff_id = $1 $q$, p_id),
  public.mr__sec('ind_assign', 'other', 'التكليفات في انضباطي', 'انضباطي',
    '[["d","البداية"],["task","المهمة"],["n","عدد الفصول"],["st","الحالة"]]',
    $q$ select a.id, a.starts_on::text d, 'تكليف في انضباطي' ev,
         case a.task when 'absence' then 'تسجيل الغياب' when 'lateness' then 'تسجيل التأخر' else a.task end ds, a.status st,
         case a.task when 'absence' then 'تسجيل الغياب' when 'lateness' then 'تسجيل التأخر' else a.task end task,
         (select count(*) from public.ind_assignment_sections s where s.assignment_id = a.id)::text n
       from public.ind_assignments a where a.staff_id = $1 $q$, p_id),
  public.mr__sec('contrib', 'other', 'الإسهام في أنظمة المتعلمين', 'قيمي وانضباطي',
    '[["sys","النظام"],["act","الإسهام"],["n","العدد"],["first","أول مرة"],["last","آخر مرة"]]',
    $q$ select k id, l_d d, act ev, act ds, null::text st, sys, act, n::text n, f_d "first", l_d "last", false tl from (
         select 'qm_r' k, 'قيمي' sys, 'تعزيزات منحها للطلاب' act, count(*) n, public.mr__t(min(created_at)) f_d, public.mr__t(max(created_at)) l_d from public.qm_reinforcements where given_by = $1 and voided_at is null
         union all select 'qm_b', 'قيمي', 'أوسمة منحها للطلاب', count(*), public.mr__t(min(created_at)), public.mr__t(max(created_at)) from public.qm_student_badges where awarded_by = $1 and revoked_at is null
         union all select 'qm_p', 'قيمي', 'سلوك إيجابي سجّله', count(*), public.mr__t(min(created_at)), public.mr__t(max(created_at)) from public.qm_positive_records where recorded_by = $1
         union all select 'qm_i', 'قيمي', 'حالات سلوكية رصدها', count(*), public.mr__t(min(created_at)), public.mr__t(max(created_at)) from public.qm_incidents where reported_by = $1
         union all select 'ind_s', 'انضباطي', 'أيام تحضير حفظها', count(*), public.mr__t(min(saved_at)), public.mr__t(max(saved_at)) from public.ind_attendance_sessions where saved_by = $1
         union all select 'ind_l', 'انضباطي', 'حالات تأخر سجّلها', count(*), public.mr__t(min(created_at)), public.mr__t(max(created_at)) from public.ind_lateness_records where recorded_by = $1 and voided_at is null
       ) a where n > 0 $q$, p_id)
  );

  perform public.mr__log('VIEW', 'staff', p_id);
  return jsonb_build_object('kind', 'staff', 'person', v_p, 'sections', v_s, 'generated_at', public.mr__t(now()));
end $$;

-- تسجيل التصدير أو الطباعة (لا يعيد بيانات)
create or replace function public.mr_log_export(p_kind text, p_id uuid) returns jsonb language plpgsql volatile security definer set search_path to '' as $$
begin
  if p_kind not in ('student', 'staff') then return jsonb_build_object('error', 'bad_request'); end if;
  if not public.mr_can_kind(p_kind) then perform public.mr__log('DENIED', p_kind, p_id, '{"op":"export"}'); return jsonb_build_object('error', 'forbidden'); end if;
  perform public.mr__log('EXPORT', p_kind, p_id);
  return jsonb_build_object('ok', true);
end $$;

-- الواجهة البرمجية: للمستخدمين المسجلين فقط، والتحقق داخل كل دالة
revoke all on function public.mr__leader(uuid) from public, anon, authenticated;
revoke all on function public.mr_can_manage(), public.mr_can_kind(text), public.mr_can(), public.mr_whoami(), public.mr_search(text, text, int), public.mr_student_profile(uuid),
  public.mr_staff_profile(uuid), public.mr_log_export(text, uuid) from public, anon;
grant execute on function public.mr_can_manage(), public.mr_can_kind(text), public.mr_can(), public.mr_whoami(), public.mr_search(text, text, int), public.mr_student_profile(uuid),
  public.mr_staff_profile(uuid), public.mr_log_export(text, uuid) to authenticated;
