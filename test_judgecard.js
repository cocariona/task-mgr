/* 업무 카드 이름 정정 검증 — judgeProjDone 의 setProjects 갱신 함수를 index.html 에서 추출해 실행한다.
   확인 대상: 「판단 발신」 카드가 로드 때 「업무」로 바뀌고, 다른 이름은 그대로이며, 카드가 없으면 시드가 들어가는가
   (2026-10-06 소유자 「판단 발신 이름 바꿔야 하지 않나?」 → 진행 동의). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

/* 1) 업무 시드 목록 */
const ia = SRC.indexOf("const INIT_PROJECTS = [");
if (ia < 0) throw new Error("INIT_PROJECTS 를 못 찾음");
const ib = SRC.indexOf("\n];", ia) + 3;
const INIT_PROJECTS = new Function(SRC.slice(ia, ib) + "\nreturn INIT_PROJECTS;")();

/* 2) judgeProjDone 의 setProjects(prev => { ... }) 본문 */
const anchor = SRC.indexOf("judgeProjDone.current = true;");
if (anchor < 0) throw new Error("judgeProjDone 을 못 찾음");
const open = SRC.indexOf("setProjects(prev => {", anchor);
const close = SRC.indexOf("\n    });", open);
const BODY = SRC.slice(open + "setProjects(prev => {".length, close);
if (!/판단 발신/.test(BODY) || !/"업무"/.test(BODY)) throw new Error("이름 정정 코드가 없음 — 패치 누락");
const seed = INIT_PROJECTS.find(p => p.id === "p_judge");
const run = (prev) => new Function("ctx", "with (ctx) {\n" + BODY + "\n}")({ prev, seed });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); }
};

ok("시드 카드 이름 = 업무", seed && seed.name === "업무", seed && seed.name);

const before = [{ id: "p_judge", name: "판단 발신", order: -1, kind: "routine" }, { id: "proj_etc", name: "기타 업무" }];
const r1 = run(before);
ok("옛 이름 「판단 발신」 → 「업무」", r1.find(p => p.id === "p_judge").name === "업무");
ok("다른 카드는 그대로", r1.find(p => p.id === "proj_etc").name === "기타 업무");
ok("id·kind·order 는 그대로", (() => { const p = r1.find(x => x.id === "p_judge"); return p.kind === "routine" && p.order === -1; })());

const r2 = run(r1);
ok("두 번째 로드에는 바꿀 것이 없다(같은 배열)", r2 === r1);

const custom = [{ id: "p_judge", name: "내가 붙인 이름", order: -1, kind: "routine" }];
const r3 = run(custom);
ok("소유자가 붙인 다른 이름은 되돌리지 않는다", r3 === custom && r3[0].name === "내가 붙인 이름");

const r4 = run([{ id: "proj_etc", name: "기타 업무" }]);
ok("카드가 없으면 시드(업무)를 맨 앞에 넣는다", r4[0].id === "p_judge" && r4[0].name === "업무" && r4.length === 2);

const file = process.argv[2];
if (file) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const prev = (d.projects || []).filter(Boolean);
  const out = run(prev);
  const changed = out.filter((p, i) => p !== prev[i]).map(p => p.id + ":" + p.name);
  ok("저장본: 바뀌는 카드는 p_judge 하나뿐", changed.length === 1 && changed[0] === "p_judge:업무", changed.join(","));
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
