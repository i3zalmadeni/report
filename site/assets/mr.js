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
  failed: "فشل الإرسال", no_phone: "لا يوجد رقم", reinforcement: "تعزيز", correction: "تصحيح", reversal: "عكس قيد", badge: "وسام", awarded: "ممنوحة", reversed: "معكوسة",
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
    ["إسنادات التقويم الذاتي", cnt("se_assign"), "info"],
    ["الخطط والبرامج", cnt("plans", (r) => r.ev !== "ربط المنفذ بحسابه"), "info"],
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
const NAV = [["index.html", "البحث", "search", "بحث موحد عن متعلم أو معلم"]];
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
    `<header class="dash"><div class="wrap top">${brandHTML("index.html")}<div class="idl">${coreBlock()}${headMoe}</div></div>
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
