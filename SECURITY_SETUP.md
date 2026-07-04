# 보안 설정 — C3 (익명 캘린더/데이터 접근 완전 차단)

레드팀에서 확인된 취약점: **공개 Pages 앱이라 GAS_URL·Firebase 설정이 노출**되고, GAS에 인증이 없어
익명 사용자가 캘린더를 읽고/삭제할 수 있으며, RTDB 규칙이 소유자로 잠겨있지 않으면 아무 구글 계정이나
`/data`·`/personal`을 읽을 수 있음. 아래 5단계로 **소유자 계정 전용**으로 잠근다.

> 앱·GAS 코드는 이미 이 설정에 맞게 배포됨(opt-in). **설정 전에는 기존대로 동작**하고, 설정을 마치면 익명 접근이 차단된다.

---

## 1) 내 Firebase UID 확인
Firebase 콘솔 → **Authentication → Users** → 내 구글 계정 행의 **User UID** 복사. (아래 `<OWNER_UID>`에 넣음)

## 2) RTDB 보안 규칙을 소유자로 잠금
Firebase 콘솔 → **Realtime Database → 규칙(Rules)** → 아래로 교체(‹OWNER_UID› 치환) → **게시**:

```json
{
  "rules": {
    "data":     { ".read": "auth.uid === '<OWNER_UID>'", ".write": "auth.uid === '<OWNER_UID>'" },
    "personal": { ".read": "auth.uid === '<OWNER_UID>'", ".write": "auth.uid === '<OWNER_UID>'" },
    "files":    { ".read": "auth.uid === '<OWNER_UID>'", ".write": "auth.uid === '<OWNER_UID>'" },
    "calToken": { ".read": "auth.uid === '<OWNER_UID>'", ".write": "auth.uid === '<OWNER_UID>'" }
  }
}
```
→ 이제 **내 구글 계정만** 데이터·토큰을 읽고 쓸 수 있다. (다른 계정이 로그인해도 데이터가 안 보임 = 테넌시 격리)

## 3) 비밀 토큰 생성 + RTDB에 저장
- 무작위 문자열 하나 만들기(예: 32자 영숫자).
- Firebase 콘솔 → **Realtime Database → 데이터** → 최상위에 키 `calToken` 추가, 값 = 그 비밀 문자열.
  (2단계 규칙 덕분에 이제 **나만** 읽을 수 있음 → 앱이 로그인 후 이걸 읽어 GAS에 실어 보냄)

## 4) GAS 스크립트 속성에 같은 토큰 설정
- script.google.com → 캘린더 프로젝트 → **프로젝트 설정(⚙️) → 스크립트 속성** → 속성 추가:
  이름 `TMTOKEN`, 값 = **3단계와 동일한 비밀 문자열**.

## 5) GAS 재배포
- 레포의 최신 `personal-calendar-gas.gs`(XSS 수정·토큰 게이트·버전마커 포함) 코드를 붙여넣기 →
  **배포 → 배포 관리 → 기존 배포 ✏️ → 새 버전 → 배포** (URL 유지).

---

## 완료 후 동작
- 클라이언트: 로그인 후 `/calToken`(나만 읽음)에서 토큰을 받아 모든 GAS 호출에 `token=`으로 첨부.
- GAS: `TMTOKEN`이 설정돼 있으면 토큰 불일치 요청을 `unauthorized`로 거부 → **익명 GAS 호출 차단**.
- 다른 구글 계정: 규칙상 `/data`·`/personal`·`/calToken` 접근 불가 → **데이터 격리**.
- 결과: **익명 캘린더 읽기/삭제·타 계정 데이터 열람 모두 차단.**

## 검증
- 재배포 후 앱에서 캘린더 동기가 정상인지 확인(내 계정은 토큰을 받으므로 통과).
- 익명으로 `…/exec?action=list&callback=cb` 열어보면 이제 `cb({"success":false,"error":"unauthorized"})` (JSONP 래핑 — `cb`가 콜백 화이트리스트를 통과하므로) 여야 정상.
- GAS `list` 응답의 `v` 필드(레포 현재 `260705`)가 레포 `.gs`와 같은지 = 재배포 반영 확인. (라이브가 `260704`면 2026-07-05 tz 필드 추가분이 아직 미배포 — 타임존은 실증 완료라 급하지 않음, 다음 GAS 수정 때 같이 재배포.)
- `260705`+ 재배포 후엔 `list` 응답의 `tz` 필드가 `Asia/Seoul`인지도 확인(아니면 프로젝트 설정 > 시간대 수정).

> ⚠️ 토큰이 여전히 클라이언트(브라우저 실행 코드)에는 들어가지만, **RTDB 규칙으로 owner만 토큰을 얻을 수 있으므로** 비-소유자는 토큰을 못 구해 GAS를 못 부른다. 이게 공개 웹앱에서 실효적인 방어선이다.
