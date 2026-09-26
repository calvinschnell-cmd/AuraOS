// Feature demo, captured: `npm run demo:screens`.
//
// Starts its own MOCK MODE server (no API keys, in-memory store, a throwaway
// ADMIN_KEY), seeds it through the real API (scans, cards, walk-ins, a BEAT
// THIS SCORE challenger, a mirror status, a CALL UP), then drives headless
// Chrome over the DevTools protocol to screenshot the admin dashboard, the
// full-screen judges QR, the phone feed, the mirror and the launcher, and
// checks the /operator and /remote redirects and the HOME link on every page.
// Writes docs/demo/screens/*.png and docs/demo/screens.json. Needs Chrome
// (or CHROME_PATH) and Node 22+ (built-in WebSocket).
import { spawn, execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.DEMO_PORT ?? 3200);
const DEVTOOLS_PORT = 9333;
const BASE = `http://localhost:${PORT}`;
const ADMIN_KEY = `demo-${randomBytes(8).toString("hex")}`;
const OUT = path.join(process.cwd(), "docs", "demo", "screens");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found (set CHROME_PATH).");
  return found;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else child.kill("SIGTERM");
}

async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error(`${url} did not come up in ${timeoutMs / 1000}s`);
}

/** Minimal Chrome DevTools protocol client for one page. */
async function connectPage() {
  const targets = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) =>
    new Promise((resolve) => {
      const fn = (params) => {
        listeners.get(method).delete(fn);
        resolve(params);
      };
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(fn);
    });
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    send,
    close: () => ws.close(),
    async viewport(width, height, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    },
    async goto(url, settleMs = 2500) {
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
      await sleep(settleMs);
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    },
    async screenshot(file, { fullPage = false, clip } = {}) {
      const params = { format: "png", captureBeyondViewport: fullPage };
      if (clip) params.clip = { ...clip, scale: 1 };
      else if (fullPage) {
        const { cssContentSize } = await send("Page.getLayoutMetrics");
        params.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
      }
      const { data } = await send("Page.captureScreenshot", params);
      const buf = Buffer.from(data, "base64");
      if (file) writeFileSync(path.join(OUT, file), buf);
      return buf;
    },
  };
}

/** A 4:5 card image (stand-in for the kiosk's rendered share card). */
async function makeCardPng(page, title, aura, hue) {
  const html = `<body style="margin:0;background:#111"><div style="width:400px;height:500px;box-sizing:border-box;border:6px solid hsl(${hue} 90% 75%);
    background:linear-gradient(160deg,hsl(${hue} 40% 18%),#0b0b0b);color:hsl(${hue} 90% 80%);font:700 22px monospace;padding:28px;display:flex;flex-direction:column;justify-content:space-between">
    <div>AURA OS // DEMO CARD</div><div style="font-size:64px">${aura.toLocaleString("en-US")}</div><div>${title}</div></div></body>`;
  await page.viewport(400, 500);
  await page.goto(`data:text/html,${encodeURIComponent(html)}`, 200);
  return page.screenshot(null, { clip: { x: 0, y: 0, width: 400, height: 500 } });
}

async function api(pathname, init = {}) {
  const res = await fetch(`${BASE}${pathname}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}
const adminJson = (body) => ({ method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY }, body: JSON.stringify(body) });

async function seed(page) {
  const cards = [];
  const people = [
    ["VINTAGE RACING JACKET", "Maya", 210],
    ["ALL BLACK EVERYTHING", "Jordan", 280],
    ["THRIFTED CARDIGAN ERA", "Sam", 40],
  ];
  for (const [title, name, hue] of people) {
    const png = await makeCardPng(page, title, 0, hue);
    const form = new FormData();
    form.set("image", new Blob([png], { type: "image/png" }), "photo.png");
    const scan = await api("/api/analyze", { method: "POST", body: form }); // { id, aura, analysis, ... }
    const cardPng = await makeCardPng(page, title, scan.aura, hue);
    const cardForm = new FormData();
    const id = randomUUID();
    for (const [k, v] of Object.entries({ id, kind: "scan", scanId: scan.id, headline: String(scan.aura), target: String(scan.aura), title, name })) cardForm.set(k, v);
    cardForm.set("image", new Blob([cardPng], { type: "image/png" }), "card.png");
    await api("/api/cards", { method: "POST", body: cardForm });
    cards.push({ id, title, name, aura: scan.aura });
  }
  // The line: two walk-ins signed up on /admin, one BEAT THIS SCORE tap from a phone.
  await api("/api/challenges", adminJson({ name: "Priya" }));
  await api("/api/challenges", adminJson({ name: "Marcus" }));
  await api("/api/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Alex", cardId: cards[1].id }) });
  const { challenges } = await api("/api/challenges");
  await api(`/api/challenges/${challenges[0].id}`, { method: "POST", headers: { "x-admin-key": ADMIN_KEY } }); // CALL UP Priya
  return cards;
}

/** What the mirror reports while a solo result is on screen. */
const mirrorStatus = (card) => ({
  state: "RESULT",
  mode: "mirror",
  muted: false,
  camera: "live",
  people: 1,
  framing: "full",
  scansToday: 3,
  scan: { nickname: card.name.toUpperCase(), aura: card.aura, rank: "#1" },
  lobby: null,
  battle: null,
  card: { pageUrl: `https://www.aurafulos.tech/r/${card.id}` },
});

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chromePath = findChrome();
  const results = { capturedAt: new Date().toISOString(), server: "MOCK MODE (in-memory, no API keys)", checks: [], screens: [] };
  const check = (name, pass, detail = "") => {
    results.checks.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  };

  console.log(`starting a MOCK MODE server on :${PORT} ...`);
  const server = spawn(process.execPath, ["scripts/dev-mock.mjs"], {
    env: { ...process.env, PORT: String(PORT), ADMIN_KEY, AURA_DIST_DIR: ".next-demo", PUBLIC_BASE_URL: "https://www.aurafulos.tech" },
    stdio: "ignore",
  });
  const profile = mkdtempSync(path.join(tmpdir(), "aura-demo-"));
  let chrome;
  try {
    await waitFor(`${BASE}/api/leaderboard`, 180_000);
    chrome = spawn(chromePath, [
      "--headless=new",
      `--remote-debugging-port=${DEVTOOLS_PORT}`,
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--mute-audio", // the kiosk page starts its music: never out loud from a screenshot run
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "about:blank",
    ]);
    await waitFor(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`, 20_000);
    const page = await connectPage();

    const cards = await seed(page);
    // The mirror reports on change + every 3 s; stand in for it (a status older than 10 s reads as offline).
    const reportStatus = () => api("/api/kiosk/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mirrorStatus(cards[1])) });
    await reportStatus();
    console.log(`seeded ${cards.length} cards, 3 sign-ups, 1 call-up, mirror status`);

    // Old URLs land on the one admin page.
    for (const old of ["/operator", "/remote"]) {
      await page.viewport(1280, 800);
      await page.goto(`${BASE}${old}`, 1500);
      const at = await page.evaluate("location.pathname");
      check(`${old} redirects to /admin`, at === "/admin", at);
    }

    // Admin dashboard, unlocked, with a control pressed.
    await page.viewport(1600, 1000);
    await page.goto(`${BASE}/admin`, 500);
    await page.evaluate(`localStorage.setItem("aura-os.admin-key", ${JSON.stringify(ADMIN_KEY)}); location.reload(); true`);
    await reportStatus();
    await sleep(4000);
    const before = await api("/api/remote?since=0");
    await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("SIMULATE WAVE"))?.click(); true`);
    await sleep(2500);
    const after = await api(`/api/remote?since=${before.cursor}`);
    check("CONTROLS button queues a command for the mirror", after.commands.some((c) => c.command === "wave"), `commands after cursor: ${after.commands.map((c) => c.command).join(",")}`);
    const text = await page.evaluate("document.body.innerText");
    check("admin shows the mirror (status relayed)", text.includes("SOLO SCAN") && text.includes(cards[1].name.toUpperCase()));
    check("admin shows the line (walk-ins + BEAT THIS SCORE)", text.includes("MARCUS") && text.includes("ALEX") && text.includes("WANTS TO BEAT"));
    check("admin shows the last call-up", text.includes("LAST CALLED: PRIYA"));
    check("admin shows the feed", cards.every((c) => text.includes(c.title)));
    check("admin shows OPEN MIRROR", text.includes("MIRROR IS OPEN") || text.includes("OPEN MIRROR"));
    await page.screenshot("admin-dashboard.png", { fullPage: true });
    results.screens.push({ file: "admin-dashboard.png", what: "/admin: mirror status, OPEN MIRROR, controls (WAVE SENT), phone QR, sign-ups, stats, feed, standings" });

    // Board edits.
    await page.evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("EDIT / DELETE"))?.click(); true`);
    await sleep(800);
    const deletable = await page.evaluate(`document.querySelectorAll(".op-board__row--edit button").length`);
    check("STANDINGS → EDIT / DELETE lists every entry with a delete button", deletable === cards.length, `${deletable} rows`);
    await page.screenshot("admin-board-edit.png", { clip: await page.evaluate(`(() => { const r = [...document.querySelectorAll(".op-win")].find((w) => w.textContent.includes("STANDINGS.EXE")).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`) });
    results.screens.push({ file: "admin-board-edit.png", what: "STANDINGS → EDIT / DELETE" });

    // Judges QR, full screen.
    await page.evaluate(`document.querySelector(".op-qr")?.click(); true`);
    await sleep(800);
    const qrUrl = await page.evaluate(`document.querySelector(".op-qr-full__url")?.textContent ?? ""`);
    check("phone QR opens full screen for judges", qrUrl.includes("AURAFULOS.TECH/FEED"), qrUrl);
    await page.screenshot("admin-judges-qr.png");
    results.screens.push({ file: "admin-judges-qr.png", what: "PHONE_QR → tap: full-screen QR to www.aurafulos.tech/feed" });

    // Phone feed with the HOME link.
    await page.viewport(390, 844, true);
    await page.goto(`${BASE}/feed`, 3500);
    check("phone feed has the HOME link", await page.evaluate(`!!document.querySelector("a.home-link[href='/'], .app-nav a[href='/']")`));
    await page.screenshot("phone-feed.png");
    results.screens.push({ file: "phone-feed.png", what: "/feed on a phone: app bar, just scanned, tab bar (HOME · FEED · BOARD · JOIN)" });

    await page.goto(`${BASE}/feed?tab=standings`, 3000);
    check("tab bar BOARD shows the standings", await page.evaluate(`document.querySelector(".app-nav__item--on")?.textContent.includes("BOARD") && document.querySelectorAll(".standings__list li").length > 0`));
    await page.screenshot("phone-board.png");
    results.screens.push({ file: "phone-board.png", what: "/feed?tab=standings (BOARD tab)" });

    await page.goto(`${BASE}/r/${cards[1].id}`, 3000);
    await page.screenshot("phone-card.png");
    results.screens.push({ file: "phone-card.png", what: "/r/[id]: a card, BEAT THIS SCORE, share" });

    await page.goto(`${BASE}/me`, 2500);
    check("JOIN tab offers an AURA ID", await page.evaluate(`document.body.innerText.includes("GET AN AURA ID")`));
    await page.screenshot("phone-join.png");
    results.screens.push({ file: "phone-join.png", what: "/me (JOIN tab): get an AURA ID" });

    // HOME link everywhere but the launcher.
    for (const route of ["/leaderboard", `/r/${cards[0].id}`, "/pose-lab", "/admin"]) {
      await page.viewport(1280, 800);
      await page.goto(`${BASE}${route}`, 2500);
      check(`HOME link on ${route.replace(cards[0].id, "[id]")}`, await page.evaluate(`!!document.querySelector("a.home-link[href='/'], .app-nav a[href='/']")`));
    }
    await page.goto(`${BASE}/`, 1500);
    check("no HOME link on the launcher itself", !(await page.evaluate(`!!document.querySelector("a.home-link")`)));
    await page.screenshot("launcher.png");
    results.screens.push({ file: "launcher.png", what: "/ (where HOME goes)" });

    // Mirror: HOME hidden until the mouse moves.
    await page.viewport(900, 1200);
    await page.goto(`${BASE}/kiosk?mode=mirror`, 6000);
    const hiddenAtRest = await page.evaluate(`document.querySelector("a.home-link")?.classList.contains("home-link--hidden")`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 200, y: 300 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 220, y: 320 });
    await sleep(400);
    const shownOnMove = await page.evaluate(`!document.querySelector("a.home-link")?.classList.contains("home-link--hidden")`);
    check("mirror hides HOME until the mouse moves", hiddenAtRest === true && shownOnMove === true);
    await page.screenshot("mirror-home-on-mouse-move.png");
    results.screens.push({ file: "mirror-home-on-mouse-move.png", what: "/kiosk?mode=mirror (fake camera), HOME shown after a mouse move" });

    page.close();
  } finally {
    killTree(chrome);
    killTree(server);
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }

  writeFileSync(path.join(OUT, "..", "screens.json"), `${JSON.stringify(results, null, 2)}\n`);
  const failed = results.checks.filter((c) => !c.pass);
  console.log(`\n${results.checks.length - failed.length}/${results.checks.length} checks passed; screens in docs/demo/screens/`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
