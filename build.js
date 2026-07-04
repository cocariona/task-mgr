/* CI 빌드(2026-07-01): index.html의 인라인 JSX(<script type="text/babel">)를 @babel/core로 사전 컴파일해
   _site/index.html 생성 + @babel/standalone(3MB) CDN 제거. → 클라이언트는 babel 다운로드·실시간 컴파일 0.
   소스는 계속 index.html(JSX)로 편집, 배포본만 컴파일됨(GitHub Action이 push마다 실행). */
const fs = require('fs');
const { transformSync } = require('@babel/core');

let html = fs.readFileSync('index.html', 'utf8');

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
];
const failed = smoke.filter(c => !c[0]).map(c => c[1]);
if (failed.length) { console.error('BUILD SMOKE FAIL:\n - ' + failed.join('\n - ')); process.exit(1); }

fs.mkdirSync('_site', { recursive: true });
fs.writeFileSync('_site/index.html', html, 'utf8');
console.log('built _site/index.html (' + Math.round(html.length / 1024) + 'KB) — babel 제거 + 사전 컴파일 + 스모크 통과');
