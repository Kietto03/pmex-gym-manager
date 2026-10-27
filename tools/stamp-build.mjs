// Stamps index.html with a build id so a browser never mixes old and new files after a deploy.
//   node tools/stamp-build.mjs            (the deploy workflow runs it; locally nothing needs it)
// GitHub Pages lets browsers keep files for 10 minutes. The page loads about 15 separate modules, so right after a push
// someone could run a new main.js on an old core.js. Every module is mapped to the same ?v=<commit> address instead,
// and the style sheet, config and main script carry it too.
import fs from 'node:fs';
import path from 'node:path';

const v = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 8);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const files = walk('src').map(f => f.split(path.sep).join('/')).sort();
const imports = Object.fromEntries(files.map(f => [`./${f}`, `./${f}?v=${v}`]));
let html = fs.readFileSync('index.html', 'utf8');
const map = `<!--importmap--><script type="importmap">${JSON.stringify({ imports })}</script><!--/importmap-->`;
if (!html.includes('<!--importmap-->')) throw new Error('index.html has no <!--importmap--> marker');
html = html.replace(/<!--importmap-->[\s\S]*?<!--\/importmap-->/, map)
  .replace(/styles\.css(\?v=[\w]+)?/, `styles.css?v=${v}`)
  .replace(/src="config\.js(\?v=[\w]+)?"/, `src="config.js?v=${v}"`)
  .replace(/src="src\/main\.js(\?v=[\w]+)?"/, `src="src/main.js?v=${v}"`);
fs.writeFileSync('index.html', html);
console.log(`build ${v}: ${files.length} modules mapped`);
