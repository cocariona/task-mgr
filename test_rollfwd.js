/* 자동 이월 검증 — 로직을 index.html 에서 문자열로 추출해 실행한다(테스트가 소스를 흉내내지 않게). */
const fs = require("fs");
const SRC = fs.readFileSync(require("path").join(__dirname, "index.html"), "utf8");

/* 1) 이월 effect 본문 추출 */
const anchor = SRC.indexOf("const isStaleP = (t) => t.status !== \"done\"");
if (anchor < 0) throw new Error("이월 effect 를 못 찾음");
const endMark = "\n  }, [cloudLoaded, tasks]);";
const end = SRC.indexOf(endMark, anchor);
if (end < 0) throw new Error("의존성이 [cloudLoaded, tasks] 가 아님 — 패치 누락");
const BODY = SRC.slice(anchor, end);
if (/rollFwdDone/.test(BODY)) throw new Error("잠금이 아직 본문에 남아있음");

/* 2) 컨텍스트 주입 */
function makeEffect(ctx) {
  return new Function("ctx", "with (ctx) { return function () {\n" + BODY + "\n}; }")(ctx);
}

/* 3) React 렌더 루프 시뮬레이터 (ReactDOM.render = 배칭 없음) */
function simulate(opt) {
  const initial = opt.initial, arrivals = opt.arrivals, oldLock = !!opt.oldLock;
  const today = opt.today || "2026-09-07";
  /* raceRounds: setTasks 가 아직 반영되지 않은 채 effect 가 다시 도는 상황(2026-09-07 실측 사고).
     calSync 응답이 calEventId 를 돌려주기 전에 다음 회차가 돌면 같은 항목에 update 를 또 쏘는가를 잰다. */
  const raceRounds = opt.raceRounds || 0;
  let tasks = initial;
  let cloudLoaded = false;
  let lock = false;
  let deferSet = false;
  const calCalls = [];
  let setCalls = 0;
  const ctx = {
    TODAY: today,
    projects: [],
    rollFwdCalSent: { current: new Set() },
    get tasks() { return tasks; },
    setTasks: function (fn) { setCalls++; if (deferSet) return; tasks = typeof fn === "function" ? fn(tasks) : fn; },
    calMakeParams: function (t) { return { title: t.title || t.text || "x", date: t.planDate }; },
    subCalObj: function (s, p) { return Object.assign({}, s, { _p: p.id }); },
    calSync: function (op, p) { calCalls.push({ op: op, id: p.eventId, date: p.date }); return { then: function () {} }; }
  };
  const effect = makeEffect(ctx);
  let prev = null, runs = 0;
  const flush = function () {
    for (let i = 0; ; i++) {
      if (i > 500) throw new Error("수렴 실패 — 무한 루프");
      const deps = oldLock ? [cloudLoaded] : [cloudLoaded, tasks];
      if (prev && prev.length === deps.length && prev.every(function (v, k) { return v === deps[k]; })) break;
      prev = deps;
      runs++;
      if (oldLock) { if (!cloudLoaded || lock) continue; lock = true; }
      else if (!cloudLoaded) continue;
      effect();
    }
  };
  /* 클라우드 응답: setCloudLoaded 와 뒤이은 setTasks 들이 개별 렌더를 유발한다 */
  cloudLoaded = true;
  if (raceRounds) { /* 반영 전 재실행을 raceRounds 번 겪게 한 뒤 정상 진행 */
    deferSet = true;
    for (let i = 0; i < raceRounds; i++) effect();
    deferSet = false;
  }
  flush();
  for (const batch of arrivals) { tasks = tasks.concat(batch); flush(); }
  return { tasks: tasks, calCalls: calCalls, runs: runs, setCalls: setCalls };
}

/* 4) 판정 헬퍼 */
const TODAY = "2026-09-07";
const isStaleP = function (t) { return t.status !== "done" && !t.recurringId && t.planDate && t.planDate < TODAY; };
const isStaleS = function (s) { return s.status !== "done" && s.planDate && s.planDate < TODAY; };
const leftover = function (ts) {
  let n = 0;
  ts.forEach(function (t) {
    if (isStaleP(t)) n++;
    if (!t.recurringId) (t.subtasks || []).forEach(function (s) { if (isStaleS(s)) n++; });
  });
  return n;
};

let pass = 0, fail = 0;
const ok = function (name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
};
const T = function (id, o) { return Object.assign({ id: id, title: "t" + id, status: "action", planDate: "2026-09-04" }, o || {}); };

console.log("\n[1] 실측 재현 — 업무 15건이 4덩이로 나뉘어 도착");
{
  const first = [T(1), T(2), T(3)];
  const rest = [[T(4), T(5), T(6), T(7), T(8), T(9)], [T(10), T(11), T(12)], [T(13), T(14), T(15)]];
  const nw = simulate({ initial: first, arrivals: rest });
  ok("새 코드: 잔존 0", leftover(nw.tasks) === 0, "잔존 " + leftover(nw.tasks));
  ok("새 코드: 15건 전부 오늘", nw.tasks.filter(function (t) { return t.planDate === TODAY; }).length === 15);
  const old = simulate({ initial: first, arrivals: rest, oldLock: true });
  ok("옛 코드는 실제로 흘린다(회귀 증명)", leftover(old.tasks) === 12, "잔존 " + leftover(old.tasks));
}

console.log("\n[2] 이월 대상이 아닌 것은 안 건드린다");
{
  const src = [
    T(1, { recurringId: "rt_vocal" }),
    T(2, { planDate: "2026-09-20" }),
    T(3, { status: "done" }),
    T(4, { planDate: null }),
    T(5)
  ];
  const r = simulate({ initial: [src[0]], arrivals: [[src[1]], [src[2]], [src[3]], [src[4]]] });
  const g = function (id) { return r.tasks.find(function (t) { return t.id === id; }); };
  ok("루틴 유지", g(1).planDate === "2026-09-04");
  ok("미래 예약 유지", g(2).planDate === "2026-09-20");
  ok("완료 유지", g(3).planDate === "2026-09-04");
  ok("날짜 없음 유지", g(4).planDate === null);
  ok("대상만 이월", g(5).planDate === TODAY);
}

console.log("\n[3] 서브태스크도 늦게 도착하면 이월된다");
{
  const p1 = T(1, { planDate: null, subtasks: [{ id: "s1", status: "action", planDate: "2026-09-01" }] });
  const p2 = T(2, { planDate: null, subtasks: [{ id: "s2", status: "action", planDate: "2026-09-02" }, { id: "s3", status: "done", planDate: "2026-09-02" }] });
  const rt = T(3, { recurringId: "rt_x", planDate: null, subtasks: [{ id: "s4", status: "action", planDate: "2026-09-02" }] });
  const r = simulate({ initial: [p1], arrivals: [[p2], [rt]] });
  ok("잔존 0", leftover(r.tasks) === 0);
  ok("s1·s2 이월", r.tasks[0].subtasks[0].planDate === TODAY && r.tasks[1].subtasks[0].planDate === TODAY);
  ok("완료 서브 유지", r.tasks[1].subtasks[1].planDate === "2026-09-02");
  ok("루틴 하위 서브 유지", r.tasks[2].subtasks[0].planDate === "2026-09-02");
}

console.log("\n[4] 캘린더 update 는 항목당 1회 (중복 호출 없음)");
{
  const mk = function (i) { return T(i, { calEventId: "ev" + i }); };
  const r = simulate({ initial: [mk(1)], arrivals: [[mk(2)], [mk(3)], []] });
  const ids = r.calCalls.map(function (c) { return c.id; });
  ok("호출 3회", r.calCalls.length === 3, "실제 " + r.calCalls.length + " — " + JSON.stringify(ids));
  ok("중복 없음", new Set(ids).size === ids.length);
  ok("전부 update", r.calCalls.every(function (c) { return c.op === "update"; }));
}

console.log("\n[4-b] ★반영이 늦어도 캘린더는 항목당 1회 (2026-09-07 중복 사고 재현)");
{
  const mk = function (i) { return T(i, { calEventId: "ev" + i }); };
  const items = [mk(1), mk(2), mk(3), mk(4), mk(5)];
  const r = simulate({ initial: items, arrivals: [[mk(6)], [mk(7)]], raceRounds: 4 });
  const ids = r.calCalls.map(function (c) { return c.id; });
  const dup = ids.filter(function (v, i) { return ids.indexOf(v) !== i; });
  ok("중복 발사 0건", dup.length === 0, "중복 " + JSON.stringify(dup));
  ok("항목 7건 = 호출 7회", r.calCalls.length === 7, "실제 " + r.calCalls.length + "회");
  ok("잔존 0", leftover(r.tasks) === 0);
}

console.log("\n[5] 수렴 — 이월할 게 없으면 즉시 멈춘다");
{
  const clean = [T(1, { planDate: TODAY }), T(2, { planDate: null }), T(3, { recurringId: "r", planDate: "2026-01-01" })];
  const r = simulate({ initial: clean, arrivals: [[T(9, { planDate: TODAY })], [T(10, { planDate: null })]] });
  ok("이월할 게 없으면 setTasks 를 아예 안 부른다", r.setCalls === 0, "호출 " + r.setCalls + "회");
  const dirty = simulate({ initial: [T(1)], arrivals: [[T(2)], [T(3, { planDate: TODAY })]] });
  ok("이월 후 안정", leftover(dirty.tasks) === 0);
  ok("이월된 뒤엔 더 안 부른다(도착 2회 = setTasks 2회)", dirty.setCalls === 2, "호출 " + dirty.setCalls + "회");
}

console.log("\n[6] 무작위 속성 검증 — 500회");
{
  let bad = 0, worstRuns = 0, oldLost = 0;
  const rnd = function (n) { return Math.floor(Math.random() * n); };
  const dates = ["2026-08-20", "2026-09-01", "2026-09-04", "2026-09-06", TODAY, "2026-09-30", null];
  for (let iter = 0; iter < 500; iter++) {
    const n = 1 + rnd(30);
    const all = [];
    for (let i = 0; i < n; i++) {
      const kind = rnd(6);
      const t = T(i, { planDate: dates[rnd(dates.length)] });
      if (kind === 0) t.recurringId = "rt_" + rnd(3);
      if (kind === 1) t.status = "done";
      if (kind === 2) t.subtasks = Array.from({ length: 1 + rnd(3) }, function (_, k) {
        return { id: i + "-" + k, status: rnd(4) ? "action" : "done", planDate: dates[rnd(dates.length)] };
      });
      if (kind === 3) t.calEventId = "ev" + i;
      all.push(t);
    }
    const shuffled = all.slice().sort(function () { return Math.random() - 0.5; });
    const cut = 1 + rnd(shuffled.length);
    const initial = shuffled.slice(0, cut);
    const restArr = shuffled.slice(cut);
    const arrivals = [];
    let p = 0;
    while (p < restArr.length) { const k = 1 + rnd(4); arrivals.push(restArr.slice(p, p + k)); p += k; }
    const r = simulate({ initial: initial, arrivals: arrivals });
    worstRuns = Math.max(worstRuns, r.runs);
    if (leftover(r.tasks) !== 0) { bad++; if (bad === 1) console.log("    반례:", JSON.stringify(initial), JSON.stringify(arrivals)); }
    if (r.tasks.length !== all.length) bad++;
    if (arrivals.length) { const o = simulate({ initial: initial, arrivals: arrivals, oldLock: true }); if (leftover(o.tasks) > 0) oldLost++; }
  }
  ok("잔존 0 (500/500)", bad === 0, bad + "회 실패");
  ok("수렴 (최대 effect 실행 " + worstRuns + "회)", worstRuns < 400);
  console.log("    참고: 같은 입력에서 옛 코드는 " + oldLost + "회 흘렸습니다.");
}

console.log("\n[7] 자정 감지가 복귀에도 걸려 있는가 (소스 검사)");
{
  ok("checkDayRollover 정의", /const checkDayRollover = async \(\) =>/.test(SRC));
  ok("60초 타이머 유지", /setInterval\(checkDayRollover, 60000\)/.test(SRC));
  ok("visibilitychange 연결", /visibilitychange[\s\S]{0,90}checkDayRollover\(\)/.test(SRC));
  ok("focus 연결", /window\.addEventListener\("focus", checkDayRollover\)/.test(SRC));
  ok("리로드 전 flush 유지", /await flushCloudSave\(\)/.test(SRC));
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
