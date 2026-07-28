/* Снимок выгрузки ТКП в файл для Word — для глазной проверки.
   Наполняет смету, нажимает «Скачать ТКП для Word», перехватывает Blob
   и сохраняет его содержимое на диск. Дальше файл открывается в LibreOffice
   и рендерится в PDF. В сборку не входит: инструмент проверки. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'dist', 'index.html');
const OUT = process.argv[2] || '/tmp/kp.doc';

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously' });
const w = dom.window;
const d = w.document;

// jsdom не умеет createObjectURL — подменяем и ловим содержимое
let captured = null;
let fileName = null;
w.URL.createObjectURL = function (blob) { captured = blob; return 'blob:test'; };
w.URL.revokeObjectURL = function () {};
const origClick = w.HTMLAnchorElement.prototype.click;
w.HTMLAnchorElement.prototype.click = function () {
  if (this.download) fileName = this.download;
  return origClick ? undefined : undefined;
};

d.getElementById('fAdd').click();
const optBtn = d.querySelector('#mOptions button');
if (optBtn) optBtn.click();
d.getElementById('pnrAdd').click();
d.getElementById('discount').value = '50';
d.getElementById('discount').dispatchEvent(new w.Event('change'));

function set(id, v) {
  const n = d.getElementById(id);
  n.value = v;
  n.dispatchEvent(new w.Event('input'));
}
set('kpClient', 'ООО «Ромашка»');
set('kpInn', '7801234567');
set('kpNum', '1207');
set('kpContact', 'Иван Петров');
set('kpPhone', '+7 900 000-00-00');

d.getElementById('btnWord').click();

if (!captured) {
  console.error('Blob не перехвачен — кнопка ничего не сформировала');
  process.exit(1);
}
captured.text().then(text => {
  fs.writeFileSync(OUT, text, 'utf8');
  console.log('файл готов:', OUT, Math.round(Buffer.byteLength(text) / 1024) + ' КБ');
  console.log('имя файла:', fileName);
  console.log('таблиц в документе:', (text.match(/<table/g) || []).length);
  console.log('логотип:', /src="data:image\/png;base64,/.test(text) ? 'встроен' : 'НЕТ');
  console.log('внешних ссылок:', (text.match(/https?:\/\//g) || []).length);
});
