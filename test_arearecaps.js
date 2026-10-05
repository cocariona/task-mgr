/* 영역(업무=과제) 카드 회고 순서 검증 — areaRecaps 를 index.html 에서 그대로 뽑아 실행한다.
   확인 대상: 최신 날짜가 위(2026-07-25), 같은 날은 나중에 적은 것이 위(2026-10-05). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const a = SRC.indexOf("const areaRecaps = (projectId, recurrings, history) => {");
if (a < 0) throw new Error("areaRecaps 를 못 찾음");
const b = SRC.indexOf("\n};", a) + 3;
const areaRecaps = new Function(SRC.slice(a, b) + "\nreturn areaRecaps;")();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
};
const R = (text, time, project) => ({ type: "done", memoOnly: true, text: "", time, orig: { project: project || "rt_vocal", recap: text } });
const order = (h) => areaRecaps("rt_vocal", [], h).items.map(m => m.text).join(",");

console.log("\n[1] 소유자 실측 — 같은 날 두 건은 나중에 적은 것이 위");
ok("23:29 가 23:16 위", order([{ date: "2026-09-08", items: [R("A", "23:16"), R("B", "23:29")] }]) === "B,A",
  order([{ date: "2026-09-08", items: [R("A", "23:16"), R("B", "23:29")] }]));

console.log("\n[2] 날짜가 먼저 — 어제 늦게 적은 것보다 오늘 일찍 적은 것이 위");
{
  const h = [{ date: "2026-10-04", items: [R("어제밤", "23:50")] }, { date: "2026-10-05", items: [R("오늘아침", "07:00")] }];
  ok("오늘아침,어제밤", order(h) === "오늘아침,어제밤", order(h));
}

console.log("\n[3] 같은 분에 두 건 — 나중에 붙은 것이 위");
ok("B,A", order([{ date: "2026-10-05", items: [R("A", "10:00"), R("B", "10:00")] }]) === "B,A");

console.log("\n[4] 시각 없는 옛 기록은 그날 맨 아래(터지지 않는다)");
ok("B,A", order([{ date: "2026-10-05", items: [R("A", undefined), R("B", "09:00")] }]) === "B,A");

console.log("\n[5] 수정·삭제 좌표(idx)는 히스토리 안의 원래 자리 그대로");
{
  const items = areaRecaps("rt_vocal", [], [{ date: "2026-10-05", items: [R("A", "09:00"), R("다른영역", "09:30", "rt_english"), R("B", "10:00")] }]).items;
  ok("B 의 idx=2, A 의 idx=0", items.map(m => m.text + "@" + m.idx).join(",") === "B@2,A@0", items.map(m => m.text + "@" + m.idx).join(","));
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
