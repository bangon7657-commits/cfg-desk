/* Снимок экранного вида для проверки тем.
   Открывает собранный файл в jsdom, при аргументе light включает светлую тему,
   раскрывает нужную вкладку и сохраняет HTML со снятыми правилами @media print —
   чтобы рендер в PDF показал именно экранный вид, а не печатный лист.
   В сборку не входит: инструмент проверки.
   Аргументы: <путь к html> [light|dark] [вкладка] */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// DIST_DIR позволяет запускать скрипт из другой папки: node_modules
// в смонтированном каталоге резолвится очень медленно
const DIST = process.env.DIST_DIR || path.join(__dirname, 'dist');
const FILE = path.join(DIST, 'index.html');
const OUT = process.argv[2] || '/tmp/theme.html';
const THEME = process.argv[3] || 'dark';
const TAB = process.argv[4] || 'smeta';

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously' });
const w = dom.window;
const d = w.document;

d.getElementById('fAdd').click();
d.getElementById('discount').value = '50';
d.getElementById('discount').dispatchEvent(new w.Event('change'));
if (THEME === 'light') d.getElementById('themeBtn').click();

// вкладка: часть разделов живёт только в кнопке «Разделы», поэтому ищем и там
Array.prototype.forEach.call(
  d.querySelectorAll('#tabs button, #menuList button'), function (b) {
    if (b.getAttribute('data-t') === TAB) b.click();
  });

let html = '<!doctype html>' + d.documentElement.outerHTML;
// печатные правила мешают: снимаем весь блок @media print
const i = html.indexOf('@media print{');
if (i > 0) {
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}') { depth--; if (!depth) { j = k; break; } }
  }
  html = html.slice(0, i) + html.slice(j + 1);
}
// панели без JS показываются подряд — оставляем только нужную
html = html.replace('</style>',
  'body.js .panel{display:none}body.js .panel.active{display:block}</style>');
fs.writeFileSync(OUT, html, 'utf8');
console.log('снимок:', OUT, THEME, TAB,
  Math.round(fs.statSync(OUT).size / 1024) + ' КБ');
w.close();
process.exit(0);
