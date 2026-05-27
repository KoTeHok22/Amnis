const CAPMONSTER_KEY = process.env.CAPMONSTER_API_KEY || "";
const CAP_API = "https://api.capmonster.cloud";
const REQ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

async function apiFetch(endpoint, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${CAP_API}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientKey: CAPMONSTER_KEY, ...body }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

async function createTask(payload) {
  const data = await apiFetch("createTask", { task: payload });
  if (data.errorId !== 0)
    throw new Error(`CapMonster createTask error: ${data.errorCode || "UNKNOWN"} - ${data.errorDescription || JSON.stringify(data)}`);
  return data.taskId;
}

async function getResult(taskId) {
  return await apiFetch("getTaskResult", { taskId });
}

async function pollSolution(taskId, timeoutMs = 180000) {
  const start = Date.now();
  let lastStatus = null;
  while (Date.now() - start < timeoutMs) {
    const result = await getResult(taskId);

    // Task-level error (e.g. unsolvable)
    if (result.errorId !== 0 && result.status !== "processing") {
      throw new Error(`CapMonster task failed: ${result.errorCode} - ${result.errorDescription}`);
    }

    if (result.status === "ready") {
      if (result.errorId !== 0)
        throw new Error(`CapMonster solution error: ${result.errorCode} - ${result.errorDescription}`);
      return result.solution;
    }

    if (result.status !== lastStatus) {
      lastStatus = result.status;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("CapMonster solution timeout (180s)");
}

async function extractApiGetLib(page) {
  return await page.evaluate(() => {
    const scripts = document.querySelectorAll("script");
    for (const s of scripts)
      if (s.src && s.src.includes("aliyunCaptcha")) return s.src;
    return null;
  });
}

async function applySolution(page, requestInfo, solution, log) {
  const raw = solution?.data?.tokens;
  if (!raw) throw new Error("No tokens in CapMonster solution");
  const tokens = JSON.parse(raw);
  const captchaSig = tokens.data;
  if (!captchaSig) throw new Error("No 'data' field in CapMonster tokens");

  log("  Submitting form with WAF solution...");

  return await page.evaluate(({ info, sig }) => {
    let url = location.origin + location.pathname + location.search;
    url = url
      .replace(/[?&]u_aref=[^&]*/g, "")
      .replace(/[?&]u_asig=[^&]*/g, "")
      .replace(/[?&]u_atoken=[^&]*/g, "");
    const sep = url.includes("?") ? "&" : "?";
    url += sep + "u_atoken=" + encodeURIComponent(info.token);
    url += "&u_asig=" + encodeURIComponent(sig);
    if (info.refer) url += "&u_aref=" + encodeURIComponent(info.refer);

    const rawData = atob(info.data);
    let fields = {};
    try {
      fields = JSON.parse(rawData);
    } catch {
      rawData.split("&").forEach((pair) => {
        const eq = pair.indexOf("=");
        if (eq >= 0) fields[pair.slice(0, eq)] = pair.slice(eq + 1);
      });
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.style.display = "none";

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();

    return { ok: true, method: "direct-form-submit", fieldCount: Object.keys(fields).length };
  }, { info: requestInfo, sig: captchaSig });
}

async function solveAlibabaCaptcha(page, requestInfo, prefix, log) {
  if (!CAPMONSTER_KEY) throw new Error("CAPMONSTER_API_KEY not set");
  if (!requestInfo?.sceneId) throw new Error("No sceneId in requestInfo");
  if (!prefix) throw new Error("No prefix");

  log(`  sceneId=${requestInfo.sceneId} prefix=${prefix}`);

  const apiGetLib = await extractApiGetLib(page).catch(() => null);
  if (apiGetLib) log(`  apiGetLib=${apiGetLib}`);

  const metadata = {
    sceneId: requestInfo.sceneId,
    prefix: prefix,
  };
  if (requestInfo.userId) metadata.userId = requestInfo.userId;
  if (requestInfo.userUserId) metadata.userUserId = requestInfo.userUserId;
  if (requestInfo.region) metadata.region = requestInfo.region;
  if (requestInfo.traceid) metadata.UserCertifyId = requestInfo.traceid;
  if (apiGetLib) metadata.apiGetLib = apiGetLib;

  // Try up to 2 task creation attempts
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      log(`  Creating CapMonster task (attempt ${attempt + 1})...`);
      const taskId = await createTask({
        type: "CustomTask",
        class: "alibaba",
        websiteURL: "https://chat.qwen.ai/auth?mode=register",
        userAgent: REQ_UA,
        metadata,
      });
      log(`  taskId=${taskId}`);

      log("  Waiting for solution...");
      const solution = await pollSolution(taskId);
      log("  Solution received");

      await applySolution(page, requestInfo, solution, log);
      return solution;
    } catch (e) {
      lastError = e;
      log(`  Attempt ${attempt + 1} failed: ${e.message}`);
      if (attempt < 1) {
        log("  Retrying with new task...");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  throw lastError || new Error("All CapMonster attempts failed");
}

module.exports = {
  createTask,
  getResult,
  pollSolution,
  applySolution,
  solveAlibabaCaptcha,
};
