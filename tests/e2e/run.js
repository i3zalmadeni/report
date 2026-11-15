// اختبار واجهات «مرآة» وتقرير PDF على خادم المعاينة المحلي (tests/e2e/server.js) بمتصفح حقيقي.
// الاستخدام: tests/e2e/reset.sh ثم node tests/e2e/run.js
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const BASE = "http://localhost:8787", OUT = process.env.OUT || "/tmp/mr-shots";
const U = { admin: "a0000000-0000-0000-0000-000000000001", viewer: "a0000000-0000-0000-0000-000000000002", teacher: "a0000000-0000-0000-0000-000000000003", counselor: "a0000000-0000-0000-0000-000000000004" };
const S1 = "40000000-0000-0000-0000-000000000001", S9 = "40000000-0000-0000-0000-000000000009", T3 = "30000000-0000-0000-0000-000000000003";
const MOCK = fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8");
const psql = (sql) => execFileSync("psql", ["-U", "postgres", "-d", "mirat_e2e", "-tAq", "-c", sql], { encoding: "utf8" }).trim();
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, n) => { console.log((c ? "PASS: " : "FAIL: ") + n); if (!c) fails++; };
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });
// pdftotext يضيف محارف اتجاه، ويفكك ربطة «لا» إلى «ال»، فنوحّد النص المستخرج والنص المقارن بالطريقة نفسها
const N = (t) => String(t).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u0651]/g, "").replace(/ل([اأإآ])/g, "$1ل").replace(/[ \t]+/g, " ");

(async () => {
  const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const open = async (user, w = 1280, h = 900) => {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, locale: "ar-SA", timezoneId: "Asia/Riyadh", isMobile: w < 600, hasTouch: w < 600 });
    await ctx.route(/cdn\.jsdelivr\.net/, (r) => r.fulfill({ contentType: "text/javascript", body: MOCK }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((u) => { u ? localStorage.setItem("preview_user", u) : localStorage.removeItem("preview_user"); window.print = () => { window.__printed = (window.__printed || 0) + 1; }; }, user);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.errs = errs; return p;
  };
  const shot = async (p, n) => { await p.waitForTimeout(500); return p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };

  // 0) الصفحات العامة: الرئيسية و«عن مرآة» دون دخول ودون أي بيانات
  for (const [pg, sel, txt] of [["index.html", ".tk-g", "ماذا يقدم الملف الشامل؟"], ["about.html", "#ab-faq", "أسئلة متوقعة"]]) {
    const q = await open(null); await q.goto(`${BASE}/${pg}`); await q.waitForSelector(sel);
    ok((await q.textContent("body")).includes(txt) && !(await q.content()).includes("mr_"), `[${pg}] الصفحة العامة تعمل دون دخول`);
    ok((await q.$$("header nav a")).length >= 3, `[${pg}] الترويسة العامة: الرئيسية، عن مرآة، الاستعلام`);
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `[${pg}] لا تمرير أفقي`);
    for (let y = 0; y < 9000; y += 500) { await q.evaluate((v) => scrollTo(0, v), y); await q.waitForTimeout(120); } await q.evaluate(() => scrollTo(0, 0)); await q.waitForTimeout(1200); await q.screenshot({ path: `${OUT}/00-${pg}.png`, fullPage: true });
    ok(q.errs.length === 0, `[${pg}] لا أخطاء JavaScript: ` + q.errs.join(" | "));
  }

  // 1) بلا جلسة: تحويل إلى الدخول، ولا بيانات
  let p = await open(null);
  await p.goto(`${BASE}/profile.html?k=student&id=${S1}`); await p.waitForURL(/login\.html/);
  ok(/login\.html\?next=profile\.html/.test(p.url()), "الملف لا يُفتح دون دخول");

  // 2) معلم بلا صلاحية
  p = await open(U.teacher);
  await p.goto(`${BASE}/search.html`); await p.waitForSelector("text=لا تملك صلاحية الاطلاع");
  ok(!(await p.$("#q")), "المعلم غير المخوّل لا يرى البحث");
  await p.goto(`${BASE}/profile.html?k=student&id=${S1}`); await p.waitForSelector("text=لا تملك صلاحية الاطلاع");
  ok(!(await p.content()).includes("أحمد"), "ولا يصل إلى بيانات المتعلم");

  // 3) المطّلع المخوّل: البحث ثم الملف
  p = await open(U.viewer, 1024, 1300); // مقاس الآيباد تقريباً
  await p.goto(`${BASE}/search.html`); await p.waitForSelector("#q");
  ok(!(await p.$("form input:not([type=search]):not([type=hidden]), textarea")), "لا توجد حقول إدخال بيانات في واجهة البحث");
  await p.fill("#q", "احمد"); await p.waitForSelector(".mr-hit");
  ok((await p.$$(".mr-hit")).length === 1 && (await p.textContent(".mr-hit")).includes("الثاني المتوسط"), "البحث بتوحيد الهمزة يعرض الصف الحالي");
  await shot(p, "01-search-ipad");
  await p.click(".mr-hit"); await p.waitForSelector("#tl");
  ok((await p.textContent(".mr-id h2")) === "أحمد عبدالله الحربي", "فتح الملف الشامل للمتعلم المختار");
  ok((await p.$$("#s-attendance tbody tr")).length === 2, "قسم الحضور يعرض سجلي الغياب");
  ok((await p.textContent("#s-incidents")).includes("مقيد بصلاحيات"), "الحالات السلوكية مقيدة لغير المخول في قيمي");
  ok(!(await p.content()).includes("وصف حساس"), "لا يتسرب وصف الحالة الحساسة");
  ok((await p.$$("#s-points tbody tr.dup")).length === 2, "القيود المرتبطة بأحداث أخرى مظللة");
  const tl = await p.$$eval("#tlist li", (l) => l.map((x) => x.querySelector("b").textContent));
  ok(tl.filter((x) => x === "قيد نقاط").length === 1 && tl.includes("تعزيز") && tl.includes("وسام"), "السجل الزمني بلا تكرار: قيد التصحيح فقط من دفتر النقاط");
  const dates = await p.$$eval("#tlist li", (l) => l.length);
  ok(dates === 8, "عدد أحداث السجل الزمني 8 (قيدان، غيابان، تأخر، تعزيز، وسام، تصحيح): " + dates);
  ok((await p.textContent(".mr-src")).length > 0 && (await p.$$(".mr-sec .mr-src")).length === (await p.$$(".mr-sec")).length, "كل قسم يُظهر نظامه المصدر");
  ok(await p.$eval("html", (e) => getComputedStyle(e).direction === "rtl"), "اتجاه الصفحة RTL");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "لا تمرير أفقي على الآيباد");
  await shot(p, "02-student-profile-ipad");
  ok(p.errs.length === 0, "لا أخطاء JavaScript (المطّلع): " + p.errs.join(" | "));

  // 3ب) شريط الأنظمة في الملف: تفاعل مباشر، ومشترك مع التقرير
  p = await open(U.viewer);
  await p.goto(`${BASE}/profile.html?k=student&id=${S1}`); await p.waitForSelector("#tl");
  const row = (n) => `#flt .mr-ar:has(.tx b:text-is("${n}"))`;
  const rows = await p.$$eval("#flt .mr-ar .tx b", (l) => l.map((x) => x.textContent));
  ok(rows.join(",") === "النواة الرقمية,انضباطي,قيمي", "صف لكل نظام في أعلى الملف: " + rows.join(","));
  ok(await p.$$eval("#flt [data-sys]", (l) => l.every((b) => b.checked)) && await p.$$eval("#flt .mr-ar-b", (l) => l.every((x) => x.hidden)), "الافتراضي: كل الأنظمة ظاهرة، والألسنة مطوية");
  await p.click(`${row("قيمي")} [data-acc]`);
  ok(await p.isVisible(`${row("قيمي")} [data-k="reinforcements"]`) && (await p.getAttribute(`${row("قيمي")} [data-acc]`, "aria-expanded")) === "true", "اللسان يفتح أقسام النظام");
  ok((await p.$$eval(`${row("قيمي")} .mr-ai em`, (l) => l.map((e) => e.textContent).join(","))).startsWith("1,2,3"), "أقسام النظام مرقّمة داخل لسانه");
  await p.click(`${row("قيمي")} [data-acc]`); ok(await p.isHidden(`${row("قيمي")} .mr-ar-b`), "اللسان يُطوى");
  await p.click(`${row("قيمي")} [data-sys]`);
  ok(!(await p.$("#s-reinforcements")) && (await p.$("#s-attendance")) && !(await p.$$eval("#tlist li b", (l) => l.map((x) => x.textContent))).includes("تعزيز"), "إخفاء قيمي يحذف أقسامه وأحداثه مباشرة");
  ok((await p.textContent(`${row("قيمي")} .mr-ar-n`)) === "مخفي" && (await p.textContent(".mr-custom")).includes("عرض مخصص"), "شارة الصف وتنبيه العرض المخصص");
  await p.click(`${row("انضباطي")} [data-acc]`); await p.click(`${row("انضباطي")} [data-k="lateness"]`);
  ok(!(await p.$("#s-lateness")) && await p.$eval(`${row("انضباطي")} [data-sys]`, (b) => b.indeterminate) && (await p.textContent(`${row("انضباطي")} .mr-ar-n`)).includes("من"), "تخصيص قسم داخل النظام، والصف يظهر اختياراً جزئياً");
  await p.goto(`${BASE}/report.html?k=student&id=${S1}`); await p.waitForFunction(() => window.__ready === true);
  ok(!(await p.$eval('#pk [data-k="reinforcements"]', (b) => b.checked)) && !(await p.textContent("#doc")).includes("سجل القيم والتعزيز"), "التقرير يتبع اختيار العرض نفسه");
  await p.goBack(); await p.waitForSelector("#flt"); await p.click('#flt [data-all="0"]');
  ok((await p.textContent("#mrc")).includes("لم تختر أي نظام"), "إخفاء الكل يعرض رسالة واضحة");
  await p.click('#mrc [data-all="1"]');
  ok((await p.$("#s-reinforcements")) && (await p.$("#s-lateness")) && !(await p.$(".mr-custom")), "عرض كل الأنظمة من جديد");
  await p.click("#flt [data-acc-all]");
  ok(await p.$$eval("#flt .mr-ar-b", (l) => l.every((x) => !x.hidden)) && (await p.textContent("#flt [data-acc-all]")) === "طي الكل", "فتح كل الألسنة دفعة واحدة");
  await p.screenshot({ path: `${OUT}/02b-filter-bar.png`, clip: { x: 0, y: 0, width: 1280, height: 1100 } });
  ok(p.errs.length === 0, "لا أخطاء JavaScript في شريط الأنظمة: " + p.errs.join(" | "));

  // 4) المدير: ملف المعلم
  p = await open(U.admin);
  await p.goto(`${BASE}/search.html?k=staff`); await p.waitForSelector("#q"); await p.fill("#q", "4455667"); await p.waitForSelector(".mr-hit");
  ok((await p.textContent(".mr-hit")).includes("إبراهيم المعلم"), "بحث المعلم بالرقم الوظيفي للمخول");
  await p.goto(`${BASE}/profile.html?k=staff&id=${T3}`); await p.waitForSelector("#tl");
  ok((await p.textContent("#s-plans")).includes("مشروع نافس للرياضيات") && !(await p.textContent("#s-plans")).includes("لا يخصه"), "الخطط الذكية مربوطة بمعرّف المعلم فقط");
  ok((await p.textContent("#s-contrib")).includes("تعزيزات منحها للطلاب") && !(await p.textContent("#s-contrib")).includes("أحمد"), "الإسهامات مجمّعة دون أسماء الطلاب");
  ok((await p.textContent(".mr-pro")).includes("معلم رياضيات"), "الملف المهني من مجتمع لبيد المهني");
  const spRows = await p.$$eval("#s-sp_programs tbody tr", (l) => l.map((r) => r.textContent));
  ok(spRows.length === 2 && spRows.some((t) => t.includes("PL-002") && t.includes("{تجريبي}") && t.includes("1")) && spRows.some((t) => t.includes("PL-014")) && !spRows.some((t) => t.includes("PL-020")),
    "البرامج المسندة: بالاسم الموحّد وبتعديل المنسق، دون برامج غيره: " + spRows.join(" | "));
  ok((await p.$$("#s-sp_exec tbody tr")).length === 1, "توثيقات التنفيذ التي سجّلها المعلم");
  ok((await p.$$("#s-se_assign tbody tr")).length === 3 && (await p.textContent("#s-se_assign")).includes("التقدم") && (await p.textContent("#s-se_assign")).includes("ضمن مجال"), "المؤشرات المسندة مفصّلة: المباشرة وعبر المجال مع حالة التقييم");
  ok((await p.$$eval("#tlist li b", (l) => l.map((x) => x.textContent))).includes("توثيق تنفيذ برنامج"), "توثيق التنفيذ في السجل الزمني");
  await shot(p, "03-staff-profile");
  ok(p.errs.length === 0, "لا أخطاء JavaScript (المدير): " + p.errs.join(" | "));

  // 5) التقرير: معاينة ثم تصدير PDF
  const exportsBefore = +psql("select count(*) from audit_logs where action = 'EXPORT'");
  for (const [n, k, id] of [["student", "student", S1], ["staff", "staff", T3], ["stress", "student", S9]]) {
    p = await open(U.admin);
    await p.goto(`${BASE}/report.html?k=${k}&id=${id}`); await p.waitForFunction(() => window.__ready === true);
    await shot(p, `04-report-preview-${n}`);
    await p.emulateMedia({ media: "print" });
    // لا عنصر يتجاوز عرض منطقة الطباعة: 210 - 15 - 15 = 180 مم
    const over = await p.evaluate(() => { const W = (180 / 25.4) * 96 + 1, out = []; document.querySelectorAll(".sheet *").forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 8 || r.left < -1)) out.push(e.tagName + "." + e.className + ":" + Math.round(r.right)); }); return out.slice(0, 5); });
    await p.setViewportSize({ width: Math.round((180 / 25.4) * 96), height: 1000 });
    const over2 = await p.evaluate(() => { const out = []; const W = document.querySelector(".sheet").getBoundingClientRect().right + 1; document.querySelectorAll(".sheet *").forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W || r.left < -1)) out.push(e.tagName + "." + e.className); }); return out.slice(0, 5); });
    ok(over2.length === 0, `[${n}] لا يتجاوز أي عنصر عرض منطقة الطباعة (180 مم): ${over2.join(", ")}`);
    const pdf = `${OUT}/report-${n}.pdf`;
    await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const info = sh("pdfinfo", [pdf]);
    const pages = +info.match(/Pages:\s+(\d+)/)[1];
    ok(/Page size:\s+59[45]\.\d+ x 841\.\d+ pts \(A4\)/.test(info), `[${n}] مقاس الصفحة A4 عمودي (${(info.match(/Page size:.*/) || [""])[0]})`);
    const fonts = sh("pdffonts", [pdf]).split("\n").slice(2).filter(Boolean);
    ok(fonts.length > 0 && fonts.every((l) => / yes /.test(l.slice(60))), `[${n}] الخطوط مضمنة في الملف`);
    const txt = N(sh("pdftotext", ["-layout", pdf, "-"])), pg = txt.split("\f").filter((x) => x.trim());
    ok(pg.length === pages, `[${n}] ${pages} صفحة`);
    ok(pg.every((t, i) => t.includes("مرآة | الملف الشامل") && new RegExp(`صفحة\\s*${i + 1}\\s*من\\s*${pages}`).test(t)), `[${n}] رأس وترقيم «صفحة س من ص» في كل صفحة`);
    const by = N("صدر التقرير من حساب: مدير الاختبار");
    ok(pg.every((t) => t.replace(/\s+/g, "").includes(by.replace(/\s+/g, ""))), `[${n}] كل صفحة مذيلة باسم الحساب الذي صدر منه التقرير`);
    ok(txt.includes(n === "staff" ? "إبراهيم المعلم" : n === "stress" ? "عبدالرحمن بن خالد" : "أحمد عبدالله الحربي"), `[${n}] النص العربي قابل للاستخراج بترتيب صحيح`);
    // لا يبقى عنوان قسم أو مجموعة في آخر الصفحة دون محتواه
    const heads = (await p.$$eval(".rp-g, .rp-h, .rp-t caption b", (l) => l.map((e) => e.textContent.trim()))).map(N);
    const orphan = pg.slice(0, -1).map((t) => t.split("\n").map((s) => s.trim()).filter((s) => s && !/صفحة\s*\d+\s*من|بتوقيت|الستخراج/.test(s)).pop() || "")
      .filter((last) => heads.some((h) => last === h || last === h.replace(/^(أولاً|ثانياً|ثالثاً): /, "")));
    ok(orphan.length === 0, `[${n}] لا عناوين يتيمة في نهاية الصفحات: ${orphan.join(" | ")}`);
    // بطاقة التعريف في صفحة واحدة
    ok(pg[0].includes("الموحد") && pg[0].includes("بتوقيت") && pg[0].includes("الرياض"), `[${n}] بطاقة التعريف كاملة في الصفحة الأولى`);
    if (n === "stress") {
      ok(pages >= 3, `[stress] الجداول الطويلة تنتقل عبر ${pages} صفحات`);
      const thPages = pg.filter((t) => /الوصول/.test(t)).length;
      ok(thPages >= 2, `[stress] رأس جدول التأخر يتكرر في كل صفحة يمتد إليها (${thPages})`);
      sh("pdftoppm", ["-r", "60", "-png", pdf, `${OUT}/stress`]);
    } else sh("pdftoppm", ["-r", "70", "-png", "-f", "1", "-l", "2", pdf, `${OUT}/${n}`]);
    await p.emulateMedia({ media: "screen" });
    await p.click("#go"); await p.waitForFunction(() => window.__printed === 1);
    ok(p.errs.length === 0, `[${n}] لا أخطاء JavaScript في التقرير: ` + p.errs.join(" | "));
  }
  ok(+psql("select count(*) from audit_logs where action = 'EXPORT'") >= exportsBefore + 3, "كل تصدير مسجل في سجل عمليات النواة");

  // 5ب) اختيار محتوى التقرير قبل التصدير
  p = await open(U.admin);
  await p.goto(`${BASE}/report.html?k=student&id=${S1}&pick=1`); await p.waitForFunction(() => window.__ready === true);
  ok(await p.isVisible("#pk"), "لوحة محتوى التقرير مفتوحة عند الدخول من زر التصدير");
  ok((await p.$$eval("#pk [data-k]", (l) => l.every((b) => b.checked))) && (await p.textContent("#pkc")).includes("الكل"), "الافتراضي: كل الأقسام محددة");
  const qm = '#pk .mr-ar:has(.tx b:text-is("قيمي"))';
  ok((await p.$$eval(`${qm} .mr-ai em`, (l) => l.map((e) => e.textContent).join(","))).startsWith("1,2,3"), "أقسام كل نظام مرقّمة 1، 2، 3");
  await p.click("#pk [data-acc-all]"); ok(await p.$$eval("#pk .mr-ar-b", (l) => l.every((x) => !x.hidden)), "فتح ألسنة الأنظمة في لوحة التقرير");
  await p.click(`${qm} [data-sys]`);
  ok(!(await p.textContent("#doc")).includes("سجل القيم والتعزيز") && (await p.textContent("#doc")).includes("سجل الحضور والغياب"), "إلغاء نظام قيمي يحذف أقسامه من التقرير ويبقي غيره");
  ok((await p.textContent(".rp-custom")).includes("تقرير مخصص"), "التقرير المخصص يذكر ذلك صراحة");
  ok(!(await p.$$eval("#tlist, .rp-tl tbody tr", (l) => l.map((x) => x.textContent).join(" "))).includes("قيمي"), "السجل الزمني يتبع الاختيار");
  await p.click('#pk [data-k="lateness"]');
  ok(!(await p.textContent("#doc")).includes("سجل التأخر الصباحي"), "إلغاء قسم واحد");
  ok(await p.$eval(`${qm} [data-sys]`, (b) => !b.checked && !b.indeterminate), "مربع النظام يعكس حالة أقسامه");
  await p.click('#pk [data-part="tl"]');
  ok(!(await p.textContent("#doc")).includes("السجل الزمني الموحد") || (await p.textContent(".rp-custom")).includes("دون السجل الزمني"), "إخفاء جزء السجل الزمني");
  await p.click('#pk [data-all="0"]'); ok(await p.$eval("#go", (b) => b.disabled), "إلغاء الكل يعطّل التصدير");
  await p.click('#pk [data-all="1"]'); ok(!(await p.$eval("#go", (b) => b.disabled)) && !(await p.$(".rp-custom")), "تحديد الكل يعيد التقرير الكامل");
  await p.click('#pk [data-k="reinforcements"]'); await p.reload(); await p.waitForFunction(() => window.__ready === true); await p.click("#pk [data-acc-all]");
  ok(!(await p.$eval('#pk [data-k="reinforcements"]', (b) => b.checked)), "يُحفظ الاختيار على الجهاز للمرة القادمة");
  await p.screenshot({ path: `${OUT}/05-report-pick.png`, fullPage: false });
  await p.click("#go"); await p.waitForFunction(() => window.__printed === 1);
  ok(await p.isHidden("#pk"), "اللوحة تُغلق عند التصدير");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في اختيار المحتوى: " + p.errs.join(" | "));

  // 6) زر التصدير في الملف يفتح التقرير ويطبع تلقائياً
  p = await open(U.admin);
  await p.goto(`${BASE}/report.html?k=student&id=${S1}&print=1`); await p.waitForFunction(() => window.__printed === 1, null, { timeout: 8000 });
  ok(true, "التصدير المباشر يفتح نافذة الطباعة بعد تجهيز التقرير");

  // 7) الجوال (390 بكسل): لا تمرير أفقي في أي صفحة، والقائمة الرئيسية وألسنة الأنظمة تعمل باللمس
  const T = "30000000-0000-0000-0000-000000000003";
  for (const [u, pg, sel] of [[null, "index.html", ".tk-g"], [null, "about.html", "#ab-faq"], [null, "login.html", "form"], [U.admin, "search.html?k=student", "#q"],
    [U.admin, `profile.html?k=student&id=${S1}`, "#tl"], [U.admin, `profile.html?k=staff&id=${T}`, "#tl"], [U.admin, `report.html?k=staff&id=${T}&pick=1`, "#doc .sheet"]]) {
    p = await open(u, 390, 844); await p.goto(`${BASE}/${pg}`); await p.waitForSelector(sel); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `[جوال] ${pg.split("?")[0]} بلا تمرير أفقي`);
    if (pg === "index.html") {
      ok(await p.isHidden("header nav"), "[جوال] القائمة الرئيسية مطوية افتراضياً"); await p.click(".navtoggle");
      ok(await p.isVisible('header nav a[href="about.html"]') && (await p.getAttribute(".navtoggle", "aria-expanded")) === "true", "[جوال] زر القائمة يفتحها");
      ok(await p.$$eval("header nav a", (l) => l.every((a) => a.getBoundingClientRect().height >= 44)), "[جوال] روابط القائمة بحجم لمس مناسب");
      await p.screenshot({ path: `${OUT}/07-mobile-menu.png` });
    }
    if (pg.startsWith("profile.html?k=staff")) {
      await p.tap('#flt .mr-ar:has(.tx b:text-is("التقويم الذاتي")) [data-acc]');
      const box = await p.$eval('#flt .mr-ar:has(.tx b:text-is("التقويم الذاتي")) .mr-ar-b', (e) => { const r = e.getBoundingClientRect(); return !e.hidden && r.left >= 0 && r.right <= innerWidth; });
      ok(box, "[جوال] لسان النظام يفتح داخل عرض الشاشة");
      ok(await p.$$eval("#flt .mr-ar-t, #flt .mr-ar-ck", (l) => l.every((x) => x.getBoundingClientRect().height >= 44)), "[جوال] صفوف الأنظمة بحجم لمس مناسب");
      await p.locator("#flt").screenshot({ path: `${OUT}/07-mobile-systems.png` });
    }
    if (pg.startsWith("report.html")) { await p.click('#pk .mr-ar:last-child [data-acc]'); ok(await p.isVisible("#pk .mr-ar:last-child [data-k]"), "[جوال] آخر نظام في لوحة التقرير قابل للوصول والفتح"); }
    ok(p.errs.length === 0, `[جوال] لا أخطاء JavaScript في ${pg.split("?")[0]}: ` + p.errs.join(" | "));
  }

  // 8) المصرح لهم: لوحة إدارة صلاحيتي تقرير المتعلم وتقرير المعلم
  p = await open(U.viewer); await p.goto(`${BASE}/search.html`); await p.waitForSelector("#q");
  ok(!(await p.$('a[href="perms.html"]')), "المطّلع لا يرى رابط المصرح لهم");
  await p.goto(`${BASE}/perms.html`); await p.waitForSelector("text=لوحة المصرح لهم");
  ok(!(await p.$("#pmb")), "ولا يفتح اللوحة مباشرة");
  p = await open(U.admin); await p.goto(`${BASE}/search.html`); await p.click('a[href="perms.html"]'); await p.waitForSelector("#pmb tr[data-id]");
  ok((await p.$$("#pmb tr[data-id]")).length === +psql("select count(*) from staff_members where is_active"), "اللوحة تعرض كل منسوبي المدرسة الفعّالين");
  ok(await p.$eval('#pmb tr.lead input[data-p="student"]', (b) => b.checked && b.disabled), "المدير محدد ومقفل بحكم القيادة");
  const TR = `#pmb tr[data-id="${T3}"]`;
  ok(await p.$$eval(`${TR} input`, (l) => l.every((b) => !b.checked && !b.disabled)), "المعلم بلا صلاحية، ومربعاته قابلة للتعديل");
  await shot(p, "08-perms");
  await p.click(`${TR} [data-p="student"]`); await p.waitForSelector(`${TR} .mr-sv.ok`);
  ok(psql(`select string_agg(permission_code, ',') from staff_permissions where staff_id = '${T3}'`) === "mirat:view_student", "منح «تقرير المتعلم» يُحفظ في صلاحيات النواة");
  ok(+psql("select count(*) from audit_logs where action = 'PERMISSION'") >= 1, "المنح مسجل في سجل العمليات");
  await p.fill("#pmq", "ابراهيم"); ok((await p.$$("#pmb tr[data-id]")).length === 1, "البحث في المنسوبين بتوحيد الهمزة");
  await p.click('[data-show="off"]'); ok(!(await p.$(TR)), "تصفية «غير المصرح لهم» تخفي من مُنح الآن");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في المصرح لهم: " + p.errs.join(" | "));
  // المعلم الآن: ملفات المتعلمين فقط
  p = await open(U.teacher); await p.goto(`${BASE}/search.html`); await p.waitForSelector("#q");
  ok((await p.$$("[data-k]")).length === 1 && (await p.textContent(".mr-kind")).includes("ملف متعلم"), "المعلم يرى البحث عن المتعلمين فقط");
  await p.goto(`${BASE}/profile.html?k=staff&id=${T3}`); await p.waitForSelector("text=تقرير المعلم");
  ok(!(await p.$("#tl")), "ولا يفتح ملف معلم");
  await p.goto(`${BASE}/report.html?k=student&id=${S1}`); await p.waitForFunction(() => window.__ready === true);
  ok((await p.textContent(".rp-end")).includes("صدر هذا التقرير من حساب: إبراهيم المعلم"), "التقرير يذكر اسم صاحب الحساب الذي استخرجه");
  await p.emulateMedia({ media: "print" }); await p.pdf({ path: `${OUT}/report-by-teacher.pdf`, preferCSSPageSize: true });
  const tt = N(sh("pdftotext", ["-layout", `${OUT}/report-by-teacher.pdf`, "-"])).split("\f").filter((x) => x.trim());
  ok(tt.every((t) => t.includes(N("إبراهيم المعلم"))), `تذييل كل صفحات تقرير المعلم باسم حسابه (${tt.length} صفحة)`);
  await p.emulateMedia({ media: "screen" }); await p.goto(`${BASE}/report.html?k=staff&id=${T3}`); await p.waitForSelector("#rpst.bad");
  ok((await p.textContent("#rpst")).includes("تقرير المعلم") && !(await p.$("#doc .sheet")), "ولا يستخرج تقرير معلم");
  // سحب الصلاحية من اللوحة
  p = await open(U.admin); await p.goto(`${BASE}/perms.html`); await p.waitForSelector(`${TR} input`);
  await p.click(`${TR} [data-p="student"]`); await p.waitForSelector(`${TR} .mr-sv.ok`);
  ok(psql(`select count(*) from staff_permissions where staff_id = '${T3}'`) === "0", "سحب الصلاحية يحذفها من النواة");
  p = await open(U.admin, 390, 844); await p.goto(`${BASE}/perms.html`); await p.waitForSelector("#pmb tr[data-id]");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "[جوال] perms.html بلا تمرير أفقي");
  ok(await p.$$eval("#pmb .mr-ck", (l) => l.every((x) => x.getBoundingClientRect().height >= 44)), "[جوال] مربعات الصلاحيات بحجم لمس مناسب");
  await p.screenshot({ path: `${OUT}/08-perms-mobile.png`, fullPage: true });

  await br.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL E2E PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
