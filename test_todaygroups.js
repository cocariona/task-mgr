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

/* 2026-10-02 — 오늘 목록에 따로 선 하위는 상위 카드의 펼친 목록에서 뺀다(같은 하위 두 줄 표시 수정).
   todaySubIds 본문과 TaskRow 의 listSubs 한 줄을 소스에서 그대로 뽑아 실행한다. */
const ia = SRC.indexOf("const todaySubIds = useMemo(() => {");
if (ia < 0) throw new Error("todaySubIds 를 못 찾음 — 패치 누락");
const ie = SRC.indexOf("\n  }, [focusGroups]);", ia);
const ID_BODY = SRC.slice(SRC.indexOf("{", ia + 30) + 1, ie);
const lsLine = (SRC.match(/const listSubs = [^\n]*;/) || [])[0];
if (!lsLine) throw new Error("listSubs 를 못 찾음 — 패치 누락");
const todaySubIdsOf = (focusGroups) => new Function("focusGroups", ID_BODY)(focusGroups);
const listSubsOf = (subs, hideSubIds) => new Function("subs", "hideSubIds", lsLine + "\nreturn listSubs;")(subs, hideSubIds);
const ids = (arr) => arr.map(s => s.id).join(",");

console.log("\n[8] 상위 바로 아래 선 하위는 펼친 목록에서 빠진다(소유자 실측 2026-10-02)");
{
  const q = { id: "q", status: "action" }, r = { id: "r", status: "action" }; /* q=오늘, r=날짜 없음 */
  const p = { ...T("A"), subtasks: [q, r] };
  const hide = todaySubIdsOf(makeGroups([p], [{ sub: q, parent: p }]));
  ok("q 는 숨김 대상", hide.has("q") && !hide.has("r"), [...hide].join(","));
  ok("펼친 목록엔 r 만", ids(listSubsOf(p.subtasks, hide)) === "r", ids(listSubsOf(p.subtasks, hide)));
}

console.log("\n[9] 상태가 달라 다른 무리에 선 하위도 펼친 목록에서 빠진다");
{
  const w = { id: "w", status: "waiting" };
  const p = { ...T("A", "action"), subtasks: [w] };
  const hide = todaySubIdsOf(makeGroups([p], [{ sub: w, parent: p }]));
  ok("w 는 숨김 대상", hide.has("w"));
  ok("펼친 목록이 비어 ▼ 도 안 뜬다", listSubsOf(p.subtasks, hide).length === 0);
}

console.log("\n[10] 오늘 목록에 못 선 하위(알 수 없는 상태)는 숨기지 않는다 — 어디에도 안 보이게 되면 안 된다");
{
  const bad = { id: "bad", status: "someday" };
  const p = { ...T("A"), subtasks: [bad] };
  const hide = todaySubIdsOf(makeGroups([p], [{ sub: bad, parent: p }]));
  ok("bad 는 숨김 대상 아님", !hide.has("bad"));
  ok("펼친 목록에 남는다", ids(listSubsOf(p.subtasks, hide)) === "bad");
}

console.log("\n[11] 영역 탭(hideSubIds 없음)은 전부 그대로");
{
  const subs = [{ id: "a" }, { id: "b" }];
  ok("둘 다 보인다", ids(listSubsOf(subs, undefined)) === "a,b");
}

/* 2026-10-02 — 반복 인스턴스의 지난 하위는 「지난 계획 미처리」에 세우지 않는다(이미 「오늘 할 일」에 떠 있다).
   PlanDateSummary 의 planned·recParentIds·overduePlan 을 소스에서 그대로 뽑아 실행한다. */
const pa = SRC.indexOf("  const planned = useMemo(() => {");
const pb = SRC.indexOf("\n", SRC.indexOf("  const overduePlan = ", pa));
if (pa < 0 || pb < 0) throw new Error("PlanDateSummary 계산부를 못 찾음");
if (!/recParentIds/.test(SRC.slice(pa, pb))) throw new Error("recParentIds 가 없음 — 패치 누락");
const ddA = SRC.indexOf("const diffDays = (dateStr) => {");
const DD = SRC.slice(ddA, SRC.indexOf("\n};", ddA) + 3);
const overdueOf = (tasks, TODAY) => new Function("tasks", "TODAY", "useMemo",
  DD + "\n" + SRC.slice(pa, pb) + "\nreturn overduePlan;")(tasks, TODAY, (f) => f());
const TD = "2026-10-02", YD = "2026-10-01";

console.log("\n[12] 반복 부모의 지난 하위는 지난 계획에서 빠진다");
{
  const rec = { id: "R", text: "🎤 보컬", status: "action", recurringId: "rq", planDate: YD, subtasks: [{ id: "rs", text: "고음 연습", status: "action", planDate: YD }] };
  const plain = { id: "P", text: "일반", status: "action", planDate: TD, subtasks: [{ id: "ps", text: "일반 하위", status: "action", planDate: YD }] };
  const od = overdueOf([rec, plain], TD).map(x => x.id).join(",");
  ok("반복 부모 하위(rs)는 없다", !/\brs\b/.test(od), od);
  ok("반복 인스턴스 자체(R)도 없다(09-17)", !/\bR\b/.test(od), od);
  ok("일반 부모의 지난 하위(ps)는 남는다", /\bps\b/.test(od), od);
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
