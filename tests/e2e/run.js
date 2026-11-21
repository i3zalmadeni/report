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

  // 2) معلم بلا صلاحية: يدخل إلى ملفه الشخصي وسجله كاملاً، ولا يصل إلى البحث ولا إلى ملفات غيره
  const T3a = "30000000-0000-0000-0000-000000000003";
  p = await open(U.teacher);
  await p.goto(`${BASE}/search.html`); await p.waitForURL(new RegExp(`profile\\.html\\?k=staff&id=${T3a}`)); await p.waitForSelector("#tl");
  ok(!(await p.$("#q")) && (await p.textContent(".mr-id h2")) === "إبراهيم المعلم", "المعلم غير المخوّل يُحوَّل إلى ملفه الشامل بدل رسالة المنع");
  ok((await p.textContent(".pagebar h1")) === "ملفي الشامل" && (await p.textContent(".pagebar small")) === "منسوب", "عنوان «ملفي الشامل»");
  ok(await p.isVisible('.dnav a.on:has-text("مكتبي")') && !(await p.$('.dnav a[href="search.html"]')) && !(await p.$('.dnav a[href="perms.html"]')), "الشريط: «مكتبي» فقط، دون البحث والصلاحيات");
  ok((await p.textContent(".mr-id")).includes("4455667"), "يرى رقمه الوظيفي في ملفه");
  ok((await p.textContent("#ubAv")) === "إ" && (await p.getAttribute(".ub-u", "href")).includes(T3a) && (await p.textContent(".ub-nm")) === "إبراهيم المعلم", "الشريط: صورة المستخدم (أو أول حرف من اسمه) ثم اسمه الأول والأخير، وتفتح ملفه");
  ok(await p.evaluate(() => { const b = [...document.querySelector(".dnav .ub").children].map((e) => e.className.split(" ")[0]); return b.join(",") === "ub-n,ub-n,ub-u,ub-out"; }) && (await p.textContent("#out")).includes("خروج") && !!(await p.$("#out svg")), "ترتيب آخر الشريط: الإشعارات، ثم الصورة والاسم، ثم أيقونة «خروج»");
  await p.click("#ubB"); await p.waitForSelector("#ubP:not([hidden]) .ub-empty:has-text('لا إشعارات')");
  ok(await p.isHidden("#ubC") && (await p.getAttribute("#ubA", "href")) === "inbox.html" && await p.isVisible("#ubA"), "قائمة الإشعارات تُفتح، و«مشاهدة الكل» تفتح صفحة الإشعارات");
  await p.keyboard.press("Escape"); ok(await p.isHidden("#ubP"), "Esc يغلق القائمة");
  await shot(p, "02-self-profile");
  await p.goto(`${BASE}/profile.html?k=student&id=${S1}`); await p.waitForURL(/k=staff/); await p.waitForSelector("#tl");
  ok(!(await p.content()).includes("أحمد عبدالله"), "ولا يصل إلى بيانات المتعلم (يُعاد إلى ملفه)");
  await p.goto(`${BASE}/profile.html?k=staff&id=30000000-0000-0000-0000-000000000002`); await p.waitForURL(new RegExp(T3a)); await p.waitForSelector("#tl");
  ok(!(await p.content()).includes("منسق الاطلاع</h2>"), "ولا إلى ملف معلم آخر");
  await p.goto(`${BASE}/report.html?k=staff&id=${T3a}`); await p.waitForFunction(() => window.__ready === true);
  ok((await p.textContent(".rp-end")).includes("صدر هذا التقرير من حساب: إبراهيم المعلم"), "يستخرج تقرير ملفه الشخصي");
  await p.click("#go"); await p.waitForFunction(() => window.__printed === 1);
  ok(p.errs.length === 0, "لا أخطاء JavaScript في الملف الشخصي: " + p.errs.join(" | "));

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
  await p.goto(`${BASE}/desk.html?k=staff`); await p.waitForSelector("#q"); await p.fill("#q", "4455667"); await p.waitForSelector(".mr-hit");
  ok((await p.textContent(".mr-hit")).includes("إبراهيم المعلم"), "بحث المعلم بالرقم الوظيفي للمخول");
  ok(!(await p.$('.dnav a[href="search.html"], .sbar a[href="search.html"]')), "المنسق: لا قسم بحث مستقل، والبحث في الرئيسية فقط");
  await p.goto(`${BASE}/search.html?k=student`); await p.waitForURL(/desk\.html\?k=student/); await p.waitForSelector("#q");
  ok(true, "search.html يحوّل المنسق إلى الرئيسية");
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
  for (const [u, pg, sel] of [[null, "index.html", ".tk-g"], [null, "about.html", "#ab-faq"], [null, "login.html", "form"], [U.admin, "desk.html?k=student", "#q"],
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

  // 8) الصلاحيات: لوحة إدارة صلاحيتي تقرير المتعلم وتقرير المعلم
  p = await open(U.viewer); await p.goto(`${BASE}/search.html`); await p.waitForSelector("#q");
  ok(!(await p.$('a[href="perms.html"]')) && !(await p.$('a[href="log.html"]')), "المطّلع لا يرى رابط الصلاحيات ولا سجلات المشاهدة");
  await p.goto(`${BASE}/perms.html`); await p.waitForSelector("text=هذه الصفحة لمدير النواة");
  ok(!(await p.$("#pmb")), "ولا يفتح اللوحة مباشرة");
  p = await open(U.admin); await p.goto(`${BASE}/desk.html`); await p.click('a[href="perms.html?tab=perms"]'); await p.waitForSelector("#pmb tr[data-id]");
  ok((await p.$$("#pmb tr[data-id]")).length === +psql("select count(*) from staff_members where is_active"), "اللوحة تعرض كل منسوبي المدرسة الفعّالين");
  ok(await p.$eval('#pmb tr.lead input[data-p="student"]', (b) => b.checked && b.disabled), "المدير محدد ومقفل بحكم القيادة");
  const TR = `#pmb tr[data-id="${T3}"]`;
  ok(await p.$$eval(`${TR} input`, (l) => l.every((b) => !b.checked && !b.disabled)), "المعلم بلا صلاحية، ومربعاته قابلة للتعديل");
  await shot(p, "08-perms");
  await p.click(`${TR} [data-p="student"]`); await p.waitForSelector(`${TR} .mr-sv.ok`);
  ok(psql(`select string_agg(permission_code, ',') from staff_permissions where staff_id = '${T3}'`) === "mirat:view_student", "منح «تقرير المتعلم» يُحفظ في صلاحيات النواة");
  ok(+psql("select count(*) from audit_logs where action = 'PERMISSION'") >= 1, "المنح مسجل في سجل العمليات");
  await p.fill("#pmq", "ابراهيم"); ok((await p.$$("#pmb tr[data-id]")).length === 1, "البحث في المنسوبين بتوحيد الهمزة");
  await p.click('[data-show="off"]'); ok(!(await p.$(TR)), "تصفية «بلا صلاحية» تخفي من مُنح الآن");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في الصلاحيات: " + p.errs.join(" | "));
  // المعلم الآن: ملفات المتعلمين فقط
  p = await open(U.teacher); await p.goto(`${BASE}/search.html`); await p.waitForSelector("#q");
  ok((await p.$$("[data-k]")).length === 1 && (await p.textContent(".mr-kind")).includes("ملف متعلم"), "المعلم يرى البحث عن المتعلمين فقط");
  await p.goto(`${BASE}/profile.html?k=staff&id=30000000-0000-0000-0000-000000000002`); await p.waitForSelector("text=تقرير المعلم");
  ok(!(await p.$("#tl")), "ولا يفتح ملف معلم آخر");
  await p.goto(`${BASE}/report.html?k=student&id=${S1}`); await p.waitForFunction(() => window.__ready === true);
  ok((await p.textContent(".rp-end")).includes("صدر هذا التقرير من حساب: إبراهيم المعلم"), "التقرير يذكر اسم صاحب الحساب الذي استخرجه");
  await p.emulateMedia({ media: "print" }); await p.pdf({ path: `${OUT}/report-by-teacher.pdf`, preferCSSPageSize: true });
  const tt = N(sh("pdftotext", ["-layout", `${OUT}/report-by-teacher.pdf`, "-"])).split("\f").filter((x) => x.trim());
  ok(tt.every((t) => t.includes(N("إبراهيم المعلم"))), `تذييل كل صفحات تقرير المعلم باسم حسابه (${tt.length} صفحة)`);
  await p.emulateMedia({ media: "screen" }); await p.goto(`${BASE}/report.html?k=staff&id=30000000-0000-0000-0000-000000000002`); await p.waitForSelector("#rpst.bad");
  ok((await p.textContent("#rpst")).includes("تقرير المعلم") && !(await p.$("#doc .sheet")), "ولا يستخرج تقرير معلم آخر");
  // سحب الصلاحية من اللوحة
  p = await open(U.admin); await p.goto(`${BASE}/perms.html`); await p.waitForSelector(`${TR} input`);
  await p.click(`${TR} [data-p="student"]`); await p.waitForSelector(`${TR} .mr-sv.ok`);
  ok(psql(`select count(*) from staff_permissions where staff_id = '${T3}'`) === "0", "سحب الصلاحية يحذفها من النواة");
  // 8ب) إشعارات المعلم بعد منحه الصلاحية: إشعار تعديل صلاحياته
  p = await open(U.teacher); await p.goto(`${BASE}/search.html`); await p.waitForSelector(".ub-bell"); await p.waitForSelector("#ubC:not([hidden])");
  await p.click("#ubB"); await p.waitForSelector("#ubP .ub-it");
  ok((await p.textContent("#ubL")).includes("عدّل مدير الاختبار صلاحياتك في مرآة") && (await p.textContent("#ubL")).includes("تقرير المتعلم"), "إشعار المنسوب بتعديل صلاحياته");
  await p.click("#ubR"); ok(await p.isHidden("#ubC"), "تحديد الكل كمقروء يخفي العدّاد");
  await p.reload(); await p.waitForSelector(".ub-bell"); await p.waitForTimeout(800); ok(await p.isHidden("#ubC"), "المقروء يبقى مقروءاً بعد إعادة التحميل");
  await shot(p, "08b-bell");
  // 8ج) مكتبي الإلكتروني: الصفحة الرئيسية في لوحة التحكم
  p = await open(U.admin); await p.goto(`${BASE}/desk.html`); await p.waitForSelector("#srch #q"); await p.waitForSelector("#dact .mr-kpi");
  ok((await p.textContent(".dnav a.on")).includes("الرئيسية") && (await p.textContent(".pagebar h1")).includes("الرئيسية") && !(await p.$('.dnav a[href="search.html"], .sbar a[href="search.html"]')), "الرئيسية للمنسق: البحث فيها وحدها، دون قسم بحث مستقل");
  ok(!(await p.$("#dq")) && (await p.$$("[data-k]")).length === 2, "البحث الموحد الكامل داخل الرئيسية (متعلم ومعلم)، لا نموذج بحث سريع");
  ok(+(await p.textContent("#dact .mr-kpi.main b")) >= 1, "نشاط اليوم للمدير");
  await shot(p, "11-desk");
  await p.fill("#q", "احمد"); await p.waitForSelector(".mr-hit");
  ok(p.url().includes("desk.html") && (await p.$$(".mr-hit")).length >= 1, "البحث في الرئيسية يعرض النتائج في الصفحة نفسها");
  await p.goto(`${BASE}/desk.html`); await p.click('a.mr-more[href^="log.html"]'); await p.waitForSelector("#lb tr td .badge");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(await p.inputValue("#ff")) && (await p.inputValue("#ff")) === (await p.inputValue("#ft")), "«سجلات المشاهدة» من نشاط اليوم تفتح مصفّاة باليوم");
  // مبدّل الأنظمة بجوار الجرس
  ok(await p.evaluate(() => [...document.querySelector(".dnav .ub").children].map((e) => e.querySelector("button")?.id || e.className.split(" ")[0]).join(",") === "ubS,ubB,ub-u,ub-out"), "الترتيب: مبدّل الأنظمة، الإشعارات، الصورة والاسم، الخروج");
  await p.click("#ubS"); await p.waitForSelector("#ubSP:not([hidden]) .ub-sys");
  const sys = await p.$$eval("#ubSP .ub-sys", (l) => l.map((a) => [a.getAttribute("href"), a.querySelector("b").textContent]));
  ok(sys.length === 8 && sys.map((x) => x[0]).join(" ") === "/digital-core/dashboard.html /self-evaluation/admin.html /smart-plans/#dashboard /teachers-community/#/home /indibati/dashboard.html /qiyami/dashboard.html /facility-booking/dashboard.html /report/desk.html", "مبدّل الأنظمة: الأنظمة الثمانية بروابط لوحات تحكمها");
  await p.click("#ubB"); ok(await p.isHidden("#ubSP") && await p.isVisible("#ubP"), "فتح الإشعارات يغلق المبدّل (قائمة واحدة مفتوحة)");
  await p.click("#ubS"); ok(await p.isHidden("#ubP") && await p.isVisible("#ubSP"), "وفتح المبدّل يغلق الإشعارات");
  await shot(p, "12-switcher"); await p.screenshot({ path: `${OUT}/12-switcher-top.png`, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  await p.keyboard.press("Escape"); ok(await p.isHidden("#ubSP") && (await p.evaluate(() => document.activeElement.id)) === "ubS", "Esc يغلق المبدّل ويعيد التركيز إلى زره");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في مكتبي: " + p.errs.join(" | "));
  p = await open(U.teacher); await p.goto(`${BASE}/desk.html`); await p.waitForURL(/profile\.html\?k=staff/);
  ok(!(await p.$("#srch")) && !(await p.$("#dact")), "المنسوب بلا صلاحية: يُحوَّل إلى ملفه دون بحث ولا نشاط");
  p = await open(U.admin, 390, 844); await p.goto(`${BASE}/desk.html`); await p.waitForSelector("#srch #q");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "[جوال] desk.html بلا تمرير أفقي"); await p.screenshot({ path: `${OUT}/11-desk-mobile.png`, fullPage: true });
  // 9) سجلات المشاهدة
  p = await open(U.admin); await p.goto(`${BASE}/desk.html`); await p.click("#ubB"); await p.waitForSelector("#ubP .ub-it");
  ok(await p.isVisible('#ubA[href="inbox.html"]') && (await p.textContent("#ubL")).includes("اطّلع إبراهيم المعلم"), "إشعارات المدير: نشاط الآخرين، و«مشاهدة الكل» ظاهرة");
  await p.click("#ubA"); await p.waitForURL(/inbox\.html/); await p.waitForSelector("#ubgL .ubg-it");
  ok((await p.textContent(".pagebar h1")) === "الإشعارات" && (await p.$$("#ubgL .ubg-it")).length === 12 && (await p.$$("#ubgL .ubg-d")).length >= 1 && (await p.textContent("#ubgL")).includes("اطّلع إبراهيم المعلم"), "صفحة الإشعارات تعرض كل الإشعارات مجمّعة بالأيام");
  const un0 = +(await p.textContent("#ubgK .n b"));
  await p.click('[data-ubf="new"]'); ok((await p.$$("#ubgL .ubg-it")).length === un0, "تصفية غير المقروء");
  await p.click('[data-ubt="bad"]'); ok(await p.$$eval("#ubgL .ubg-it", (l) => l.every((x) => x.classList.contains("bad"))), "تصفية النوع");
  await p.click('[data-ubt="all"]'); await p.click('[data-ubf="all"]'); await p.fill("#ubgQ", "صدّر"); ok(await p.$$eval("#ubgL .ubg-it", (l) => l.length === 1 && l[0].textContent.includes("صدّر")), "البحث في الإشعارات");
  await p.fill("#ubgQ", ""); await p.click("#ubgR"); await p.waitForTimeout(200);
  ok((await p.textContent("#ubgK .n b")) === "0" && await p.isHidden("#ubC"), "تحديد الكل كمقروء في الصفحة يُصفّر عدّاد الجرس أيضاً");
  await shot(p, "10-inbox");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في صفحة الإشعارات: " + p.errs.join(" | "));
  p = await open(U.teacher); await p.goto(`${BASE}/inbox.html`); await p.waitForSelector("#ubgL .ubg-it");
  ok(p.url().includes("inbox.html") && (await p.textContent("#ubgL")).includes("صلاحياتك"), "المنسوب بلا صلاحية يفتح صفحة إشعاراته (لا يُحوَّل إلى ملفه)");
  p = await open(U.admin, 390, 844); await p.goto(`${BASE}/inbox.html`); await p.waitForSelector("#ubgL .ubg-it");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "[جوال] inbox.html بلا تمرير أفقي"); await p.screenshot({ path: `${OUT}/10-inbox-mobile.png`, fullPage: false });
  p = await open(U.admin); await p.goto(`${BASE}/desk.html`); await p.click('.sbar a[href="log.html"]'); await p.waitForSelector("#lb tr td .badge");
  const nLog = +psql("select count(*) from audit_logs where table_name like 'mirat.%'");
  ok((await p.textContent("#lk .mr-kpi.main b")) === String(nLog), `السجل يعرض كل عمليات مرآة (${nLog})`);
  ok((await p.textContent("#lb")).includes("إبراهيم المعلم") && (await p.textContent("#lb")).includes("ملفه الشخصي"), "اطلاع المنسوب على ملفه يظهر باسمه");
  ok((await p.textContent("#lb")).includes("أحمد عبدالله الحربي") && (await p.textContent("#lb")).includes("تصدير تقرير"), "يظهر اسم الملف الذي شوهد والتقارير المصدّرة");
  ok((await p.textContent("#lb")).includes("تعديل صلاحيات") && (await p.textContent("#lb")).includes("إلى: تقرير المتعلم"), "تعديلات الصلاحيات مسجلة بما قبلها وما بعدها");
  await shot(p, "09-log");
  await p.selectOption("#fu", { label: "إبراهيم المعلم" }); await p.waitForFunction(() => [...document.querySelectorAll("#lb tr")].every((r) => r.textContent.includes("إبراهيم")));
  ok((await p.$$("#lu tr")).length === 1, "التصفية بالمستخدم");
  await p.selectOption("#fu", ""); await p.selectOption("#fa", "EXPORT"); await p.waitForFunction(() => [...document.querySelectorAll("#lb .badge")].every((b) => b.textContent === "تصدير تقرير"));
  ok(true, "التصفية بالعملية");
  await p.selectOption("#fa", ""); await p.fill("#fq", "احمد"); await p.waitForFunction(() => [...document.querySelectorAll("#lb tr")].length > 0 && [...document.querySelectorAll("#lb tr")].every((r) => r.textContent.includes("أحمد")));
  ok(true, "البحث باسم صاحب الملف");
  ok(p.errs.length === 0, "لا أخطاء JavaScript في سجلات المشاهدة: " + p.errs.join(" | "));
  p = await open(U.admin, 390, 844); await p.goto(`${BASE}/log.html`); await p.waitForSelector("#lb tr td .badge");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "[جوال] log.html بلا تمرير أفقي");
  await p.screenshot({ path: `${OUT}/09-log-mobile.png`, fullPage: true });

  p = await open(U.admin, 390, 844); await p.goto(`${BASE}/perms.html`); await p.waitForSelector("#pmb tr[data-id]");
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "[جوال] perms.html بلا تمرير أفقي");
  ok(await p.$$eval("#pmb .mr-ck", (l) => l.every((x) => x.getBoundingClientRect().height >= 44)), "[جوال] مربعات الصلاحيات بحجم لمس مناسب");
  await p.screenshot({ path: `${OUT}/08-perms-mobile.png`, fullPage: true });

  await br.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL E2E PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
