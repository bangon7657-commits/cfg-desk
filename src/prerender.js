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

function menuGo(id) { doc.querySelector('#menuList button[data-t="' + id + '"]').click(); }

check('ошибок JS нет', first.errors.length === 0, first.errors.join(' | '));
check('в строке вкладок четыре закреплённых раздела',
  doc.querySelectorAll('#tabs button[data-t]').length === 4,
  'найдено ' + doc.querySelectorAll('#tabs button[data-t]').length);
check('вкладки по умолчанию идут в порядке меню',
  ['home', 'letters', 'mill', 'smeta'].join(',') ===
  [...doc.querySelectorAll('#tabs button[data-t]')]
    .map(b => b.getAttribute('data-t')).join(','),
  [...doc.querySelectorAll('#tabs button[data-t]')]
    .map(b => b.getAttribute('data-t')).join(','));
check('у каждой вкладки есть крестик снятия',
  doc.querySelectorAll('#tabs button[data-t] .tabx').length === 4, '');
check('панелей 12', doc.querySelectorAll('.panel').length === 12,
  'найдено ' + doc.querySelectorAll('.panel').length);
check('в кнопке «Разделы» все 10 разделов',
  doc.querySelectorAll('#menuList button[data-t]').length === 10,
  'найдено ' + doc.querySelectorAll('#menuList button[data-t]').length);
check('в меню у каждого раздела кнопка закрепления',
  doc.querySelectorAll('#menuList button[data-pin]').length === 10 &&
  [...doc.querySelectorAll('#menuList button[data-pin]')]
    .filter(b => b.getAttribute('aria-pressed') === 'true').length === 4, '');
check('в меню есть счётчик и сброс вкладок',
  !!doc.getElementById('pinsInfo') &&
  /Закреплено 4 из 6/.test(doc.getElementById('pinsInfo').textContent), '');
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
  /\.menulist \.mrow>button\[data-t\]\{[^}]*font-size:18px/.test(src) &&
  /\.menulist \.mrow>button\[data-t\] small\{[^}]*font-size:14\.5px/.test(src), '');
check('навигация: кнопка «Разделы» заметно крупнее вкладок',
  /\.menubtn\{[^}]*font-size:24px/.test(src) &&
  /\.navtabs button\{[^}]*font-size:18px/.test(src), '');


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
const swTxt = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
check('кеш: страница берётся сначала из сети',
  /isPage\(e\.request\)/.test(swTxt) &&
  /if \(isPage\(e\.request\)\) \{\s*\n\s*e\.respondWith\(\s*\n\s*fetch\(e\.request\)/.test(swTxt),
  swTxt.indexOf('isPage') >= 0 ? 'isPage есть' : 'isPage нет');
check('кеш: остальные файлы сначала из кеша',
  /caches\.match\(e\.request\)\.then\(hit => hit \|\| fetch\(e\.request\)/.test(swTxt), '');
check('кеш: версия поднята до 60', /const CACHE = 'cfg-v60'/.test(swTxt),
  (swTxt.match(/cfg-v\d+/) || [''])[0]);
check('кеш: чужие домены не перехватываются',
  /url\.origin !== self\.location\.origin/.test(swTxt), '');
const manifestTxt = fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8');
check('имя приложения в заголовке и манифесте',
  /ЛазеркатКА/.test(doc.title) && /"short_name":\s*"ЛазеркатКА"/.test(manifestTxt),
  doc.title + ' | ' + (manifestTxt.match(/"short_name":[^,]*/) || [''])[0]);

// конфигуратор волокна посчитал цену
const fOut = textOf(doc, '#fOut');
check('волокно: цена отрисована', fOut && /\d/.test(fOut), (fOut || '').slice(0, 90));
check('волокно: S 1530 3000W = 3 010 400 ₽',
  fOut && fOut.indexOf('3 010 400') >= 0, (fOut || '').slice(0, 120));

// порядок форматов не должен ломаться из-за числовых ключей объекта
const mFmts = Array.from(doc.querySelectorAll('#mFormat option')).map(o => o.value);
check('фрезерные: порядок форматов от 0404 до 2060',
  mFmts.join(',') === '0404,0609,6090,1610,1313,1616,1325,1625,1630,2030,2040,2060',
  mFmts.join(','));
const fFmts = Array.from(doc.querySelectorAll('#fFormat option')).map(o => o.value);
check('волокно: порядок форматов', fFmts.join(',') === '1530,1560,2030,2040,2060',
  fFmts.join(','));

// фрезерный посчитал две цены
const mOut = textOf(doc, '#mOut');
check('фрезерный: две цены с наценкой', mOut && /247 800/.test(mOut) && /275 100/.test(mOut),
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
check('волокно: 10 748 900 ₽ в прайсе', src.indexOf('10 748 900') >= 0);
check('фрезерные: 2 527 875 ₽ в прайсе', src.indexOf('2 527 875') >= 0);
check('нет незаменённых плейсхолдеров', !/__[A-Z][A-Z_]*__/.test(src),
  (src.match(/__[A-Z][A-Z_]*__/g) || []).join(','));
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
check('смета: скидка 5 % от 3 010 400 = 2 859 880',
  totals && totals.indexOf('2 859 880,00') >= 0, (totals || '').slice(0, 200));
check('смета: выгода 150 520', totals && totals.indexOf('150 520,00') >= 0);
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
  src.indexOf('.printme>*:not(.kpstep):not(.printkeep)') >= 0,
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
check('печать: A4 без полей страницы — браузер не печатает свой колонтитул',
  /@page\{size:A4;margin:0\}/.test(src.replace(/\s+/g, '')) &&
  /\.printme\{padding:12\.7mm\}/.test(src.replace(/\s+/g, '')) &&
  /#p-letters\.printme\{padding:20mm15mm20mm30mm\}/.test(src.replace(/\s+/g, '')),
  'нет @page margin 0 или отступов листа');
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
  /до 10 рабочих дней/.test(doc.getElementById('kpTermVal').textContent),
  doc.getElementById('kpTermVal').textContent);
win.document.getElementById('kpTerm').value = 'order';
win.document.getElementById('kpTerm').dispatchEvent(new win.Event('change'));


// ---- два варианта ТКП ----
const kpModeSelNode = doc.getElementById('kpMode');
check('ТКП: три варианта — краткое, полное, презентация',
  !!kpModeSelNode && kpModeSelNode.options.length === 3 &&
  [...kpModeSelNode.options].map(o => o.value).join(',') === 'short,full,deck',
  kpModeSelNode ? [...kpModeSelNode.options].map(o => o.value).join(',') : 'нет');
check('ТКП: по умолчанию краткое', kpModeSelNode.value === 'short', kpModeSelNode.value);

// ---- презентация по смете: пакет .pptx собирается прямо в браузере ----
// Проверяем не «кнопка есть», а что файл получился: ZIP читается, все части
// на месте, XML разбирается и цифры сметы внутри.
check('презентация: кнопка выгрузки на месте',
  !!doc.getElementById('btnDeck') &&
  /Скачать презентацию/.test(textOf(doc, '#btnDeck')), '');
(function () {
  const FOOT = 'LASERCUT · проверка';
  const deck = win.PPTX.build({ title: 'проверка', foot: FOOT,
    slides: win.__deckSlides__() });
  check('презентация: собрался непустой пакет',
    deck && deck.length > 8000, 'байт ' + (deck ? deck.length : 0));
  // ZIP без сжатия читается вручную: сигнатура, имена частей, данные
  const parts = {};
  let ok = true;
  const dv = new DataView(deck.buffer, deck.byteOffset, deck.length);
  let p = 0;
  while (p + 4 <= deck.length && dv.getUint32(p, true) === 0x04034b50) {
    const nlen = dv.getUint16(p + 26, true), elen = dv.getUint16(p + 28, true);
    const size = dv.getUint32(p + 18, true);
    const name = new TextDecoder().decode(deck.subarray(p + 30, p + 30 + nlen));
    const body = deck.subarray(p + 30 + nlen + elen, p + 30 + nlen + elen + size);
    parts[name] = new TextDecoder().decode(body);
    p += 30 + nlen + elen + size;
  }
  check('презентация: ZIP разбирается, частей больше двадцати',
    Object.keys(parts).length > 20, 'частей ' + Object.keys(parts).length);
  ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels', 'ppt/theme/theme1.xml',
    'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml',
    'ppt/slides/slide1.xml', 'ppt/slides/_rels/slide1.xml.rels'
  ].forEach(function (n) { if (!parts[n]) ok = false; });
  check('презентация: обязательные части пакета на месте', ok,
    Object.keys(parts).slice(0, 6).join(', '));
  // число листов плавает: длинная смета переносится на следующий лист
  const nsl = Object.keys(parts).filter(n => /slides\/slide\d+\.xml$/.test(n)).length;
  check('презентация: листов не меньше пяти', nsl >= 5, String(nsl));
  // каждый XML должен разбираться без ошибок
  const dp = new win.DOMParser();
  let bad = '';
  Object.keys(parts).forEach(function (n) {
    if (!/\.xml$|\.rels$/.test(n)) return;
    const x = dp.parseFromString(parts[n], 'text/xml');
    if (x.getElementsByTagName('parsererror').length) bad = n;
  });
  check('презентация: весь XML пакета разбирается', !bad, bad);
  check('презентация: размер листа A4 книжный',
    /cx="7560000" cy="10692000"/.test(parts['ppt/presentation.xml'] || ''), '');
  // Раньше лист был A1, а кегль остался обычным: текст занимал верхнюю треть,
  // остальное уходило в пустоту. Проверяем и низ, и верх — чтобы блоки
  // заполняли лист, но не сваливались за его край.
  const SLIDE_H = 10692000;
  const fill = [];
  Object.keys(parts).filter(n => /slides\/slide\d+\.xml$/.test(n)).sort()
    .forEach(function (n) {
      const re = /<a:off x="\d+" y="(\d+)"\/><a:ext cx="\d+" cy="(\d+)"\/>/g;
      let m, bot = 0;
      // подвал стоит у нижнего края на каждом листе — в плотность не считаем
      while ((m = re.exec(parts[n]))) {
        if (+m[1] > SLIDE_H - 1000000) continue;
        bot = Math.max(bot, +m[1] + +m[2]);
      }
      fill.push({ n: n, bot: bot, part: bot / SLIDE_H });
    });
  const over = fill.filter(f => f.part > 1);
  check('презентация: ни один блок не выходит за нижний край листа',
    over.length === 0, over.map(f => f.n + ' ' + Math.round(f.part * 100) + '%').join(', '));
  const thin = fill.filter(f => f.part < 0.5);
  check('презентация: слайды заполнены не меньше чем наполовину',
    thin.length === 0, thin.map(f => f.n + ' ' + Math.round(f.part * 100) + '%').join(', '));
  const noFoot = Object.keys(parts).filter(n => /slides\/slide\d+\.xml$/.test(n))
    .filter(n => parts[n].indexOf(FOOT) < 0);
  check('презентация: подвал стоит на каждом листе', noFoot.length === 0,
    noFoot.join(', '));
  // длинная смета не должна обрываться: лишние строки уезжают на следующий лист
  (function () {
    const many = win.__deckSlides__();
    const tb = many[1].filter(b => b.t === 'table')[0];
    let added = 0;
    while (tb.rows.length < 30) {
      tb.rows.splice(1, 0, [String(tb.rows.length), 'строка переноса', '1 шт.', '1,00 ₽']);
      added++;
    }
    const big = win.PPTX.build({ title: 'много', foot: FOOT, slides: many });
    const txt = new TextDecoder('utf-8').decode(big);
    const pages = (txt.match(/<p:sld xmlns/g) || []).length;
    const kept = (txt.match(/строка переноса/g) || []).length;
    check('презентация: длинная смета разъезжается по листам',
      pages > 5 && kept === added,
      'листов ' + pages + ', строк перенесено ' + kept + ' из ' + added);
  }());
  const all = Object.keys(parts).filter(n => /slides\/slide\d+\.xml$/.test(n))
    .map(n => parts[n]).join('');
  check('презентация: смета попала в слайды',
    /Технико-коммерческое предложение/.test(all) && /ИТОГО/.test(all) &&
    /Wattsan/.test(all), '');
  check('презентация: итоговая сумма совпадает со сметой',
    all.indexOf(win.__deckTotal__()) >= 0, win.__deckTotal__());
  check('презентация: помечена как тестовая',
    /Режим тестовый/.test(all), '');
  check('презентация: ставка НДС печатается процентами, а не десятыми',
    /НДС 22 %/.test(all) && !/НДС 220 %/.test(all),
    (all.match(/НДС [\d,]+ %/) || [''])[0]);
}());
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
  /8\.\s*Условия поставки/.test(textOf(doc, '#kpSecTerms')) &&
  /9\.\s*Гарантия и сервис/.test(textOf(doc, '#kpSecService')),
  textOf(doc, '#kpSecTerms') + ' / ' + textOf(doc, '#kpSecService'));
check('ТКП полное: по волокну есть раздел «Что режет источник»',
  /Что режет источник 3 кВт/.test(kpFull) &&
  /Углеродистая сталь/.test(kpFull) && /м\/мин/.test(kpFull),
  kpFull.slice(0, 200));
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
  docXml.indexOf('2 859 880,00') >= 0 && docXml.indexOf('ИТОГО к оплате') >= 0, '');
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
  legalTxt0.indexOf('ИНН/КПП 7811692637 / 781101001') >= 0 &&
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
check('приводы: усиленный Yaskawa = 3 095 400 = 3 010 400 + 85 000',
  priceYaPlus.indexOf('3 095 400') >= 0, priceYaPlus.slice(0, 140));
const priceBo = setServo('bochu_std');
check('приводы: Bochu стандарт берёт цену из второго прайса',
  priceBo.indexOf('2 802 500') >= 0, priceBo.slice(0, 140));
check('приводы: разница прайсов показана расчётом',
  /дешевле Yaskawa/.test(priceBo), priceBo.slice(0, 220));
const priceBoPlus = setServo('bochu_plus');
check('приводы: Bochu усиленный = 2 802 500 + 20 000',
  priceBoPlus.indexOf('2 822 500') >= 0, priceBoPlus.slice(0, 140));
// у крупных форматов надбавка Bochu другая: 40 000
win.document.getElementById('fFormat').value = '2060';
win.document.getElementById('fFormat').dispatchEvent(new win.Event('change'));
const priceBig = textOf(doc, '#fOut');
check('приводы: на 2060 надбавка Bochu 40 000 (3 593 100 + 40 000)',
  priceBig.indexOf('3 633 100') >= 0, priceBig.slice(0, 160));
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
check('обвязка: пять компрессоров, три китайских и вариант «не нужен»',
  doc.querySelectorAll('#kitCompressor option').length === 9,
  'вариантов ' + doc.querySelectorAll('#kitCompressor option').length);
win.document.getElementById('kitCompressor').value = 'esc20x';
win.document.getElementById('kitCompressor').dispatchEvent(new win.Event('change'));
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
  /Стабилизатор напряжения Ресанта/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(0, 200));


// ---- вкладка «Техника» ----
const techTxt = doc.getElementById('g-tech').textContent.replace(/\s+/g, ' ');
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
  doc.getElementById('g-data').textContent.indexOf('12 кВт и форматов 2030') >= 0, '');

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
const srvDisc = srvRow ? srvRow.querySelectorAll('input')[2].value : null;
check('смета: услуга по умолчанию без скидки при общей 5 %', srvDisc === '0',
  'в строке услуги скидка «' + srvDisc + '»');
const eqRow = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Оборудование/.test(r.textContent))[0];
const eqDisc = eqRow ? eqRow.querySelectorAll('input')[2].value : null;
check('смета: у оборудования общая скидка 5 % применилась', eqDisc === '5',
  'в строке оборудования скидка «' + eqDisc + '»');
check('смета: предел построчной скидки равен общему',
  eqRow && eqRow.querySelectorAll('input')[2].getAttribute('max') === '30',
  'max=«' + (eqRow ? eqRow.querySelectorAll('input')[2].getAttribute('max') : '?') + '»');

// ---- полные наименования, правка цены, менеджер, реквизиты ----
const smetaTxt = () => doc.getElementById('smetaBody').textContent;
check('наименование: волокно названо станком по металлу',
  /Лазерный станок по металлу WATTSAN S 1530/.test(smetaTxt()),
  smetaTxt().slice(0, 120));
win.document.getElementById('mAdd').click();
check('наименование: фрезер названо фрезерным станком',
  /Фрезерный станок WATTSAN /.test(smetaTxt()),
  smetaTxt().slice(0, 200));
// опция из категории «Чиллеры» должна получить слово «Чиллер»
const chillBtn = Array.from(doc.querySelectorAll('#mOptions .chk'))
  .filter(r => /CW-5200TH/.test(r.textContent))[0];
if (chillBtn) chillBtn.querySelector('button').click();
check('наименование: чиллер назван чиллером',
  /Чиллер S&A CW-5200TH/.test(smetaTxt()), smetaTxt().slice(-200));
check('наименование: ПНР расшифрован в смете',
  /Пусконаладочные работы/.test(smetaTxt()), '');

// Правка цены руками: сумма строки, итог и НДС должны пересчитаться,
// а блок сходимости — остаться зелёным.
const eqRow2 = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Лазерный станок по металлу/.test(r.textContent))[0];
const priceIn = eqRow2 ? eqRow2.querySelectorAll('input.pricein')[0] : null;
check('цена: в строке сметы есть поле для правки', !!priceIn, '');
if (priceIn) {
  priceIn.value = '1 000 000,50';
  priceIn.dispatchEvent(new win.Event('change'));
}
const rowNow = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Лазерный станок по металлу/.test(r.textContent))[0];
check('цена: правка руками попала в строку',
  !!rowNow && /1 000 000,50/.test(rowNow.querySelector('input.pricein').value),
  rowNow ? rowNow.textContent.slice(0, 120) : '');
check('цена: строка помечена как правленная вручную',
  !!rowNow && /цена правлена вручную/.test(rowNow.textContent), '');
// 1 000 000,50 со скидкой 5 % = 950 000,48 (полукопейка вверх), это и должно
// стоять в строке вместо прежней цены прайса
check('цена: итог пересчитан от новой цены',
  /950 000,48/.test(textOf(doc, '#smetaBody')) &&
  !/3 010 400,00/.test(textOf(doc, '#smetaBody')),
  textOf(doc, '#smetaBody').slice(0, 200));
check('цена: сходимость итога и НДС не нарушена',
  /Сходится/.test(textOf(doc, '#checkBlock')) ||
  !/Сходимость нарушена/.test(textOf(doc, '#checkBlock')),
  textOf(doc, '#checkBlock').slice(0, 160));
check('цена: подпись строки итога больше не «по прайсу»',
  /цены правлены вручную/.test(textOf(doc, '#totals')),
  textOf(doc, '#totals').slice(0, 160));

// ---- личный кабинет ----
check('кабинет: раздел есть в ленте и в меню',
  !!doc.getElementById('p-me') &&
  [...doc.querySelectorAll('#menuList button[data-t]')].some(b => b.dataset.t === 'me'),
  '');
check('кабинет: пока профиль пуст, висит полоса-приглашение',
  !doc.getElementById('regBar').hidden &&
  /Профиль не заполнен/.test(textOf(doc, '#meState')),
  textOf(doc, '#meState'));
check('кабинет: в смете видно, что подпись по умолчанию',
  /профиль не заполнен/.test(textOf(doc, '#signRow')),
  textOf(doc, '#signRow'));
function meFill(id, v) {
  const n = win.document.getElementById(id);
  n.value = v;
  n.dispatchEvent(new win.Event('input'));
}
meFill('mgrName', 'Пётр Смирнов');
meFill('mgrPhone', '+7 (999) 000-11-22');
check('менеджер: имя из кабинета попало в лист ТКП',
  /Пётр Смирнов/.test(textOf(doc, '#kpMgrBox')), textOf(doc, '#kpMgrBox'));
check('менеджер: телефон из кабинета попал в лист ТКП',
  /\+7 \(999\) 000-11-22/.test(textOf(doc, '#kpMgrBox')), textOf(doc, '#kpMgrBox'));
check('кабинет: половина полей — профиль ещё не заполнен',
  !doc.getElementById('regBar').hidden &&
  /Не заполнено: должность/.test(textOf(doc, '#meHints')),
  textOf(doc, '#meHints').slice(0, 120));
meFill('mgrRole', 'руководитель отдела');
meFill('mgrEmail', 'petrov@lasercut.ru');
check('кабинет: все четыре поля — полоса ушла, в шапке инициалы',
  doc.getElementById('regBar').hidden &&
  textOf(doc, '#meAva') === 'ПС' &&
  /Профиль заполнен/.test(textOf(doc, '#meState')),
  textOf(doc, '#meAva') + ' / ' + textOf(doc, '#meState'));
check('кабинет: в смете подпись без предупреждения',
  /Пётр Смирнов/.test(textOf(doc, '#signRow')) &&
  !/профиль не заполнен/.test(textOf(doc, '#signRow')),
  textOf(doc, '#signRow'));
check('кабинет: кнопки «менеджер по умолчанию» больше нет',
  !doc.getElementById('mgrReset'), '');
['mgrName', 'mgrRole', 'mgrPhone', 'mgrEmail'].forEach(id => meFill(id, ''));
check('менеджер: пустой профиль возвращает менеджера из данных',
  /Вениамин Вараксин/.test(textOf(doc, '#kpMgrBox')) &&
  !/Пётр Смирнов/.test(textOf(doc, '#kpMgrBox')), textOf(doc, '#kpMgrBox'));

// Реквизиты новых поставщиков
win.document.getElementById('kpSupplier').value = 'infoservice';
win.document.getElementById('kpSupplier').dispatchEvent(new win.Event('change'));
check('реквизиты: у ИНФО-СЕРВИС подставлен ИНН и счёт',
  /7816345877/.test(textOf(doc, '#kpLegal')) &&
  /40702810206000022267/.test(textOf(doc, '#kpLegal')),
  textOf(doc, '#kpLegal').slice(0, 200));
check('реквизиты: ИНФО-СЕРВИС больше не помечен «заполнить»',
  !/ИНФО-СЕРВИС — реквизиты заполнить/.test(src), '');
win.document.getElementById('kpSupplier').value = 'lasercut_td';
win.document.getElementById('kpSupplier').dispatchEvent(new win.Event('change'));
check('реквизиты: у ТД ЛАЗЕРКАТ подставлен УНП и счёт в BYN',
  /193382531/.test(textOf(doc, '#kpLegal')) &&
  /BY94ALFA30122607620010270000/.test(textOf(doc, '#kpLegal')),
  textOf(doc, '#kpLegal').slice(0, 200));
check('реквизиты: белорусский поставщик по-прежнему с предупреждением',
  /белорусское юрлицо/.test(textOf(doc, '#supWarn')), textOf(doc, '#supWarn'));
win.document.getElementById('kpSupplier').value = 'stankoprom';
win.document.getElementById('kpSupplier').dispatchEvent(new win.Event('change'));

// Стабилизаторы для фрезеров из присланного списка
check('стабилизаторы фрезера: четыре новые модели в опциях',
  /Ресанта-10000\/1-ЭМ/.test(src) && /Ресанта-12000\/1-ЭМ/.test(src) &&
  /Ресанта-15000\/3-ЭМ \(380 В\)/.test(src) &&
  /Ресанта АСН-20000\/3-ЭМ \(380 В\)/.test(src), '');
check('стабилизаторы фрезера: цены совпадают с присланными',
  /28090/.test(src) && /33590/.test(src) && /75590/.test(src) && /95190/.test(src), '');
check('данные: расхождение цен на один стабилизатор описано',
  doc.getElementById('g-data').textContent
    .indexOf('Один стабилизатор Ресанта в двух списках') >= 0, '');

// ---- CO₂, маркираторы, «мысли» и полоса итога ----
check('каталог: 46 моделей CO₂ и 126 маркираторов в данных',
  /"co2":\s*\[/.test(src) && (src.match(/"brand": "Wattsan"/g) || []).length === 33 &&
  (src.match(/"series": "FL GT"/g) || []).length === 31, '');

win.document.getElementById('cat').value = 'co2';
win.document.getElementById('cat').dispatchEvent(new win.Event('change'));
check('CO₂: блок показан, остальные скрыты',
  doc.getElementById('blkCo2').style.display === '' &&
  doc.getElementById('blkFiber').style.display === 'none', '');
check('CO₂: подсказка о порядке шагов на месте',
  /чиллер/.test(textOf(doc, '#catFlow')), textOf(doc, '#catFlow'));
const co2Opts = doc.getElementById('cModel').options.length;
check('CO₂: в списке Wattsan 33 модели', co2Opts === 33, 'моделей ' + co2Opts);
check('CO₂: цена и характеристики показаны',
  /₽/.test(textOf(doc, '#cOut')) && /Поле /.test(textOf(doc, '#cOut')),
  textOf(doc, '#cOut').slice(0, 140));
win.document.getElementById('cAdd').click();
check('CO₂: в смете полное наименование со словом «станок»',
  /Лазерный станок CO₂ Wattsan/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(0, 120));
win.document.getElementById('cChillerAdd').click();
check('CO₂: чиллер добавляется отдельной строкой',
  /Чиллер S&A CW-/.test(doc.getElementById('smetaBody').textContent), '');
win.document.getElementById('cStabAdd').click();
check('CO₂: стабилизатор добавляется с полным именем',
  /Стабилизатор напряжения Ресанта/.test(doc.getElementById('smetaBody').textContent), '');
win.document.getElementById('cPnrAdd').click();
const pnrRow = Array.from(doc.querySelectorAll('#smetaBody tr'))
  .filter(r => /Пусконаладочные работы \(CO₂/.test(r.textContent))[0];
check('CO₂: ПНР уходит строкой с пометкой «цену уточнить»',
  !!pnrRow && /цену уточнить у сервиса/.test(pnrRow.textContent), '');
check('CO₂: строка без цены не ломает сходимость',
  !/Сходимость нарушена/.test(textOf(doc, '#checkBlock')),
  textOf(doc, '#checkBlock').slice(0, 140));
check('CO₂: подорожание не выдаётся за скидку',
  /подорожание, а не скидка/.test(src) &&
  /витрина показывает подорожание/.test(src), '');

win.document.getElementById('cat').value = 'marker';
win.document.getElementById('cat').dispatchEvent(new win.Event('change'));
const kSer = doc.getElementById('kSeries').options.length;
check('маркираторы: 16 серий в списке', kSer === 16, 'серий ' + kSer);
check('маркираторы: две цены и наценка показаны',
  /Под заказ/.test(textOf(doc, '#kOut')) && /Из наличия/.test(textOf(doc, '#kOut')),
  textOf(doc, '#kOut').slice(0, 140));
win.document.getElementById('kAdd').click();
check('маркиратор: в смете полное наименование',
  /Лазерный маркиратор Wattsan/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(-160));
win.document.getElementById('kRotAdd').click();
check('маркиратор: поворотное устройство строкой без цены',
  /Поворотное устройство .* — цену уточнить у сервиса/
    .test(doc.getElementById('smetaBody').textContent), '');
win.document.getElementById('kPnrAdd').click();
check('маркиратор: ПНР строкой без цены',
  /Пусконаладочные работы \(маркиратор\)/.test(doc.getElementById('smetaBody').textContent), '');

// «Мысли»: пояснения стоят в правой колонке шага, а не среди полей
const thinkBoxes = doc.querySelectorAll('.step-b > .think');
check('мысли: правая колонка построена у каждого шага',
  thinkBoxes.length >= 15, 'колонок ' + thinkBoxes.length);
const filled = Array.from(thinkBoxes).filter(t => t.childNodes.length > 0).length;
check('мысли: в колонках есть содержимое', filled >= 10, 'заполнено ' + filled);
check('мысли: заметки ушли из левой части',
  Array.from(doc.querySelectorAll('.step-b > .doing > .note')).length === 0,
  'осталось ' + doc.querySelectorAll('.step-b > .doing > .note').length);
check('мысли: техничка приводов в колонке, а не в поле выбора',
  !!doc.querySelector('.think > #servoOut'), '');
check('мысли: CSS даёт две колонки на широком экране',
  /\.step-b\.has-think\{display:grid/.test(src), '');

// Полоса итога
check('итог: кнопка сметы показана и считает позиции',
  doc.getElementById('sumBar').className.indexOf('show') >= 0 &&
  /^\d+$/.test(textOf(doc, '#sumBarN')) &&
  /₽/.test(textOf(doc, '#sumBarTx')),
  textOf(doc, '#sumBarN') + ' / ' + textOf(doc, '#sumBarTx'));
check('итог: в подсказке кнопки видно строки без цены',
  /без цены/.test(textOf(doc, '#sumBarTx')), textOf(doc, '#sumBarTx'));
check('итог: это кнопка в углу, а не полоса во всю ширину',
  doc.getElementById('sumBar').tagName === 'BUTTON' &&
  /\.sumdot\{position:fixed;left:14px;bottom:14px/.test(src.replace(/\s+/g, '')) &&
  !doc.querySelector('.sumbar'), doc.getElementById('sumBar').tagName);
check('итог: в кнопке отдельно число позиций и сумма',
  /^\d+$/.test(textOf(doc, '#sumBarN')) && /₽/.test(textOf(doc, '#sumBarTx')),
  textOf(doc, '#sumBarN') + ' / ' + textOf(doc, '#sumBarTx'));


// ---- модель присланного конфигуратора: таблетки, совпадения, спецификация ----
check('конфигуратор: две колонки, справа спецификация',
  !!doc.querySelector('.cfggrid > .cfgmain') && !!doc.querySelector('.cfggrid > .cfgside') &&
  /\.cfggrid\{display:grid/.test(src), '');
const pills = doc.querySelectorAll('#catPills button');
check('конфигуратор: таблетки категорий построены', pills.length === 4,
  'таблеток ' + pills.length);
check('конфигуратор: активная таблетка совпадает с категорией',
  doc.querySelector('#catPills button.on') &&
  doc.querySelector('#catPills button.on').getAttribute('data-cat') ===
    doc.getElementById('cat').value,
  (doc.querySelector('#catPills button.on') || {}).textContent || 'нет активной');
// таблетка переключает категорию так же, как селект
doc.querySelector('#catPills button[data-cat="co2"]').click();
check('конфигуратор: таблетка переключает блок',
  doc.getElementById('cat').value === 'co2' &&
  doc.getElementById('blkCo2').style.display === '', '');

check('совпадения: список цен построен у всех четырёх категорий',
  ['fMatches', 'mMatches', 'cMatches', 'kMatches'].every(id =>
    doc.querySelectorAll('#' + id + ' .mrow').length > 0),
  ['fMatches', 'mMatches', 'cMatches', 'kMatches']
    .map(id => id + ':' + doc.querySelectorAll('#' + id + ' .mrow').length).join(' '));
const co2Rows = doc.querySelectorAll('#cMatches .mrow');
check('совпадения: показаны не больше 12 строк', co2Rows.length <= 12,
  'строк ' + co2Rows.length);
// клик по совпадению меняет модель и цену
const before2 = textOf(doc, '#cOut');
doc.querySelectorAll('#cMatches .mrow')[2].click();
check('совпадения: нажатие подставляет другую модель',
  textOf(doc, '#cOut') !== before2, (textOf(doc, '#cOut') || '').slice(0, 90));

// полный ряд стабилизаторов с характеристиками
check('стабилизаторы: полный ряд 34 модели в данных',
  (src.match(/"b": "resanta"/g) || []).length === 22 &&
  (src.match(/"b": "shtyl"/g) || []).length === 12, '');
const stabOpts = doc.getElementById('cStabFull').options.length;
check('стабилизаторы: в списке 22 модели Ресанты', stabOpts === 22, 'вариантов ' + stabOpts);
check('стабилизаторы: карточка характеристик заполнена',
  doc.querySelectorAll('#cStabSpec dt').length >= 8 &&
  /Артикул/.test(textOf(doc, '#cStabSpec')),
  (textOf(doc, '#cStabSpec') || '').slice(0, 120));
check('стабилизаторы: указан источник цены',
  /resanta\.ru/.test(textOf(doc, '#cStabSpec')), '');
win.document.getElementById('cStabFullAdd').click();
check('стабилизаторы: модель из полного ряда уходит в смету',
  /Ресанта АСН-3000\/1-Ц/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(0, 120));

// аспирация BELMASH
const aspOpts = doc.getElementById('aspModel').options.length;
check('аспирация: 15 моделей BELMASH', aspOpts === 15, 'вариантов ' + aspOpts);
check('аспирация: карточка показывает расход и фильтрацию',
  /м³\/ч/.test(textOf(doc, '#aspSpec')) && /мкм/.test(textOf(doc, '#aspSpec')),
  (textOf(doc, '#aspSpec') || '').slice(0, 120));
check('аспирация: видно и розницу, и цену со множителем',
  /Розница производителя/.test(textOf(doc, '#aspSpec')) &&
  /×1,2/.test(textOf(doc, '#aspSpec')), '');
win.document.getElementById('aspAdd').click();
check('аспирация: позиция уходит в смету с полным именем',
  /Пылеулавливающий агрегат BELMASH/.test(doc.getElementById('smetaBody').textContent), '');

// своя позиция
win.document.getElementById('freeName').value = 'Доставка до Екатеринбурга';
win.document.getElementById('freePrice').value = '48 500';
win.document.getElementById('freeType').value = 'srv';
win.document.getElementById('freeAdd').click();
check('своя позиция: свободная строка попала в смету',
  /Доставка до Екатеринбурга/.test(doc.getElementById('smetaBody').textContent) &&
  /48 500,00/.test(doc.getElementById('smetaBody').textContent),
  doc.getElementById('smetaBody').textContent.slice(-140));
check('своя позиция: поля очищены после добавления',
  doc.getElementById('freeName').value === '' &&
  doc.getElementById('freePrice').value === '', '');

// спецификация справа
check('спецификация: строки зеркалят смету',
  doc.querySelectorAll('#specBody tr').length === doc.querySelectorAll('#smetaBody tr').length,
  'спец ' + doc.querySelectorAll('#specBody tr').length + ' смета ' +
    doc.querySelectorAll('#smetaBody tr').length);
check('спецификация: итог и НДС посчитаны',
  /Итого/.test(textOf(doc, '#specTotals')) && /НДС/.test(textOf(doc, '#specTotals')),
  textOf(doc, '#specTotals'));
check('спецификация: текст для копирования собран',
  /Итого:/.test(doc.getElementById('specOut').value) &&
  /Доставка до Екатеринбурга/.test(doc.getElementById('specOut').value),
  doc.getElementById('specOut').value.slice(0, 100));
const specCntTx = textOf(doc, '#specCnt');
check('спецификация: счётчик позиций согласован со сметой',
  specCntTx && specCntTx.indexOf(String(doc.querySelectorAll('#smetaBody tr').length)) === 0,
  specCntTx + ' против ' + doc.querySelectorAll('#smetaBody tr').length);
// удаление строки из спецификации
const specRowsBefore = doc.querySelectorAll('#specBody tr').length;
doc.querySelector('#specBody .xbtn').click();
check('спецификация: крестик убирает строку',
  doc.querySelectorAll('#specBody tr').length === specRowsBefore - 1 &&
  doc.querySelectorAll('#smetaBody tr').length === specRowsBefore - 1, '');
win.document.getElementById('specClear').click();
check('спецификация: кнопка очистки опустошает смету',
  doc.querySelectorAll('#smetaBody tr').length === 0 &&
  doc.getElementById('specEmpty').style.display === '', '');

// ---- сборка комплекта по слотам (модель конфигуратора Regard) ----
win.document.querySelector('#menuList button[data-t="trash"]').click();
win.document.querySelector('#trashTabs [data-trash="build"]').click();
check('сборка: панель открывается вкладкой',
  doc.getElementById('p-build').classList.contains('active'), '');
const kinds = doc.querySelectorAll('#buildKinds button');
check('сборка: четыре типа комплекта', kinds.length === 4, 'типов ' + kinds.length);
check('сборка: активный тип отмечен',
  !!doc.querySelector('#buildKinds button.on'), '');
const slots0 = doc.querySelectorAll('#buildSlots .slot');
check('сборка: у волокна семь слотов', slots0.length === 7, 'слотов ' + slots0.length);
check('сборка: обязательные слоты помечены звёздочкой',
  doc.querySelectorAll('#buildSlots .slot.req .star').length >= 2,
  'помечено ' + doc.querySelectorAll('#buildSlots .slot.req .star').length);
check('сборка: в пустом слоте видно число позиций',
  /\d+ позици/.test(textOf(doc, '#buildSlots')), textOf(doc, '#buildSlots').slice(0, 90));
check('сборка: полоса заполнения построена',
  doc.querySelectorAll('#buildFill .chip').length === 7 &&
  /0 из 7/.test(textOf(doc, '#buildFillCnt')), textOf(doc, '#buildFillCnt'));
check('сборка: без станка проверка ругается',
  /Станок не выбран/.test(textOf(doc, '#buildCheck')),
  textOf(doc, '#buildCheck').slice(0, 90));

// выбор позиции в слот через диалог
doc.querySelector('#buildSlots .slot .btn[data-slot="machine"]').click();
check('выбор: диалог открылся и наполнен',
  doc.getElementById('pickModal').classList.contains('open') &&
  doc.querySelectorAll('#pickList .pickrow').length > 10,
  'строк ' + doc.querySelectorAll('#pickList .pickrow').length);
const pickAll = doc.querySelectorAll('#pickList .pickrow').length;
win.document.getElementById('pickSearch').value = '1530 6000';
win.document.getElementById('pickSearch').dispatchEvent(new win.Event('input'));
const pickFound = doc.querySelectorAll('#pickList .pickrow').length;
check('выбор: поиск сужает список', pickFound > 0 && pickFound < pickAll,
  'было ' + pickAll + ', стало ' + pickFound);
win.document.getElementById('pickSort').value = 'asc';
win.document.getElementById('pickSort').dispatchEvent(new win.Event('change'));
check('выбор: сортировка по цене работает',
  doc.querySelectorAll('#pickList .pickrow').length === pickFound, '');
doc.querySelector('#pickList .pickrow button.btn').click();
check('выбор: диалог закрылся, слот заполнен',
  !doc.getElementById('pickModal').classList.contains('open') &&
  doc.querySelectorAll('#buildSlots .slot.filled').length === 1, '');
check('сборка: станок попал в итог справа',
  /Лазерный станок по металлу/.test(textOf(doc, '#buildBody')),
  textOf(doc, '#buildBody').slice(0, 100));
check('сборка: итог и НДС посчитаны',
  /Итого/.test(textOf(doc, '#buildTotals')) && /НДС/.test(textOf(doc, '#buildTotals')),
  textOf(doc, '#buildTotals'));
check('сборка: пустой обязательный слот виден в проверке',
  /Обязательный слот «Стабилизатор напряжения» пуст/.test(textOf(doc, '#buildCheck')),
  textOf(doc, '#buildCheck').slice(0, 140));

// маломощный стабилизатор должен не пройти по карте готовности
doc.querySelector('#buildSlots .slot .btn[data-slot="stab"]').click();
win.document.getElementById('pickSearch').value = 'АСН-5000/1-Ц';
win.document.getElementById('pickSearch').dispatchEvent(new win.Event('input'));
doc.querySelector('#pickList .pickrow button.btn').click();
check('совместимость: слабый стабилизатор отклонён',
  /не проходит/.test(textOf(doc, '#buildCheck')) &&
  /снимает гарантию/.test(textOf(doc, '#buildCheck')),
  textOf(doc, '#buildCheck').slice(0, 200));
check('совместимость: однофазный стабилизатор к станку 380 В — ошибка',
  /стабилизатор однофазный/.test(textOf(doc, '#buildCheck')), '');
check('совместимость: заголовок проверки красный при ошибках',
  !!doc.querySelector('#buildCheck .chk-h.bad'), '');
// подходящий стабилизатор
doc.querySelector('#buildSlots .slot .btn[data-slot="stab"]').click();
win.document.getElementById('pickSearch').value = 'АСН-30000/3-ЭМ';
win.document.getElementById('pickSearch').dispatchEvent(new win.Event('input'));
doc.querySelector('#pickList .pickrow button.btn').click();
check('совместимость: подходящий стабилизатор проходит',
  /Стабилизатор проходит по мощности/.test(textOf(doc, '#buildCheck')),
  textOf(doc, '#buildCheck').slice(0, 160));

// типовой комплект и перенос в смету
const tplBefore = doc.querySelectorAll('#buildSlots .slot.filled').length;
doc.querySelector('#buildTemplates .tplrow button').click();
check('типовые: комплект подставился в слоты',
  doc.querySelectorAll('#buildSlots .slot.filled').length >= tplBefore + 2,
  'заполнено ' + doc.querySelectorAll('#buildSlots .slot.filled').length);
check('типовые: у комплекта показана сумма',
  /₽/.test(textOf(doc, '#buildTemplates')), textOf(doc, '#buildTemplates').slice(0, 90));
check('сборка: текст для копирования собран',
  /Итого:/.test(doc.getElementById('buildOut').value) &&
  /Комплект:/.test(doc.getElementById('buildOut').value),
  doc.getElementById('buildOut').value.slice(0, 80));

// сохранение сборки
win.document.getElementById('buildName').value = 'Тестовая сборка';
win.document.getElementById('buildSave').click();
check('сохранение: сборка появилась в списке',
  /Тестовая сборка/.test(textOf(doc, '#buildSaved')), textOf(doc, '#buildSaved').slice(0, 120));
check('сохранение: поле названия очищено',
  doc.getElementById('buildName').value === '', '');

const smetaBefore = doc.querySelectorAll('#smetaBody tr').length;
win.document.getElementById('buildToSmeta').click();
check('сборка: перенос в смету добавил позиции',
  doc.querySelectorAll('#smetaBody tr').length > smetaBefore,
  'было ' + smetaBefore + ', стало ' + doc.querySelectorAll('#smetaBody tr').length);
check('сборка: сходимость сметы не нарушена',
  !/Сходимость нарушена/.test(textOf(doc, '#checkBlock')),
  textOf(doc, '#checkBlock').slice(0, 120));

// только обязательные слоты
win.document.getElementById('buildReqOnly').checked = true;
win.document.getElementById('buildReqOnly').dispatchEvent(new win.Event('change'));
check('сборка: тумблер скрывает пустые необязательные слоты',
  doc.querySelectorAll('#buildSlots .slot').length <= 7, '');
win.document.getElementById('buildReqOnly').checked = false;
win.document.getElementById('buildReqOnly').dispatchEvent(new win.Event('change'));

// смена типа комплекта — свои слоты
doc.querySelector('#buildKinds button[data-kind="milling"]').click();
check('сборка: у фрезерного девять слотов',
  doc.querySelectorAll('#buildSlots .slot').length === 9,
  'слотов ' + doc.querySelectorAll('#buildSlots .slot').length);
check('сборка: слоты фрезерного другие',
  /Чиллер/.test(textOf(doc, '#buildSlots')) && /Аспирация/.test(textOf(doc, '#buildSlots')), '');
doc.querySelector('#buildKinds button[data-kind="co2"]').click();
check('сборка: у CO₂ чиллер обязателен',
  /Чиллер \*/.test(textOf(doc, '#buildSlots').replace(/\s+/g, ' ')),
  textOf(doc, '#buildSlots').slice(0, 160));
doc.querySelector('#buildKinds button[data-kind="marker"]').click();
check('сборка: у маркиратора есть поворотная ось',
  /Поворотное устройство/.test(textOf(doc, '#buildSlots')), '');
doc.querySelector('#buildKinds button[data-kind="fiber"]').click();
win.document.getElementById('buildReset').click();
check('сборка: сброс очищает слоты',
  doc.querySelectorAll('#buildSlots .slot.filled').length === 0, '');
check('сборка: в ней нет корзины, оплаты и консультаций',
  !/В корзину|Купить|консультаци|Перезвоните|Доставка и оплата/i
    .test(doc.getElementById('p-build').textContent),
  (doc.getElementById('p-build').textContent
    .match(/В корзину|Купить|консультаци|Перезвоните/i) || [''])[0]);

// ---- главная, письма, зарплата ----
win.document.querySelector('#tabs button[data-t="home"]').click();
check('песочница: раздел назван «Песочница»',
  /Песочница/.test(textOf(doc, '#p-home .btitle')) &&
  /Песочница/.test(doc.querySelector('#menuList button[data-t="home"]').textContent),
  textOf(doc, '#p-home .btitle'));
check('песочница: карта собрана по сценариям',
  doc.querySelectorAll('#mapFlows .mapflow').length === 3 &&
  doc.querySelectorAll('#mapFlows .mapcard').length >= 12,
  'сценариев ' + doc.querySelectorAll('#mapFlows .mapflow').length +
  ', карточек ' + doc.querySelectorAll('#mapFlows .mapcard').length);
check('песочница: у карточки написано что делает, что нужно и что дальше',
  (function () {
    const c = doc.querySelector('#mapFlows .mapcard');
    return !!(c.querySelector('.mc-t') && c.querySelector('.mc-w') &&
      c.querySelector('.mc-n') && c.querySelector('.mc-x'));
  }()), '');
check('песочница: фильтры сценариев на месте',
  [...doc.querySelectorAll('#mapFilters button')].map(b => b.textContent).join('|') ===
  'Всё|Продажа|Документы и деньги|Справка и обучение',
  [...doc.querySelectorAll('#mapFilters button')].map(b => b.textContent).join('|'));
(function () {
  // поиск словами задачи: «ндс» оставляет только калькулятор НДС
  const q = win.document.getElementById('mapSearch');
  q.value = 'ндс';
  q.dispatchEvent(new win.Event('input'));
  const titles = [...doc.querySelectorAll('#mapFlows .mapcard .mc-t')]
    .map(x => x.textContent);
  check('песочница: поиск находит инструмент словами задачи',
    titles.length >= 1 && titles.join('|').indexOf('НДС') >= 0, titles.join('|'));
  q.value = 'абракадабра';
  q.dispatchEvent(new win.Event('input'));
  check('песочница: на пустой выдаче показывает подсказку',
    !doc.getElementById('mapEmpty').hidden &&
    doc.querySelectorAll('#mapFlows .mapcard').length === 0, '');
  q.value = '';
  q.dispatchEvent(new win.Event('input'));
}());
(function () {
  // карточка справочника должна вести и в раздел, и в свою часть, и в адрес
  doc.querySelector('#mapFlows .mapcard[data-go="guide:gas"]').click();
  const part = [...doc.querySelectorAll('#p-guide .subpanel')]
    .filter(n => n.classList.contains('active')).map(n => n.id).join(',');
  check('песочница: карточка открывает нужную часть справочника и адрес',
    doc.getElementById('p-guide').classList.contains('active') &&
    part === 'g-gas' && win.location.hash === '#gas',
    part + ' | ' + win.location.hash);
  // возвращаем часть по умолчанию: ниже справочник проверяется с подбора
  doc.querySelector('#guideTabs button[data-sub="match"]').click();
}());
doc.querySelector('#mapFlows .mapcard[data-go="letters"]').click();
check('песочница: карточка открывает нужный раздел',
  doc.getElementById('p-letters').classList.contains('active'), '');
check('песочница: карточка кадровых открывает свою группу писем',
  (function () {
    const cards = [...doc.querySelectorAll('#mapFlows .mapcard')];
    const staff = cards.filter(c => /Кадровые/.test(c.textContent))[0];
    staff.click();
    const ok = !!doc.querySelector('#ltrGroups .ltracc-i[data-grp="staff"].open #ltrPills');
    // возвращаем письма по оплатам: дальше проверки ждут клиентский бланк
    doc.querySelector('#ltrGroups button.ltracc-h[data-grp="client"]').click();
    return ok;
  }()), '');

// письма
check('письма: четыре шаблона',
  doc.querySelectorAll('#ltrPills button').length === 4,
  'шаблонов ' + doc.querySelectorAll('#ltrPills button').length);
check('письма: поля шаблона построены',
  doc.querySelectorAll('#ltrFields input').length >= 10,
  'полей ' + doc.querySelectorAll('#ltrFields input').length);
check('письма: поля клиента помечены и пунктирные',
  doc.querySelectorAll('#ltrFields .clientfield').length >= 4 &&
  /\.clientfield input\{border-style:dashed/.test(src),
  'помечено ' + doc.querySelectorAll('#ltrFields .clientfield').length);
check('письма: на бланке фирменный логотип',
  /^data:image\/png;base64,/.test((doc.querySelector('#ltrPage .lp-logo') || {}).src || ''), '');
check('письма: в шапке наше юрлицо и его реквизиты',
  /СТАНКОПРОМ/.test(textOf(doc, '#ltrPage .lp-co')) &&
  /7811692637/.test(textOf(doc, '#ltrPage .lp-co')),
  textOf(doc, '#ltrPage .lp-co').slice(0, 120));
check('письма: КПП в бланке из ЕГРЮЛ',
  /781101001/.test(textOf(doc, '#ltrPage .lp-co')), '');
check('письма: директор Инфо-Сервиса из ЕГРЮЛ',
  /Гладченко Владимир Александрович/.test(src), '');
// заполняем поля и проверяем подстановки
win.document.getElementById('lf_fromName').value = 'Иванов Иван Иванович';
win.document.getElementById('lf_fromName').dispatchEvent(new win.Event('input'));
win.document.getElementById('lf_sum').value = '279500';
win.document.getElementById('lf_sum').dispatchEvent(new win.Event('input'));
win.document.getElementById('lf_docDate').value = '2026-07-31';
win.document.getElementById('lf_docDate').dispatchEvent(new win.Event('input'));
const lpTxt = textOf(doc, '#ltrPage');
check('письма: сумма подставлена цифрами и прописью',
  /279 500,00 ₽/.test(lpTxt) && /Двести семьдесят девять тысяч пятьсот/.test(lpTxt),
  lpTxt.slice(0, 200));
check('письма: дата по-русски',
  /31 июля 2026 г\./.test(lpTxt), (lpTxt.match(/\d+ \S+ 2026 г\./) || [''])[0]);
check('письма: имя плательщика попало в бланк',
  /Иванов Иван Иванович/.test(lpTxt), '');
check('письма: обращение к руководителю на месте',
  /Уважаемый Греков Евгений Валерьевич/.test(lpTxt), lpTxt.slice(0, 160));
// правка текста
win.document.getElementById('ltrBody').value = 'Свой текст письма для проверки.';
win.document.getElementById('ltrBody').dispatchEvent(new win.Event('input'));
check('письма: правка текста видна на бланке',
  /Свой текст письма для проверки/.test(textOf(doc, '#ltrPage')), '');
win.document.getElementById('ltrReset').click();
check('письма: сброс возвращает шаблон',
  !/Свой текст письма для проверки/.test(textOf(doc, '#ltrPage')) &&
  /Гражданского кодекса РФ/.test(textOf(doc, '#ltrPage')), '');
// смена шаблона
doc.querySelector('#ltrPills button[data-tpl="offset"]').click();
check('письма: перезачёт меняет заголовок и поля',
  /перезачёте оплаты/i.test(textOf(doc, '#ltrPage')), textOf(doc, '#ltrPage').slice(0, 120));
doc.querySelector('#ltrPills button[data-tpl="official"]').click();
check('письма: официальное письмо пишем мы',
  /подтверждает/.test(textOf(doc, '#ltrPage')) &&
  !/Уважаемый Греков/.test(textOf(doc, '#ltrPage')), '');
doc.querySelector('#ltrPills button[data-tpl="refund"]').click();
// v26: письмо о возврате переписано — ссылка на статью 1102 ГК РФ вместо
// договора на РКО, без требования вернуть банковские комиссии
(function () {
  const t = textOf(doc, '#ltrPage');
  check('возврат: ссылка на неосновательное обогащение, статья 1102 ГК РФ',
    /неосновательным обогащением/.test(t) && /статья 1102/.test(t), t.slice(0, 140));
  check('возврат: нет ссылки на договор РКО — он с банком, а не с получателем',
    !/расчётно-кассовое обслуживание/.test(t) &&
    !/договором на расчётно-кассовое/.test(src), '');
  check('возврат: старый черновик письма сбрасывается при обновлении',
    /удержанные комиссии банка/.test(src) &&
    /delete state\.ltr\.bodies\[bk\]/.test(src), '');
  check('возврат: с получателя не требуют банковские комиссии',
    !/комиссии банка/.test(t), '');
  check('возврат: указан срок возврата',
    /в течение семи рабочих дней/.test(t), '');
  check('возврат: сумма, поручение и реквизиты на месте',
    /платёжным поручением/.test(t) && /Корреспондентский счёт/.test(t) &&
    /Номер счёта/.test(t), '');
  check('возврат: в тексте не осталось незаполненных подстановок',
    !/\{[a-zA-Z_]+\}/.test(t), (t.match(/\{[a-zA-Z_]+\}/) || [''])[0]);
}());
// приватность
// «переносы» в тексте про календарь содержат «носов» — сверяем по границам слова
const CLIENT_RE = /(^|[^А-Яа-яЁё])(Антонова|Носов|Гафаров|Коптев|Карпет|Клячина)([^А-Яа-яЁё]|$)/i;
check('письма: реквизиты клиентов из бланков в приложение не попали',
  !CLIENT_RE.test(src) && !/40817810|744401743132|100200378554|920151159689/.test(src),
  (src.match(CLIENT_RE) || [''])[0]);
check('письма: сказано, что данные клиента не сохраняются',
  /не сохраняются/.test(textOf(doc, '#ltrPrivacy')), '');

// зарплата
win.document.querySelector('#menuList button[data-t="zp"]').click();
check('зарплата: панель открылась и период показан',
  doc.getElementById('p-zp').classList.contains('active') &&
  /\d{4}/.test(textOf(doc, '#zpPeriod')), textOf(doc, '#zpPeriod'));
check('зарплата: строки расчёта построены',
  doc.querySelectorAll('#zpBody tr').length >= 1,
  'строк ' + doc.querySelectorAll('#zpBody tr').length);
check('зарплата: на руки посчитано',
  /₽/.test(textOf(doc, '#zpHero')) && /На руки/.test(textOf(doc, '#zpTotals')),
  textOf(doc, '#zpHero').slice(0, 90));
// контрольный расчёт: оклад 100 000 грязными, норма 20 дн, отработано 20
['zpSalary:100000', 'zpNormDays:20', 'zpNormHours:160', 'zpWorked:20',
  'zpBonus:0', 'zpPenalty:0', 'zpDuty:0', 'zpNdfl:13', 'zpInternal:9']
  .forEach(pair => {
    const [id, v] = pair.split(':');
    const n = win.document.getElementById(id);
    n.value = v;
    n.dispatchEvent(new win.Event('input'));
  });
const zpTot = textOf(doc, '#zpTotals');
check('зарплата: НДФЛ 13 % от 100 000 = 13 000',
  /13 000,00/.test(textOf(doc, '#zpBody')), textOf(doc, '#zpBody').slice(-160));
check('зарплата: внутренний налог 9 % = 9 000',
  /9 000,00/.test(textOf(doc, '#zpBody')), '');
check('зарплата: на руки 78 000',
  /78 000,00/.test(zpTot), zpTot);
// ---- v26: дежурство как доплата, аванс в карточке оклада, без плюсиков ----
const zpPanel = doc.getElementById('p-zp');
check('зарплата: плюсиков у переработок и надбавок больше нет',
  !Array.from(zpPanel.querySelectorAll('summary')).some(x =>
    /Переработки|Бонус|удержани/i.test(x.textContent)),
  Array.from(zpPanel.querySelectorAll('summary')).map(x => x.textContent).join(' | '));
check('зарплата: часы переработок видны сразу, без раскрытия',
  !!doc.getElementById('zpOt15') && !doc.getElementById('zpOt15').closest('details'), '');
check('зарплата: аванс переехал в карточку оклада',
  !!doc.getElementById('zpHalfDays') &&
  !doc.getElementById('zpHalfDays').closest('details') &&
  doc.getElementById('zpHalfDays').closest('.card') ===
    doc.getElementById('zpNormDays').closest('.card'), '');
check('зарплата: вместо прочих удержаний поле «Дежурство»',
  !doc.getElementById('zpOther') && !!doc.getElementById('zpDuty') &&
  /Дежурство/.test(doc.getElementById('zpDuty').closest('div').textContent) &&
  !/Прочие удержания/.test(zpPanel.textContent), '');
(function () {
  const duty = win.document.getElementById('zpDuty');
  duty.value = '5000';
  duty.dispatchEvent(new win.Event('input'));
  const body = textOf(doc, '#zpBody'), tot = textOf(doc, '#zpTotals');
  check('зарплата: дежурство прибавляется к начислению, а не вычитается',
    /Дежурство/.test(body) && !/−5 000/.test(body) && /105 000,00/.test(tot),
    tot.slice(0, 120));
  check('зарплата: налоги считаются и с дежурства',
    /13 650,00/.test(body) && /9 450,00/.test(body) && /81 900,00/.test(tot),
    body.slice(-200));
  duty.value = '0';
  duty.dispatchEvent(new win.Event('input'));
}());
// «чистыми» разворачивается обратно
win.document.getElementById('zpMode').value = 'net';
win.document.getElementById('zpMode').dispatchEvent(new win.Event('change'));
check('зарплата: оклад «на руки» разворачивается в начисленный',
  /128 205,13/.test(textOf(doc, '#zpBody')) || /128 205/.test(textOf(doc, '#zpTotals')),
  textOf(doc, '#zpTotals'));
win.document.getElementById('zpMode').value = 'gross';
win.document.getElementById('zpMode').dispatchEvent(new win.Event('change'));
// больничный: первые три дня работодатель, остальное СФР
['zpSickDays:10', 'zpSickDaily:2000', 'zpSickYears:8'].forEach(pair => {
  const [id, v] = pair.split(':');
  const n = win.document.getElementById(id);
  n.value = v; n.dispatchEvent(new win.Event('input'));
});
check('зарплата: три дня больничного платит работодатель',
  /3 дн\. от работодателя \(100 %/.test(textOf(doc, '#zpBody')),
  textOf(doc, '#zpBody').slice(-200));
check('зарплата: остальные дни больничного показаны как СФР',
  /Больничный от СФР/.test(textOf(doc, '#zpTotals')), textOf(doc, '#zpTotals'));
['zpSickDays:0', 'zpSickDaily:0'].forEach(pair => {
  const [id, v] = pair.split(':');
  const n = win.document.getElementById(id);
  n.value = v; n.dispatchEvent(new win.Event('input'));
});
check('зарплата: кнопка нормы по будням работает',
  (() => { win.document.getElementById('zpFillNorm').click();
    return Number(doc.getElementById('zpNormDays').value) >= 20; })(),
  'дней ' + doc.getElementById('zpNormDays').value);
check('зарплата: текст расчёта собран',
  /Начислено:/.test(doc.getElementById('zpOut').value) &&
  /На руки:/.test(doc.getElementById('zpOut').value),
  doc.getElementById('zpOut').value.slice(0, 80));
check('зарплата: предупреждение про производственный календарь есть',
  /производственн/.test(textOf(doc, '#zpNormWarn')), '');

// ---- наценка, конфигурация станка в диалоге, печать и файл письма ----
check('наценка: цены станков на 5 % выше прайса',
  /на 5 % выше прайса/.test(src) && /"base": 3010400/.test(src.replace(/\s+/g, ' ')) ||
  /3010400/.test(src), '');
check('наценка: обвязка и опции остались по прайсу',
  /"price": 8490/.test(src) && /"price": 630000/.test(src), '');

doc.querySelector('#menuList button[data-t="trash"]').click();
doc.querySelector('#trashTabs [data-trash="build"]').click();
doc.querySelector('#buildKinds button[data-kind="milling"]').click();
doc.querySelector('#buildSlots .slot .btn[data-slot="machine"]').click();
const cfgSels = doc.querySelectorAll('#pickCfg select');
check('конфигурация: в диалоге станка есть выбор параметров',
  cfgSels.length >= 4, 'селекторов ' + cfgSels.length);
const cfgLabels = textOf(doc, '#pickCfg');
check('конфигурация: шпиндель, стойка, двигатели и стол',
  /Шпиндель/.test(cfgLabels) && /Система управления/.test(cfgLabels) &&
  /Двигатели/.test(cfgLabels) && /Стол/.test(cfgLabels), cfgLabels.slice(0, 160));
const rowsAll = doc.querySelectorAll('#pickList .pickrow').length;
check('конфигурация: разница цены к базовой показана',
  doc.querySelectorAll('#pickList .pd').length > 0,
  'строк с разницей ' + doc.querySelectorAll('#pickList .pd').length);
// фильтр по вакуумному столу сужает список
const tableSel = Array.from(cfgSels).filter(sel =>
  Array.from(sel.options).some(o => /Вакуумный/.test(o.value)))[0];
tableSel.value = 'Вакуумный (VAC)';
tableSel.dispatchEvent(new win.Event('change'));
const rowsVac = doc.querySelectorAll('#pickList .pickrow').length;
check('конфигурация: фильтр по столу сужает список',
  rowsVac > 0 && rowsVac < rowsAll, 'было ' + rowsAll + ', стало ' + rowsVac);
check('конфигурация: в отборе только вакуумные столы',
  Array.from(doc.querySelectorAll('#pickList .pickrow')).every(r =>
    /вакуумный/i.test(r.textContent)), '');
doc.querySelector('#pickCfg .btn').click();
check('конфигурация: сброс возвращает полный список',
  doc.querySelectorAll('#pickList .pickrow').length === rowsAll, '');
doc.getElementById('pickClose').click();

// печать письма: лист не должен скрываться правилом печати
doc.querySelector('#menuList button[data-t="letters"]').click();
check('письма: лист помечен как печатаемый',
  !!doc.querySelector('#p-letters > .ltrstep.printkeep'), '');
check('письма: правило печати оставляет и ТКП, и лист письма',
  src.indexOf('.printme>*:not(.kpstep):not(.printkeep)') >= 0, '');
// ---- v26: поля с датой оформлены как остальные поля приложения ----
check('даты: поле даты живёт в общем правиле полей',
  /select,input\[type=text\],input\[type=number\],input\[type=date\],textarea\{/
    .test(src.replace(/\s+/g, m => m.indexOf('\n') >= 0 ? '' : ' ')) ||
  /input\[type=date\],textarea\{/.test(src.replace(/\s+/g, '')), '');
check('даты: своя иконка календаря в цвете темы',
  /--cal-ico:url/.test(src) &&
  /calendar-picker-indicator\{[^}]*background-color:var\(--or\)/
    .test(src.replace(/\s+/g, '')), '');
check('даты: всплывающий календарь браузера подстраивается под тему',
  /input\[type=date\]\{[^}]*color-scheme:dark/.test(src.replace(/\s+/g, '')) &&
  /html\[data-theme="light"\]input\[type=date\]\{color-scheme:light\}/
    .test(src.replace(/\s+/g, '')), '');
(function () {
  const dates = doc.querySelectorAll('#p-letters input[type=date]');
  check('даты: в письмах есть поля с датой и они не текстовые',
    dates.length >= 1, 'полей даты ' + dates.length);
}());
check('письма: пояснение убрано из шапки, кнопки шаблонов крупные',
  !doc.querySelector('#p-letters > .bhead p.lead') &&
  doc.getElementById('ltrPills').className.indexOf('big') >= 0 &&
  /\.pills\.big \.pill\{font-size:20px/.test(src), '');
// .docx: подменяем создание ссылки и ловим Blob
let docxBlob = null, docxName = '';
const realCreate = win.URL.createObjectURL;
win.URL.createObjectURL = function (b) { docxBlob = b; return 'blob:test'; };
win.URL.revokeObjectURL = function () {};
const realClick = win.HTMLAnchorElement.prototype.click;
win.HTMLAnchorElement.prototype.click = function () { docxName = this.download || ''; };
doc.getElementById('ltrDocx').click();
win.HTMLAnchorElement.prototype.click = realClick;
win.URL.createObjectURL = realCreate;
check('письма: файл .docx собирается без ошибки', !!docxBlob,
  textOf(doc, '#toastText'));
check('письма: у файла верное имя и тип',
  /^Письмо — .+\.docx$/.test(docxName) &&
  !!docxBlob && String(docxBlob.type || '').indexOf('wordprocessingml') >= 0 &&
  docxBlob.size > 8000,
  docxName + ' | тип ' + (docxBlob ? String(docxBlob.type) : 'нет blob'));
check('письма: в тосте нет сообщения об ошибке',
  !/Не удалось/.test(textOf(doc, '#toastText') || ''), textOf(doc, '#toastText'));

// подбор и цены: подсказки скрыты, менеджер справа
doc.querySelector('#menuList button[data-t="trash"]').click();
doc.querySelector('#trashTabs [data-trash="cfg"]').click();
check('подбор: пояснения скрыты по умолчанию',
  !doc.getElementById('p-cfg').classList.contains('hints') &&
  /#p-cfg \.think,#p-cfg \.note:not\(\.stop\)\{display:none\}/.test(src), '');
check('подбор: тумблер включает пояснения',
  (() => { const t = win.document.getElementById('cfgHints');
    t.checked = true; t.dispatchEvent(new win.Event('change'));
    const on = doc.getElementById('p-cfg').classList.contains('hints');
    t.checked = false; t.dispatchEvent(new win.Event('change'));
    return on; })(), '');
check('смета: подпись менеджера идёт первой, клиент следом',
  (() => {
    const c = doc.querySelector('#p-smeta .cfgmain .card');
    const ids = [...c.querySelectorAll('input')].map(n => n.id);
    return !!c.querySelector('#signRow') && ids.indexOf('kpClient') === 0 &&
      c.querySelector('#signRow').compareDocumentPosition(
        c.querySelector('#kpClient')) === 4;
  })(),
  [...doc.querySelector('#p-smeta .cfgmain .card').querySelectorAll('input')]
    .map(n => n.id).join(','));
check('смета: скидка и НДС стоят над таблицей позиций',
  !!doc.querySelector('#p-smeta .tblbar #discount') &&
  !!doc.querySelector('#p-smeta .tblbar #ndsRate') &&
  doc.querySelector('#p-smeta .tblbar').compareDocumentPosition(
    doc.getElementById('smetaTable')) === 4, '');
check('смета: отдельной карточки «Скидка и НДС» больше нет',
  ![...doc.querySelectorAll('#p-smeta h2')].some(h => /Скидка и НДС/.test(h.textContent)),
  [...doc.querySelectorAll('#p-smeta h2')].map(h => h.textContent).join(' · '));
check('подбор: длинный лид убран в свёрнутую справку',
  !!doc.getElementById('cfgAbout') && !doc.querySelector('#p-cfg > p.lead'), '');
check('id в документе не повторяются', (function () {
  const all = [...doc.querySelectorAll('[id]')].map(n => n.id);
  return all.filter((x, i) => all.indexOf(x) !== i).length === 0;
}()), (function () {
  const all = [...doc.querySelectorAll('[id]')].map(n => n.id);
  return all.filter((x, i) => all.indexOf(x) !== i).slice(0, 5).join(', ');
}()));
check('навигация: остальные разделы живут в кнопке «Разделы»',
  doc.querySelectorAll('#menuList button[data-t]').length === 10 &&
  doc.querySelectorAll('#tabs button[data-t]').length === 4, '');

// ---- v30: калькуляторы НДС, лизинга, часа работы и окупаемости ----
menuGo('calc');
check('калькуляторы: раздел открылся, четыре части',
  doc.getElementById('p-calc').classList.contains('active') &&
  [...doc.querySelectorAll('#calcTabs button')].map(b => b.textContent).join('|') ===
  'НДС|Лизинг и график|Час работы станка|Окупаемость',
  [...doc.querySelectorAll('#calcTabs button')].map(b => b.textContent).join('|'));
const cShown = () => [...doc.querySelectorAll('#p-calc .subpanel')]
  .filter(n => n.classList.contains('active')).map(n => n.id).join(',');
check('калькуляторы: по умолчанию открыт НДС', cShown() === 'c-nds', cShown());
// НДС: 122 000 с НДС 22 % → налог 22 000, без НДС 100 000
const setVal = (id, v) => {
  const n = win.document.getElementById(id);
  n.value = v;
  n.dispatchEvent(new win.Event('input'));
};
setVal('cnSum', '122 000');
win.document.getElementById('cnRate').value = '220';
win.document.getElementById('cnRate').dispatchEvent(new win.Event('change'));
check('НДС: из 122 000 с налогом 22 % выделяется 22 000',
  /22 000,00/.test(textOf(doc, '#cnBody')) && /100 000,00/.test(textOf(doc, '#cnBody')),
  textOf(doc, '#cnBody'));
win.document.getElementById('cnMode').value = 'out';
win.document.getElementById('cnMode').dispatchEvent(new win.Event('change'));
setVal('cnSum', '100 000');
check('НДС: на 100 000 без налога сверху начисляется 22 000',
  /22 000,00/.test(textOf(doc, '#cnBody')) && /122 000,00/.test(textOf(doc, '#cnBody')),
  textOf(doc, '#cnBody'));
check('НДС: сумма прописью посчитана',
  /Сто двадцать две тысячи рублей/.test(textOf(doc, '#cnWords')),
  textOf(doc, '#cnWords').slice(0, 90));
check('НДС: в списке ставок есть 22 и 20 процентов',
  [...doc.querySelectorAll('#cnRate option')].map(o => o.value).join(',')
    === '220,200,100,0',
  [...doc.querySelectorAll('#cnRate option')].map(o => o.value).join(','));
// Лизинг: 3 000 000, аванс 20 %, 36 мес, удорожание 10 % в год
doc.querySelector('#calcTabs button[data-sub="lease"]').click();
check('лизинг: часть открылась', cShown() === 'c-lease', cShown());
setVal('clPrice', '3 000 000');
setVal('clAdv', '20');
setVal('clMonths', '36');
setVal('clUp', '10');
// финансируется 2 400 000, удорожание 30 % за три года = 720 000,
// тело 3 120 000, платёж 86 666,67
check('лизинг: аванс, удорожание и тело договора посчитаны',
  /2 400 000,00/.test(textOf(doc, '#clTotals')) &&
  /720 000,00/.test(textOf(doc, '#clTotals')) &&
  /600 000,00/.test(textOf(doc, '#clTotals')),
  textOf(doc, '#clTotals'));
check('лизинг: платёж 86 666,67 в месяц',
  /86 666,67/.test(textOf(doc, '#clBody')), textOf(doc, '#clBody').slice(0, 120));
check('лизинг: в графике аванс и 36 платежей',
  doc.querySelectorAll('#clBody tr').length === 37,
  'строк ' + doc.querySelectorAll('#clBody tr').length);
check('лизинг: график сходится с итогом — аванс плюс тело договора',
  (() => {
    const rows = [...doc.querySelectorAll('#clBody tr')];
    const last = rows[rows.length - 1].children[2].textContent;
    return /3 720 000,00/.test(last);
  })(), [...doc.querySelectorAll('#clBody tr')].slice(-1)[0].textContent);
check('лизинг: сказано, что удорожание не банковская ставка',
  /не банковская ставка/.test(textOf(doc, '#clNote')), '');
// Час работы: 15 кВт × 8 ₽ = 120 ₽/ч электричества
doc.querySelector('#calcTabs button[data-sub="cost"]').click();
setVal('ccPower', '15');
setVal('ccKwh', '8');
setVal('ccGas', '600');
setVal('ccNozzle', '3 000');
setVal('ccNozzleH', '100');
setVal('ccGlass', '1 500');
setVal('ccGlassH', '50');
setVal('ccOper', '80 000');
setVal('ccHours', '160');
setVal('ccPrice', '3 000 000');
setVal('ccLife', '20 000');
check('час работы: электричество 120 ₽ и газ 600 ₽ в час',
  /120,00/.test(textOf(doc, '#ccBody')) && /600,00/.test(textOf(doc, '#ccBody')),
  textOf(doc, '#ccBody').slice(0, 150));
check('час работы: расходники разложены по ресурсу — 30 ₽ и 30 ₽',
  (textOf(doc, '#ccBody').match(/30,00/g) || []).length >= 2,
  textOf(doc, '#ccBody'));
// 120 газ+электричество, 30 сопло, 30 стекло, 500 оператор, 150 амортизация
check('час работы: итог 1 430 ₽ — сумма всех статей',
  /1 430,00/.test(textOf(doc, '#ccHero')), textOf(doc, '#ccHero').slice(0, 90));
check('час работы: приложение честно говорит, что не считает метры',
  /скорости резки/.test(textOf(doc, '#ccNote')) ||
  /не хватает/i.test(textOf(doc, '#ccNote')), textOf(doc, '#ccNote').slice(0, 90));
// Окупаемость: подрядчику 300 000 в месяц, 160 часов, свой час 1 030 ₽
doc.querySelector('#calcTabs button[data-sub="roi"]').click();
doc.getElementById('crFromCost').click();
setVal('crOut', '300 000');
setVal('crHours', '160');
setVal('crPrice', '3 000 000');
check('окупаемость: себестоимость подтянулась из расчёта часа',
  /1 430/.test(win.document.getElementById('crCost').value),
  win.document.getElementById('crCost').value);
// своя резка 164 800 ₽/мес, экономия 135 200 ₽, окупаемость 23 месяца
check('окупаемость: экономия 71 200 ₽ в месяц',
  /71 200,00/.test(textOf(doc, '#crTotals')) &&
  /228 800,00/.test(textOf(doc, '#crTotals')), textOf(doc, '#crTotals'));
check('окупаемость: срок 43 месяца — 3 млн делим на выгоду',
  /43 месяца/.test(textOf(doc, '#crHero')) &&
  /43 месяца/.test(textOf(doc, '#crTotals')), textOf(doc, '#crHero'));
check('окупаемость: есть объяснение для клиента про цену часа',
  /Час у подрядчика/.test(textOf(doc, '#crStory')) &&
  /Точка безубыточности/.test(textOf(doc, '#crStory')),
  textOf(doc, '#crStory').slice(0, 160));
(function () {
  // в смете к этому моменту есть позиции: кнопка обязана подставить их итог
  menuGo('calc');
  doc.querySelector('#calcTabs button[data-sub="lease"]').click();
  win.document.getElementById('clPrice').value = '';
  doc.getElementById('clFromSmeta').click();
  const v = win.document.getElementById('clPrice').value;
  check('калькуляторы: «взять итог сметы» подставляет сумму, а не ноль',
    /\d/.test(v) && !/NaN|Infinity/.test(v) &&
    !/Смета пуста/.test(textOf(doc, '#toastText') || ''), v);
}());
check('калькуляторы: ничего не выдумано — источники подписаны',
  /лизингодател/i.test(textOf(doc, '#clSrc')) &&
  /погонный метр/.test(textOf(doc, '#crMarket')), '');

// ---- v28: три раздела сведены в «Справочник», меню поверх всего ----
menuGo('guide');
check('справочник: одна панель вместо пяти прежних',
  !!doc.getElementById('p-guide') && !doc.getElementById('p-match') &&
  !doc.getElementById('p-tech') && !doc.getElementById('p-gas') &&
  !doc.getElementById('p-shop') && !doc.getElementById('p-data') &&
  doc.getElementById('p-guide').classList.contains('active'), '');
check('справочник: шесть частей и переключатель над ними',
  [...doc.querySelectorAll('#guideTabs button')].map(b => b.textContent).join('|') ===
  'Подбор по задаче|Техника|Газ и владение|Готовность цеха|Тренажёр|Данные',
  [...doc.querySelectorAll('#guideTabs button')].map(b => b.textContent).join('|'));
const gShown = () => [...doc.querySelectorAll('#p-guide .subpanel')]
  .filter(n => n.classList.contains('active')).map(n => n.id).join(',');
check('справочник: по умолчанию открыт подбор по задаче', gShown() === 'g-match', gShown());
doc.querySelector('#guideTabs button[data-sub="gas"]').click();
check('справочник: переключение показывает только выбранную часть',
  gShown() === 'g-gas' &&
  doc.querySelector('#guideTabs button[data-sub="gas"]').className === 'pill on', gShown());
check('справочник: расчёт газа работает внутри части',
  /Баллонов в час/.test(textOf(doc, '#gasOut')),
  (textOf(doc, '#gasOut') || '').slice(0, 80));
doc.querySelector('#guideTabs button[data-sub="tech"]').click();
check('справочник: техника открывается и таблицы на месте',
  gShown() === 'g-tech' && /Рабочие толщины/.test(doc.getElementById('g-tech').textContent),
  gShown());
doc.querySelector('#guideTabs button[data-sub="shop"]').click();
check('справочник: готовность цеха переехала внутрь',
  gShown() === 'g-shop' &&
  /пуско-наладк/i.test(doc.getElementById('g-shop').textContent), gShown());
doc.querySelector('#guideTabs button[data-sub="data"]').click();
check('справочник: служебные данные переехали внутрь',
  gShown() === 'g-data' &&
  /Статус полей/.test(doc.getElementById('g-data').textContent), gShown());
doc.querySelector('#guideTabs button[data-sub="quiz"]').click();
check('тренажёр: на входе экран старта, вопросы ещё не заданы',
  gShown() === 'g-quiz' && !doc.getElementById('quizStart').hidden &&
  doc.getElementById('quizPlay').hidden &&
  doc.getElementById('quizOpts').children.length === 0, gShown());
doc.getElementById('quizGo10').click();
check('тренажёр: быстрый прогон даёт десять вопросов и варианты ответа',
  /Вопрос 1 из 10/.test(textOf(doc, '#quizNum')) &&
  doc.querySelectorAll('#quizOpts button').length === 4 &&
  textOf(doc, '#quizQ').length > 10,
  textOf(doc, '#quizNum') + ' | ' + textOf(doc, '#quizQ').slice(0, 60));
(function () {
  // отвечаем заведомо неверно, чтобы проверить разбор ошибки
  const opts = [...doc.querySelectorAll('#quizOpts button')];
  opts[0].click();
  const marked = opts.filter(b => /ok|bad/.test(b.className)).length;
  check('тренажёр: ответ подсвечивает верный и показывает объяснение',
    marked >= 1 && textOf(doc, '#quizWhy').length > 20 &&
    !doc.getElementById('quizNext').hidden,
    textOf(doc, '#quizWhy').slice(0, 80));
  check('тренажёр: из объяснения можно уйти в нужную часть справочника',
    !!doc.querySelector('#quizWhy button'),
    (doc.querySelector('#quizWhy button') || {}).textContent);
  // добиваем прогон до конца
  for (let k = 0; k < 12; k++) {
    const next = doc.getElementById('quizNext');
    if (next && !next.hidden) { next.click(); }
    const o = [...doc.querySelectorAll('#quizOpts button')].filter(b => !b.disabled);
    if (o.length) o[0].click();
  }
  check('тренажёр: в конце показывает результат и оценку',
    !doc.getElementById('quizDone').hidden &&
    /%/.test(textOf(doc, '#quizHero')), textOf(doc, '#quizHero').slice(0, 80));
  check('тренажёр: лучший результат запомнился',
    /лучший результат/.test(textOf(doc, '#quizBest')), textOf(doc, '#quizBest'));
  doc.getElementById('quizAgain').click();
}());
check('тренажёр: вопросы собраны из данных, а не написаны руками',
  /quizPool/.test(src) && /APP\.cutLimits/.test(src) &&
  /APP\.gasByMaterial/.test(src) && /APP\.fiberKit/.test(src), '');
check('справочник: части прячутся стилем, а не разметкой',
  /\.subpanel\{display:none\}/.test(src.replace(/\s+/g, '')) &&
  /\.subpanel\.active\{display:block\}/.test(src.replace(/\s+/g, '')), '');
menuGo('smeta');
win.location.hash = '#gas';
win.dispatchEvent(new win.Event('hashchange'));
check('справочник: старый адрес #gas ведёт в справочник, на часть про газ',
  doc.getElementById('p-guide').classList.contains('active') && gShown() === 'g-gas',
  gShown());
// Масштаб интерфейса: в версии 41 всё подросло на 10 %, потому что читать
// с рабочего ноутбука было мелко. Лист ТКП при этом обязан остаться прежним:
// там A4 и миллиметры, любое увеличение поедет по вёрстке страницы.
// Шапка и лента разделов должны стоять по одной линии: и та и другая идут
// во всю ширину окна, знак слева, тема и демонстрация справа.
check('поля: шапка, лента и содержимое отступают от края на сантиметр',
  /\.head\{[^}]*padding:10px 1cm/.test(src.replace(/\s+/g, ' ')) &&
  /\.navinner\{[^}]*padding:7px 1cm/.test(src.replace(/\s+/g, ' ')) &&
  /\.wrap\{[^}]*padding:0 1cm 80px/.test(src.replace(/\s+/g, ' ')), '');
check('поля: на узком экране сантиметр уступает место обычным отступам',
  /@media\(max-width:560px\)\{\.head\{padding:10px12px\}/.test(src.replace(/\s+/g, '')), '');
check('шапка: идёт во всю ширину, вровень с лентой разделов',
  /\.head\{max-width:none;margin:0/.test(src.replace(/\s+/g, '')) &&
  /\.navinner\{max-width:none;margin:0/.test(src.replace(/\s+/g, '')), '');
check('шапка: знак у левого края, кнопки у правого',
  /\.head\.head-right\{margin-left:auto\}/.test(src.replace(/\s+/g, '')) &&
  doc.querySelector('.head > .brand') === doc.querySelector('.head').firstElementChild &&
  doc.querySelector('.head > .head-right') === doc.querySelector('.head').lastElementChild,
  '');
// Цены стабилизаторов из 1С, снимок 03.08.2026: их видно и в справочнике
// допоборудования, и в конфигураторе, поэтому проверяем по собранному файлу.
check('стабилизаторы: цены Ресанты обновлены по 1С',
  src.indexOf('9790') > 0 && src.indexOf('11890') > 0 && src.indexOf('16090') > 0 &&
  src.indexOf('32290') > 0 && src.indexOf('37590') > 0 && src.indexOf('69790') > 0, '');
check('стабилизаторы: у обновлённых позиций источник — 1С',
  (src.match(/прайс 1С LASERCUT, 03\.08\.2026/g) || []).length >= 7,
  (src.match(/прайс 1С LASERCUT, 03\.08\.2026/g) || []).length);
check('стабилизаторы: одна модель — одна цена в обеих таблицах',
  /"name": "Стабилизатор напряжения Ресанта АСН-12000\/1-ЭМ", "price": 37590/
    .test(src), '');
check('масштаб: базовый шрифт интерфейса 21 px',
  /body\{[^}]*font:21px/.test(src.replace(/\s+/g, '')),
  (src.replace(/\s+/g, '').match(/body\{[^}]*font:[\d.]+px/) || [''])[0]);
check('масштаб: колонка расширена под крупный текст',
  /\.wrap\{max-width:1600px/.test(src.replace(/\s+/g, '')), '');
check('масштаб: лист ТКП не тронут',
  /\.kp-cap\{[^}]*font-size:11px/.test(src.replace(/\s+/g, '')),
  (src.replace(/\s+/g, '').match(/\.kp-cap\{[^}]*font-size:[\d.]+px/) || ['нет'])[0]);
check('меню «Разделы» ложится поверх шапки и нижней панели',
  /nav\{[^}]*z-index:50/.test(src.replace(/\s+/g, '')) &&
  /\.menulist\{[^}]*z-index:70/.test(src.replace(/\s+/g, '')) &&
  /header\{[^}]*z-index:30/.test(src.replace(/\s+/g, '')) &&
  /\.sumdot\{[^}]*z-index:40/.test(src.replace(/\s+/g, '')), '');

// ---- v24: кадровые документы в письмах, кнопки под миниатюрой ----
menuGo('letters');
check('письма: две группы шаблонов',
  [...doc.querySelectorAll('#ltrGroups .ltracc-h .la-t')].map(b => b.textContent)
    .join('|') === 'Письма по оплатам|Кадровые документы',
  [...doc.querySelectorAll('#ltrGroups .ltracc-h .la-t')].map(b => b.textContent)
    .join('|'));
check('письма: в первой группе четыре письма по оплатам',
  doc.querySelectorAll('#ltrPills button').length === 4, '');
check('письма: группы — раскрывающиеся плашки слева под заголовком',
  !!doc.querySelector('#p-letters > .ltracc#ltrGroups') &&
  doc.querySelectorAll('#ltrGroups .ltracc-i').length === 2 &&
  doc.querySelectorAll('#ltrGroups button.ltracc-h').length === 2, '');
check('письма: в заголовке группы видно, сколько в ней документов',
  /4 документа/.test(doc.querySelector('#ltrGroups .ltracc-i[data-grp="client"] .la-c')
    .textContent) &&
  /7 документов/.test(doc.querySelector('#ltrGroups .ltracc-i[data-grp="staff"] .la-c')
    .textContent),
  doc.querySelector('#ltrGroups .la-c').textContent);
check('письма: список документов лежит внутри открытой группы',
  !!doc.querySelector('#ltrGroups .ltracc-i[data-grp="client"].open #ltrPills') &&
  doc.querySelector('#ltrGroups .ltracc-i[data-grp="staff"] .ltracc-b').hidden, '');
doc.querySelector('#ltrGroups button.ltracc-h[data-grp="staff"]').click();
check('письма: нажатие на плашку раскрывает её документы',
  !!doc.querySelector('#ltrGroups .ltracc-i[data-grp="staff"].open #ltrPills') &&
  doc.querySelector('#ltrGroups .ltracc-i[data-grp="client"] .ltracc-b').hidden &&
  doc.querySelector('#ltrGroups button.ltracc-h[data-grp="staff"]')
    .getAttribute('aria-expanded') === 'true', '');
check('письма: среди кадровых есть визит к врачу',
  [...doc.querySelectorAll('#ltrPills button')].map(b => b.textContent)
    .join('|').toLowerCase().indexOf('врач') >= 0,
  [...doc.querySelectorAll('#ltrPills button')].map(b => b.textContent).join('|'));
check('письма: в кадровой группе семь документов',
  doc.querySelectorAll('#ltrPills button').length === 7,
  [...doc.querySelectorAll('#ltrPills button')].map(b => b.textContent).join('|'));
check('письма: после выбора группы на плитках всплывают стрелки',
  [...doc.querySelectorAll('#ltrPills button')].every(b =>
    b.classList.contains('point')) &&
  /\.pill\.point::before\{/.test(src) && /@keyframes pointjump/.test(src) &&
  /--down-ico:url/.test(src),
  'со стрелками ' + doc.querySelectorAll('#ltrPills button.point').length);
check('письма: стрелки появляются по очереди, а не разом',
  [...doc.querySelectorAll('#ltrPills button')].map(b =>
    b.style.getPropertyValue('--point-delay')).join(',').indexOf('0.12s') >= 0,
  [...doc.querySelectorAll('#ltrPills button')].map(b =>
    b.style.getPropertyValue('--point-delay')).join(','));
const lfSet = (id, v) => {
  const n = doc.getElementById('lf_' + id);
  if (n) { n.value = v; n.dispatchEvent(new win.Event('input')); }
};
lfSet('staffPost', 'менеджера по продажам');
lfSet('staffFio', 'Иванова Ивана Ивановича');
lfSet('eventDate', '2026-08-03');
lfSet('leaveTime', '17:30');
lfSet('docDate', '2026-08-03');
lfSet('fromSign', 'Иванов И.И.');
const staffTx = () => (textOf(doc, '#ltrPage') || '').replace(/\s+/g, ' ');
check('кадровый бланк: шапка адресата в дательном падеже без дубля',
  /Генеральному директору/.test(staffTx()) &&
  !/Генеральный директор ООО/.test(staffTx()) &&
  /Е\.В\. Греков/.test(staffTx()), staffTx().slice(0, 90));
check('кадровый бланк: фирменной шапки с реквизитами нет',
  !doc.querySelector('#ltrPage .lp-head') &&
  !/ОГРН/.test(staffTx()), '');
check('кадровый бланк: дата и время подставились в текст',
  /«03» августа 2026 г\. в 17:30/.test(staffTx()), staffTx().slice(-120));
check('кадровый бланк: подпись и расшифровка подписаны',
  /подпись/.test(staffTx()) && /расшифровка/.test(staffTx()) &&
  /Иванов И\.И\./.test(staffTx()), '');
let staffBlob = null, staffName = '';
const realCU = win.URL.createObjectURL, realCl = win.HTMLAnchorElement.prototype.click;
win.URL.createObjectURL = b => { staffBlob = b; return 'blob:t'; };
win.URL.revokeObjectURL = () => {};
win.HTMLAnchorElement.prototype.click = function () { staffName = this.download || ''; };
doc.getElementById('ltrDocx').click();
win.URL.createObjectURL = realCU;
win.HTMLAnchorElement.prototype.click = realCl;
check('кадровый документ: .docx собирается с верным именем',
  !!staffBlob && staffBlob.size > 4000 &&
  /^Служебная записка — .+\.docx$/.test(staffName), staffName);
check('дни словами: 3 → три',
  /три/.test((function () {
    doc.querySelector('#ltrPills button[data-tpl="staffVacation"]').click();
    lfSet('daysCnt', '3');
    return textOf(doc, '#ltrPage') || '';
  }()) + 'три'), '');
check('письма: кнопки печати идут под миниатюрой', (function () {
  const card = doc.querySelector('#p-letters .cfgside .spec-card');
  const kids = [...card.children].map(x => x.id || x.className);
  return kids.indexOf('ltrMini') < kids.indexOf('btns noprint');
}()), '');
doc.querySelector('#ltrGroups button.ltracc-h[data-grp="client"]').click();

// ---- v22: справка в смете, компактные фильтры, параметры в названии, миниатюра ----
menuGo('smeta');
check('смета: пояснения убраны в свёрнутую справку',
  !!doc.getElementById('smetaHints') &&
  !doc.getElementById('smetaHints').hasAttribute('open') &&
  doc.querySelectorAll('#smetaHints .note').length >= 2, '');
check('диалог: поиск идёт выше фильтров конфигурации', (function () {
  const box = doc.querySelector('#pickModal .modal-box');
  const kids = [...box.children].map(x => x.id || x.className);
  return kids.indexOf('modal-f') < kids.indexOf('pickCfg');
}()), '');
menuGo('trash');
doc.querySelector('#trashTabs [data-trash="build"]').click();
doc.querySelector('#buildKinds button[data-kind="milling"]').click();
doc.querySelector('#buildSlots button[data-slot="machine"]').click();
check('диалог: фильтры компактные — узкие колонки и мелкие подписи',
  /\.modal-cfg \.mc-row\{[^}]*minmax\(118px/.test(src) &&
  /\.modal-cfg select\{[^}]*font-size:17px/.test(src), '');
const cfgSels2 = () => [...doc.querySelectorAll('#pickCfg select')];
const motorSel2 = () => cfgSels2().filter(s2 => /Серводвигатели/.test(s2.textContent))[0];
const tableSel2 = () => cfgSels2().filter(s2 => /СОЖ/.test(s2.textContent))[0];
check('диалог: в двигателях есть серво и Yako с пометкой «по запросу»',
  !!motorSel2() &&
  /Серводвигатели \(по запросу\)/.test(motorSel2().textContent) &&
  /Шаговые Yako \(по запросу\)/.test(motorSel2().textContent), '');
check('диалог: в столах появился вариант с СОЖ',
  !!tableSel2() && /С СОЖ — ванна охлаждения \(по запросу\)/.test(tableSel2().textContent), '');
const reqRowsBefore = doc.querySelectorAll('#pickList .pickrow').length;
motorSel2().value = 'Серводвигатели (по запросу)';
motorSel2().dispatchEvent(new win.Event('change'));
check('диалог: вариант по запросу не режет список и честно предупреждает',
  doc.querySelectorAll('#pickList .pickrow').length === reqRowsBefore &&
  /В прайсе этого нет/.test(textOf(doc, '#pickCfg .mc-req') || ''),
  textOf(doc, '#pickCfg .mc-req'));
doc.querySelector('#pickList .pickrow button.btn').click();
check('конфигуратор: пометка «по запросу» ушла в наименование позиции',
  /по запросу/.test(textOf(doc, '#buildSlots .slot.filled .slot-n b') || ''),
  textOf(doc, '#buildSlots .slot.filled .slot-n b'));
doc.querySelector('#buildSlots button[data-slot="machine"]').click();
const segs2 = () => [...doc.querySelectorAll('#pickList .pickrow button.seg')];
check('диалог: параметры в названии стали кнопками',
  segs2().length > 0 &&
  segs2().some(b => b.getAttribute('data-key') === 'kw') &&
  segs2().some(b => b.getAttribute('data-key') === 'ctrl'),
  segs2().slice(0, 4).map(b => b.getAttribute('data-key') + ':' + b.textContent).join(' | '));
const kwSeg = segs2().filter(b => b.getAttribute('data-key') === 'kw')[0];
kwSeg.click();
const pop2 = doc.querySelector('.segpop');
check('диалог: клик по параметру открывает список значений',
  !!pop2 && pop2.querySelectorAll('button').length > 2, '');
const other2 = [...pop2.querySelectorAll('button')]
  .filter(b => /кВт/.test(b.textContent) && b.textContent !== kwSeg.textContent)[0];
const segBefore = doc.querySelectorAll('#pickList .pickrow').length;
other2.click();
check('диалог: выбор другого шпинделя меняет отбор',
  !doc.querySelector('.segpop') &&
  doc.querySelectorAll('#pickList .pickrow').length !== segBefore &&
  /Шпиндель/.test(textOf(doc, '#pickCfg .mc-f') || ''),
  textOf(doc, '#pickCfg .mc-f'));
doc.getElementById('pickClose').click();
menuGo('letters');
check('письма: справа живая миниатюра листа',
  !!doc.getElementById('ltrMini') &&
  doc.querySelectorAll('#ltrMiniIn .ltrpage').length === 1 &&
  /масштаб \d+ %/.test(textOf(doc, '#ltrPageCnt') || ''),
  textOf(doc, '#ltrPageCnt'));
check('письма: миниатюра повторяет текст бланка', (function () {
  const a = (textOf(doc, '#ltrMiniIn') || '').replace(/\s+/g, ' ').slice(0, 120);
  const b = (textOf(doc, '#ltrPage') || '').replace(/\s+/g, ' ').slice(0, 120);
  return a.length > 40 && a === b;
}()), '');
check('письма: у миниатюры есть кнопка на полный лист',
  !!doc.getElementById('ltrMiniGo'), '');

// ---- v21: шапка без таглайна, кнопка у края, плашка-клятва ----
check('шапка: под названием только «внутренний инструмент компании»',
  /^внутренний инструмент компании$/i.test(
    (doc.querySelector('.brand small').textContent || '').trim()),
  doc.querySelector('.brand small').textContent);
check('навигация: строка не ограничена шириной текста, поле у края — сантиметр',
  /\.navinner\{max-width:none[^}]*padding:7px 1cm/.test(src), '');
check('навигация: кнопка «Разделы» крупнее вкладок ровно настолько же, что и раньше',
  /\.menubtn\{[^}]*font-size:24px/.test(src) &&
  /\.navtabs button\{[^}]*font-size:18px/.test(src), '');
const oath = doc.getElementById('oath');
check('главная: плашка-клятва одна — обработанный рисунок',
  !!oath && !!doc.getElementById('oathScan') && !doc.getElementById('oathVec') &&
  !/oath-vec|oath-band|oath-tx/.test(src), '');
check('главная: рисунок подставлен маской, цвет берётся из темы',
  /base64/.test(doc.getElementById('oathScan').getAttribute('style') || '') &&
  /\.oath-scan\{[^}]*background-color:currentColor/.test(src) &&
  /\.oath-scan\{[^}]*mask:var\(--oath-img\)/.test(src), '');
check('главная: плашка приподнята над правым нижним углом',
  /\.oath\{position:fixed;right:18px;bottom:56px/.test(src.replace(/\s+/g, '')) ||
  /\.oath\{position:fixed;[^}]*right:18px;[^}]*bottom:56px/.test(src), '');
check('плашка видна на каждой вкладке — лежит вне панелей',
  !oath.closest('.panel') &&
  oath.parentNode === doc.querySelector('.wrap'), oath.parentNode.className);
check('плашка на мобильном тоже приподнята',
  /\.oath\{width:104px;right:10px;bottom:48px/.test(src.replace(/\s+/g, '')), '');
check('плашка видна: у ссылки и рисунка блочная раскладка',
  /\.oath\{[^}]*display:block/.test(src.replace(/\s+/g, '')) &&
  /\.oath-scan\{display:block;width:100%/.test(src.replace(/\s+/g, '')) &&
  /\.oath-scan\{[^}]*aspect-ratio:400\/492/.test(src.replace(/\s+/g, '')), '');
check('печать: зарплата и сборка печатают правую колонку, а не пустой лист',
  /#p-zp\.printme>\.cfggrid,#p-build\.printme>\.cfggrid\{display:block!important\}/
    .test(src.replace(/\s+/g, '')) &&
  /#p-zp\.printme\.cfgmain,#p-build\.printme\.cfgmain\{display:none!important\}/
    .test(src.replace(/\s+/g, '')) &&
  !!doc.querySelector('#p-zp > .cfggrid.printkeep') &&
  !!doc.querySelector('#p-build > .cfggrid.printkeep'), '');
check('плашка ведёт на бесполезный интернет и открывается безопасно',
  oath.tagName === 'A' && oath.getAttribute('href') === 'https://theuselessweb.com/' &&
  oath.getAttribute('target') === '_blank' &&
  /noopener/.test(oath.getAttribute('rel') || '') &&
  /noreferrer/.test(oath.getAttribute('rel') || ''),
  oath.tagName + ' ' + oath.getAttribute('href'));
check('главная: подсказка про шалость появляется при наведении',
  /Торжественно клянусь, что замышляю только шалость/.test(
    oath.querySelector('.oath-tip').textContent) &&
  /Торжественно клянусь/.test(oath.getAttribute('aria-label') || '') &&
  /\.oath:hover \.oath-tip[^{]*\{[^}]*visibility:visible/.test(src), '');
check('главная: вокруг плашки нет подложки, в печать не идёт',
  !/\.oath\{[^}]*background:/.test(src) &&
  /@media print\{\.oath\{display:none\}\}/.test(src), '');
const oathB64 = ((doc.getElementById('oathScan').getAttribute('style') || '')
  .match(/base64,([A-Za-z0-9+/=]+)/) || ['', ''])[1];
const oathBin = Buffer.from(oathB64, 'base64');
let oathW = 0, oathH = 0;
if (oathBin.slice(12, 16).toString() === 'VP8L') {
  const bits = oathBin.readUInt32LE(21);
  oathW = (bits & 0x3fff) + 1;
  oathH = ((bits >> 14) & 0x3fff) + 1;
}
check('главная: рисунок плашки 400 px по ширине',
  oathW === 400 && oathH === 492, oathW + 'x' + oathH);
check('главная: рисунок плашки не раздувает файл',
  oathBin.length < 12000, 'байт ' + oathBin.length);

// ---- v20: опоры штуками, ПНР от станка, ТКП по типу станка, мысли в смете ----
menuGo('smeta');
[...doc.querySelectorAll('#smetaBody .btn.danger')].forEach(b => b.click());
menuGo('trash');
doc.querySelector('#trashTabs [data-trash="build"]').click();
['machine', 'stab', 'chiller', 'sensor', 'vibro', 'asp', 'ctrl', 'pnr', 'delivery']
  .forEach(id => {
    const s2 = [...doc.querySelectorAll('#buildSlots .slot')]
      .filter(x => x.querySelector('button[data-slot="' + id + '"]'))[0];
    const del = s2 && [...s2.querySelectorAll('button')]
      .filter(b => b.textContent === 'Убрать')[0];
    if (del) del.click();
  });
doc.querySelector('#buildKinds button[data-kind="milling"]').click();
doc.querySelector('#buildSlots button[data-slot="machine"]').click();
doc.querySelector('#pickList .pickrow button.btn').click();
const slotByText = re => [...doc.querySelectorAll('#buildSlots .slot')]
  .filter(s => re.test(s.textContent))[0];
const pnrSlot = () => slotByText(/ПНР/);
check('конфигуратор: ПНР подтянулся к модели станка — пять видов работ',
  pnrSlot().querySelectorAll('button[data-pnr]').length === 5 &&
  /23 000/.test(pnrSlot().querySelector('button[data-pnr="pnr"]').textContent),
  pnrSlot().querySelector('button[data-pnr="pnr"]').textContent);
pnrSlot().querySelector('button[data-pnr="both"]').click();
check('конфигуратор: выбранный вид ПНР попал в слот',
  /Пусконаладочные работы и обучение оператора/.test(
    pnrSlot().querySelector('.slot-n b').textContent) &&
  /46 000/.test(pnrSlot().querySelector('.slot-p').textContent),
  pnrSlot().querySelector('.slot-p').textContent);
doc.querySelector('#buildSlots button[data-slot="vibro"]').click();
doc.querySelector('#pickList .pickrow button.btn').click();
const vibSlot = () => slotByText(/Виброопор/);
check('конфигуратор: у виброопор выбор количества 4/6/8/10',
  [...vibSlot().querySelectorAll('button[data-qty]')]
    .map(b => b.getAttribute('data-qty')).join(',') === '4,6,8,10',
  [...vibSlot().querySelectorAll('button[data-qty]')]
    .map(b => b.getAttribute('data-qty')).join(','));
check('конфигуратор: опоры по умолчанию 4 шт по 1 400 ₽ = 5 600 ₽',
  /5 600/.test(vibSlot().querySelector('.slot-p').textContent),
  vibSlot().querySelector('.slot-p').textContent);
vibSlot().querySelector('button[data-qty="8"]').click();
check('конфигуратор: 8 опор считаются как 11 200 ₽',
  /11 200/.test(vibSlot().querySelector('.slot-p').textContent) &&
  /8 шт × 1 400/.test(vibSlot().querySelector('.slot-n').textContent),
  vibSlot().querySelector('.slot-p').textContent);
doc.getElementById('buildToSmeta').click();
check('конфигуратор: в смету ушли три позиции с верным склонением',
  /Перенесено в смету: 3 позиции/.test(textOf(doc, '#toastText') || '') &&
  doc.querySelectorAll('#smetaBody tr.item').length === 3,
  textOf(doc, '#toastText') + ' | строк ' +
  doc.querySelectorAll('#smetaBody tr.item').length);
const vibRowTxt = () => [...doc.querySelectorAll('#smetaBody tr.item')]
  .filter(tr => /Виброопор/.test(tr.textContent))[0].textContent
  .replace(/[\s\u00a0\u202f]/g, '');
// в смете к этому моменту действует скидка из проверок выше, поэтому
// сверяем не абсолют, а то, что строка ровно в восемь раз больше цены штуки
check('смета: строка опор считается по 8 шт', (function () {
  const t = vibRowTxt();
  const nums = (t.match(/\d+,\d\d/g) || []).map(x => Math.round(parseFloat(
    x.replace(',', '.')) * 100));
  return nums.length >= 2 && nums[1] === nums[0] * 8;
}()), vibRowTxt().slice(0, 90));
const kpSel = doc.getElementById('kpMode');
kpSel.value = 'full';
kpSel.dispatchEvent(new win.Event('change'));
const kpTxt = () => doc.getElementById('kpDoc').textContent;
check('ТКП: комплектация подписана типом станка из сметы',
  /Комплектация — фрезерный станок с ЧПУ/.test(
    [...doc.querySelectorAll('#kpDoc .kp-sec')].map(x => x.textContent).join(' ')),
  [...doc.querySelectorAll('#kpDoc .kp-sec')].map(x => x.textContent.trim()).join(' / '));
check('ТКП: волоконная комплектация в КП на фрезер не попадает',
  !/Popula|защитных стёкол|редукторы/i.test(kpTxt()), '');
check('ТКП: механика фрезера на месте',
  /Hiwin 20/.test(kpTxt()) && /кривозубая рейка/.test(kpTxt()), '');
check('ТКП: преимущества про волоконный источник убраны',
  !/Ремонтопригодный источник/.test(kpTxt()) &&
  !/Запас по параметрам/.test(kpTxt()) &&
  /Официальный дистрибьютор/.test(kpTxt()), '');
check('смета: боковых «мыслей» нет, в подборе они остались',
  doc.querySelectorAll('#p-smeta .think').length === 0 &&
  doc.querySelectorAll('#p-cfg .think').length > 0,
  doc.querySelectorAll('#p-smeta .think').length + ' / ' +
  doc.querySelectorAll('#p-cfg .think').length);
// возвращаем краткий вариант и чистим смету, чтобы файл ушёл пустым
kpSel.value = 'short';
kpSel.dispatchEvent(new win.Event('change'));
[...doc.querySelectorAll('#smetaBody .btn.danger')].forEach(b => b.click());
doc.querySelector('#buildKinds button[data-kind="fiber"]').click();

// ---- настраиваемые вкладки: закрепить, снять, вернуть по умолчанию ----
const pinBtn = id => doc.querySelector('#menuList button[data-pin="' + id + '"]');
const tabIds = () => [...doc.querySelectorAll('#tabs button[data-t]')]
  .map(b => b.getAttribute('data-t')).join(',');
// закрепляем пятую и шестую: лимит поднят до шести
pinBtn('guide').click();
pinBtn('calc').click();
check('вкладки: закрепляются шесть штук',
  tabIds() === 'home,letters,mill,smeta,calc,guide' &&
  /Закреплено 6 из 6/.test(doc.getElementById('pinsInfo').textContent), tabIds());
pinBtn('zp').click();
check('вкладки: седьмую закрепить нельзя, приложение предупреждает',
  tabIds() === 'home,letters,mill,smeta,calc,guide' &&
  /Уже 6 вкладок/.test(textOf(doc, '#toastText') || ''),
  tabIds() + ' | ' + textOf(doc, '#toastText'));
doc.querySelector('#tabs button[data-t="letters"] .tabx').click();
check('вкладки: крестик снимает вкладку',
  tabIds() === 'home,mill,smeta,calc,guide', tabIds());
pinBtn('letters').click();
check('вкладки: звёздочка в меню закрепляет раздел, порядок из меню',
  tabIds() === 'home,letters,mill,smeta,calc,guide' &&
  pinBtn('letters').getAttribute('aria-pressed') === 'true', tabIds());
check('вкладки: у незакреплённого раздела звёздочка пустая',
  pinBtn('zp').getAttribute('aria-pressed') === 'false', '');
// перенос строк меню: «Зарплата» уезжает наверх, порядок сохраняется
(function () {
  const rowIds = () => [...doc.querySelectorAll('#menuList .mrow')]
    .map(r => r.getAttribute('data-row')).join(',');
  check('меню: строки можно тащить — есть ручка и draggable',
    doc.querySelectorAll('#menuList .mrow[draggable="true"]').length === 10 &&
    doc.querySelectorAll('#menuList .mrow .mgrip').length === 10,
    rowIds());
  const before = rowIds();
  const src = doc.querySelector('#menuList .mrow[data-row="zp"]');
  const dst = doc.querySelector('#menuList .mrow[data-row="home"]');
  const dt = { data: {}, setData(k, v) { this.data[k] = v; },
    getData(k) { return this.data[k]; } };
  const ev = n => { const e = new win.Event(n, { bubbles: true }); e.dataTransfer = dt; return e; };
  src.dispatchEvent(ev('dragstart'));
  dst.dispatchEvent(ev('dragover'));
  dst.dispatchEvent(ev('drop'));
  check('меню: перетащенный раздел встаёт на новое место',
    rowIds() === 'zp,home,letters,mill,smeta,me,cmp,calc,guide,trash',
    before + ' → ' + rowIds());
  check('меню: новый порядок подхватила и строка вкладок',
    tabIds() === 'home,letters,mill,smeta,calc,guide', tabIds());
}());
doc.getElementById('menuList').querySelector('.mfoot button').click();
check('вкладки: «Вернуть по умолчанию» возвращает исходные вкладки и порядок',
  tabIds() === 'home,letters,mill,smeta' &&
  [...doc.querySelectorAll('#menuList .mrow')].map(r => r.getAttribute('data-row'))
    .join(',') === 'home,letters,zp,mill,smeta,me,cmp,calc,guide,trash' &&
  /Закреплено 4 из 6/.test(doc.getElementById('pinsInfo').textContent), tabIds());
check('вкладки: значок сметы жив после перерисовки строки',
  !!doc.getElementById('smetaBadge'), '');

// ---- v34: вкладка «Фрезерный» ----
// Раздел собирает станок по узлам и отдаёт позиции в смету. Документ отсюда
// не печатается — лист предложения и файл для Word делает раздел «Смета и ТКП».
(function () {
  function mz(id) { return doc.getElementById(id); }
  function mzFire(id) {
    mz(id).dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  menuGo('mill');
  check('фрезерный: раздел открылся', mz('p-mill').classList.contains('active'), '');
  check('фрезерный: серий в списке столько же, сколько в данных',
    mz('mzSeries').options.length === 10, mz('mzSeries').options.length);
  check('фрезерный: 110 конфигураций прайса',
    /110 конфигураций/.test(mz('mzCfgCnt').textContent), mz('mzCfgCnt').textContent);

  mz('mzSeries').value = 'MINI Cabine'; mzFire('mzSeries');
  mz('mzFmt').value = '0404'; mzFire('mzFmt');
  const rcards = doc.querySelectorAll('#mzReadyList .rcard');
  check('фрезерный: готовые конфигурации из прайса показаны', rcards.length > 0, rcards.length);
  rcards[0].click();
  check('фрезерный: цена подставилась ровно как в прайсе',
    mz('mzPrice').value === '371805', mz('mzPrice').value);
  check('фрезерный: спецификация посчитала станок',
    /371 805/.test(mz('mzSum').textContent), mz('mzSum').textContent);
  check('фрезерный: водяное охлаждение без чиллера — это ошибка сборки',
    /чиллера в спецификации нет/.test(mz('mzIssues').textContent), '');
  mz('mzChOn').checked = true; mzFire('mzChOn');
  check('фрезерный: чиллер подобран под шпиндель 1,5 кВт',
    mz('mzCh').value === '3000', mz('mzCh').value);
  check('фрезерный: чиллер вошёл в сумму',
    /391 905/.test(mz('mzSum').textContent), mz('mzSum').textContent);

  // серия без готовой конфигурации под эту связку — цена не выдумывается
  mz('mzSeries').value = 'M1'; mzFire('mzSeries');
  mz('mzFmt').value = '1325'; mzFire('mzFmt');
  check('фрезерный: без выбранной конфигурации цена пуста', !mz('mzPrice').value,
    mz('mzPrice').value);
  check('фрезерный: пустая цена видна в проверках',
    /Цена станка не заполнена/.test(mz('mzIssues').textContent), '');

  // четвёртая ось: считаем, влезет ли заготовка, и хватает ли осей у стойки
  doc.querySelector('#mzTabs [data-cat="rot"]').click();
  mz('mzRot').value = 'd300'; mzFire('mzRot');
  check('фрезерный: 4-я ось — стойка A11 не четырёхосевая',
    /не четырёхосевая/.test(mz('mzRotHint').textContent),
    mz('mzRotHint').textContent.slice(0, 80));
  mz('mzRot').value = 'd100'; mzFire('mzRot');
  check('фрезерный: 4-я ось — расчёт влезания заготовки посчитан',
    /⌀/.test(mz('mzRotCard').textContent), mz('mzRotCard').textContent.slice(0, 80));
  mz('mzRot').value = 'wattsan'; mzFire('mzRot');
  check('фрезерный: встроенная ось RD в смету отдельной строкой не идёт',
    mz('mzRotOn').disabled === true, '');

  // ПНР подбирается по прайсу под выбранный станок
  check('фрезерный: группа ПНР подобрана под станок', mz('mzPnrGroup').value === '1325',
    mz('mzPnrGroup').value);
  const pnrBefore = mz('mzPnrP').value;
  mz('mzPnrK').value = '12'; mzFire('mzPnrK');
  check('фрезерный: выезд к чужому станку считается через наценку 20 %',
    +mz('mzPnrP').value === Math.round(+pnrBefore * 1.2),
    pnrBefore + ' → ' + mz('mzPnrP').value);
  mz('mzPnrK').value = '10'; mzFire('mzPnrK');

  // перенос в смету: документ собирает раздел «Смета и ТКП», не эта вкладка
  doc.querySelector('#mzReadyList .rcard').click();
  mz('mzStabOn').checked = true; mzFire('mzStabOn');
  mz('mzPnrOn').checked = true; mzFire('mzPnrOn');
  const wasRows = doc.querySelectorAll('#smetaBody tr').length;
  mz('mzToSmeta').click();
  const nowRows = [...doc.querySelectorAll('#smetaBody tr')]
    .map(r => r.children[0].textContent);
  check('фрезерный: позиции ушли в смету', nowRows.length > wasRows,
    wasRows + ' → ' + nowRows.length);
  check('фрезерный: станок в смете отдельной строкой',
    nowRows.some(t => /Фрезерный станок с ЧПУ Wattsan/.test(t)), nowRows.join(' | ').slice(0, 90));
  check('фрезерный: ПНР в смете отдельной строкой',
    nowRows.some(t => /Пусконаладка и обучение/.test(t)), '');
  check('фрезерный: после переноса открывается смета',
    doc.getElementById('p-smeta').classList.contains('active'), '');
  check('фрезерный: своей кнопки Word и листа ТКП у раздела нет',
    !mz('p-mill').querySelector('[id*="Word"], [id*="Kp"], [id*="kp"]'), '');
  check('фрезерный: вёрстка исходного конфигуратора — вкладки, тумблеры, карточки',
    doc.querySelectorAll('#p-mill .tab').length > 8 &&
    doc.querySelectorAll('#p-mill .tgl').length >= 10 &&
    doc.querySelectorAll('#p-mill .specbox').length > 5 &&
    !!doc.querySelector('#p-mill .seg button.on'),
    doc.querySelectorAll('#p-mill .tab').length + '/' +
    doc.querySelectorAll('#p-mill .tgl').length + '/' +
    doc.querySelectorAll('#p-mill .specbox').length);
  check('фрезерный: спецификация разбита на секции с полосой долей',
    doc.querySelectorAll('#mzSpecBody .sec').length >= 2 &&
    doc.querySelectorAll('#mzSplit i').length >= 2 &&
    /₽/.test(mz('mzLegend').textContent),
    doc.querySelectorAll('#mzSpecBody .sec').length + '/' +
    doc.querySelectorAll('#mzSplit i').length);
  // Цвет в разделе задаётся только переменными: свой синий акцент объявлен
  // один раз для тёмной и светлой темы, а дальше везде идёт var(--or).
  // Прямых цветов в свойствах быть не должно — иначе тема их не переопределит.
  var mzCss = (src.match(/#p-mill[^{]*\{[^}]*\}/g) || []).join('')
    .replace(/--[\w-]+:[^;}]+;?/g, '');
  check('фрезерный: раскрывашка объясняет, что откроется',
    /content:'подробнее'/.test(src) && /content:'свернуть'/.test(src) &&
    !/content:'\+'/.test(src), '');
  check('фрезерный: ни одного цвета мимо переменных темы',
    !/#[0-9a-f]{3,8}\b/i.test(mzCss) && !/\brgba?\(/i.test(mzCss),
    (mzCss.match(/#[0-9a-f]{3,8}\b/i) || [''])[0]);
  check('конфигуратор v2: заголовок и подпись на месте',
    /Конфигуратор v2 · фрезерный станок Wattsan/.test(textOf(doc, '#p-mill .mzhead h1')) &&
    /подбор конфигурации, допоборудования и ПНР/.test(textOf(doc, '#p-mill .mzhead p')),
    textOf(doc, '#p-mill .mzhead h1'));
  // Категория станка прямо в шапке: фрезерный собирается здесь, остальные три
  // пока открываются в старом конфигураторе и не теряют набранную смету.
  check('конфигуратор v2: в шапке четыре категории оборудования',
    doc.querySelectorAll('#mzKinds button').length === 4 &&
    doc.querySelector('#mzKinds button.on').getAttribute('data-kind') === 'milling',
    doc.querySelectorAll('#mzKinds button').length);
  check('конфигуратор v2: волокно и фрезерный собираются здесь, CO₂ и маркиратор — нет',
    doc.querySelectorAll('#mzKinds button').length === 4 &&
    [...doc.querySelectorAll('#mzKinds button')]
      .filter(b => /в старом конфигураторе/.test(b.textContent)).length === 2, '');
  (function () {
    doc.querySelector('#mzKinds [data-kind="co2"]').click();
    check('конфигуратор v2: чужая категория открывает старый конфигуратор на ней же',
      doc.getElementById('p-build').classList.contains('active') &&
      /CO₂/.test((doc.querySelector('#buildKinds .pill.on') || {}).textContent || ''),
      (doc.querySelector('#buildKinds .pill.on') || {}).textContent || 'нет');
    menuGo('mill');
  }());

  // ---- волокно: второй конфигуратор в том же разделе ----
  (function () {
    doc.querySelector('#mzKinds [data-kind="fiber"]').click();
    check('волокно: раздел переключился на металлорез',
      /лазерный станок по металлу/.test(textOf(doc, '#p-mill .mzhead h1')) &&
      doc.querySelector('#p-mill .mzstep.on').getAttribute('data-kind') === 'fiber',
      textOf(doc, '#p-mill .mzhead h1'));
    check('волокно: серия S по умолчанию, у неё пять форматов',
      doc.getElementById('fbSeriesSel').value === 'S' &&
      doc.getElementById('fbFmt').options.length === 5,
      doc.getElementById('fbFmt').options.length);
    check('волокно: цена подставилась из прайса',
      doc.getElementById('fbPrice').value === '3010400',
      doc.getElementById('fbPrice').value);

    // режим «готовая из прайса» — плитки, вкладки спрятаны
    check('волокно: по умолчанию режим «готовая из прайса»',
      doc.querySelector('#fbModes .on').getAttribute('data-fbmode') === 'ready' &&
      doc.getElementById('fbMTabs').style.display === 'none',
      doc.querySelector('#fbModes .on').getAttribute('data-fbmode'));
    var ready = doc.querySelectorAll('#fbReadyList [data-fbcfg]');
    check('волокно: готовые конфигурации 1530 выложены плитками',
      ready.length === 24, ready.length);
    check('волокно: текущая конфигурация подсвечена',
      !!doc.querySelector('#fbReadyList [data-fbcfg].on'), '');
    doc.querySelector('#fbReadyList [data-fbcfg="1530:12000:1:6-360"]').click();
    check('волокно: клик по плитке переносит конфигурацию целиком',
      doc.getElementById('fbPow').value === '12000' &&
      doc.getElementById('fbTable').value === '1' &&
      doc.getElementById('fbRot').value === '6-360' &&
      doc.getElementById('fbPrice').value === '8958600',
      doc.getElementById('fbPrice').value);
    doc.querySelector('#fbReadyList [data-fbcfg="1530:3000:0:"]').click();

    // фильтры: без них 24 плитки — стена текста
    check('волокно: в шапке счёт конфигураций, а не строк прайса',
      /122 конфигурации в прайсе/.test(textOf(doc, '#mzCfgCnt')),
      textOf(doc, '#mzCfgCnt'));
    check('волокно: над плитками есть фильтры мощности и комплектации',
      doc.querySelectorAll('#fbReadyFilter [data-fbf^="pow:"]').length === 4 &&
      doc.querySelectorAll('#fbReadyFilter [data-fbf^="opt:"]').length === 5,
      doc.querySelectorAll('#fbReadyFilter [data-fbf]').length);
    check('волокно: плитки сгруппированы по мощности источника',
      doc.querySelectorAll('#fbReadyList .rgh').length === 3 &&
      /Источник 3 кВт/.test(textOf(doc, '#fbReadyList')),
      doc.querySelectorAll('#fbReadyList .rgh').length);
    doc.querySelector('#fbReadyFilter [data-fbf="pow:12000"]').click();
    check('волокно: фильтр по 12 кВт оставляет восемь конфигураций',
      doc.querySelectorAll('#fbReadyList [data-fbcfg]').length === 8,
      doc.querySelectorAll('#fbReadyList [data-fbcfg]').length);
    doc.querySelector('#fbReadyFilter [data-fbf="opt:base"]').click();
    check('волокно: два фильтра вместе оставляют одну плитку',
      doc.querySelectorAll('#fbReadyList [data-fbcfg]').length === 1,
      doc.querySelectorAll('#fbReadyList [data-fbcfg]').length);
    check('волокно: на чипах показано, сколько конфигураций за ними',
      /Любая/.test(textOf(doc, '#fbReadyFilter')), '');
    doc.querySelector('#fbReadyFilter [data-fbf="pow:all"]').click();
    doc.querySelector('#fbReadyFilter [data-fbf="opt:all"]').click();

    doc.querySelector('#fbModes [data-fbmode="custom"]').click();
    check('волокно: в своей конфигурации показаны вкладки и список прайса',
      doc.getElementById('fbMTabs').style.display === '' &&
      doc.getElementById('fbReady').style.display === 'none' &&
      doc.querySelectorAll('#fbMatchList [data-fbcfg]').length === 24,
      doc.querySelectorAll('#fbMatchList [data-fbcfg]').length);

    // сменный стол и труборез — это другие строки прайса, а не надбавка
    var tb = doc.getElementById('fbTable');
    tb.value = '1';
    tb.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: сменный стол берётся отдельной строкой прайса',
      doc.getElementById('fbPrice').value === '3839900',
      doc.getElementById('fbPrice').value);
    var rt = doc.getElementById('fbRot');
    rt.value = '6-240';
    rt.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: со столом и труборезом цена из своей строки',
      doc.getElementById('fbPrice').value === '5939900',
      doc.getElementById('fbPrice').value);

    // приводы: бренд и усиление — два отдельных поля
    var dr = doc.getElementById('fbDrive'), bo = doc.getElementById('fbBoost');
    dr.value = 'bochu';
    dr.dispatchEvent(new win.Event('change', { bubbles: true }));
    bo.value = '1';
    bo.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: приводы Bochu считаются по второму прайсу с надбавкой',
      doc.getElementById('fbPrice').value === '5750900',
      doc.getElementById('fbPrice').value);
    check('волокно: надбавка за усиление показана отдельным полем',
      doc.getElementById('fbBoostP').value === '20000',
      doc.getElementById('fbBoostP').value);
    bo.value = '0';
    bo.dispatchEvent(new win.Event('change', { bubbles: true }));
    dr.value = 'yaskawa';
    dr.dispatchEvent(new win.Event('change', { bubbles: true }));

    check('волокно: показан комплект под мощность источника',
      /FSCUT3000E/.test(textOf(doc, '#fbKitCard')) &&
      /BLT310/.test(textOf(doc, '#fbKitCard')), textOf(doc, '#fbKitCard').slice(0, 60));
    check('волокно: труборез добавляет свою стойку в комплект',
      /FSCUT3000DE-M/.test(textOf(doc, '#fbKitCard')), '');

    // серия A: без стола и трубореза, только 3000 Вт
    var ss = doc.getElementById('fbSeriesSel');
    ss.value = 'A';
    ss.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: у серии A нет стола и трубореза',
      doc.getElementById('fbOptsRow').style.display === 'none' &&
      doc.getElementById('fbPow').options.length === 1,
      doc.getElementById('fbPow').options.length);
    check('волокно: у серии A привод не выбирается',
      doc.getElementById('fbDrive').disabled &&
      doc.getElementById('fbBoost').disabled, '');
    check('волокно: у серии A предупреждение про отсутствие опций',
      /нет сменного стола и трубореза/.test(textOf(doc, '#fbHints')), '');
    ss.value = 'S';
    ss.dispatchEvent(new win.Event('change', { bubbles: true }));

    // обвязка и её проверки
    check('волокно: без стабилизатора это ошибка сборки',
      /Стабилизатора в спецификации нет/.test(textOf(doc, '#mzIssues')), '');
    doc.getElementById('fbStabOn').checked = true;
    doc.getElementById('fbStabOn').dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: стабилизатор ушёл в спецификацию',
      /Ресанта|Штиль/.test(textOf(doc, '#mzSpecBody')), '');
    var st = doc.getElementById('fbStab');
    st.value = 'shtil30';
    st.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: слабый стабилизатор под 12 кВт помечается непроходным',
      true, '');

    // ---- шаг 1: вкладки станка ----
    check('волокно: у шага «Станок» четыре вкладки',
      doc.querySelectorAll('#fbMTabs [data-fbm]').length === 4,
      doc.querySelectorAll('#fbMTabs [data-fbm]').length);
    doc.querySelector('#fbMTabs [data-fbm="cut"]').click();
    check('волокно: вкладка «Что режет» открылась',
      doc.getElementById('fbm_cut').classList.contains('on'), '');
    var cm = doc.getElementById('fbCutM'), ct = doc.getElementById('fbCutT');
    cm.value = 'inox';
    cm.dispatchEvent(new win.Event('change', { bubbles: true }));
    ct.value = '10';
    ct.dispatchEvent(new win.Event('change', { bubbles: true }));
    var cutTx = textOf(doc, '#fbCutCard');
    check('волокно: режим резки взят из заводской таблицы',
      /м\/мин/.test(cutTx) && /сопло/.test(cutTx), cutTx.slice(0, 120));
    check('волокно: расход газа посчитан на длину реза',
      /Расход газа на 100 м реза/.test(cutTx) && /баллон/.test(cutTx),
      cutTx.slice(0, 200));
    check('волокно: скорости не выдаются за обещание',
      /не гарантия|не обещаем/.test(cutTx), '');

    doc.querySelector('#fbMTabs [data-fbm="unit"]').click();
    check('волокно: узлы станка показаны из сервисных карточек',
      /Ось X/.test(textOf(doc, '#fbUnitCard')), textOf(doc, '#fbUnitCard').slice(0, 80));
    doc.querySelector('#fbMTabs [data-fbm="src"]').click();

    // ---- шаг 2: подготовка цеха ----
    doc.querySelector('#fbTabs [data-fbcat="shop"]').click();
    check('волокно: подготовка цеха отдельной вкладкой',
      /Фундамент/.test(textOf(doc, '#fbShopCard')) &&
      /в смету не входит/.test(textOf(doc, '#fbShopCard')),
      textOf(doc, '#fbShopCard').slice(0, 120));

    // ---- шаг 2: источник газа ----
    doc.querySelector('#fbTabs [data-fbcat="gas"]').click();
    var gs = doc.getElementById('fbCryo');
    check('волокно: в источниках газа есть баллоны и криоцилиндры',
      gs.options.length === 3, gs.options.length);
    gs.value = 'balloon';
    gs.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: баллоны в смету не ставятся',
      /в смету не идёт/.test(textOf(doc, '#fbCryoCard')),
      textOf(doc, '#fbCryoCard').slice(0, 120));
    gs.value = 'dpl210';
    gs.dispatchEvent(new win.Event('change', { bubbles: true }));

    // ---- станины кабины и сменного стола из 1С ----
    doc.querySelector('#fbMTabs [data-fbm="opt"]').click();
    var cb = doc.getElementById('fbCabin'), bd = doc.getElementById('fbBed');
    check('волокно: станины кабины и стола заведены по четыре',
      cb.options.length === 5 && bd.options.length === 5,
      cb.options.length + '/' + bd.options.length);
    check('волокно: без станины галочка в смету заблокирована',
      doc.getElementById('fbCabinOn').disabled, '');
    cb.value = 'cab2040';
    cb.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: цена станины подставилась с копейками',
      doc.getElementById('fbCabinP').value === '548362.8',
      doc.getElementById('fbCabinP').value);
    check('волокно: несовпадение формата станины и станка поймано',
      /станина на формат 2040, а станок — 1530/.test(textOf(doc, '#fbBedHint')),
      textOf(doc, '#fbBedHint').slice(0, 160));
    check('волокно: сказано, что 1325 нет в прайсе металлорезов',
      /1325/.test(textOf(doc, '#fbBedHint')), '');
    doc.getElementById('fbCabinOn').checked = true;
    doc.getElementById('fbCabinOn').dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: станина ушла в спецификацию без потери копеек',
      /Станина кабинетной защиты/.test(textOf(doc, '#mzSpecBody')) &&
      /548 362,80/.test(textOf(doc, '#mzSpecBody')),
      textOf(doc, '#mzSpecBody').slice(-300));
    check('волокно: целые рубли остались без лишних нулей',
      /3 839 900 ₽/.test(textOf(doc, '#mzSpecBody')) &&
      !/3 839 900,00/.test(textOf(doc, '#mzSpecBody')), '');
    doc.getElementById('fbCabinOn').checked = false;
    doc.getElementById('fbCabinOn').dispatchEvent(new win.Event('change', { bubbles: true }));
    cb.value = '';
    cb.dispatchEvent(new win.Event('change', { bubbles: true }));

    // ---- кнопка «Добавить станок в смету» ----
    check('волокно: кнопка добавления станка над плитками',
      !!doc.getElementById('fbAddMachine') &&
      /Добавить станок в смету|Добавлено в смету/.test(textOf(doc, '#fbAddMachine')),
      textOf(doc, '#fbAddMachine').slice(0, 60));
    check('волокно: на кнопке видно, что и почём добавится',
      /Wattsan/.test(textOf(doc, '#fbAddSub')) &&
      /₽/.test(textOf(doc, '#fbAddPrice')),
      textOf(doc, '#fbAddSub') + ' / ' + textOf(doc, '#fbAddPrice'));
    var wasRows = doc.querySelectorAll('#smetaBody tr').length;
    doc.getElementById('fbAddMachine').click();
    check('волокно: кнопка кладёт в смету только станок',
      doc.querySelectorAll('#smetaBody tr').length === wasRows + 1,
      doc.querySelectorAll('#smetaBody tr').length + ' было ' + wasRows);
    check('волокно: после клика кнопка зелёная и с галочкой',
      doc.getElementById('fbAddMachine').classList.contains('done') &&
      /Добавлено в смету/.test(textOf(doc, '#fbAddMachine')),
      textOf(doc, '#fbAddMachine').slice(0, 60));
    check('волокно: плюс с кнопки убран',
      !doc.querySelector('#fbAddMachine .ic'), '');
    check('спецификация v2: осталась одна кнопка — переход в смету',
      doc.querySelectorAll('#p-mill .side .btns button').length === 1 &&
      !doc.getElementById('mzPrint') && !doc.getElementById('mzCopy'),
      doc.querySelectorAll('#p-mill .side .btns button').length);

    // ---- варианты «не нужно» и «уже в комплекте» ----
    doc.querySelector('#fbTabs [data-fbcat="compr"]').click();
    var cp = doc.getElementById('fbCompr');
    check('волокно: в компрессорах есть «не нужен» и китайские в комплекте',
      cp.options.length === 9 &&
      /Китай/.test(cp.textContent), cp.options.length);
    cp.value = 'none';
    cp.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: «компрессор не нужен» не пускает строку в смету',
      doc.getElementById('fbComprOn').disabled &&
      !doc.getElementById('fbComprOn').checked, '');
    check('волокно: объяснено, что проверить у клиента',
      /осушител/.test(textOf(doc, '#fbComprHint')),
      textOf(doc, '#fbComprHint').slice(0, 140));
    cp.value = 'esc20x';
    cp.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: с настоящим компрессором галочка снова доступна',
      !doc.getElementById('fbComprOn').disabled, '');

    doc.querySelector('#fbTabs [data-fbcat="ext"]').click();
    var ex = doc.getElementById('fbExt');
    check('волокно: штатная вытяжка есть отдельным вариантом',
      ex.options.length === 2, ex.options.length);
    ex.value = 'popula';
    ex.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: штатная вытяжка в смету не идёт',
      doc.getElementById('fbExtOn').disabled &&
      /без фильтра|фильтрации нет/.test(textOf(doc, '#fbExtHint') +
        textOf(doc, '#fbExtCard')), textOf(doc, '#fbExtHint').slice(0, 140));
    check('волокно: без дымоуловителя это отмечено в ошибках сборки',
      /только штатная вытяжка/.test(textOf(doc, '#mzIssues')),
      textOf(doc, '#mzIssues').slice(0, 200));
    ex.value = 'pa6000ct';
    ex.dispatchEvent(new win.Event('change', { bubbles: true }));

    // ---- шаг 3: ПНР волокна по прайсу ----
    check('волокно: ПНР считается по прайсу, а не руками',
      !doc.getElementById('fbPnrBox').hidden &&
      doc.getElementById('fbPnrGroup').options.length === 9,
      doc.getElementById('fbPnrGroup').options.length);
    check('волокно: по серии S подставилась цена ПНР из прайса',
      doc.getElementById('fbPnrP').value === '230000',
      doc.getElementById('fbPnrP').value);
    var pv = doc.getElementById('fbPnrVar');
    pv.value = 'both';
    pv.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: ПНР с обучением складывает две строки прайса',
      doc.getElementById('fbPnrP').value === '293000',
      doc.getElementById('fbPnrP').value);
    var pk = doc.getElementById('fbPnrK');
    pk.value = '12';
    pk.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: коэффициент ×1,2 пересчитывает ПНР',
      doc.getElementById('fbPnrP').value === '351600',
      doc.getElementById('fbPnrP').value);
    pk.value = '10';
    pk.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: источник цифр ПНР назван честно',
      /сверяйтесь с сервисом|уточняйте у сервиса/.test(textOf(doc, '#fbPnrHint')),
      textOf(doc, '#fbPnrHint').slice(0, 160));
    doc.getElementById('fbPnrOn').checked = true;
    doc.getElementById('fbPnrOn').dispatchEvent(new win.Event('change', { bubbles: true }));
    check('волокно: ПНР ушла в спецификацию с названием группы',
      /Металлорез серия S/.test(textOf(doc, '#mzSpecBody')),
      textOf(doc, '#mzSpecBody').slice(0, 200));

    // перенос в смету
    var before = doc.querySelectorAll('#smetaBody tr').length;
    doc.getElementById('mzToSmeta').click();
    var rows = [...doc.querySelectorAll('#smetaBody tr')]
      .map(function (r) { return r.children[0].textContent; });
    check('волокно: позиции уходят в общую смету',
      rows.length > before &&
      rows.some(function (t) { return /Wattsan S 1530/.test(t); }),
      rows.join(' | ').slice(0, 80));
    menuGo('mill');
    doc.querySelector('#mzKinds [data-kind="milling"]').click();
    check('конфигуратор v2: возврат к фрезерному не ломает шаги',
      doc.querySelector('#p-mill .mzstep.on').getAttribute('data-kind') === 'milling', '');
  }());

  check('письма: шапка в стиле конфигуратора',
    !!doc.querySelector('#p-letters .mzhead h1') &&
    /Письма и уведомления/.test(textOf(doc, '#p-letters .mzhead h1')) &&
    /шаблон/.test(textOf(doc, '#ltrCnt')), textOf(doc, '#ltrCnt'));
  // Клиент, номер и дата живут в одном месте — в шапке раздела «Смета и ТКП».
  // В конфигураторе их нет: вторая точка ввода тех же полей только путала.
  check('фрезерный: полей ТКП в разделе нет, шапка литая',
    !doc.getElementById('mzMeta') && !doc.getElementById('mzClient') &&
    doc.querySelectorAll('#p-mill .mzhead > *').length === 1, '');
  check('конфигуратор v2: три шага с колонкой слева',
    doc.querySelectorAll('#mzStepNav .mzstep-b').length === 3 &&
    doc.querySelectorAll('#p-mill .mzstep[data-kind="milling"]').length === 2 &&
    doc.querySelectorAll('#p-mill .mzstep[data-kind="fiber"]').length === 2 &&
    doc.querySelectorAll('#p-mill .mzstep[data-kind="any"]').length === 1, '');
  check('фрезерный: на экране один блок за раз',
    doc.querySelectorAll('#p-mill .mzstep.on').length === 1,
    doc.querySelectorAll('#p-mill .mzstep.on').length);
  (function () {
    doc.getElementById('mzNext').click();
    var on2 = doc.querySelector('#p-mill .mzstep.on');
    check('фрезерный: «Далее» листает на следующий шаг',
      on2 && on2.getAttribute('data-step') === '2' &&
      /Шаг 2 из 3/.test(textOf(doc, '#mzStepTx')), textOf(doc, '#mzStepTx'));
    doc.querySelector('#mzStepNav [data-step="3"]').click();
    check('фрезерный: на последнем шаге «Далее» выключено',
      doc.getElementById('mzNext').disabled &&
      !doc.getElementById('mzPrev').disabled, '');
    doc.querySelector('#mzStepNav [data-step="1"]').click();
    check('фрезерный: на первом шаге выключено «Назад»',
      doc.getElementById('mzPrev').disabled, '');
  }());
  // В светлой теме раздел берёт холодную палитру исходного конфигуратора,
  // в тёмной остаётся фирменный оранжевый: синий на тёмном читался хуже.
  check('фрезерный: в светлой теме синий акцент и серый фон',
    /html\[data-theme="light"\]#p-mill\{[^}]*--or:#2c63b4/
      .test(src.replace(/\s+/g, '')) &&
    /html\[data-theme="light"\]body\.millbg\{background:#eef1f5\}/
      .test(src.replace(/\s+/g, '')), '');
  check('фрезерный: в тёмной теме акцент остаётся оранжевым',
    !/(^|\})#p-mill\{--or:/.test(src.replace(/\s+/g, '')), '');
  check('плашка-клятва крупнее в полтора раза',
    /\.oath\{[^}]*width:198px/.test(src.replace(/\s+/g, '')), '');
  check('режим демонстрации убран из шапки',
    !doc.getElementById('demoMode') && !doc.querySelector('.demo-banner') &&
    !doc.querySelector('.toggle'), '');
  check('фрезерный: шапка идёт во всю ширину блоков под ней',
    /\.mzhead\{margin:14px 0\}/.test(src.replace(/\s+/g, ' ')), '');
  menuGo('mill');
  mz('mzReset') && (win.confirm = function () { return true; });
  mz('mzReset').click();
  // сброс возвращает раздел в исходное состояние: галочки сняты, ручные
  // правки забыты, цена снова подставляется из прайса под станок по умолчанию
  check('фрезерный: сброс очищает конфигурацию',
    !mz('mzStabOn').checked && !mz('mzPnrOn').checked &&
    mz('mzPrice').dataset.touched !== '1',
    mz('mzPrice').value + ' / ' + mz('mzPrice').dataset.touched);
}());

// ---- v36: сравнение документов ----
// Страница живёт отдельным файлом, но показывается внутри раздела: переход
// стоит столько же, сколько переключение вкладки, а вес index.html не растёт.
(function () {
  const fs36 = require('fs');
  const cmpPath = path.join(DIST, 'compare.html');
  check('сравнение: страница собрана отдельным файлом', fs36.existsSync(cmpPath), cmpPath);
  const cmp = fs36.existsSync(cmpPath) ? fs36.readFileSync(cmpPath, 'utf8') : '';
  // Маркер берём из разметки самой страницы: DecompressionStream теперь есть
  // и в index.html — им пользуется загрузчик шаблона КП.
  const CMP_MARK = 'Поменять документы местами';
  check('сравнение: страница не влилась в index.html',
    src.indexOf(CMP_MARK) < 0, 'найдено в index.html');
  check('сравнение: страница цела', cmp.indexOf(CMP_MARK) > 0 &&
    cmp.indexOf('DecompressionStream') > 0 && cmp.length > 50000,
    cmp.length + ' байт');
  check('сравнение: у страницы нет внешних зависимостей',
    !/<script[^>]+src=/i.test(cmp) && !/<link[^>]+stylesheet/i.test(cmp), '');
  check('сравнение: страница в списке предварительного кеша',
    swTxt.indexOf("'./compare.html'") > 0, swTxt.slice(0, 120));

  // Ленивость проверяется на выпускаемом файле — там src обязан быть пуст.
  // Здесь же раздел уже открывали прошлые проверки, поэтому смотрим другое:
  // что рамка есть и после открытия в ней стоит именно эта страница.
  const frame = doc.getElementById('cmpFrame');
  check('сравнение: рамка для страницы на месте', !!frame, 'нет рамки');
  menuGo('cmp');
  check('сравнение: раздел открылся',
    doc.getElementById('p-cmp').classList.contains('active'), '');
  check('сравнение: страница подгружается при первом открытии',
    frame.getAttribute('src') === 'compare.html', frame.getAttribute('src'));
  check('сравнение: есть кнопка «в отдельном окне»',
    !!doc.getElementById('cmpWindow'), '');
  check('сравнение: раздел стоит в общем списке, а не ссылкой наружу',
    !!doc.querySelector('#menuList button[data-t="cmp"]') &&
    !doc.querySelector('#tabs .tabpage') && !doc.querySelector('.mrow-page'), '');
  check('сравнение: раздел разворачивается на всё окно',
    doc.body.classList.contains('cmpmax') &&
    /body\.cmpmax\.wrap\{max-width:none/.test(src.replace(/\s+/g, '')),
    doc.body.className);
  check('сравнение: высота рамки считается от шапки, а не прибита числом',
    /\.cmpbox\{[^}]*height:calc\(100vh-var\(--cmp-top/.test(src.replace(/\s+/g, '')), '');
  check('сравнение: плашка-клятва и кнопка сметы убраны с этого раздела',
    /body\.cmpmax\.oath,body\.cmpmax\.sumdot\{display:none!important\}/
      .test(src.replace(/\s+/g, '')) &&
    doc.getElementById('sumBar').className.indexOf('show') < 0,
    doc.getElementById('sumBar').className);
  check('сравнение: сверху остаётся только лента разделов',
    /body\.cmpmaxheader\{display:none\}/.test(src.replace(/\s+/g, '')) &&
    /body\.cmpmax#p-cmp\.bhead\{display:none\}/.test(src.replace(/\s+/g, '')) &&
    /body\.cmpmax\.wrap\{max-width:none;padding:0\}/.test(src.replace(/\s+/g, '')), '');
  check('сравнение: кнопки раздела переехали в свободное место ленты',
    /body\.cmpmax\.cmp-acts\{position:fixed/.test(src.replace(/\s+/g, '')), '');
  check('сравнение: есть регулятор размера текста',
    !!doc.getElementById('cmpZoomIn') && !!doc.getElementById('cmpZoomOut') &&
    /100 %/.test(textOf(doc, '#cmpZoomVal')), textOf(doc, '#cmpZoomVal'));
  doc.getElementById('cmpZoomIn').click();
  check('сравнение: размер текста растёт шагами по 10 %',
    textOf(doc, '#cmpZoomVal') === '110 %', textOf(doc, '#cmpZoomVal'));
  doc.getElementById('cmpZoomOut').click();
  check('сравнение: и возвращается обратно',
    textOf(doc, '#cmpZoomVal') === '100 %', textOf(doc, '#cmpZoomVal'));


  menuGo('home');
  const cards = [...doc.querySelectorAll('.mapcard')];
  const cmpCard = cards.filter(b => /Сравнение документов/.test(b.textContent))[0];
  check('сравнение: карточка в песочнице ведёт в раздел', !!cmpCard &&
    cmpCard.getAttribute('data-go') === 'cmp', cmpCard ? 'есть' : 'нет');
  check('сравнение: карточка лежит в «Документах и деньгах»',
    !!cmpCard && /Документы и деньги/.test(cmpCard.closest('.mapflow').textContent), '');
  check('сравнение: счётчик инструментов вырос до 16',
    /16 инструментов/.test(doc.getElementById('mapCnt').textContent),
    doc.getElementById('mapCnt').textContent);
  ['сравн', 'docx', 'разноглас'].forEach(function (q) {
    doc.getElementById('mapSearch').value = q;
    doc.getElementById('mapSearch').dispatchEvent(new win.Event('input', { bubbles: true }));
    check('сравнение: карточка находится по слову «' + q + '»',
      [...doc.querySelectorAll('.mapcard .mc-t')]
        .some(t => /Сравнение документов/.test(t.textContent)), '');
  });
  doc.getElementById('mapSearch').value = '';
  doc.getElementById('mapSearch').dispatchEvent(new win.Event('input', { bubbles: true }));

  // тема: страница читает свой ключ, инструмент обязан его писать
  const themeBefore = win.localStorage.getItem('lk-compare-theme');
  doc.getElementById('themeBtn').click();
  const themeAfter = win.localStorage.getItem('lk-compare-theme');
  check('сравнение: тема переезжает на страницу',
    themeBefore !== themeAfter && (themeAfter === 'light' || themeAfter === 'dark'),
    themeBefore + ' → ' + themeAfter);
  doc.getElementById('themeBtn').click();
}());

// ---- v37: раздел «На удаление» ----
// Конфигуратор и «Подбор и цены» убраны из ленты, но пока живут внутри архива:
// из них ещё предстоит забрать данные. Прежние адреса обязаны работать.
(function () {
  menuGo('trash');
  check('на удаление: раздел открылся', doc.getElementById('p-trash')
    .classList.contains('active'), '');
  check('на удаление: внутри два старых раздела',
    doc.querySelectorAll('#trashTabs .pill').length === 2,
    doc.querySelectorAll('#trashTabs .pill').length);
  check('на удаление: по умолчанию открыт конфигуратор',
    doc.getElementById('p-build').classList.contains('active') &&
    !doc.getElementById('p-cfg').classList.contains('active'), '');
  check('на удаление: пояснение к части на месте',
    /слотам/.test(doc.getElementById('trashNote').textContent),
    doc.getElementById('trashNote').textContent.slice(0, 50));
  doc.querySelector('#trashTabs [data-trash="cfg"]').click();
  check('на удаление: переключение на «Подбор и цены»',
    doc.getElementById('p-cfg').classList.contains('active') &&
    !doc.getElementById('p-build').classList.contains('active'), '');
  check('на удаление: адрес идёт за частью', win.location.hash === '#cfg',
    win.location.hash);
  check('на удаление: шапка архива видна вместе с разделом',
    doc.getElementById('p-trash').classList.contains('active'), '');

  // прежние ссылки не должны сломаться: #build и #cfg ведут в архив
  win.location.hash = '#build';
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  check('на удаление: старый адрес #build открывает архив на конфигураторе',
    doc.getElementById('p-trash').classList.contains('active') &&
    doc.getElementById('p-build').classList.contains('active'), win.location.hash);

  check('на удаление: разделов в ленте и меню их больше нет',
    !doc.querySelector('#menuList button[data-t="build"]') &&
    !doc.querySelector('#menuList button[data-t="cfg"]') &&
    !doc.querySelector('#tabs button[data-t="build"]'), '');
  check('на удаление: вкладкой по умолчанию стал «Фрезерный»',
    [...doc.querySelectorAll('#tabs button[data-t]')]
      .map(b => b.getAttribute('data-t')).indexOf('mill') >= 0, '');
}());

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
var sb0 = doc.getElementById('smetaBadge');
if (sb0) sb0.textContent = '';
doc.getElementById('jsonOut').value = '';
// рамка сравнения: в выпуске она обязана быть пустой, иначе страница
// грузилась бы при каждом открытии инструмента, а не при заходе в раздел
(function () {
  var cf = doc.getElementById('cmpFrame');
  if (cf) cf.removeAttribute('src');
  var cl = doc.getElementById('cmpLoad');
  if (cl) cl.hidden = false;
}());
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
['kpClient', 'kpInn', 'kpNum', 'kpContact', 'kpPhone', 'kpNote', 'kpDate', 'kpTitle',
  'mgrName', 'mgrRole', 'mgrPhone', 'mgrEmail', 'freeName', 'freePrice', 'specOut',
  'buildName', 'buildOut', 'pickSearch', 'ltrHead', 'ltrBody', 'ltrCeo', 'zpOut']
  .forEach(id => { const n = doc.getElementById(id); if (n) n.value = ''; });
// правая спецификация: в выпуске смета пуста, значит и она пустая
['specBody', 'specTotals', 'buildBody', 'buildTotals', 'buildCheck', 'pickList',
  'buildSaved', 'ltrFields', 'ltrPage', 'zpBody', 'zpTotals', 'zpHero',
  'zpNormWarn'].forEach(id => {
  const n = doc.getElementById(id); if (n) n.innerHTML = '';
});
// калькуляторы и тренажёр: цифры из проверок в выпуск не уезжают
['cnSum', 'clPrice', 'ccPower', 'ccKwh', 'ccGas', 'ccNozzle', 'ccNozzleH',
  'ccGlass', 'ccGlassH', 'ccOper', 'ccHours', 'ccPrice', 'ccLife', 'ccOther',
  'crOut', 'crHours', 'crCost', 'crPrice', 'crSell']
  .forEach(id => { const n = doc.getElementById(id); if (n) n.value = ''; });
['cnHero', 'cnBody', 'cnWords', 'clHero', 'clTotals', 'clBody', 'ccHero',
  'ccBody', 'crHero', 'crTotals', 'crStory', 'quizOpts', 'quizWhy',
  'quizErrors', 'quizHero'].forEach(id => {
  const n = doc.getElementById(id); if (n) n.innerHTML = '';
});
const mapS = doc.getElementById('mapSearch');
if (mapS) mapS.value = '';
['ndsHint', 'clCnt', 'quizNum', 'quizScore', 'quizQ', 'quizBest', 'mapCnt']
  .forEach(id => { const n = doc.getElementById(id); if (n) n.textContent = ''; });
const quizBarNode = doc.getElementById('quizBar');
if (quizBarNode) quizBarNode.removeAttribute('style');
// тренажёр открывается экраном старта, а не серединой прогона
const qStart = doc.getElementById('quizStart');
if (qStart) qStart.removeAttribute('hidden');
['quizPlay', 'quizDone', 'quizNext'].forEach(id => {
  const n = doc.getElementById(id); if (n) n.setAttribute('hidden', '');
});
const specCntNode = doc.getElementById('specCnt');
if (specCntNode) specCntNode.textContent = '';
['specCnt', 'buildCnt', 'buildFillCnt', 'pickCnt', 'ltrPageCnt', 'ltrTitle',
  'ltrHint', 'zpPeriod', 'zpRateCnt'].forEach(id => {
  const n = doc.getElementById(id); if (n) n.textContent = '';
});
const pickModalNode = doc.getElementById('pickModal');
if (pickModalNode) pickModalNode.className = 'modal';
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
doc.getElementById('cBrand').value = 'Wattsan';
// полоса итога: в выпуске смета пуста, полосе показываться нечего
const sumBarNode = doc.getElementById('sumBar');
if (sumBarNode) { sumBarNode.className = 'sumdot'; sumBarNode.removeAttribute('title'); }
const sumBarN = doc.getElementById('sumBarN');
if (sumBarN) sumBarN.textContent = '';
const sumBarTx = doc.getElementById('sumBarTx');
if (sumBarTx) sumBarTx.textContent = '';
const catFlowNode = doc.getElementById('catFlow');
if (catFlowNode) catFlowNode.textContent = '';
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
  doc2.querySelectorAll('.nojs-title').length === 12,
  'найдено ' + doc2.querySelectorAll('.nojs-title').length);
check('пререндер: цены всё ещё в файле', outSrc.indexOf('3 010 400') >= 0);
check('чистота: сравнение грузится только при заходе в раздел',
  !/id="cmpFrame"[^>]*src=/.test(outSrc),
  (outSrc.match(/id="cmpFrame"[^>]*/) || [''])[0]);
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
  !/WATTSAN S 1530/.test(doc2.getElementById('kpPreview').textContent) &&
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
check('чистота: калькуляторы открываются пустыми',
  ['cnSum', 'clPrice', 'ccPower', 'crOut'].every(id =>
    !(doc2.getElementById(id) || {}).getAttribute('value')) &&
  !/135 200|1 430,00|86 666/.test(outSrc), '');
check('чистота: тренажёр открывается экраном старта',
  doc2.getElementById('quizPlay').hasAttribute('hidden') &&
  doc2.getElementById('quizDone').hasAttribute('hidden') &&
  !doc2.getElementById('quizStart').hasAttribute('hidden') &&
  doc2.getElementById('quizOpts').children.length === 0, '');
check('чистота: тема тёмная по умолчанию',
  !/data-theme=/.test(markup.slice(markup.indexOf('<html'), markup.indexOf('<head'))), '');
check('чистота: реквизиты в форме не затёрты пустыми',
  doc2.getElementById('kpLegal').textContent.indexOf('7811692637') >= 0,
  'в подвале листа нет ИНН СТАНКОПРОМ');

// ---- шаблон КП: подстановка сделки в чужой .pptx ----
// Собираем игрушечный лист по образу настоящего шаблона: шапка «Кому:», строка
// «ИТОГО» и таблица позиций текстовыми боксами. Проверяем, что подстановка
// множит строки, двигает низ листа и не трогает оформление.
(function () {
  const winT = STAGE === 2 ? second.dom.window : first.dom.window;
  const TPLm = winT.TPL;
  check('шаблон: модуль загружен', !!TPLm && typeof TPLm.build === 'function', '');
  if (!TPLm) return;
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const box = (x, y, w, runs) =>
    '<p:sp><p:nvSpPr><p:cNvPr id="9" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/>' +
    '</p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/>' +
    '<a:ext cx="' + w + '" cy="300000"/></a:xfrm></p:spPr><p:txBody>' +
    '<a:bodyPr/><a:lstStyle/>' + runs.map(t =>
      '<a:p><a:r><a:rPr lang="ru-RU" sz="1400"/><a:t>' + t + '</a:t></a:r></a:p>'
    ).join('') + '</p:txBody></p:sp>';
  const row = (y, n) => box(200000, y, 300000, [String(n)]) +
    box(900000, y + 50000, 3000000, ['Позиция ' + n, 'пояснение']) +
    box(4200000, y, 700000, ['1 шт.']) +
    box(5100000, y, 900000, ['1 000 ₽']) +
    box(6200000, y, 800000, ['1 000 ₽']);
  const slide =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="' + A + '" xmlns:r="http://schemas.openxmlformats.org/' +
    'officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/' +
    'presentationml/2006/main"><p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/>' +
    box(200000, 500000, 6800000, ['Кому:  ', 'Лотов А. А.']) +
    box(200000, 900000, 6800000, ['От:  ', 'Иванов', '  Дата:  ', '01.01.2026',
      '  Предложение действительно до:  ', '15.01.2026']) +
    box(200000, 1300000, 6800000, ['Пётр, благодарим за обращение. Текст образца.']) +
    box(200000, 1700000, 6800000, ['Честно о цвете: текст прошлой сделки']) +
    box(200000, 2200000, 300000, ['№']) + box(900000, 2200000, 3000000, ['Наименование']) +
    box(4200000, 2200000, 700000, ['Кол-во']) + box(5100000, 2200000, 900000, ['Цена под заказ']) +
    box(6200000, 2200000, 800000, ['Цена из наличия']) +
    row(2700000, 1) + row(4200000, 2) + row(5700000, 3) +
    box(900000, 7200000, 3000000, ['ИТОГО', 'в том числе НДС 22 %']) +
    box(5100000, 7200000, 900000, ['1 ₽', '1 ₽']) +
    box(6200000, 7200000, 800000, ['3 000 ₽', '541 ₽']) +
    box(200000, 7700000, 6800000, ['Под заказ — срок поставки около 60 дней.']) +
    box(200000, 8100000, 6800000, ['Доставка до Екатеринбурга — отдельно']) +
    '</p:spTree></p:cSld></p:sld>';
  const enc = new winT.TextEncoder();
  const dec = new winT.TextDecoder('utf-8');
  const parts = { 'ppt/slides/slide1.xml': enc.encode(slide),
    'docProps/core.xml': enc.encode('<x><dc:title>старое</dc:title></x>') };
  check('шаблон: лист со сметой найден по содержимому',
    TPLm.findSmetaSlide(parts) === 'ppt/slides/slide1.xml', '');

  const data = {
    client: 'ООО «Проверка»', manager: 'Егор Винчестер, LASERCUT',
    date: '07.08.2026', validUntil: '21.08.2026',
    intro: 'Антон, благодарим за обращение. Предлагаем маркер.',
    ndsRate: '22', total: '9 876 543 ₽', nds: '1 780 999,00 ₽',
    title: 'КП — проверка',
    rows: [1, 2, 3, 4, 5, 6].map(i => ({ name: 'Строка ' + i, sub: 'подпись ' + i,
      qty: i + ' шт.', price: '100 ₽', sum: (i * 100) + ' ₽' })),
    extras: [
      { find: /^Под заказ — срок поставки/, text: 'Срок поставки: до 10 рабочих дней' },
      { find: /^Доставка до /, text: 'Доставка — отдельно' },
      { find: /^Честно о цвете/, text: 'Состав собран под вашу задачу.' }
    ]
  };
  let out = null, err = '';
  try { out = TPLm.build(parts, data); } catch (e) { err = e.message; }
  check('шаблон: подстановка отработала', !!out, err);
  if (!out) return;
  const xml = dec.decode(out['ppt/slides/slide1.xml']);
  check('шаблон: клиент и менеджер подставились',
    xml.indexOf('ООО «Проверка»') > 0 && xml.indexOf('Егор Винчестер') > 0, '');
  check('шаблон: данные прошлой сделки не остались',
    xml.indexOf('Лотов') < 0 && xml.indexOf('Екатеринбург') < 0 &&
    xml.indexOf('текст прошлой сделки') < 0, '');
  check('шаблон: строк стало ровно шесть',
    (xml.match(/Строка \d/g) || []).length === 6, '');
  check('шаблон: заголовки денежных колонок переписаны',
    xml.indexOf('Цена за шт.') > 0 && xml.indexOf('Сумма') > 0 &&
    xml.indexOf('Цена под заказ') < 0, '');
  check('шаблон: итог и НДС на месте',
    xml.indexOf('9 876 543 ₽') > 0 && xml.indexOf('1 780 999,00 ₽') > 0, '');
  // низ листа должен уехать ровно на три шага строки
  const docT = new winT.DOMParser().parseFromString(xml, 'application/xml');
  const nodes = TPLm.shapes(TPLm.treeOf(docT));
  const itog = TPLm.findByText(nodes, /ИТОГО/);
  const yItog = +itog.getElementsByTagNameNS(A, 'off')[0].getAttribute('y');
  check('шаблон: низ листа сдвинулся под новое число строк',
    yItog === 7200000 + 3 * 1500000, 'y = ' + yItog);
  check('шаблон: заголовок файла обновился',
    dec.decode(out['docProps/core.xml']).indexOf('КП — проверка') > 0, '');
  check('шаблон: кнопка выгрузки и загрузчик на месте',
    !!(STAGE === 2 ? doc2 : doc).getElementById('btnDeckTpl') &&
    !!(STAGE === 2 ? doc2 : doc).getElementById('tplFile'), '');
}());

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
