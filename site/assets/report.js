/* مرآة: تقرير الملف الشامل للطباعة والتصدير PDF.
   تنسيق طباعة مستقل (ليس صورة للصفحة): نصوص وجداول حقيقية، A4 عمودي، هوامش 15 مم، رأس وتذييل وترقيم تلقائي. */
const cssStr = (s) => '"' + String(s ?? "").replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ") + '"';
const plain = (k, v) => (v == null || v === "" ? "—" : k === "st" || LBL_COLS.has(k) ? lbl(v) : String(v));
const rDate = (v) => (isDay(v) ? `<bdi class="nw">${esc(String(v).slice(0, 10))}</bdi>${String(v).length > 10 ? `<span class="tm">${esc(fmtHM(String(v).slice(11, 16)))}</span>` : ""}<span class="hj">${esc(fmtHijri(v))}</span>` : esc(v ?? "—"));
const rCell = (k, v) => ((k === "d" || /_d$|^due$|^review$|^sub$|^joined$|^first$|^last$/.test(k)) && isDay(v) ? rDate(v) : esc(plain(k, v)));

PAGES.report = () => boot("report.html", async (root) => {
  const kind = qs.get("k") === "staff" ? "staff" : "student", id = qs.get("id") || "";
  root.innerHTML = `<div class="rp-bar no-print"><div class="rp-bar-in"><b>معاينة التقرير</b><span id="rpst" class="rp-st">جارٍ جمع السجلات…</span>
    <span class="sp"></span><a class="rb sec" href="profile.html?k=${kind}&id=${encodeURIComponent(id)}">العودة إلى الملف</a><button class="rb" id="go" disabled>تصدير الملف الشامل PDF</button></div>
    <p class="rp-tip">في نافذة الطباعة اختر «حفظ بتنسيق PDF»، والمقاس A4، والاتجاه عمودي، والهوامش «الافتراضية»، وألغِ خيار «الرؤوس والتذييلات» الخاص بالمتصفح. أفضل نتيجة من متصفح Chrome أو Edge.</p></div>
    <div id="doc" class="rp-doc"></div>`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) { $("#rpst").textContent = "رابط غير صحيح."; return; }
  let p;
  try { p = await rpc(kind === "student" ? "mr_student_profile" : "mr_staff_profile", { p_id: id }); }
  catch (e) { $("#rpst").textContent = mapErr(e); $("#rpst").classList.add("bad"); return; }
  const m = model(p), P = p.person, title = "الملف الشامل " + (kind === "student" ? "للمتعلم" : "للمعلم");
  document.title = title + " – " + P.name;
  // الرأس والتذييل في هوامش كل صفحة (CSS Paged Media)، مع الترقيم التلقائي
  const st = document.createElement("style");
  st.textContent = `@page{@top-right{content:${cssStr("مرآة | الملف الشامل · متوسطة لبيد بن ربيعة المتوسطة")}}@top-left{content:${cssStr(P.name + (P.no ? " · " + P.no : ""))}}
    @bottom-right{content:${cssStr("تاريخ الاستخراج: " + p.generated_at)}}}`;
  document.head.appendChild(st);

  const fields = personFields(p, kind);
  const okSecs = m.secs.filter((s) => s.n > 0), emptySecs = m.secs.filter((s) => s.status === "ok" && !s.n);
  const groups = GROUPS[kind].map(([g, n]) => ({ n, secs: okSecs.filter((s) => s.grp === g) })).filter((x) => x.secs.length);
  $("#doc").innerHTML = `
  <article class="sheet">
    <header class="rp-head">
      <div class="rp-org"><b>المملكة العربية السعودية · وزارة التعليم</b><span>متوسطة لبيد بن ربيعة المتوسطة</span><span>النواة الرقمية · منصة مرآة</span></div>
      <div class="rp-logo" aria-hidden="true">${LOGO}</div>
      <div class="rp-ttl"><h1>${esc(title)}</h1><span>تقرير استعلامي من الأنظمة القائمة</span></div>
    </header>

    <section class="rp-card">
      <div class="rp-card-h"><h2>${esc(P.name)}</h2><span>${kind === "student" ? "متعلم" : "معلم"}</span></div>
      <table class="rp-kv"><tbody>${pairs([["المعرّف الموحد", `<bdi dir="ltr" class="uuid">${esc(P.id)}</bdi>`], ...fields, ["تاريخ الاستخراج", `<bdi>${esc(p.generated_at)}</bdi> بتوقيت الرياض`]])}</tbody></table>
      ${P.pro?.headline ? `<p class="rp-pro"><b>الملف المهني (مجتمع لبيد المهني):</b> ${esc(P.pro.headline)}${(P.pro.subjects || []).length ? " · المواد: " + esc(P.pro.subjects.join("، ")) : ""}</p>` : ""}
    </section>

    <section class="rp-block">
      <h2 class="rp-h">أولاً: الملخص العام</h2>
      <div class="rp-kpis"><div><b>${m.total}</b><span>سجلاً مرتبطاً</span></div><div><b>${m.withData}</b><span>قسماً فيه بيانات من ${m.secs.length}</span></div>
        ${m.ind.map(([n, v]) => `<div><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join("")}</div>
      <table class="rp-t rp-map"><thead><tr><th>القسم</th><th>النظام المصدر</th><th>عدد السجلات</th></tr></thead>
        <tbody>${m.secs.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.system)}</td><td>${s.status === "ok" ? s.n : esc(SST[s.status])}</td></tr>`).join("")}</tbody></table>
      ${m.issues.length ? `<p class="rp-warn">تنبيه: تعذرت القراءة من ${m.issues.map((s) => esc(s.title + " (" + s.system + ")")).join("، ")} وقت الاستخراج، فلا يتضمن التقرير سجلاتها.</p>` : ""}
      ${m.restricted.length ? `<p class="rp-note">أقسام لم تُعرض لأنها مقيدة بصلاحيات أنظمتها: ${m.restricted.map((s) => esc(s.title)).join("، ")}.</p>` : ""}
    </section>

    <section class="rp-block">
      <h2 class="rp-h">ثانياً: الأقسام التفصيلية</h2>
      ${groups.length ? groups.map((G) => `<h3 class="rp-g">${esc(G.n)}</h3>${G.secs.map((s) => `
        <section class="rp-sec">
          <table class="rp-t"><caption><b>${esc(s.title)}</b><span>المصدر: ${esc(s.system)} · ${s.n} ${s.n > 10 ? "سجلاً" : "سجلات"}</span></caption>
            <thead><tr>${s.cols.map(([, h]) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
            <tbody>${s.rows.map((r) => `<tr class="${r.dup ? "dup" : ""}">${s.cols.map(([k]) => `<td>${rCell(k, r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>
          ${s.rows.some((r) => r.dup) ? `<p class="rp-fn">القيود المظللة تقابل أحداثاً واردة في أقسامها الأصلية، ولم تُكرر في السجل الزمني.</p>` : ""}
          ${s.note ? `<p class="rp-fn">${esc(s.note)}</p>` : ""}
        </section>`).join("")}`).join("") : `<p class="rp-note">لا توجد سجلات مرتبطة بهذا الملف في الأنظمة المتاحة.</p>`}
      ${emptySecs.length ? `<p class="rp-note">أقسام لا تتوفر فيها بيانات حالياً: ${emptySecs.map((s) => esc(s.title) + " (" + esc(s.system) + ")").join("، ")}.</p>` : ""}
    </section>

    <section class="rp-block">
      <h2 class="rp-h">ثالثاً: السجل الزمني الموحد</h2>
      ${m.tl.length ? `<table class="rp-t rp-tl"><caption><span>${m.tl.length} حدثاً من الأحدث إلى الأقدم</span></caption>
        <thead><tr><th>التاريخ</th><th>الحدث</th><th>الوصف</th><th>النظام المصدر</th><th>الحالة</th></tr></thead>
        <tbody>${m.tl.map((x) => `<tr><td>${rDate(x.d)}</td><td>${esc(x.ev)}</td><td>${esc(lbl(x.ds) === "—" ? "" : lbl(x.ds))}</td><td>${esc(x.src)}</td><td>${esc(x.st ? lbl(x.st) : "—")}</td></tr>`).join("")}</tbody></table>`
        : `<p class="rp-note">لا توجد أحداث مؤرخة مرتبطة بهذا الملف.</p>`}
    </section>

    <footer class="rp-end">هذا التقرير نافذة استعلامية على البيانات الموجودة في أنظمة النواة الرقمية لحظة استخراجه، ولا يُنشئ أي بيانات جديدة.
      المرجع في أي سجل هو نظامه المصدر المذكور بجانبه. استُخرج بواسطة: ${esc(window.__mr?.name || "")}.</footer>
  </article>`;
  await (document.fonts?.ready || Promise.resolve());
  const go = $("#go"); go.disabled = false; $("#rpst").textContent = `${m.total} سجلاً · ${m.tl.length} حدثاً في السجل الزمني`;
  const doPrint = async () => {
    go.disabled = true;
    try { await rpc("mr_log_export", { p_kind: kind, p_id: id }); window.print(); }
    catch (e) { $("#rpst").textContent = "تعذر تسجيل عملية التصدير، فلم يُصدَّر التقرير: " + mapErr(e); $("#rpst").classList.add("bad"); }
    go.disabled = false;
  };
  go.onclick = doPrint;
  window.__ready = true;
  if (qs.get("print") === "1") setTimeout(doPrint, 400);
}, { bare: true });
function pairs(list) { const out = []; for (let i = 0; i < list.length; i += 2) out.push(`<tr><th>${esc(list[i][0])}</th><td>${list[i][1]}</td>${list[i + 1] ? `<th>${esc(list[i + 1][0])}</th><td>${list[i + 1][1]}</td>` : "<th></th><td></td>"}</tr>`); return out.join(""); }
