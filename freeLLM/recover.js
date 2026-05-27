const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const ACCOUNTS_FILE = path.resolve(__dirname, "OLD", "accounts.json");

function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ====== Reconstructed from log (30 accounts, captchas all solved) ======
const accounts = [
  "uepsfnhh@guerrillamailblock.com",
  "zpqctint@guerrillamailblock.com",
  "ecyfdoup@guerrillamailblock.com",
  "tsdaxvos@guerrillamailblock.com",
  "nhfwbswf@guerrillamailblock.com",
  "tuxldbem@guerrillamailblock.com",
  "bqgviohv@guerrillamailblock.com",
  "xzezfhri@guerrillamailblock.com",
  "jdbmlbmn@guerrillamailblock.com",
  "oywntzlq@guerrillamailblock.com",
  "tntyxsdf@guerrillamailblock.com",
  "bfaukpgi@guerrillamailblock.com",
  "advxosfz@guerrillamailblock.com",
  "ampnghau@guerrillamailblock.com",
  "czttncwl@guerrillamailblock.com",
  "sbjkhafs@guerrillamailblock.com",
  "eotwegye@guerrillamailblock.com",
  "kvosymxb@guerrillamailblock.com",
  "rtdmfqsh@guerrillamailblock.com",
  "kjipmroz@guerrillamailblock.com",
  "aoorrgrq@guerrillamailblock.com",
  "cgcasovg@guerrillamailblock.com",
  "cpjnjzar@guerrillamailblock.com",
  "swwaubxp@guerrillamailblock.com",
  "wnkdnyhl@guerrillamailblock.com",
  "mkrbmvxv@guerrillamailblock.com",
  "rhvbodzr@guerrillamailblock.com",
  "setkotoh@guerrillamailblock.com",
  "wrqnhfpq@guerrillamailblock.com",
  "kxtcycfu@guerrillamailblock.com",
];

// Extract email username (before @) for GuerrillaMail set_email_user
function emailUser(email) {
  return email.split("@")[0];
}

async function getSidToken(email) {
  // First get a new sid_token, then set_email_user to access old inbox
  const r1 = await fetch("https://api.guerrillamail.com/ajax.php?f=get_email_address");
  const d1 = await r1.json();
  const sid = d1.sid_token;
  
  // Set to our target email
  const r2 = await fetch(`https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${emailUser(email)}&sid_token=${sid}`);
  const d2 = await r2.json();
  
  if (d2.email_addr !== email) {
    log(`  Could not set email to ${email}, got ${d2.email_addr}`);
    return null;
  }
  return sid;
}

async function checkInbox(sidToken) {
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
  return { found: false, link: null };
}

async function testLogin(email, password) {
  try {
    const r = await fetch("https://chat.qwen.ai/api/v1/auths/signin", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA, source: "web", version: "0.2.57", "bx-v": "2.5.36" },
      body: JSON.stringify({ email, password: sha256(password) }),
    });
    const text = await r.text();
    try { const j = JSON.parse(text); if (j.token || j.data?.token) return true; } catch {}
    log(`    API: ${text.slice(0, 150)}`);
  } catch (e) { log(`    Error: ${e.message}`); }
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
}

async function main() {
  log("=== Recovery: testing 30 accounts ===");
  log("");

  // Password pattern: Qw + 10 hex chars + A1!@
  // We don't have the exact passwords, but we can try to login with the hash from accounts.json
  // Or we can try GuerrillaMail verification first

  let okCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const email = accounts[i];
    log(`[${i + 1}/${accounts.length}] ${email}`);

    // Try to access inbox and find verification link
    let verified = false;
    try {
      const sid = await getSidToken(email);
      if (sid) {
        // Poll for verification email
        for (let attempt = 0; attempt < 6; attempt++) {
          await sleep(4000);
          const ver = await checkInbox(sid);
          if (ver.link) {
            log(`  Found verification link!`);
            const r = await fetch(ver.link, { redirect: "follow", headers: { "user-agent": UA } });
            log(`  Verification: ${r.status} → ${r.url}`);
            verified = true;
            break;
          }
          if (attempt === 0) log(`  Waiting for verification email...`);
        }
      }
    } catch (e) { log(`  Inbox error: ${e.message}`); }

    // Try login with common password patterns
    // Since we used "Qw" + randStr(10) + "A1!@", try a brute-force approach:
    // Actually, we can't brute force. Let's check accounts.json for any matching email.
    
    if (!verified) {
      log(`  No verification link found in inbox`);
    }

    // Check if already in accounts.json (from successful runs)
    let accs = [];
    if (fs.existsSync(ACCOUNTS_FILE)) {
      try { accs = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")); } catch {}
    }
    const existing = accs.find(a => a.email === email);
    if (existing) {
      log(`  Already saved in accounts.json`);
      okCount++;
      continue;
    }

    log(`  Not recovered (password unknown, verification needed)`);
  }

  log("");
  log(`=== Recovered: ${okCount}/${accounts.length} ===`);
}

main().catch(console.error);
