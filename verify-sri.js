/* verify-sri.js — 배포 前 SRI 검증(2026-07-25 소유자 지시)
 *
 * 왜 필요한가: integrity 는 **선언**일 뿐이고, 그 선언이 실제 파일과 맞는지는 아무도 안 본다.
 * 버전만 올리고 해시를 깜빡하면 브라우저가 스크립트 실행을 거부해 **6/17 과 같은 백지**가 된다.
 * = SRI 를 도입하면 "해시 갱신 누락"이라는 새 사고 경로가 생기므로, 그걸 배포 前에 막는 게 이 파일이다.
 *
 * 또한 exact pin·crossorigin·integrity 세 조건을 **구조적으로** 강제한다:
 *  - exact pin 없이는(=bare major) 해시가 애초에 성립하지 않는다(내용이 바뀔 수 있으므로).
 *  - crossorigin 없이는 cross-origin SRI 가 동작하지 않는다(브라우저가 검증을 못 함).
 *
 * CI(pages.yml)가 build.js 前에 실행. 네트워크 실패도 **실패로 처리**한다 —
 * 막힌 배포는 되돌릴 수 있지만 백지 배포는 못 되돌린다.
 *
 * 버전 올릴 때: 이 스크립트가 기대 해시를 출력하므로 그걸 index.html 에 붙여넣으면 된다.
 */
const fs = require('fs');
const crypto = require('crypto');

const html = fs.readFileSync('index.html', 'utf8');

/* 외부 스크립트 태그 전수 수집(속성 순서 무관) */
const TAG_RE = /<script\b([^>]*\bsrc="https:\/\/[^"]+"[^>]*)>/g;
const attr = (s, name) => {
  const m = s.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : (new RegExp(`\\b${name}(?=[\\s>])`).test(s) ? '' : null);
};

const tags = [...html.matchAll(TAG_RE)].map(m => m[1]);
if (!tags.length) {
  console.error('SRI VERIFY FAIL: 외부 <script src="https://..."> 를 하나도 못 찾음 — 파서가 부패했거나 태그 형식이 바뀜');
  process.exit(1);
}

const EXACT_RE = /@\d+\.\d+\.\d+(?:[-+][\w.]+)?\//;   /* unpkg 계열 exact pin */
const VER_RE = /\/\d+\.\d+\.\d+\//;                    /* gstatic 계열 경로 버전 */

(async () => {
  let failed = 0;
  console.log(`외부 스크립트 ${tags.length}개 검증\n`);

  for (const t of tags) {
    const src = attr(t, 'src');
    const integrity = attr(t, 'integrity');
    const cors = attr(t, 'crossorigin');
    const name = src.replace(/^https:\/\//, '');
    const fail = (msg) => { console.error(`  FAIL  ${name}\n        ${msg}`); failed++; };

    if (!EXACT_RE.test(src) && !VER_RE.test(src)) {
      fail('exact 버전이 아님(bare major 는 내용이 바뀔 수 있어 SRI 자체가 성립 못 함)');
      continue;
    }
    if (integrity === null || !integrity) { fail('integrity 속성 없음'); continue; }
    if (cors === null) { fail('crossorigin 속성 없음 — cross-origin SRI 가 동작하지 않음'); continue; }

    let buf;
    try {
      const res = await fetch(src);
      if (!res.ok) { fail(`HTTP ${res.status} — 검증 불가(네트워크 실패도 실패로 처리한다)`); continue; }
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      fail(`fetch 실패: ${e.message} — 검증 불가(네트워크 실패도 실패로 처리한다)`);
      continue;
    }

    /* SRI 는 공백 구분 복수 해시 허용 — 하나라도 맞으면 통과 */
    const declared = integrity.trim().split(/\s+/);
    const matched = declared.some(d => {
      const [algo, b64] = [d.slice(0, d.indexOf('-')), d.slice(d.indexOf('-') + 1)];
      if (!['sha256', 'sha384', 'sha512'].includes(algo)) return false;
      return crypto.createHash(algo).update(buf).digest('base64') === b64;
    });

    if (matched) {
      console.log(`  ok    ${name}  (${buf.length}B)`);
    } else {
      const actual = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
      fail(`해시 불일치 — 브라우저가 이 스크립트 실행을 **거부**한다(백지).\n` +
           `        선언: ${declared.join(' ')}\n` +
           `        실제: ${actual}   ← 버전을 올렸다면 이 값으로 교체할 것`);
    }
  }

  if (failed) {
    console.error(`\nSRI VERIFY FAIL: ${failed}/${tags.length} — 배포 중단`);
    process.exit(1);
  }
  console.log(`\nSRI VERIFY OK: ${tags.length}/${tags.length} 전부 실파일과 일치`);
})();
