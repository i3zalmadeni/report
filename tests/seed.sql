-- بيانات اختبار محلية فقط (لا تُنفَّذ على أي قاعدة حقيقية). أسماء وأرقام مصطنعة للاختبار.
insert into public.roles values ('core_admin','مدير النواة الرقمية','core'),('principal','مدير المدرسة','core'),('coordinator','منسق','core'),('member','منسوب','core');
insert into public.systems (code, name_ar, status) values ('smart_plans','نظام الخطط الذكية','connected'),('indibati','نظام انضباطي','connected');
insert into public.academic_years (id, name, starts_on, status) values
  ('10000000-0000-0000-0000-000000000001', '1447', '2025-08-24', 'closed'), ('10000000-0000-0000-0000-000000000002', '1448', '2026-09-06', 'current');
insert into public.grade_levels values ('m1','الأول المتوسط',1,true),('m2','الثاني المتوسط',2,true),('m3','الثالث المتوسط',3,true);
insert into public.class_sections (id, year_id, grade_code, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'm1', '1/2'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'm2', '2/3');
insert into public.job_titles values ('teacher','teaching','معلم',true),('principal','leadership','مدير مدرسة',true);
insert into public.staff_categories values ('teaching','الهيئة التعليمية',1);
-- المستخدمون: مدير، مطّلع مخوّل، معلم بلا صلاحية، موجه طلابي مخوّل
insert into public.staff_members (id, user_id, full_name, category, job_title, specialty, account_status, is_active, joined_on) values
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'مدير الاختبار', 'teaching', 'principal', 'إدارة', 'active', true, '2015-09-01'),
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'منسق الاطلاع', 'teaching', 'teacher', 'علوم', 'active', true, '2018-09-01'),
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'إبراهيم المعلم', 'teaching', 'teacher', 'رياضيات', 'active', true, '2012-09-01'),
  ('30000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'موجه الطلاب', 'teaching', 'teacher', 'إرشاد', 'active', true, '2016-09-01');
insert into public.staff_private values ('30000000-0000-0000-0000-000000000003', '4455667', 'teacher@example.invalid', '0500000000', now(), 't3');
insert into public.staff_roles (staff_id, role_code, started_on) values ('30000000-0000-0000-0000-000000000001', 'core_admin', '2026-01-01');
insert into public.staff_permissions (staff_id, permission_code) values ('30000000-0000-0000-0000-000000000002', 'mirat:view'), ('30000000-0000-0000-0000-000000000004', 'mirat:view');
insert into public.qm_staff_roles (staff_id, role) values ('30000000-0000-0000-0000-000000000004', 'counselor');

-- المتعلم الأول: سجلات في كل الأنظمة. الثاني: بلا سجلات
insert into public.students (id, student_no, full_name, study_status, birth_date, nationality) values
  ('40000000-0000-0000-0000-000000000001', '1122334455', 'أحمد عبدالله الحربي', 'enrolled', '2013-03-01', 'سعودي'),
  ('40000000-0000-0000-0000-000000000002', '1122334466', 'سالم محمد القحطاني', 'enrolled', '2013-05-01', 'سعودي');
insert into public.student_private values ('40000000-0000-0000-0000-000000000001', '0555555555', 'الأحساء', now());
insert into public.student_enrollments (student_id, year_id, grade_code, section_id, status, started_on) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'm1', '20000000-0000-0000-0000-000000000001', 'graduated', '2025-08-24'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'm2', '20000000-0000-0000-0000-000000000002', 'enrolled', '2026-09-06'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'm2', '20000000-0000-0000-0000-000000000002', 'enrolled', '2026-09-06');
insert into public.ind_attendance_sessions (section_id, day, saved_by) values ('20000000-0000-0000-0000-000000000002', '2026-11-02', '30000000-0000-0000-0000-000000000003');
insert into public.ind_attendance_records (student_id, section_id, day, status, recorded_by) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-11-02', 'absent_unexcused', '30000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-11-09', 'absent_excused', '30000000-0000-0000-0000-000000000003');
insert into public.ind_lateness_reasons (id, name) values ('50000000-0000-0000-0000-000000000001', 'ازدحام الطريق');
insert into public.ind_lateness_records (student_id, section_id, day, arrival_time, minutes, reason_id, recorded_by) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2026-11-05', '07:20', 15, '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003');
insert into public.ind_excuses (student_id, day, reason, status) values ('40000000-0000-0000-0000-000000000001', '2026-11-09', 'مراجعة طبية', 'approved');
insert into public.qm_reinforcement_types (id, name_ar) values ('60000000-0000-0000-0000-000000000001', 'المبادرة');
insert into public.qm_reinforcements (id, student_id, type_id, description, points, given_by, created_at) values
  ('61000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'مساعدة زملائه', 5, '30000000-0000-0000-0000-000000000003', '2026-11-03 09:00+03');
insert into public.qm_badges (id, name_ar) values ('62000000-0000-0000-0000-000000000001', 'وسام القارئ');
insert into public.qm_student_badges (id, student_id, badge_id, awarded_by, created_at) values
  ('63000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '2026-11-04 10:00+03');
insert into public.qm_points_ledger (student_id, points, kind, reason, source_type, source_id, created_at) values
  ('40000000-0000-0000-0000-000000000001', 5, 'reinforcement', 'المبادرة', 'reinforcement', '61000000-0000-0000-0000-000000000001', '2026-11-03 09:00+03'),
  ('40000000-0000-0000-0000-000000000001', 10, 'reinforcement', 'وسام القارئ', 'badge', '63000000-0000-0000-0000-000000000001', '2026-11-04 10:00+03'),
  ('40000000-0000-0000-0000-000000000001', -2, 'correction', 'تصحيح يدوي', null, null, '2026-11-06 08:00+03');
insert into public.qm_behavior_categories (id, kind, name_ar) values ('64000000-0000-0000-0000-000000000001', 'negative', 'إخلال بالنظام');
insert into public.qm_incidents (id, no, student_id, occurred_on, category_id, description, status, reported_by) values
  ('65000000-0000-0000-0000-000000000001', 1, '40000000-0000-0000-0000-000000000001', '2026-10-20', '64000000-0000-0000-0000-000000000001', 'وصف حساس', 'open', '30000000-0000-0000-0000-000000000003');
insert into public.qm_support_cases (id, no, student_id, need_description, goal, status, started_on, owner_id) values
  ('66000000-0000-0000-0000-000000000001', 1, '40000000-0000-0000-0000-000000000001', 'متابعة سلوكية', 'تحسين الانضباط', 'active', '2026-10-21', '30000000-0000-0000-0000-000000000004');
insert into public.qm_support_events (case_id, kind, note, improvement, actor_id) values ('66000000-0000-0000-0000-000000000001', 'followup', 'تحسن ملحوظ', 3, '30000000-0000-0000-0000-000000000004');

-- المعلم: سجلات في أنظمة المنسوبين
insert into public.staff_position_history (staff_id, category, job_title, started_on) values ('30000000-0000-0000-0000-000000000003', 'teaching', 'teacher', '2012-09-01');
insert into public.pc_profiles (staff_id, headline, experience_years, subjects, skills_digital) values ('30000000-0000-0000-0000-000000000003', 'معلم رياضيات', 14, '{رياضيات}', '{التعلم الرقمي}');
insert into public.pc_growth_plans (staff_id, year_id, target_hours, goals) values ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 30, 'تطوير التقويم البنائي');
insert into public.pc_growth_records (staff_id, kind, title, provider, hours, done_on, status) values ('30000000-0000-0000-0000-000000000003', 'course', 'التقويم من أجل التعلم', 'التعليم', 6, '2026-10-12', 'approved');
insert into public.pc_communities (id, name, status) values ('70000000-0000-0000-0000-000000000001', 'مجتمع الرياضيات', 'active');
insert into public.pc_community_members (community_id, staff_id, role, status) values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'leader', 'active');
insert into public.se_team_members (staff_id, is_active) values ('30000000-0000-0000-0000-000000000003', true);
insert into public.sp_records (col, data) values
  ('executions', '{"type":"edit","kind":"coordinator","progId":"14","name":"مشروع نافس للرياضيات","by":"مدير النواة الرقمية","fields":{"owner_staff_id":"30000000-0000-0000-0000-000000000003"}}'),
  ('executions', '{"type":"owner-link","kind":"coordinator","name":"إبراهيم المعلم","from":"إبراهيم","by":"مدير النواة الرقمية","staff_id":"30000000-0000-0000-0000-000000000003"}'),
  ('executions', '{"type":"edit","kind":"coordinator","name":"برنامج لا يخصه","fields":{"owner_staff_id":"30000000-0000-0000-0000-000000000002"}}');
insert into public.facilities (id, name, status, primary_staff_id) values ('71000000-0000-0000-0000-000000000001', 'معمل الحاسب', 'active', '30000000-0000-0000-0000-000000000003');
insert into public.fb_bookings (facility_id, booked_by, booking_date, purpose, status) values ('71000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '2026-11-10', 'حصة تطبيقية', 'approved');

-- التقويم الذاتي: دورة ومجال ومعيار ومؤشران، وإسناد مؤشر مباشر وإسناد مجال كامل للمعلم
insert into public.se_cycles (id, name, status) values ('80000000-0000-0000-0000-000000000001', 'الدورة الثانية', 'active');
insert into public.se_domains (id, code, name_ar) values ('81000000-0000-0000-0000-000000000001', '1', 'الإدارة المدرسية'), ('81000000-0000-0000-0000-000000000002', '2', 'التعليم والتعلم');
insert into public.se_standards (id, domain_id, code, name_ar) values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '1.1', 'القيادة'), ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '2.1', 'التخطيط للتعلم');
insert into public.se_indicators (id, standard_id, code, official_text) values
  ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '1.1.1', 'تضع المدرسة خطة تشغيلية مبنية على نتائج التقويم'),
  ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', '2.1.1', 'يخطط المعلمون للتعلم وفق احتياجات المتعلمين'),
  ('83000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000002', '2.1.2', 'يوظف المعلمون التقويم البنائي في التدريس');
insert into public.se_levels (id, code, label_ar) values ('84000000-0000-0000-0000-000000000001', 'progress', 'التقدم');
insert into public.se_indicator_assignments (cycle_id, indicator_id, staff_id, role_kind, due_date) values ('80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'responsible', '2026-12-15');
insert into public.se_domain_assignments (cycle_id, domain_id, staff_id, role_kind) values ('80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'evaluator');
insert into public.se_evaluations (cycle_id, indicator_id, level_id, status, achievement_pct) values ('80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000001', 'approved', 80);
insert into public.se_evidence (cycle_id, indicator_id, title, status) values ('80000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000002', 'خطط دروس', 'approved');
-- الخطط الذكية: توثيق تنفيذ سجّله المعلم
insert into public.sp_records (col, data) values ('executions', '{"programId":2,"programCode":"PL-002","no":1,"date":"2026-11-08","executor":"إبراهيم المعلم","executor_staff_id":"30000000-0000-0000-0000-000000000003","location":"قاعة الفعاليات"}');
