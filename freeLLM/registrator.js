const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const capmonster = require("./capmonster");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const ACCOUNTS_FILE = path.resolve(__dirname, "OLD", "accounts.json");
const PENDING_FILE = path.resolve(__dirname, "pending.json");
const BATCH = 5;
const CAPMONSTER_ENABLED = !!process.env.CAPMONSTER_API_KEY;

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function randStr(n = 12) { return crypto.randomBytes(n).toString("hex").slice(0, n); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function getTempEmail() {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch("https://api.guerrillamail.com/ajax.php?f=get_email_address");
      const d = await r.json();
      return { address: d.email_addr, sidToken: d.sid_token };
    } catch (e) { await sleep(2000); }
  }
  throw new Error("Failed to get temp email");
}

function savePending(email, password) {
  let pend = [];
  if (fs.existsSync(PENDING_FILE)) {
    try { pend = JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8")); } catch {}
  }
  if (!pend.some((p) => p.email === email))
    pend.push({ email, password });
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pend, null, 4));
}

async function openRegistration(browser, email, password) {
  const ctx = await browser.newContext({
    locale: "ru-RU",
    viewport: { width: 1280, height: 800 },
    userAgent: UA,
  });
  const page = await ctx.newPage();

  // Capture requestInfo from signup response & prefix from captcha init
  const captured = { requestInfo: null, prefix: null };

  await page.route("**/api/v1/auths/signup", async (route, request) => {
    const response = await route.fetch();
    const body = await response.text();
    const m = body.match(/var requestInfo = ({.*?});/s);
    if (m) {
      try { captured.requestInfo = JSON.parse(m[1]); } catch {}
    }
    await route.fulfill({ response, body });
  });

  // Also listen for captcha init request to grab prefix
  page.on("request", (req) => {
    if (captured.prefix) return;
    const url = req.url();
    const pm = url.match(/:\/\/([a-z0-9]{20,})\.captcha/);
    if (pm) captured.prefix = pm[1];
  });

  await page.goto("https://chat.qwen.ai/auth?mode=register", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.fill('input[placeholder*="полное имя"]', "User");
  await page.fill('input[placeholder*="почту"]', email);
  const pf = page.locator('input[placeholder*="пароль"]');
  await pf.first().fill(password);
  await pf.last().fill(password);
  await page.check('input[type="checkbox"]');
  await page.click('button:has-text("Создать")');

  // Wait for WAF captcha to appear
  await page.waitForSelector(".waf-nc-wrapper", { timeout: 15000 }).catch(() => {});

  // Give a moment for captcha init request to fire
  await sleep(2000);

  return { page, ctx, email, password, solved: false, requestInfo: captured.requestInfo, prefix: captured.prefix };
}

function waitForSolve(slot) {
  return new Promise((resolve) => {
    slot.page.waitForURL(
      (u) => { const p = new URL(u); return p.pathname === "/" && !p.search.includes("auth"); },
      { timeout: 300000 }
    ).then(() => { slot.solved = true; resolve(slot); })
    .catch(() => resolve(slot));
  });
}

async function tryCapmonsterSolve(slot, idx) {
  try {
    if (!slot.requestInfo || !slot.prefix) {
      log(`  [${idx}] No captcha params captured, skipping CapMonster`);
      return;
    }
    await capmonster.solveAlibabaCaptcha(slot.page, slot.requestInfo, slot.prefix, log);
    log(`  [${idx}] CapMonster solution applied`);

    try {
      await slot.page.waitForURL(
        (u) => { const p = new URL(u); return p.pathname === "/" && !p.search.includes("auth"); },
        { timeout: 30000 }
      );
      slot.solved = true;
      log(`  [${idx}] Auto-solved via CapMonster`);
    } catch {
      log(`  [${idx}] No redirect after solution, fallback to manual`);
    }
  } catch (e) {
    log(`  [${idx}] CapMonster error: ${e.message}`);
  }
}

async function checkInbox(sidToken, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${sidToken}`);
      const d = await r.json();
      for (const m of d.list || []) {
        if (m.mail_from === "no-reply@guerrillamail.com") continue;
        const fr = await fetch(`https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${m.mail_id}&sid_token=${sidToken}`);
        const md = await fr.json();
        const html = (md.mail_html || md.mail_body || "").replace(/\\"/g, '"');
        const links = html.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
        const vl = links.find((l) => l.includes("activate") || l.includes("verify") || l.includes("confirm"));
        if (vl) return { found: true, link: vl };
      }
    } catch (e) {}
    await sleep(4000);
  }
  return { found: false, link: null };
}

async function testLogin(email, password) {
  try {
    const r = await fetch("https://chat.qwen.ai/api/v1/auths/signin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": UA,
        source: "web",
        version: "0.2.57",
        "bx-v": "2.5.36",
      },
      body: JSON.stringify({ email, password: sha256(password) }),
    });
    const text = await r.text();
    try { const j = JSON.parse(text); if (j.token || j.data?.token) return true; } catch {}
  } catch (e) {}
  return false;
}

function saveAccount(email, password) {
  let accs = [];
  if (fs.existsSync(ACCOUNTS_FILE)) {
    try { accs = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")); } catch {}
  }
  if (accs.some((a) => a.email === email)) return;
  accs.push({ email, password: sha256(password) });
  const dir = path.dirname(ACCOUNTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accs, null, 4));
  if (fs.existsSync(PENDING_FILE)) {
    let pend = [];
    try { pend = JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8")); } catch {}
    pend = pend.filter((p) => p.email !== email);
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pend, null, 4));
  }
}

async function main() {
  const count = parseInt(process.argv[2]) || 30;
  log(`=== Qwen Registrator (${count} accounts, batch=${BATCH}, capmonster=${CAPMONSTER_ENABLED}) ===`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  let okCount = 0;
  const allSlots = [];

  for (let batchStart = 0; batchStart < count; batchStart += BATCH) {
    const batchSize = Math.min(BATCH, count - batchStart);
    log("");
    log(`=== Batch ${Math.floor(batchStart / BATCH) + 1}: ${batchStart + 1}-${batchStart + batchSize} ===`);

    const batchSlots = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = batchStart + i;
      const mail = await getTempEmail();
      const pwd = "Qw" + randStr(10) + "A1!@";
      savePending(mail.address, pwd);
      log(`  [${idx + 1}] ${mail.address}`);
      const slot = await openRegistration(browser, mail.address, pwd);
      slot.sidToken = mail.sidToken;
      slot.index = idx + 1;
      batchSlots.push(slot);
    }

    await sleep(2000);

    if (CAPMONSTER_ENABLED) {
      log("  Solving captchas via CapMonster...");
      await Promise.all(batchSlots.map((s) => tryCapmonsterSolve(s, s.index)));
      const autoSolved = batchSlots.filter((s) => s.solved).length;
      log(`  Auto-solved: ${autoSolved}/${batchSize}`);
    }

    // Manual fallback
    const unsolved = batchSlots.filter((s) => !s.solved);
    if (unsolved.length > 0) {
      log(`  Waiting for manual solve on ${unsolved.length} slots...`);
      for (const s of unsolved) {
        try {
          const offset = await s.page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll("img")).filter(
              (i) => i.src.startsWith("data:image") && i.naturalWidth > 0
            );
            const bg = imgs.find((i) => i.naturalWidth > 200);
            const sh = imgs.find((i) => i.naturalWidth < 100 && i.naturalWidth > 0);
            if (!bg || !sh) return -1;
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            const bw = bg.naturalWidth, sw = sh.naturalWidth, sH = sh.naturalHeight;
            canvas.width = bw; canvas.height = bg.naturalHeight; ctx.drawImage(bg, 0, 0);
            const bD = ctx.getImageData(0, 0, bw, bg.naturalHeight).data;
            canvas.width = sw; canvas.height = sH; ctx.drawImage(sh, 0, 0);
            const sD = ctx.getImageData(0, 0, sw, sH).data;
            const mask = [];
            for (let y = 0; y < sH; y++)
              for (let x = 0; x < sw; x++) {
                const i = (y * sw + x) * 4;
                if (!(sD[i] === 0 && sD[i + 1] === 0 && sD[i + 2] === 0))
                  mask.push({ x, y, r: sD[i], g: sD[i + 1], b: sD[i + 2] });
              }
            let best = 0, bestD = Infinity;
            for (let ox = 0; ox <= bw - sw; ox++) {
              let diff = 0;
              for (const p of mask) {
                const bi = (p.y * bw + ox + p.x) * 4;
                diff += Math.abs(bD[bi] - p.r) + Math.abs(bD[bi + 1] - p.g) + Math.abs(bD[bi + 2] - p.b);
              }
              if (diff < bestD) { bestD = diff; best = ox; }
            }
            return Math.round((best / (bw - sw)) * 100);
          });
          log(`  [${s.index}] hint: ~${offset}%`);
        } catch {
          log(`  [${s.index}] hint: n/a`);
        }
      }

      await Promise.all(unsolved.map(waitForSolve));
      log(`  Manual done: ${unsolved.filter((s) => s.solved).length}/${unsolved.length}`);
    }

    allSlots.push(...batchSlots);
  }

  const solved = allSlots.filter((s) => s.solved);
  log(`\n=== Verifying ${solved.length} accounts ===`);

  for (const s of solved) {
    log(`[${s.index}] ${s.email}...`);
    const ver = await checkInbox(s.sidToken, 90000);
    if (ver.link) {
      try {
        await s.page.goto(ver.link, { waitUntil: "domcontentloaded", timeout: 30000 });
        await sleep(3000);
      } catch (e) {}
    }
    const ok = await testLogin(s.email, s.password);
    if (ok) {
      saveAccount(s.email, s.password);
      okCount++;
      log(`  OK (${okCount})`);
    } else {
      log(`  FAIL`);
    }
    await s.page.close().catch(() => {});
    await s.ctx.close().catch(() => {});
  }

  for (const s of allSlots) {
    if (s.page && !s.page.isClosed()) {
      await s.page.close().catch(() => {});
      await s.ctx.close().catch(() => {});
    }
  }

  await browser.close();
  log(`\n=== ${okCount}/${solved.length} saved ===`);
}

main().catch(console.error);
