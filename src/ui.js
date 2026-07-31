/* Интерфейс. Все деньги — через money.js, в копейках. Ни одного числа «на глаз». */
(function () {
  'use strict';
  var LS = 'cfg-state-v2';
  var d = document;
  function $(id) { return d.getElementById(id); }
  function el(tag, cls, html) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  // согласование существительного с числом: 1,5 баллона / 5 баллонов
  function plural(n, forms) {
    var whole = Math.floor(n);
    if (n !== whole) return forms[0];          // дробное — всегда «баллона»
    var m = whole % 100;
    if (m >= 11 && m <= 19) return forms[1];
    m = whole % 10;
    return (m >= 2 && m <= 4) || m === 1 ? forms[0] : forms[1];
  }

  // первая буква строчной: сумма прописью в середине фразы не должна начинаться с большой
  // Число вместе со словом: plural отдаёт только форму, а в интерфейсе почти
  // всегда нужно «3 позиции», а не «позиции». Раньше число терялось.
  function cnt(n, forms) { return n + ' ' + plural(n, forms); }

  function lower1(t) {
    return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function opt(sel, value, text) {
    var o = d.createElement('option');
    o.value = value; o.textContent = text; sel.appendChild(o);
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  /* Файл пререндерится: в разметке уже лежат заполненные списки с прошлой сборки.
     Поэтому любой контейнер, который наполняет скрипт, обязан сначала очиститься —
     иначе на реальной странице все варианты удваиваются. */
  function fresh(id) { var n = $(id); clear(n); return n; }
  function pctText(p10) { return (p10 / 10).toString().replace('.', ',') + ' %'; }

  d.body.classList.add('js');

  // ------------------------------------------------------------------ состояние
  var state = {
    items: [], kp: {}, disc: 0, nds: 220, demo: false,
    ready: {}, gas: { nozzle: '2', gas: 'n2', hours: '80', price: '' },
    mode: 'order', cat: 'fiber', mtCat: 'fiber',
    // поставщик в ТКП и правки его реквизитов, тема оформления
    supId: '', sups: {}, theme: 'dark',
    // приводы серии S и выбранная обвязка волокна
    servo: '', kit: { compressor: '', extraction: '', cryo: '', stab: '' },
    // имя и контакты менеджера сделки: пустые поля = менеджер из данных
    mgr: {}
  };
  try {
    // v1 → v2: подхватываем черновик, сохранённый прошлой версией, и переносим его
    var raw = localStorage.getItem(LS);
    if (!raw) {
      var old = localStorage.getItem('cfg-state-v1');
      if (old) { raw = old; localStorage.setItem(LS, old); }
    }
    if (raw) {
      var s = JSON.parse(raw);
      for (var k in s) if (s.hasOwnProperty(k)) state[k] = s[k];
      // в v1 у позиций не было типа и построчной скидки
      (state.items || []).forEach(function (it) {
        if (!it.type) it.type = 'eq';
        if (it.disc === undefined) it.disc = null;
      });
      // черновики прошлых версий не знали про поставщика и тему
      if (!state.sups || typeof state.sups !== 'object') state.sups = {};
      if (state.theme !== 'light' && state.theme !== 'dark') state.theme = 'dark';
      if (!state.kit || typeof state.kit !== 'object') {
        state.kit = { compressor: '', extraction: '', cryo: '', stab: '' };
      }
      // черновики до версии 13 не знали про своего менеджера
      if (!state.mgr || typeof state.mgr !== 'object') state.mgr = {};
    }
  } catch (e) { /* приватный режим — работаем без сохранения */ }

  var saveTimer = null;
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify(state));
      $('saveDot').textContent = 'сохранено';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { $('saveDot').textContent = ''; }, 1600);
    } catch (e) { $('saveDot').textContent = 'без сохранения'; }
  }

  // ------------------------------------------------------------------ вкладки
  // В строке живут только частые разделы, полный список — в кнопке «Разделы».
  // Один источник истины: SECTIONS. Из него строится меню, по нему же
  // проверяется хеш в адресе.
  var SECTIONS = [
    { id: 'cfg', title: 'Конфигуратор', hint: 'станок, обвязка, цена' },
    { id: 'smeta', title: 'Смета и ТКП', hint: 'позиции, скидки, файл' },
    { id: 'match', title: 'Подбор по задаче', hint: 'толщина и материал' },
    { id: 'gas', title: 'Газ и владение', hint: 'расход и стоимость' },
    { id: 'tech', title: 'Техника', hint: 'что режет и что внутри' },
    { id: 'shop', title: 'Готовность цеха', hint: 'блокеры до монтажа' },
    { id: 'data', title: 'Данные', hint: 'прайсы, источники, расхождения' }
  ];
  var tabs = $('tabs').querySelectorAll('button');
  // подписи вкладок берём из SECTIONS: иначе переименование раздела меняло
  // бы только надпись в меню, а строка вкладок оставалась со старым текстом
  for (var ti = 0; ti < tabs.length; ti++) {
    var tid = tabs[ti].getAttribute('data-t');
    SECTIONS.forEach(function (s) {
      if (s.id !== tid) return;
      var badge = tabs[ti].querySelector('.badge');
      tabs[ti].textContent = s.title + ' ';
      if (badge) tabs[ti].appendChild(badge);
    });
  }

  var menuList = fresh('menuList');
  SECTIONS.forEach(function (s) {
    var b = d.createElement('button');
    b.type = 'button';
    b.setAttribute('data-t', s.id);
    b.setAttribute('role', 'menuitem');
    b.innerHTML = '<span>' + esc(s.title) + '</span><small>' + esc(s.hint) + '</small>';
    b.addEventListener('click', function () {
      showTab(s.id);
      closeMenu();
    });
    menuList.appendChild(b);
  });

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    var ok = false;
    SECTIONS.forEach(function (s) { if (s.id === h) ok = true; });
    if (ok) showTab(h);
  });

  function closeMenu() {
    $('menuList').classList.remove('open');
    $('menuBtn').setAttribute('aria-expanded', 'false');
  }
  $('menuBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !$('menuList').classList.contains('open');
    $('menuList').classList.toggle('open', open);
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  d.addEventListener('click', function (e) {
    if (!$('menuList').contains(e.target) && e.target !== $('menuBtn')) closeMenu();
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  function showTab(name) {
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected',
        tabs[i].getAttribute('data-t') === name ? 'true' : 'false');
    }
    var mi = $('menuList').querySelectorAll('button');
    for (var k = 0; k < mi.length; k++) {
      mi[k].setAttribute('aria-selected',
        mi[k].getAttribute('data-t') === name ? 'true' : 'false');
    }
    // Кнопка показывает, где мы находимся, если раздела нет в строке вкладок
    var inTabs = false;
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].getAttribute('data-t') === name) inTabs = true;
    }
    var title = name;
    SECTIONS.forEach(function (s) { if (s.id === name) title = s.title; });
    $('menuBtn').textContent = inTabs ? 'Разделы' : title;
    var panels = d.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('active', panels[j].id === 'p-' + name);
    }
    // При открытии файла с диска (file://) браузер запрещает replaceState и
    // бросает SecurityError. Раньше это валило остаток инициализации.
    try {
      if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    } catch (e) { location.hash = name; }
    // не window.scrollTo — в jsdom он не реализован и валит проверку сборки
    d.documentElement.scrollTop = 0;
    d.body.scrollTop = 0;
  }
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function () { showTab(this.getAttribute('data-t')); });
  }

  /* Высота шапки зависит от переносов текста, поэтому прибиваем вкладки
     не к жёстким 63px из CSS, а к фактической высоте шапки. */
  function fixNavOffset() {
    var h = d.querySelector('header'), n = d.querySelector('nav');
    if (h && n && h.offsetHeight) n.style.top = h.offsetHeight + 'px';
  }
  window.addEventListener('resize', fixNavOffset);

  // ------------------------------------------------------------------ демо-режим
  function applyDemo(on, silent) {
    state.demo = on;
    $('demoMode').checked = on;
    d.body.classList.toggle('demo', on);
    if (!silent) save();
    renderMill();
  }
  $('demoMode').addEventListener('change', function () { applyDemo(this.checked); });
  $('demoOff').addEventListener('click', function () { applyDemo(false); });
  applyDemo(!!state.demo, true);

  // ------------------------------------------------------------------ тема
  // Тёмная — по умолчанию, как было; светлая включается атрибутом на <html>.
  // Лист ТКП в обеих темах белый, поэтому печать не меняется.
  function applyTheme(name, silent) {
    var light = name === 'light';
    state.theme = light ? 'light' : 'dark';
    if (light) d.documentElement.setAttribute('data-theme', 'light');
    else d.documentElement.removeAttribute('data-theme');
    var b = $('themeBtn');
    if (b) {
      b.textContent = light ? 'Тёмная тема' : 'Светлая тема';
      b.setAttribute('aria-pressed', light ? 'true' : 'false');
    }
    var meta = d.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f6f4f1' : '#100e0c');
    if (!silent) save();
  }
  $('themeBtn').addEventListener('click', function () {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });
  applyTheme(state.theme === 'light' ? 'light' : 'dark', true);

  // ------------------------------------------------------------------ тост
  var toastTimer = null;
  function toast(text, withButton) {
    // Кнопка «Открыть смету» уместна только у сообщений о добавлении позиции;
    // у «JSON скопирован» она сбивала с толку.
    $('toastGo').style.display = withButton ? '' : 'none';
    $('toastText').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 4000);
  }
  $('toastGo').addEventListener('click', function () {
    $('toast').classList.remove('show');
    showTab('smeta');
  });

  // ---------------------------------------------------------------- менеджер
  // Менеджер сделки правится в шаге 1: у каждого свои имя и телефон, а ТКП
  // уходит клиенту от конкретного человека. Пустое поле = значение из данных.
  var MGRF = ['mgrName', 'mgrRole', 'mgrPhone', 'mgrEmail'];
  var MGR_MAP = { mgrName: 'name', mgrRole: 'role', mgrPhone: 'phone', mgrEmail: 'email' };
  function mgr() {
    var out = {};
    ['name', 'role', 'phone', 'email', 'sites'].forEach(function (k) {
      out[k] = APP.manager[k];
    });
    MGRF.forEach(function (id) {
      var v = (state.mgr[id] || '').trim();
      if (v) out[MGR_MAP[id]] = v;
    });
    return out;
  }
  function mgrOwn() {
    var own = false;
    MGRF.forEach(function (id) { if ((state.mgr[id] || '').trim()) own = true; });
    return own;
  }
  function renderMgr() {
    var m = mgr(), n = $('mgrOut');
    if (n) {
      n.textContent = 'В подписи ТКП: ' + m.name + ' · ' + m.role + ' · ' +
        m.phone + ' · ' + m.email +
        (mgrOwn() ? '' : ' — это менеджер по умолчанию из данных');
    }
    var nm = $('kpMgrName'), rl = $('kpMgrRole'), ln = $('kpMgrLine');
    if (nm) nm.textContent = m.name;
    if (rl) rl.textContent = ' · ' + m.role;
    if (ln) ln.textContent = m.phone + ' · ' + m.email + ' · ' + m.sites;
  }
  MGRF.forEach(function (id) {
    if (state.mgr[id]) $(id).value = state.mgr[id];
    $(id).addEventListener('input', function () {
      state.mgr[id] = this.value; save(); renderMgr();
    });
  });
  $('mgrReset').addEventListener('click', function () {
    state.mgr = {};
    MGRF.forEach(function (id) { $(id).value = ''; });
    save(); renderMgr();
    toast('Менеджер снова по умолчанию: ' + APP.manager.name);
  });

  // ------------------------------------------------- карточка характеристик
  // Пары «параметр — значение» как в присланном конфигураторе: слева подпись,
  // справа значение, снизу примечание об источнике или расхождении.
  function specCard(node, title, pairs, foot) {
    var n = typeof node === 'string' ? $(node) : node;
    if (!n) return;
    clear(n);
    if (!pairs || !pairs.length) { n.style.display = 'none'; return; }
    n.style.display = '';
    if (title) n.appendChild(el('h4', '', esc(title)));
    var dl = el('dl');
    pairs.forEach(function (p) {
      dl.appendChild(el('dt', '', esc(p[0])));
      dl.appendChild(el('dd', '', esc(String(p[1]))));
    });
    n.appendChild(dl);
    if (foot) n.appendChild(el('div', 'idx', esc(foot)));
  }

  // ---------------------------------------------- совпадения в прайсе
  // Список подходящих строк прайса: видно, из чего выбираем, и одним нажатием
  // можно взять другую цену — как в присланном примере.
  function renderMatches(nodeId, rows, onPick) {
    var n = $(nodeId);
    if (!n) return;
    clear(n);
    if (!rows || !rows.length) { n.style.display = 'none'; return; }
    n.style.display = '';
    n.appendChild(el('h3', '', 'Совпадения в прайсе — нажмите, чтобы взять цену'));
    rows.slice(0, 12).forEach(function (r) {
      var row = el('div', 'mrow');
      row.innerHTML = '<span class="nm">' + esc(r.name) + '</span><b>' +
        (r.price ? fmtRub(toCents(r.price)) + ' ₽' : 'цены нет') + '</b>';
      row.addEventListener('click', function () { onPick(r); });
      n.appendChild(row);
    });
    if (rows.length > 12) {
      n.appendChild(el('div', 'muted', 'Показаны первые 12 из ' +
        cnt(rows.length, ['строки', 'строк'])));
    }
  }

  // ------------------------------------------------------ боковые «мысли»
  // Пояснения, предупреждения и техданные уезжают в правую колонку шага:
  // слева остаётся то, что нужно нажать, справа — то, что нужно знать.
  // Функция идемпотентна, её можно звать после любой перерисовки.
  var THINK_SEL = '.note, .calcsteps, .muted, .advice, .miss';
  function thinkify() {
    var bodies = d.querySelectorAll('.step-b');
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var side = null, main = null;
      for (var c = 0; c < b.children.length; c++) {
        if (b.children[c].className === 'doing') main = b.children[c];
        if (b.children[c].className === 'think') side = b.children[c];
      }
      if (!main) {
        main = el('div', 'doing');
        side = el('div', 'think');
        var kids = [];
        for (var j = 0; j < b.childNodes.length; j++) kids.push(b.childNodes[j]);
        kids.forEach(function (n) { main.appendChild(n); });
        b.appendChild(main); b.appendChild(side);
      }
      // Переносим только прямых детей: статические пояснения шага и
      // контейнеры, помеченные think-box (в них render-функции пишут
      // техничку). Глубже не лезем — иначе у динамических блоков
      // вынесло бы содержимое, а перерисовка плодила бы дубли.
      var kids2 = [];
      for (var k = 0; k < main.children.length; k++) kids2.push(main.children[k]);
      kids2.forEach(function (n2) {
        var cls = ' ' + (n2.className || '') + ' ';
        var isNote = /\s(note|calcsteps|muted|advice|miss|think-box)\s/.test(cls);
        if (isNote) side.appendChild(n2);
      });
      b.classList.toggle('has-think', side.childNodes.length > 0);
    }
  }

  // ------------------------------------------------- полные наименования
  // В смете и ТКП позиция должна читаться как товар, а не как артикул из
  // прайса: «A1 6090, 1.5wc» клиент не опознает, «Фрезерный станок WATTSAN
  // A1 6090, 1.5wc» — опознает. Префиксы добавляются при выводе, данные
  // остаются дословными.
  var NOM_PREFIX = {
    'Стабилизаторы напряжения': 'Стабилизатор напряжения ',
    'Чиллеры': 'Чиллер ',
    'DSP-контроллеры': 'DSP-контроллер ',
    'Датчики высоты инструмента': 'Датчик высоты инструмента ',
    'Виброопоры': 'Виброопора '
  };
  function nomOption(cat, name) {
    if (cat === 'Аспирация') {
      return /BELMASH/i.test(name) ? 'Пылеулавливающий агрегат ' + name : name;
    }
    var p = NOM_PREFIX[cat];
    if (!p) return name;
    if (name.indexOf(p.trim()) === 0) return name;
    return p + (cat === 'Датчики высоты инструмента' ? lower1(name) : name);
  }
  function nomFiber(series, f, power) {
    return 'Лазерный станок по металлу WATTSAN ' + series + ' ' + f + ' ' +
      power + ' Вт';
  }
  function nomMill(name) { return 'Фрезерный станок WATTSAN ' + name; }

  // ------------------------------------------------------------------ волокно
  var fiberIdx = {}, fiberAIdx = {}, fiberBoIdx = {};
  APP.fiberS.forEach(function (r) {
    fiberIdx[r.format] = fiberIdx[r.format] || {};
    fiberIdx[r.format][r.power] = r;
  });
  // второй прайс: те же конфигурации с приводами Bochu S9
  APP.fiberSBochu.forEach(function (r) {
    fiberBoIdx[r.format] = fiberBoIdx[r.format] || {};
    fiberBoIdx[r.format][r.power] = r;
  });

  function servoNow() {
    var id = state.servo || APP.servoDefault, found = null;
    APP.servo.forEach(function (s) { if (s.id === id) found = s; });
    if (!found) {
      state.servo = APP.servoDefault;
      APP.servo.forEach(function (s) { if (s.id === APP.servoDefault) found = s; });
      found = found || APP.servo[0];
    }
    return found;
  }

  function servoSize(fmt) {
    // у 1530/1560 свои мощности осей и своя надбавка за усиление
    return APP.servoSmall.indexOf(fmt) >= 0 ? 'small' : 'big';
  }

  function servoAdd(fmt) {
    return servoNow().add[servoSize(fmt)];
  }

  // прайс, из которого берём базовую цену выбранного привода
  function fiberSrc(brandFrom) {
    return brandFrom === 'bochu' ? fiberBoIdx : fiberIdx;
  }
  APP.fiberA.forEach(function (r) {
    fiberAIdx[r.format] = fiberAIdx[r.format] || {};
    fiberAIdx[r.format][r.power] = r.price;
  });

  var fSer = fresh('fSeries');
  opt(fSer, 'S', 'S — лист и трубы');
  opt(fSer, 'A', 'A — компактная, 3–4 мм в режиме 24/7');

  function fillFiberFormats() {
    var series = $('fSeries').value;
    var sel = $('fFormat'), prev = sel.value; clear(sel);
    var src = series === 'A' ? fiberAIdx : fiberIdx;
    APP.fiberOrder.forEach(function (f) {
      if (src[f]) opt(sel, f, f + ' — ' + APP.fiberFormats[f] + ' мм');
    });
    if (prev && src[prev]) sel.value = prev;
    fillFiberPowers();
  }
  function fillFiberPowers() {
    var series = $('fSeries').value, f = $('fFormat').value;
    var sel = $('fPower'), prev = sel.value; clear(sel);
    var src = series === 'A' ? fiberAIdx : fiberIdx;
    Object.keys(src[f] || {}).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (p) { opt(sel, p, (p / 1000) + ' кВт'); });
    if (prev && src[f] && src[f][prev]) sel.value = prev;
    renderFiber();
  }

  function fiberPick() {
    var series = $('fSeries').value, f = $('fFormat').value, p = $('fPower').value;
    var tbl = $('fTable').value === '1', rot = $('fRot').value;
    if (series === 'A') {
      if (tbl || rot) {
        return { err: 'По серии A сменного стола и RD-модуля в прайсе нет — только серия S.' };
      }
      var price = fiberAIdx[f] && fiberAIdx[f][p];
      if (!price) return { err: 'Цены на эту конфигурацию в прайсе нет.' };
      return { name: nomFiber('A', f, p), short: nomFiber('A', f, p),
        price: price, steps: [] };
    }
    var sv = servoNow();
    var idx = fiberSrc(sv.price_from);
    var r = idx[f] && idx[f][p];
    if (!r) return { err: 'Цены на эту конфигурацию в прайсе нет.' };
    var name = nomFiber('S', f, p), price, steps = [];
    if (!tbl && !rot) { price = r.base; }
    else if (tbl && !rot) { price = r.table; name += ' + сменный стол'; }
    else if (!tbl && rot) { price = r.rot[rot]; name += ' + rotary ' + rot; }
    else { price = r.tableRot[rot]; name += ' + сменный стол + rotary ' + rot; }
    steps.push(['База ' + f + ' ' + p + 'W', r.base]);
    if (tbl) steps.push(['Доплата за сменный стол', r.table - r.base]);
    if (rot) steps.push(['Доплата за rotary ' + rot, r.rot[rot] - r.base]);
    if (tbl && rot) {
      var sep = r.table + (r.rot[rot] - r.base);
      steps.push(['По отдельности вышло бы', sep]);
      steps.push(['Пакетная выгода — стол и ось вместе', -(sep - price)]);
    }
    // привод: базовая цена уже из нужного прайса, надбавка за усиление — сверху
    var add = servoAdd(f);
    if (sv.price_from === 'bochu') {
      var yr = fiberIdx[f][p];
      var ybase = !tbl && !rot ? yr.base : (tbl && !rot ? yr.table
        : (!tbl && rot ? yr.rot[rot] : yr.tableRot[rot]));
      steps.push(['Приводы ' + sv.brand + ' — прайс дешевле Yaskawa на',
        -(ybase - price)]);
    }
    if (add) {
      steps.push(['Усиленные приводы ' + sv.brand, add]);
      price += add;
    }
    var shortName = name;              // без приписки про приводы — для титула ТКП
    name += ' · приводы ' + sv.label;
    return { name: name, short: shortName, price: price, steps: steps, servo: sv,
      fmt: f, power: p, rot: rot };
  }

  function renderFiber() {
    var out = $('fOut'); clear(out);
    var pick = fiberPick();
    if (pick.err) { out.appendChild(el('div', 'note stop', esc(pick.err))); return; }
    var box = el('div', 'pricebox');
    box.appendChild(el('div', 'pb stock',
      '<div class="lbl">Цена, НДС включён</div><div class="val">' +
      fmtRub(toCents(pick.price)) + ' ₽</div><div class="sub">' + esc(pick.name) + '</div>'));
    box.appendChild(el('div', 'pb',
      '<div class="lbl">Второй ценник</div>' +
      '<div class="val" style="font-size:19px">нет в прайсе</div>' +
      '<div class="sub">По волокну одна цена. Наценку за наличие не выдумываем.</div>'));
    out.appendChild(box);
    if (pick.steps.length > 1) {
      var st = el('div', 'calcsteps');
      pick.steps.forEach(function (s) {
        st.appendChild(el('div', '', esc(s[0]) + ': <b>' + (s[1] < 0 ? '−' : '') +
          fmtRub(toCents(Math.abs(s[1]))) + ' ₽</b>'));
      });
      st.appendChild(el('div', '', 'Итого по прайсу: <b>' +
        fmtRub(toCents(pick.price)) + ' ₽</b>'));
      out.appendChild(st);
    }
    out.appendChild(el('div', 'note',
      'Сверх цены станка: доставка, ПНР, обучение и подготовка цеха. ' +
      'Стабилизатор ' + esc(stabPower()) + ' — отдельная статья и условие гарантии.'));
  }

  // ---- приводы серии S: Yaskawa или Bochu S9, стандарт или усиленный ----
  var svSel = fresh('fServo');
  APP.servo.forEach(function (s) { opt(svSel, s.id, s.label); });
  svSel.value = state.servo || APP.servoDefault;

  function renderServo() {
    var out = $('servoOut'); clear(out);
    var series = $('fSeries').value;
    if (series === 'A') {
      out.appendChild(el('div', 'note', 'Серия A: выбор приводов не влияет на цену — ' +
        'в обоих прайсах цены на A одинаковые.'));
      return;
    }
    var sv = servoNow(), f = $('fFormat').value, size = servoSize(f);
    var add = servoAdd(f);
    var box = el('div', 'calcsteps');
    box.appendChild(el('div', '', 'Оси: <b>' + esc(sv.axes[size]) + '</b>'));
    box.appendChild(el('div', '', 'Скорость <b>' + esc(sv.speed) +
      '</b> · ускорение <b>' + esc(sv.accel) + '</b>'));
    box.appendChild(el('div', '', esc(sv.note)));
    box.appendChild(el('div', '', add
      ? 'Надбавка за усиление: <b>' + fmtRub(toCents(add)) + ' ₽</b>'
      : 'Надбавки нет: цена берётся прямо из прайса.'));
    out.appendChild(box);

    // что физически ставится под выбранную мощность источника
    var kit = APP.fiberKit[$('fPower').value];
    if (kit) {
      var rot = $('fRot').value;
      out.appendChild(el('div', 'note',
        'Под эту мощность в станок ставится: контроллер <b>' +
        esc(rot ? APP.fiberKitRotaryCtrl : kit.ctrl) + '</b>' +
        (rot ? ' (поворотная ось RD)' : '') + ', голова <b>' + esc(kit.head) +
        '</b>, чиллер ' + esc(kit.chiller) + '.'));
    }
  }

  $('fSeries').addEventListener('change', function () {
    fillFiberFormats(); renderServo();
  });
  $('fFormat').addEventListener('change', function () {
    fillFiberPowers(); renderServo();
  });
  ['fPower', 'fTable', 'fRot'].forEach(function (id) {
    $(id).addEventListener('change', function () { renderFiber(); renderServo(); });
  });
  $('fServo').addEventListener('change', function () {
    state.servo = this.value; save(); renderFiber(); renderServo();
  });
  $('fAdd').addEventListener('click', function () {
    var p = fiberPick();
    if (p.err) return;
    addItem(p.name, p.price, 1, 'eq',
      { short: p.short || '', sub: p.servo ? 'приводы ' + p.servo.label : '' });
  });

  // ------------------------------------------------------------------ фрезерные
  var mFmt = fresh('mFormat');
  APP.millingOrder.forEach(function (f) {
    opt(mFmt, f, f + ' — ' + APP.millingFields[f] + ' мм');
  });
  function fillMillConfigs() {
    var f = $('mFormat').value, sel = $('mConfig'); clear(sel);
    APP.milling.filter(function (r) { return r.format === f; })
      .forEach(function (r) { opt(sel, r.name, r.name); });
    renderMill();
  }
  function millPick() {
    var name = $('mConfig').value;
    for (var i = 0; i < APP.milling.length; i++) {
      if (APP.milling[i].name === name) return APP.milling[i];
    }
    return null;
  }
  function renderMill() {
    var out = $('mOut'); clear(out);
    var r = millPick();
    if (!r) return;
    var mode = $('priceMode').value;
    state.mode = mode;
    var box = el('div', 'pricebox');
    box.appendChild(el('div', 'pb' + (mode === 'order' ? ' stock' : ''),
      '<div class="lbl">Под заказ — завод, ' + esc(APP.deliveryOrder) +
      '</div><div class="val">' +
      fmtRub(toCents(r.order)) + ' ₽</div><div class="sub">Оплата 50 % + остаток</div>'));
    box.appendChild(el('div', 'pb' + (mode === 'stock' ? ' stock' : ''),
      '<div class="lbl">Из наличия — склад</div><div class="val">' +
      fmtRub(toCents(r.stock)) + ' ₽</div><div class="sub">Оплата 100 %</div>'));
    out.appendChild(box);

    var st = el('div', 'calcsteps internal');
    var diff = r.stock - r.order;
    st.appendChild(el('div', '', 'Разница: <b>' + fmtRub(toCents(diff)) + ' ₽</b>, это <b>+' +
      String(Math.round(diff / r.order * 10000) / 100).replace('.', ',') +
      ' %</b> к цене под заказ'));
    st.appendChild(el('div', '', 'Правило прайса: +11 % с округлением до 100 ₽. ' +
      'Цена берётся из таблицы, а не считается.'));
    out.appendChild(st);

    out.appendChild(el('div', 'muted', 'Шпиндель ' + r.kw + ' кВт · охлаждение ' +
      esc(r.cool) + ' · стойка ' + esc(r.ctrl) + ' · вакуумный стол: ' +
      (r.vac ? 'да' : 'нет') + ' · поле ' + APP.millingFields[r.format] + ' мм' +
      (r.vac ? ' · питание 380 В' : ' · питание 220 В')));
    if (r.cool === 'водяное') {
      out.appendChild(el('div', 'note alert',
        'Водяное охлаждение шпинделя — нужен чиллер. В прайсе три модели S&A, ' +
        'но привязки к мощности шпинделя в данных нет: подбор чиллера уточнять у сервиса.'));
    }
    out.appendChild(el('div', 'note',
      'Что клиент платит сверх: доставка, ПНР, обучение, чиллер. ' +
      'В цену фрезерного они не входят.'));
  }
  $('mFormat').addEventListener('change', fillMillConfigs);
  $('mConfig').addEventListener('change', renderMill);
  $('priceMode').addEventListener('change', function () { renderMill(); save(); });
  $('mAdd').addEventListener('click', function () {
    var r = millPick(); if (!r) return;
    var mode = $('priceMode').value;
    addItem(nomMill(r.name) + (mode === 'stock' ? ' (из наличия)' : ' (под заказ)'),
      mode === 'stock' ? r.stock : r.order, 1, 'eq', { short: nomMill(r.name) });
  });

  // опции — по одной группе, без повторов названия категории
  (function () {
    var box = fresh('mOptions'), cats = {}, order = [];
    APP.options.forEach(function (o) {
      if (!cats[o.cat]) { cats[o.cat] = []; order.push(o.cat); }
      cats[o.cat].push(o);
    });
    order.forEach(function (c) {
      var det = el('details');
      var sum = el('summary');
      sum.innerHTML = esc(c) + '<span class="cnt">' + cats[c].length + ' поз.</span>';
      det.appendChild(sum);
      var body = el('div', 'det-b');
      cats[c].forEach(function (o) {
        var row = el('div', 'chk');
        row.innerHTML = '<span style="flex:1">' + esc(o.name) + ' — <b style="color:var(--or)">' +
          fmtRub(toCents(o.price)) + ' ₽</b></span>';
        var qty = el('input');
        qty.type = 'number'; qty.min = '1'; qty.max = '20'; qty.value = '1';
        qty.style.width = '68px'; qty.style.padding = '6px 8px';
        if (/Виброопор/i.test(c)) {
          var f = $('mFormat').value;
          if (APP.vibroQty[f]) qty.value = APP.vibroQty[f];
        }
        var btn = el('button', 'btn mini sec', 'В смету');
        btn.type = 'button';
        btn.addEventListener('click', function () {
          addItem(nomOption(o.cat, o.name), o.price,
            Math.max(1, parseInt(qty.value, 10) || 1), 'opt');
        });
        row.appendChild(qty); row.appendChild(btn);
        body.appendChild(row);
      });
      det.appendChild(body);
      box.appendChild(det);
    });
  }());

  // ПНР
  var pnrSel = fresh('pnrModel');
  APP.pnr.forEach(function (p, i) { opt(pnrSel, String(i), p.model); });
  function pnrPick() {
    var p = APP.pnr[parseInt($('pnrModel').value, 10)];
    var kind = $('pnrKind').value;
    // в смету идёт расшифровка, а не «ПНР»: документ читает клиент
    var labels = { pnr: 'Пусконаладочные работы',
      plus1: 'Пусконаладочные работы, +1 день выезда',
      plus2: 'Пусконаладочные работы, +2 дня выезда',
      training: 'Обучение оператора',
      package: 'Пусконаладочные работы и обучение оператора' };
    var v = p[kind];
    if (typeof v === 'string' && !/^\d/.test(v.replace(/\s/g, ''))) {
      return { text: v + ' — отдельной строкой в смету не идёт.',
        price: null, name: labels[kind] + ' — ' + p.model };
    }
    if (typeof v === 'string') v = parseInt(v.replace(/\s/g, ''), 10);
    if (!v) {
      return { text: 'В прайсе для этой комбинации цены нет — уточнить у сервиса.',
        price: null, name: labels[kind] + ' — ' + p.model };
    }
    var third = $('thirdParty').checked;
    return { price: third ? Math.round(v * 1.2) : v, base: v, third: third, days: p.days,
      name: labels[kind] + ' — ' + p.model + (third ? ' (сторонний, ×1,2)' : '') };
  }
  function renderPnr() {
    var out = $('pnrOut'); clear(out);
    var p = pnrPick();
    if (p.price === null) { out.appendChild(el('div', 'note alert', esc(p.text))); return; }
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'По прайсу: <b>' + fmtRub(toCents(p.base)) + ' ₽</b>' +
      (p.days ? ' · выезд ' + p.days + ' дн.' : '')));
    if (p.third) {
      st.appendChild(el('div', '', 'Коэффициент ×1,2 на сторонний станок: <b>' +
        fmtRub(toCents(p.price)) + ' ₽</b>'));
    }
    // условия берём из данных: правка прайса должна доходить до экрана
    st.appendChild(el('div', '', esc(APP.pnrTerms.join(' · '))));
    out.appendChild(st);
  }
  ['pnrModel', 'pnrKind', 'thirdParty'].forEach(function (id) {
    $(id).addEventListener('change', renderPnr);
  });
  $('pnrAdd').addEventListener('click', function () {
    var p = pnrPick(); if (p.price === null) return;
    addItem(p.name, p.price, 1, 'srv');
  });

  // ------------------------------------------------------- CO₂ и маркиратор
  // Оба блока устроены одинаково: станок → обвязка по шагам → смета.
  // Цены CO₂ — с витрины сайта (одна), маркираторы — прайс с двумя ценами.
  var co2Sel = $('cModel'), kSerSel = $('kSeries'), kModSel = $('kModel');

  function co2List() {
    var b = $('cBrand').value;
    return APP.co2.filter(function (r) { return r.brand === b; });
  }
  function fillCo2() {
    var sel = fresh('cModel');
    co2List().forEach(function (r) { opt(sel, r.name, r.name); });
    renderCo2();
  }
  function co2Pick() {
    var n = $('cModel').value, found = null;
    co2List().forEach(function (r) { if (r.name === n) found = r; });
    return found;
  }
  function co2Name(r) {
    return 'Лазерный станок CO₂ ' + r.brand + ' ' + r.name;
  }
  function renderCo2() {
    var out = fresh('cOut'), r = co2Pick();
    if (!r) return;
    var box = el('div', 'pricebox');
    box.appendChild(el('div', 'pb stock', '<div class="lbl">Цена с сайта</div>' +
      '<div class="val">' + fmtRub(toCents(r.price)) + ' ₽</div>' +
      '<div class="sub">розничная, НДС включён</div>'));
    if (r.was) {
      box.appendChild(el('div', 'pb', '<div class="lbl">Зачёркнуто на сайте</div>' +
        '<div class="val">' + fmtRub(toCents(r.was)) + ' ₽</div>' +
        '<div class="sub">' + (r.was > r.price
          ? 'выгода ' + fmtRub(toCents(r.was - r.price)) + ' ₽'
          : 'старая цена ниже действующей — ошибка витрины') + '</div>'));
    }
    out.appendChild(box);
    out.appendChild(el('div', 'muted', 'Поле ' + esc(r.field) + ' мм · трубка ' +
      esc(r.tube) + ' Вт' + (r.ctrl ? ' · стойка ' + esc(r.ctrl) : '')));
    out.appendChild(el('div', 'note', 'Сверх цены станка: чиллер, стабилизатор, ' +
      'ПНР, обучение и доставка. Дальше по шагам.'));
    thinkify();
  }
  $('cBrand').addEventListener('change', function () { fillCo2(); save(); });
  $('cModel').addEventListener('change', function () { renderCo2(); save(); });
  $('cAdd').addEventListener('click', function () {
    var r = co2Pick(); if (!r) return;
    addItem(co2Name(r), r.price, 1, 'eq', { short: co2Name(r) });
    goStep('stepCo2Chiller');
  });
  $('cNext').addEventListener('click', function () { goStep('stepCo2Chiller'); });

  // чиллер к CO₂
  (function () {
    var sel = fresh('cChiller');
    APP.chillers.forEach(function (c) {
      opt(sel, c.id, c.name + ' — ' + fmtRub(toCents(c.price)) + ' ₽');
    });
  }());
  function chillerPick() { return kitFind(APP.chillers, $('cChiller').value); }
  function renderChiller() {
    var out = fresh('cChillerOut'), c = chillerPick();
    if (!c) return;
    out.appendChild(el('div', 'calcsteps', '<div>' + esc(c.kind) + '</div>' +
      '<div>Цена: <b>' + fmtRub(toCents(c.price)) + ' ₽</b></div>'));
    thinkify();
  }
  $('cChiller').addEventListener('change', renderChiller);
  $('cChillerAdd').addEventListener('click', function () {
    var c = chillerPick(); if (!c) return;
    addItem(c.name, c.price, 1, 'opt');
  });

  // стабилизатор для CO₂ и маркиратора — из прайса опций, там модели на 220 В
  function stabOptions() {
    return APP.options.filter(function (o) {
      return o.cat === 'Стабилизаторы напряжения';
    });
  }
  function fillStabSel(id) {
    var sel = fresh(id);
    stabOptions().forEach(function (o) {
      opt(sel, o.name, nomOption(o.cat, o.name) + ' — ' + fmtRub(toCents(o.price)) + ' ₽');
    });
  }
  function stabOptPick(id) {
    var n = $(id).value, found = null;
    stabOptions().forEach(function (o) { if (o.name === n) found = o; });
    return found;
  }
  function renderStabOpt(selId, outId) {
    var out = fresh(outId), o = stabOptPick(selId);
    if (!o) return;
    out.appendChild(el('div', 'calcsteps', '<div>Цена: <b>' +
      fmtRub(toCents(o.price)) + ' ₽</b></div><div>' +
      (/3-ЭМ|380/.test(o.name) ? 'Трёхфазный, 380 В' : 'Однофазный, 220 В') + '</div>'));
    thinkify();
  }
  fillStabSel('cStab');
  $('cStab').addEventListener('change', function () { renderStabOpt('cStab', 'cStabOut'); });
  $('cStabAdd').addEventListener('click', function () {
    var o = stabOptPick('cStab'); if (!o) return;
    addItem(nomOption(o.cat, o.name), o.price, 1, 'opt');
  });

  // ПНР без цены: позиция уходит строкой с нулём и явной пометкой
  function fillPnrNoPrice(selId, kind) {
    var sel = fresh(selId);
    APP.pnrNoPrice.forEach(function (p) {
      if (p['for'] !== kind) return;
      opt(sel, p.id, p.name + ' — цену уточнить');
    });
  }
  function pnrNoPricePick(selId) {
    var id = $(selId).value, found = null;
    APP.pnrNoPrice.forEach(function (p) { if (p.id === id) found = p; });
    return found;
  }
  function addPnrNoPrice(selId) {
    var p = pnrNoPricePick(selId); if (!p) return;
    addItem(p.name + ' — цену уточнить у сервиса', 0, 1, 'srv');
  }
  fillPnrNoPrice('cPnr', 'co2');
  $('cPnrAdd').addEventListener('click', function () { addPnrNoPrice('cPnr'); });

  // ---- маркиратор ----
  (function () {
    // список чистим: при пререндере скрипт исполняется дважды, иначе серии
    // задвоятся прямо в выпускном файле
    var sel = fresh('kSeries'), seen = {};
    APP.markers.forEach(function (m) {
      if (seen[m.series]) return;
      seen[m.series] = 1;
      opt(sel, m.series, m.series);
    });
  }());
  function markerList() {
    var s = $('kSeries').value;
    return APP.markers.filter(function (m) { return m.series === s; });
  }
  function fillMarkers() {
    var sel = fresh('kModel');
    markerList().forEach(function (m) { opt(sel, m.name, m.name); });
    renderMarker();
  }
  function markerPick() {
    var n = $('kModel').value, found = null;
    markerList().forEach(function (m) { if (m.name === n) found = m; });
    return found;
  }
  function markerName(m, mode) {
    // «Батарея к HT» — аксессуар, а не станок: слово «маркиратор» к ней не идёт
    var base = /Батарея/i.test(m.name) ? m.name
      : 'Лазерный маркиратор Wattsan ' + m.name;
    return base + (mode === 'stock' ? ' (из наличия)' : ' (под заказ)');
  }
  function renderMarker() {
    var out = fresh('kOut'), m = markerPick();
    if (!m) return;
    var mode = $('kMode').value;
    var box = el('div', 'pricebox');
    box.appendChild(el('div', 'pb' + (mode === 'order' ? ' stock' : ''),
      '<div class="lbl">Под заказ — завод, ' + esc(APP.deliveryOrder) + '</div>' +
      '<div class="val">' + fmtRub(toCents(m.order)) + ' ₽</div>' +
      '<div class="sub">Оплата 50 % + остаток</div>'));
    box.appendChild(el('div', 'pb' + (mode === 'stock' ? ' stock' : ''),
      '<div class="lbl">Из наличия — склад</div>' +
      '<div class="val">' + fmtRub(toCents(m.stock)) + ' ₽</div>' +
      '<div class="sub">Оплата 100 %</div>'));
    out.appendChild(box);
    out.appendChild(el('div', 'muted', (m.watt ? 'Мощность ' + m.watt + ' Вт · ' : '') +
      'излучатель ' + esc(m.src === '?' ? 'в прайсе не указан' : m.src) +
      ' · MOPA: ' + (m.mopa ? 'да' : 'нет')));
    var st = el('div', 'calcsteps internal');
    st.appendChild(el('div', '', 'Разница: <b>' +
      fmtRub(toCents(m.stock - m.order)) + ' ₽</b>, это <b>+' +
      String(Math.round((m.stock - m.order) / m.order * 10000) / 100)
        .replace('.', ',') + ' %</b> к цене под заказ'));
    out.appendChild(st);
    if (m.mopa) {
      out.appendChild(el('div', 'note', 'MOPA — регулируемая длительность импульса: ' +
        'цветная маркировка нержавейки, аккуратная работа по пластику.'));
    }
    thinkify();
  }
  $('kSeries').addEventListener('change', function () { fillMarkers(); save(); });
  $('kModel').addEventListener('change', function () { renderMarker(); save(); });
  $('kMode').addEventListener('change', function () { renderMarker(); save(); });
  $('kAdd').addEventListener('click', function () {
    var m = markerPick(); if (!m) return;
    var mode = $('kMode').value;
    addItem(markerName(m, mode), mode === 'stock' ? m.stock : m.order, 1, 'eq',
      { short: markerName(m, mode) });
    goStep('stepMarkRot');
  });
  $('kNext').addEventListener('click', function () { goStep('stepMarkRot'); });

  (function () {
    var sel = fresh('kRot');
    APP.markerRotary.forEach(function (r) { opt(sel, r.id, r.name); });
  }());
  function rotPick() { return kitFind(APP.markerRotary, $('kRot').value); }
  function renderRot() {
    var out = fresh('kRotOut'), r = rotPick();
    if (!r) return;
    out.appendChild(el('div', 'calcsteps', '<div>Под что: ' + esc(r.note) + '</div>' +
      '<div>Цена: <b>в прайсе нет</b> — уточнить у сервиса</div>'));
    thinkify();
  }
  $('kRot').addEventListener('change', renderRot);
  $('kRotAdd').addEventListener('click', function () {
    var r = rotPick(); if (!r) return;
    addItem(r.name + ' — цену уточнить у сервиса', 0, 1, 'opt');
  });

  fillStabSel('kStab');
  $('kStab').addEventListener('change', function () { renderStabOpt('kStab', 'kStabOut'); });
  $('kStabAdd').addEventListener('click', function () {
    var o = stabOptPick('kStab'); if (!o) return;
    addItem(nomOption(o.cat, o.name), o.price, 1, 'opt');
  });
  fillPnrNoPrice('kPnr', 'marker');
  $('kPnrAdd').addEventListener('click', function () { addPnrNoPrice('kPnr'); });

  // Плавный переход к следующему шагу: пользователь нажал «добавить» —
  // приложение само подводит его к обвязке, а не оставляет искать глазами.
  function goStep(id) {
    var n = $(id);
    if (!n) return;
    try { n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { n.scrollIntoView(); }
    n.classList.add('step-hi');
    setTimeout(function () { n.classList.remove('step-hi'); }, 1400);
  }

  var CAT_FLOW = {
    fiber: 'Порядок: станок и приводы → цена → обвязка (компрессор, вытяжка, газ) → стабилизатор → смета.',
    milling: 'Порядок: формат и сборка → цена → опции (чиллер, стойка, аспирация) → ПНР → смета.',
    co2: 'Порядок: модель → чиллер → стабилизатор → ПНР → смета. Чиллер в цену CO₂ не входит.',
    marker: 'Порядок: серия и модель → поворотная ось → стабилизатор → ПНР → смета.'
  };

  // ---- полный ряд стабилизаторов с характеристиками ----
  function stabFullList() {
    var b = $('cStabBrand').value;
    return APP.stabsFull.filter(function (s) { return s.b === b; });
  }
  function fillStabFull() {
    var sel = fresh('cStabFull');
    stabFullList().forEach(function (s) {
      opt(sel, s.k, s.n + ' — ' + s.kw + ' кВт — ' + fmtRub(toCents(s.p)) + ' ₽');
    });
    renderStabFull();
  }
  function stabFullPick() {
    var k = $('cStabFull').value, found = null;
    APP.stabsFull.forEach(function (s) { if (s.k === k) found = s; });
    return found;
  }
  function renderStabFull() {
    var s = stabFullPick();
    if (!s) return;
    var pairs = (s.d || []).slice();
    pairs.push(['Цена', fmtRub(toCents(s.p)) + ' ₽']);
    var foot = 'Источник: ' + s.src +
      (s.idx ? ' · ' + s.idx : '') +
      ' · ' + (APP.stabNote[s.b] || '');
    specCard('cStabSpec', s.n, pairs, foot);
    thinkify();
  }
  (function () {
    var sel = fresh('cStabBrand');
    APP.stabBrands.forEach(function (b) { opt(sel, b[0], b[1]); });
  }());
  $('cStabBrand').addEventListener('change', function () { fillStabFull(); save(); });
  $('cStabFull').addEventListener('change', function () { renderStabFull(); save(); });
  $('cStabFullAdd').addEventListener('click', function () {
    var s = stabFullPick(); if (!s) return;
    addItem(s.n, s.p, 1, 'opt', { sub: 'источник: ' + s.src });
  });

  // ---- аспирация BELMASH: полный ряд, цена = розница × 1,2 ----
  function aspList() { return APP.aspiration; }
  function aspPickModel() {
    var k = $('aspModel').value, found = null;
    aspList().forEach(function (a) { if (a.k === k) found = a; });
    return found;
  }
  function aspPrice(a) {
    // ×1,2 к рознице, округление до 10 ₽ — правило присланного конфигуратора
    return Math.round(a.p * APP.aspMarkup / 10) * 10;
  }
  function fillAsp() {
    var sel = fresh('aspModel');
    aspList().forEach(function (a) {
      opt(sel, a.k, a.n + ' — ' + a.q + ' м³/ч — ' + fmtRub(toCents(aspPrice(a))) + ' ₽');
    });
    fillAspVolt();
  }
  function fillAspVolt() {
    var a = aspPickModel(), sel = fresh('aspVolt');
    if (!a) return;
    (a.v || [220]).forEach(function (v) { opt(sel, String(v), v + ' В'); });
    renderAsp();
  }
  function renderAsp() {
    var a = aspPickModel();
    if (!a) return;
    var v = $('aspVolt').value || String((a.v || [220])[0]);
    var pairs = [
      ['Производительность', a.q + ' м³/ч'],
      ['Мощность', a.w + ' Вт'],
      ['Патрубков', a.np + ' × ' + a.dp + ' мм'],
      ['Фильтрация', a.f + ' мкм · ' + a.fe],
      ['Мешок', a.bag + ' л'],
      ['Шум', a.db + ' дБ'],
      ['Масса', a.kg + ' кг'],
      ['Питание', v + ' В'],
      ['Артикул', (a.art && a.art[v]) || '—'],
      ['Розница производителя', fmtRub(toCents(a.p)) + ' ₽'],
      ['Цена в смету (×1,2)', fmtRub(toCents(aspPrice(a))) + ' ₽']
    ];
    var idxKeys = Object.keys(APP.idxNotes || {}).filter(function (key) {
      return new RegExp('(^|[^A-Z])' + key + '($|[^A-Z])').test(a.n);
    });
    var foot = idxKeys.length
      ? idxKeys.map(function (k) { return k + ' — ' + APP.idxNotes[k]; }).join(' · ')
      : 'Индексов в названии нет.';
    specCard('aspSpec', a.n, pairs, foot);
    thinkify();
  }
  $('aspModel').addEventListener('change', function () { fillAspVolt(); save(); });
  $('aspVolt').addEventListener('change', function () { renderAsp(); save(); });
  $('aspAdd').addEventListener('click', function () {
    var a = aspPickModel(); if (!a) return;
    var v = $('aspVolt').value || '220';
    addItem('Пылеулавливающий агрегат ' + a.n + ' (' + v + ' В)', aspPrice(a), 1, 'opt',
      { sub: 'розница ' + fmtRub(toCents(a.p)) + ' ₽ × 1,2' });
  });

  // ---- своя позиция ----
  $('freeAdd').addEventListener('click', function () {
    var name = ($('freeName').value || '').trim();
    if (!name) { toast('Впишите наименование своей позиции'); return; }
    var raw = String($('freePrice').value || '0').replace(/\s| /g, '').replace(',', '.');
    var v = parseFloat(raw);
    if (!(v >= 0)) v = 0;
    addItem(name, v, 1, $('freeType').value || 'eq');
    $('freeName').value = ''; $('freePrice').value = '';
  });

  // ---- таблетки категорий ----
  var CAT_LABELS = [['fiber', 'Волокно по металлу'], ['milling', 'Фрезерный ЧПУ'],
    ['co2', 'CO₂'], ['marker', 'Маркиратор']];
  (function () {
    var box = fresh('catPills');
    CAT_LABELS.forEach(function (c) {
      var b = el('button', 'pill', esc(c[1]));
      b.type = 'button';
      b.setAttribute('data-cat', c[0]);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () {
        $('cat').value = c[0];
        switchCat();
      });
      box.appendChild(b);
    });
  }());
  function markPills() {
    var cur = $('cat').value;
    var bs = $('catPills').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-cat') === cur;
      bs[i].className = on ? 'pill on' : 'pill';
      bs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function switchCat() {
    var c = $('cat').value;
    state.cat = c;
    markPills();
    $('blkFiber').style.display = c === 'fiber' ? '' : 'none';
    $('blkMill').style.display = c === 'milling' ? '' : 'none';
    $('blkCo2').style.display = c === 'co2' ? '' : 'none';
    $('blkMarker').style.display = c === 'marker' ? '' : 'none';
    var fl = $('catFlow');
    if (fl) fl.textContent = CAT_FLOW[c] || '';
    if (c === 'milling') renderMill();
    if (c === 'co2') { renderCo2(); renderChiller(); renderStabOpt('cStab', 'cStabOut'); }
    if (c === 'marker') { renderMarker(); renderRot(); renderStabOpt('kStab', 'kStabOut'); }
    thinkify();
    save();
  }

  // ---- совпадения в прайсе по каждой категории ----
  function matchesFiber() {
    var f = $('fFormat').value, sv = servoNow();
    var idx = fiberSrc(sv.price_from), rows = [];
    Object.keys(idx[f] || {}).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (p) {
        var r = idx[f][p];
        rows.push({ name: nomFiber('S', f, p), price: r.base, power: String(p) });
      });
    return rows;
  }
  function matchesMill() {
    var f = $('mFormat').value, mode = $('priceMode').value;
    return APP.milling.filter(function (r) { return r.format === f; })
      .map(function (r) {
        return { name: nomMill(r.name), price: mode === 'stock' ? r.stock : r.order,
          cfg: r.name };
      });
  }
  function matchesCo2() {
    return co2List().map(function (r) {
      return { name: co2Name(r), price: r.price, model: r.name };
    });
  }
  function matchesMarker() {
    var mode = $('kMode').value;
    return markerList().map(function (m) {
      return { name: markerName(m, mode), price: mode === 'stock' ? m.stock : m.order,
        model: m.name };
    });
  }
  function renderAllMatches() {
    renderMatches('fMatches', matchesFiber(), function (r) {
      $('fPower').value = r.power; renderFiber(); renderServo(); renderAllMatches(); save();
    });
    renderMatches('mMatches', matchesMill(), function (r) {
      $('mConfig').value = r.cfg; renderMill(); renderAllMatches(); save();
    });
    renderMatches('cMatches', matchesCo2(), function (r) {
      $('cModel').value = r.model; renderCo2(); renderAllMatches(); save();
    });
    renderMatches('kMatches', matchesMarker(), function (r) {
      $('kModel').value = r.model; renderMarker(); renderAllMatches(); save();
    });
  }
  $('cat').addEventListener('change', switchCat);

  // Мощности стабилизатора берём из справочника готовности цеха, а не из текста
  function stabPower() {
    var found = '';
    (APP.readiness || []).forEach(function (r) {
      if (r.name === 'Стабилизатор') found = r.a + ' (волокно) или ' + r.s + ' (труборез)';
    });
    return found || '';
  }

  // ------------------------------------------------------------------ смета
  var dscSel = fresh('discount');
  for (var dd = 0; dd <= 100; dd += 5) opt(dscSel, String(dd), pctText(dd));
  [120, 150, 200, 250, 300].forEach(function (v) { opt(dscSel, String(v), pctText(v)); });
  $('discount').value = String(state.disc || 0);
  $('ndsRate').value = String(state.nds || APP.ndsDefault * 10);

  var KPF = ['kpClient', 'kpInn', 'kpNum', 'kpContact', 'kpPhone', 'kpNote', 'kpDate',
    'kpTitle'];
  KPF.forEach(function (id) {
    if (state.kp[id]) $(id).value = state.kp[id];
    $(id).addEventListener('input', function () {
      state.kp[id] = this.value; save(); renderKP();
    });
  });
  // ---- вариант ТКП: краткое или полное ----
  var kpModeSel = fresh('kpMode');
  APP.kpModes.forEach(function (m) { opt(kpModeSel, m.id, m.title + ' — ' + m.hint); });
  kpModeSel.value = state.kp.kpMode || APP.kpModeDefault;

  function kpMode() {
    var id = state.kp.kpMode || APP.kpModeDefault, found = null;
    APP.kpModes.forEach(function (m) { if (m.id === id) found = m; });
    return found || APP.kpModes[0];
  }

  function renderKpModeHint() {
    var n = $('kpModeHint');
    if (n) n.textContent = kpMode().when;
  }

  $('kpMode').addEventListener('change', function () {
    state.kp.kpMode = this.value; save(); renderKpModeHint(); renderKP();
  });
  renderKpModeHint();

  // Срок поставки в ТКП: под заказ или из наличия. Формулировки — из данных.
  if (state.kp.kpTerm) $('kpTerm').value = state.kp.kpTerm;
  $('kpTerm').addEventListener('change', function () {
    state.kp.kpTerm = this.value; save(); renderKP();
  });

  // ------------------------------------------------------- поставщик в ТКП
  // Профили из данных плюс правки пользователя. Правки живут в state.sups
  // (localStorage), исходные значения всегда можно вернуть кнопкой.
  var SUP_KEYS = ['name', 'ceo_title', 'ceo_short', 'ceo_full', 'head_line', 'inn',
    'kpp', 'ogrn', 'okpo', 'unp', 'account', 'bank', 'bik', 'corr',
    'addr_legal', 'addr_fact'];

  function supExists(id) {
    var yes = false;
    APP.suppliers.forEach(function (s) { if (s.id === id) yes = true; });
    return yes;
  }

  function supBase(id) {
    var found = null;
    APP.suppliers.forEach(function (s) { if (s.id === id) found = s; });
    return found || APP.suppliers[0];
  }

  function supNow() {
    // если в сохранённом черновике остался неизвестный профиль, чиним state,
    // иначе правки продолжали бы писаться под мёртвый ключ
    if (state.supId && !supExists(state.supId)) state.supId = '';
    var id = state.supId || APP.supplierDefault;
    var base = supBase(id), out = {};
    SUP_KEYS.forEach(function (k) { out[k] = base[k] || ''; });
    out.id = base.id; out.short = base.short; out.confirmed = base.confirmed;
    out.country = base.country;
    var edits = state.sups && state.sups[id];
    if (edits) {
      SUP_KEYS.forEach(function (k) {
        if (edits[k] !== undefined && edits[k] !== null) out[k] = edits[k];
      });
    }
    return out;
  }

  // Тот же порядок строк собирает build.py для статики — совпадение под проверкой
  function legalLines(s) {
    var out = [], ident = [];
    if (s.inn) ident.push('ИНН/КПП ' + s.inn + (s.kpp ? ' / ' + s.kpp : ''));
    if (s.ogrn) ident.push('ОГРН/ОКПО ' + s.ogrn + (s.okpo ? ' / ' + s.okpo : ''));
    if (s.unp) ident.push('УНП ' + s.unp);
    out.push('Юр. лицо: ' + s.name + (ident.length ? ' · ' + ident.join(' · ') : ''));
    if (s.ceo_full) out.push('Руководитель: ' + s.ceo_full);
    if (s.account) {
      var acc = 'Р/счёт: ' + s.account;
      if (s.bank) acc += ' · ' + s.bank;
      if (s.bik) acc += ' · БИК ' + s.bik;
      if (s.corr) acc += ' · К/счёт ' + s.corr;
      out.push(acc);
    }
    if (s.addr_legal) out.push('Юр. адрес: ' + s.addr_legal);
    if (s.addr_fact) out.push('Факт. адрес: ' + s.addr_fact);
    out.push(APP.company.social);
    return out;
  }

  function fillSupForm(s) {
    SUP_KEYS.forEach(function (k) {
      var n = $('sup_' + k);
      if (n) n.value = s[k] || '';
    });
  }

  function applySupplier() {
    var s = supNow();
    var hl = $('kpHeadLine'); if (hl) hl.textContent = s.head_line;
    var st = $('kpSignTitle'); if (st) st.textContent = s.ceo_title;
    var sn = $('kpSignName'); if (sn) sn.textContent = s.ceo_short || '—';
    var lg = $('kpLegal');
    if (lg) {
      clear(lg);
      lg.appendChild(el('b', '', esc(APP.company.brand)));
      legalLines(s).forEach(function (t) { lg.appendChild(el('span', '', esc(t))); });
    }
    // Чего не хватает для нормального ТКП — говорим прямо, не подставляя выдумок
    var need = [];
    if (!s.ceo_short) need.push('фамилию в подписи');
    if (!s.inn && !s.unp) need.push('ИНН или УНП');
    if (!s.addr_legal) need.push('юридический адрес');
    if (!s.account) need.push('банковские реквизиты');
    var w = $('supWarn');
    if (w) {
      var msg = need.length
        ? 'Для «' + s.short + '» не заполнено: ' + need.join(', ') +
          '. В ТКП эти строки просто не печатаются.'
        : 'Реквизиты «' + s.short + '» заполнены полностью.';
      // условия поставки написаны под РФ: для белорусского юрлица это надо видеть
      if (s.country === 'BY') msg += ' ' + APP.supplierByWarning;
      w.className = (need.length || s.country === 'BY') ? 'note alert' : 'note';
      w.textContent = msg;
    }
    var sel = $('kpSupplier');
    if (sel && sel.value !== s.id) sel.value = s.id;
    fillSupForm(s);
  }

  $('kpSupplier').addEventListener('change', function () {
    state.supId = this.value; save(); applySupplier(); renderKP();
  });
  $('supEdit').addEventListener('click', function () {
    var b = $('supBox');
    b.open = !b.open;
    if (b.open && b.scrollIntoView) b.scrollIntoView();
  });
  SUP_KEYS.forEach(function (k) {
    var n = $('sup_' + k);
    if (!n) return;
    n.addEventListener('input', function () {
      var id = state.supId || APP.supplierDefault;
      if (!state.sups) state.sups = {};
      if (!state.sups[id]) state.sups[id] = {};
      state.sups[id][k] = this.value;
      save(); applySupplier(); renderKP();
    });
  });
  $('supReset').addEventListener('click', function () {
    var id = state.supId || APP.supplierDefault;
    if (state.sups) delete state.sups[id];
    save(); applySupplier(); renderKP();
    toast('Реквизиты «' + supNow().short + '» вернулись к исходным');
  });
  if (!state.kp.kpDate) {
    var now = new Date();
    var dt = ('0' + now.getDate()).slice(-2) + '.' + ('0' + (now.getMonth() + 1)).slice(-2) +
      '.' + now.getFullYear();
    $('kpDate').value = dt; state.kp.kpDate = dt;
  }

  var TYPES = { eq: 'Оборудование', opt: 'Опция', srv: 'Услуга' };
  var TYPE_ORDER = { eq: 0, opt: 1, srv: 2 };

  // extra — необязательное: short (короткое имя для титула ТКП) и sub
  // (подпись мелким, например выбранные приводы). В смете печатается полное
  // наименование, а в титуле и плашке-резюме — короткое: длинная строка
  // разъезжалась на три строки и ломала вёрстку листа.
  function addItem(name, priceRub, qty, type, extra) {
    var cents = toCents(priceRub);
    var found = null;
    state.items.forEach(function (it) {
      if (it.name === name && it.price === cents) found = it;
    });
    if (found) {
      found.qty = Math.min(99, found.qty + qty);
      // черновик прошлой версии мог не знать про короткое имя — дописываем
      if (extra && extra.short && !found.short) found.short = extra.short;
      if (extra && extra.sub && !found.sub) found.sub = extra.sub;
      toast('Уже было в смете — количество стало ' + found.qty, true);
    } else {
      state.items.push({ name: name, price: cents, qty: qty, type: type || 'eq',
        disc: null, short: (extra && extra.short) || '', sub: (extra && extra.sub) || '' });
      toast('Добавлено: ' + (name.length > 42 ? name.slice(0, 42) + '…' : name), true);
    }
    sortItems(); save(); renderSmeta();
  }
  function sortItems() {
    state.items.sort(function (a, b) {
      return (TYPE_ORDER[a.type] || 0) - (TYPE_ORDER[b.type] || 0);
    });
  }

  function totals() {
    var gDisc = parseInt($('discount').value, 10) || 0;
    var rate = parseInt($('ndsRate').value, 10) || 0;
    var listSum = 0, discSum = 0, lines = [];
    state.items.forEach(function (it) {
      // Скидка по умолчанию — только на оборудование и опции.
      // ПНР и обучение по прайсу платные услуги, они идут без скидки,
      // пока менеджер не поставит её в строке вручную.
      var auto = (it.type === 'srv' && !APP.discountOnServices) ? 0 : gDisc;
      var dsc = (it.disc === null || it.disc === undefined) ? auto : it.disc;
      var unit = soSkidkoy(it.price, dsc);
      var line = unit * it.qty;
      listSum += it.price * it.qty;
      discSum += line;
      lines.push({ item: it, dsc: dsc, unit: unit, line: line });
    });
    var nds = ndsIznutri(discSum, rate);
    return { gDisc: gDisc, rate: rate, listSum: listSum, total: discSum,
      gain: listSum - discSum, bez: nds.bez, nds: nds.nds, lines: lines };
  }

  // Полоса итога внизу экрана: видно, что уже набрано, без ухода со страницы
  function renderSumBar(T) {
    var bar = $('sumBar');
    if (!bar) return;
    var n = state.items.length;
    if (!n) { bar.classList.remove('show'); return; }
    var zero = 0;
    state.items.forEach(function (it) { if (!it.price) zero++; });
    $('sumBarTx').textContent = cnt(n, ['позиция', 'позиции']) +
      ' на ' + fmtRub(T.total) + ' ₽' +
      (zero ? ' · ' + cnt(zero, ['строка', 'строк']) + ' без цены' : '');
    bar.classList.add('show');
  }

  // ------------------------------------------------- спецификация справа
  // Зеркало сметы прямо в конфигураторе: видно, что уже набрано, и можно
  // выбросить лишнюю строку, не уходя с экрана подбора.
  function specText(T) {
    var lines = [];
    T.lines.forEach(function (L) {
      lines.push(L.item.name + ' — ' + L.item.qty + ' шт × ' + fmt(L.unit) +
        ' ₽ = ' + fmt(L.line) + ' ₽');
    });
    lines.push('');
    lines.push('Итого: ' + fmt(T.total) + ' ₽, в т. ч. НДС ' + pctText(T.rate) +
      ' — ' + fmt(T.nds) + ' ₽');
    if (T.gain) lines.push('Скидка к прайсу: ' + fmt(T.gain) + ' ₽');
    return lines.join('\n');
  }
  function renderSpec(T) {
    var body = $('specBody');
    if (!body) return;
    clear(body);
    var has = state.items.length > 0;
    $('specEmpty').style.display = has ? 'none' : '';
    $('specTable').style.display = has ? '' : 'none';
    $('specCnt').textContent = has
      ? cnt(state.items.length, ['позиция', 'позиции']) : '';
    T.lines.forEach(function (L) {
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + esc(L.item.short || L.item.name) +
        (L.item.qty > 1 ? ' <span class="muted">× ' + L.item.qty + '</span>' : '') +
        '</td><td class="num">' + (L.line ? fmtRub(L.line) + ' ₽' : '—') +
        '</td><td class="noprint"><button class="xbtn" type="button" ' +
        'aria-label="убрать позицию">×</button></td>';
      tr.querySelector('button').addEventListener('click', function () {
        var i = state.items.indexOf(L.item);
        if (i >= 0) state.items.splice(i, 1);
        save(); renderSmeta();
      });
      body.appendChild(tr);
    });
    var tot = $('specTotals'); clear(tot);
    if (!has) { $('specOut').value = ''; return; }
    function line(k, v, cls) {
      var n = el('div', cls || '');
      n.innerHTML = '<span>' + k + '</span><span>' + v + '</span>';
      tot.appendChild(n);
    }
    if (T.gain) line('Скидка', '−' + fmtRub(T.gain) + ' ₽', 'gain');
    line('в т. ч. НДС ' + pctText(T.rate), fmtRub(T.nds) + ' ₽');
    line('Итого', fmtRub(T.total) + ' ₽', 'big');
    $('specOut').value = specText(T);
  }

  function renderSmeta() {
    var body = $('smetaBody'); clear(body);
    var T = totals();
    renderSumBar(T);
    renderSpec(T);
    var has = state.items.length > 0;
    $('smetaEmpty').style.display = has ? 'none' : '';
    $('smetaWrap').style.display = has ? '' : 'none';
    $('smetaBadge').textContent = has ? String(state.items.length) : '';

    T.lines.forEach(function (L, i) {
      var tr = d.createElement('tr');
      tr.className = 'item';
      var nameCell = '<b style="color:var(--tx);font-weight:600">' + esc(L.item.name) +
        '</b><br><span class="muted">' + (TYPES[L.item.type] || '') +
        (L.item.disc !== null && L.item.disc !== undefined ? ' · своя скидка' : '') +
        (L.item.ownPrice ? ' · цена правлена вручную' : '') + '</span>';
      // data-label читает мобильная вёрстка: на узком экране строка
      // превращается в карточку, а подписи колонок берутся отсюда
      tr.innerHTML = '<td>' + nameCell + '</td>' +
        '<td data-label="Кол-во"><input type="number" min="1" max="99" value="' +
        L.item.qty + '" aria-label="количество"></td>' +
        '<td data-label="Цена, ₽" class="num"><input type="text" class="pricein' +
        (L.item.ownPrice ? ' own' : '') + '" value="' + fmt(L.item.price) +
        '" aria-label="цена за единицу" inputmode="decimal"></td>' +
        '<td data-label="Скидка, %"><input type="number" min="0" max="' + APP.maxDiscount +
        '" step="0.5" value="' +
        String(L.dsc / 10).replace('.', ',') + '" aria-label="скидка"></td>' +
        '<td data-label="Со скидкой" class="num">' + fmt(L.unit) + '</td>' +
        '<td data-label="Сумма" class="num"><b>' + fmt(L.line) + '</b></td>' +
        '<td class="noprint"><button class="btn mini danger" type="button">Убрать</button></td>';
      var inputs = tr.querySelectorAll('input');
      inputs[0].addEventListener('change', function () {
        L.item.qty = Math.max(1, Math.min(99, parseInt(this.value, 10) || 1));
        save(); renderSmeta();
      });
      // Цена правится вручную: прайс не всегда последнее слово — бывает
      // спецпредложение поставщика или согласованная закупкой цена.
      // Пробелы-разделители разрядов и запятая как в выводе — принимаются.
      inputs[1].addEventListener('change', function () {
        var raw = String(this.value).replace(/\s| /g, '').replace(',', '.');
        var v = parseFloat(raw);
        if (!(v >= 0)) { renderSmeta(); return; }
        var cents = toCents(v);
        if (cents > 9999999999) cents = 9999999999;
        var was = L.item.price;
        L.item.price = cents;
        if (cents !== was) L.item.ownPrice = true;
        save(); renderSmeta();
      });
      inputs[2].addEventListener('change', function () {
        var v = parseFloat(String(this.value).replace(',', '.'));
        if (!(v >= 0)) v = 0;
        if (v > APP.maxDiscount) v = APP.maxDiscount;
        L.item.disc = Math.round(v * 10);
        save(); renderSmeta();
      });
      tr.querySelector('button').addEventListener('click', function () {
        var idx = state.items.indexOf(L.item);
        if (idx >= 0) state.items.splice(idx, 1);
        save(); renderSmeta();
      });
      body.appendChild(tr);
    });

    var tot = $('totals'); clear(tot);
    if (!has) { clear($('propis')); clear($('checkBlock')); $('checkBlock').className = ''; renderKP(); return; }
    function row(k, v, cls) {
      var n = el('div', cls || '');
      n.innerHTML = '<span>' + k + '</span><span>' + v + '</span>';
      tot.appendChild(n);
    }
    // Если менеджер правил цену руками, называть строку «по прайсу» нельзя
    var ownAny = false;
    T.lines.forEach(function (L) { if (L.item.ownPrice) ownAny = true; });
    row(ownAny ? 'Сумма до скидки — цены правлены вручную' : 'Сумма по прайсу',
      fmt(T.listSum) + ' ₽');
    // Подпись честная: общий процент показываем только если построчных скидок нет,
    // иначе он не описывает сумму выгоды.
    var perLine = false;
    T.lines.forEach(function (L) { if (L.dsc !== T.gDisc) perLine = true; });
    row(T.gain
      ? (perLine ? 'Ваша выгода — скидки по строкам'
        : 'Ваша выгода — скидка ' + pctText(T.gDisc))
      : 'Ваша выгода', (T.gain ? '−' : '') + fmt(T.gain) + ' ₽', 'gain');
    row('Итого без НДС', fmt(T.bez) + ' ₽');
    row('в т. ч. НДС ' + pctText(T.rate), fmt(T.nds) + ' ₽');
    row('ИТОГО к оплате', fmt(T.total) + ' ₽', 'big');

    $('propis').innerHTML = 'Сумма прописью: ' + esc(propisyu(T.total)) +
      ', в том числе НДС ' + pctText(T.rate) + ' — ' + esc(propisyu(T.nds)) + '.';

    // сходимость — независимая перепроверка
    var cb = $('checkBlock'); clear(cb);
    var problems = [];
    if (T.bez + T.nds !== T.total) {
      problems.push('Без НДС + НДС = ' + fmt(T.bez + T.nds) + ' ₽, а ИТОГО = ' +
        fmt(T.total) + ' ₽. Расхождение ' + fmt(Math.abs(T.bez + T.nds - T.total)) + ' ₽');
    }
    // Пересчёт другим путём: скидка через долю от прайса, а не функцией soSkidkoy,
    // и НДС из суммы без налога, а не изнутри итога. Совпадение двух разных
    // способов — это уже проверка, а не пересказ первого расчёта.
    var alt = 0;
    T.lines.forEach(function (L) {
      var line = L.item.price * L.item.qty;
      alt += line - divHalfUp(line * L.dsc, 1000);
    });
    if (Math.abs(alt - T.total) > T.lines.length) {
      problems.push('Другой способ расчёта скидки даёт ' + fmt(alt) + ' ₽ против ' +
        fmt(T.total) + ' ₽');
    }
    var ndsBack = divHalfUp(T.bez * T.rate, 1000);
    if (Math.abs(ndsBack - T.nds) > 1) {
      problems.push('НДС от суммы без налога = ' + fmt(ndsBack) + ' ₽, а изнутри итога ' +
        fmt(T.nds) + ' ₽');
    }
    var gainCheck = T.listSum - T.total;
    if (gainCheck !== T.gain) {
      problems.push('Выгода как прайс минус итог = ' + fmt(gainCheck) + ' ₽ против ' +
        fmt(T.gain) + ' ₽');
    }
    if (problems.length) {
      cb.className = 'check fail';
      cb.innerHTML = '<b>Сходимость нарушена — КП не выпускать.</b><ul>' +
        problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    } else {
      cb.className = 'check good';
      cb.innerHTML = '<b>Сходимость проверена.</b> Всё считается от одного числа: ' +
        fmt(T.total) + ' ₽. Без НДС + НДС = ИТОГО; скидка, посчитанная другим ' +
        'способом (доля от прайса), даёт тот же итог; НДС, начисленный на сумму ' +
        'без налога, совпадает с выделенным изнутри.';
    }
    renderKP();
  }

  $('discount').addEventListener('change', function () {
    state.disc = parseInt(this.value, 10); save(); renderSmeta();
  });
  $('ndsRate').addEventListener('change', function () {
    state.nds = parseInt(this.value, 10); save(); renderSmeta();
  });
  $('btnClear').addEventListener('click', function () {
    if (state.items.length && !confirm('Очистить смету?')) return;
    state.items = []; save(); renderSmeta();
  });

  // ------------------------------------------------------------------ ТКП
  // Оформление повторяет мастер-шаблон скилла lasercut-kp: титульная плашка,
  // блок «Кому / Исх. №», плашка-резюме из четырёх ячеек, раздел «1. Смета
  // поставки» и сумма прописью. Постоянные разделы (условия, гарантия, подпись,
  // реквизиты) лежат в статической разметке ниже предпросмотра.
  var MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function dateLong(s) {
    var p = String(s || '').split('.');
    if (p.length !== 3 || !MONTHS_G[parseInt(p[1], 10) - 1]) return s || '—';
    return 'от «' + p[0] + '» ' + MONTHS_G[parseInt(p[1], 10) - 1] + ' ' + p[2] + ' г.';
  }

  function termLabel() {
    return state.kp.kpTerm === 'stock' ? APP.deliveryStock : APP.deliveryOrder;
  }

  function renderKP() {
    var box = $('kpPreview'); clear(box);
    var T = totals(), k = state.kp;
    var it0 = state.items.length ? state.items[0] : null;
    var first = it0 ? (it0.short || it0.name) : '';
    var firstSub = it0 ? (it0.sub || '') : '';
    // Строка «Срок поставки» в разделе 2 живёт в статике — обновляем её текстом из данных.
    var tv = $('kpTermVal');
    if (tv) {
      tv.textContent = state.kp.kpTerm === 'stock'
        ? APP.deliveryTerms.stock : APP.deliveryTerms.order;
    }
    var title = k.kpTitle || first || 'Оборудование с ЧПУ LASERCUT';

    box.appendChild(el('div', 'kp-title',
      '<b>ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</b><span>' + esc(title) + '</span>'));

    // Пустое поле — линия под запись от руки, а не строка подчёркиваний:
    // подчёркивания ловятся проверкой «незаменённых плейсхолдеров».
    var BL = '<span class="kp-blank"></span>';
    box.appendChild(el('div', 'kp-to',
      '<div>Кому: <b>' + (k.kpClient ? esc(k.kpClient) : BL) + '</b>' +
      ' ИНН ' + (k.kpInn ? esc(k.kpInn) : BL) +
      (k.kpNote ? ' — ' + esc(k.kpNote) : '') + '</div>' +
      '<div>Исх. № <b>' + (k.kpNum ? esc(k.kpNum) : BL) + '</b></div>' +
      '<div>Контакты: <b>' + (k.kpContact ? esc(k.kpContact) : BL) + '</b>' +
      (k.kpPhone ? ', тел. ' + esc(k.kpPhone) : '') + '</div>' +
      '<div>' + esc(dateLong(k.kpDate)) + '</div>'));

    box.appendChild(el('p', 'kp-lead',
      'Благодарим за интерес к оборудованию LASERCUT. Ниже — состав поставки, ' +
      'стоимость и условия. Оборудование новое, не бывшее в эксплуатации, ' +
      'соответствует требованиям ТР ТС 004/2011, 010/2011, 020/2011.'));

    box.appendChild(el('div', 'kp-sum',
      '<div><div class="k">Рекомендуем</div><div class="v">' +
      esc(first || '—') + '</div>' +
      (firstSub ? '<div class="s">' + esc(firstSub) + '</div>' : '') + '</div>' +
      '<div><div class="k">Стоимость, с НДС ' + pctText(T.rate) +
      '</div><div class="v">' + fmt(T.total) + ' ₽</div></div>' +
      '<div><div class="k">Срок поставки</div><div class="v">' +
      esc(termLabel()) + '</div></div>' +
      '<div><div class="k">Гарантия</div><div class="v">' +
      esc(APP.guarantee.label) + '</div></div>'));

    box.appendChild(el('div', 'kp-sec', '1.&nbsp; Смета поставки'));

    if (!state.items.length) {
      box.appendChild(el('div', 'kp-empty',
        'Смета пуста: добавьте позиции на вкладке «Конфигуратор» — они встанут ' +
        'в эту таблицу, а итоги и сумма прописью пересчитаются сами.'));
      return;
    }

    var tb = el('table');
    var rows = T.lines.map(function (L, i) {
      return '<tr><td class="kp-n">' + (i + 1) + '</td>' +
        '<td class="kp-nm"><b>' + esc(L.item.name) + '</b>' +
        (L.dsc ? '<span>скидка ' + pctText(L.dsc) + ' от цены прайса ' +
          fmt(L.item.price) + ' ₽</span>' : '') + '</td>' +
        '<td class="kp-q">' + L.item.qty + ' шт</td>' +
        '<td class="kp-p">' + fmt(L.unit) + '</td>' +
        '<td class="kp-p"><b>' + fmt(L.line) + '</b></td></tr>';
    }).join('');
    var tot = '';
    if (T.gain) {
      tot += '<tr class="kp-tot"><td colspan="4">Ваша выгода:</td><td>' +
        fmt(T.gain) + '</td></tr>';
    }
    tot += '<tr class="kp-tot"><td colspan="4">Итого без НДС:</td><td>' +
      fmt(T.bez) + '</td></tr>' +
      '<tr class="kp-tot"><td colspan="4">в т. ч. НДС ' + pctText(T.rate) +
      ':</td><td>' + fmt(T.nds) + '</td></tr>' +
      '<tr class="kp-fin"><td colspan="4">ИТОГО к оплате (с НДС ' + pctText(T.rate) +
      '):</td><td>' + fmt(T.total) + ' ₽</td></tr>';
    tb.innerHTML = '<thead><tr><th class="kp-n">№</th><th>Наименование</th>' +
      '<th class="kp-q">Кол-во</th><th class="kp-p">Цена за ед., с НДС ₽</th>' +
      '<th class="kp-p">Сумма, с НДС ₽</th></tr></thead><tbody>' + rows + tot + '</tbody>';
    box.appendChild(tb);

    box.appendChild(el('p', 'kp-propis',
      '<b>Сумма прописью:</b> ' + esc(propisyu(T.total)) + ', в том числе НДС ' +
      pctText(T.rate) + ' — ' + esc(lower1(propisyu(T.nds))) +
      '. Доставка в стоимость не включена. Счёт фиксирует цену и наличие на ' +
      APP.invoiceValidDays + ' дней.'));

    // Полный вариант: разделы, которые есть в фирменном шаблоне.
    // Нумерация продолжает смету, а разделы «Условия» и «Гарантия» лежат
    // в статике ниже — им номера подставляет тот же счётчик.
    if (kpMode().id !== 'full') { setStaticSectionNumbers(2, 3); return; }
    var n = 2;
    var cfg = fiberInSmeta();

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Что закрывает эта конфигурация'));
    var rows = configRows(cfg);
    if (rows.length) {
      box.appendChild(kpPairTable(rows));
    } else {
      box.appendChild(el('p', 'kp-propis', 'В смете нет волоконного станка — раздел ' +
        'заполняется по выбранной конфигурации.'));
    }

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Комплектация'));
    var inc = el('ul', 'kp-list');
    APP.kpIncluded.forEach(function (x) { inc.appendChild(el('li', '', esc(x))); });
    if (cfg) {
      inc.appendChild(el('li', '', 'Контроллер <b>' + esc(cfg.ctrl) + '</b>, голова <b>' +
        esc(cfg.head) + '</b>, чиллер ' + esc(cfg.chiller)));
    }
    box.appendChild(inc);
    box.appendChild(el('p', 'kp-propis', esc(APP.kpIncludedNote)));

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Технические характеристики'));
    box.appendChild(kpPairTable(techRows(cfg)));
    box.appendChild(el('p', 'kp-propis',
      'Серийные параметры — по карточке модели производителя. Точные характеристики ' +
      'конкретного исполнения подтверждаются паспортом завода при отгрузке.'));

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Как пройдёт запуск'));
    var steps = el('ol', 'kp-list');
    APP.kpLaunch.forEach(function (s) {
      steps.appendChild(el('li', '', '<b>' + esc(s[0]) + '.</b> ' + esc(s[1])));
    });
    box.appendChild(steps);

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Преимущества'));
    box.appendChild(kpPairTable(APP.kpAdvantages));

    // статические «Условия поставки» и «Гарантия и сервис» идут следом
    setStaticSectionNumbers(n, n + 1);
  }

  // Номера двух статических разделов зависят от варианта ТКП
  function setStaticSectionNumbers(a, b) {
    var t1 = $('kpSecTerms'), t2 = $('kpSecService');
    if (t1) t1.innerHTML = a + '.&nbsp; Условия поставки';
    if (t2) t2.innerHTML = b + '.&nbsp; Гарантия и сервис';
  }

  function kpPairTable(rows) {
    var tb = el('table', 'kp-t');
    tb.innerHTML = '<tbody>' + rows.map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody>';
    return tb;
  }

  // Волоконный станок из сметы: по нему собираются разделы полного ТКП
  function fiberInSmeta() {
    var found = null;
    state.items.forEach(function (it) {
      if (found || it.type !== 'eq') return;
      // «Лазерный станок по металлу WATTSAN S 1530 3000 Вт …»; старые
      // черновики хранят прежний вид «Wattsan S 1530 3000W» — читаем оба
      var m = /WATTSAN (A|S) (\d{4}) (\d+) Вт/i.exec(it.name) ||
        /Wattsan (A|S) (\d{4}) (\d+)W/i.exec(it.name);
      if (!m) return;
      var kit = APP.fiberKit[m[3]] || {};
      found = {
        series: m[1], format: m[2], power: parseInt(m[3], 10),
        field: APP.fiberFormats[m[2]],
        table: /сменный стол/.test(it.name),
        rot: (/rotary (6-\d+)/.exec(it.name) || [])[1] || '',
        servo: it.sub || '',
        ctrl: (/rotary/.test(it.name) ? APP.fiberKitRotaryCtrl : kit.ctrl) || '',
        head: kit.head || '', chiller: kit.chiller || ''
      };
    });
    return found;
  }

  function configRows(cfg) {
    if (!cfg) return [];
    var rows = [
      ['Рабочее поле', cfg.field + ' мм'],
      ['Мощность источника', cfg.power + ' Вт'],
    ];
    var cut = null;
    APP.techCutMax.forEach(function (r) {
      if (parseInt(String(r[0]).replace(/\D/g, ''), 10) === cfg.power) cut = r;
    });
    if (cut) {
      rows.push(['Предел по таблицам режимов',
        'чёрная сталь ' + cut[1] + ', нержавейка ' + cut[2] + ', алюминий ' + cut[3]]);
      rows.push(['Рабочий режим',
        'завод требует запас не менее ' + APP.reservePct + ' % от предела: ' +
        'на максимуме станок работает лишь короткое время']);
    }
    rows.push(['Газ по материалу',
      'сталь — кислород, нержавейка и алюминий — азот или воздух']);
    if (cfg.rot) {
      rows.push(['Труборез (модуль RD)', 'круглая труба до ' +
        (APP.techRd[0] ? APP.techRd[0][1] : '') + ', квадратная до ' +
        (APP.techRd[1] ? APP.techRd[1][1] : '') + ', длина до ' +
        (APP.techRd[2] ? APP.techRd[2][1] : '')]);
    }
    if (cfg.table) rows.push(['Сменный стол', 'да, 1650×3215 мм']);
    if (cfg.servo) rows.push(['Приводы', cfg.servo]);
    return rows;
  }

  function techRows(cfg) {
    var rows = [];
    if (cfg) {
      rows.push(['Поле и мощность', cfg.field + ' мм · ' + cfg.power + ' Вт']);
      rows.push(['Контроллер и голова', cfg.ctrl + ' · ' + cfg.head]);
      rows.push(['Охлаждение', cfg.chiller]);
      var col = cfg.series === 'A' ? 1 : 2;
      APP.techAvsS.forEach(function (r) {
        if (/Мощность по паспорту|Вес|Сменный стол|Труборез/.test(r[0])) return;
        rows.push([r[0], r[col]]);
      });
    }
    rows.push(['Соответствие', 'ТР ТС 004/2011, 010/2011, 020/2011']);
    return rows;
  }

  $('btnPrint').addEventListener('click', function () {
    var p = $('p-smeta');
    p.classList.add('printme');
    window.print();
    setTimeout(function () { p.classList.remove('printme'); }, 400);
  });

  // ------------------------------------------------- выгрузка ТКП в файл
  // Собирается настоящий .docx (модуль docx.js). Прежний вариант «HTML внутри
  // .doc» настольный Word открывал, а мобильные Word и Google Документы
  // считали файл повреждённым — поэтому пакет OOXML собирается честно:
  // document.xml, styles.xml, логотип в word/media, ZIP без сжатия.
  var NAVY = '1F3A5F', LIGHT = 'DCE8F4', PALE = 'EAF1F8', GREY = '5A6572',
    WHITE = 'FFFFFF', DIM = 'B9CBE0', INK = '202020';
  var W_ALL = 10466;            // ширина текста: A4 (11906) минус поля 2×720

  function logoB64() {
    var img = d.querySelector('#kpDoc img.kp-logo');
    var src = img ? (img.getAttribute('src') || '') : '';
    var i = src.indexOf('base64,');
    return i < 0 ? '' : src.slice(i + 7);
  }

  // плашка во всю ширину — таблица из одной ячейки с заливкой
  function dBand(inner, fill, keep) {
    return DOCX.tbl([DOCX.tr([DOCX.tc(inner, { w: W_ALL, fill: fill, noBorder: true })])],
      [W_ALL]) + (keep ? DOCX.p('', { space: { after: 0 } }) : '');
  }

  function dSection(num, name) {
    return dBand(DOCX.p(DOCX.run(num + '.  ' + name, { b: true, color: WHITE, sz: 21 }),
      { space: { before: 20, after: 20 }, keepNext: true }), NAVY) +
      DOCX.p('', { space: { after: 20 } });
  }

  function dGap(after) {
    return DOCX.p('', { space: { after: after === undefined ? 80 : after } });
  }

  function docxBody() {
    var T = totals(), k = state.kp, sup = supNow();
    var it0 = state.items.length ? state.items[0] : null;
    var first = it0 ? (it0.short || it0.name) : '';
    var firstSub = it0 ? (it0.sub || '') : '';
    var title = k.kpTitle || first || 'Оборудование с ЧПУ LASERCUT';
    var out = '';

    // шапка: логотип и контакты
    var contacts = APP.company.phone + ' · ' + APP.company.email + ' · ' +
      APP.company.site;
    out += DOCX.tbl([DOCX.tr([
      DOCX.tc(DOCX.p(DOCX.image(1, 5.5, 1.29, 'LASERCUT'), { space: { after: 0 } }),
        { w: 4600, noBorder: true, valign: 'center' }),
      DOCX.tc(DOCX.p(DOCX.run(contacts, { sz: 16, color: GREY }),
        { align: 'right', space: { after: 20 } }) +
        DOCX.p(DOCX.run(sup.head_line, { sz: 15, color: GREY }),
          { align: 'right', space: { after: 0 } }),
        { w: 5866, noBorder: true })
    ])], [4600, 5866]);
    out += dGap(80);

    // титульная плашка
    out += dBand(
      DOCX.p(DOCX.run('ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
        { b: true, color: WHITE, sz: 28 }), { align: 'center', space: { after: 30 } }) +
      DOCX.p(DOCX.run(title, { color: LIGHT, sz: 20 }),
        { align: 'center', space: { after: 0 } }), NAVY);
    out += dGap(80);

    // кому / исх. номер / контакты / дата
    // пустое поле — подчёркнутые пробелы, а не строка подчёркиваний:
    // подряд идущие «_» ловятся проверкой «незаменённых плейсхолдеров»
    function orLine(v, opt) {
      return v ? DOCX.run(v, opt)
        : DOCX.run('                  ', { u: true, sz: (opt && opt.sz) || 17 });
    }
    out += DOCX.tbl([
      DOCX.tr([
        DOCX.tc(DOCX.p(DOCX.run('Кому: ', { sz: 17 }) +
          orLine(k.kpClient, { b: true, sz: 17 }) +
          DOCX.run('  ИНН ', { sz: 17 }) + orLine(k.kpInn, { sz: 17 }) +
          DOCX.run(k.kpNote ? ' — ' + k.kpNote : '', { sz: 17 }),
          { space: { after: 0 } }), { w: 6500 }),
        DOCX.tc(DOCX.p(DOCX.run('Исх. № ', { sz: 17 }) +
          orLine(k.kpNum, { b: true, sz: 17 }), { space: { after: 0 } }),
          { w: 3966 })
      ]),
      DOCX.tr([
        DOCX.tc(DOCX.p(DOCX.run('Контакты: ', { sz: 17 }) +
          orLine(k.kpContact, { b: true, sz: 17 }) +
          DOCX.run(k.kpPhone ? ', тел. ' + k.kpPhone : '', { sz: 17 }),
          { space: { after: 0 } }), { w: 6500 }),
        DOCX.tc(DOCX.p(DOCX.run(dateLong(k.kpDate), { sz: 17 }),
          { space: { after: 0 } }), { w: 3966 })
      ])
    ], [6500, 3966]);
    out += dGap(100);

    // вводный абзац
    out += DOCX.p(DOCX.run('Благодарим за интерес к оборудованию LASERCUT. Ниже — ' +
      'состав поставки, стоимость и условия. Оборудование новое, не бывшее ' +
      'в эксплуатации, соответствует требованиям ТР ТС 004/2011, 010/2011, 020/2011.',
      { sz: 19 }), { align: 'both', space: { after: 100 } });

    // плашка-резюме из четырёх ячеек
    function sumCell(kk, vv, w, sub) {
      return DOCX.tc(
        DOCX.p(DOCX.run(kk, { sz: 15, color: DIM }), { space: { after: 20 } }) +
        DOCX.p(DOCX.run(vv, { b: true, color: WHITE, sz: 22 }),
          { space: { after: sub ? 20 : 0 } }) +
        (sub ? DOCX.p(DOCX.run(sub, { sz: 15, color: DIM }), { space: { after: 0 } }) : ''),
        { w: w, fill: NAVY, noBorder: true });
    }
    var q = Math.floor(W_ALL / 4);
    out += DOCX.tbl([DOCX.tr([
      sumCell('Рекомендуем', first || '—', q, firstSub),
      sumCell('Стоимость, с НДС ' + pctText(T.rate), fmt(T.total) + ' ₽', q),
      sumCell('Срок поставки', termLabel(), q),
      sumCell('Гарантия', APP.guarantee.label, W_ALL - q * 3)
    ])], [q, q, q, W_ALL - q * 3]);
    out += dGap(120);

    // 1. Смета поставки
    out += dSection(1, 'Смета поставки');
    var G = [560, 4620, 800, 2200, 2286];
    if (state.items.length) {
      var rows = [DOCX.tr([
        DOCX.tc(DOCX.p(DOCX.run('№', { b: true, color: NAVY, sz: 17 }),
          { align: 'center', space: { after: 0 } }), { w: G[0], fill: LIGHT }),
        DOCX.tc(DOCX.p(DOCX.run('Наименование', { b: true, color: NAVY, sz: 17 }),
          { space: { after: 0 } }), { w: G[1], fill: LIGHT }),
        DOCX.tc(DOCX.p(DOCX.run('Кол-во', { b: true, color: NAVY, sz: 17 }),
          { align: 'center', space: { after: 0 } }), { w: G[2], fill: LIGHT }),
        DOCX.tc(DOCX.p(DOCX.run('Цена за ед., с НДС ₽', { b: true, color: NAVY, sz: 17 }),
          { align: 'right', space: { after: 0 } }), { w: G[3], fill: LIGHT }),
        DOCX.tc(DOCX.p(DOCX.run('Сумма, с НДС ₽', { b: true, color: NAVY, sz: 17 }),
          { align: 'right', space: { after: 0 } }), { w: G[4], fill: LIGHT })
      ], { header: true })];

      T.lines.forEach(function (L, i) {
        var nm = DOCX.p(DOCX.run(L.item.name, { b: true, color: NAVY, sz: 17 }),
          { space: { after: L.dsc ? 20 : 0 } });
        if (L.dsc) {
          nm += DOCX.p(DOCX.run('скидка ' + pctText(L.dsc) + ' от цены прайса ' +
            fmt(L.item.price) + ' ₽', { sz: 15, color: GREY }), { space: { after: 0 } });
        }
        rows.push(DOCX.tr([
          DOCX.tc(DOCX.p(DOCX.run(String(i + 1), { sz: 17, color: GREY }),
            { align: 'center', space: { after: 0 } }), { w: G[0] }),
          DOCX.tc(nm, { w: G[1] }),
          DOCX.tc(DOCX.p(DOCX.run(L.item.qty + ' шт', { sz: 17 }),
            { align: 'center', space: { after: 0 } }), { w: G[2] }),
          DOCX.tc(DOCX.p(DOCX.run(fmt(L.unit), { sz: 17 }),
            { align: 'right', space: { after: 0 } }), { w: G[3] }),
          DOCX.tc(DOCX.p(DOCX.run(fmt(L.line), { b: true, sz: 17 }),
            { align: 'right', space: { after: 0 } }), { w: G[4] })
        ]));
      });

      function totRow(label, value, fill, color) {
        return DOCX.tr([
          DOCX.tc(DOCX.p(DOCX.run(label, { b: true, color: color, sz: 17 }),
            { align: 'right', space: { after: 0 } }),
            { w: G[0] + G[1] + G[2] + G[3], span: 4, fill: fill }),
          DOCX.tc(DOCX.p(DOCX.run(value, { b: true, color: color, sz: 17 }),
            { align: 'right', space: { after: 0 } }), { w: G[4], fill: fill })
        ]);
      }
      if (T.gain) rows.push(totRow('Ваша выгода:', fmt(T.gain), PALE, NAVY));
      rows.push(totRow('Итого без НДС:', fmt(T.bez), PALE, NAVY));
      rows.push(totRow('в т. ч. НДС ' + pctText(T.rate) + ':', fmt(T.nds), PALE, NAVY));
      rows.push(totRow('ИТОГО к оплате (с НДС ' + pctText(T.rate) + '):',
        fmt(T.total) + ' ₽', NAVY, WHITE));
      out += DOCX.tbl(rows, G);

      out += DOCX.p(DOCX.run('Сумма прописью: ', { b: true, color: NAVY, sz: 17 }) +
        DOCX.run(propisyu(T.total) + ', в том числе НДС ' + pctText(T.rate) + ' — ' +
          lower1(propisyu(T.nds)) + '. Доставка в стоимость не включена. Счёт фиксирует цену ' +
          'и наличие на ' + APP.invoiceValidDays + ' дней.', { sz: 17 }),
        { align: 'both', space: { before: 60, after: 80 } });
    } else {
      out += DOCX.p(DOCX.run('Смета пуста: позиции добавляются на вкладке ' +
        '«Конфигуратор».', { sz: 17, color: GREY }), { space: { after: 120 } });
    }

    // Полный вариант: те же разделы, что в предпросмотре
    var secNo = 2;
    if (kpMode().id === 'full') {
      var cfg = fiberInSmeta();
      out += dSection(secNo++, 'Что закрывает эта конфигурация');
      var cRows = configRows(cfg);
      if (cRows.length) {
        out += pairTableRows(cRows);
      } else {
        out += DOCX.p(DOCX.run('В смете нет волоконного станка — раздел заполняется ' +
          'по выбранной конфигурации.', { sz: 17, color: GREY }), { space: { after: 80 } });
      }
      out += dGap();

      out += dSection(secNo++, 'Комплектация');
      APP.kpIncluded.forEach(function (x) {
        out += DOCX.p(DOCX.run('•  ' + x, { sz: 17 }), { space: { after: 20 } });
      });
      if (cfg) {
        out += DOCX.p(DOCX.run('•  Контроллер ' + cfg.ctrl + ', голова ' + cfg.head +
          ', чиллер ' + cfg.chiller, { sz: 17 }), { space: { after: 20 } });
      }
      out += DOCX.p(DOCX.run(APP.kpIncludedNote, { sz: 15, color: GREY }),
        { space: { after: 80 } });
      out += dGap();

      out += dSection(secNo++, 'Технические характеристики');
      out += pairTableRows(techRows(cfg));
      out += DOCX.p(DOCX.run('Серийные параметры — по карточке модели производителя. ' +
        'Точные характеристики конкретного исполнения подтверждаются паспортом ' +
        'завода при отгрузке.', { sz: 15, color: GREY }), { space: { after: 80 } });
      out += dGap();

      out += dSection(secNo++, 'Как пройдёт запуск');
      APP.kpLaunch.forEach(function (s, i) {
        out += DOCX.p(DOCX.run((i + 1) + '.  ' + s[0] + '. ', { b: true, sz: 17 }) +
          DOCX.run(s[1], { sz: 17 }), { space: { after: 25 } });
      });
      out += dGap();

      out += dSection(secNo++, 'Преимущества');
      out += pairTableRows(APP.kpAdvantages);
      out += dGap();
    }

    // Дальше — таблицы из листа ТКП: тексты берутся из разметки, не дублируются
    function pairs(node) {
      if (!node) return [];
      return Array.prototype.map.call(node.querySelectorAll('tr'), function (tr) {
        var h = tr.querySelector('th'), c = tr.querySelector('td');
        return [h ? h.textContent : '', c ? c.textContent : ''];
      });
    }
    function pairTableRows(list) {
      return pairTable(list.map(function (r) { return [r[0], r[1]]; }));
    }
    function pairTable(list) {
      var g = [3050, W_ALL - 3050];
      return DOCX.tbl(list.map(function (row) {
        return DOCX.tr([
          DOCX.tc(DOCX.p(DOCX.run(row[0], { b: true, color: NAVY, sz: 17 }),
            { space: { after: 0 } }), { w: g[0], fill: LIGHT }),
          DOCX.tc(DOCX.p(DOCX.run(row[1], { sz: 17 }), { space: { after: 0 } }),
            { w: g[1] })
        ]);
      }), g);
    }
    out += dSection(secNo++, 'Условия поставки') +
      pairTable(pairs(d.getElementById('kpTermsTable'))) + dGap();
    out += dSection(secNo++, 'Гарантия и сервис') +
      pairTable(pairs(d.getElementById('kpServiceTable'))) + dGap();

    // «Готовы сделать следующий шаг?»
    var cta = d.querySelector('#kpDoc .kp-cta');
    if (cta) {
      out += dBand(
        DOCX.p(DOCX.run(cta.querySelector('b').textContent,
          { b: true, color: WHITE, sz: 24 }), { space: { after: 30 } }) +
        DOCX.p(DOCX.run(cta.querySelector('span').textContent,
          { color: LIGHT, sz: 17 }), { space: { after: 0 } }), NAVY);
      out += dGap(160);
    }

    // подпись и М.П.
    var sg = [5000, 466, 5000];
    out += DOCX.tbl([
      DOCX.tr([
        DOCX.tc(DOCX.p(DOCX.run('С уважением,', { sz: 17 }), { space: { after: 20 } }) +
          DOCX.p(DOCX.run(sup.ceo_title, { b: true, sz: 17 }), { space: { after: 0 } }),
          { w: sg[0], noBorder: true }),
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[1], noBorder: true }),
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[2], noBorder: true })
      ]),
      DOCX.tr([
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[0], edge: 'bottom' }),
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[1], noBorder: true }),
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[2], edge: 'bottom' })
      ], { h: 700 }),
      DOCX.tr([
        DOCX.tc(DOCX.p(DOCX.run(sup.ceo_short || '—', { b: true, sz: 17 }) +
          DOCX.run(' · подпись / Ф.И.О.', { sz: 15, color: GREY }),
          { space: { after: 0 } }), { w: sg[0], noBorder: true }),
        DOCX.tc(DOCX.p('', { space: { after: 0 } }), { w: sg[1], noBorder: true }),
        DOCX.tc(DOCX.p(DOCX.run('М.П.', { sz: 15, color: GREY }),
          { space: { after: 0 } }), { w: sg[2], noBorder: true })
      ])
    ], sg);
    out += dGap(140);

    // менеджер — тот, что задан в шаге 1 конфигуратора
    var M = mgr();
    out += dBand(
      DOCX.p(DOCX.run('Ваш менеджер', { sz: 15, color: GREY }), { space: { after: 20 } }) +
      DOCX.p(DOCX.run(M.name, { b: true, color: NAVY, sz: 19 }) +
        DOCX.run(' · ' + M.role, { sz: 17, color: INK }),
        { space: { after: 20 } }) +
      DOCX.p(DOCX.run(M.phone + ' · ' + M.email + ' · ' +
        M.sites, { sz: 17, color: INK }), { space: { after: 0 } }), PALE);
    out += dGap(140);

    // реквизиты выбранного поставщика
    out += DOCX.p(DOCX.run(APP.company.brand, { b: true, color: NAVY, sz: 16 }),
      { space: { after: 20 } });
    legalLines(sup).forEach(function (t) {
      out += DOCX.p(DOCX.run(t, { sz: 15, color: GREY }), { space: { after: 10 } });
    });
    return out;
  }

  function kpFileName(ext) {
    var k = state.kp;
    var who = (k.kpClient || 'клиент').replace(/[\\/:*?"<>|]/g, ' ').trim();
    var num = k.kpNum ? ' № ' + k.kpNum : '';
    var when = k.kpDate ? ' от ' + k.kpDate : '';
    var kind = kpMode().id === 'full' ? '' : ' краткое';
    return 'ТКП' + kind + ' ' + who + num + when + '.' + ext;
  }

  var DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function kpBlob() {
    var logo = logoB64();
    var bytes = DOCX.build({
      body: docxBody(),
      // пустую картинку в пакет не кладём: Word посчитал бы файл повреждённым
      images: logo ? [{ name: 'logo.png', b64: logo }] : []
    });
    return new Blob([bytes], { type: DOCX_MIME });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = d.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    d.body.appendChild(a); a.click(); d.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  $('btnWord').addEventListener('click', function () {
    if (!state.items.length && !confirm('Смета пуста. Всё равно скачать файл?')) return;
    try {
      downloadBlob(kpBlob(), kpFileName('docx'));
      toast('Файл .docx скачан');
    } catch (e) {
      toast('Не удалось собрать файл: ' + (e && e.message ? e.message : 'ошибка'));
    }
  });

  // «Отправить файлом»: сначала системное «Поделиться» (телефон), иначе скачивание.
  // Раньше отказ share проглатывался молча и выглядел как «кнопка не работает» —
  // теперь каждый исход отвечает сообщением, а при ошибке файл всё равно скачивается.
  $('btnSend').addEventListener('click', function () {
    var name = kpFileName('docx'), blob, file = null;
    try { blob = kpBlob(); } catch (e) {
      toast('Не удалось собрать файл: ' + (e && e.message ? e.message : 'ошибка'));
      return;
    }
    try { file = new File([blob], name, { type: DOCX_MIME }); } catch (e) { file = null; }
    var can = !!(file && navigator.share && navigator.canShare &&
      navigator.canShare({ files: [file] }));
    if (!can) {
      downloadBlob(blob, name);
      toast(navigator.share
        ? 'Браузер не умеет делиться файлами — файл скачан, отправьте вложением'
        : 'Системное «Поделиться» недоступно — файл скачан');
      return;
    }
    navigator.share({ files: [file], title: 'ТКП LASERCUT' }).then(function () {
      toast('Файл передан');
    }, function (err) {
      var n = err && err.name;
      if (n === 'AbortError') { toast('Отправка отменена'); return; }
      downloadBlob(blob, name);
      toast('Поделиться не вышло (' + (n || 'ошибка') + ') — файл скачан');
    });
  });

  $('btnJson').addEventListener('click', function () {
    var T = totals(), k = state.kp;
    var dp = (k.kpDate || '').split('.');
    var payload = {
      'КЛИЕНТ': k.kpClient || '', 'ИНН': k.kpInn || '',
      'ПРИМЕЧАНИЕ': k.kpNote ? ' — ' + k.kpNote : '',
      'ИСХ_НОМЕР': k.kpNum || '',
      'КОНТАКТ_ИМЯ': k.kpContact || mgr().name,
      'КОНТАКТ_ТЕЛЕФОН': k.kpPhone || mgr().phone,
      'ДД': dp[0] || '',
      'МЕСЯЦА': MONTHS_G[parseInt(dp[1], 10) - 1] || '',
      'ГГГГ': dp[2] || '',
      'менеджер': mgr(),
      'гарантия': APP.guarantee.label,
      'срок_поставки': state.kp.kpTerm === 'stock'
        ? APP.deliveryTerms.stock : APP.deliveryTerms.order,
      'ставка_НДС': T.rate / 10,
      'скидка_по_умолчанию': T.gDisc / 10,
      'позиции': T.lines.map(function (L) {
        return { наименование: L.item.name, тип: TYPES[L.item.type] || '',
          количество: L.item.qty, скидка_процент: L.dsc / 10,
          цена_прайс: L.item.price / 100, цена_со_скидкой: L.unit / 100,
          сумма: L.line / 100 };
      }),
      'итоги': {
        сумма_по_прайсу: T.listSum / 100, ваша_выгода: T.gain / 100,
        итого_без_НДС: T.bez / 100, НДС: T.nds / 100, итого_к_оплате: T.total / 100
      },
      'сумма_прописью': propisyu(T.total),
      'НДС_прописью': propisyu(T.nds),
      'срок_действия_дней': APP.kpValidDays
    };
    var text = JSON.stringify(payload, null, 2);
    var ta = $('jsonOut');
    ta.style.display = ''; ta.value = text; ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('JSON скопирован'); },
        function () { toast('JSON в поле ниже — скопируйте вручную'); });
    } else { toast(ok ? 'JSON скопирован' : 'JSON в поле ниже — скопируйте вручную'); }
  });

  // ------------------------------------------------------------------ подбор: волокно
  var mtMat = fresh('mtMaterial');
  Object.keys(APP.cutLimits).forEach(function (m) { opt(mtMat, m, m); });
  function renderMatch() {
    var out = $('matchOut'); clear(out);
    var m = $('mtMaterial').value;
    var th = parseFloat(String($('mtThick').value).replace(',', '.'));
    if (!(th > 0)) { out.appendChild(el('div', 'note', 'Введите толщину.')); return; }
    var lim = APP.cutLimits[m];
    var needReserve = th / (1 - APP.reservePct / 100);
    var needComfort = th * 2;
    var absMax = lim[lim.length - 1][1];
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'Толщина: <b>' + String(th).replace('.', ',') + ' мм</b> по ' +
      esc(m.toLowerCase())));
    st.appendChild(el('div', '', 'С запасом ' + APP.reservePct + ' % нужен предел не ниже <b>' +
      String(Math.round(needReserve * 10) / 10).replace('.', ',') + ' мм</b>'));
    st.appendChild(el('div', '', 'Комфортный поток — вдвое ниже предела, то есть предел от <b>' +
      String(needComfort).replace('.', ',') + ' мм</b>'));
    out.appendChild(st);

    if (th > absMax) {
      out.appendChild(el('div', 'note stop',
        'Максимум по таблицам режимов для этого материала — ' + absMax + ' мм. Толщина ' +
        String(th).replace('.', ',') + ' мм за пределами линейки: это серия HARD, ' +
        'цен на неё в прайсе нет. К менеджеру.'));
      return;
    }
    function findPower(need) {
      for (var i = 0; i < lim.length; i++) if (lim[i][1] >= need) return lim[i];
      return null;
    }
    var pr = findPower(needReserve), pc = findPower(needComfort), recs = [];
    if (pr) recs.push({ label: 'Минимум с запасом ' + APP.reservePct + ' %', power: pr[0], max: pr[1] });
    if (pc && (!pr || pc[0] !== pr[0])) recs.push({ label: 'Комфортный режим', power: pc[0], max: pc[1] });
    if (!recs.length) {
      out.appendChild(el('div', 'note stop',
        'Под эту толщину с обязательным запасом ' + APP.reservePct +
        ' % в заведённых мощностях решения нет. ' +
        'Это серия HARD — к менеджеру.'));
      return;
    }
    recs.slice(0, 2).forEach(function (r) {
      var cheapest = null;
      APP.fiberS.forEach(function (x) {
        if (x.power === r.power && (!cheapest || x.base < cheapest.base)) cheapest = x;
      });
      var rec = el('div', 'rec');
      rec.innerHTML = '<div class="rec-l">' + esc(r.label) + '</div>' +
        '<div class="rec-t">Серия S, ' + (r.power / 1000) + ' кВт' +
        (r.power === 3000 && th <= APP.fiberAWorkMm
          ? ' — на такой толщине подойдёт и серия A (только 3 кВт, паспорт — до ' +
            APP.fiberAWorkMm + ' мм в режиме 24/7)'
          : '') + '</div>' +
        '<div class="rec-d">Предел по заводским таблицам: ' + r.max + ' мм · газ: ' +
        esc(APP.gasByMaterial[m]) + '</div>' +
        (cheapest ? '<div class="rec-p">Самая доступная сборка этой мощности: S ' +
          cheapest.format + ' ' + cheapest.power + 'W, поле ' +
          APP.fiberFormats[cheapest.format] + ' мм — <b>' +
          fmtRub(toCents(cheapest.base)) + ' ₽</b></div>' : '');
      if (cheapest) {
        var b = el('button', 'btn mini noprint', 'Открыть в конфигураторе');
        b.type = 'button';
        b.style.marginTop = '10px';
        b.addEventListener('click', function () {
          $('cat').value = 'fiber'; switchCat();
          $('fSeries').value = 'S'; fillFiberFormats();
          $('fFormat').value = cheapest.format; fillFiberPowers();
          $('fPower').value = String(cheapest.power);
          $('fTable').value = '0'; $('fRot').value = '';
          renderFiber(); showTab('cfg');
        });
        rec.appendChild(b);
      }
      out.appendChild(rec);
    });
    out.appendChild(el('div', 'note alert',
      'Формат поля подбирается по размеру заготовки, а не по толщине. ' +
      'Толщину без газа и режима клиенту не называть.'));
  }
  ['mtMaterial', 'mtThick'].forEach(function (id) {
    $(id).addEventListener('input', renderMatch);
    $(id).addEventListener('change', renderMatch);
  });

  // ------------------------------------------------------------------ подбор: фрезерный
  // Задачи и формулировки решений берутся из матрицы подбора скилла (APP.matchRules).
  // Здесь — только машинная привязка задачи к серии и формату.
  var MILL_TASKS = [
    { task: 'Маленькая столярка', series: ['0609'], fixed: '0609' },
    { task: 'Пластик, акрил, мягкое дерево', series: ['A1'] },
    { task: 'Мебельный цех, твёрдое дерево', series: ['M1'] },
    { task: 'Крупная 3D-обработка', series: ['M2'] },
    { task: 'Деревообработка с поворотом заготовки', series: ['M1 1325 RD'], fixed: '1325' },
    { task: 'Серийное производство', series: ['M1 1325 S3', 'M1 1325 S4'], fixed: '1325' },
    { task: 'Двери и фасады', series: ['A1', 'M1'], fixed: '1325' },
    { task: 'Фрезеровать металл и алюминий', series: ['M3'] }
  ];
  var ruleByTask = {};
  APP.matchRules.forEach(function (r) { ruleByTask[r.task] = r.answer; });

  var mkT = fresh('mkTask');
  MILL_TASKS.forEach(function (t, i) { opt(mkT, String(i), t.task); });

  function fillMkSize() {
    var t = MILL_TASKS[parseInt($('mkTask').value, 10)];
    var sel = $('mkSize'), prev = sel.value; clear(sel);
    var avail = {};
    APP.milling.forEach(function (r) {
      if (matchesSeries(r.name, t.series)) avail[r.format] = true;
    });
    APP.millingOrder.forEach(function (f) {
      if (avail[f] && (!t.fixed || t.fixed === f)) {
        opt(sel, f, APP.millingFields[f] + ' мм' + (f === '1325' ? ' — дверная заготовка' : ''));
      }
    });
    if (!sel.options.length) opt(sel, '', 'нет подходящих форматов в прайсе');
    if (prev) { for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === prev) sel.value = prev; }
    sel.disabled = !!t.fixed;
    renderMatchMill();
  }
  function matchesSeries(name, list) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.indexOf(' ') >= 0) { if (name.indexOf(s) === 0) return true; }
      else if (new RegExp('(^|\\s)' + s + '(\\s|,|$)').test(name)) return true;
    }
    return false;
  }

  function renderMatchMill() {
    var out = $('matchMillOut'); clear(out);
    var t = MILL_TASKS[parseInt($('mkTask').value, 10)];
    var fmtSel = $('mkSize').value;
    var wantVac = $('mkVac').checked;
    if (!fmtSel) {
      out.appendChild(el('div', 'note stop',
        'Под эту задачу в прайсе нет сборок. К продуктовому отделу.'));
      return;
    }
    var answer = t.answer || ruleByTask[t.task] || '';
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'Задача: <b>' + esc(t.task) + '</b>'));
    if (answer) st.appendChild(el('div', '', 'Правило скилла: <b>' + esc(answer) + '</b>'));
    st.appendChild(el('div', '', 'Поле: <b>' + APP.millingFields[fmtSel] + ' мм</b>' +
      (wantVac ? ' · с вакуумным столом' : '')));
    out.appendChild(st);

    var pool = APP.milling.filter(function (r) {
      return r.format === fmtSel && matchesSeries(r.name, t.series);
    });
    var withVac = pool.filter(function (r) { return r.vac; });
    var noVac = pool.filter(function (r) { return !r.vac; });
    var primary = wantVac ? withVac : noVac;
    if (!primary.length) primary = pool;
    primary = primary.slice().sort(function (a, b) { return a.order - b.order; });

    var picks = [];
    if (primary.length) picks.push({ label: 'Минимальная по цене', r: primary[0] });
    if (primary.length > 1) {
      picks.push({ label: 'Мощнее — если материал твёрдый или съём глубокий',
        r: primary[primary.length - 1] });
    }
    if (wantVac && !withVac.length) {
      out.appendChild(el('div', 'note alert',
        'Вакуумных версий в этом формате и серии в прайсе нет — показаны обычные.'));
    }
    if (!picks.length) {
      out.appendChild(el('div', 'note stop', 'В прайсе нет сборок под это сочетание.'));
      return;
    }

    picks.slice(0, 2).forEach(function (p) {
      var r = p.r;
      var rec = el('div', 'rec');
      rec.innerHTML = '<div class="rec-l">' + esc(p.label) + '</div>' +
        '<div class="rec-t">' + esc(r.name) + '</div>' +
        '<div class="rec-d">Шпиндель ' + r.kw + ' кВт · охлаждение ' + esc(r.cool) +
        ' · стойка ' + esc(r.ctrl) + ' · вакуумный стол: ' + (r.vac ? 'да' : 'нет') +
        ' · поле ' + APP.millingFields[r.format] + ' мм</div>' +
        '<div class="rec-p">Под заказ <b>' + fmtRub(toCents(r.order)) + ' ₽</b>' +
        '<span class="internal"> · из наличия <b>' + fmtRub(toCents(r.stock)) +
        ' ₽</b></span></div>';
      var b = el('button', 'btn mini noprint', 'Открыть в конфигураторе');
      b.type = 'button'; b.style.marginTop = '10px';
      b.addEventListener('click', function () {
        $('cat').value = 'milling'; switchCat();
        $('mFormat').value = r.format; fillMillConfigs();
        $('mConfig').value = r.name; renderMill(); showTab('cfg');
      });
      rec.appendChild(b);
      out.appendChild(rec);
    });

    // предупреждения из матрицы материалов скилла
    var warns = [];
    if (/(^|\s)A1(\s|,)/.test(picks[0].r.name) && /твёрдое дерево|Двери/.test(t.task)) {
      warns.push('A1 по твёрдым породам работает медленно — под дуб, бук и ясень серия M1.');
    }
    if (/металл/i.test(t.task) && !/M3/.test(picks[0].r.name)) {
      warns.push('Металл и толстый алюминий — только M3. У A1 металла нет, у M1 только тонкий лист.');
    }
    if (fmtSel === '1325') {
      warns.push('Поле 1300×2500 мм — это размер дверной заготовки.');
    }
    if (picks[0].r.cool === 'водяное') {
      warns.push('Водяное охлаждение шпинделя требует чиллер. В прайсе три модели S&A, ' +
        'привязки к мощности шпинделя в данных нет — уточнять у сервиса.');
    }
    if (picks.some(function (p) { return p.r.vac; })) {
      warns.push('Вакуумные версии питаются от 380 В, обычные — от 220 В.');
    }
    warns.push('Скоростей подачи и режимов фрезеровки в данных нет — время на изделие ' +
      'приложение не считает и обещать его нельзя.');
    var note = el('div', 'note alert', '<b>Что сказать клиенту и о чём не забыть:</b><ul>' +
      warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>');
    out.appendChild(note);
  }
  $('mkTask').addEventListener('change', fillMkSize);
  ['mkSize', 'mkVac'].forEach(function (id) {
    $(id).addEventListener('change', renderMatchMill);
  });

  function switchMtCat() {
    var c = $('mtCat').value;
    state.mtCat = c;
    $('mtFiber').style.display = c === 'fiber' ? '' : 'none';
    $('mtMill').style.display = c === 'mill' ? '' : 'none';
    save();
  }
  $('mtCat').addEventListener('change', switchMtCat);

  // ------------------------------------------------------------------ готовность цеха
  function renderReady() {
    var kind = $('readyKind').value;
    var list = $('readyList'); clear(list);
    APP.readiness.forEach(function (r, i) {
      var key = kind + '_' + i;
      var row = el('div', 'chk');
      var req = kind === 'a' ? r.a : r.s;
      row.innerHTML = '<input type="checkbox"' + (state.ready[key] ? ' checked' : '') + '>' +
        '<span style="flex:1"><b>' + esc(r.name) + '</b> — ' + esc(req) +
        (r.blocker ? ' <span class="flag-block">блокер</span>' : '') +
        (r.note ? '<br><span class="muted">' + esc(r.note) + '</span>' : '') + '</span>';
      row.querySelector('input').addEventListener('change', function () {
        state.ready[key] = this.checked; save(); summary();
      });
      list.appendChild(row);
    });
    summary();
    function summary() {
      var out = $('readyOut'); clear(out);
      var openBlockers = [], openOther = 0, totalBlockers = 0;
      APP.readiness.forEach(function (r, i) {
        if (r.blocker) totalBlockers++;
        if (!state.ready[kind + '_' + i]) {
          if (r.blocker) openBlockers.push(r.name); else openOther++;
        }
      });
      if (openBlockers.length) {
        out.className = 'check fail';
        out.innerHTML = '<b>КП не выпускать: не закрыто блокеров — ' + openBlockers.length +
          ' из ' + totalBlockers + '.</b><ul>' +
          openBlockers.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') +
          '</ul>Нет ввода 380 В — нет сделки. Проверять до КП, а не на монтаже.';
      } else {
        out.className = 'check good';
        out.innerHTML = '<b>Блокеры закрыты.</b> Осталось непроверенных пунктов: ' + openOther +
          '. Стабилизатор — условие гарантии, без него паспорт запрещает работу.';
      }
    }
  }
  $('readyKind').addEventListener('change', renderReady);

  // ------------------------------------------------- обвязка волокна
  // Компрессор, дымоуловитель и криоцилиндр — позиции из КП поставщиков.
  // Цены с НДС, поэтому идут в смету как обычные опции.
  function fillKit(selId, list, label) {
    var sel = fresh(selId);
    list.forEach(function (x) {
      opt(sel, x.id, x.name + ' — ' + fmtRub(toCents(x.price)) + ' ₽');
    });
    if (state.kit[label] && sel.querySelector('option[value="' + state.kit[label] + '"]')) {
      sel.value = state.kit[label];
    }
    return sel;
  }

  function kitFind(list, id) {
    var found = null;
    list.forEach(function (x) { if (x.id === id) found = x; });
    return found || list[0];
  }

  function renderCompressor() {
    var out = $('compressorOut'); clear(out);
    var c = kitFind(APP.compressors, $('kitCompressor').value);
    var box = el('div', 'calcsteps');
    box.appendChild(el('div', '', 'Давление <b>' + c.bar + ' бар</b> · подача <b>' +
      c.lmin + ' л/мин</b> · двигатель <b>' + String(c.kw).replace('.', ',') +
      ' кВт</b> · ресивер <b>' + c.tank + ' л</b>'));
    // краткая памятка по подбору идёт сразу за строкой давления: именно здесь
    // менеджер решает, годится модель под задачу или нет
    APP.compressorAdvice.forEach(function (a) {
      box.appendChild(el('div', '', '<b>' + esc(a[0]) + ':</b> ' + esc(a[1])));
    });
    box.appendChild(el('div', '', 'Шум ' + esc(c.noise) + ' · осушитель: ' +
      esc(c.dryer)));
    box.appendChild(el('div', '', 'Гарантия ' + esc(c.warranty) + ' · срок: ' +
      esc(c.lead) + (c.size ? ' · габариты ' + esc(c.size) : '') +
      (c.mass ? ' · масса ' + c.mass + ' кг' : '')));
    out.appendChild(box);
    if (c.kp_valid) {
      out.appendChild(el('div', 'note alert', 'КП от ' + esc(c.kp_date) + ': ' +
        esc(c.kp_valid) + '.'));
    }
    // сколько такой компрессор закрывает по расходу воздуха на 6 кВт.
    // Границы берём из таблицы расхода, а не из текста: правка данных должна
    // доходить до экрана сама.
    var perMin = c.lmin / 1000;
    var need = APP.airDemand;          // {min, max, maxLabel} в м³/мин
    var reserve = Math.round(need.max * 1.25 * 100) / 100;
    var line = 'Подача ' + String(Math.round(perMin * 100) / 100).replace('.', ',') +
      ' м³/мин. По таблице 6 кВт резка воздухом требует от ' +
      String(need.min).replace('.', ',') + ' м³/мин (1 мм) до ' +
      String(need.max).replace('.', ',') + ' м³/мин (' + esc(need.maxLabel) + ').';
    if (perMin < need.max) {
      line += ' Верх таблицы эта модель не закрывает: для ' +
        String(need.max).replace('.', ',') + ' м³/мин с запасом нужно около ' +
        String(reserve).replace('.', ',') + ' м³/мин, а такого компрессора ' +
        'в заведённых КП нет — считайте по реальному режиму заказчика.';
    }
    out.appendChild(el('div', 'note', line));
    if (c.tank < APP.minTankL) {
      out.appendChild(el('div', 'note alert', 'Ресивер ' + c.tank + ' л — меньше ' +
        APP.minTankL + ' л, которые требует справочник готовности цеха. ' +
        'Уточняйте у сервиса, годится ли модель под конкретный станок.'));
    }
    // общее примечание по компрессорам показываем здесь же, один раз
    out.appendChild(el('div', 'note', esc(APP.compressorNote)));
  }

  function renderExtraction() {
    var out = $('extractionOut'); clear(out);
    var e = kitFind(APP.extraction, $('kitExtraction').value);
    var box = el('div', 'calcsteps');
    box.appendChild(el('div', '', 'Производительность <b>' + e.flow +
      ' м³/ч</b> · разрежение <b>' + esc(e.vacuum) + '</b> · мощность <b>' +
      String(e.kw).replace('.', ',') + ' кВт</b> · патрубок ' + esc(e.port)));
    box.appendChild(el('div', '', esc(e.filter)));
    box.appendChild(el('div', '', 'Габариты ' + esc(e.size) + ' · масса ' + e.mass + ' кг'));
    if (e.terms) box.appendChild(el('div', '', esc(e.terms)));
    box.appendChild(el('div', 'internal', 'Источник цены: ' + esc(e.src)));
    out.appendChild(box);
    if (e.kp_valid) {
      out.appendChild(el('div', 'note alert', 'КП от ' + esc(e.kp_date) + ': ' +
        esc(e.kp_valid) + '.'));
    }
  }

  function renderCryo() {
    var out = $('cryoOut'); clear(out);
    var c = kitFind(APP.cryo, $('kitCryo').value);
    var box = el('div', 'calcsteps');
    box.appendChild(el('div', '', 'Производительность <b>' +
      String(c.flow).replace('.', ',') + ' нм³/ч</b> · объём ' + c.volume + ' л' +
      (c.lead ? ' · ' + esc(c.lead) : '')));
    box.appendChild(el('div', 'internal', 'Источник цены: ' + esc(c.src)));
    out.appendChild(box);
    // сравнение с баллонами: объём одного баллона берём из данных, а не из текста
    var perCyl = APP.cylinderM3;
    var cyls = Math.round(c.flow / perCyl * 10) / 10;
    out.appendChild(el('div', 'note',
      'Один баллон 40 л даёт ' + String(perCyl).replace('.', ',') + ' м³ газа, ' +
      'значит на максимальном расходе этот криоцилиндр заменяет около ' +
      String(cyls).replace('.', ',') + ' ' + plural(cyls, ['баллона', 'баллонов']) +
      ' в час непрерывной резки.'));
  }

  fillKit('kitCompressor', APP.compressors, 'compressor');
  fillKit('kitExtraction', APP.extraction, 'extraction');
  fillKit('kitCryo', APP.cryo, 'cryo');

  $('kitCompressor').addEventListener('change', function () {
    state.kit.compressor = this.value; save(); renderCompressor();
  });
  $('kitExtraction').addEventListener('change', function () {
    state.kit.extraction = this.value; save(); renderExtraction();
  });
  $('kitCryo').addEventListener('change', function () {
    state.kit.cryo = this.value; save(); renderCryo();
  });
  $('compressorAdd').addEventListener('click', function () {
    var c = kitFind(APP.compressors, $('kitCompressor').value);
    addItem(c.name, c.price, 1, 'opt');
  });
  $('extractionAdd').addEventListener('click', function () {
    var e = kitFind(APP.extraction, $('kitExtraction').value);
    addItem(e.name, e.price, 1, 'opt');
  });
  $('cryoAdd').addEventListener('click', function () {
    var c = kitFind(APP.cryo, $('kitCryo').value);
    addItem(c.name, c.price, 1, 'opt');
  });


  // ---- стабилизатор: подбор по требованию карты готовности цеха ----
  // Требование зависит от конфигурации: с труборезом планка выше, поэтому
  // минимум берём из справочника, а не из текста.
  function stabNeedWatt() {
    var rot = $('fRot').value;
    var need = 0;
    (APP.readiness || []).forEach(function (r) {
      if (r.name !== 'Стабилизатор') return;
      var src = rot ? r.s : r.a;                     // r.s — линейка с труборезом
      var m = String(src).replace(/[^0-9]/g, '');
      if (m) need = parseInt(m, 10);
    });
    return need;
  }

  function fillStab() {
    var sel = fresh('kitStab');
    var all = $('stabAll').checked;
    APP.stabilizers.forEach(function (s) {
      if (!all && s.for !== 'fiber') return;
      opt(sel, s.id, s.name + ' — ' + s.power + ' — ' + fmtRub(toCents(s.price)) + ' ₽');
    });
    if (state.kit.stab && sel.querySelector('option[value="' + state.kit.stab + '"]')) {
      sel.value = state.kit.stab;
    }
    renderStab();
  }

  function renderStab() {
    var out = $('stabOut'); clear(out);
    var s = kitFind(APP.stabilizers, $('kitStab').value);
    var need = stabNeedWatt();
    var box = el('div', 'calcsteps');
    box.appendChild(el('div', '', 'Мощность <b>' + esc(s.power) + '</b> · питание ' +
      esc(s.phase) + ' · назначение: ' +
      (s.for === 'fiber' ? 'металлорез' : 'сварочный аппарат')));
    box.appendChild(el('div', '', 'Цена: <b>' + fmtRub(toCents(s.price)) + ' ₽</b>'));
    if (need) {
      box.appendChild(el('div', '', 'Требование карты готовности под эту конфигурацию: ' +
        '<b>от ' + fmtRub(toCents(need)).replace(',00', '') + ' Вт</b>' +
        ($('fRot').value ? ' (в станке есть труборез)' : '')));
    }
    out.appendChild(box);
    if (need && s.watt < need) {
      out.appendChild(el('div', 'note stop', 'Не проходит по мощности: у модели ' +
        esc(s.power) + ', а нужно от ' + fmtRub(toCents(need)).replace(',00', '') +
        ' Вт. Работа без подходящего стабилизатора снимает гарантию.'));
    } else if (need) {
      out.appendChild(el('div', 'note', 'По мощности проходит. Ресанта — ' +
        'электромеханика попроще и дешевле, Штиль дороже при той же мощности: ' +
        'сравнивайте не только цену, но и класс.'));
    }
    // Ресанта маркируется в ВА, Штиль в кВт — честно предупреждаем
    if (/Ресанта/.test(s.name)) {
      out.appendChild(el('div', 'note internal',
        'У Ресанты в названии полная мощность в ВА. Сколько это ватт, зависит ' +
        'от коэффициента мощности — в данных его нет, поэтому сравнение с ' +
        'требованием в ваттах приблизительное.'));
    }
  }

  fillStab();
  $('stabAll').addEventListener('change', fillStab);
  $('kitStab').addEventListener('change', function () {
    state.kit.stab = this.value; save(); renderStab();
  });
  $('fRot').addEventListener('change', renderStab);
  $('stabAdd').addEventListener('click', function () {
    var s = kitFind(APP.stabilizers, $('kitStab').value);
    addItem(s.name, s.price, 1, 'opt');
  });

  // ------------------------------------------------------------------ газ
  var gNz = fresh('gNozzle');
  APP.gas.forEach(function (g, i) { opt(gNz, String(i), 'Сопло ' + g.nozzle); });
  $('gNozzle').value = String(state.gas.nozzle || '0');
  $('gGas').value = state.gas.gas || 'n2';
  $('gHours').value = state.gas.hours || '80';
  if (state.gas.price) $('gPrice').value = state.gas.price;

  function renderGas() {
    var out = $('gasOut'); clear(out);
    var g = APP.gas[parseInt($('gNozzle').value, 10)];
    var kind = $('gGas').value;
    var hours = parseFloat($('gHours').value) || 0;
    var price = $('gPrice').value === '' ? null : parseFloat($('gPrice').value);
    state.gas = { nozzle: $('gNozzle').value, gas: kind, hours: $('gHours').value,
      price: $('gPrice').value };
    save();
    var flow = kind === 'o2' ? g.o2 : g.n2;
    var bal = kind === 'o2' ? g.o2b : g.n2b;
    var lo = Math.round(bal[0] * hours * 10) / 10, hi = Math.round(bal[1] * hours * 10) / 10;
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'Поток: <b>' + esc(flow) + ' л/мин</b>'));
    st.appendChild(el('div', '', 'Баллонов в час: <b>' + String(bal[0]).replace('.', ',') +
      '–' + String(bal[1]).replace('.', ',') + '</b>'));
    st.appendChild(el('div', '', 'За ' + hours + ' ч: <b>' + String(lo).replace('.', ',') +
      '–' + String(hi).replace('.', ',') + ' баллонов</b>'));
    if (price !== null && price > 0) {
      st.appendChild(el('div', '', 'При цене ' + fmtRub(toCents(price)) +
        ' ₽ за баллон: <b>' + fmtRub(toCents(lo * price)) + '–' +
        fmtRub(toCents(hi * price)) + ' ₽ в месяц</b>'));
    } else {
      st.appendChild(el('div', '', 'Цена баллона не введена — стоимость не считается. ' +
        'В источнике этой цены нет.'));
    }
    out.appendChild(st);
    if (kind === 'n2' && bal[1] >= 10) {
      out.appendChild(el('div', 'note alert', 'Это ' + String(bal[0]).replace('.', ',') +
        '–' + String(bal[1]).replace('.', ',') + ' баллонов в час. Нужен криоцилиндр ' +
        'или газогенератор — иначе логистика баллонов съест экономику.'));
    }
    if (kind === 'o2') {
      out.appendChild(el('div', 'note',
        'Кислород для углеродистой стали, чистота 99,99 %, давление 0,5–1 бар. ' +
        'Если материал допускает воздух — компрессор подбирается по потоку азота, ' +
        'ресивер не меньше 500 л.'));
    }
  }
  ['gNozzle', 'gGas', 'gHours', 'gPrice'].forEach(function (id) {
    $(id).addEventListener('input', renderGas);
    $(id).addEventListener('change', renderGas);
  });

  // ------------------------------------------------------------------ старт
  fillFiberFormats();
  fillMillConfigs();
  // Режим цены ставим ДО renderMill: он читает селектор и переписывает state.mode,
  // поэтому при обратном порядке выбор «из наличия» не восстанавливался.
  $('priceMode').value = state.mode || 'order';
  $('cat').value = state.cat || 'fiber';
  switchCat();
  renderPnr();
  applySupplier();
  sortItems();
  renderSmeta();
  renderMatch();
  $('mtCat').value = state.mtCat || 'fiber';
  switchMtCat();
  fillMkSize();
  renderReady();
  renderGas();
  renderServo();
  renderCompressor();
  renderExtraction();
  renderCryo();
  $('specGo').addEventListener('click', function () { showTab('smeta'); });
  $('specCopy').addEventListener('click', function () {
    var ta = $('specOut');
    if (!ta.value) { toast('Спецификация пуста'); return; }
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () {
        toast('Спецификация скопирована');
      }, function () { toast('Скопируйте текст вручную — поле уже выделено'); });
      return;
    }
    toast(ok ? 'Спецификация скопирована'
      : 'Скопируйте текст вручную — поле уже выделено');
  });
  $('specClear').addEventListener('click', function () {
    if (!state.items.length) return;
    var n = state.items.length;
    state.items = [];
    save(); renderSmeta();
    toast('Убрано из сметы: ' + cnt(n, ['позиция', 'позиции']));
  });

  renderStab();
  renderMgr();
  fillStabFull();
  fillAsp();
  fillCo2();
  fillMarkers();
  renderChiller();
  renderStabOpt('cStab', 'cStabOut');
  renderStabOpt('kStab', 'kStabOut');
  renderRot();
  switchCat();
  renderAllMatches();
  thinkify();
  $('sumBarGo').addEventListener('click', function () { showTab('smeta'); });
  var hash = (location.hash || '').replace('#', '');
  var valid = SECTIONS.map(function (s) { return s.id; });
  showTab(valid.indexOf(hash) >= 0 ? hash : 'cfg');
  fixNavOffset();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}());
