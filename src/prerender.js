/* Пререндер и проверка через jsdom.
   1. Прогоняет страницу в jsdom, ловит любые ошибки JS.
   2. Проверяет, что вкладки отрисовались, а расчёты дали числа.
   3. Сериализует DOM обратно в index.html БЕЗ класса js на body — тогда файл
      читается во встроенном просмотрщике Telegram и в режиме чтения.
   4. Второй прогон проверяет, что пререндеренный файл запускается без ошибок
      и что скрипт не удвоил уже заполненные списки.

   Работает в два этапа, чтобы каждый укладывался в короткий таймаут окружения:
     node prerender.js 1   — первый прогон, проверки, запись index.html
     node prerender.js 2   — второй прогон, проверки чистоты, итог
   Без аргумента выполняются оба этапа подряд (так делает CI).
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const DIST = process.env.DIST_DIR || path.join(__dirname, 'dist');
const FILE = path.join(DIST, 'index.html');
const STAGE = process.argv[2] ? Number(process.argv[2]) : 0;   // 0 = оба этапа
const STATE = path.join(DIST, '.prerender-stage.json');

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

const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || '' });
}

// Списки, у которых сравнивается число вариантов до и после пререндера:
// если скрипт наполняет заполненный список, файл покажет всё по два раза.
const SELECTS = ['fSeries', 'fFormat', 'fPower', 'mFormat', 'mConfig', 'pnrModel',
  'discount', 'ndsRate', 'mtMaterial', 'mkTask', 'mkSize', 'gNozzle', 'cat', 'mtCat',
  'readyKind', 'gGas', 'fTable', 'fRot', 'pnrKind', 'priceMode'];

// Этап 2 работает с уже пререндеренным файлом и результатами этапа 1
let before = {}, beforeOptions = 0, src = '', first = null, doc = null;
if (STAGE === 2) {
  const saved = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  saved.checks.forEach(c => checks.push(c));
  before = saved.before;
  beforeOptions = saved.beforeOptions;
  src = fs.readFileSync(FILE, 'utf8');
} else {
  src = fs.readFileSync(FILE, 'utf8');
  first = run(src, 'первый прогон');
  doc = first.dom.window.document;
}

if (STAGE !== 2) {

check('ошибок JS нет', first.errors.length === 0, first.errors.join(' | '));
check('в строке вкладок 4 частых раздела',
  doc.querySelectorAll('#tabs button').length === 4,
  'найдено ' + doc.querySelectorAll('#tabs button').length);
check('панелей 7', doc.querySelectorAll('.panel').length === 7,
  'найдено ' + doc.querySelectorAll('.panel').length);
check('в кнопке «Разделы» все 7 разделов',
  doc.querySelectorAll('#menuList button').length === 7,
  'найдено ' + doc.querySelectorAll('#menuList button').length);
check('меню закрыто при открытии',
  !doc.getElementById('menuList').classList.contains('open'), '');
check('навигация: вкладки скруглённые и полупрозрачные',
  /\.navtabs button\{[^}]*border-radius:1[0-9]px/.test(src) &&
  /\.navtabs button\{[^}]*color-mix/.test(src), '');
check('навигация: активная вкладка залита фирменным оранжевым',
  /\.navtabs button\[aria-selected="true"\]\{[^}]*background:var\(--or\)/.test(src), '');
check('навигация: кнопка «Разделы» в фирменном цвете',
  /\.menubtn\{[^}]*color:var\(--or\)/.test(src) &&
  /\.menubtn:hover\{background:var\(--or\)/.test(src), '');
check('навигация: текст в меню компактный',
  /\.menulist button\{[^}]*font-size:13\.5px/.test(src) &&
  /\.menulist button small\{[^}]*font-size:11px/.test(src), '');


// ---- шапка: знак, имя, внешняя ссылка ----
const brand = doc.querySelector('a.brand');
check('шапка: название ЛазеркатКА',
  !!brand && /Лазеркат\s*КА/.test(brand.textContent.replace(/\s+/g, ' ')),
  brand ? brand.textContent.trim().slice(0, 60) : 'блок brand не найден');
check('шапка: знак встроен как data-URL',
  !!brand && /^data:image\/png;base64,/.test(
    (brand.querySelector('img.brand-mark') || {}).src || ''), '');
check('шапка: ссылка на lasercut.ru открывается безопасно',
  brand.getAttribute('href') === 'https://lasercut.ru/' &&
  brand.getAttribute('target') === '_blank' &&
  /noopener/.test(brand.getAttribute('rel')) &&
  /noreferrer/.test(brand.getAttribute('rel')),
  brand.getAttribute('rel'));
check('шапка: кликабельна только эмблема с названием',
  doc.querySelectorAll('header a').length === 1,
  'ссылок в шапке ' + doc.querySelectorAll('header a').length);
const manifestTxt = fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8');
check('имя приложения в заголовке и манифесте',
  /ЛазеркатКА/.test(doc.title) && /"short_name":\s*"ЛазеркатКА"/.test(manifestTxt),
  doc.title + ' | ' + (manifestTxt.match(/"short_name":[^,]*/) || [''])[0]);

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
check('тема применяется до отрисовки',
  /data-theme', 'light'/.test(src.slice(0, src.indexOf('</head>'))),
  'в head нет раннего применения темы — светлая будет мигать тёмным');
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


// ---- два варианта ТКП ----
const kpModeSelNode = doc.getElementById('kpMode');
check('ТКП: два варианта в списке',
  !!kpModeSelNode && kpModeSelNode.options.length === 2,
  kpModeSelNode ? 'вариантов ' + kpModeSelNode.options.length : 'селектор не найден');
check('ТКП: по умолчанию краткое', kpModeSelNode.value === 'short', kpModeSelNode.value);
check('ТКП: подсказка объясняет, когда какой брать',
  /Когда клиент уже всё знает/.test(textOf(doc, '#kpModeHint')),
  (textOf(doc, '#kpModeHint') || '').slice(0, 90));
const kpShort = textOf(doc, '#kpPreview');
check('ТКП краткое: разделов сверх сметы нет',
  !/Технические характеристики/.test(kpShort) && !/Преимущества/.test(kpShort), '');
check('ТКП краткое: условия идут вторым разделом',
  /2\.\s*Условия поставки/.test(textOf(doc, '#kpSecTerms')),
  textOf(doc, '#kpSecTerms'));

win.document.getElementById('kpMode').value = 'full';
win.document.getElementById('kpMode').dispatchEvent(new win.Event('change'));
const kpFull = textOf(doc, '#kpPreview');
['Что закрывает эта конфигурация', 'Комплектация', 'Технические характеристики',
  'Как пройдёт запуск', 'Преимущества'].forEach(function (sec) {
  check('ТКП полное: раздел «' + sec + '»', kpFull.indexOf(sec) >= 0, '');
});
check('ТКП полное: характеристики взяты из конфигурации в смете',
  /1500×3000/.test(kpFull) && /FSCUT3000E/.test(kpFull) && /BLT310/.test(kpFull),
  kpFull.slice(0, 200));
check('ТКП полное: предел и рабочий режим разделены',
  /Предел по таблицам режимов/.test(kpFull) && /запас не менее 30 %/.test(kpFull), '');
check('ТКП полное: нумерация статических разделов сдвинулась',
  /7\.\s*Условия поставки/.test(textOf(doc, '#kpSecTerms')) &&
  /8\.\s*Гарантия и сервис/.test(textOf(doc, '#kpSecService')),
  textOf(doc, '#kpSecTerms') + ' / ' + textOf(doc, '#kpSecService'));
check('ТКП полное: преимущества не выдуманы, а из данных',
  /Raycus серии S-CE/.test(kpFull) && /шести городах/.test(kpFull), '');
win.document.getElementById('kpMode').value = 'short';
win.document.getElementById('kpMode').dispatchEvent(new win.Event('change'));
check('ТКП: возврат к краткому убирает лишние разделы',
  !/Технические характеристики/.test(textOf(doc, '#kpPreview')), '');

// ---- выгрузка ТКП в файл (.docx): кнопки на месте, пакет собирается ----
check('файл: кнопка «Скачать ТКП для Word» есть', !!doc.getElementById('btnWord'));
check('файл: кнопка «Отправить файлом» есть', !!doc.getElementById('btnSend'));
// Blob перехватываем: нужны сами байты пакета, а blob.arrayBuffer() вернул бы промис
let docBytes = null, wordName = null, docType = null;
const RealBlob = win.Blob;
win.Blob = function (parts, opts) {
  if (parts && parts[0] && parts[0].byteLength !== undefined) docBytes = parts[0];
  docType = opts && opts.type;
  return new RealBlob(parts, opts);
};
win.URL.createObjectURL = function () { return 'blob:test'; };
win.URL.revokeObjectURL = function () {};
const origAClick = win.HTMLAnchorElement.prototype.click;
win.HTMLAnchorElement.prototype.click = function () {
  if (this.download) wordName = this.download;
};
win.document.getElementById('btnWord').click();
win.HTMLAnchorElement.prototype.click = origAClick;
win.Blob = RealBlob;

check('файл: имя с расширением .docx и вариантом',
  !!wordName && /^ТКП( краткое)? .*\.docx$/.test(wordName), 'имя «' + wordName + '»');
check('файл: тип OOXML, а не msword',
  docType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'тип «' + docType + '»');
check('файл: собраны байты пакета', !!docBytes && docBytes.length > 5000,
  docBytes ? docBytes.length + ' байт' : 'байты не получены');

// ZIP: подпись PK, конец архива, наличие обязательных частей и логотипа
const zipBuf = docBytes ? Buffer.from(docBytes) : Buffer.alloc(0);
const zipStr = zipBuf.toString('latin1');
check('файл: это ZIP-пакет (подпись PK)',
  zipBuf.length > 4 && zipBuf[0] === 0x50 && zipBuf[1] === 0x4B, '');
check('файл: центральный каталог на месте',
  zipStr.indexOf('PK\u0005\u0006') >= 0, '');
['[Content_Types].xml', 'word/document.xml', 'word/styles.xml',
  'word/_rels/document.xml.rels', 'word/media/logo.png'].forEach(function (part) {
  check('файл: внутри есть ' + part, zipStr.indexOf(part) >= 0, '');
});
check('файл: логотип уехал внутрь как PNG', zipStr.indexOf('\u0089PNG') >= 0, '');

// содержимое document.xml — извлекаем как текст (пакет пишется без сжатия)
const docXml = (function () {
  const i = zipStr.indexOf('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document');
  if (i < 0) return '';
  const j = zipStr.indexOf('</w:document>', i);
  return Buffer.from(zipStr.slice(i, j + 13), 'latin1').toString('utf8');
})();
check('файл: document.xml читается и закрыт',
  docXml.indexOf('<w:body>') >= 0 && /<\/w:document>$/.test(docXml),
  docXml.slice(0, 80));
check('файл: итог совпадает с предпросмотром',
  docXml.indexOf('2 723 650,00') >= 0 && docXml.indexOf('ИТОГО к оплате') >= 0, '');
check('файл: сумма прописью внутри',
  /Сумма прописью/.test(docXml) && /рубл/.test(docXml), '');
check('файл: срок поставки 80 раб. дней',
  /до 80 раб\. дней/.test(docXml) && /до 80 рабочих дней/.test(docXml), '');
check('файл: реквизиты и подпись поставщика',
  docXml.indexOf('7811692637') >= 0 && /Греков Е\.В\./.test(docXml), '');
check('файл: фирменные заливки в ячейках',
  (docXml.match(/w:fill="1F3A5F"/g) || []).length >= 4,
  'найдено ' + (docXml.match(/w:fill=/g) || []).length);
check('файл: логотип вставлен как рисунок',
  docXml.indexOf('<w:drawing>') >= 0 && docXml.indexOf('r:embed="rId1"') >= 0, '');
check('файл: A4 и поля 720 twips',
  /w:pgSz w:w="11906" w:h="16838"/.test(docXml) &&
  /w:pgMar w:top="720"/.test(docXml), '');
check('файл: нет незакрытых плейсхолдеров и HTML',
  !/__[A-Z_]+__/.test(docXml) && !/<table|<td|bgcolor/i.test(docXml), '');

// ---- поставщик в ТКП ----
const supSel = doc.getElementById('kpSupplier');
check('поставщик: три профиля в списке',
  !!supSel && supSel.options.length === 3,
  supSel ? 'вариантов ' + supSel.options.length : 'селектор не найден');
check('поставщик: по умолчанию СТАНКОПРОМ',
  !!supSel && supSel.value === 'stankoprom', supSel ? supSel.value : '');
const legalTxt0 = doc.getElementById('kpLegal').textContent.replace(/\s+/g, ' ');
check('поставщик: статика и скрипт дают одни реквизиты',
  legalTxt0.indexOf('ИНН/КПП 7811692637 / 781001001') >= 0 &&
  legalTxt0.indexOf('Греков Евгений Валерьевич') >= 0, legalTxt0.slice(0, 120));
win.document.getElementById('kpSupplier').value = 'lasercut_td';
win.document.getElementById('kpSupplier').dispatchEvent(new win.Event('change'));
const legalTd = doc.getElementById('kpLegal').textContent.replace(/\s+/g, ' ');
check('поставщик: смена на ТД ЛАЗЕРКАТ меняет лист',
  legalTd.indexOf('ООО «ТД ЛАЗЕРКАТ»') >= 0 && legalTd.indexOf('УНП 193382531') >= 0,
  legalTd.slice(0, 120));
check('поставщик: чужие реквизиты не подставляются',
  legalTd.indexOf('7811692637') < 0 && legalTd.indexOf('Греков') < 0,
  legalTd.slice(0, 160));
check('поставщик: подпись в листе сменилась',
  /ТД ЛАЗЕРКАТ/.test(doc.getElementById('kpSignTitle').textContent),
  doc.getElementById('kpSignTitle').textContent);
check('поставщик: про российские условия у РБ юрлица предупреждаем',
  /белорусское юрлицо/.test(doc.getElementById('supWarn').textContent),
  doc.getElementById('supWarn').textContent.slice(0, 120));
check('поставщик: незаполненное названо прямо',
  /не заполнено/.test(doc.getElementById('supWarn').textContent),
  doc.getElementById('supWarn').textContent.slice(0, 90));
win.document.getElementById('kpSupplier').value = 'stankoprom';
win.document.getElementById('kpSupplier').dispatchEvent(new win.Event('change'));

// ---- темы ----
check('тема: кнопка переключения есть', !!doc.getElementById('themeBtn'));
check('тема: по умолчанию тёмная',
  !doc.documentElement.getAttribute('data-theme'),
  'атрибут «' + doc.documentElement.getAttribute('data-theme') + '»');
win.document.getElementById('themeBtn').click();
check('тема: светлая включается атрибутом',
  doc.documentElement.getAttribute('data-theme') === 'light',
  'атрибут «' + doc.documentElement.getAttribute('data-theme') + '»');
check('тема: кнопка предлагает вернуться к тёмной',
  /Тёмная тема/.test(doc.getElementById('themeBtn').textContent),
  doc.getElementById('themeBtn').textContent);
check('тема: светлая палитра описана в CSS',
  src.indexOf('html[data-theme="light"]') >= 0, '');
check('тема: лист ТКП белый в обеих темах',
  !/html\[data-theme="light"\][^{]*\{[^}]*--kp/.test(src) &&
  src.indexOf('.kp{background:#fff') >= 0, '');
win.document.getElementById('themeBtn').click();
check('тема: возврат к тёмной снимает атрибут',
  !doc.documentElement.getAttribute('data-theme'), '');


// ---- приводы серии S: два прайса и надбавка за усиление ----
const svSelNode = doc.getElementById('fServo');
check('приводы: четыре варианта в списке',
  !!svSelNode && svSelNode.options.length === 4,
  svSelNode ? 'вариантов ' + svSelNode.options.length : 'селектор не найден');
check('приводы: по умолчанию Yaskawa стандарт',
  !!svSelNode && svSelNode.value === 'yaskawa_std', svSelNode ? svSelNode.value : '');
const svTxt0 = textOf(doc, '#servoOut');
check('приводы: карточка показывает оси и динамику',
  /0,85 кВт/.test(svTxt0) && /100 м\/мин/.test(svTxt0) && /1,2 G/.test(svTxt0),
  (svTxt0 || '').slice(0, 140));
check('приводы: комплектация под мощность названа',
  /FSCUT3000E/.test(svTxt0) && /BLT310/.test(svTxt0), (svTxt0 || '').slice(0, 200));

function setServo(id) {
  const n = win.document.getElementById('fServo');
  n.value = id;
  n.dispatchEvent(new win.Event('change'));
  return textOf(doc, '#fOut');
}
const priceYaPlus = setServo('yaskawa_plus');
check('приводы: усиленный Yaskawa = 2 867 000 + 85 000',
  priceYaPlus.indexOf('2 952 000') >= 0, priceYaPlus.slice(0, 140));
const priceBo = setServo('bochu_std');
check('приводы: Bochu стандарт берёт цену из второго прайса',
  priceBo.indexOf('2 669 000') >= 0, priceBo.slice(0, 140));
check('приводы: разница прайсов показана расчётом',
  /дешевле Yaskawa/.test(priceBo), priceBo.slice(0, 220));
const priceBoPlus = setServo('bochu_plus');
check('приводы: Bochu усиленный = 2 669 000 + 20 000',
  priceBoPlus.indexOf('2 689 000') >= 0, priceBoPlus.slice(0, 140));
// у крупных форматов надбавка Bochu другая: 40 000
win.document.getElementById('fFormat').value = '2060';
win.document.getElementById('fFormat').dispatchEvent(new win.Event('change'));
const priceBig = textOf(doc, '#fOut');
check('приводы: на 2060 надбавка Bochu 40 000 (3 422 000 + 40 000)',
  priceBig.indexOf('3 462 000') >= 0, priceBig.slice(0, 160));
const svBig = textOf(doc, '#servoOut');
check('приводы: у крупного формата свои мощности осей',
  /2×3,9 кВт/.test(svBig), (svBig || '').slice(0, 140));
setServo('yaskawa_std');
win.document.getElementById('fFormat').value = '1530';
win.document.getElementById('fFormat').dispatchEvent(new win.Event('change'));

// ---- поворотная ось: контроллер меняется ----
win.document.getElementById('fRot').value = '6-160';
win.document.getElementById('fRot').dispatchEvent(new win.Event('change'));
check('поворотная ось: ставится контроллер FSCUT3000DE-M',
  /FSCUT3000DE-M/.test(textOf(doc, '#servoOut')),
  (textOf(doc, '#servoOut') || '').slice(0, 200));
win.document.getElementById('fRot').value = '';
win.document.getElementById('fRot').dispatchEvent(new win.Event('change'));

// ---- обвязка волокна: компрессор, дымоуловитель, криоцилиндр ----
check('обвязка: пять компрессоров в списке',
  doc.querySelectorAll('#kitCompressor option').length === 5,
  'вариантов ' + doc.querySelectorAll('#kitCompressor option').length);
const compTxt = textOf(doc, '#compressorOut');
check('обвязка: характеристики компрессора показаны',
  /бар/.test(compTxt) && /л\/мин/.test(compTxt) && /ресивер/.test(compTxt),
  (compTxt || '').slice(0, 160));
check('обвязка: цена дымоуловителя из КП',
  doc.getElementById('kitExtraction').textContent.indexOf('1 380 000') >= 0,
  doc.getElementById('kitExtraction').textContent.slice(0, 120));
check('обвязка: криоцилиндр 352 300 ₽ на 30 нм³/ч',
  doc.getElementById('kitCryo').textContent.indexOf('352 300') >= 0,
  doc.getElementById('kitCryo').textContent.slice(0, 140));
win.document.getElementById('compressorAdd').click();
const smetaRows = doc.querySelectorAll('#smetaBody tr').length;
check('обвязка: компрессор добавляется в смету', smetaRows >= 2,
  'строк ' + smetaRows);
check('обвязка: компрессор идёт как опция',
  /ERSTVAK ESC-20X-500AL/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(0, 160));

// ---- обвязка и справочники живут внутри конфигуратора ----
const kitPanel = doc.getElementById('p-cfg').textContent.replace(/\s+/g, ' ');
check('обвязка: блоки внутри конфигуратора, отдельной вкладки нет',
  !doc.getElementById('p-kit') &&
  !!doc.getElementById('p-cfg').querySelector('#kitCompressor'), '');
check('обвязка: подсказка по подбору рядом с давлением',
  /винтовой, а не поршневой/.test(textOf(doc, '#compressorOut')) &&
  /16 бар/.test(textOf(doc, '#compressorOut')),
  (textOf(doc, '#compressorOut') || '').slice(0, 160));
check('обвязка: строки «Источник цены» в карточке нет',
  !/Источник цены/.test(textOf(doc, '#compressorOut')),
  (textOf(doc, '#compressorOut') || '').slice(0, 120));
check('смета: у ячеек есть подписи для мобильной вёрстки',
  (src.match(/data-label="/g) || []).length >= 5,
  'найдено ' + (src.match(/data-label="/g) || []).length);
check('смета: мобильные правила карточек в CSS',
  src.replace(/\s+/g, '').indexOf('#smetaTabletd::before{content:attr(data-label)') >= 0,
  '');
check('справочник: расход газа 6 кВт на месте',
  /21 м³/.test(kitPanel) && /0,008 м³/.test(kitPanel) && /226 м³/.test(kitPanel), '');
check('справочник: головы Boci перечислены',
  /BLT4102/.test(kitPanel) && /BLT6120/.test(kitPanel) && /BLT560/.test(kitPanel), '');
check('справочник: узлы станков из карточек',
  /Hiwin/.test(kitPanel) && /Mitsubishi/.test(kitPanel) && /BCS100/.test(kitPanel), '');
check('справочник: баллон 40 л даёт 6 м³',
  /40 л/.test(kitPanel) && /6 м³/.test(kitPanel), '');



// ---- стабилизатор ----
const stabSel = doc.getElementById('kitStab');
check('стабилизатор: в списке только модели для металлорезов',
  !!stabSel && stabSel.options.length === 8,
  stabSel ? 'вариантов ' + stabSel.options.length : 'селектор не найден');
check('стабилизатор: цены из присланного списка',
  stabSel.textContent.indexOf('117 000') >= 0 &&
  stabSel.textContent.indexOf('960 000') >= 0, '');
const stabTxt = textOf(doc, '#stabOut');
check('стабилизатор: сверяется с требованием карты готовности',
  /Требование карты готовности/.test(stabTxt) && /30 000 Вт/.test(stabTxt),
  (stabTxt || '').slice(0, 160));
check('стабилизатор: предупреждение про ВА у Ресанты',
  /полная мощность в ВА/.test(stabTxt), (stabTxt || '').slice(-160));
win.document.getElementById('stabAll').checked = true;
win.document.getElementById('stabAll').dispatchEvent(new win.Event('change'));
check('стабилизатор: галочка добавляет сварочные модели',
  doc.getElementById('kitStab').options.length === 10,
  'вариантов ' + doc.getElementById('kitStab').options.length);
win.document.getElementById('stabAll').checked = false;
win.document.getElementById('stabAll').dispatchEvent(new win.Event('change'));
// с труборезом планка выше — 50 000 Вт
win.document.getElementById('fRot').value = '6-160';
win.document.getElementById('fRot').dispatchEvent(new win.Event('change'));
check('стабилизатор: с труборезом требование поднимается до 50 000 Вт',
  /50 000 Вт/.test(textOf(doc, '#stabOut')),
  (textOf(doc, '#stabOut') || '').slice(0, 160));
check('стабилизатор: слабая модель помечена как непроходная',
  /Не проходит по мощности/.test(textOf(doc, '#stabOut')),
  (textOf(doc, '#stabOut') || '').slice(0, 200));
win.document.getElementById('fRot').value = '';
win.document.getElementById('fRot').dispatchEvent(new win.Event('change'));
win.document.getElementById('stabAdd').click();
check('стабилизатор: добавляется в смету',
  /Стабилизатор Ресанта/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(0, 200));


// ---- вкладка «Техника» ----
const techTxt = doc.getElementById('p-tech').textContent.replace(/\s+/g, ' ');
check('техника: рабочие толщины и предел разделены',
  /Рабочие толщины/.test(techTxt) && /Предел по заводским таблицам/.test(techTxt), '');
check('техника: 3 кВт — 22 мм по стали, 12 кВт — 40 мм',
  /22 мм/.test(techTxt) && /40 мм/.test(techTxt), '');
check('техника: оговорка про запас 30 % на месте',
  /запас(ом)? не менее 30 %/.test(techTxt), '');
check('техника: серии A, E, S, HARD описаны',
  /A — компактная/.test(techTxt) && /E — базовая/.test(techTxt) &&
  /S — лист и трубы/.test(techTxt) && /HARD — верх линейки/.test(techTxt), '');
check('техника: ответ «почему S дороже» есть',
  /дороже почти на миллион/.test(techTxt), '');
check('техника: труборез 220 мм круг и 6 м длина',
  /220 мм/.test(techTxt) && /6 м/.test(techTxt), '');
check('техника: фрезерные модели с массами',
  /92 кг/.test(techTxt) && /2300 кг/.test(techTxt), '');
check('техника: спорные цифры помечены, а не сглажены',
  (techTxt.match(/спорят|уточнить/g) || []).length >= 4,
  'пометок ' + (techTxt.match(/спорят|уточнить/g) || []).length);

// ---- находки прошлого аудита: проверяем, что не вернутся ----
check('чистота: примечание про компрессор не дублируется',
  (doc.getElementById('p-cfg').textContent.match(/Компрессор нужен для резки/g) || [])
    .length === 1,
  'вхождений ' + (doc.getElementById('p-cfg').textContent
    .match(/Компрессор нужен для резки/g) || []).length);
check('чистота: примечание про приводы не дублируется',
  (doc.getElementById('p-cfg').textContent
    .match(/Мощности осей, скорость и ускорение/g) || []).length === 1, '');
check('навигация: подписи вкладок берутся из SECTIONS',
  Array.from(doc.querySelectorAll('#tabs button')).every(b => b.textContent.trim()),
  '');
check('навигация: replaceState обёрнут в try',
  /try \{[\s\S]{0,120}history\.replaceState/.test(src),
  'при открытии файла с диска SecurityError валил инициализацию');
check('навигация: есть реакция на смену хеша',
  /addEventListener\('hashchange'/.test(src), '');
check('смета: подпись мобильной ячейки совпадает с заголовком',
  src.indexOf('<th>Скидка, %</th>') >= 0 && src.indexOf('data-label="Скидка, %"') >= 0,
  '');
check('мобильные правила ограничены screen',
  /@media screen and \(max-width:640px\)/.test(src), '');
check('обвязка: объём баллона взят из данных',
  /"cylinderM3":\s*6/.test(src), (src.match(/"cylinderM3":[^,]*/) || [''])[0]);
check('обвязка: границы расхода воздуха из таблицы',
  /"airDemand"/.test(src) && /"max":\s*3\.8/.test(src), '');
const cryoTxt = textOf(doc, '#cryoOut');
check('обвязка: числительное «баллонов» согласовано',
  !/\d\s+баллона в час/.test(cryoTxt) || /1,5 баллона/.test(cryoTxt),
  (cryoTxt || '').slice(0, 140));
check('обвязка: сказано, что верх таблицы расхода компрессор не закрывает',
  /Верх таблицы эта модель не закрывает/.test(textOf(doc, '#compressorOut')),
  (textOf(doc, '#compressorOut') || '').slice(-160));
check('данные: пробел по цеху для 12 кВт заявлен',
  doc.getElementById('p-data').textContent.indexOf('12 кВт и форматов 2030') >= 0, '');

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
// Всё, что натворили проверки, должно быть убрано: файл обязан открываться
// чистым. Забытый след один раз уже уезжал в выпуск — теперь список полный,
// а второй прогон ниже проверяет результат.
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
// предпросмотр ТКП: без этого в файл уезжает КП с позициями из теста
doc.getElementById('kpPreview').innerHTML = '';
// тост: класс show снимается по таймеру, которого в пререндере не будет
const toastNode = doc.getElementById('toast');
if (toastNode) {
  toastNode.className = 'toast';
  const tText = doc.getElementById('toastText');
  if (tText) tText.textContent = '';
}
doc.getElementById('saveDot').textContent = '';
// поля шапки ТКП, заполненные проверками
['kpClient', 'kpInn', 'kpNum', 'kpContact', 'kpPhone', 'kpNote', 'kpDate', 'kpTitle']
  .forEach(id => { const n = doc.getElementById(id); if (n) n.value = ''; });
doc.querySelectorAll('#supBox input').forEach(n => { n.value = ''; });
const supBoxNode = doc.getElementById('supBox');
if (supBoxNode) supBoxNode.removeAttribute('open');
const supWarnNode = doc.getElementById('supWarn');
if (supWarnNode) { supWarnNode.className = 'note'; supWarnNode.textContent = ''; }
// inline display от переключателей категорий: без JS всё должно быть видно
doc.querySelectorAll('[style]').forEach(n => {
  const st = n.getAttribute('style') || '';
  if (/display\s*:\s*none/.test(st) && n.id !== 'jsonOut' && n.id !== 'supBox') {
    const left = st.replace(/display\s*:\s*none;?/g, '').trim();
    if (left) n.setAttribute('style', left); else n.removeAttribute('style');
  }
});
// селекторы и чекбоксы — в исходное состояние
doc.getElementById('cat').value = 'fiber';
doc.getElementById('mtCat').value = 'fiber';
doc.getElementById('kpSupplier').value = 'stankoprom';
doc.getElementById('kpTerm').value = 'order';
doc.getElementById('priceMode').value = 'order';
const mk = doc.getElementById('mkSize');
if (mk) mk.removeAttribute('disabled');
doc.querySelectorAll('input[type=checkbox]').forEach(n => { n.checked = false; });
doc.documentElement.removeAttribute('data-theme');
try { win.localStorage.clear(); } catch (e) {}

// Сколько вариантов в каждом списке было после первого прогона.

// Во втором прогоне должно быть столько же: если скрипт наполняет список,
// не очистив его, пререндеренный файл покажет всё по два раза.
SELECTS.forEach(id => {
  const n = doc.getElementById(id);
  before[id] = n ? n.querySelectorAll('option').length : -1;
});
beforeOptions = doc.querySelectorAll('#mOptions details').length;

const out = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
fs.writeFileSync(FILE, out, 'utf8');
}   // конец первого этапа

const outSrc = STAGE === 2 ? src : fs.readFileSync(FILE, 'utf8');

if (STAGE === 1) {
  fs.writeFileSync(STATE, JSON.stringify({ checks, before, beforeOptions }), 'utf8');
  console.log('Этап 1 пройден: проверок ' + checks.length +
    ', файл записан (' + Math.round(fs.statSync(FILE).size / 1024) + ' КБ)');
  const bad1 = checks.filter(c => !c.ok);
  bad1.forEach(c => console.log('  ОШИБКА  ' + c.name +
    (c.detail ? '\n             ' + c.detail : '')));
  try { first.dom.window.close(); } catch (e) {}
  process.exit(bad1.length ? 1 : 0);
}

// ---- второй прогон: пререндеренный файл должен работать ----
const second = run(fs.readFileSync(FILE, 'utf8'), 'второй прогон');
const doc2 = second.dom.window.document;
check('пререндер: ошибок JS нет', second.errors.length === 0, second.errors.join(' | '));
check('пререндер: контент читается без скриптов',
  !/class="[^"]*\bjs\b/.test(outSrc.slice(0, outSrc.indexOf('<nav'))),
  'на body остался класс js');
check('пререндер: заголовки для режима без JS на месте',
  doc2.querySelectorAll('.nojs-title').length === 7,
  'найдено ' + doc2.querySelectorAll('.nojs-title').length);
check('пререндер: цены всё ещё в файле', outSrc.indexOf('2 867 000') >= 0);
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

// ---- в выпущенном файле не должно остаться следов проверок ----
// Ищем только в разметке: слова вроде «Добавлено:» есть и в коде скрипта,
// а placeholder «ООО «Ромашка»» — штатная подсказка поля.
const markup = outSrc
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/placeholder="[^"]*"/gi, '');
check('чистота: тост не висит на экране',
  !/class="toast show"/.test(markup) && !/Добавлено:/.test(markup),
  (markup.match(/class="toast[^"]*"|.{0,20}Добавлено:.{0,20}/) || [''])[0]);
check('чистота: в файле предпросмотр ТКП пуст',
  /id="kpPreview"><\/div>/.test(markup.replace(/\s+/g, ' ')),
  (markup.match(/id="kpPreview">[\s\S]{0,80}/) || [''])[0]);
check('чистота: без сметы в ТКП нет чужих позиций',
  !/Wattsan S 1530/.test(doc2.getElementById('kpPreview').textContent) &&
  /Смета пуста/.test(doc2.getElementById('kpPreview').textContent),
  doc2.getElementById('kpPreview').textContent.slice(0, 90));
check('чистота: поля шапки ТКП не заполнены',
  !/Ромашка/.test(markup) && !/7801234567/.test(markup),
  (markup.match(/.{0,30}Ромашка.{0,20}|.{0,30}7801234567.{0,10}/) || [''])[0]);
check('чистота: ничего не спрятано inline-стилем',
  !/style="[^"]*display:\s*none/.test(markup.replace(/<textarea[\s\S]*?<\/textarea>/gi, '')),
  (markup.match(/id="[^"]*"[^>]*style="[^"]*display:\s*none[^"]*"/) || [''])[0]);
check('чистота: пометка «сохранено» снята',
  /id="saveDot"><\/span>/.test(markup.replace(/\s+/g, ' ')) ||
  /id="saveDot"\s*><\/span>/.test(markup),
  (markup.match(/id="saveDot"[^>]*>[^<]*/) || [''])[0]);
check('чистота: чекбоксы сняты',
  !/type="checkbox"[^>]*checked/.test(markup) &&
  !/checked[^>]*type="checkbox"/.test(markup), '');
check('чистота: тема тёмная по умолчанию',
  !/data-theme=/.test(markup.slice(markup.indexOf('<html'), markup.indexOf('<head'))), '');
check('чистота: реквизиты в форме не затёрты пустыми',
  doc2.getElementById('kpLegal').textContent.indexOf('7811692637') >= 0,
  'в подвале листа нет ИНН СТАНКОПРОМ');

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
try { fs.unlinkSync(STATE); } catch (e) { /* этап 1 не запускался отдельно */ }
// Явный выход: в окнах jsdom остаются таймеры (тост, отзыв blob-URL), из-за них
// процесс висел до внешнего таймаута, а вывод терялся в буфере.
try { if (first) first.dom.window.close(); } catch (e) {}
try { second.dom.window.close(); } catch (e) {}
process.exit(bad ? 1 : 0);
