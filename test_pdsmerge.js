/* PDS 시스템 합치기 검증(2026-10-11 소유자 「그냥 PDS 시스템이라고 프로젝트 명을 하고, 이 루프가 잘 돌게끔 하는 것을 목적으로한 프로젝트라고 정의」 ·
   「weekly review로 통일해줘」) — 로드 때 도는 카드 보정 effect 와 루틴 자동 도출 줄을 index.html 에서 그대로 추출해 실행한다.
   확인 대상:
     (a) 카드 이름 「PDS 시스템 개선」 → 「PDS 시스템」 · 소유자가 붙인 다른 이름은 그대로.
     (b) 주간 정제 카드(p_sweep)의 반복·할 일이 PDS 시스템 카드로 가고, 옛 이름이면 「🗓️ Weekly Review」가 된다. 반복 id 는 그대로 · 히스토리는 그대로.
     (c) 첫 로드에서는 p_sweep 카드가 남고(같은 렌더의 값), 옮긴 것이 저장된 다음 로드에 걷힌다. 두 번째 합치기는 아무것도 안 바꾼다.
     (d) 프로젝트 카드에 반복이 있어도 루틴으로 치지 않는다(루틴 카드는 그대로 루틴).
   픽스처 이름은 중립 표기만 쓴다(공개 저장소). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8").replace(/\r\n/g, "\n");
const slice = (start, endTok) => { const a = SRC.indexOf(start); if (a < 0) throw new Error(start + " 를 못 찾음 — 패치 누락"); return SRC.slice(a, SRC.indexOf(endTok, a) + endTok.length); };
const consts = new Function(
  slice("const PERSONAL_PROJECTS = [", "\n];") + "\n" +
  slice("const RETIRED_PROJ_IDS", "]);") + "\n" +
  "return { PERSONAL_PROJECTS, RETIRED_PROJ_IDS };")();
const { PERSONAL_PROJECTS, RETIRED_PROJ_IDS } = consts;
const body = (ref) => {
  const a = SRC.indexOf(ref + ".current = true;");
  if (a < 0) throw new Error(ref + " 를 못 찾음 — 패치 누락");
  return SRC.slice(a + (ref + ".current = true;").length, SRC.indexOf("\n  }, [cloudLoaded]);", a));
};
const PERSONAL_FX = ["sweepMergeDone", "personalProjDone", "bucketTrimDone", "dupMergeDone", "personalKindDone"];
if (SRC.indexOf("sweepMergeDone.current = true;") > SRC.indexOf("personalProjDone.current = true;")) throw new Error("합치기가 S4a 보다 뒤에 있음 — 소스 순서");
const BODIES = Object.fromEntries(PERSONAL_FX.map(r => [r, body(r)]));
const load = (saved) => {
  const st = { projects: saved.projects, tasks: saved.tasks || [], recurrings: saved.recurrings || [], history: saved.history || [] };
  const setter = (k) => (v) => { st[k] = typeof v === "function" ? v(st[k]) : v; };
  for (const ref of PERSONAL_FX) {
    /* 같은 렌더: effect 들은 로드 때 값(saved)을 closure 로 보고, setX(fn) 은 앞 effect 가 바꾼 최신 상태에 이어서 적용된다(React 와 같다) */
    const ctx = { PERSONAL_PROJECTS, RETIRED_PROJ_IDS, projects: saved.projects, tasks: saved.tasks || [], recurrings: saved.recurrings || [], history: saved.history || [],
      setProjects: setter("projects"), setTasks: setter("tasks"), setRecurrings: setter("recurrings"), setHistory: setter("history") };
    new Function("ctx", "with (ctx) {\n" + BODIES[ref] + "\n}")(ctx);
  }
  return st;
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  PASS  " + name); } else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); } };
const ids = (xs) => xs.map(x => x.id);

ok("정본 목록: 카드 이름 = 「PDS 시스템」 · 주간 정제 카드는 정본에 없다", PERSONAL_PROJECTS.find(p => p.id === "p_b464zvu").name === "PDS 시스템" && !PERSONAL_PROJECTS.some(p => p.id === "p_sweep"));
ok("p_sweep 은 종료 카드 목록에 있다", RETIRED_PROJ_IDS.has("p_sweep"));

const P = (id, name, kind) => ({ id, name, order: 0, kind });
const saved = () => ({
  projects: [P("rt_a", "루틴 A", "routine"), P("p_inv", "프로젝트 B", "project"), P("p_b464zvu", "PDS 시스템 개선", "project"), P("p_sweep", "🗓️ 주간 정제", "system")],
  recurrings: [{ id: "wksweep", text: "🗓️ 주간 정제 (/sweep)", project: "p_sweep", type: "weekly", dows: [6], protocol: "x" },
               { id: "r1", text: "루틴 세션", project: "rt_a", type: "count", freqPerWeek: 3 }],
  tasks: [{ id: "t1", text: "🗓️ 주간 정제 (/sweep)", project: "p_sweep", status: "action", recurringId: "wksweep" },
          { id: "t2", text: "다른 할 일", project: "p_inv", status: "action" }],
  history: [{ date: "2026-09-07", items: [{ type: "done", orig: { project: "p_sweep", recurringId: "wksweep", text: "🗓️ 주간 정제 (/sweep)" } }] }],
});

/* (a)(b)(c) 첫 로드 */
const s0 = saved();
const l1 = load(s0);
ok("(a) 카드 이름이 「PDS 시스템」으로", l1.projects.find(p => p.id === "p_b464zvu").name === "PDS 시스템");
const w = l1.recurrings.find(r => r.id === "wksweep");
ok("(b) 반복이 PDS 시스템 카드로 · 이름 「🗓️ Weekly Review」 · id·요일·실행방법 그대로", w.project === "p_b464zvu" && w.text === "🗓️ Weekly Review" && w.dows[0] === 6 && w.protocol === "x");
ok("(b) 그 반복의 할 일도 옮기고 이름을 바꾼다", (() => { const t = l1.tasks.find(x => x.id === "t1"); return t.project === "p_b464zvu" && t.text === "🗓️ Weekly Review" && t.recurringId === "wksweep"; })());
ok("(b) 다른 반복·할 일은 같은 객체", l1.recurrings.find(r => r.id === "r1") === s0.recurrings[1] && l1.tasks.find(t => t.id === "t2") === s0.tasks[1]);
ok("(b) 히스토리는 지난 기록이라 그대로", l1.history === s0.history);
ok("(c) 첫 로드에서는 p_sweep 카드가 남는다(같은 렌더의 값에는 아직 반복이 붙어 있다)", ids(l1.projects).includes("p_sweep"), ids(l1.projects).join(","));

/* (c) 다음 로드 — 저장된 상태로 다시 */
const l2 = load({ projects: l1.projects, recurrings: l1.recurrings, tasks: l1.tasks, history: l1.history });
ok("(c) 다음 로드에 p_sweep 카드가 걷힌다", !ids(l2.projects).includes("p_sweep"), ids(l2.projects).join(","));
ok("(c) 두 번째 합치기는 반복·할 일을 바꾸지 않는다(같은 배열)", l2.recurrings === l1.recurrings && l2.tasks === l1.tasks);
const l3 = load({ projects: l2.projects, recurrings: l2.recurrings, tasks: l2.tasks, history: l2.history });
ok("(c) 그다음 로드도 아무것도 안 바꾼다", l3.projects === l2.projects && l3.recurrings === l2.recurrings && l3.tasks === l2.tasks);

/* (a) 소유자가 붙인 다른 이름 · (b) 소유자가 바꾼 반복 이름 */
const s4 = saved(); s4.projects = s4.projects.map(p => p.id === "p_b464zvu" ? { ...p, name: "내가 붙인 이름" } : p);
s4.recurrings = s4.recurrings.map(r => r.id === "wksweep" ? { ...r, text: "토요일 점검" } : r);
const l4 = load(s4);
ok("(a) 소유자가 붙인 다른 카드 이름은 그대로", l4.projects.find(p => p.id === "p_b464zvu").name === "내가 붙인 이름");
ok("(b) 옛 이름이 아닌 반복 이름은 그대로 두고 카드만 옮긴다", (() => { const r = l4.recurrings.find(x => x.id === "wksweep"); return r.text === "토요일 점검" && r.project === "p_b464zvu"; })());

/* (d) 루틴 자동 도출 — App 본문 두 줄을 그대로 */
const a = SRC.indexOf("  const SYS_PROJ_IDS =");
if (a < 0) throw new Error("SYS_PROJ_IDS 를 못 찾음");
const twoLines = SRC.slice(a, SRC.indexOf("\n", SRC.indexOf("ROUTINE_REC_PROJ_IDS =", a)) + 1);
const derive = (projects, recurrings, isWork) => new Function("projects", "recurrings", "isWork",
  "let ROUTINE_REC_PROJ_IDS; const isSystemProj = (p) => !!p && p.kind === \"system\";\n" + twoLines + "return ROUTINE_REC_PROJ_IDS;")(projects, recurrings, isWork);
const rr = derive(l2.projects, l2.recurrings, false);
ok("(d) PDS 시스템(프로젝트) 카드의 Weekly Review 반복은 루틴으로 치지 않는다", !rr.has("p_b464zvu"), [...rr].join(","));
ok("(d) 루틴 카드의 반복은 그대로 루틴", rr.has("rt_a"));
ok("(d) kind 가 없는 카드에 반복을 걸면 지금처럼 자동 루틴", derive([P("p_new", "새 카드")], [{ id: "q", project: "p_new" }], false).has("p_new"));
ok("(d) 업무 앱은 지금처럼 반복으로 루틴을 만들지 않는다", derive(l2.projects, l2.recurrings, true).size === 0);

console.log("\n" + pass + " pass · " + fail + " fail");
process.exit(fail ? 1 : 0);
