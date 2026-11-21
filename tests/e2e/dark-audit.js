// فحص النمط الداكن: يفتح صفحات مرآة بـ prefers-color-scheme:dark على خادم المعاينة المحلي،
// ويرصد العناصر ذات الخلفية الفاتحة والنصوص ضعيفة التباين، ويحفظ صوراً للمراجعة.
// الاستخدام: tests/e2e/reset.sh ثم node tests/e2e/dark-audit.js   (SCHEME=light للمقارنة)
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs"), path = require("path");
const BASE = "http://localhost:8787", SCHEME = process.env.SCHEME || "dark", OUT = process.env.OUT || `/tmp/mr-${SCHEME}`;
const MOCK = fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8");
const ADMIN = "a0000000-0000-0000-0000-000000000001", TEACHER = "a0000000-0000-0000-0000-000000000003";
const S1 = "40000000-0000-0000-0000-000000000001", T3 = "30000000-0000-0000-0000-000000000003";
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  ["index", null, "index.html"], ["about", null, "about.html"], ["login", null, "login.html"],
  ["desk", ADMIN, "desk.html"], ["search", ADMIN, "search.html"],
  ["profile-student", ADMIN, `profile.html?k=student&id=${S1}`], ["profile-staff", ADMIN, `profile.html?k=staff&id=${T3}`],
  ["report-student", ADMIN, `report.html?k=student&id=${S1}`, "read"], ["report-staff-pages", ADMIN, `report.html?k=staff&id=${T3}`, "pages"],
  ["perms", ADMIN, "perms.html"], ["log", ADMIN, "log.html"], ["inbox", ADMIN, "inbox.html"],
  ["self", TEACHER, `profile.html?k=staff&id=${T3}`],
  ["m-search", ADMIN, "search.html", null, 390], ["m-profile", ADMIN, `profile.html?k=student&id=${S1}`, null, 390],
  ["m-report", ADMIN, `report.html?k=student&id=${S1}`, null, 390], ["m-index", null, "index.html", null, 390],
  ["ub-panel", ADMIN, "search.html", null, 1280, "#ubB"], ["role-menu", ADMIN, "search.html", null, 1280, "#ubAv"],
];

// يُنفَّذ في الصفحة: الخلفيات الفاتحة الكبيرة، والنصوص الأقل من 3:1 مقابل خلفيتها الفعلية
const AUDIT = () => {
  const P = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const L = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const vis = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05 && r.width > 2 && r.height > 2; };
  const bgOf = (e) => { // أول خلفية معتمة صعوداً، مع مزج الشفافيات؛ الصور والتدرجات تُحتسب بلونها الأول
    let stack = [];
    for (let n = e; n; n = n.parentElement) {
      const s = getComputedStyle(n); let c = P(s.backgroundColor);
      if ((!c || c.a === 0) && s.backgroundImage.includes("gradient")) c = P(s.backgroundImage);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 0.95) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }; const html = P(getComputedStyle(document.body).backgroundColor); if (html && html.a > 0.9) base = html;
    for (let i = stack.length - 1; i >= 0; i--) base = mix(stack[i], base); return base;
  };
  const name = (e) => (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || e.tagName.toLowerCase();
  const path = (e) => { const a = []; for (let n = e, i = 0; n && i < 3 && n !== document.body; n = n.parentElement, i++) a.unshift(n.tagName.toLowerCase() + (name(n).startsWith(n.tagName.toLowerCase()) ? "" : name(n))); return a.join(" > "); };
  const light = [], low = [];
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e) || e.closest("svg,canvas,iframe,.rk-page,.paper")) continue;
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    let c = P(s.backgroundColor); if ((!c || c.a === 0) && s.backgroundImage.includes("gradient")) c = P(s.backgroundImage);
    if (c && c.a > 0.5 && r.width * r.height > 600 && L(bgOf(e)) > 0.45) light.push(path(e) + `  bg=${s.backgroundColor === "rgba(0, 0, 0, 0)" ? s.backgroundImage.slice(0, 60) : s.backgroundColor}`);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (own) {
      const fg = P(s.color); if (!fg) continue; const bg = bgOf(e), f = mix(fg, bg);
      const l1 = L(f), l2 = L(bg), cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (cr < 3) low.push(`${path(e)}  "${e.textContent.trim().slice(0, 24)}"  ${s.color} على ${`rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`} = ${cr.toFixed(1)}:1`);
    }
  }
  return { light: [...new Set(light)], low: [...new Set(low)] };
};

(async () => {
  const br = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  let total = 0; const report = [];
  for (const [n, user, url, view, w = 1280, click] of CASES) {
    const ctx = await br.newContext({ viewport: { width: w, height: 900 }, colorScheme: SCHEME, locale: "ar-SA", timezoneId: "Asia/Riyadh", isMobile: w < 600, hasTouch: w < 600 });
    await ctx.route(/cdn\.jsdelivr\.net/, (r) => r.fulfill({ contentType: "text/javascript", body: MOCK }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(([u, v]) => { u ? localStorage.setItem("preview_user", u) : localStorage.removeItem("preview_user"); if (v) localStorage.setItem("mr-report-view", v); window.print = () => {}; }, [user, view]);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${BASE}/${url}`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
    if (url.startsWith("index") || url.startsWith("about")) { for (let y = 0; y < 9000; y += 600) { await p.evaluate((v) => scrollTo(0, v), y); await p.waitForTimeout(80); } await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800); }
    if (click) { await p.click(click).catch(() => {}); await p.waitForTimeout(500); }
    const r = await p.evaluate(AUDIT);
    await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: !click, animations: "disabled" });
    total += r.light.length + r.low.length;
    report.push(`\n## ${n} (${url}) — خلفيات فاتحة: ${r.light.length}، تباين ضعيف: ${r.low.length}${errs.length ? " — أخطاء JS: " + errs.join(" | ") : ""}`);
    r.light.slice(0, 25).forEach((x) => report.push("  [فاتح] " + x)); r.low.slice(0, 25).forEach((x) => report.push("  [تباين] " + x));
    await ctx.close();
  }
  await br.close();
  fs.writeFileSync(`${OUT}/report.txt`, report.join("\n"));
  console.log(report.join("\n")); console.log(`\nالمجموع: ${total}  — الصور في ${OUT}`);
})();
