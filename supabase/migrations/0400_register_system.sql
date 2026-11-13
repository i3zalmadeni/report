-- مرآة | الملف الشامل · 0400 · تسجيل النظام في سجل أنظمة النواة الرقمية وصلاحية الاطلاع.
-- بيانات فقط، دون أي تعديل على بنية جداول النواة. قابل لإعادة التنفيذ.
-- النظام استعلام فقط، فله صلاحية واحدة: mirat:view، تُمنح من «الأدوار والصلاحيات» في النواة.
insert into public.systems (code, name_ar, description, status, scopes)
values ('mirat', 'مرآة | الملف الشامل', 'استعلام موحد عن السجلات والإجراءات المرتبطة بالمتعلمين ومنسوبي المدرسة', 'connected',
        array['school:read','staff:read','students:read','identity:verify'])
on conflict (code) do nothing;
insert into public.permissions (code, system_code, level, name_ar) values
  ('mirat:view', 'mirat', 'view', 'مرآة | الملف الشامل: اطلاع')
on conflict (code) do nothing;
