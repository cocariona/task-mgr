/* CI 빌드(2026-07-01): index.html의 인라인 JSX(<script type="text/babel">)를 @babel/core로 사전 컴파일해
   _site/index.html 생성 + @babel/standalone(3MB) CDN 제거. → 클라이언트는 babel 다운로드·실시간 컴파일 0.
   소스는 계속 index.html(JSX)로 편집, 배포본만 컴파일됨(GitHub Action이 push마다 실행). */
const fs = require('fs');
const { transformSync } = require('@babel/core');

let html = fs.readFileSync('index.html', 'utf8');
const srcHtml = html; /* babel 태그 제거 前 원본 — CDN 핀 검사는 이걸로(제거되는 태그도 검사 대상) */

const m = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!m) { console.error('BUILD ERROR: <script type="text/babel"> 를 찾지 못함'); process.exit(1); }

const compiled = transformSync(m[1], {
  presets: [['@babel/preset-react', { runtime: 'classic' }]], /* React.createElement (UMD 인라인 호환, import 미방출) */
  compact: false,
  comments: false,
}).code;

/* 인라인 JSX → 컴파일된 일반 스크립트로 교체 */
html = html.replace(m[0], '<script>\n' + compiled + '\n</script>');
/* @babel/standalone CDN 제거 (이제 불필요) */
html = html.replace(/<script[^>]*@babel\/standalone[^>]*><\/script>/i, '<!-- @babel/standalone 제거: JSX는 CI에서 사전 컴파일됨 -->');

/* ★스모크 게이트(2026-07-04): 구문오류 외 '빈/깨진 빌드'를 배포 전 차단. 필수 마커·크기 검증.
   (진짜 런타임 렌더체크는 Playwright 필요=무겁고, 사전컴파일이 6/17 CDN 백지사고 근본원인을 이미 제거함.) */
const smoke = [
  [compiled.includes('React.createElement'), 'JSX가 React.createElement로 컴파일되지 않음(preset-react 실패?)'],
  [/ReactDOM\s*\.\s*render\s*\(/.test(compiled) || /createRoot\s*\(/.test(compiled), 'ReactDOM 렌더 호출이 산출물에 없음'],
  [compiled.length > 80000, '컴파일 산출물이 비정상적으로 작음(' + compiled.length + 'B) — 부분 컴파일 의심'],
  [!/type=["']text\/babel["']/.test(html), '배포본에 text/babel 스크립트가 남아있음(babel 미제거)'],
  /* ★조립기 단일화 불변식(2026-07-25·PDS §14.8 ⑥): 캘린더 URL 을 만드는 곳은 calBuildUrl **하나**여야 한다.
     둘로 갈리면 URL 예산 가드(calFitParams)가 재는 식과 실제 전송식이 어긋나 가드가 조용히 거짓말한다 —
     그 상태의 증상이 '메모 쌓이면 캘린더 동기가 며칠씩 조용히 실패'라 사람 눈으로는 못 잡는다. 주석은 comments:false 로 사라지므로 여기서 못박는다. */
  [(compiled.match(/\$\{GCAL_URL\}\?/g) || []).length === 1,
   '캘린더 URL 조립이 calBuildUrl 밖에서도 일어남(=예산 가드 전제 붕괴). ${GCAL_URL}? 는 정확히 1회여야 함'],
  /* ★CDN exact pin 불변식(2026-07-25·소유자 지시): unpkg 의 bare major URL(`react@18`)은 **버전 고정이 아니다** —
     302 + max-age=60 이라 새 릴리스가 1분 안에 전 사용자에게 자동 승급된다(exact URL 은 max-age=31536000).
     6/17 전체 백지 사고가 정확히 이 기전이었고, 그때 `@7` 로 major 만 막은 건 사고 폭을 좁힌 것이지 없앤 게 아니다.
     CI 는 npm 쪽만 exact 고정(pages.yml)하므로 **런타임 CDN 은 이 게이트가 유일한 방어**다.
     주석은 comments:false 로 사라지니 여기서 못박는다. 승급은 index.html 의 버전을 직접 올려서만. */
  /* ★SRI 구조 검사(2026-07-25): 해시 **값**이 실파일과 맞는지는 verify-sri.js(네트워크)가 보고,
     여기서는 네트워크 없이 **누락**을 잡는다 — 2겹으로 두는 이유는 verify-sri 단계가 CI 에서
     빠지거나 로컬 빌드를 그냥 돌릴 때도 최소 방어가 남게 하려는 것. */
  ...(() => {
    const tags = [...srcHtml.matchAll(/<script\b([^>]*\bsrc="https:\/\/[^"]+"[^>]*)>/g)].map(m => m[1]);
    const srcOf = (t) => (t.match(/\bsrc="([^"]+)"/) || [])[1] || '';
    const has = (t, a) => new RegExp(`\\b${a}(?:="[^"]*")?(?=[\\s>]|$)`).test(t);
    const bare = tags.map(srcOf).filter(u => !/@\d+\.\d+\.\d+(?:[-+][\w.]+)?\//.test(u) && !/\/\d+\.\d+\.\d+\//.test(u));
    const noSri = tags.filter(t => !has(t, 'integrity')).map(srcOf);
    const noCors = tags.filter(t => !has(t, 'crossorigin')).map(srcOf);
    return [
      [tags.length > 0, '외부 CDN 스크립트를 하나도 못 찾음 — 검사기가 헛돌고 있음(선택자 부패?)'],
      [bare.length === 0, 'CDN 이 exact pin 이 아님(bare major = 60초 만에 자동 승급 = 6/17 백지 기전): ' + bare.join(', ')],
      [noSri.length === 0, 'CDN 스크립트에 integrity(SRI) 없음 — CDN 침해 시 브라우저가 그대로 실행한다: ' + noSri.join(', ')],
      [noCors.length === 0, 'CDN 스크립트에 crossorigin 없음 — cross-origin SRI 가 동작하지 않아 integrity 가 무력화된다: ' + noCors.join(', ')],
    ];
  })(),
];
const failed = smoke.filter(c => !c[0]).map(c => c[1]);
if (failed.length) { console.error('BUILD SMOKE FAIL:\n - ' + failed.join('\n - ')); process.exit(1); }

fs.mkdirSync('_site', { recursive: true });
fs.writeFileSync('_site/index.html', html, 'utf8');
console.log('built _site/index.html (' + Math.round(html.length / 1024) + 'KB) — babel 제거 + 사전 컴파일 + 스모크 통과');
