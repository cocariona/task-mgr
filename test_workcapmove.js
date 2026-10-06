/* PM 엔진 카드(p_workcap) 개인 → 업무 이동 검증 — 로드 때 도는 카드 보정 effect 들을 index.html 에서 그대로 추출해 실행한다.
   (2026-10-07 소유자 「카드 이동 먼저」 · 10-03 동의)
   확인 대상:
     (a) 업무 저장본에 p_workcap 이 없으면 한 번 심고, 두 번째 로드에서 중복이 생기지 않는다(있으면·이름을 바꿨으면 손대지 않는다).
     (b) 개인 저장본에 p_workcap 할 일이 없으면 카드가 걷히고, 있으면 카드와 할 일이 그대로 남는다(다른 카드로 합쳐지지 않는다).
     (c) 다른 카드·할 일은 그대로다.
   선택: 저장본 JSON 을 인자로 주면 실데이터에도 돌린다(읽기만).
     node test_workcapmove.js personal.json taskmgr.json   (어느 한쪽만 줄 때는 빈 문자열 "" 로 자리를 비운다) */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

/* 1) 정본 목록·종료 목록·업무 시드를 소스에서 그대로 */
const slice = (start, endTok) => { const a = SRC.indexOf(start); if (a < 0) throw new Error(start + " 를 못 찾음"); return SRC.slice(a, SRC.indexOf(endTok, a) + endTok.length); };
const consts = new Function(
  slice("const PERSONAL_PROJECTS = [", "\n];") + "\n" +
  slice("const RETIRED_PROJ_IDS", ";") + "\n" +
  slice("const INIT_PROJECTS = [", "\n];") +
  "\nreturn { PERSONAL_PROJECTS, RETIRED_PROJ_IDS, INIT_PROJECTS };")();
const { PERSONAL_PROJECTS, RETIRED_PROJ_IDS, INIT_PROJECTS } = consts;

/* 2) 로드 때 한 번 도는 카드 보정 effect 본문(`xxxDone.current = true;` 다음부터 `}, [cloudLoaded]);` 앞까지) */
const body = (ref) => {
  const a = SRC.indexOf(ref + ".current = true;");
  if (a < 0) throw new Error(ref + " 를 못 찾음 — 패치 누락");
  const b = SRC.indexOf("\n  }, [cloudLoaded]);", a);
  return SRC.slice(a + (ref + ".current = true;").length, b);
};
/* 앱과 같은 순서(소스 순서)로 돈다. 개인 = 카드를 만지는 것 전부 · 업무 = 카드를 만지는 것 전부. */
const PERSONAL_FX = ["personalProjDone", "bucketTrimDone", "dupMergeDone", "personalKindDone"];
const WORK_FX = ["workKindDone", "judgeProjDone", "workcapProjDone", "workBucketDone"];
const BODIES = Object.fromEntries([...PERSONAL_FX, ...WORK_FX].map(r => [r, body(r)]));
if (!/p_workcap/.test(BODIES.workcapProjDone)) throw new Error("업무 심기 코드가 없음 — 패치 누락");
if (/const RENAME|RENAME\[/.test(BODIES.personalKindDone)) throw new Error("개인 쪽 p_workcap 이름 정정(RENAME)이 남아 있음");

/* 한 번의 로드: effect 들은 같은 렌더의 값(closure)을 보고, setX(fn) 은 앞 effect 가 바꾼 최신 상태에 이어서 적용된다(React 와 같다). */
const load = (fxList, saved) => {
  const st = { projects: saved.projects, tasks: saved.tasks, recurrings: saved.recurrings || [], history: saved.history || [] };
  const setter = (k) => (v) => { st[k] = typeof v === "function" ? v(st[k]) : v; };
  for (const ref of fxList) {
    const ctx = {
      PERSONAL_PROJECTS, RETIRED_PROJ_IDS, INIT_PROJECTS,
      projects: saved.projects, tasks: saved.tasks, recurrings: saved.recurrings || [], history: saved.history || [],
      setProjects: setter("projects"), setTasks: setter("tasks"), setRecurrings: setter("recurrings"), setHistory: setter("history"),
    };
    new Function("ctx", "with (ctx) {\n" + BODIES[ref] + "\n}")(ctx);
  }
  return st;
};
const loadPersonal = (s) => load(PERSONAL_FX, s);
const loadWork = (s) => load(WORK_FX, s);

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); }
};
const ids = (ps) => ps.map(p => p.id);
const sameRefs = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* ── 정본 목록 ── */
ok("개인 정본(PERSONAL_PROJECTS)에 p_workcap 이 없다", !PERSONAL_PROJECTS.some(p => p.id === "p_workcap"));
ok("RETIRED_PROJ_IDS 에 p_workcap · rt_writing 둘 다 있다", RETIRED_PROJ_IDS.has("p_workcap") && RETIRED_PROJ_IDS.has("rt_writing"));
const seed = INIT_PROJECTS.find(p => p.id === "p_workcap");
ok("업무 시드(INIT_PROJECTS)에 p_workcap = 「PM 엔진」 · order 10 · kind project",
  !!seed && seed.name === "PM 엔진" && seed.order === 10 && seed.kind === "project", JSON.stringify(seed));
ok("업무 시드에 p_workcap 은 하나뿐", INIT_PROJECTS.filter(p => p.id === "p_workcap").length === 1);

/* ── (a) 업무 ── */
const workSaved = {
  projects: [
    { id: "p_judge", name: "업무", order: -1, kind: "routine" },
    { id: "rag", name: "RAG", order: 0, kind: "project" },
    { id: "itrc", name: "ITRC", order: 7, kind: "project" },
    { id: "proj_general", name: "과제 일반 업무", order: 8 },
    { id: "proj_etc", name: "기타 업무", order: 9 },
    { id: "p_extra1", name: "다른 프로젝트 카드", order: 10, kind: "project" },
  ],
  tasks: [{ id: "w1", text: "킥오프", project: "rag", status: "action" }, { id: "w2", text: "위클리", project: "proj_etc", status: "action" }],
  recurrings: [{ id: "ynt1fbp", type: "count", text: "판단 발신", project: "p_judge" }],
};
const w1 = loadWork(workSaved);
ok("(a) 업무 저장본에 없으면 p_workcap 을 한 번 심는다", w1.projects.filter(p => p.id === "p_workcap").length === 1, ids(w1.projects).join(","));
ok("(a) 심은 카드 = 시드 그대로(「PM 엔진」 · kind project)", (() => { const p = w1.projects.find(x => x.id === "p_workcap"); return p && p.name === "PM 엔진" && p.kind === "project"; })());
ok("(a) 맨 뒤에 붙고 기존 카드는 같은 객체·같은 순서", sameRefs(w1.projects.slice(0, -1), workSaved.projects) && w1.projects[w1.projects.length - 1].id === "p_workcap", ids(w1.projects).join(","));
const w2 = loadWork({ ...workSaved, projects: w1.projects, tasks: w1.tasks, recurrings: w1.recurrings });
ok("(a) 두 번째 로드: 중복 없음 · 카드 배열 그대로(같은 배열)", w2.projects === w1.projects && w2.projects.filter(p => p.id === "p_workcap").length === 1);
const renamed = [...workSaved.projects, { id: "p_workcap", name: "내가 붙인 이름", order: 3, kind: "project" }];
const w3 = loadWork({ ...workSaved, projects: renamed });
ok("(a) 이미 있으면 아무것도 안 한다(소유자가 바꾼 이름·순서 보존)", w3.projects === renamed && w3.projects[w3.projects.length - 1].name === "내가 붙인 이름");
ok("(c) 업무 할 일·반복은 그대로", w1.tasks === workSaved.tasks && w1.recurrings === workSaved.recurrings);

/* ── (b) 개인 ── */
const personalSaved = {
  projects: [
    { id: "rt_workout", name: "운동", order: 0, kind: "routine" },
    { id: "rt_english", name: "영어", order: 1, kind: "routine" },
    { id: "rt_vocal", name: "보컬", order: 2, kind: "routine" },
    { id: "p_invest", name: "투자원칙 정립", order: 0, kind: "project" },
    { id: "p_workcap", name: "PM 엔진", order: 1, kind: "project" },
    { id: "p_b464zvu", name: "PDS 시스템 개선", order: 5, kind: "project" },
    { id: "p_sweep", name: "🗓️ 주간 정제", order: 4, kind: "system" },
  ],
  tasks: [
    { id: "yisqoos", text: "PM 엔진 문서의 옛 커리어 참조 정리", project: "p_workcap", status: "action" },
    { id: "68jsdjq", text: "PM 엔진 카드를 업무 앱으로 옮기기", project: "p_workcap", status: "action" },
    { id: "t3", text: "투자 메모", project: "p_invest", status: "action" },
  ],
};
const others = (ps) => ps.filter(p => p.id !== "p_workcap");

const p1 = loadPersonal(personalSaved);
ok("(b) 할 일이 남아 있으면 개인 카드는 남는다", ids(p1.projects).includes("p_workcap"), ids(p1.projects).join(","));
ok("(b) 남은 카드는 같은 객체(이름 「PM 엔진」 · kind project 그대로)", p1.projects.find(p => p.id === "p_workcap") === personalSaved.projects[4]);
ok("(b) 그 할 일은 다른 카드로 합쳐지지 않는다(할 일 배열 그대로)", p1.tasks === personalSaved.tasks && p1.tasks.filter(t => t.project === "p_workcap").length === 2);
ok("(c) 다른 카드는 같은 객체 · 같은 순서", sameRefs(others(p1.projects), others(personalSaved.projects)), ids(p1.projects).join(","));

const noWc = { ...personalSaved, tasks: personalSaved.tasks.filter(t => t.project !== "p_workcap") };
const p2 = loadPersonal(noWc);
ok("(b) p_workcap 할 일이 없으면 카드가 걷힌다", !ids(p2.projects).includes("p_workcap"), ids(p2.projects).join(","));
ok("(c) 걷힐 때 다른 카드는 같은 객체 · 같은 순서", sameRefs(p2.projects, others(personalSaved.projects)), ids(p2.projects).join(","));
ok("(c) 걷힐 때 할 일은 그대로", p2.tasks === noWc.tasks);
const p3 = loadPersonal({ ...noWc, projects: p2.projects, tasks: p2.tasks });
ok("(b) 걷힌 뒤 다음 로드에 다시 심기지 않는다(같은 배열)", p3.projects === p2.projects);

const doneOnly = { ...personalSaved, tasks: [...noWc.tasks, { id: "d1", text: "완료 흔적", project: "p_workcap", status: "done" }] };
ok("(b) tasks[] 에 p_workcap 할 일이 하나라도 있으면(상태 무관) 걷지 않는다", ids(loadPersonal(doneOnly).projects).includes("p_workcap"));

const spaced = { projects: [...personalSaved.projects, { id: "p_x1", name: "PM엔진", order: 9, kind: "project" }], tasks: [...personalSaved.tasks, { id: "t9", text: "x", project: "p_x1" }] };
const p4 = loadPersonal(spaced);
ok("(b) 이름이 비슷한 다른 카드와 서로 합쳐지지 않는다(정본 이름 병합 대상이 아님)",
  ids(p4.projects).includes("p_x1") && ids(p4.projects).includes("p_workcap") && p4.tasks === spaced.tasks, ids(p4.projects).join(","));

const oldName = { projects: personalSaved.projects.map(p => p.id === "p_workcap" ? { ...p, name: "업무역량 시스템" } : p), tasks: personalSaved.tasks };
const p5 = loadPersonal(oldName);
ok("(b) 개인 쪽은 p_workcap 이름을 더 이상 고치지 않는다(RENAME 걷음)", p5.projects.find(p => p.id === "p_workcap").name === "업무역량 시스템");

const withWriting = { projects: [...personalSaved.projects, { id: "rt_writing", name: "글쓰기", order: 3, kind: "routine" }], tasks: noWc.tasks };
const p6 = loadPersonal(withWriting);
ok("(c) 글쓰기 종료 카드 걷기는 그대로(p_workcap 과 함께 걷힌다)", !ids(p6.projects).includes("rt_writing") && !ids(p6.projects).includes("p_workcap")
  && sameRefs(p6.projects, others(personalSaved.projects)), ids(p6.projects).join(","));

/* ── 실데이터(읽기만) ── */
const read = (f) => { const d = JSON.parse(fs.readFileSync(f, "utf8")); const arr = (v) => Array.isArray(v) ? v.filter(Boolean) : (v && typeof v === "object" ? Object.values(v).filter(Boolean) : []);
  return { projects: arr(d.projects), tasks: arr(d.tasks), recurrings: arr(d.recurrings), history: arr(d.history) }; };
const [pFile, wFile] = [process.argv[2], process.argv[3]];
if (pFile) {
  const d = read(pFile);
  const wc = d.tasks.filter(t => t.project === "p_workcap").length;
  const o = loadPersonal(d);
  const gone = ids(d.projects).filter(i => !ids(o.projects).includes(i));
  console.log("  ·   개인 저장본: 카드 " + d.projects.length + " · 할 일 " + d.tasks.length + " · p_workcap 할 일 " + wc);
  if (wc) ok("개인 저장본: p_workcap 할 일이 남아 있어 사라지는 카드 0", gone.length === 0, "사라짐=" + gone.join(","));
  else ok("개인 저장본: 사라지는 카드는 p_workcap 하나뿐", gone.length === 1 && gone[0] === "p_workcap", "사라짐=" + gone.join(","));
  ok("개인 저장본: 할 일 그대로(같은 배열)", o.tasks === d.tasks);
  ok("개인 저장본: 남은 카드는 전부 같은 객체", o.projects.every(p => d.projects.includes(p)));
  const after = loadPersonal({ ...d, tasks: d.tasks.filter(t => t.project !== "p_workcap") });
  const gone2 = ids(d.projects).filter(i => !ids(after.projects).includes(i));
  ok("개인 저장본: 남은 p_workcap 할 일을 끝낸 뒤 로드면 사라지는 카드는 p_workcap 하나뿐", gone2.length === 1 && gone2[0] === "p_workcap", "사라짐=" + gone2.join(","));
}
if (wFile) {
  const d = read(wFile);
  const o = loadWork(d);
  const added = ids(o.projects).filter(i => !ids(d.projects).includes(i));
  const had = d.projects.some(p => p.id === "p_workcap");
  console.log("  ·   업무 저장본: 카드 " + d.projects.length + " · 할 일 " + d.tasks.length + " · p_workcap " + (had ? "있음" : "없음"));
  ok("업무 저장본: 더해지는 카드는 " + (had ? "없음" : "p_workcap 하나뿐"), had ? added.length === 0 : (added.length === 1 && added[0] === "p_workcap"), "더해짐=" + added.join(","));
  ok("업무 저장본: 기존 카드는 같은 객체 · 같은 순서", sameRefs(o.projects.slice(0, d.projects.length), d.projects));
  ok("업무 저장본: 할 일·반복 그대로", o.tasks === d.tasks && o.recurrings === d.recurrings);
  const o2 = loadWork({ ...d, projects: o.projects, tasks: o.tasks, recurrings: o.recurrings });
  ok("업무 저장본: 두 번째 로드는 무변경(중복 0)", o2.projects === o.projects && o2.projects.filter(p => p.id === "p_workcap").length === 1);
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
