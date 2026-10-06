/* 「같은 날은 최근 것이 위」 검증 — 영역(업무=과제) 카드 회고(areaRecaps)와 히스토리 탭(histRows).
   두 곳이 함께 쓰는 비교 규칙 newerFirst 와 함께 index.html 에서 그대로 뽑아 실행한다.
   확인 대상: 최신 날짜가 위(2026-07-25), 같은 날은 시각 → 붙은 순서 내림차순(2026-10-05). */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const a = SRC.indexOf("const newerFirst = ");
const b = SRC.indexOf("\n};", SRC.indexOf("const areaRecaps = (projectId, recurrings, history) => {", a)) + 3;
if (a < 0 || b < 3) throw new Error("newerFirst·histRows·areaRecaps 를 못 찾음 — 패치 누락");
const { areaRecaps, histRows } = new Function(SRC.slice(a, b) + "\nreturn { areaRecaps, histRows };")();
if (typeof histRows !== "function") throw new Error("histRows 가 없음 — 패치 누락");

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
};
const R = (text, time, project) => ({ type: "done", memoOnly: true, text: "", time, orig: { project: project || "rt_vocal", recap: text } });
const order = (h) => areaRecaps("rt_vocal", [], h).items.map(m => m.text).join(",");

console.log("\n── 영역 카드 회고 ──");
console.log("\n[1] 소유자 실측 — 같은 날 두 건은 나중에 적은 것이 위");
{
  const h = [{ date: "2026-09-08", items: [R("A", "23:16"), R("B", "23:29")] }];
  ok("23:29 가 23:16 위", order(h) === "B,A", order(h));
}

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
  const got = items.map(m => m.text + "@" + m.idx).join(",");
  ok("B 의 idx=2, A 의 idx=0", got === "B@2,A@0", got);
}

console.log("\n── 히스토리 탭 ──");
const H = (type, text, time) => ({ type, text, time });
const rows = (items, f) => histRows(items, f || "all").map(r => r.item.text + "@" + r.idx).join(",");

console.log("\n[6] 같은 날은 최근 것이 위 · 같은 분이면 나중에 붙은 것이 위");
{
  const items = [H("added", "추가", "09:00"), H("done", "완료", "10:00"), H("status", "변경", "10:00")];
  ok("변경@2,완료@1,추가@0", rows(items) === "변경@2,완료@1,추가@0", rows(items));
}

console.log("\n[7] 주간 정제가 끝에 덧붙인 소급 기록은 제 시각 자리로(실측: 보컬 23:51 뒤에 붙은 헬스 18:00)");
{
  const items = [H("added", "할일", "21:08"), H("done", "보컬", "23:51"), H("done", "헬스", "18:00")];
  ok("보컬@1,할일@0,헬스@2", rows(items) === "보컬@1,할일@0,헬스@2", rows(items));
}

console.log("\n[8] 거르기(완료만)에서도 순서·좌표가 맞다");
{
  const items = [H("done", "A", "08:00"), H("added", "X", "09:00"), H("done", "B", "12:00")];
  ok("B@2,A@0", rows(items, "done") === "B@2,A@0", rows(items, "done"));
}

console.log("\n[9] 시각 없는 기록은 그날 맨 아래 · 빈 날은 빈 목록");
{
  ok("B@1,A@0", rows([H("done", "A", undefined), H("done", "B", "07:00")]) === "B@1,A@0");
  ok("빈 목록", histRows(undefined, "all").length === 0);
}

console.log("\n" + (fail ? "실패 " + fail + "건 / " : "") + "통과 " + pass + "건");
process.exit(fail ? 1 : 0);
