/* Снимок выгрузки ТКП в .docx — для проверки валидатором и глазами.
   Наполняет смету и шапку, нажимает «Скачать ТКП для Word», перехватывает
   байты пакета и пишет их на диск. Дальше файл проверяется validate.py
   и рендерится LibreOffice в PDF. В сборку не входит: инструмент проверки.
   Аргументы: <путь к .docx> [id поставщика] */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'dist', 'index.html');
const OUT = process.argv[2] || '/tmp/kp.docx';
const SUP = process.argv[3] || '';

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously' });
const w = dom.window;
const d = w.document;

let bytes = null, fileName = null, mime = null;
const RealBlob = w.Blob;
w.Blob = function (parts, opts) {
  if (parts && parts[0] && parts[0].byteLength !== undefined) bytes = parts[0];
  mime = opts && opts.type;
  return new RealBlob(parts, opts);
};
w.URL.createObjectURL = function () { return 'blob:test'; };
w.URL.revokeObjectURL = function () {};
w.HTMLAnchorElement.prototype.click = function () {
  if (this.download) fileName = this.download;
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

if (SUP) {
  d.getElementById('kpSupplier').value = SUP;
  d.getElementById('kpSupplier').dispatchEvent(new w.Event('change'));
}

d.getElementById('btnWord').click();

if (!bytes) {
  console.error('байты пакета не перехвачены');
  process.exit(1);
}
fs.writeFileSync(OUT, Buffer.from(bytes));
console.log('файл готов:', OUT, Math.round(bytes.length / 1024) + ' КБ');
console.log('имя файла:', fileName);
console.log('MIME:', mime);
console.log('поставщик:', d.getElementById('kpSupplier').value);
// jsdom держит таймеры (тост, отзыв blob-URL) — выходим сами, иначе процесс висит
w.close();
process.exit(0);
