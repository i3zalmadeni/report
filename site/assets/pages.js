/* مرآة: صفحات البحث والملف الشامل. لا توجد أي مدخلات لتسجيل بيانات؛ البحث والتصفية فقط. */
const PAGES = {};
const qs = new URLSearchParams(location.search);

// ===== البحث الموحد =====
PAGES.search = () => boot("search.html", async (main, who) => {
  let kind = qs.get("k") === "staff" ? "staff" : "student";
  main.innerHTML = `<section class="mr-hero card">
    <div class="mr-hero-t"><span class="mr-mark" aria-hidden="true">${LOGO}</span><div><h2>الملف الشامل</h2>
    <p class="sub">استعلام موحد عن السجلات والإجراءات المرتبطة بمنسوبي المدرسة والمتعلمين، من أنظمة النواة الرقمية القائمة، في ملف واحد قابل للطباعة.</p></div></div>
    <div class="mr-kind" role="radiogroup" aria-label="نوع الملف">
      <button type="button" role="radio" data-k="student">${ico("cap")}ملف متعلم</button>
      <button type="button" role="radio" data-k="staff">${ico("user")}ملف معلم</button></div>
    <div class="mr-search">${ico("search")}<input type="search" id="q" autocomplete="off" aria-label="بحث"><span class="mr-cnt" id="cnt" aria-live="polite"></span></div>
    <p class="sub sm" id="hint"></p></section>
    <div id="res" class="mr-res" aria-live="polite"></div>
    <p class="sub sm mt">الملفات تُقرأ لحظة فتحها من الأنظمة المصدر، ولا تُحفظ نسخة منها في المنصة. كل اطلاع وتصدير يُسجَّل في سجل عمليات النواة الرقمية.</p>`;
  const q = $("#q"), res = $("#res");
  const setKind = (k) => { kind = k; $$("[data-k]").forEach((b) => b.setAttribute("aria-checked", b.dataset.k === k));
    q.placeholder = k === "student" ? "اكتب اسم المتعلم أو رقمه المدرسي (رقم الهوية)" : who.staff_basic ? "اكتب اسم المعلم أو رقمه الوظيفي" : "اكتب اسم المعلم";
    $("#hint").textContent = k === "student" ? "يكفي جزء من الاسم، والبحث لا يتأثر بالهمزات والتاء المربوطة." : "يشمل جميع منسوبي المدرسة المسجلين في النواة.";
    history.replaceState(null, "", "?k=" + k); run(); };
  let t = 0, seq = 0;
  const run = async () => {
    const v = q.value.trim(), my = ++seq; $("#cnt").textContent = "";
    if (v.length < 2) { res.innerHTML = ""; return; }
    res.innerHTML = loading("جارٍ البحث…");
    try {
      const rows = await rpc("mr_search", { p_kind: kind, p_q: v, p_limit: 30 }); if (my !== seq) return;
      $("#cnt").textContent = rows.length ? rows.length + " نتيجة" : "";
      res.innerHTML = rows.length ? rows.map((r) => `<a class="mr-hit card" href="profile.html?k=${kind}&id=${encodeURIComponent(r.id)}">
        <span class="mr-av" aria-hidden="true">${ico(kind === "student" ? "cap" : "user")}</span>
        <span class="mr-hit-t"><b>${esc(r.name)}</b><small>${kind === "student"
          ? [r.grade, r.section && "فصل " + r.section, r.year && "العام " + r.year].filter(Boolean).map(esc).join(" · ") || "لا يوجد قيد دراسي"
          : [r.job, r.specialty].filter(Boolean).map(esc).join(" · ")}</small></span>
        <span class="mr-hit-m">${r.no ? `<bdi class="mr-no">${esc(r.no)}</bdi>` : ""}${kind === "student" ? stBadge(r.status) : r.active === false ? stBadge("inactive") : ""}</span>${ico("arrow")}</a>`).join("")
        : `<div class="card empty"><b>لا توجد نتائج مطابقة</b><p class="sub">تحقق من الاسم أو الرقم. البحث يشمل السجلات الموجودة في النواة الرقمية فقط.</p></div>`;
    } catch (e) { if (my === seq) res.innerHTML = `<div class="card"><p class="err">${esc(mapErr(e))}</p></div>`; }
  };
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 280); });
  $$("[data-k]").forEach((b) => (b.onclick = () => setKind(b.dataset.k)));
  setKind(kind); q.focus();
}, { title: "البحث الموحد", desc: "اختر نوع الملف ثم ابحث بالاسم أو الرقم" });

// ===== الملف الشامل =====
const H = (h) => (h ? { h } : null); // قيمة HTML مبنية داخلياً (مُهرّبة مسبقاً)
function personFields(p, kind) {
  const P = p.person, f = kind === "student" ? [
    ["الرقم المدرسي", P.no && H(`<bdi>${esc(P.no)}</bdi>`)], ["الصف", P.grade], ["الفصل", P.section], ["العام الدراسي", P.year], ["الحالة الدراسية", P.status && lbl(P.status)],
    ["تاريخ الالتحاق", P.first_enrolled_on && H(fmtD(P.first_enrolled_on))], ["تاريخ الميلاد", P.birth_date && H(fmtD(P.birth_date))], ["الجنسية", P.nationality],
    ["تاريخ الخروج", P.exit_on && H(fmtD(P.exit_on))],
  ] : [
    ["الرقم الوظيفي", P.no && H(`<bdi>${esc(P.no)}</bdi>`)], ["المسمى الوظيفي", P.job], ["الفئة", P.category], ["التخصص", P.specialty], ["المؤهل", P.qualification],
    ["القسم", P.department], ["حالة التوظيف", P.employment_status && lbl(P.employment_status)], ["تاريخ المباشرة", P.joined_on && H(fmtD(P.joined_on))],
    ["سنوات الخبرة", P.pro?.experience_years], ["حالة الحساب", P.active === false ? "غير فعّال" : P.account_status && lbl(P.account_status)],
  ];
  if (P.contact) {
    if (kind === "student") { f.push(["جوال المتعلم", P.contact.phone && H(`<bdi>${esc(P.contact.phone)}</bdi>`)], ["العنوان", P.contact.address]);
      (P.contact.guardians || []).forEach((g) => f.push(["ولي الأمر" + (g.relation ? " (" + g.relation + ")" : ""), H([esc(g.name), g.phone && `<bdi>${esc(g.phone)}</bdi>`].filter(Boolean).join(" · "))])); }
    else f.push(["الجوال", P.contact.phone && H(`<bdi>${esc(P.contact.phone)}</bdi>`)], ["البريد", P.contact.email && H(`<bdi>${esc(P.contact.email)}</bdi>`)]);
  }
  return f.filter((x) => x[1] != null && x[1] !== "").map(([k, v]) => [k, typeof v === "object" ? v.h : esc(v)]);
}
const secNotice = (s) => s.status === "restricted" ? `<p class="mr-note">${ico("eyeoff")}هذا القسم مقيد بصلاحيات النظام المصدر (${esc(s.system)}). ${esc(s.note || "")}</p>`
  : s.status !== "ok" ? `<p class="mr-note bad">${ico("alert")}${esc(s.error || SST[s.status])}. لم تُعرض أي بيانات بديلة.</p>` : "";

PAGES.profile = () => boot("profile.html", async (main) => {
  const kind = qs.get("k") === "staff" ? "staff" : "student", id = qs.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) { main.innerHTML = `<div class="card"><p class="err">رابط غير صحيح.</p><a class="btn sec" href="search.html">العودة إلى البحث</a></div>`; return; }
  main.innerHTML = loading("جارٍ جمع السجلات من الأنظمة…");
  const p = await rpc(kind === "student" ? "mr_student_profile" : "mr_staff_profile", { p_id: id });
  if (kind === "staff") await enrichStaff(p);
  const P = p.person;
  const st = selStore(kind, p);
  document.title = P.name + " – الملف الشامل – مرآة";
  $(".pagebar h1").textContent = "ملف " + kindLabel(kind) + " الشامل";
  const pro = P.pro;
  main.innerHTML = `
  <section class="card mr-id" id="sum">
    <div class="mr-id-h"><span class="mr-av lg" aria-hidden="true">${ico(kind === "student" ? "cap" : "user")}</span>
      <div class="mr-id-t"><small>${kind === "student" ? "ملف متعلم" : "ملف معلم"}</small><h2>${esc(P.name)}</h2>
      <p class="sub sm">المعرّف الموحد في النواة: <bdi class="mr-uuid" dir="ltr">${esc(P.id)}</bdi></p></div>
      <div class="mr-acts"><a class="btn sec" href="report.html?k=${kind}&id=${id}" target="_blank" rel="noopener">${ico("eye")}معاينة التقرير</a>
      <a class="btn" href="report.html?k=${kind}&id=${id}&pick=1" target="_blank" rel="noopener">${ico("print")}تصدير الملف الشامل PDF</a></div></div>
    <dl class="mr-dl">${personFields(p, kind).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${pro ? `<div class="mr-pro"><b>${ico("star")}الملف المهني <small>مجتمع لبيد المهني</small></b>${pro.headline ? `<p>${esc(pro.headline)}</p>` : ""}
      ${(pro.subjects || []).length ? `<p class="sub sm">المواد: ${esc(pro.subjects.join("، "))}</p>` : ""}${(pro.skills || []).length ? `<div class="mr-chips">${pro.skills.slice(0, 16).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}</div>` : ""}
    ${P.pro_error || P.contact_error ? `<p class="mr-note bad">${ico("alert")}${esc(P.pro_error || P.contact_error)}</p>` : ""}
    <p class="sub sm mr-gen">استُخرج من الأنظمة في ${esc(p.generated_at)} بتوقيت الرياض.</p>
  </section>
  ${filterBar(st)}
  <nav class="mr-jump card" aria-label="أقسام الملف"><a href="#sum">${ico("grid")}الملخص</a><a href="#secs">${ico("layers")}الأقسام التفصيلية</a><a href="#tl">${ico("clock")}السجل الزمني الموحد</a></nav>

  <div id="mrc"></div>`;
  // المحتوى يُعاد رسمه مباشرة مع كل تغيير في الأنظمة أو الأقسام المختارة
  const render = () => {
    const sel = p.sections.filter((x) => st.SEL.has(x.key));
    if (!sel.length) { $("#mrc").innerHTML = `<div class="card empty mt"><b>لم تختر أي نظام أو قسم</b><p class="sub">اختر من شريط الأنظمة أعلاه ما تريد استعراضه.</p><button class="btn" type="button" data-all="1">عرض كل الأنظمة</button></div>`; return; }
    const m = model({ ...p, sections: sel });
    const groups = GROUPS[kind].map(([g, n, i]) => ({ g, n, i, secs: m.secs.filter((x) => x.grp === g) })).filter((x) => x.secs.length);
    $("#mrc").innerHTML = `${st.SEL.size < p.sections.length ? `<p class="mr-note mr-custom">${ico("eye")}عرض مخصص: ${sel.length} من ${p.sections.length} قسماً. الأرقام والسجل الزمني تشمل الأقسام المختارة فقط، والتصدير يتبع الاختيار نفسه.</p>` : ""}
  <section class="mr-l1"><h3 class="mr-h">${ico("chart")}الملخص العام</h3>
    <div class="mr-kpis"><div class="mr-kpi main"><b>${m.total}</b><span>سجلاً مرتبطاً</span><small>في ${m.withData} من ${m.secs.length} قسماً</small></div>
      ${m.ind.map(([n, v, t]) => `<div class="mr-kpi ${t}"><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join("")}</div>
    ${m.issues.length ? `<p class="mr-note bad">${ico("alert")}تعذرت القراءة من: ${m.issues.map((s) => esc(s.title + " (" + s.system + ")")).join("، ")}. الأرقام أعلاه لا تشمل هذه الأقسام.</p>` : ""}
    <div class="mr-map">${groups.map((G) => `<div class="mr-mapg"><b>${ico(G.i)}${esc(G.n)}</b>${G.secs.map((s) => `<a href="#s-${s.key}" class="mr-mapi ${s.n ? "has" : ""} ${s.status}"><span>${esc(s.title)}</span><em>${s.status === "ok" ? s.n : esc(SST[s.status])}</em></a>`).join("")}</div>`).join("")}</div>
  </section>

  <section class="mr-l2" id="secs"><h3 class="mr-h">${ico("layers")}الأقسام التفصيلية</h3>
  ${groups.map((G) => `<div class="mr-grp"><h4>${ico(G.i)}${esc(G.n)}</h4>${G.secs.map((s) => `
    <article class="card mr-sec ${s.n ? "" : "is-empty"}" id="s-${s.key}">
      <header><h5>${esc(s.title)}</h5><span class="mr-src" title="النظام المصدر">${ico("layers")}${esc(s.system)}</span>${s.status === "ok" ? `<span class="mr-n">${s.n}</span>` : ""}</header>
      ${secNotice(s)}
      ${s.status === "ok" && !s.n ? `<p class="sub sm">لا توجد سجلات في هذا القسم.</p>` : ""}
      ${s.n ? `<div class="tw"><table class="mr-t"><thead><tr>${s.cols.map(([, h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${s.rows.map((r) => `<tr class="${r.dup ? "dup" : ""}">${s.cols.map(([k]) => `<td>${cell(k, r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        ${s.rows.some((r) => r.dup) ? `<p class="sub sm">القيود المظللة تمثل أحداثاً معروضة في أقسامها الأصلية، فلا تتكرر في السجل الزمني.</p>` : ""}
        ${s.note && s.status === "ok" ? `<p class="sub sm">${esc(s.note)}</p>` : ""}` : ""}
    </article>`).join("")}</div>`).join("")}
  </section>

  <section class="mr-l3" id="tl"><h3 class="mr-h">${ico("clock")}السجل الزمني الموحد <small>${m.tl.length} حدثاً، من الأحدث إلى الأقدم</small></h3>
    <div class="card"><div class="mr-tlf"><label for="tlf">تصفية حسب النظام</label><select id="tlf"><option value="">كل الأنظمة</option>${[...new Set(m.tl.map((x) => x.src))].map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
    ${m.tl.length ? `<ol class="mr-tl" id="tlist">${m.tl.map((x) => `<li data-src="${esc(x.src)}"><time>${fmtD(x.d, { long: true })}</time><div><b>${esc(x.ev)}</b>${x.st ? " " + stBadge(x.st) : ""}<p>${esc(lbl(x.ds) || "")}</p><small>${ico("layers")}${esc(x.src)} · ${esc(x.sec)}</small></div></li>`).join("")}</ol>`
      : `<p class="sub">لا توجد أحداث مؤرخة مرتبطة بهذا الملف.</p>`}</div>
  </section>`;
    const f = $("#tlf"); if (f) f.onchange = () => $$("#tlist li").forEach((li) => (li.hidden = !!f.value && li.dataset.src !== f.value));
  };
  bindFilter(st, p, render);
  render();
}, { title: "الملف الشامل", desc: "نافذة موحدة على السجلات الموجودة في الأنظمة" });
