-- نسخة هيكلية من جداول قاعدة النواة (labeedsch_PC) التي يقرأ منها «مرآة»، لاختبار الترحيلات محلياً فقط.
-- الأعمدة مستخرجة من القاعدة الحقيقية (فُحصت 2026-11-13). لا تُنفَّذ على أي قاعدة حقيقية.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant usage on schema public to authenticated, anon;

create table public.academic_years (id uuid primary key default gen_random_uuid(), name text, starts_on date, ends_on date, status text, closed_at timestamptz, created_at timestamptz default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, table_name text, record_id uuid, old_data jsonb, new_data jsonb, created_at timestamptz default now());
create table public.class_sections (id uuid primary key default gen_random_uuid(), year_id uuid, grade_code text, name text, capacity integer, is_active boolean, created_at timestamptz default now());
create table public.facilities (id uuid primary key default gen_random_uuid(), code text, name text, type_code text, building text, floor text, room_no text, location_note text, area_m2 numeric, capacity integer, description text, status text, primary_staff_id uuid, backup_staff_id uuid, photo_paths text[], created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.fb_bookings (id uuid primary key default gen_random_uuid(), facility_id uuid, booked_by uuid, booking_date date, visitors integer, purpose text, needs_help boolean, help_note text, status text, decided_by uuid, decided_at timestamptz, decision_note text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.grade_levels (code text primary key, name_ar text, sort_order integer, is_active boolean);
create table public.guardians (id uuid primary key default gen_random_uuid(), full_name text, phone text, phone_alt text, email text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.ind_assignment_sections (assignment_id uuid, section_id uuid);
create table public.ind_assignments (id uuid primary key default gen_random_uuid(), staff_id uuid, task text, starts_on date, status text, note text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.ind_attendance_records (id uuid primary key default gen_random_uuid(), session_id uuid, student_id uuid, section_id uuid, day date, status text, recorded_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.ind_attendance_sessions (id uuid primary key default gen_random_uuid(), section_id uuid, day date, year_id uuid, saved_by uuid, saved_at timestamptz default now(), created_at timestamptz default now());
create table public.ind_escalation_records (id uuid primary key default gen_random_uuid(), student_id uuid, rule_id uuid, year_id uuid, days_count integer, status text, notification_id uuid, printed_at timestamptz, created_at timestamptz default now());
create table public.ind_escalation_rules (id uuid primary key default gen_random_uuid(), level integer, label text, days integer, count_mode text, pattern text, notify boolean, is_active boolean, updated_at timestamptz default now());
create table public.ind_excuses (id uuid primary key default gen_random_uuid(), student_id uuid, day date, link_id uuid, reason text, details text, status text, submitted_at timestamptz default now(), reviewed_by uuid, reviewed_at timestamptz, review_note text, reclassified boolean, request_id uuid);
create table public.ind_lateness_reasons (id uuid primary key default gen_random_uuid(), name text, is_other boolean, is_active boolean, sort_order integer, created_at timestamptz default now());
create table public.ind_lateness_records (id uuid primary key default gen_random_uuid(), student_id uuid, section_id uuid, grade_code text, year_id uuid, day date, arrival_time time, minutes integer, reason_id uuid, reason_text text, recorded_by uuid, created_at timestamptz default now(), request_id uuid, voided_at timestamptz, voided_by uuid, void_reason text);
create table public.ind_notifications (id uuid primary key default gen_random_uuid(), student_id uuid, guardian_id uuid, kind text, template_code text, vars jsonb, body text, link_id uuid, status text, provider_message_id text, error text, attempts integer, dedupe_key text, created_by uuid, created_at timestamptz default now(), sent_at timestamptz, updated_at timestamptz default now());
create table public.ind_reward_transactions (id uuid primary key default gen_random_uuid(), student_id uuid, year_id uuid, week_start date, points integer, status text, ledger_id uuid, reversal_ledger_id uuid, awarded_by uuid, created_at timestamptz default now(), reversed_at timestamptz, reverse_reason text);
create table public.ind_staff_roles (id uuid primary key default gen_random_uuid(), staff_id uuid, role text, created_by uuid, created_at timestamptz default now());
create table public.job_titles (code text primary key, category text, name_ar text, is_active boolean);
create table public.pc_communities (id uuid primary key default gen_random_uuid(), name text, description text, kind text, status text, leader_id uuid, year_id uuid, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), objectives text, start_on date, end_on date, review_note text, reviewed_by uuid, reviewed_at timestamptz, publish_public boolean);
create table public.pc_community_members (community_id uuid, staff_id uuid, role text, status text, joined_at timestamptz default now(), sort_order integer);
create table public.pc_growth_plans (id uuid primary key default gen_random_uuid(), staff_id uuid, year_id uuid, target_hours integer, goals text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.pc_growth_records (id uuid primary key default gen_random_uuid(), staff_id uuid, year_id uuid, kind text, title text, provider text, hours numeric, done_on date, note text, status text, reviewed_by uuid, reviewed_at timestamptz, review_note text, created_at timestamptz default now(), updated_at timestamptz default now(), file_path text);
create table public.pc_initiative_participants (initiative_id uuid, staff_id uuid, role text, joined_at timestamptz default now());
create table public.pc_initiatives (id uuid primary key default gen_random_uuid(), title text, description text, objectives text, owner_id uuid, community_id uuid, year_id uuid, status text, start_on date, end_on date, reviewed_by uuid, reviewed_at timestamptz, review_note text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.pc_meeting_attendance (meeting_id uuid, staff_id uuid, community_id uuid, status text);
create table public.pc_meetings (id uuid primary key default gen_random_uuid(), community_id uuid, title text, starts_at timestamptz, duration_min integer, location text, agenda text, status text, minutes text, decisions text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.pc_outputs (id uuid primary key default gen_random_uuid(), community_id uuid, kind text, title text, description text, url text, meeting_id uuid, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.pc_profile_items (id uuid primary key default gen_random_uuid(), staff_id uuid, section text, title text, organization text, year_from integer, year_to integer, description text, url text, verified boolean, verified_by uuid, verified_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.pc_profiles (staff_id uuid primary key, bio text, interests text[], experience_years integer, links jsonb, is_public boolean, updated_at timestamptz default now(), headline text, subjects text[], grades text[], skills_pedagogical text[], skills_digital text[], skills_specialty text[], skills_leadership text[], skills_collab text[], skills_ai text[], strengths text, development_areas text, goals text, reflection text, avatar_path text);
create table public.systems (code text primary key, name_ar text, description text, status text, api_key_hash text, last_seen_at timestamptz, created_at timestamptz default now(), scopes text[]);
create table public.permissions (code text primary key, system_code text, level text, name_ar text);
create table public.roles (code text primary key, name_ar text, kind text);
create table public.qm_achievement_categories (id uuid primary key default gen_random_uuid(), name_ar text, is_active boolean, sort_order integer);
create table public.qm_achievement_students (achievement_id uuid, student_id uuid, year_id uuid, grade_code text, section_id uuid, contribution text);
create table public.qm_achievements (id uuid primary key default gen_random_uuid(), title text, category_id uuid, achieved_on date, description text, level text, organizer text, attachment_paths text[], status text, recorded_by uuid, reviewed_by uuid, reviewed_at timestamptz, review_note text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.qm_badges (id uuid primary key default gen_random_uuid(), name_ar text, description text, icon text, criteria text, is_active boolean, sort_order integer, points integer, kind text, image_path text, category text);
create table public.qm_behavior_categories (id uuid primary key default gen_random_uuid(), kind text, name_ar text, is_active boolean, sort_order integer);
create table public.qm_incident_events (id uuid primary key default gen_random_uuid(), incident_id uuid, actor_id uuid, kind text, note text, visibility text, from_status text, to_status text, created_at timestamptz default now());
create table public.qm_incident_statuses (id uuid primary key default gen_random_uuid(), code text, name_ar text, tone text, sort_order integer, is_closed boolean, is_active boolean);
create table public.qm_incidents (id uuid primary key default gen_random_uuid(), no bigint, student_id uuid, year_id uuid, grade_code text, section_id uuid, occurred_on date, occurred_time time, location text, category_id uuid, description text, teacher_notes text, parties text, attachment_paths text[], status text, reported_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), closed_at timestamptz);
create table public.qm_points_ledger (id uuid primary key default gen_random_uuid(), student_id uuid, points integer, kind text, reason text, source_type text, source_id uuid, reverses_id uuid, created_by uuid, created_at timestamptz default now());
create table public.qm_positive_records (id uuid primary key default gen_random_uuid(), student_id uuid, year_id uuid, grade_code text, section_id uuid, category_id uuid, description text, recorded_by uuid, created_at timestamptz default now());
create table public.qm_reinforcement_types (id uuid primary key default gen_random_uuid(), name_ar text, domain text, default_points integer, is_active boolean, sort_order integer, criteria text);
create table public.qm_reinforcements (id uuid primary key default gen_random_uuid(), student_id uuid, year_id uuid, grade_code text, section_id uuid, type_id uuid, description text, points integer, given_by uuid, attachment_path text, voided_at timestamptz, voided_by uuid, void_reason text, created_at timestamptz default now());
create table public.qm_staff_roles (staff_id uuid, role text, granted_by uuid, granted_at timestamptz default now());
create table public.qm_student_badges (id uuid primary key default gen_random_uuid(), student_id uuid, badge_id uuid, note text, awarded_by uuid, created_at timestamptz default now(), revoked_at timestamptz, revoked_by uuid);
create table public.qm_support_cases (id uuid primary key default gen_random_uuid(), no bigint, student_id uuid, year_id uuid, grade_code text, section_id uuid, type_id uuid, need_description text, goal text, owner_id uuid, source_incident_id uuid, status text, started_on date, next_follow_up date, result text, final_improvement integer, opened_by uuid, closed_by uuid, closed_at timestamptz, retention_until date, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.qm_support_events (id uuid primary key default gen_random_uuid(), case_id uuid, actor_id uuid, kind text, note text, improvement integer, next_follow_up date, created_at timestamptz default now());
create table public.qm_support_plans (id uuid primary key default gen_random_uuid(), case_id uuid, title text, strategies text, review_on date, created_by uuid, created_at timestamptz default now());
create table public.qm_support_types (id uuid primary key default gen_random_uuid(), name_ar text, is_active boolean, sort_order integer);
create table public.qm_talents (id uuid primary key default gen_random_uuid(), student_id uuid, field text, name text, description text, noted_by uuid, is_active boolean, created_at timestamptz default now());
create table public.school_leadership (id uuid primary key default gen_random_uuid(), staff_id uuid, "position" text, started_on date, ended_on date, created_at timestamptz default now());
create table public.se_domain_assignments (id uuid primary key default gen_random_uuid(), cycle_id uuid, domain_id uuid, staff_id uuid, role_kind text, created_at timestamptz default now());
create table public.se_domains (id uuid primary key default gen_random_uuid(), guide_id uuid, code text, name_ar text, sort_order integer);
create table public.se_evidence (id uuid primary key default gen_random_uuid(), cycle_id uuid, indicator_id uuid, title text, description text, status text, submitted_by uuid, review_note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), evidence_date date);
create table public.se_improvement_actions (id uuid primary key default gen_random_uuid(), cycle_id uuid, gap_description text, root_cause text, goal text, action text, responsible_staff_id uuid, start_date date, end_date date, success_measure text, required_evidence text, progress_pct numeric, status text, followup_result text, source_visit_card_id uuid, created_by uuid, created_at timestamptz default now());
create table public.se_indicator_assignments (id uuid primary key default gen_random_uuid(), cycle_id uuid, indicator_id uuid, staff_id uuid, role_kind text, created_at timestamptz default now(), due_date date);
create table public.se_indicators (id uuid primary key default gen_random_uuid(), standard_id uuid, code text, official_text text, requirements_text text, sort_order integer, private_schools_only boolean);
create table public.se_meeting_invitees (id uuid primary key default gen_random_uuid(), meeting_id uuid, staff_id uuid, invitee_kind text, rsvp text, rsvp_at timestamptz, rsvp_reason text, attended boolean, attended_at timestamptz, recorded_by uuid, invite_token_hash text);
create table public.se_meetings (id uuid primary key default gen_random_uuid(), cycle_id uuid, title text, meeting_date date, start_time time, location text, status text, domain_id uuid, standard_id uuid, indicator_id uuid, created_by uuid, created_at timestamptz default now());
create table public.se_cycles (id uuid primary key default gen_random_uuid(), name text, school_year text, starts_on date, ends_on date, status text, guide_id uuid, coordinator_id uuid, published boolean, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), include_private_only boolean, year_id uuid);
create table public.se_standards (id uuid primary key default gen_random_uuid(), domain_id uuid, code text, name_ar text, sort_order integer);
create table public.se_levels (id uuid primary key default gen_random_uuid(), guide_id uuid, code text, label_ar text, sort_order integer, min_percent numeric, max_percent numeric);
create table public.se_evaluations (id uuid primary key default gen_random_uuid(), cycle_id uuid, indicator_id uuid, level_id uuid, status text, justification text, gaps_notes text, evaluated_by uuid, approved_by uuid, approved_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), achievement_pct numeric, strengths text);
create table public.se_evidence_indicators (evidence_id uuid, indicator_id uuid);
create table public.se_tasks (id uuid primary key default gen_random_uuid(), cycle_id uuid, title text, description text, task_type text, status text, approval text, proposed_by uuid, approved_by uuid, approved_at timestamptz, assignee_staff_id uuid, start_date date, due_date date, required_output text, indicator_id uuid, meeting_id uuid, visit_id uuid, visit_card_id uuid, completion_note text, completed_at timestamptz, closed_approved_by uuid, closed_approved_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.se_team_members (id uuid primary key default gen_random_uuid(), staff_id uuid, is_active boolean, added_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.se_technical_visits (id uuid primary key default gen_random_uuid(), cycle_id uuid, visit_date date, visit_time time, target_party text, target_staff_id uuid, purpose text, notes text, status text, created_by uuid, created_at timestamptz default now());
create table public.se_visit_team (visit_id uuid, staff_id uuid);
create table public.sp_records (id uuid primary key default gen_random_uuid(), col text, data jsonb, created_at timestamptz default now(), created_by uuid);
create table public.staff_categories (code text primary key, name_ar text, sort_order integer);
create table public.staff_members (id uuid primary key default gen_random_uuid(), user_id uuid, full_name text, category text, job_title text, specialty text, qualification text, account_status text, joined_on date, source_type text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(), employment_status text, department text, photo_path text, is_active boolean, publish_public boolean, public_photo_path text);
create table public.staff_permissions (staff_id uuid, permission_code text, granted_at timestamptz default now());
create table public.staff_position_history (id uuid primary key default gen_random_uuid(), staff_id uuid, category text, job_title text, started_on date, ended_on date, note text, created_at timestamptz default now());
create table public.staff_private (staff_id uuid primary key, employee_no text, email text, phone text, updated_at timestamptz default now(), login_id text);
create table public.staff_roles (id uuid primary key default gen_random_uuid(), staff_id uuid, role_code text, system_code text, started_on date, ended_on date);
create table public.staff_year_records (id uuid primary key default gen_random_uuid(), staff_id uuid, year_id uuid, category text, job_title text, department text, employment_status text, created_at timestamptz default now());
create table public.student_enrollments (id uuid primary key default gen_random_uuid(), student_id uuid, year_id uuid, grade_code text, section_id uuid, status text, started_on date, ended_on date, note text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.student_guardians (student_id uuid, guardian_id uuid, relation text, is_primary boolean);
create table public.student_private (student_id uuid primary key, phone text, address text, updated_at timestamptz default now());
create table public.students (id uuid primary key default gen_random_uuid(), student_no text, full_name text, study_status text, enrollment_type text, first_enrolled_on date, exit_on date, exit_note text, birth_date date, nationality text, source_type text, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());

-- جميع الجداول مغلقة أمام المستخدمين كما في النواة (RLS)؛ «مرآة» يقرأ عبر دواله فقط
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- دوال الصلاحيات في النواة (منسوخة من القاعدة الحقيقية) ونسخ مبسطة لدوال قيمي وانضباطي
create or replace function public.is_core_admin() returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.staff_members s join public.staff_roles r on r.staff_id=s.id
    where s.user_id=auth.uid() and r.role_code in ('core_admin','principal') and r.ended_on is null and s.is_active) $$;
create or replace function public.core_can(p text) returns boolean language sql stable security definer set search_path to '' as $$
  select public.is_core_admin() or exists (
    select 1 from public.staff_members s join public.staff_permissions sp on sp.staff_id = s.id
    where s.user_id = auth.uid() and s.is_active and s.account_status = 'active'
      and sp.permission_code = any (case split_part(p, ':', 2)
          when 'view' then array[split_part(p, ':', 1) || ':view', split_part(p, ':', 1) || ':add', split_part(p, ':', 1) || ':edit']
          when 'add'  then array[split_part(p, ':', 1) || ':add', split_part(p, ':', 1) || ':edit']
          else array[p] end)) $$;
create or replace function public.qm_is_support() returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.qm_staff_roles r join public.staff_members s on s.id = r.staff_id where s.user_id = auth.uid() and r.role in ('agent','counselor')) $$;
create or replace function public.ind_can_oversee() returns boolean language sql stable security definer set search_path to '' as $$
  select public.is_core_admin() or exists (select 1 from public.ind_staff_roles r join public.staff_members s on s.id = r.staff_id where s.user_id = auth.uid() and r.role in ('coordinator','affairs')) $$;
