/* Пререндер и проверка через jsdom.
   1. Прогоняет страницу в jsdom, ловит любые ошибки JS.
   2. Проверяет, что вкладки отрисовались, а расчёты дали числа.
   3. Сериализует DOM обратно в index.html БЕЗ класса js на body — тогда файл
      читается во встроенном просмотрщике Telegram и в режиме чтения.
   4. Второй прогон проверяет, что пререндеренный файл запускается без ошибок
      и что скрипт не удвоил уже заполненные списки.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const DIST = process.env.DIST_DIR || path.join(__dirname, 'dist');
const FILE = path.join(DIST, 'index.html');

function run(html, label) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://local.invalid/index.html',
    virtualConsole: vc,
    pretendToBeVisual: true,
  });
  return { dom, errors, label };
}

function textOf(doc, sel) {
  const n = doc.querySelector(sel);
  return n ? n.textContent.replace(/\s+/g, ' ').trim() : null;
}

const src = fs.readFileSync(FILE, 'utf8');
const first = run(src, 'первый прогон');
const doc = first.dom.window.document;

const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
}

check('ошибок JS нет', first.errors.length === 0, first.errors.join(' | '));
check('вкладок 6', doc.querySelectorAll('#tabs button').length === 6,
  'найдено ' + doc.querySelectorAll('#tabs button').length);
check('панелей 6', doc.querySelectorAll('.panel').length === 6,
  'найдено ' + doc.querySelectorAll('.panel').length);

// конфигуратор волокна посчитал цену
const fOut = textOf(doc, '#fOut');
check('волокно: цена отрисована', fOut && /\d/.test(fOut), (fOut || '').slice(0, 90));
check('волокно: S 1530 3000W = 2 867 000 ₽',
  fOut && fOut.indexOf('2 867 000') >= 0, (fOut || '').slice(0, 120));

// порядок форматов не должен ломаться из-за числовых ключей объекта
const mFmts = Array.from(doc.querySelectorAll('#mFormat option')).map(o => o.value);
check('фрезерные: порядок форматов от 0404 до 2060',
  mFmts.join(',') === '0404,0609,6090,1313,1325,1616,1625,1630,2030,2040,2060',
  mFmts.join(','));
const fFmts = Array.from(doc.querySelectorAll('#fFormat option')).map(o => o.value);
check('волокно: порядок форматов', fFmts.join(',') === '1530,1560,2030,2040,2060',
  fFmts.join(','));

// фрезерный посчитал две цены
const mOut = textOf(doc, '#mOut');
check('фрезерный: две цены', mOut && /225 000/.test(mOut) && /249 800/.test(mOut),
  (mOut || '').slice(0, 120));

// подбор мощности и подбор фрезерного
const matchOut = textOf(doc, '#matchOut');
check('подбор волокна: результат есть', matchOut && matchOut.length > 40,
  (matchOut || '').slice(0, 110));
const mkTasks = doc.querySelectorAll('#mkTask option').length;
check('подбор фрезерного: 8 задач', mkTasks === 8, 'найдено ' + mkTasks);
const mmOut = textOf(doc, '#matchMillOut');
check('подбор фрезерного: результат есть',
  mmOut && doc.querySelectorAll('#matchMillOut .rec').length >= 1,
  (mmOut || '').slice(0, 110));

// готовность цеха
const readyOut = textOf(doc, '#readyOut');
check('цех: блокеры посчитаны', readyOut && /блокеров/.test(readyOut),
  (readyOut || '').slice(0, 110));
check('цех: пунктов 10', doc.querySelectorAll('#readyList .chk').length === 10,
  'найдено ' + doc.querySelectorAll('#readyList .chk').length);

// газ
const gasOut = textOf(doc, '#gasOut');
check('газ: расход посчитан', gasOut && /баллон/.test(gasOut), (gasOut || '').slice(0, 110));

// статические таблицы на месте
const rows = doc.querySelectorAll('table tbody tr').length;
check('строк в статических таблицах больше 250', rows > 250, 'найдено ' + rows);

// прайс попал в файл целиком
check('волокно: 10 237 000 ₽ в прайсе', src.indexOf('10 237 000') >= 0);
check('фрезерные: 2 207 900 ₽ в прайсе', src.indexOf('2 207 900') >= 0);
check('нет незаменённых плейсхолдеров', !/__[A-Z_]+__/.test(src),
  (src.match(/__[A-Z_]+__/g) || []).join(','));
check('нет внешних скриптов', !/<script[^>]+src=/i.test(src));
check('нет ссылок на CDN', !/https?:\/\/(cdn|unpkg|ajax|fonts)/i.test(src));
check('noindex на месте', /name="robots"[^>]+noindex/.test(src));
// опечатки: в тексте не должно быть символов вне латиницы и кириллицы
const alien = src.match(/[ᄀ-ᇿ぀-ヿ一-鿿가-힯]/g);
check('нет случайных иероглифов и хангыля', !alien,
  alien ? 'найдено: ' + alien.join(' ') : '');

// ---- проверка расчёта сметы через реальный интерфейс ----
const win = first.dom.window;
win.document.getElementById('fAdd').click();
win.document.getElementById('discount').value = '50';   // 5 %
win.document.getElementById('discount').dispatchEvent(new win.Event('change'));
const totals = textOf(doc, '#totals');
const propis = textOf(doc, '#propis');
const checkBlock = textOf(doc, '#checkBlock');
check('смета: позиция добавилась', doc.querySelectorAll('#smetaBody tr').length === 1,
  'строк ' + doc.querySelectorAll('#smetaBody tr').length);
check('смета: скидка 5 % от 2 867 000 = 2 723 650',
  totals && totals.indexOf('2 723 650,00') >= 0, (totals || '').slice(0, 200));
check('смета: выгода 143 350', totals && totals.indexOf('143 350,00') >= 0);
check('смета: сумма прописью есть', propis && /рубл/.test(propis),
  (propis || '').slice(0, 120));
check('смета: сходимость подтверждена',
  checkBlock && /Сходимость проверена/.test(checkBlock), (checkBlock || '').slice(0, 160));

// повторное добавление не должно плодить строки
win.document.getElementById('fAdd').click();
check('смета: дубль слился в одну строку',
  doc.querySelectorAll('#smetaBody tr').length === 1,
  'строк ' + doc.querySelectorAll('#smetaBody tr').length);

const kp = textOf(doc, '#kpPreview');
check('ТКП: предпросмотр собрался', kp && /ИТОГО к оплате/.test(kp), (kp || '').slice(0, 120));
check('ТКП: гарантия взята из данных', kp && kp.indexOf('12 месяцев') >= 0,
  (kp || '').slice(0, 160));

// Печать: правило @media print скрывает соседей .kpstep, поэтому предпросмотр
// обязан лежать ВНУТРИ .kpstep, а сам .kpstep — быть прямым ребёнком панели.
const kpStep = doc.querySelector('#p-smeta > .kpstep');
check('печать: блок ТКП — прямой ребёнок панели', !!kpStep,
  'не найден #p-smeta > .kpstep');
check('печать: предпросмотр лежит внутри .kpstep',
  !!(kpStep && kpStep.querySelector('#kpPreview')),
  'предпросмотр вне .kpstep — на печать уйдёт пустой лист');
check('печать: правило скрытия соседей на месте',
  src.indexOf('.printme>*:not(.kpstep)') >= 0,
  'в CSS нет .printme>*:not(.kpstep)');

// ---- фирменное оформление печатного листа (мастер-шаблон lasercut-kp) ----
const kpDoc = doc.getElementById('kpDoc');
const kpDocTxt = kpDoc ? kpDoc.textContent.replace(/\s+/g, ' ') : '';
check('ТКП: титульная плашка на месте',
  /ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ/.test(kpDocTxt), kpDocTxt.slice(0, 90));
check('ТКП: логотип встроен в лист',
  !!(kpDoc && /^data:image\/png;base64,/.test(
    (kpDoc.querySelector('img.kp-logo') || {}).src || '')),
  'нет img.kp-logo с data-URL');
check('ТКП: разделы 1-2-3 пронумерованы',
  /1\.\s*Смета поставки/.test(kpDocTxt) && /2\.\s*Условия поставки/.test(kpDocTxt) &&
  /3\.\s*Гарантия и сервис/.test(kpDocTxt), kpDocTxt.slice(0, 200));
check('ТКП: реквизиты СТАНКОПРОМ в подвале',
  kpDocTxt.indexOf('7811692637') >= 0 && /Греков Евгений Валерьевич/.test(kpDocTxt),
  'нет ИНН или ФИО директора');
check('ТКП: фирменная палитра шаблона в CSS',
  src.indexOf('#1f3a5f') >= 0 && src.indexOf('#dce8f4') >= 0,
  'нет 1F3A5F или DCE8F4');
check('печать: лист A4 с полями 12,7 мм',
  /@page\{size:A4;margin:12\.7mm\}/.test(src.replace(/\s+/g, '')),
  'нет @page A4 margin 12.7mm');
check('печать: заливки не выцветают',
  /print-color-adjust:exact/.test(src), 'нет print-color-adjust:exact');

// ---- срок поставки: 80 рабочих дней, старых 60 в файле быть не должно ----
check('срок: плашка-резюме показывает до 80 раб. дней',
  /до 80 раб\. дней/.test(kpDocTxt), kpDocTxt.slice(0, 200));
check('срок: раздел условий печатает 80 рабочих дней',
  /до 80 рабочих дней с даты оплаты/.test(kpDocTxt), '');
check('срок: старых «60 дней» в файле нет',
  !/(около\s*60|60\s*дней)/.test(src), (src.match(/.{0,30}60 дней.{0,20}/) || [''])[0]);
win.document.getElementById('kpTerm').value = 'stock';
win.document.getElementById('kpTerm').dispatchEvent(new win.Event('change'));
check('срок: переключение на склад меняет строку условий',
  /1–3 рабочих дня/.test(doc.getElementById('kpTermVal').textContent),
  doc.getElementById('kpTermVal').textContent);
win.document.getElementById('kpTerm').value = 'order';
win.document.getElementById('kpTerm').dispatchEvent(new win.Event('change'));

// Согласование числительных: «122 конфигураций» — ошибка, нужно «122 конфигурации»
const badPlural = (src.match(/\b\d*[02-9][2-4]\s+конфигураций/g) || []);
check('язык: согласование «конфигурации» с числом', badPlural.length === 0,
  badPlural.join(', '));

// Скидка по умолчанию не должна падать на услуги
win.document.getElementById('cat').value = 'milling';
win.document.getElementById('cat').dispatchEvent(new win.Event('change'));
win.document.getElementById('pnrAdd').click();
const srvRow = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Услуга/.test(r.textContent))[0];
const srvDisc = srvRow ? srvRow.querySelectorAll('input')[1].value : null;
check('смета: услуга по умолчанию без скидки при общей 5 %', srvDisc === '0',
  'в строке услуги скидка «' + srvDisc + '»');
const eqRow = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Оборудование/.test(r.textContent))[0];
const eqDisc = eqRow ? eqRow.querySelectorAll('input')[1].value : null;
check('смета: у оборудования общая скидка 5 % применилась', eqDisc === '5',
  'в строке оборудования скидка «' + eqDisc + '»');
check('смета: предел построчной скидки равен общему',
  eqRow && eqRow.querySelectorAll('input')[1].getAttribute('max') === '30',
  'max=«' + (eqRow ? eqRow.querySelectorAll('input')[1].getAttribute('max') : '?') + '»');

// ---- пререндер: снимаем класс js, чтобы без скриптов было видно всё ----
doc.body.classList.remove('js');
doc.body.classList.remove('demo');
doc.querySelectorAll('.panel').forEach(p => p.classList.remove('active', 'printme'));
doc.getElementById('smetaBody').innerHTML = '';
doc.getElementById('totals').innerHTML = '';
doc.getElementById('propis').innerHTML = '';
doc.getElementById('checkBlock').innerHTML = '';
doc.getElementById('checkBlock').className = '';
doc.getElementById('smetaBadge').textContent = '';
doc.getElementById('jsonOut').value = '';
doc.getElementById('discount').value = '0';
try { win.localStorage.clear(); } catch (e) {}

// Сколько вариантов в каждом списке было после первого прогона.
// Во втором прогоне должно быть столько же: если скрипт наполняет список,
// не очистив его, пререндеренный файл покажет всё по два раза.
const SELECTS = ['fSeries', 'fFormat', 'fPower', 'mFormat', 'mConfig', 'pnrModel',
  'discount', 'ndsRate', 'mtMaterial', 'mkTask', 'mkSize', 'gNozzle', 'cat', 'mtCat',
  'readyKind', 'gGas', 'fTable', 'fRot', 'pnrKind', 'priceMode'];
const before = {};
SELECTS.forEach(id => {
  const n = doc.getElementById(id);
  before[id] = n ? n.querySelectorAll('option').length : -1;
});
const beforeOptions = doc.querySelectorAll('#mOptions details').length;

const out = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
fs.writeFileSync(FILE, out, 'utf8');

// ---- второй прогон: пререндеренный файл должен работать ----
const second = run(fs.readFileSync(FILE, 'utf8'), 'второй прогон');
const doc2 = second.dom.window.document;
check('пререндер: ошибок JS нет', second.errors.length === 0, second.errors.join(' | '));
check('пререндер: контент читается без скриптов',
  !/class="[^"]*\bjs\b/.test(out.slice(0, out.indexOf('<nav'))),
  'на body остался класс js');
check('пререндер: заголовки для режима без JS на месте',
  doc2.querySelectorAll('.nojs-title').length === 6,
  'найдено ' + doc2.querySelectorAll('.nojs-title').length);
check('пререндер: цены всё ещё в файле', out.indexOf('2 867 000') >= 0);
check('пререндер: смета пуста при открытии',
  doc2.querySelectorAll('#smetaBody tr').length === 0,
  'строк ' + doc2.querySelectorAll('#smetaBody tr').length);
check('пререндер: бейдж вкладки чистый',
  (doc2.getElementById('smetaBadge').textContent || '') === '',
  'бейдж "' + doc2.getElementById('smetaBadge').textContent + '"');

const dup = [];
SELECTS.forEach(id => {
  const n = doc2.getElementById(id);
  const now = n ? n.querySelectorAll('option').length : -1;
  if (now !== before[id]) dup.push(id + ': было ' + before[id] + ', стало ' + now);
});
check('пререндер: списки не удвоились', dup.length === 0, dup.join(' | '));
check('пререндер: блоки опций не удвоились',
  doc2.querySelectorAll('#mOptions details').length === beforeOptions,
  'было ' + beforeOptions + ', стало ' + doc2.querySelectorAll('#mOptions details').length);

// ---- вывод ----
let bad = 0;
console.log('Проверка сборки через jsdom\n');
checks.forEach(c => {
  if (!c.ok) bad++;
  console.log((c.ok ? '  ок    ' : '  ОШИБКА') + '  ' + c.name +
    (c.ok || !c.detail ? '' : '\n             ' + c.detail));
});
console.log('\nПройдено ' + (checks.length - bad) + ' из ' + checks.length);
console.log('Размер index.html: ' + Math.round(fs.statSync(FILE).size / 1024) + ' КБ');
if (bad) process.exit(1);
