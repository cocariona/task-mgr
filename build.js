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

fs.mkdirSync('_site', { recursive: true });
fs.writeFileSync('_site/index.html', html, 'utf8');
console.log('built _site/index.html (' + Math.round(html.length / 1024) + 'KB) — babel 제거 + 사전 컴파일 완료');
