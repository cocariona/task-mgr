/* 탭닫기·숨김 flush 검증(2026-10-08) — index.html 의 저장 모듈(authParam·cloudSave·flushCloudSave·diff)과
   pagehide/visibilitychange 연결, 워크스페이스 전환 본문을 그대로 떼어 가짜 시계·가짜 fetch 위에서 실행한다.
   언로드 모형(브라우저 실측 2026-10-08): pagehide 처리 뒤에는 **마이크로태스크까지만** 돌고 타이머·네트워크 뒤는 실행되지 않는다.
     → 핸들러를 부른 뒤 마이크로태스크만 비우고(타이머는 진행하지 않음) 나간 요청을 센다.
   토큰 모형: Firebase 10.12 와 같은 구조 — 만료 30초 전까지는 마이크로태스크만으로 캐시 토큰, 그 뒤는 네트워크 갱신(300ms).
   가짜 fetch: keepalive 본문이 64KB 를 넘으면 브라우저처럼 거부한다(요청이 나가지 않음).
   확인 대상: ① 커리어 카드 보강(S4a) 저장이 2초 안에 탭을 닫아도 나간다 — 한 시간 넘게 열어 둔 탭(토큰 만료)에서도
             ② 요청이 pagehide 핸들러 안에서 동기로 나간다
             ③ 숨김(visibilitychange→hidden)에서도 나간다
             ④ 워크스페이스 전환 flush 가 통째 PUT 이 아니라 PATCH 다
             ⑤ 64KB 넘는 본문도 keepalive 거부로 사라지지 않는다
             ⑥ 본문은 평소 2초 저장과 같다(잎 경로 PATCH · savedAt ISO 계약 그대로)
   수정 전 소스로 돌리면 실패해야 한다: SRC=옛파일.html node test_unloadflush.js
   선택: 클라우드 blob JSON 경로를 인자로 주면 실데이터로 카드 보강 flush 를 본다(node test_unloadflush.js personal.json). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(process.env.SRC || path.join(__dirname, "index.html"), "utf8");

const between = (a, b) => {
  const i = SRC.indexOf(a);
  if (i < 0) throw new Error("못 찾음: " + a);
  const j = SRC.indexOf(b, i);
  if (j < 0) throw new Error("못 찾음: " + b);
  return SRC.slice(i, j);
};
/* 1) 저장 모듈: fbDataUrl ~ cloudLoad 직전 */
const MODULE = between("const fbDataUrl = ", "/* 클라우드 로드:");
/* 2) 최상위 이벤트 연결: 자정 타이머 ~ gid 직전 */
const WIRING = between("setInterval(checkDayRollover", "const gid = ");
/* 3) 워크스페이스 전환 본문 */
const swA = SRC.indexOf("const switchWs = () => {");
if (swA < 0) throw new Error("switchWs 를 못 찾음");
const SWITCH = SRC.slice(swA + "const switchWs = () => {".length, SRC.indexOf("\n  };", swA));
/* 4) S4a 개인 카드 보강(test_retiredproj.js 와 같은 추출) */
const pa = SRC.indexOf("const PERSONAL_PROJECTS = [");
const pb = SRC.indexOf("\n];", pa) + 3;
const rIdx = SRC.indexOf("const RETIRED_PROJ_IDS", pb);
const rLine = rIdx >= 0 ? SRC.slice(rIdx, SRC.indexOf(";", rIdx) + 1) : "const RETIRED_PROJ_IDS = new Set();";
const { PERSONAL_PROJECTS, RETIRED_PROJ_IDS } = new Function(SRC.slice(pa, pb) + "\n" + rLine + "\nreturn { PERSONAL_PROJECTS, RETIRED_PROJ_IDS };")();
const s4a = SRC.indexOf("personalProjDone.current = true;");
const s4open = SRC.indexOf("setProjects(prev => {", s4a);
const S4A = SRC.slice(s4open + "setProjects(prev => {".length, SRC.indexOf("\n    });", s4open));
const upgrade = (prev, tasks, recurrings) => new Function("ctx", "with (ctx) {\n" + S4A + "\n}")({ PERSONAL_PROJECTS, RETIRED_PROJ_IDS, prev, tasks, recurrings });

const T0 = Date.UTC(2026, 9, 8, 4, 0, 0);
const drain = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };

/* 실행 환경 하나 = 탭 하나 */
const makeTab = ({ tokenAgeMin = 10 } = {}) => {
  const clock = { now: T0 };
  let timers = [], tid = 0;
  const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: clock.now + (ms || 0), fn }); return id; };
  const clearTimeout_ = (id) => { timers = timers.filter(t => t.id !== id); };
  /* 살아 있는 탭에서 시간이 흐름(타이머 실행) */
  const advance = async (ms) => {
    const end = clock.now + ms;
    for (;;) {
      await drain();
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); clock.now = t.at; t.fn();
    }
    clock.now = end; await drain();
  };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const mkTok = (expMs) => "h." + Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000), iat: Math.floor(expMs / 1000) - 3600 })).toString("base64url") + ".s";
  const user = {
    exp: T0 - tokenAgeMin * 60000 + 3600000, refreshes: 0,
    async getToken() {
      if (clock.now <= this.exp - 30000) return this.tok;
      await new Promise(r => setTimeout_(r, 300)); /* 네트워크 갱신(+영속 저장) */
      this.refreshes++; this.exp = clock.now + 3600000; this.tok = mkTok(this.exp);
      return this.tok;
    },
    async getIdToken() {
      const t = await (async (p) => { try { return await p; } catch (e) { throw e; } })(this.getToken());
      return t;
    },
  };
  user.tok = mkTok(user.exp);

  const sent = [];
  const fetch_ = (url, opt = {}) => {
    const bytes = Buffer.byteLength(opt.body || "", "utf8");
    if (opt.keepalive && bytes > 65536) return Promise.reject(new TypeError("keepalive body over 64KB"));
    sent.push({ url, method: opt.method || "GET", keepalive: !!opt.keepalive, body: opt.body ? JSON.parse(opt.body) : null, bytes, at: clock.now });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  };
  const listeners = {};
  const on = (who) => (ev, fn) => { (listeners[who + ":" + ev] = listeners[who + ":" + ev] || []).push(fn); };
  const document = { visibilityState: "visible", getElementById: () => null, addEventListener: on("document") };
  const window = { addEventListener: on("window") };
  const fire = (who, ev) => (listeners[who + ":" + ev] || []).forEach(fn => fn({}));
  const WORKSPACES = { work: { key: "work", fbPath: "data" }, personal: { key: "personal", fbPath: "personal" } };
  const ctx = {
    WS: WORKSPACES.personal, WORKSPACES, fbUser: () => user, fetch: fetch_,
    setTimeout: setTimeout_, clearTimeout: clearTimeout_, setInterval: () => 0, Date: FakeDate,
    document, window, localStorage: { getItem: (k) => (k === "tm-devid" ? "d_test01" : null), setItem: () => {} }, checkDayRollover: () => {},
  };
  const api = new Function("ctx", "with (ctx) {\n" + MODULE + "\n" + WIRING +
    "\nreturn { authParam, cloudSave, flushCloudSave, setSyncBase, resetSyncState, applyUpdates };\n}")(ctx);
  const switchWs = () => {
    Object.assign(ctx, { wsKey: ctx.WS.key, setWsKey: () => {}, flushCloudSave: api.flushCloudSave, resetSyncState: api.resetSyncState });
    new Function("ctx", "with (ctx) {\n" + SWITCH + "\n}")(ctx);
  };
  /* 탭을 닫음 = pagehide 뒤 마이크로태스크만 */
  const closeTab = async () => { fire("window", "pagehide"); const sync = sent.length; await drain(); return sync; };
  const hide = async () => { document.visibilityState = "hidden"; fire("document", "visibilitychange"); const sync = sent.length; await drain(); return sync; };
  const show = async () => { document.visibilityState = "visible"; fire("document", "visibilitychange"); fire("window", "focus"); await drain(); };
  return { clock, advance, api, sent, user, ctx, switchWs, closeTab, hide, show };
};

/* 클라우드 blob(커리어 카드 이전 모양) — 합성. 실데이터는 인자로 */
const synthBlob = () => ({
  savedAt: "2026-10-08T03:00:00.000Z",
  lastWriter: { devId: "d_other1", at: "2026-10-08T03:00:00.000Z" },
  projects: PERSONAL_PROJECTS.filter(p => p.id !== "p_career").map((p, i) => ({ ...p, ...(i === 1 ? { focus: true } : {}) })),
  tasks: [
    { id: "t1", text: "할 일 하나", project: PERSONAL_PROJECTS[0].id, status: "action", planDate: "2026-10-08", createdAt: "2026-10-01T00:00:00.000Z" },
    { id: "t2", text: "할 일 둘", project: PERSONAL_PROJECTS[3].id, status: "waiting", createdAt: "2026-10-02T00:00:00.000Z" },
  ],
  history: [{ date: "2026-10-07", items: [{ type: "added", text: "할 일 하나", projectName: "", project: PERSONAL_PROJECTS[0].id, time: "09:00" }] }],
  recurrings: [{ id: "r1", text: "반복 하나", project: PERSONAL_PROJECTS[1].id, type: "daily" }],
});
const fileArg = process.argv[2];
const BASE = fileArg ? JSON.parse(fs.readFileSync(fileArg, "utf8").replace(/^\uFEFF/, "")) : synthBlob();
if (fileArg && Array.isArray(BASE.projects)) BASE.projects = BASE.projects.filter(p => p && p.id !== "p_career"); /* 보강 전 모양으로 */

/* 로드 → 보강 → 자동 저장(cloudSave)까지. 앱의 자동 저장 effect 와 같은 data 모양 */
const loadAndUpgrade = async (tab, { idleMs = 5000 } = {}) => {
  await tab.api.authParam();                 /* cloudLoad 의 authParam */
  tab.api.setSyncBase(BASE);                 /* cloudLoad 성공 → 기준선 */
  await tab.advance(idleMs);
  const projects = upgrade(BASE.projects || [], BASE.tasks || [], BASE.recurrings || []);
  const data = { tasks: BASE.tasks, projects, history: BASE.history, recurrings: BASE.recurrings, savedAt: new tab.ctx.Date().toISOString() };
  tab.api.cloudSave(data);
  return data;
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); }
};
const tokOf = (url) => { const m = /\?auth=([^&]+)/.exec(url); if (!m) return null; return JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString()); };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  /* 기준: 평소 2초 저장이 보내는 본문 */
  const ref = makeTab();
  const refData = await loadAndUpgrade(ref);
  await ref.advance(2500);
  const normal = ref.sent[0];
  ok("평소 2초 저장은 PATCH 로 나간다(기준)", normal && normal.method === "PATCH", normal && normal.method);
  const applied = normal ? ref.api.applyUpdates(BASE, normal.body) : null;
  ok("기준 본문을 클라우드에 적용하면 커리어 카드가 생긴다", applied && (applied.projects || []).some(p => p && p.id === "p_career"));
  ok("savedAt 은 ISO 문자열 그대로 간다", normal && typeof normal.body.savedAt === "string" && normal.body.savedAt === refData.savedAt && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(normal.body.savedAt), normal && normal.body.savedAt);

  /* ① 대조군: 토큰이 살아 있는 탭에서 저장 0.5초 뒤 닫기 — 옛 코드도 통과(브라우저 실측과 같은 모형인지 확인) */
  const a = makeTab();
  await loadAndUpgrade(a);
  await a.advance(500);
  await a.closeTab();
  ok("토큰이 살아 있으면 0.5초 뒤 탭닫기에도 저장이 나간다", a.sent.length === 1 && a.sent[0].keepalive, "요청 " + a.sent.length);
  ok("그 본문은 평소 저장과 같다(잎 경로 PATCH)", a.sent[0] && normal && a.sent[0].method === "PATCH" && sameJson(a.sent[0].body, normal.body));
  await a.advance(3000);
  ok("flush 뒤 2초 타이머가 또 보내지 않는다", a.sent.length === 1, "요청 " + a.sent.length);

  /* ② 동기 발사: 핸들러가 돌아오기 전에 요청이 나가 있어야 한다 */
  const b = makeTab();
  await loadAndUpgrade(b);
  await b.advance(500);
  const syncCount = await b.closeTab();
  ok("pagehide 핸들러 안에서 동기로 요청이 나간다", syncCount === 1, "핸들러 직후 요청 " + syncCount);

  /* ③ 한 시간 넘게 열어 둔 탭(토큰 만료) — 카드가 보이고 1초 뒤 닫기 */
  const c = makeTab();
  await loadAndUpgrade(c, { idleMs: 2 * 3600000 });
  await c.advance(1000);
  await c.closeTab();
  const tk = c.sent[0] ? tokOf(c.sent[0].url) : null;
  ok("토큰이 만료된 탭에서도 1초 뒤 탭닫기에 저장이 나간다", c.sent.length === 1, "요청 " + c.sent.length + " · 갱신 " + c.user.refreshes);
  ok("그때 쓴 토큰은 살아 있는 토큰이다", tk && tk.exp * 1000 > c.clock.now + 60000, tk ? "exp-now=" + Math.round((tk.exp * 1000 - c.clock.now) / 1000) + "s" : "토큰 없음");

  /* ④ 숨김에서도 flush */
  const d = makeTab();
  await loadAndUpgrade(d);
  await d.advance(500);
  await d.hide();
  ok("숨김(visibilitychange→hidden)에서도 저장이 나간다", d.sent.length === 1 && sameJson(d.sent[0].body, normal && normal.body), "요청 " + d.sent.length);
  await d.advance(3000);
  ok("숨김 flush 뒤 중복 저장 없음", d.sent.length === 1, "요청 " + d.sent.length);
  const d2 = makeTab();
  await loadAndUpgrade(d2);
  await d2.advance(500);
  await d2.show();
  ok("다시 보일 때(visible·focus)는 보내지 않고 2초를 기다린다", d2.sent.length === 0, "요청 " + d2.sent.length);
  await d2.advance(2000);
  ok("그리고 2초 저장이 그대로 나간다", d2.sent.length === 1 && sameJson(d2.sent[0].body, normal && normal.body), "요청 " + d2.sent.length);

  /* ⑤ 워크스페이스 전환: flush 직후 resetSyncState() — PATCH 여야 한다 */
  const e = makeTab();
  await loadAndUpgrade(e);
  await e.advance(500);
  e.switchWs();
  await drain();
  const es = e.sent[0];
  ok("전환 flush 는 옛 워크스페이스 경로로 간다", es && /\/personal\.json/.test(es.url) && e.ctx.WS.key === "work", es && es.url.slice(0, 60));
  ok("전환 flush 는 통째 PUT 이 아니라 평소와 같은 PATCH 다", es && es.method === "PATCH" && sameJson(es.body, normal && normal.body), es && es.method + " " + es.bytes + "B");

  /* ⑥ 64KB 넘는 본문(기준선이 없어 통째 PUT 으로 가는 경우) — keepalive 거부로 사라지지 않아야 한다.
        탭이 살아 있는 호출 자리(자정 리로드 전 await · 전환)를 그대로 흉내 내 flushCloudSave 를 직접 부른다. */
  const f = makeTab();
  await f.api.authParam();
  await f.advance(500);
  const big = { ...synthBlob(), history: Array.from({ length: 400 }, (_, i) => ({ date: "2026-0" + (1 + (i % 9)) + "-" + String(1 + (i % 28)).padStart(2, "0"), items: [{ type: "added", text: "합성 기록 ".repeat(20) + i, project: "p", time: "09:00" }] })) };
  f.api.cloudSave({ tasks: big.tasks, projects: big.projects, history: big.history, recurrings: big.recurrings, savedAt: new f.ctx.Date().toISOString() });
  await f.advance(500);
  await f.api.flushCloudSave();
  const fs0 = f.sent[0];
  ok("64KB 넘는 본문도 flush 에서 사라지지 않는다", f.sent.length === 1 && fs0.bytes > 65536, fs0 ? fs0.method + " " + fs0.bytes + "B keepalive=" + fs0.keepalive : "요청 0");

  if (fileArg) {
    const r = makeTab();
    await loadAndUpgrade(r);
    await r.advance(500);
    await r.closeTab();
    const rs = r.sent[0];
    ok("저장본: 카드 보강 flush 가 나간다", !!rs, "요청 " + r.sent.length);
    ok("저장본: PATCH · keepalive 범위 안", rs && rs.method === "PATCH" && rs.keepalive && rs.bytes <= 60000, rs ? rs.method + " " + rs.bytes + "B" : "");
  }

  console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
