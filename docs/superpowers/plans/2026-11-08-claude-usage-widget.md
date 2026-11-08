# Claude Usage Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A frameless always-on-top Windows widget that shows Claude "Current session" (speedometer) and "This week" (fuel gauge) usage, scraped from `https://claude.ai/settings/usage` with the user's own logged-in session.

**Architecture:** Electron main process owns a persistent session (`persist:claude`), a visible login window, a hidden scraper window, a poll loop, tray, and notifications. Pure logic (parser, gauge math, alert rules) lives in small CommonJS modules tested with `node --test`; the widget renderer is plain HTML/CSS/JS with inline SVG and talks to main only through a minimal `preload.js` bridge.

**Tech Stack:** Node.js, Electron `^33`, electron-store `^8.2.0` (v9+ is ESM-only; stay on 8 for CommonJS), electron-builder `^25` (NSIS), `node:test` for unit tests.

**Spec:** the project brief pasted with the `/superpowers:writing-plans` invocation (sections 1-11). Not saved as a file; this plan reproduces every pinned value below.

## Global Constraints

- Project root is `d:\Project\Claude_meter\usage-widget\` (folder name from spec §8). Files: `main.js, scraper.js, preload.js, widget.html, widget.css, gauges.js, widget.js, package.json`. Added beyond spec §8 for testability: `parser.js`, `alerts.js`, `tests/`.
- Session partition is exactly `persist:claude`. Usage URL `https://claude.ai/settings/usage`. Login URL `https://claude.ai/login`.
- Every BrowserWindow: `contextIsolation: true`, `nodeIntegration: false`. Only `preload.js` exposes IPC, only the channels listed in Task 4.
- Never read or store the password. No network calls other than to claude.ai. No telemetry.
- Parse `document.body.innerText` by text regex, never CSS classes.
- Hidden scraper: `show: false`, wait ~3000 ms after `did-finish-load`.
- Poll every 3 min (`POLL_MS = 180000`); never below 2 min (`MIN_POLL_MS = 120000`), including manual "Refresh now" (throttled to that floor).
- Widget window ≈ 440x260, frameless, always-on-top, transparent, rounded, draggable.
- Gauge sizes live in one `GAUGE_CONFIG` constant in `gauges.js`. One function `percentToAngle(percent, startAngle, endAngle)` serves both gauges.
- Speedometer: 270° sweep, 0-100 used, ticks every 10, labels every 20, zones green 0-69 / yellow 70-89 / red 90-100, center readout `57%`, text `Resets 4:50 PM`.
- Fuel gauge: 180°, E left / F right, fuel-pump icon, needle = `100 - used`, text `32% used`, red zone below 10% remaining with blink, text `Resets Thu 5:00 PM`.
- Tray tooltip `Session 57% | Week 32%`; menu: Refresh now, Show/Hide, Re-login, Start with Windows, Quit. Not-logged-in tooltip `Please log in`.
- Notifications at 80% and 95% usage, and when the session resets. Auto-start via `app.setLoginItemSettings({ openAtLogin: true })`.
- Gauges re-render only when numbers change. Stale label when last refresh failed.
- Installer: NSIS, artifact name `UsageWidget-Setup.exe`.

## Review Focus

1. Usage page lacks one section (e.g. no weekly limit on the plan): show the other gauge, mark the missing one `--`, do not call it a parse failure.
2. Reset text in a different shape than `4:50 PM` (e.g. `Resets in 2 hr 15 min`, `Resets Thursday 5:00 PM`): pass through the page's own wording rather than failing.
3. Boundary values `0% used` and `100% used` (needle at ends, fuel needle at E, zone colors at 69/70/89/90).
4. Notifications must fire once per threshold per reset cycle, not on every 3-minute poll; re-arm after a reset.
5. Saved widget position now off-screen (monitor unplugged), and a second app launch: clamp position to a visible display; single-instance lock.

---

### Task 1: Scaffold, login window, raw-text scraper

**Files:**
- Create: `usage-widget/package.json`, `usage-widget/main.js`, `usage-widget/scraper.js`, `usage-widget/.gitignore` (`node_modules`, `dist`)

**Interfaces:**
- Produces (`scraper.js`): `fetchUsagePage(): Promise<{ status: 'ok' | 'login' | 'blocked' | 'offline', text?: string }>`; `LOGIN_URL`, `USAGE_URL`, `PARTITION` constants exported.
- Produces (`main.js`): `openLoginWindow(): void`.

- [ ] **Step 1: Scaffold.** `git init` in `d:\Project\Claude_meter`. Create `package.json` with `main: "main.js"`, scripts `start` (`electron .`), `test` (`node --test tests/`), `build` (`electron-builder`), deps per Tech Stack. Run `cd usage-widget && npm install`. Expected: no errors.
- [ ] **Step 2: Implement `fetchUsagePage` in `scraper.js`.** Hidden `BrowserWindow` on `persist:claude`; set the session user agent to the default with the ` Electron/x.y.z` token removed (reduces bot-check hits); `loadURL(USAGE_URL)`; on `did-finish-load` wait 3000 ms then `executeJavaScript('document.body.innerText')`. Classify: final URL contains `/login` → `login`; title or text matches `/just a moment|verify you are human/i` → `blocked`; `did-fail-load` with `ERR_INTERNET_DISCONNECTED | ERR_NAME_NOT_RESOLVED | ERR_NETWORK_CHANGED | ERR_CONNECTION_*` → `offline`. Always destroy the window in `finally`; 30 s overall timeout resolves `offline`.
- [ ] **Step 3: Implement `openLoginWindow` and a temporary startup in `main.js`.** Visible 480x720 window, same partition, loads `LOGIN_URL`, reused if already open. On app ready call `fetchUsagePage()`; if `login`, open the login window; if `ok`, write `text` to `usage-widget/tests/fixtures/usage-page.txt` and print its length.
- [ ] **Step 4: Manual verification.** Run `npm start`, log in once in the window, quit, run `npm start` again. Expected: no login prompt, `tests/fixtures/usage-page.txt` exists and visibly contains "Current session", "This week", "% used", "Resets". **If the real wording differs from the spec, note the real strings; Task 2 targets the fixture, not the spec examples.** Also open DevTools → Network on the real page and note whether a JSON usage endpoint exists (spec §5.5 optional upgrade; record the finding, do not implement).
- [ ] **Step 5: Commit** `feat: scaffold, login window, raw usage page capture`.

### Task 2: Usage text parser

**Files:**
- Create: `usage-widget/parser.js`, `usage-widget/tests/parser.test.js`
- Modify: `usage-widget/scraper.js` (add parsing), `usage-widget/main.js` (print parsed values)

**Interfaces:**
- Produces: `parseUsage(text: string): { session: Section | null, week: Section | null }` where `Section = { percent: number /*0-100 int*/, resets: string /*page wording, e.g. "Resets 4:50 PM"*/ }`.
- Produces (`scraper.js`): `getUsage(): Promise<{ status: 'ok', session, week } | { status: 'login' | 'blocked' | 'offline' } | { status: 'parse_fail', rawText: string }>`; `ok` when at least one section parsed.

- [ ] **Step 1: Write failing tests** in `parser.test.js`, reading `tests/fixtures/usage-page.txt` for the real-page case, plus inline strings for the rest:
  - real fixture → `session.percent` and `week.percent` are integers 0-100 and `resets` start with `Resets`.
  - inline `"Current session\nResets 4:50 PM\n57% used\nWeekly limits\nThis week\nResets Thursday 5:00 PM\n32% used"` (adjust label order to match the fixture) → `{57,'Resets 4:50 PM'}` / `{32,'Resets Thursday 5:00 PM'}`.
  - Review Focus 1: text with only the session block → `week === null`, session set.
  - Review Focus 2: `"Resets in 2 hr 15 min"` → returned verbatim.
  - Review Focus 3: `0% used` → `0`; `100% used` → `100`.
  - garbage text → both `null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (`parseUsage` not defined).
- [ ] **Step 3: Implement `parseUsage`** in `parser.js`: locate each heading ("Current session", "This week"), take the text up to the next heading, extract `/(\d{1,3})\s*%\s*used/i` and `/resets[^\n]*/i`. Clamp percent to 0-100.
- [ ] **Step 4: Implement `getUsage`** in `scraper.js` wrapping `fetchUsagePage` + `parseUsage`. In `main.js` replace the temporary startup output with `console.log(await getUsage())`.
- [ ] **Step 5: Run** `npm test` → PASS; `npm start` → console shows real percentages and reset strings.
- [ ] **Step 6: Commit** `feat: parse usage page text`.

### Task 3: Gauge math and rendering (fake data)

**Files:**
- Create: `usage-widget/gauges.js`, `usage-widget/widget.html`, `usage-widget/widget.css`, `usage-widget/tests/gauges.test.js`

**Interfaces:**
- Produces (`gauges.js`, UMD: `module.exports` under Node, `window.Gauges` in browser):
  - `GAUGE_CONFIG: { speedo: { size, radius, start: -135, end: 135 }, fuel: { size, radius, start: -90, end: 90 }, zones }` (single place for sizes).
  - `percentToAngle(percent: number, startAngle: number, endAngle: number): number` (clamps percent to 0-100, linear).
  - `speedoZone(used: number): 'green' | 'yellow' | 'red'`
  - `fuelRemaining(used: number): number` (`100 - used`, clamped); `isLowFuel(used: number): boolean` (remaining `< 10`).
  - `renderSpeedometer(svgEl, data: { percent: number|null, resets: string|null })`, `renderFuel(svgEl, data)` — draw static SVG once, then only update needle `transform: rotate()` (CSS `transition`), readout and reset text when values differ from last render.
- Angles measured in degrees from 12 o'clock, positive clockwise.

- [ ] **Step 1: Write failing tests** in `gauges.test.js`: `percentToAngle(0,-135,135) === -135`, `(100,-135,135) === 135`, `(50,-135,135) === 0`, `(150,…)` clamps to 135, `(-5,…)` clamps to -135; fuel `percentToAngle(100,-90,90) === 90`. Zones: `speedoZone(69)==='green'`, `70`/`89`→`'yellow'`, `90`/`100`→`'red'`. `fuelRemaining(32)===68`, `fuelRemaining(100)===0`, `fuelRemaining(0)===100`. `isLowFuel(91)===true`, `isLowFuel(90)===false`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement the pure functions** in `gauges.js`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Implement rendering and layout.** `widget.html`: two `<svg>` gauges side by side, 440x260 body, a `stale` badge element, reset-text elements, and a dev panel with two range sliders shown only when the URL has `?dev`. `widget.css`: dark transparent rounded dashboard theme, glowing thin arcs, `.needle { transition: transform .8s cubic-bezier(.2,.8,.2,1) }`, `.low-fuel` blink keyframes, `-webkit-app-region: drag` on the body (sliders/buttons `no-drag`). Speedometer: arc segments in zone colors, ticks every 10, labels every 20, big center `NN%`. Fuel: half arc, `E`/`F` labels, inline-SVG pump icon, red segment 0-10% remaining, `.low-fuel` class when `isLowFuel`. `null` percent renders `--` and parks the needle at start.
- [ ] **Step 6: Manual verification.** Open `widget.html?dev` temporarily from `main.js` (a throwaway `loadFile('widget.html', { query: { dev: '1' } })` window; the real widget window comes in Task 4). Drag sliders: speedometer needle sweeps smoothly 0→100 with correct zone colors; fuel needle moves opposite (used 95 → needle near E, red zone blinking); `57` / `32` hard-coded matches spec text (`57%`, `32% used`).
- [ ] **Step 7: Commit** `feat: speedometer and fuel gauge UI`.

### Task 4: Live data over IPC, store, polling, stale state

**Files:**
- Create: `usage-widget/preload.js`, `usage-widget/widget.js`
- Modify: `usage-widget/main.js`, `usage-widget/widget.html` (load `gauges.js`, `widget.js`)

**Interfaces:**
- Consumes: `getUsage()` (Task 2), `Gauges.*` (Task 3).
- Produces (`preload.js`, `contextBridge` as `window.usageApi`, nothing else): `onUsage(cb: (state: UiState) => void): void`, `getUsage(): Promise<UiState>`. IPC channels: `usage:update` (main→renderer), `usage:get` (invoke). 
- Produces (`main.js`): `UiState = { session: Section|null, week: Section|null, stale: boolean, message: string|null, updatedAt: number|null }`; `refresh(): Promise<void>` single-flight (a call while one is running returns the running promise); `createWidgetWindow()`.
- electron-store keys: `lastUsage` (`{session, week, updatedAt}`), `windowBounds`.

- [ ] **Step 1: Implement `preload.js`, `widget.js`** (subscribe, call `Gauges.renderSpeedometer/renderFuel`, toggle stale badge showing `Stale` plus `message`) and `createWidgetWindow()` (440x260, frameless, `alwaysOnTop`, `transparent`, `resizable:false`, `skipTaskbar`, preload on, isolation on). Restore `windowBounds` from store; save on `moved`. Review Focus 5: before using saved bounds, require the rectangle to intersect some `screen.getAllDisplays()` workArea, otherwise use the primary display's top-right.
- [ ] **Step 2: Implement `refresh()` and the poll loop.** `ok` → merge sections (a `null` section keeps the previous stored value unless there was none), save to store, `stale:false`, send `usage:update`. Any other status → keep stored values, `stale:true`, `message` per status (`Please log in`, `Verification needed`, `Offline`, `Couldn't read page`). `setInterval(refresh, POLL_MS)`; enforce `MIN_POLL_MS` between any two scrapes (manual refresh inside the window returns the cached state). On start, send the stored value immediately so the widget is never blank.
- [ ] **Step 3: Add `app.requestSingleInstanceLock()`** (Review Focus 5): second launch quits and focuses the first instance's widget.
- [ ] **Step 4: Add error handling hooks.** `login` and `blocked` → `openLoginWindow()` (once; not reopened each poll while it is already open). `parse_fail` → append `rawText` with timestamp to `app.getPath('userData')/parse-failures.log`.
- [ ] **Step 5: Manual verification.** `npm start`: widget shows live values within ~10 s. Disconnect Wi-Fi, wait for next poll (or restart): old values remain with `Stale` badge. Reconnect: badge clears. Delete the saved bounds to an off-screen value in the store file and relaunch: widget appears on-screen.
- [ ] **Step 6: Commit** `feat: live usage data, polling, stale state`.

### Task 5: Tray, notifications, auto-start

**Files:**
- Create: `usage-widget/alerts.js`, `usage-widget/tests/alerts.test.js`
- Modify: `usage-widget/main.js`

**Interfaces:**
- Produces (`alerts.js`): `evaluateAlerts(prev: Section|null, next: Section|null, armed: { t80: boolean, t95: boolean }): { messages: string[], armed: { t80: boolean, t95: boolean } }`. Initial `armed = { t80: true, t95: true }`. A threshold fires once when `next.percent` crosses it while armed, then disarms; a session reset (`prev.percent - next.percent >= 20`) emits `Session reset` and re-arms both. Applied to the session section; the week section uses the same function with its own `armed` state and its message prefixed `Week` vs `Session`: add a `label: 'Session' | 'Week'` 4th parameter (messages like `Session at 80% used`).
- Consumes: `UiState`, `refresh()`, `openLoginWindow()`.

- [ ] **Step 1: Write failing tests** in `alerts.test.js`: 79→80 yields one `… 80% used` message and disarms `t80`; staying at 85 across a second call yields none (Review Focus 4); 94→95 yields the 95 message; 96 after 82 (both armed) yields both messages once; drop 90→5 yields `Session reset` and re-arms; small decrease 60→55 does not reset; `prev === null` (first run at 85) fires 80 but not a reset; `next === null` → no messages, armed unchanged.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement `evaluateAlerts`** in `alerts.js`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Wire `main.js`.** After each successful `refresh`, call `evaluateAlerts` for session and week, show each message via `new Notification({ title: 'Claude usage', body })`. Persist `armed` in electron-store so a restart doesn't re-fire.
- [ ] **Step 6: Tray.** `Tray` with a 16x16 icon (generate a plain PNG into `assets/tray.png`); tooltip `Session 57% | Week 32%` (`--` for missing values) or `Please log in` when status is `login`; context menu: Refresh now, Show/Hide, Re-login, Start with Windows (checkbox reflecting `app.getLoginItemSettings().openAtLogin`, toggling via `app.setLoginItemSettings({ openAtLogin })`), Quit. Tray click toggles widget. Tooltip updates on every `refresh`.
- [ ] **Step 7: Manual verification.** Run each tray menu item; temporarily lower thresholds in code to 1 to confirm one toast then none on later polls, then revert. Toggle Start with Windows and confirm in Task Manager → Startup apps.
- [ ] **Step 8: Commit** `feat: tray, notifications, auto-start`.

### Task 6: Package installer

**Files:**
- Modify: `usage-widget/package.json` (`build` block), add `usage-widget/assets/icon.ico` (256x256)

- [ ] **Step 1: Configure electron-builder:** `appId: "com.emon.usagewidget"`, `productName: "Usage Widget"`, `files` limited to the app files + `assets`, `win.target: "nsis"`, `win.icon: "assets/icon.ico"`, `nsis.artifactName: "UsageWidget-Setup.exe"`.
- [ ] **Step 2: Run** `npm run build`. Expected: `dist/UsageWidget-Setup.exe` exists, build exits 0.
- [ ] **Step 3: Manual verification on a clean Windows machine/VM:** install, launch, log in once, confirm gauges, tray, restart persists login, Start with Windows works, uninstall is clean. (SmartScreen warns on unsigned installers; expected, click "More info → Run anyway".)
- [ ] **Step 4: Commit** `build: nsis installer`.

---

## Where the unofficial approach can break (tell the user at handoff)

- Claude changing the Usage page wording/layout breaks the regex → widget goes `Stale`, raw text lands in `parse-failures.log`; update `parser.js` and its fixture.
- Cloudflare/bot checks may block the hidden window; app falls back to the visible window, but frequent polling can make it worse (hence the 2-min floor).
- The session cookie expires periodically → `Please log in` and the login window reopens.
- Anthropic's terms may restrict automated access to the web app; keep polling gentle and personal-use only.

## Self-Review

- Spec coverage: §3 stack (T1, T6), §5 flow (T1, T2, T4; JSON-endpoint upgrade recorded as a finding only, spec calls it optional), §6 widget/tray/notifications/auto-start (T3-T5), §6A gauges (T3), §7 error table (T1 classification, T4 handling), §8 structure (plus parser/alerts/tests), §9 security (Global Constraints, T4 preload), §10 build order matches T1→T6.
- Types: `Section`, `UiState`, `getUsage` statuses, `Gauges.*` names are consistent across tasks.
- Proportion: bodies are left to the implementer except the one non-obvious rule (alert arming).
