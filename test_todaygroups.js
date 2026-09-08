/* 오늘 화면의 항목 배치 검증 — 로직을 index.html 에서 추출해 실행한다.
   확인 대상: 하위 항목이 그 상위 항목 바로 아래에 오는가(2026-09-08). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

/* 1) 그룹 구성 본문 추출 */
const anchor = SRC.indexOf("const focusGroups = useMemo(() => {");
if (anchor < 0) throw new Error("focusGroups 를 못 찾음");
const endMark = "\n  }, [focusedTasks, focusedSubs]);";
const end = SRC.indexOf(endMark, anchor);
if (end < 0) throw new Error("focusGroups 끝을 못 찾음");
const BODY = SRC.slice(SRC.indexOf("{", anchor + 30) + 1, end);
if (!/underParent/.test(BODY)) throw new Error("상위 아래 배치 코드가 없음 — 패치 누락");

/* 2) 상태 목록도 소스에서 그대로 (테스트가 앱과 다른 상태를 쓰지 않도록) */
const sa = SRC.indexOf("const STATUSES = {");
const sb = SRC.indexOf("\n};", sa) + 3;
const skLine = SRC.slice(SRC.indexOf("const SK = ", sb), SRC.indexOf(";", SRC.indexOf("const SK = ", sb)) + 1);
const { STATUSES, SK } = new Function(SRC.slice(sa, sb) + "\n" + skLine + "\nreturn { STATUSES, SK };")();
if (!SK.length) throw new Error("SK 추출 실패");

function makeGroups(focusedTasks, focusedSubs) {
  const ctx = { SK, STATUSES, focusedTasks, focusedSubs };
  return new Function("ctx", "with (ctx) {\n" + BODY + "\n}")(ctx);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
};
const T = (id, status) => ({ id, text: "T" + id, status: status || "action" });
const S = (id, parent, status) => ({ sub: { id, text: "s" + id, status: status || "action" }, parent });
/* 그룹을 "T1,s9,T2" 처럼 납작하게 */
const flat = (gs) => gs.map(g => g.k + ":" + g.items.map(i => i.type === "task" ? i.data.text : i.data.text).join(",")).join(" | ");
const flagOf = (gs, text) => {
  for (const g of gs) for (const i of g.items) if (i.data.text === text) return i.underParent;
  return "(없음)";
};

console.log("\n[1] 소유자 실측 상황 — 상위 1건 아래 하위 1건");
{
  const p = T("A");
  const gs = makeGroups([T("Z"), p, T("Y")], [S("q", p)]);
  ok("하위가 상위 바로 뒤", flat(gs) === "action:TZ,TA,sq,TY", flat(gs));
  ok("상위 아래 붙음 표시", flagOf(gs, "sq") === true);
}

console.log("\n[2] 같은 상위에 하위 여럿 — 순서를 지키며 붙는다");
{
  const p = T("A");
  const gs = makeGroups([p, T("B")], [S("1", p), S("2", p), S("3", p)]);
  ok("셋 다 상위 뒤에 차례로", flat(gs) === "action:TA,s1,s2,s3,TB", flat(gs));
}

console.log("\n[3] 상위가 여럿 — 각자 자기 상위 뒤로");
{
  const p1 = T("A"), p2 = T("B");
  const gs = makeGroups([p1, p2], [S("b1", p2), S("a1", p1), S("b2", p2)]);
  ok("각자 제자리", flat(gs) === "action:TA,sa1,TB,sb1,sb2", flat(gs));
}

console.log("\n[4] 상위가 오늘 목록에 없으면 종전대로 뒤에");
{
  const orphan = T("X");
  const gs = makeGroups([T("A")], [S("o", orphan)]);
  ok("맨 뒤에 붙음", flat(gs) === "action:TA,so", flat(gs));
  ok("상위 아래 아님 표시", flagOf(gs, "so") === false);
}

console.log("\n[5] 상위와 하위의 상태가 다르면 각자 제 그룹으로");
{
  const p = T("A", "action");
  const gs = makeGroups([p, T("W", "waiting")], [S("w", p, "waiting")]);
  const f = flat(gs);
  ok("하위는 waiting 그룹에", /waiting:.*sw/.test(f), f);
  ok("action 그룹에는 상위만", /action:TA(\||$| )/.test(f + " "), f);
  ok("상위 아래 아님 표시", flagOf(gs, "sw") === false);
}

console.log("\n[6] 하위만 있고 상위가 없어도 목록이 만들어진다");
{
  const orphan = T("X");
  const gs = makeGroups([], [S("only", orphan)]);
  ok("빈 그룹은 걸러진다", gs.length === 1 && gs[0].items.length === 1, flat(gs));
}

console.log("\n[7] 알 수 없는 상태의 하위는 조용히 빠진다(터지지 않는다)");
{
  const p = T("A");
  let threw = false;
  let gs;
  try { gs = makeGroups([p], [S("bad", p, "someday")]); } catch (e) { threw = true; }
  ok("예외 없음", !threw);
  ok("목록에는 상위만", !threw && flat(gs) === "action:TA", threw ? "throw" : flat(gs));
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
