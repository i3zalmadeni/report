/* مرآة | الملف الشامل: المنطق المشترك.
   المنصة استعلام فقط: كل البيانات تُقرأ عبر دوال mr_* في قاعدة النواة، وهي تتحقق من الصلاحية في الخادم وتسجّل الاطلاع.
   لا توجد في هذه الواجهة أي عملية إضافة أو تعديل أو حذف. */
const sb = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
async function doLogout(to) {
  try { await Promise.race([sb.auth.signOut({ scope: "local" }), new Promise((r) => setTimeout(r, 2500))]); } catch (_) {}
  try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); sessionStorage.clear(); } catch (_) {}
  location.replace(to || "login.html");
}

// ===== التاريخ: توقيت الرياض، الهجري (أم القرى) مع الميلادي. القاعدة تعيد التواريخ موحّدة بصيغة YYYY-MM-DD[ HH:MI] =====
const TZ = "Asia/Riyadh";
const d12 = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00Z");
const isDay = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ""));
const fmtHijri = (iso) => d12(iso).toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtGreg = (iso) => d12(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + "م";
const fmtHM = (hm) => { const [h, m] = String(hm).split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`; };
// تاريخ قصير للجداول: ميلادي رقمي ثابت الاتجاه، والهجري تحته
const fmtD = (v, { long = false } = {}) => {
  if (!v) return "—";
  if (!isDay(v)) return esc(v);
  const t = String(v).length > 10 ? " · " + fmtHM(String(v).slice(11, 16)) : "";
  return long ? `${esc(fmtHijri(v))}<small class="dd">${esc(fmtGreg(v))}${esc(t)}</small>` : `<bdi class="nw">${esc(String(v).slice(0, 10))}</bdi>${t ? `<small class="dd">${esc(t.slice(3))}</small>` : ""}<small class="dd">${esc(fmtHijri(v))}</small>`;
};
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

// ===== تسميات الحالات والرموز القادمة من الأنظمة (أي رمز غير معروف يظهر كما هو) =====
const LBL = {
  enrolled: "مقيد", graduated: "متخرج", transferred: "منقول", withdrawn: "منسحب", present: "حاضر", absent_excused: "غائب بعذر", absent_unexcused: "غائب بدون عذر",
  recorded: "مسجل", voided: "ملغى", active: "فعّال", inactive: "غير فعّال", revoked: "مسحوب", approved: "معتمد", pending: "بانتظار الاعتماد", rejected: "غير معتمد",
  submitted: "مقدم", under_review: "قيد المراجعة", current: "حالي", ended: "منتهٍ", verified: "موثق", unverified: "غير موثق", leader: "قائد", member: "عضو",
  attended: "حضر", absent: "لم يحضر", invited: "مدعو", accepted: "قبل الدعوة", declined: "اعتذر", open: "مفتوحة", closed: "مغلقة", completed: "مكتمل", done: "منجز",
  in_progress: "قيد التنفيذ", cancelled: "ملغى", planned: "مخطط", draft: "مسودة", queued: "بانتظار الإرسال", sending: "قيد الإرسال", sent: "مرسل", delivered: "وصلت", read: "قُرئت",
  failed: "فشل الإرسال", not_evaluated: "لم يُقيَّم", no_phone: "لا يوجد رقم", reinforcement: "تعزيز", correction: "تصحيح", reversal: "عكس قيد", badge: "وسام", awarded: "ممنوحة", reversed: "معكوسة",
  absence: "إشعار غياب", lateness: "إشعار تأخر", lateness_repeat: "تكرار التأخر", escalation: "إجراء نظامي", excuse_received: "استلام عذر", excuse_result: "نتيجة العذر",
  course: "دورة تدريبية", workshop: "ورشة عمل", conference: "مؤتمر", reading: "قراءة مهنية", certificate: "شهادة", followup: "متابعة", agent: "وكيل شؤون الطلاب", counselor: "موجه طلابي",
  owner: "مسؤول", participant: "مشارك", reviewer: "مراجع", lead: "قائد", suspended: "موقوف",
};
const lbl = (v) => (v == null || v === "" ? "—" : LBL[v] || v);
const LBL_COLS = new Set(["st", "kind", "role"]);
const TONE = { absent_unexcused: "bad", voided: "", revoked: "", rejected: "bad", failed: "bad", absent_excused: "warn", pending: "warn", under_review: "warn", approved: "ok", active: "ok", attended: "ok", current: "ok", delivered: "ok", read: "ok", verified: "ok" };
const stBadge = (v) => (v == null || v === "" ? "—" : `<span class="badge ${TONE[v] || "info"}">${esc(lbl(v))}</span>`);

const GROUPS = {
  student: [["study", "السجل الدراسي", "cap"], ["discipline", "الانضباط المدرسي", "clock"], ["values", "القيم والسلوك الإيجابي", "star"], ["guidance", "الحالات والإرشاد والمتابعة", "compass"], ["achievements", "الإنجازات والمواهب", "trophy"]],
  staff: [["job", "البيانات الوظيفية", "key"], ["growth", "النمو والتطوير المهني", "up"], ["community", "مجتمعات التعلم والمشاركات", "users"], ["evaluation", "التقويم الذاتي", "chart"], ["plans", "الخطط والبرامج", "list"], ["other", "سجلات وإجراءات أخرى", "grid"]],
};
const SST = { ok: "", restricted: "مقيد بالصلاحيات", unavailable: "المصدر غير متاح", error: "تعذرت القراءة" };

const ERR = {
  forbidden: "لا تملك صلاحية الاطلاع على الملفات الشاملة. تُمنح صلاحية «مرآة: اطلاع» من الأدوار والصلاحيات في النواة الرقمية.",
  not_found: "لا يوجد سجل بهذا المعرّف في النواة الرقمية.", bad_request: "طلب غير صحيح.",
};
const mapErr = (e) => { const m = e?.message || String(e); return ERR[m] || (/Failed to fetch|NetworkError|Load failed/i.test(m) ? "تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة." : /does not exist|schema cache|Could not find the function/i.test(m) ? "لم تُنفَّذ طبقة القراءة (supabase/migrations/0401) على قاعدة النواة بعد." : m); };
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw new Error(mapErr(error));
  if (data && typeof data === "object" && !Array.isArray(data) && data.error) throw new Error(mapErr({ message: data.error }));
  return data;
}
Object.assign(ICONS, {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  file: '<path d="M14 3H6v18h12V7zM14 3v4h4"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.4M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.2-1.1"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
});
const loading = (t) => `<p class="sub" aria-busy="true">${esc(t || "جارٍ التحميل…")}</p>`;

// ===== نموذج الملف: الأقسام والسجل الزمني الموحد والمؤشرات =====
function model(p) {
  const secs = p.sections.map((s) => ({ ...s, n: s.status === "ok" ? s.rows.length : null }));
  // السجل الزمني: كل حدث مؤرخ مرة واحدة. القيود المحاسبية التي تعكس حدثاً ظاهراً في قسم آخر (dup) لا تتكرر،
  // والسجلات المستقلة المتشابهة (يومان بالحالة نفسها مثلاً) تبقى لأن لكل منها معرّفاً مستقلاً في مصدره.
  const seen = new Set(), tl = [];
  secs.forEach((s) => s.status === "ok" && s.rows.forEach((r) => {
    if (r.dup || r.tl === false || !isDay(r.d)) return;
    const k = s.key + ":" + r.id; if (seen.has(k)) return; seen.add(k);
    tl.push({ d: r.d, ev: r.ev, ds: r.ds, st: r.st, src: s.system, sec: s.title });
  }));
  tl.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  const sec = (k) => secs.find((s) => s.key === k);
  const rows = (k) => (sec(k)?.status === "ok" ? sec(k).rows : null);
  const cnt = (k, f) => { const r = rows(k); return r ? r.filter(f || (() => true)).length : null; };
  const sum = (k, f) => { const r = rows(k); return r ? r.filter(f || (() => true)).reduce((a, x) => a + (Number(x.n) || 0), 0) : null; };
  const ind = p.kind === "student" ? [
    ["أيام الغياب بدون عذر", cnt("attendance", (r) => r.st === "absent_unexcused"), "bad"],
    ["أيام الغياب بعذر", cnt("attendance", (r) => r.st === "absent_excused"), "warn"],
    ["مرات التأخر الصباحي", cnt("lateness", (r) => r.st !== "voided"), "warn"],
    ["رصيد النقاط", sum("points"), "ok"],
    ["التعزيزات", cnt("reinforcements", (r) => r.st === "active"), "ok"],
    ["الأوسمة", cnt("badges", (r) => r.st === "active"), "ok"],
    ["الحالات السلوكية", cnt("incidents"), "info"],
    ["برامج التدخل", cnt("support_cases"), "info"],
  ] : [
    ["ساعات النمو المهني", sum("growth"), "ok"],
    ["أنشطة النمو المهني", cnt("growth"), "ok"],
    ["مجتمعات التعلم", cnt("communities"), "info"],
    ["المبادرات والمشاركات", cnt("initiatives"), "info"],
        ["البرامج المسندة", cnt("sp_programs"), "info"],
    ["المؤشرات المسندة", cnt("se_assign"), "info"],
    ["حجوزات المرافق", cnt("bookings"), "info"],
  ];
  const total = secs.reduce((a, s) => a + (s.n || 0), 0);
  const withData = secs.filter((s) => s.n > 0).length;
  const issues = secs.filter((s) => s.status === "error" || s.status === "unavailable");
  return { p, secs, tl, ind: ind.filter((x) => x[1] !== null), total, withData, issues, restricted: secs.filter((s) => s.status === "restricted") };
}
const cell = (k, v) => (k === "d" || /_d$|^due$|^review$|^sub$|^joined$|^first$|^last$/.test(k)) && isDay(v) ? fmtD(v) : k === "st" ? stBadge(v) : LBL_COLS.has(k) ? esc(lbl(v)) : v == null || v === "" ? "—" : esc(v);
const kindLabel = (k) => (k === "student" ? "متعلم" : "معلم");

// ===== الهيكل: ترويسة النواة، والتحقق من الجلسة والصلاحية قبل أي عرض =====
const NAV = [["search.html", "البحث", "search", "بحث موحد عن متعلم أو معلم"]];
async function boot(page, render, o = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); return; }
  const shell = document.getElementById("shell");
  const fail = (msg, out) => {
    shell.innerHTML = `<main class="wrap"><div class="card" style="max-width:560px;margin:48px auto"><h3 style="margin-top:0">${out ? "لا تملك صلاحية الاطلاع" : "تعذر فتح المنصة"}</h3><p class="${out ? "sub" : "err"}">${esc(msg)}</p><div class="acts mt">${out ? "" : '<button class="btn" id="rt">إعادة المحاولة</button>'}<button class="btn sec" id="lo">تسجيل الخروج</button></div></div></main>`;
    const rt = $("#rt"); if (rt) rt.onclick = () => location.reload(); $("#lo").onclick = () => doLogout();
  };
  let who;
  try { who = await rpc("mr_whoami"); } catch (e) { console.error(e); fail(mapErr(e)); return; }
  if (!who) { await doLogout("login.html?e=nostaff"); return; }
  if (!who.can) { fail(ERR.forbidden, true); return; }
  window.__mr = who;
  if (o.bare) { await render(shell, who); return; }
  const role = who.is_admin ? "مدير النواة الرقمية" : "مطّلع مخوّل";
  shell.innerHTML =
    `<header class="dash"><div class="wrap top">${brandHTML("index.html")}<div class="idl"><a class="sitelink" href="index.html">الموقع الإلكتروني</a><span class="vdiv"></span>${coreBlock()}${headMoe}</div></div>
     <div class="strip" aria-hidden="true"></div>
     <div class="dnav"><div class="wrap dn"><div class="dnav-in">${NAV.map(([h, n, e, t]) => `<a href="${h}" title="${esc(t)}" class="${h === page ? "on" : ""}" ${h === page ? 'aria-current="page"' : ""}>${ico(e)}${n}</a>`).join("")}</div>
     <div class="dwho"><span class="dname">${esc(who.name)}</span><a class="loginbtn" href="#" id="out">خروج</a></div></div></div></header>
     <div class="pagebar"><div class="wrap pb"><div class="pb-t"><small>${esc(role)}</small><h1>${esc(o.title || "الملف الشامل")}</h1></div><p class="pb-d">${esc(o.desc || "")}</p>
     <div class="pb-u"><span>${esc(fmtHijri(todayISO()))}</span></div></div></div>
     <main class="wrap" id="main"></main>${footerHTML}`;
  bindNav();
  document.title = (o.title || "الملف الشامل") + " – مرآة";
  $("#out").onclick = (e) => { e.preventDefault(); doLogout(); };
  const main = $("#main");
  try { await render(main, who); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><p class="err">${esc(mapErr(e))}</p><button class="btn sec" onclick="location.reload()">إعادة المحاولة</button></div>`; }
}

// ===== الخطط الذكية: قائمة البرامج من موقع الخطط الذكية + تعديلات المنسق من القاعدة =====
// موقع الخطط الذكية يحفظ خطته الأصلية داخل صفحته (const DATA)، ويحفظ في القاعدة تعديلات المنسق وربط المنفذين والتوثيقات.
// نطبّق التعديلات بالترتيب نفسه الذي يطبّقه موقع الخطط الذكية، دون أي نسخ أو تخزين.
const SP_URL = window.SMART_PLANS_URL || "/smart-plans/";
function jsonAfter(src, marker) {
  const i = src.indexOf(marker); if (i < 0) return null;
  const k = src.indexOf("{", i); let depth = 0, str = false, bs = false;
  for (let j = k; j < src.length; j++) { const c = src[j];
    if (str) { if (bs) bs = false; else if (c === "\\") bs = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === "{") depth++; else if (c === "}" && !--depth) return JSON.parse(src.slice(k, j + 1)); }
  return null;
}
const normN = (t) => String(t || "").replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^ء-يa-zA-Z0-9]+/g, " ").trim();
async function smartPlansSections(extra, sid) {
  const B = { grp: "plans", system: "الخطط الذكية" };
  const S = {
    owned: { ...B, key: "sp_plans", title: "الخطط التي يتولى مسؤوليتها", cols: [["name", "الخطة"], ["n", "عدد برامجها"]] },
    progs: { ...B, key: "sp_programs", title: "البرامج المسندة إليه في الخطط الذكية", cols: [["code", "الرمز"], ["name", "البرنامج"], ["plan", "الخطة"], ["domain", "المجال"], ["ind", "المؤشر المستهدف"], ["when", "الموعد المخطط"], ["st", "الحالة"], ["exn", "التوثيقات"]],
      note: "قائمة البرامج من موقع الخطط الذكية، مع تعديلات المنسق وربط المنفذين المحفوظة في قاعدة النواة." },
    exec: { ...B, key: "sp_exec", title: "توثيقات التنفيذ التي سجّلها", cols: [["d", "تاريخ التنفيذ"], ["prog", "البرنامج"], ["no", "رقم التنفيذ"], ["loc", "المكان"]] },
  };
  const fail = (msg) => Object.values(S).map((s) => ({ ...s, status: "error", rows: [], error: msg }));
  if (!extra || !extra.sp) return fail((extra && extra.sp_error) || "تعذرت قراءة سجلات الخطط الذكية");
  let DATA;
  try { const r = await fetch(new URL(SP_URL, location.origin), { cache: "no-store" }); if (!r.ok) throw 0; DATA = jsonAfter(await r.text(), "const DATA ="); if (!DATA || !Array.isArray(DATA.progs)) throw 0; }
  catch (_) { return fail("تعذر الوصول إلى قائمة البرامج في موقع الخطط الذكية"); }
  const recs = extra.sp.records || [], dir = extra.sp.staff || [], D = Object.fromEntries(dir.map((m) => [m.id, m]));
  const isCo = (r) => r.col === "executions" && r.data && r.data.kind === "coordinator";
  const co = recs.filter(isCo).map((r) => ({ ...r.data, _id: r.id })).sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const ex = recs.filter((r) => r.col === "executions" && !isCo(r) && r.data && r.data.programId != null).map((r) => ({ ...r.data, _id: r.id }));
  // الخطط: الأصلية + المضافة، مع التعديل والحذف
  let plans = (DATA.plans || []).map((x) => ({ ...x }));
  for (const d of co) {
    if (d.type === "plan-add" && d.plan && d.plan.id != null && !plans.some((x) => String(x.id) === String(d.plan.id))) plans.push({ ...d.plan });
    else if (d.type === "plan-edit" && d.planId != null) { const x = plans.find((y) => String(y.id) === String(d.planId)); if (x) Object.assign(x, d.fields || {}); }
    else if (d.type === "plan-remove" && d.planId != null) plans = plans.filter((y) => String(y.id) !== String(d.planId));
  }
  // البرامج: الأصلية + غير المدرجة + المضافة من لوحة المنسق، ثم الحذف، ثم التعديلات بترتيبها الزمني
  let progs = DATA.progs.map((p) => ({ ...p }));
  recs.filter((r) => r.col === "unplanned" && r.data).forEach((r, i) => progs.push({ ...r.data, id: "x-" + r.id, code: "UP-" + String(i + 1).padStart(3, "0"), plan_name: "غير مدرج في الخطة", status: "لم يبدأ", planned_text: "غير مدرج في الخطة" }));
  let n = 0; co.filter((d) => d.type === "add" && d.data).forEach((d) => { n++; progs.push({ status: "لم يبدأ", ...d.data, id: "c-" + d._id, code: "PC-" + String(n).padStart(3, "0") }); });
  const gone = new Set(); co.forEach((d) => { if (d.type === "remove" && d.progId != null) gone.add(String(d.progId)); else if (d.type === "restore" && d.progId != null) gone.delete(String(d.progId)); });
  progs = progs.filter((p) => !gone.has(String(p.id)));
  co.filter((d) => d.type === "edit" && d.fields).forEach((d) => { const p = progs.find((x) => String(x.id) === String(d.progId)); if (p) Object.assign(p, d.fields); });
  // المنفذ: المعرّف المحفوظ، أو ربط الاسم بالحساب من المنسق، أو تطابق الاسم الموحّد مع منسوب واحد فقط
  const OL = {}; co.forEach((d) => { if (d.type === "owner-link" && d.from) { delete OL[d.from]; if (!d.group && d.staff_id) OL[d.from] = d.staff_id; } });
  const who = (name, s) => { if (s && D[s]) return s; const t = String(name || "").trim(); if (!t) return null; if (OL[t] && D[OL[t]]) return OL[t]; const k = normN(t), c = dir.filter((m) => normN(m.name) === k); return c.length === 1 ? c[0].id : null; };
  const planName = (p) => { const x = plans.find((y) => String(y.id) === String(p.plan_id)); return x ? x.name : p.plan_name || ""; };
  const exFor = (p) => ex.filter((e) => String(e.programId) === String(p.id));
  const mine = progs.filter((p) => who(p.owner_name, p.owner_staff_id) === sid);
  S.progs.rows = mine.map((p) => ({ id: String(p.id), d: isDay(p.planned_date) ? p.planned_date : null, ev: "برنامج مسند", ds: p.name, st: p.status || null, tl: false,
    code: p.code, name: p.name, plan: planName(p), domain: p.domain, ind: p.indicator, when: [p.planned_text, p.term_text].filter(Boolean).join(" · ") || null, exn: String(exFor(p).length) }));
  S.owned.rows = plans.filter((x) => who(x.owner, x.owner_staff_id) === sid).map((x) => ({ id: "plan-" + x.id, d: null, ev: "مسؤولية خطة", ds: x.name, st: null, tl: false, name: x.name, n: String(progs.filter((p) => String(p.plan_id) === String(x.id)).length) }));
  S.exec.rows = ex.filter((e) => (e.executor_staff_id ? e.executor_staff_id === sid : who(e.executor) === sid)).map((e) => {
    const p = progs.find((x) => String(x.id) === String(e.programId));
    return { id: e._id, d: isDay(e.date) ? e.date : null, ev: "توثيق تنفيذ برنامج", ds: p ? p.name : e.programCode || "برنامج", st: null, prog: p ? `${p.code} ${p.name}` : e.programCode, no: e.no != null ? String(e.no) : null, loc: e.location || null };
  });
  return Object.values(S).map((s) => ({ ...s, status: "ok", rows: s.rows.sort((a, b) => String(b.d || "").localeCompare(String(a.d || ""))) }));
}
// يُكمل ملف المعلم: تفاصيل التقويم الذاتي والبرامج المسندة في الخطط الذكية
async function enrichStaff(p) {
  let extra;
  try { extra = await rpc("mr_staff_extra", { p_id: p.person.id }); } catch (e) { extra = { sp: null, sp_error: mapErr(e), sections: [] }; }
  (extra.sections || []).forEach((s) => { const i = p.sections.findIndex((x) => x.key === s.key); if (i >= 0) p.sections[i] = s; else p.sections.push(s); });
  const sp = await smartPlansSections(extra, p.person.id);
  const i = p.sections.findIndex((x) => x.key === "plans");
  if (i >= 0) p.sections[i] = { ...p.sections[i], title: "سجل إسنادات المنسق في الخطط الذكية" };
  p.sections.splice(i >= 0 ? i : p.sections.length, 0, ...sp);
  return p;
}

// ===== اختيار الأنظمة والأقسام: مشترك بين استعراض الملف وتصدير التقرير (يُحفظ على هذا الجهاز فقط) =====
const SYSICO = { "النواة الرقمية": "layers", "انضباطي": "clock", "قيمي": "star", "مجتمع لبيد المهني": "users", "التقويم الذاتي": "chart", "الخطط الذكية": "list", "احجز مرفق": "home", "قيمي وانضباطي": "grid" };
const nSec = (n) => (n === 1 ? "قسم واحد" : n === 2 ? "قسمان" : n <= 10 ? n + " أقسام" : n + " قسماً");
function selStore(kind, p) {
  const LS = "mr-report-" + kind;
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (_) { return null; } })();
  const st = {
    SEL: new Set(p.sections.map((s) => s.key).filter((k) => !(saved && (saved.off || []).includes(k)))),
    PART: { sum: true, det: true, tl: true, ...((saved && saved.parts) || {}) },
    systems: [...new Set(p.sections.map((s) => s.system))].map((name) => ({ name, secs: p.sections.filter((s) => s.system === name) })),
  };
  st.save = () => { try { localStorage.setItem(LS, JSON.stringify({ off: p.sections.map((s) => s.key).filter((k) => !st.SEL.has(k)), parts: st.PART })); } catch (_) {} };
  return st;
}
// ===== قائمة الأنظمة القابلة للطي: صف لكل نظام (مربع إظهار النظام كله + لسان يفتح أقسامه). مشتركة بين الملف والتقرير =====
const nRec = (n) => (!n ? "لا سجلات" : n === 1 ? "سجل واحد" : n === 2 ? "سجلان" : n <= 10 ? n + " سجلات" : n + " سجلاً");
function sysAcc(systems) {
  return `<div class="mr-acc">${systems.map((g, gi) => {
    const recs = g.secs.reduce((a, s) => a + (s.status === "ok" ? s.rows.length : 0), 0);
    return `<div class="mr-ar" data-ar="${gi}">
      <div class="mr-ar-h"><label class="mr-ar-ck" title="إظهار أقسام ${esc(g.name)} كلها أو إخفاؤها"><input type="checkbox" data-sys="${gi}" aria-label="${esc(g.name)}: كل الأقسام"></label>
        <button type="button" class="mr-ar-t" data-acc="${gi}" aria-expanded="false" aria-controls="ar-${gi}">
          <span class="ic">${ico(SYSICO[g.name] || "grid")}</span>
          <span class="tx"><b>${esc(g.name)}</b><small>${nSec(g.secs.length)} · ${nRec(recs)}</small></span>
          <span class="mr-ar-n" data-arn="${gi}"></span><span class="chev">${ico("chev")}</span></button></div>
      <div class="mr-ar-b" id="ar-${gi}" role="group" aria-label="أقسام ${esc(g.name)}" hidden>
        ${g.secs.map((s, i) => `<label class="mr-ai${s.status === "ok" && !s.rows.length ? " empty" : ""}${s.status !== "ok" ? " na" : ""}"><input type="checkbox" data-k="${esc(s.key)}"><em>${i + 1}</em><span>${esc(s.title)}</span><small>${s.status === "ok" ? s.rows.length : esc(SST[s.status])}</small></label>`).join("")}
      </div></div>`; }).join("")}</div>`;
}
// يحدّث حالة المربعات وشارة كل صف حسب الاختيار الحالي
function accSync(root, systems, SEL) {
  systems.forEach((g, gi) => {
    const on = g.secs.filter((s) => SEL.has(s.key)).length, c = $(`[data-sys="${gi}"]`, root), row = $(`[data-ar="${gi}"]`, root);
    c.checked = on === g.secs.length; c.indeterminate = on > 0 && on < g.secs.length;
    row.classList.toggle("on", on > 0); row.classList.toggle("part", on > 0 && on < g.secs.length);
    $(`[data-arn="${gi}"]`, root).textContent = on === g.secs.length ? "الكل" : on ? `${on} من ${g.secs.length}` : "مخفي";
  });
  $$("[data-k]", root).forEach((b) => (b.checked = SEL.has(b.dataset.k)));
}
// فتح الصف وطيّه (صف واحد أو الكل)
function accBind(root) {
  const set = (b, o) => { b.setAttribute("aria-expanded", String(o)); $("#" + b.getAttribute("aria-controls"), root).hidden = !o; };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-acc]"); if (b && root.contains(b)) return set(b, b.getAttribute("aria-expanded") !== "true");
    const x = e.target.closest("[data-acc-all]"); if (!x || !root.contains(x)) return;
    const bs = $$("[data-acc]", root), o = !bs.every((b) => b.getAttribute("aria-expanded") === "true");
    bs.forEach((b) => set(b, o)); x.textContent = o ? "طي الكل" : "فتح الكل";
  });
}
function filterBar(st) {
  return `<section class="card mr-flt" id="flt" aria-label="الأنظمة والأقسام المعروضة">
    <div class="mr-flt-h"><div class="mr-flt-t"><b>${ico("layers")}الأنظمة والأقسام المعروضة</b><span class="sub sm" id="fltn"></span></div>
      <div class="mr-flt-a"><button type="button" class="btn sec sm" data-all="1">إظهار الكل</button><button type="button" class="btn sec sm" data-all="0">إخفاء الكل</button>
      <button type="button" class="btn sec sm" data-acc-all="1">فتح الكل</button></div></div>
    <p class="sub sm mr-flt-tip">افتح لسان النظام لاختيار أقسامه، أو استخدم المربع بجواره لإظهار النظام كله أو إخفائه. الاختيار يسري على التقرير أيضاً.</p>
    ${sysAcc(st.systems)}
  </section>`;
}
function bindFilter(st, p, render) {
  const flt = $("#flt"), all = p.sections.length;
  const sync = () => { accSync(flt, st.systems, st.SEL); $("#fltn").textContent = st.SEL.size === all ? `كل الأقسام (${all})` : `${st.SEL.size} من ${all} قسماً`; };
  const changed = () => { st.save(); sync(); render(); };
  accBind(flt);
  flt.addEventListener("change", (e) => { const t = e.target;
    if (t.dataset.k) t.checked ? st.SEL.add(t.dataset.k) : st.SEL.delete(t.dataset.k);
    else if (t.dataset.sys != null) st.systems[+t.dataset.sys].secs.forEach((s) => (t.checked ? st.SEL.add(s.key) : st.SEL.delete(s.key)));
    changed(); });
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-all]"); if (!b || !(flt.contains(b) || $("#mrc").contains(b))) return;
    p.sections.forEach((s) => (b.dataset.all === "1" ? st.SEL.add(s.key) : st.SEL.delete(s.key))); changed(); });
  sync();
}
