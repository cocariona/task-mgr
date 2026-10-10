/* 과제·영역 순서표(PROJ_ORDER)와 업무 종료 카드 걷기 검증 — 정렬 규칙과 로드 때 도는 카드 보정 effect 를 index.html 에서 그대로 추출해 실행한다.
   (2026-10-08 소유자 — 업무 순서를 정했고, 「새 과제 추가」 칸을 없애고, 앱에서 만든 업무 카드 하나를 지웠다.
    영역·과제의 생성·삭제·이름·순서는 소유자가 요청하면 코드로 바꾼다.)
   확인 대상:
     (a) 업무 드롭다운·카드 순서가 소유자가 정한 순서와 같다(묶음: 업무 루틴 맨 위 · 과제 일반/기타 업무 맨 끝).
     (b) 순서표에 없는 새 카드는 과제 묶음 끝(과제 일반 업무 바로 위)에 선다.
     (c) 업무 종료 카드는 할 일·반복이 없을 때만 걷히고, 다른 카드는 그대로다.
     (d) 개인 순서는 옛 규칙과 같고, 배열을 섞어도(S4a 재배열) 화면 순서는 같다.
     (e) ★집중 카드는 카드 목록에서만 맨 위, 드롭다운에서는 제자리다.
   픽스처 이름은 중립 표기만 쓴다(공개 저장소).
   선택: 저장본 JSON 을 인자로 주면 실데이터 순서를 출력한다(읽기만).
     node test_projorder.js personal.json taskmgr.json   (어느 한쪽만 줄 때는 빈 문자열 "" 로 자리를 비운다) */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8").replace(/\r\n/g, "\n");

const slice = (start, endTok) => { const a = SRC.indexOf(start); if (a < 0) throw new Error(start + " 를 못 찾음 — 패치 누락"); return SRC.slice(a, SRC.indexOf(endTok, a) + endTok.length); };
const line = (start) => slice(start, "\n");
const lib = new Function(
  "let WS = { key: 'work' };\n" +
  slice("const PERSONAL_PROJECTS = [", "\n];") + "\n" +
  line("const PERSONAL_BUCKET_IDS") +
  slice("const RETIRED_PROJ_IDS", "]);") + "\n" +
  slice("const RETIRED_WORK_PROJ_IDS", "]);") + "\n" +
  line("const ROUTINE_PROJ_IDS") +
  line("let ROUTINE_REC_PROJ_IDS") +
  line("const isBucketProj") +
  line("const isRoutineProj") +
  slice("const INIT_PROJECTS = [", "\n];") + "\n" +
  line("const isSystemProj") +
  line("const projSortKey") +
  slice("const PROJ_ORDER = {", "\n};") + "\n" +
  line("const projRank") +
  line("const projCmp") +
  line("const sortProjsForSelect") +
  line("const areaCmp") +
  line("const areaCards") +
  "const mainOf = (projects) => { " + slice("const mainProjs =", ";") + " return mainProjs; };\n" +
  "const overviewOf = (projects, tasks) => { " + line("  const areaRank =") + line("  const byArea =") + " return tasks.slice().sort(byArea); };\n" +
  "return { setWS: (k) => { WS = { key: k }; }, PERSONAL_PROJECTS, RETIRED_PROJ_IDS, RETIRED_WORK_PROJ_IDS, INIT_PROJECTS, PROJ_ORDER, projSortKey, sortProjsForSelect, mainOf, areaCards, overviewOf };")();
const { setWS, PERSONAL_PROJECTS, RETIRED_PROJ_IDS, RETIRED_WORK_PROJ_IDS, INIT_PROJECTS, PROJ_ORDER, projSortKey, sortProjsForSelect, mainOf, areaCards, overviewOf } = lib;

/* 로드 때 한 번 도는 카드 보정 effect 본문(`xxxDone.current = true;` 다음부터 `}, [cloudLoaded]);` 앞까지) — 소스 순서대로 */
const body = (ref) => {
  const a = SRC.indexOf(ref + ".current = true;");
  if (a < 0) throw new Error(ref + " 를 못 찾음 — 패치 누락");
  return SRC.slice(a + (ref + ".current = true;").length, SRC.indexOf("\n  }, [cloudLoaded]);", a));
};
const WORK_FX = ["workKindDone", "judgeProjDone", "workcapProjDone", "workRetireDone", "workBucketDone"];
const lst = SRC.slice(SRC.indexOf("const recList"), SRC.indexOf("\n", SRC.indexOf("const projList")) + 1);
const { projList } = new Function(lst + "\nreturn { projList };")();
const PERSONAL_FX = ["sweepMergeDone", "personalProjDone", "bucketTrimDone", "dupMergeDone", "personalKindDone"];
const BODIES = Object.fromEntries([...WORK_FX, ...PERSONAL_FX].map(r => [r, body(r)]));
if (!/RETIRED_WORK_PROJ_IDS/.test(BODIES.workRetireDone)) throw new Error("업무 종료 카드 걷기 코드가 없음 — 패치 누락");
const load = (fxList, saved) => {
  const st = { projects: saved.projects, tasks: saved.tasks || [], recurrings: saved.recurrings || [], history: saved.history || [] };
  const setter = (k) => (v) => { st[k] = typeof v === "function" ? v(st[k]) : v; };
  for (const ref of fxList) {
    const ctx = { ...lib, projects: saved.projects, tasks: saved.tasks || [], recurrings: saved.recurrings || [], history: saved.history || [],
      setProjects: setter("projects"), setTasks: setter("tasks"), setRecurrings: setter("recurrings"), setHistory: setter("history") };
    new Function("ctx", "with (ctx) {\n" + BODIES[ref] + "\n}")(ctx);
  }
  return st;
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  PASS  " + name); } else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); } };
const ids = (ps) => ps.map(p => p.id);
const eq = (a, b) => a.join(",") === b.join(",");

/* ── 순서표 ── */
const OWNER_WORK = ["p_judge", "p_workcap", "accel", "hakchuin", "rag", "dokpamo", "p_fuxhhqz", "optcode", "gpu", "itrc", "compiler", "proj_general", "proj_etc"];
ok("업무 순서표 = 소유자가 정한 순서(2026-10-08)", eq(PROJ_ORDER.work, OWNER_WORK), PROJ_ORDER.work.join(","));
ok("업무 순서표에 중복이 없다", new Set(PROJ_ORDER.work).size === PROJ_ORDER.work.length);
ok("업무 시드(INIT_PROJECTS)의 모든 카드가 순서표에 있다", INIT_PROJECTS.every(p => PROJ_ORDER.work.includes(p.id)),
  INIT_PROJECTS.filter(p => !PROJ_ORDER.work.includes(p.id)).map(p => p.id).join(","));
ok("개인 순서표 = 개인 정본 순서", eq(PROJ_ORDER.personal, ids(PERSONAL_PROJECTS)));
ok("업무 종료 목록에 앱에서 만든 카드 하나만 있고, 업무에서 살아 있는 카드는 없다",
  RETIRED_WORK_PROJ_IDS.size === 1 && RETIRED_WORK_PROJ_IDS.has("p_2v5wwfb") && !OWNER_WORK.some(i => RETIRED_WORK_PROJ_IDS.has(i)));

/* ── (a)(c) 업무: 2026-10-07 저장본과 같은 배열 모양(이름은 중립 표기) ── */
setWS("work");
const W = (id, kind, extra) => ({ id, name: "카드 " + id, order: 0, ...(kind ? { kind } : {}), ...(extra || {}) });
const workSaved = () => ({
  projects: [W("p_judge", "routine"), W("rag", "project"), W("accel", "project"), W("dokpamo", "project"), W("hakchuin", "project"),
    W("optcode", "project"), W("compiler", "project"), W("gpu", "project"), W("itrc", "project"), W("proj_general"), W("proj_etc"),
    W("p_2v5wwfb", "project"), W("p_fuxhhqz", "project"), W("p_workcap", "project")],
  tasks: [{ id: "t1", project: "accel", status: "action" }, { id: "t2", project: "p_fuxhhqz", status: "action" }],
  recurrings: [{ id: "r1", project: "proj_etc", type: "count" }],
});
const old = (ps) => [...ps].sort((a, b) => projSortKey(a) - projSortKey(b)); /* 옛 규칙(묶음 + 배열 순서) */
const w0 = workSaved();
ok("(배경) 옛 규칙에서는 PM 엔진이 과제들 사이(앱에서 만든 과제 카드 뒤)에 섰다", ids(old(w0.projects)).indexOf("p_workcap") === ids(old(w0.projects)).indexOf("proj_general") - 1);
const w1 = load(WORK_FX, workSaved());
ok("업무 로드 뒤 종료 카드가 걷혔다", !w1.projects.some(p => p.id === "p_2v5wwfb"));
ok("다른 업무 카드 13장은 그대로(같은 객체·배열 순서)", eq(ids(w1.projects), ids(w0.projects).filter(i => i !== "p_2v5wwfb")));
ok("업무 드롭다운 = 소유자 순서", eq(ids(sortProjsForSelect(w1.projects)), OWNER_WORK), ids(sortProjsForSelect(w1.projects)).join(","));
ok("업무 카드 목록 = 소유자 순서", eq(ids(mainOf(w1.projects)), OWNER_WORK));
const w2 = load(WORK_FX, { ...workSaved(), projects: w1.projects });
ok("두 번째 로드는 아무것도 안 바꾼다", w2.projects === w1.projects);
const kept1 = load(WORK_FX, { ...workSaved(), tasks: [...workSaved().tasks, { id: "t9", project: "p_2v5wwfb", status: "action" }] });
ok("할 일이 붙어 있으면 종료 카드를 걷지 않는다", kept1.projects.some(p => p.id === "p_2v5wwfb"));
const kept2 = load(WORK_FX, { ...workSaved(), recurrings: [{ id: "r9", project: "p_2v5wwfb", disabled: true }] });
ok("꺼진 반복이라도 가리키고 있으면 걷지 않는다", kept2.projects.some(p => p.id === "p_2v5wwfb"));
ok("남은 종료 카드는 과제 묶음 끝(과제 일반 업무 바로 위)에 선다",
  ids(sortProjsForSelect(kept1.projects)).indexOf("p_2v5wwfb") === ids(sortProjsForSelect(kept1.projects)).indexOf("proj_general") - 1);

/* ── (b) 표에 없는 새 카드 ── */
const withNew = [...w1.projects, W("p_new1", "project"), W("p_new2", "project")];
const sNew = ids(sortProjsForSelect(withNew));
ok("표에 없는 새 카드는 표의 과제들 뒤 · 과제 일반 업무 앞에, 만든 순서대로", eq(sNew.slice(-4), ["p_new1", "p_new2", "proj_general", "proj_etc"]), sNew.join(","));
ok("업무 루틴은 늘 맨 위 · 기타 업무는 늘 맨 끝", sNew[0] === "p_judge" && sNew[sNew.length - 1] === "proj_etc");
ok("배열 순서를 섞어도 같은 순서", eq(ids(sortProjsForSelect([...w1.projects].reverse())), OWNER_WORK));

/* ── (e) 집중 ── */
const focused = w1.projects.map(p => p.id === "gpu" ? { ...p, focus: true } : p);
ok("★집중 카드는 카드 목록 맨 위, 나머지는 순서표대로", eq(ids(mainOf(focused)), ["gpu", ...OWNER_WORK.filter(i => i !== "gpu")]));
ok("드롭다운은 집중과 상관없이 제자리", eq(ids(sortProjsForSelect(focused)), OWNER_WORK));

/* ── (f) 오늘 탭 「전체 현황」 = 영역/과제 탭과 같은 카드 순서(2026-10-11 소유자) ── */
{ const T = (id, project) => ({ id, project, status: "action" });
  const tasksMixed = [T("x1", "rag"), T("x2", "proj_general"), T("x3", "accel"), T("x4", "proj_etc"), T("x5", "p_judge"),
    T("x6", "dokpamo"), T("x7", "gpu"), T("x8", "p_judge"), T("x9", "p_gone"), T("x10", "rag"), T("x11", undefined)];
  const ov = ids(overviewOf(w1.projects, tasksMixed));
  ok("전체 현황: 카드 순서표대로 모이고, 같은 카드 안은 원래 순서", eq(ov, ["x5", "x8", "x3", "x1", "x10", "x6", "x7", "x2", "x4", "x9", "x11"]), ov.join(","));
  ok("전체 현황: 카드 순서 = 영역 탭 카드 순서(areaCards 앞부분 = mainOf)", eq(ids(areaCards(w1.projects)).slice(0, mainOf(w1.projects).length), ids(mainOf(w1.projects))));
  const ovF = ids(overviewOf(focused, tasksMixed));
  ok("전체 현황: ★집중 카드의 할 일이 맨 위(영역 탭과 같음)", ovF[0] === "x7" && eq(ovF.slice(1, 3), ["x5", "x8"]), ovF.join(","));
  ok("전체 현황: 원래 할 일 배열은 건드리지 않는다", eq(ids(tasksMixed), ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "x10", "x11"])); }

/* ── (d) 개인: 2026-10-07 저장본과 같은 배열 모양 ── */
setWS("personal");
const pSaved = () => ({
  projects: [W("rt_workout", "routine"), W("rt_english", "routine"), W("rt_vocal", "routine"), W("p_invest", "project"), W("p_career", "project"),
    W("p_b464zvu", "project"), W("p_sweep", "system"), W("p_workcap", "project")],
  tasks: [{ id: "a", project: "p_workcap", status: "action" }],
});
const p1 = load(PERSONAL_FX, pSaved());
const pSel = ids(sortProjsForSelect(p1.projects));
ok("개인 드롭다운 = 옛 규칙과 같음", eq(pSel, ids(old(p1.projects))), pSel.join(","));
ok("개인에 남은 PM 엔진은 프로젝트 끝(PDS 뒤)·투자원칙 위로 가지 않는다", pSel.indexOf("p_workcap") === pSel.indexOf("p_b464zvu") + 1);
ok("옛 주간 정제 카드(p_sweep)는 할 일·반복이 없으면 걷혀 드롭다운·카드 목록 어디에도 없다(2026-10-11 PDS 시스템으로 합침)", !pSel.includes("p_sweep") && !mainOf(p1.projects).some(p => p.id === "p_sweep"), pSel.join(","));
const shuffled = [...p1.projects.slice(3), ...p1.projects.slice(0, 3)].reverse(); /* 카드 수와 상관없이 순열(2026-10-08 커리어 카드 추가 때 고정 색인이 한 장을 빠뜨렸다) */
ok("개인 배열을 섞어도(S4a 재배열) 화면 순서는 같다", eq(ids(sortProjsForSelect(shuffled)), pSel));
setWS("work");
ok("워크스페이스를 바꾸면 그쪽 순서표를 쓴다(WS 를 부를 때 읽는다)", eq(ids(sortProjsForSelect(w1.projects)), OWNER_WORK));

/* ── 히스토리 ↩: 카드가 걷힌 할 일은 살아 있는 카드로 ── */
const lp = SRC.slice(SRC.indexOf("const liveProj = (id) =>"), SRC.indexOf(";\n", SRC.indexOf("const liveProj = (id) =>")) + 1);
if (!lp) throw new Error("liveProj 를 못 찾음 — 패치 누락");
const liveProj = (projects, item) => new Function("projects", "item", lp + "\nreturn liveProj;")(projects, item);
ok("↩: 카드가 살아 있으면 그대로", liveProj(w1.projects, { projectName: "x" })("gpu") === "gpu");
ok("↩: 걷힌 카드면 이름이 같은 카드로", liveProj(w1.projects, { projectName: "카드 rag" })("p_2v5wwfb") === "rag");
ok("↩: 이름도 없으면 기타 업무로", liveProj(w1.projects, { projectName: "없는 이름" })("p_2v5wwfb") === "proj_etc");
ok("↩: 기타 업무도 없으면(개인) 첫 카드로 자동 배정하지 않고 원래 id 를 둔다(직접 고르게)", liveProj(p1.projects, { projectName: "없는 이름" })("rt_writing") === "rt_writing");

/* ── 로드 정규화: 오래 열린 탭이 옛 인덱스로 써서 생긴 빈칸·id 없는 항목 ── */
ok("빈칸과 id 없는 항목을 걸러 낸다", eq(ids(projList([W("a"), null, { focus: false }, W("b")])), ["a", "b"]));
ok("희소 배열이 객체로 오면 값 목록으로 편다", eq(ids(projList({ 0: W("a"), 2: W("b") })), ["a", "b"]));
ok("값이 없으면 null(시드로 대체)", projList(undefined) === null);
{ const S4A = body("personalProjDone"); ok("개인 종료 카드도 반복이 가리키면 걷지 않는다(S4a)", /RETIRED_PROJ_IDS\.has\(p\.id\)[^;]*recurrings/.test(S4A));
  const keptP = load(PERSONAL_FX, { ...pSaved(), tasks: [], recurrings: [{ id: "r", project: "p_workcap", disabled: true }] });
  const goneP = load(PERSONAL_FX, { ...pSaved(), tasks: [] });
  ok("개인: 꺼진 반복이 가리키는 종료 카드는 남고, 아무것도 없으면 걷힌다", keptP.projects.some(p => p.id === "p_workcap") && !goneP.projects.some(p => p.id === "p_workcap")); }

/* ── 선택: 실데이터(읽기만) ── */
const [pArg, wArg] = process.argv.slice(2);
const arr = (x) => Array.isArray(x) ? x : Object.values(x || {});
const show = (ws, file, fx) => {
  if (!file) return;
  setWS(ws);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const st = load(fx, { projects: arr(d.projects).filter(Boolean), tasks: arr(d.tasks).filter(Boolean), recurrings: arr(d.recurrings).filter(Boolean) });
  console.log("  [" + ws + "] 드롭다운: " + sortProjsForSelect(st.projects).map(p => p.name).join(" → "));
  console.log("  [" + ws + "] 카드:     " + mainOf(st.projects).map(p => p.name).join(" → "));
};
show("personal", pArg, PERSONAL_FX);
show("work", wArg, WORK_FX);

console.log("\n" + pass + " pass · " + fail + " fail");
process.exit(fail ? 1 : 0);
