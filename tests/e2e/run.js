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
    const ctx = await br.newContext({ viewport: { width: w, height: h }, locale: "ar-SA", timezoneId: "Asia/Riyadh" });
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
    ok(txt.includes(n === "staff" ? "إبراهيم المعلم" : n === "stress" ? "عبدالرحمن بن خالد" : "أحمد عبدالله الحربي"), `[${n}] النص العربي قابل للاستخراج بترتيب صحيح`);
    // لا يبقى عنوان قسم أو مجموعة في آخر الصفحة دون محتواه
    const heads = (await p.$$eval(".rp-g, .rp-h, .rp-t caption b", (l) => l.map((e) => e.textContent.trim()))).map(N);
    const orphan = pg.slice(0, -1).map((t) => t.split("\n").map((s) => s.trim()).filter((s) => s && !/صفحة\s*\d+\s*من|بتوقيت|الستخراج/.test(s)).pop() || "")
      .filter((last) => heads.some((h) => last === h || last === h.replace(/^(أولاً|ثانياً|ثالثاً): /, "")));
    ok(orphan.length === 0, `[${n}] لا عناوين يتيمة في نهاية الصفحات: ${orphan.join(" | ")}`);
    // بطاقة التعريف في صفحة واحدة
    ok(pg[0].includes("الموحد") && pg[0].includes("بتوقيت الرياض"), `[${n}] بطاقة التعريف كاملة في الصفحة الأولى`);
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
  ok(+psql("select count(*) from audit_logs where action = 'EXPORT'") === exportsBefore + 3, "كل تصدير مسجل في سجل عمليات النواة");

  // 6) زر التصدير في الملف يفتح التقرير ويطبع تلقائياً
  p = await open(U.admin);
  await p.goto(`${BASE}/report.html?k=student&id=${S1}&print=1`); await p.waitForFunction(() => window.__printed === 1, null, { timeout: 8000 });
  ok(true, "التصدير المباشر يفتح نافذة الطباعة بعد تجهيز التقرير");

  await br.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL E2E PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
