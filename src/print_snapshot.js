/* Снимок печатной версии для глазной проверки.
   Запускает собранный index.html в jsdom, наполняет смету и шапку ТКП,
   включает режим печати (класс printme) и сохраняет получившийся HTML.
   Дальше файл рендерится в PDF (WeasyPrint) и просматривается страницами.
   В сборку не входит: инструмент проверки, не часть приложения. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'dist', 'index.html');
const OUT = process.argv[2] || '/tmp/print.html';

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously' });
const d = dom.window.document;

// две позиции оборудования, опция и услуга — чтобы увидеть группы и итоги
d.getElementById('fAdd').click();
const optBtn = d.querySelector('#mOptions button');
if (optBtn) optBtn.click();
const pnrBtn = d.getElementById('pnrAdd');
if (pnrBtn) pnrBtn.click();
d.getElementById('discount').value = '50';
d.getElementById('discount').dispatchEvent(new dom.window.Event('change'));

function set(id, v) {
  const n = d.getElementById(id);
  if (!n) return;
  n.value = v;
  n.dispatchEvent(new dom.window.Event('input'));
}
set('kpClient', 'ООО «Ромашка»');
set('kpInn', '7801234567');
set('kpNum', '1207');
set('kpContact', 'Иван Петров');
set('kpPhone', '+7 900 000-00-00');

d.getElementById('p-smeta').classList.add('printme');
fs.writeFileSync(OUT, '<!doctype html>' + d.documentElement.outerHTML, 'utf8');
console.log('снимок готов:', OUT,
  Math.round(fs.statSync(OUT).size / 1024) + ' КБ',
  '· строк сметы:', d.querySelectorAll('#smetaBody tr').length);
