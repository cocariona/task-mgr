/**
 * 회사 캘린더 → task-mgr 단방향 읽기 전용 피드
 * 배포(회사 계정에서):
 *  1. script.google.com (회사 계정) → 새 프로젝트 → 이 코드 붙여넣기
 *  2. 아래 KEY 를 임의의 긴 랜덤 문자열로 교체
 *  3. 배포 → 새 배포 → 웹 앱 → "실행: 나" / "액세스: 모든 사용자" → 배포 → URL 복사
 *  4. task-mgr index.html 의 COMPANY_GAS_URL / COMPANY_GAS_KEY 에 URL·KEY 입력 후 푸시
 * 보안: URL+KEY 둘 다 알아야 조회 가능. 읽기 전용(쓰기 코드 없음) — 회사 캘린더는 절대 수정되지 않음.
 */
var KEY = "PASTE_RANDOM_LONG_KEY";

function doGet(e) {
  var out;
  if (!e || !e.parameter || (e.parameter.key || "") !== KEY) {
    out = JSON.stringify({ success: false, error: "denied" });
  } else {
    var days = Math.min(Number(e.parameter.days || 14), 60);
    var now = new Date();
    var end = new Date(now.getTime() + days * 86400000);
    var events = CalendarApp.getDefaultCalendar().getEvents(now, end).map(function (ev) {
      return {
        id: ev.getId(),
        title: ev.getTitle(),
        start: Utilities.formatDate(ev.getStartTime(), "Asia/Seoul", "yyyy-MM-dd"),
        allDay: ev.isAllDayEvent(),
        updated: ev.getLastUpdated().getTime()
      };
    });
    out = JSON.stringify({ success: true, events: events });
  }
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + out + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
