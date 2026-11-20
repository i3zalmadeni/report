/* مرآة: تقرير الملف الشامل للطباعة والتصدير PDF.
   تنسيق طباعة مستقل (ليس صورة للصفحة): نصوص وجداول حقيقية، A4 عمودي، هوامش 15 مم، رأس وتذييل وترقيم تلقائي. */
const cssStr = (s) => '"' + String(s ?? "").replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ") + '"';
const plain = (k, v) => (v == null || v === "" ? "—" : k === "st" || LBL_COLS.has(k) ? lbl(v) : String(v));
const rDate = (v) => (isDay(v) ? `<bdi class="nw">${esc(String(v).slice(0, 10))}</bdi>${String(v).length > 10 ? `<span class="tm">${esc(fmtHM(String(v).slice(11, 16)))}</span>` : ""}<span class="hj">${esc(fmtHijri(v))}</span>` : esc(v ?? "—"));
const rCell = (k, v) => ((k === "d" || /_d$|^due$|^review$|^sub$|^joined$|^first$|^last$/.test(k)) && isDay(v) ? rDate(v) : esc(plain(k, v)));

const CORE_URL = "https://i3zalmadeni.github.io/digital-core/";
PAGES.report = () => boot("report.html", async (root, who) => {
  const kind = qs.get("k") === "staff" ? "staff" : "student", id = qs.get("id") || "";
  root.innerHTML = `<div class="rp-bar no-print"><div class="rp-bar-in"><b>معاينة التقرير</b><span id="rpst" class="rp-st">جارٍ جمع السجلات…</span>
    <span class="sp"></span><button class="rb sec" id="pick" type="button" aria-expanded="false" aria-controls="pk" disabled>محتوى التقرير <span id="pkc"></span></button><a class="rb sec" href="profile.html?k=${kind}&id=${encodeURIComponent(id)}">العودة إلى الملف</a><button class="rb" id="go" disabled>تصدير الملف الشامل PDF</button></div>
    <div id="pk" class="rp-pick" hidden></div>
    <div class="rp-sub"><div class="rp-vw" role="group" aria-label="طريقة عرض التقرير"><button type="button" data-vw="pages">${"صفحات الطباعة"}</button><button type="button" data-vw="read">عرض للقراءة</button></div>
      <p class="rp-tip">يُصدَّر بالهوية الموحدة للنواة الرقمية: الترويسة والتذييل ورقم الصفحة في كل صفحة، ورقم التقرير ورمز التحقق يُنشآن عند التصدير. في نافذة الطباعة اختر «حفظ بتنسيق PDF».</p></div></div>
    <div id="pv" class="rp-pv" aria-live="polite"></div>
    <div id="doc" class="rp-doc"></div>`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) { $("#rpst").textContent = "رابط غير صحيح."; return; }
  if (!who["can_" + kind] && !(kind === "staff" && id === who.staff_id)) { $("#rpst").textContent = KIND_DENIED[kind]; $("#rpst").classList.add("bad"); return; }
  let p;
  try { p = await rpc(kind === "student" ? "mr_student_profile" : "mr_staff_profile", { p_id: id }); if (kind === "staff") await enrichStaff(p); }
  catch (e) { $("#rpst").textContent = mapErr(e); $("#rpst").classList.add("bad"); return; }
  const P = p.person, title = "الملف الشامل " + (kind === "student" ? "للمتعلم" : "للمعلم");
  document.title = title + " – " + P.name;
  // الرأس والتذييل في هوامش كل صفحة (CSS Paged Media)، مع الترقيم التلقائي
  const st = document.createElement("style");
  st.textContent = `@page{@top-right{content:${cssStr("مرآة | الملف الشامل · متوسطة لبيد بن ربيعة المتوسطة")}}@top-left{content:${cssStr(P.name + (P.no ? " · " + P.no : ""))}}
    @bottom-right{content:${cssStr("تاريخ الاستخراج: " + p.generated_at)}}@bottom-left{content:${cssStr("صدر التقرير من حساب: " + who.name)}}}`;
  document.head.appendChild(st);

  // ===== اختيار محتوى التقرير: أجزاؤه، والأنظمة وأقسامها (الافتراضي: الكل). يُحفظ الاختيار على هذا الجهاز فقط =====
  const LS = "mr-report-" + kind, saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (_) { return null; } })();
  const SEL = new Set(p.sections.map((s) => s.key).filter((k) => !(saved && (saved.off || []).includes(k))));
  const PART = { sum: true, det: true, tl: true, ...((saved && saved.parts) || {}) };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ off: p.sections.map((s) => s.key).filter((k) => !SEL.has(k)), parts: PART })); } catch (_) {} };
  const systems = [...new Set(p.sections.map((s) => s.system))].map((name) => ({ name, secs: p.sections.filter((s) => s.system === name) }));
  const cnt = (s) => (s.status === "ok" ? `(${s.rows.length})` : SST[s.status]);
  const pk = $("#pk");
  pk.innerHTML = `<div class="pk-h"><b>اختر محتوى التقرير</b><span id="pkn" class="pk-n"></span><span class="sp"></span>
      <button type="button" class="rb sec sm" data-all="1">تحديد الكل</button><button type="button" class="rb sec sm" data-all="0">إلغاء الكل</button><button type="button" class="rb sec sm" data-acc-all="1">فتح الكل</button></div>
    <div class="pk-parts"><b>أجزاء التقرير:</b>${[["sum", "الملخص العام"], ["det", "الأقسام التفصيلية"], ["tl", "السجل الزمني الموحد"]].map(([k, t]) => `<label><input type="checkbox" data-part="${k}"${PART[k] ? " checked" : ""}> ${t}</label>`).join("")}<span class="pk-note">بطاقة التعريف تظهر دائماً.</span></div>
    <div class="pk-g">${sysAcc(systems)}</div>`;
  const syncBoxes = () => {
    accSync(pk, systems, SEL);
    const n = SEL.size, all = p.sections.length; $("#pkn").textContent = `${n} من ${all} قسماً`; $("#pkc").textContent = n === all ? "(الكل)" : `(${n}/${all})`;
  };
  const changed = () => { save(); syncBoxes(); draw(); };
  accBind(pk);
  pk.addEventListener("change", (e) => { const t = e.target;
    if (t.dataset.k) t.checked ? SEL.add(t.dataset.k) : SEL.delete(t.dataset.k);
    else if (t.dataset.sys != null) systems[+t.dataset.sys].secs.forEach((s) => (t.checked ? SEL.add(s.key) : SEL.delete(s.key)));
    else if (t.dataset.part) PART[t.dataset.part] = t.checked;
    changed(); });
  pk.addEventListener("click", (e) => { const b = e.target.closest("[data-all]"); if (!b) return; p.sections.forEach((s) => (b.dataset.all === "1" ? SEL.add(s.key) : SEL.delete(s.key))); if (b.dataset.all === "1") Object.keys(PART).forEach((k) => (PART[k] = true)); $$("[data-part]", pk).forEach((x) => (x.checked = PART[x.dataset.part])); changed(); });
  const pickBtn = $("#pick"); pickBtn.disabled = false;
  const openPick = (o) => { pk.hidden = !o; pickBtn.setAttribute("aria-expanded", String(o)); };
  pickBtn.onclick = () => openPick(pk.hidden);
  const fields = personFields(p, kind);
  let m, STAT = "";
  /* ===== طريقة العرض: «صفحات الطباعة» تعرض صفحات ReportKit نفسها التي ستُطبع، و«عرض للقراءة» ورقة متدفقة تناسب الجوال ===== */
  const VWK = "mr-report-view";
  let VW = (() => { try { return localStorage.getItem(VWK); } catch (_) { return null; } })() || (innerWidth < 700 ? "read" : "pages");
  const setVW = (v, keep) => { VW = v; if (!keep) try { localStorage.setItem(VWK, v); } catch (_) {}
    root.classList.toggle("vw-pages", v === "pages"); root.classList.toggle("vw-read", v === "read");
    $$("[data-vw]", root).forEach((b) => { b.classList.toggle("on", b.dataset.vw === v); b.setAttribute("aria-pressed", String(b.dataset.vw === v)); });
    if (v === "pages") queuePages(true); };
  let pvT = 0, pvSeq = 0, pvKey = "";
  const queuePages = (now) => { clearTimeout(pvT); if (VW !== "pages") return; pvT = setTimeout(renderPages, now ? 0 : 350); };
  const PW = 840; // عرض إطار المعاينة بالبكسل: صفحة A4 مع حاشيتها، ثابت حتى لا تنطبق قواعد الجوال على الصفحات
  const fitPv = () => { const pv = $("#pv"), fr = pv && pv.querySelector("iframe"); if (!fr || !fr.contentDocument) return;
    const z = Math.min(1, (pv.clientWidth - 4) / PW), h = fr.contentDocument.documentElement.scrollHeight;
    fr.style.height = h + "px"; fr.style.transform = `scale(${z})`; pv.querySelector(".pv-box").style.height = Math.ceil(h * z) + "px"; pv.querySelector(".pv-box").style.width = Math.ceil(PW * z) + "px"; };
  const renderPages = async () => {
    const pv = $("#pv"), seq = ++pvSeq;
    if ($("#go").disabled && !m) return;
    if (!window.ReportKit || !ReportKit.preview) { pv.innerHTML = `<p class="rp-note">تعذر تحميل أداة الطباعة الموحدة، فيُعرض التقرير للقراءة.</p>`; return setVW("read", true); }
    const o = rkOpts(), key = o.body; if (key === pvKey && pv.querySelector("iframe")) return fitPv();
    pv.classList.add("ld"); $("#rpst").textContent = "جارٍ تجهيز صفحات الطباعة…";
    let html; try { html = await ReportKit.preview(o); } catch (e) { console.error(e); html = null; }
    if (seq !== pvSeq) return;
    pv.classList.remove("ld");
    if (!html) { pv.innerHTML = `<p class="rp-note">تعذر تجهيز صفحات الطباعة، فيُعرض التقرير للقراءة.</p>`; $("#rpst").textContent = STAT; return setVW("read", true); }
    pvKey = key;
    pv.innerHTML = `<div class="pv-box"><iframe title="معاينة صفحات التقرير كما ستُطبع" scrolling="no" style="width:${PW}px"></iframe></div>`;
    const fr = pv.querySelector("iframe");
    fr.onload = () => { const d = fr.contentDocument; const st = d.createElement("style"); st.textContent = "html,body{background:transparent!important;overflow:hidden}#rkRoot{padding:6mm 0!important}#rkRoot .rk-page{margin:0 auto 14mm!important}"; d.head.appendChild(st);
      const n = d.querySelectorAll(".rk-page").length; $("#rpst").textContent = `${STAT} · ${n} ${n > 2 && n < 11 ? "صفحات" : "صفحة"}`; fitPv(); setTimeout(fitPv, 400); };
    fr.srcdoc = html;
  };
  addEventListener("resize", () => { clearTimeout(fitPv.t); fitPv.t = setTimeout(fitPv, 120); });
  $$("[data-vw]", root).forEach((b) => (b.onclick = () => setVW(b.dataset.vw)));
  const draw = () => {
  m = model({ ...p, sections: p.sections.filter((s) => SEL.has(s.key)) });
  const ORD = ["أولاً", "ثانياً", "ثالثاً"]; let oi = 0;
  const custom = SEL.size < p.sections.length || !PART.sum || !PART.det || !PART.tl;
  const mapRows = m.secs.filter((s) => s.n > 0 || s.status !== "ok"), zeroSecs = m.secs.filter((s) => s.status === "ok" && !s.n);
  const distM = {}; m.secs.forEach((s) => { if (s.n > 0) distM[s.system] = (distM[s.system] || 0) + s.n; });
  const dist = Object.entries(distM).sort((a, b) => b[1] - a[1]), distMax = Math.max(1, ...dist.map((x) => x[1]));
  const okSecs = m.secs.filter((s) => s.n > 0), emptySecs = m.secs.filter((s) => s.status === "ok" && !s.n);
  const groups = GROUPS[kind].map(([g, n]) => ({ n, secs: okSecs.filter((s) => s.grp === g) })).filter((x) => x.secs.length);
  $("#doc").innerHTML = `
  <article class="sheet">
    <header class="rp-uh">
      <div class="uh-k"><b>المملكة العربية السعودية</b><b>وزارة التعليم</b><span>الإدارة العامة للتعليم بمحافظة الأحساء</span><span>مدرسة لبيد بن ربيعة المتوسطة</span></div>
      <div class="uh-c"><span class="uh-core"><img src="${CORE_URL}assets/core-logo.svg" alt=""><span><b>النواة الرقمية</b><small>الهوية الموحدة</small></span></span><i class="uh-sep"></i><img class="uh-moe" src="${CORE_URL}assets/moe-logo.png" alt="وزارة التعليم"></div>
      <div class="uh-m"><div><span>التاريخ:</span><b>${esc(new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric" }))}</b></div><div><span>رقم التقرير:</span><b>يُصدر عند الطباعة</b></div></div>
    </header>
    <div class="rp-ubar" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="rp-uttl"><span class="k">مرآة | الملف الشامل · مدرسة لبيد بن ربيعة المتوسطة</span><h1>${esc(title)}</h1><p class="e">${esc(P.name)}${P.no ? " · " + esc(P.no) : ""}</p></div>

    <section class="rp-card">
      <div class="rp-card-h"><h2>${esc(P.name)}</h2><span>${kind === "student" ? "متعلم" : "معلم"}</span></div>
      <table class="rp-kv"><tbody>${pairs([["المعرّف الموحد", `<bdi dir="ltr" class="uuid">${esc(P.id)}</bdi>`], ...fields, ["تاريخ الاستخراج", `<bdi>${esc(p.generated_at)}</bdi> بتوقيت الرياض`]])}</tbody></table>
      ${P.pro?.headline ? `<p class="rp-pro"><b>الملف المهني (المجتمع المهني الذكي):</b> ${esc(P.pro.headline)}${(P.pro.subjects || []).length ? " · المواد: " + esc(P.pro.subjects.join("، ")) : ""}</p>` : ""}
    </section>

    ${custom ? `<p class="rp-note rp-custom">تقرير مخصص: يتضمن ${m.secs.length} قسماً من ${p.sections.length} في الملف الشامل، وفق اختيار المستخرج${[["sum", "الملخص العام"], ["det", "الأقسام التفصيلية"], ["tl", "السجل الزمني الموحد"]].filter(([k]) => !PART[k]).map(([, t]) => "، ودون " + t).join("")}.</p>` : ""}
    ${PART.sum ? `<section class="rp-block">
      <h2 class="rp-h">${ORD[oi++]}: الملخص العام</h2>
      <div class="rp-kpis"><div><b>${m.total}</b><span>سجلاً مرتبطاً</span></div><div><b>${m.withData}</b><span>قسماً فيه بيانات من ${m.secs.length}</span></div>
        ${m.ind.map(([n, v]) => `<div><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join("")}</div>
      ${dist.length ? `<h3 class="rp-g">توزيع السجلات حسب النظام</h3><div class="rp-dist">${dist.map(([n, v]) => `<div><span class="nm">${esc(n)}</span><span class="br"><i style="width:${Math.max(3, Math.round((100 * v) / distMax))}%"></i></span><b>${v}</b></div>`).join("")}</div>` : ""}
      ${mapRows.length ? `<h3 class="rp-g">الأقسام التي فيها سجلات · ${mapRows.length}</h3><table class="rp-t rp-map"><thead><tr><th>القسم</th><th>النظام المصدر</th><th>عدد السجلات</th></tr></thead>
        <tbody>${mapRows.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.system)}</td><td>${s.status === "ok" ? s.n : esc(SST[s.status])}</td></tr>`).join("")}</tbody></table>` : ""}
      ${zeroSecs.length ? `<p class="rp-note">أقسام لا سجلات فيها حالياً (${zeroSecs.length}): ${zeroSecs.map((s) => esc(s.title)).join("، ")}.</p>` : ""}
      ${m.issues.length ? `<p class="rp-warn">تنبيه: تعذرت القراءة من ${m.issues.map((s) => esc(s.title + " (" + s.system + ")")).join("، ")} وقت الاستخراج، فلا يتضمن التقرير سجلاتها.</p>` : ""}
      ${m.restricted.length ? `<p class="rp-note">أقسام لم تُعرض لأنها مقيدة بصلاحيات أنظمتها: ${m.restricted.map((s) => esc(s.title)).join("، ")}.</p>` : ""}
    </section>` : ""}

    ${PART.det ? `<section class="rp-block">
      <h2 class="rp-h">${ORD[oi++]}: الأقسام التفصيلية</h2>
      ${groups.length ? groups.map((G) => `<h3 class="rp-g">${esc(G.n)}</h3>${G.secs.map((s) => `
        <section class="rp-sec">
          <table class="rp-t"><caption><b>${esc(s.title)}</b><span>المصدر: ${esc(s.system)} · ${s.n} ${s.n > 10 ? "سجلاً" : "سجلات"}</span></caption>
            <thead><tr>${s.cols.map(([, h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
            <tbody>${s.rows.map((r) => `<tr class="${r.dup ? "dup" : ""}">${s.cols.map(([k]) => `<td>${rCell(k, r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>
          ${s.rows.some((r) => r.dup) ? `<p class="rp-fn">القيود المظللة تقابل أحداثاً واردة في أقسامها الأصلية، ولم تُكرر في السجل الزمني.</p>` : ""}
          ${s.note ? `<p class="rp-fn">${esc(s.note)}</p>` : ""}
        </section>`).join("")}`).join("") : `<p class="rp-note">لا توجد سجلات مرتبطة بهذا الملف في الأنظمة المتاحة.</p>`}
      ${emptySecs.length && !PART.sum ? `<p class="rp-note">أقسام لا تتوفر فيها بيانات حالياً: ${emptySecs.map((s) => esc(s.title) + " (" + esc(s.system) + ")").join("، ")}.</p>` : ""}
    </section>` : ""}

    ${PART.tl ? `<section class="rp-block">
      <h2 class="rp-h">${ORD[oi++]}: السجل الزمني الموحد</h2>
      ${m.tl.length ? `<table class="rp-t rp-tl"><caption><span>${m.tl.length} حدثاً من الأحدث إلى الأقدم</span></caption>
        <thead><tr><th>التاريخ</th><th>الحدث</th><th>الوصف</th><th>النظام المصدر</th><th>الحالة</th></tr></thead>
        <tbody>${m.tl.map((x) => `<tr><td>${rDate(x.d)}</td><td>${esc(x.ev)}</td><td>${esc(lbl(x.ds) === "—" ? "" : lbl(x.ds))}</td><td>${esc(x.src)}</td><td>${esc(x.st ? lbl(x.st) : "—")}</td></tr>`).join("")}</tbody></table>`
        : `<p class="rp-note">لا توجد أحداث مؤرخة ضمن الأقسام المختارة.</p>`}
    </section>` : ""}

    <footer class="rp-end">هذا التقرير نافذة استعلامية على البيانات الموجودة في أنظمة النواة الرقمية لحظة استخراجه، ولا يُنشئ أي بيانات جديدة.
      المرجع في أي سجل هو نظامه المصدر المذكور بجانبه. صدر هذا التقرير من حساب: ${esc(who.name)}.</footer>
    <div class="rp-uft"><div class="rp-ubar" aria-hidden="true"><i></i><i></i><i></i></div><div class="uf"><span class="uf-s"><img src="favicon.svg" alt=""><span><small>صدر هذا التقرير من</small><b>مرآة | الملف الشامل</b></span></span><span class="uf-m">${esc(new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric" }))} · بواسطة ${esc(who.name)}<br>مدرسة لبيد بن ربيعة المتوسطة</span><span class="uf-s"><span><small>أحد أنظمة</small><b>النواة الرقمية</b></span><img src="${CORE_URL}assets/core-logo.svg" alt=""></span></div></div>
  </article>`;
  const empty = !SEL.size || (!PART.sum && !PART.det && !PART.tl);
  $("#go").disabled = empty;
  $("#rpst").classList.remove("bad");
  STAT = empty ? "اختر قسماً واحداً وجزءاً واحداً على الأقل من محتوى التقرير." : `${m.secs.length} قسماً · ${m.total} سجلاً · ${m.tl.length} حدثاً في السجل الزمني`;
  $("#rpst").textContent = STAT;
  queuePages();
  };
  setVW(VW, true); draw(); syncBoxes();
  if (qs.get("pick") === "1") openPick(true);
  await (document.fonts?.ready || Promise.resolve());
  const go = $("#go"); draw();
  const doPrint = async () => {
    if (go.disabled) return; openPick(false);
    go.disabled = true;
    try { await rpc("mr_log_export", { p_kind: kind, p_id: id }); await printUnified(); }
    catch (e) { $("#rpst").textContent = "تعذر تسجيل عملية التصدير، فلم يُصدَّر التقرير: " + mapErr(e); $("#rpst").classList.add("bad"); }
    go.disabled = false;
  };
  /* الطباعة بالهوية الموحدة للنواة الرقمية (ReportKit): ترويستها وتذييلها ورمز التحقق في كل صفحة.
     يُمرَّر المحتوى مسطّحاً (عناوين ثم جداول) ليُقسَّم على الصفحات صفاً صفاً، ويُستغنى عن رأس مرآة القديم لأن الترويسة الموحدة تحل محله */
  const rkBody = () => {
    const out = [], sh = $("#doc .sheet"); if (!sh) return "";
    let grp = "", parts = 0;
    const walk = (el) => { for (const n of el.children) {
      if (n.matches(".rp-head,.rp-uh,.rp-ubar,.rp-uttl,.rp-uft")) continue;
      // عنوان المجموعة يُدمج في عنوان أول جدول بعده حتى لا يبقى وحيداً أسفل الصفحة
      // كل نظام (مجموعة في الأقسام التفصيلية) وكل جزء بعد الملخص يبدأ بصفحة جديدة في المطبوع
      if (n.matches(".rp-g") && n.nextElementSibling && n.nextElementSibling.matches(".rp-sec")) { if (!(n.previousElementSibling && n.previousElementSibling.matches("h2.rp-h"))) out.push('<div class="rk-break"></div>'); grp = n.textContent.trim(); continue; }
      if (n.matches("h2.rp-h") && parts++) out.push('<div class="rk-break"></div>');
      if (n.matches(".rp-block,.rp-sec")) { walk(n); continue; }
      if (n.tagName === "TABLE" && n.caption) { const c = n.cloneNode(true), cap = c.caption; out.push(`<h3 class="rp-cap">${grp ? `<em class="rp-gx">${esc(grp)}</em>` : ""}${cap.innerHTML}</h3>`); grp = ""; cap.remove(); out.push(c.outerHTML); continue; }
      out.push(n.outerHTML);
    } };
    walk(sh); return out.join("");
  };
  const RKCSS = ".rp-cap{display:flex;flex-wrap:wrap;gap:2mm 6mm;justify-content:space-between;align-items:baseline;font-size:10.5pt;color:#0d2b45;margin:3mm 0 1.5mm}.rp-cap span{font-weight:400;font-size:8.5pt;color:#5b7a8a}.rp-t{width:100%}.rp-gx{flex:1 1 100%;display:flex;align-items:center;gap:2mm;font-style:normal;font-size:11.5pt;font-weight:800;color:#0c6f82;margin:2mm 0 1mm}.rp-gx::before{content:'';width:2.4mm;height:2.4mm;border-radius:50%;background:#f0b34a}";
  /* أنماط التقرير دون قواعد @page (حتى لا يتكرر ترقيم مرآة القديم مع تذييل الهوية الموحدة) */
  const repCss = () => "<style>" + [...document.styleSheets].filter((sh) => sh.href && /report\.css/.test(sh.href)).map((sh) => { try { return [...sh.cssRules].filter((r) => !(window.CSSPageRule && r instanceof CSSPageRule)).map((r) => r.cssText).join("\n"); } catch (_) { return ""; } }).join("\n") + "</style>";
  const rkOpts = () => ({ system: "mirat", systemName: "مرآة | الملف الشامل", title, sub: P.name + (P.no ? " · " + P.no : ""), issuer: who.name, fname: title + " – " + P.name, body: rkBody(), inherit: repCss(), styles: RKCSS });
  const printUnified = async () => {
    if (!window.ReportKit || !ReportKit.print) return window.print();
    const ok = await ReportKit.print(rkOpts());
    if (ok === false) window.print();
  };
  go.onclick = doPrint;
  window.__ready = true;
  if (qs.get("print") === "1") setTimeout(doPrint, 400);
}, { bare: true });
function pairs(list) { const out = []; for (let i = 0; i < list.length; i += 2) out.push(`<tr><th>${esc(list[i][0])}</th><td>${list[i][1]}</td>${list[i + 1] ? `<th>${esc(list[i + 1][0])}</th><td>${list[i + 1][1]}</td>` : "<th></th><td></td>"}</tr>`); return out.join(""); }
