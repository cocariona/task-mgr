/**
 * Google Apps Script — Task Manager 캘린더 자동 동기화 (+ 역방향 list) + 시간 지원
 *
 * ⚠️ 이 파일은 개인 GAS의 백업/참조본입니다. 실제 실행 코드는 사용자 구글 계정
 *    (script.google.com)에 있으며 index.html 의 GAS_URL 로 호출됩니다.
 *    저장소의 company-calendar-gas.gs 는 무관한(미사용) 옛 회사용 읽기 피드입니다.
 *
 * 동기 방향:
 *  - push : task-mgr → 캘린더 (action = add / update / delete). add/update 는 eventId 와
 *           updated(이벤트 lastUpdated, ms)를 반환 → 앱이 task.calUpdated 에 기록.
 *  - pull : 캘린더 → task-mgr (action = list). 앱(calPull)이 calEventId 매칭 후
 *           event.updated > task.calUpdated 일 때만 날짜/시간 반영 = 최종수정 우선(에코 방지).
 *  - update 는 날짜 변경을 위해 "삭제 후 재생성" → eventId 가 바뀜(앱이 새 id 재저장).
 *    캘린더에서 직접 옮기면 eventId 는 유지되고 updated 만 증가 → pull 이 잡음.
 *
 * ★ 시간 지원(2026-07-01): time=HH:MM 파라미터가 오면 타임드 이벤트(start=date+time, end=+dur분, 기본 60).
 *    없으면 종일(기존과 동일). list 의 start = 타임드면 "yyyy-MM-ddTHH:mm", 종일이면 "yyyy-MM-dd".
 *    → 루틴/반복 일정을 task-mgr가 소유하며 시간까지 캘린더에 박을 수 있음.
 *
 * 재배포(URL 유지): 코드 교체·저장 → 배포 > 배포 관리 > 기존 배포 ✏️ 수정 > 버전 "새 버전" > 배포.
 *  (새 배포를 만들면 URL 이 바뀌어 GAS_URL 을 고쳐야 하므로 기존 배포를 갱신할 것.)
 */

function doGet(e) {
  var action = e.parameter.action || "add";
  var callback = e.parameter.callback || "";
  var cal = CalendarApp.getDefaultCalendar();

  function respond(obj) {
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(obj) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // time=HH:MM 있으면 타임드, 없으면 종일
  function makeEvent(title, dateStr, time, desc) {
    if (time) {
      var hm = String(time).split(":");
      var st = new Date(dateStr + "T00:00:00");
      st.setHours(Number(hm[0]) || 0, Number(hm[1]) || 0, 0, 0);
      var dur = Number(e.parameter.dur || 60);
      var en = new Date(st.getTime() + dur * 60000);
      return cal.createEvent(title, st, en, { description: desc });
    }
    var date = new Date(dateStr + "T00:00:00");
    return cal.createAllDayEvent(title, date, { description: desc });
  }

  try {
    if (action === "add") {
      var ev = makeEvent(e.parameter.title || "", e.parameter.date || "", e.parameter.time || "", e.parameter.desc || "");
      return respond({ success: true, eventId: ev.getId(), updated: ev.getLastUpdated().getTime() });
    }

    if (action === "update") {
      // ★ in-place 수정(2026-07-01): 삭제+재생성 대신 기존 이벤트를 그대로 고침 → eventId 유지.
      //   (delete+recreate 는 앱이 새 id 저장에 실패하면 고아/중복이 쌓였음. in-place 는 실패해도 안전.)
      var eventId = e.parameter.eventId || "";
      var ev = null;
      try { ev = cal.getEventById(eventId); } catch (err) { ev = null; }
      var title = e.parameter.title || "";
      var dateStr = e.parameter.date || "";
      var time = e.parameter.time || "";
      var desc = e.parameter.desc || "";
      if (!ev) { // 못 찾으면 새로 생성
        var nev = makeEvent(title, dateStr, time, desc);
        return respond({ success: true, eventId: nev.getId(), updated: nev.getLastUpdated().getTime(), recreated: true });
      }
      try {
        if (title) ev.setTitle(title);
        ev.setDescription(desc);
        if (dateStr) {
          if (time) {
            var hm = String(time).split(":");
            var st = new Date(dateStr + "T00:00:00");
            st.setHours(Number(hm[0]) || 0, Number(hm[1]) || 0, 0, 0);
            var dur = Number(e.parameter.dur || 60);
            ev.setTime(st, new Date(st.getTime() + dur * 60000)); // 종일↔타임드 전환 포함
          } else {
            ev.setAllDayDate(new Date(dateStr + "T00:00:00"));
          }
        }
        return respond({ success: true, eventId: ev.getId(), updated: ev.getLastUpdated().getTime() });
      } catch (moderr) {
        // in-place 수정이 막히면(종일↔타임드 전환 제약 등) 삭제+재생성 폴백
        try { ev.deleteEvent(); } catch (e2) {}
        var rev = makeEvent(title, dateStr, time, desc);
        return respond({ success: true, eventId: rev.getId(), updated: rev.getLastUpdated().getTime(), recreated: true });
      }
    }

    if (action === "delete") {
      var delId = e.parameter.eventId || "";
      try {
        var dev = cal.getEventById(delId);
        if (dev) dev.deleteEvent();
      } catch (err) {
        // 이미 삭제된 경우 무시
      }
      return respond({ success: true });
    }

    if (action === "list") {
      var fwd  = Math.min(Number(e.parameter.days || 120), 365);
      var back = Math.min(Number(e.parameter.back || 14), 90);
      var start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - back);
      var end = new Date(); end.setDate(end.getDate() + fwd);
      var events = cal.getEvents(start, end).map(function (ev) {
        var allDay = ev.isAllDayEvent();
        return {
          id: ev.getId(),
          title: ev.getTitle(),
          start: allDay
            ? Utilities.formatDate(ev.getStartTime(), "Asia/Seoul", "yyyy-MM-dd")
            : Utilities.formatDate(ev.getStartTime(), "Asia/Seoul", "yyyy-MM-dd'T'HH:mm"),
          allDay: allDay,
          updated: ev.getLastUpdated().getTime()
        };
      });
      return respond({ success: true, events: events });
    }

    return respond({ success: false, error: "unknown action: " + action });
  } catch (err) {
    return respond({ success: false, error: err.toString() });
  }
}
