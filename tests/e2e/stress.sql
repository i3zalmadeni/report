-- متعلم ببيانات كثيرة لاختبار انتقال الجداول بين صفحات PDF (محلي فقط)
insert into public.students (id, student_no, full_name, study_status) values ('40000000-0000-0000-0000-000000000009', '1199887766', 'عبدالرحمن بن خالد بن عبدالعزيز آل الشيخ المطيري', 'enrolled');
insert into public.student_enrollments (student_id, year_id, grade_code, section_id, status, started_on) values
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'm2', '20000000-0000-0000-0000-000000000002', 'enrolled', '2026-09-06');
insert into public.ind_attendance_records (student_id, section_id, day, status, recorded_by)
  select '40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', date '2026-09-07' + g, case when g % 3 = 0 then 'absent_excused' else 'absent_unexcused' end, '30000000-0000-0000-0000-000000000003' from generate_series(0, 69) g;
insert into public.ind_lateness_records (student_id, section_id, day, arrival_time, minutes, reason_id, reason_text, recorded_by)
  select '40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', date '2026-09-08' + g, '07:25', 10 + g % 20, '50000000-0000-0000-0000-000000000001',
    case when g = 3 then 'نصطويلجدابلامسافاتلاختبارعدمخروجالنصعنحدودالجدولفيالتقريرالمطبوعمهماكانطوله_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' else null end, '30000000-0000-0000-0000-000000000003' from generate_series(0, 34) g;
insert into public.qm_reinforcements (student_id, type_id, description, points, given_by, created_at)
  select '40000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000000001', 'مبادرة رقم ' || g || ' في خدمة الزملاء والمحافظة على نظافة الفصل والمشاركة الفاعلة في الإذاعة المدرسية', 3, '30000000-0000-0000-0000-000000000003', timestamptz '2026-09-10 08:00+03' + (g || ' days')::interval from generate_series(1, 45) g;
insert into public.qm_points_ledger (student_id, points, kind, reason, source_type, source_id, created_at)
  select student_id, points, 'reinforcement', 'تعزيز', 'reinforcement', id, created_at from public.qm_reinforcements where student_id = '40000000-0000-0000-0000-000000000009';
