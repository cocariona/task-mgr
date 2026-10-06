/* 시드 반복 폐지 검증(2026-10-06) — index.html 의 로드 때 반복 생성 패스와 두 삭제 함수를 그대로 떼어 실행한다.
   확인 대상: ① 로드할 때 옛 기본 반복(운동·영어·보컬·글쓰기·노래 레슨)을 다시 심지 않는다
             ② 반복 설정 ✕ · 영역 탭 세션 삭제가 옛 시드 id 도 목록에서 뺀다(꺼짐 표식으로 남기지 않는다).
   수정 전 소스로 돌리면 실패해야 한다: SRC=옛파일.html node test_noreseed.js
   선택: 저장본 JSON 경로를 인자로 주면 실데이터에도 돌린다(node test_noreseed.js personal.json). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(process.env.SRC || path.join(__dirname, "index.html"), "utf8");

/* 옛 소스에만 있는 시드 목록 — 있으면 그대로 실행 맥락에 넣는다(수정 전 코드에서 실패하도록) */
const ctxBase = {};
const pa = SRC.indexOf("const PERSONAL_ROUTINES = [");
if (pa >= 0) {
  const pb = SRC.indexOf("\n];", pa) + 3;
  const sLine = SRC.slice(SRC.indexOf("const SEED_ROUTINE_IDS", pb), SRC.indexOf(";", SRC.indexOf("const SEED_ROUTINE_IDS", pb)) + 1);
  Object.assign(ctxBase, new Function(SRC.slice(pa, pb) + "\n" + sLine + "\nreturn { PERSONAL_ROUTINES, SEED_ROUTINE_IDS };")());
}

/* 1) 로드 패스: recurDone.current = true; 다음 줄부터 generateRecurringTasks 호출 줄까지 */
const ra = SRC.indexOf("recurDone.current = true;");
if (ra < 0) throw new Error("로드 때 반복 생성 패스를 못 찾음");
const rb = SRC.indexOf("\n", SRC.indexOf("generateRecurringTasks(", ra));
const LOAD = SRC.slice(ra + "recurDone.current = true;".length, rb);
const runLoad = (recurrings, isWork) => {
  let setCalls = 0, genArg = null;
  new Function("ctx", "with (ctx) {\n" + LOAD + "\n}")({
    ...ctxBase, recurrings, isWork, tasks: [], projects: [], history: [],
    setRecurrings: () => { setCalls++; },
    generateRecurringTasks: (recs) => { genArg = recs; return []; },
  });
  return { setCalls, genArg };
};

/* 2) 삭제 함수 둘: 반복 설정 delR · 영역 탭 delRec */
const grab = (start, endMark) => {
  const a = SRC.indexOf(start);
  if (a < 0) throw new Error("못 찾음: " + start);
  return SRC.slice(a, SRC.indexOf(endMark, a) + endMark.length);
};
const DELR = grab("const delR = (id) =>", "};");
const DELREC_A = SRC.indexOf("const delRec = (id) =>");
const DELREC = SRC.slice(SRC.indexOf("setRecurrings(prev =>", DELREC_A), SRC.indexOf("};", DELREC_A));
const runDel = (body, list, id) => {
  let out = null;
  new Function("ctx", "with (ctx) {\n" + body + "\n}")({
    ...ctxBase, id, setRecurrings: (fn) => { out = fn(list); },
  });
  return out;
};
const runDelR = (list, id) => {
  let out = null;
  const delR = new Function("ctx", "with (ctx) {\n" + DELR + "\nreturn delR;\n}")({ ...ctxBase, setRecurrings: (fn) => { out = fn(list); } });
  delR(id);
  return out;
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  — " + extra : "")); }
};
const ids = (rs) => (rs || []).map(r => r.id).join(",");

const live = [
  { id: "q1omsdk", text: "🔈보컬 연습", project: "rt_vocal", type: "count", freqPerWeek: 3 },
  { id: "g3qk0rh", text: "🔈보컬 레슨", project: "rt_vocal", type: "weekly", dows: [4] },
  { id: "h7gayxj", text: "F45", project: "rt_workout", type: "count", freqPerWeek: 5 },
];
const tomb = [
  { id: "rt_workout", text: "🏋️ 운동", project: "rt_workout", type: "daily", disabled: true },
  { id: "rt_vocal", text: "🎤 보컬", project: "rt_vocal", type: "daily", disabled: true },
];

const l1 = runLoad(live, false);
ok("개인: 기본 반복이 없어도 다시 심지 않는다", l1.setCalls === 0, "setRecurrings " + l1.setCalls + "회");
ok("개인: 있는 반복 그대로 인스턴스를 만든다", l1.genArg === live, ids(l1.genArg));

const l2 = runLoad([...live, ...tomb], false);
ok("옛 묘비가 남아 있어도 바꾸지 않는다", l2.setCalls === 0 && l2.genArg.length === live.length + tomb.length, ids(l2.genArg));

const l3 = runLoad(live, true);
ok("업무 워크스페이스도 그대로", l3.setCalls === 0 && l3.genArg === live, ids(l3.genArg));

const d1 = runDelR([...live, ...tomb], "rt_vocal");
ok("반복 설정 ✕: 옛 시드 id 도 목록에서 빠진다", d1 && !d1.some(r => r.id === "rt_vocal"), ids(d1));
ok("반복 설정 ✕: 다른 반복은 그대로", d1 && ids(d1) === ids([...live, ...tomb].filter(r => r.id !== "rt_vocal")), ids(d1));

const d2 = runDelR(live, "g3qk0rh");
ok("반복 설정 ✕: 만든 반복은 종전대로 빠진다", d2 && ids(d2) === "q1omsdk,h7gayxj", ids(d2));

const d3 = runDel(DELREC, [...live, ...tomb], "rt_workout");
ok("영역 탭 세션 삭제: 옛 시드 id 도 목록에서 빠진다", d3 && !d3.some(r => r.id === "rt_workout") && d3.length === live.length + tomb.length - 1, ids(d3));

/* 3) 반복 목록 정규화(빈칸·희소 객체) — 묘비를 지운 뒤 옛 인덱스로 쓰는 탭이 있어도 화면이 하얗게 되지 않게 */
const la = SRC.indexOf("const recList = ");
ok("반복 목록 정규화 함수가 있다", la >= 0);
if (la >= 0) {
  const recList = new Function(SRC.slice(la, SRC.indexOf("\n", la)) + "\nreturn recList;")();
  const holed = [live[0], live[1], null, null, live[2]];
  ok("빈칸(null)을 걸러 낸다", ids(recList(holed)) === ids(live), ids(recList(holed)));
  ok("희소 객체를 목록으로 편다", ids(recList({ 0: live[0], 1: live[1], 8: live[2] })) === ids(live));
  ok("없으면 null(초기값으로 넘어간다)", recList(undefined) === null && recList(null) === null);
  ok("빈 배열은 빈 배열", Array.isArray(recList([])) && recList([]).length === 0);
  const uses = (SRC.match(/recList\((saved\?\.recurrings|m\.recurrings)\)/g) || []).length;
  ok("저장본 · 클라우드 채택 두 곳 모두 거친다", uses === 2, uses + "곳");
}

const file = process.argv[2];
if (file) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const recs = (d.recurrings || []).filter(Boolean);
  const r = runLoad(recs, false);
  ok("저장본: 로드 때 반복 목록을 바꾸지 않는다", r.setCalls === 0 && r.genArg === recs, "반복 " + recs.length + "개");
  /* 묘비 다섯을 지운 뒤의 모습 — 옛 코드는 여기서 다시 심어 실패한다 */
  const SEED5 = ["rt_workout", "rt_english", "rt_vocal", "rt_writing", "rt_vocal_lesson"];
  const pruned = recs.filter(x => !SEED5.includes(x.id));
  const r2 = runLoad(pruned, false);
  ok("저장본에서 묘비 다섯을 지운 뒤에도 다시 심지 않는다", r2.setCalls === 0 && r2.genArg === pruned, "반복 " + pruned.length + "개");
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
