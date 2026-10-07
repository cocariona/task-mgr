/* 종료 영역 카드 걷어 내기 검증 — S4a 개인 프로젝트 보강(setProjects 갱신 함수)을 index.html 에서 추출해 실행한다.
   확인 대상: 글쓰기(rt_writing) 카드가 로드 때 사라지고 다시 심기지 않는가(2026-10-06 소유자 「앱에서 글쓰기 카드 삭제」).
   선택: 저장본 JSON 경로를 인자로 주면 실데이터에도 돌린다(node test_retiredproj.js personal.json). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

/* 1) 정본 목록·종료 목록을 소스에서 그대로 */
const pa = SRC.indexOf("const PERSONAL_PROJECTS = [");
const pb = SRC.indexOf("\n];", pa) + 3;
const rLine = SRC.slice(SRC.indexOf("const RETIRED_PROJ_IDS", pb), SRC.indexOf(";", SRC.indexOf("const RETIRED_PROJ_IDS", pb)) + 1);
if (!rLine) throw new Error("RETIRED_PROJ_IDS 를 못 찾음 — 패치 누락");
const { PERSONAL_PROJECTS, RETIRED_PROJ_IDS } = new Function(SRC.slice(pa, pb) + "\n" + rLine + "\nreturn { PERSONAL_PROJECTS, RETIRED_PROJ_IDS };")();

/* 2) S4a 의 setProjects(prev => { ... }) 본문 */
const anchor = SRC.indexOf("personalProjDone.current = true;");
if (anchor < 0) throw new Error("S4a 보강을 못 찾음");
const open = SRC.indexOf("setProjects(prev => {", anchor);
const close = SRC.indexOf("\n    });", open);
const BODY = SRC.slice(open + "setProjects(prev => {".length, close);
if (!/RETIRED_PROJ_IDS/.test(BODY)) throw new Error("보강 본문에 종료 카드 처리가 없음 — 패치 누락");
const upgrade = (prev, tasks, recurrings = []) => new Function("ctx", "with (ctx) {\n" + BODY + "\n}")({ PERSONAL_PROJECTS, RETIRED_PROJ_IDS, prev, tasks, recurrings });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); }
};
const ids = (ps) => ps.map(p => p.id);

const saved = [
  { id: "rt_workout", name: "운동", order: 0, kind: "routine" },
  { id: "rt_english", name: "영어", order: 1, kind: "routine" },
  { id: "rt_vocal", name: "보컬", order: 2, kind: "routine" },
  { id: "rt_writing", name: "글쓰기", order: 3, kind: "routine" },
  { id: "p_invest", name: "투자원칙 정립", order: 4, kind: "project" },
  { id: "p_workcap", name: "PM 엔진", order: 5, kind: "project" },
  { id: "p_b464zvu", name: "PDS 시스템 개선", order: 6, kind: "project" },
  { id: "p_sweep", name: "🗓️ 주간 정제", order: 7, kind: "system" },
];

ok("정본 목록에 글쓰기가 없다", !PERSONAL_PROJECTS.some(p => p.id === "rt_writing"));

const r1 = upgrade(saved, [{ id: "t1", project: "rt_vocal" }]);
ok("할 일 없는 글쓰기 카드는 걷힌다", !ids(r1).includes("rt_writing"), ids(r1).join(","));
ok("나머지 카드는 그대로·순서 유지", ids(r1).join(",") === ids(saved).filter(i => !RETIRED_PROJ_IDS.has(i)).join(","), ids(r1).join(",")); /* 2026-10-07 p_workcap 도 종료 목록(업무 앱으로 이동) — 할 일 없는 이 픽스처에서는 함께 걷힌다 */

const r2 = upgrade(r1, []);
ok("다음 로드에 다시 심기지 않는다(같은 배열 그대로)", r2 === r1, ids(r2).join(","));

const r3 = upgrade(saved, [{ id: "t9", project: "rt_writing" }]);
ok("할 일이 붙어 있으면 걷지 않는다", ids(r3).includes("rt_writing"), ids(r3).join(","));
const r3b = upgrade(saved, [], [{ id: "r1", project: "rt_writing", disabled: true }]);
ok("반복(꺼진 것 포함)이 가리키고 있으면 걷지 않는다(2026-10-08)", ids(r3b).includes("rt_writing"), ids(r3b).join(","));

const custom = [...saved, { id: "p_new1", name: "새 과제", order: 9, kind: "project" }];
const r4 = upgrade(custom, []);
ok("소유자가 만든 다른 카드는 남는다", ids(r4).includes("p_new1") && !ids(r4).includes("rt_writing"), ids(r4).join(","));

const r5 = upgrade([...saved.filter(p => p.id !== "rt_writing"), { id: "p_routine", name: "🔁 루틴" }], []);
ok("옛 p_routine 제거는 그대로", !ids(r5).includes("p_routine"), ids(r5).join(","));

const file = process.argv[2];
if (file) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const prev = (d.projects || []).filter(Boolean);
  const out = upgrade(prev, (d.tasks || []).filter(Boolean));
  const gone = ids(prev).filter(i => !ids(out).includes(i));
  ok("저장본: 사라지는 카드는 글쓰기 하나뿐", gone.length === 1 && gone[0] === "rt_writing", "사라짐=" + gone.join(","));
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
