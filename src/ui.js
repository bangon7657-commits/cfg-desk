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
  // Три формы: 1 позиция · 2 позиции · 5 позиций. Если передали две формы,
  // вторая работает и как «мало», и как «много» — прежнее поведение.
  function plural(n, forms) {
    var few = forms.length > 2 ? forms[1] : forms[0];
    var many = forms.length > 2 ? forms[2] : forms[1];
    var whole = Math.floor(n);
    if (n !== whole) return few;               // дробное — «2,5 баллона»
    var m = whole % 100;
    if (m >= 11 && m <= 19) return many;
    m = whole % 10;
    if (m === 1) return forms[0];
    return (m >= 2 && m <= 4) ? few : many;
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
    // какая часть справочника открыта: подбор по задаче, техника или газ
    guidePart: 'match',
    // калькуляторы: какая часть открыта и что введено в поля
    calcPart: 'nds',
    calc: { nds: {}, lease: {}, cost: {}, roi: {} },
    // приводы серии S и выбранная обвязка волокна
    servo: '', kit: { compressor: '', extraction: '', cryo: '', stab: '' },
    // имя и контакты менеджера сделки: пустые поля = менеджер из данных
    mgr: {},
    // сборка комплекта по слотам: тип, содержимое слотов, сохранённые сборки
    build: { kind: 'fiber', slots: {}, saved: [], reqOnly: false },
    // письма: шаблон, наше юрлицо, правки текста. Данные клиента тут не лежат.
    ltr: { tpl: '', sup: '', ceo: '', head: '', vals: {}, bodies: {} },
    // расчёт зарплаты
    zp: null,
    // закреплённые вкладки в строке навигации (до четырёх)
    pins: ['home', 'build', 'smeta', 'letters']
  };
  // Значения по умолчанию для зарплаты вынесены в функцию: их же берёт «Сбросить»
  function zpDefaults() {
    var now = new Date();
    var m = now.getMonth(), y = now.getFullYear();
    var wd = 0, dd = new Date(y, m, 1);
    while (dd.getMonth() === m) {
      var w = dd.getDay();
      if (w > 0 && w < 6) wd++;
      dd.setDate(dd.getDate() + 1);
    }
    return { month: m, year: y, mode: 'gross', salary: APP.zp.salary,
      normDays: wd, normHours: wd * 8, worked: wd, bonus: 0, penalty: 0, duty: 0,
      ot15: 0, ot20: 0, holH: 0, holOver: false, vacDays: 0, vacDaily: 0,
      vacEarn: '', sickDays: 0, sickDaily: 0, sickEarn: '', sickYears: 8,
      halfDays: '', advManual: '', ndfl: APP.zp.ndflRate,
      internal: APP.zp.internalRate };
  }
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
      // черновики до версии 17 не знали про письма и зарплату
      if (!state.ltr || typeof state.ltr !== 'object') {
        state.ltr = { tpl: '', sup: '', ceo: '', head: '', vals: {}, bodies: {} };
      }
      if (!state.ltr.vals || typeof state.ltr.vals !== 'object') state.ltr.vals = {};
      if (!state.ltr.bodies || typeof state.ltr.bodies !== 'object') state.ltr.bodies = {};
      // В версии 27 письмо о возврате переписано: ссылка на договор РКО и
      // требование вернуть банковские комиссии были юридически неверны.
      // Черновики с этими оборотами сбрасываем — иначе печатается старый текст.
      var STALE = /расчётно-кассовое обслуживание|удержанные комиссии банка/;
      for (var bk in state.ltr.bodies) {
        if (state.ltr.bodies.hasOwnProperty(bk) &&
            STALE.test(String(state.ltr.bodies[bk] || ''))) {
          delete state.ltr.bodies[bk];
        }
      }
      // черновики до версии 16 не знали про сборку по слотам
      if (!state.build || typeof state.build !== 'object') {
        state.build = { kind: 'fiber', slots: {}, saved: [], reqOnly: false };
      }
      if (!state.build.slots || typeof state.build.slots !== 'object') state.build.slots = {};
      if (!Array.isArray(state.build.saved)) state.build.saved = [];
      // черновики до версии 19 не знали про настраиваемые вкладки
      if (!Array.isArray(state.pins)) state.pins = ['home', 'build', 'smeta', 'letters'];
      // в версии 28 три раздела сведены в «Справочник»: закреплённые вкладки
      // со старыми именами переводим на него, повтор убираем
      var MERGED = ['match', 'tech', 'gas', 'shop', 'data', 'quiz'];
      state.pins = state.pins.map(function (id) {
        return MERGED.indexOf(id) >= 0 ? 'guide' : id;
      }).filter(function (id, i, all) { return all.indexOf(id) === i; });
      if (MERGED.indexOf(state.guidePart) < 0) state.guidePart = 'match';
    }
  } catch (e) { /* приватный режим — работаем без сохранения */ }
  if (!state.calc || typeof state.calc !== 'object') {
    state.calc = { nds: {}, lease: {}, cost: {}, roi: {} };
  }
  ['nds', 'lease', 'cost', 'roi'].forEach(function (k) {
    if (!state.calc[k] || typeof state.calc[k] !== 'object') state.calc[k] = {};
  });
  if (!state.zp || typeof state.zp !== 'object') state.zp = zpDefaults();
  // до версии 26 в зарплате было удержание «прочие», теперь вместо него
  // доплата «дежурство» — знак другой, поэтому сумму не переносим
  if (state.zp.duty === undefined) state.zp.duty = 0;
  if (state.zp.other !== undefined) delete state.zp.other;
  if (!state.ltr || typeof state.ltr !== 'object') {
    state.ltr = { tpl: '', sup: '', ceo: '', head: '', vals: {}, bodies: {} };
  }

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
    { id: 'home', title: 'Главная', hint: 'три инструмента менеджера' },
    { id: 'build', title: 'Конфигуратор', hint: 'слоты комплекта и проверка' },
    { id: 'letters', title: 'Письма', hint: 'возврат, платежи, официальные' },
    { id: 'zp', title: 'Зарплата', hint: 'оклад, переработки, налоги' },
    { id: 'cfg', title: 'Подбор и цены', hint: 'станок, обвязка, техничка' },
    { id: 'smeta', title: 'Смета и ТКП', hint: 'позиции, скидки, файл' },
    { id: 'calc', title: 'Калькуляторы',
      hint: 'НДС, лизинг, час работы станка, окупаемость' },
    { id: 'guide', title: 'Справочник',
      hint: 'подбор, техника, газ, готовность цеха, данные' }
  ];
  // Справочник собран из трёх бывших разделов. Их прежние имена остались
  // адресами частей: ссылка #tech по-прежнему открывает нужную часть.
  var GUIDE_PARTS = [
    { id: 'match', title: 'Подбор по задаче' },
    { id: 'tech', title: 'Техника' },
    { id: 'gas', title: 'Газ и владение' },
    { id: 'shop', title: 'Готовность цеха' },
    { id: 'data', title: 'Данные' },
    { id: 'quiz', title: 'Тренажёр' }
  ];
  function guidePartIds() {
    return GUIDE_PARTS.map(function (g) { return g.id; });
  }
  var PINS_MAX = 4;
  var PINS_DEF = ['home', 'build', 'smeta', 'letters'];
  var curTab = 'cfg';
  function secTitle(id) {
    var t = id;
    SECTIONS.forEach(function (s) { if (s.id === id) t = s.title; });
    return t;
  }
  // Закреплённые вкладки: только существующие разделы, без повторов, до четырёх
  function pins() {
    var out = [], ids = SECTIONS.map(function (s) { return s.id; });
    (Array.isArray(state.pins) ? state.pins : PINS_DEF).forEach(function (id) {
      if (ids.indexOf(id) >= 0 && out.indexOf(id) < 0 && out.length < PINS_MAX) out.push(id);
    });
    return out;
  }
  function tabBtns() { return $('tabs').querySelectorAll('button[data-t]'); }
  // Строка вкладок собирается из закреплённых разделов. Значок сметы живёт
  // внутри своей вкладки, поэтому код сметы проверяет его наличие.
  function renderTabs() {
    var box = fresh('tabs'), cur = curTab;
    pins().forEach(function (id) {
      var b = d.createElement('button');
      b.type = 'button';
      b.setAttribute('data-t', id);
      b.setAttribute('aria-selected', id === cur ? 'true' : 'false');
      var nm = d.createElement('span');
      nm.textContent = secTitle(id);
      b.appendChild(nm);
      if (id === 'smeta') {
        var bd = d.createElement('span');
        bd.className = 'badge'; bd.id = 'smetaBadge';
        bd.textContent = state.items.length ? String(state.items.length) : '';
        b.appendChild(bd);
      }
      var x = d.createElement('span');
      x.className = 'tabx';
      x.setAttribute('data-x', id);
      x.title = 'Убрать вкладку «' + secTitle(id) + '»';
      x.textContent = '×';
      b.appendChild(x);
      b.addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute('data-x')) { unpin(id); return; }
        showTab(id);
      });
      box.appendChild(b);
    });
    if (!pins().length) {
      var hint = d.createElement('span');
      hint.className = 'muted';
      hint.style.fontSize = '12px';
      hint.textContent = 'Вкладок нет — закрепите разделы в меню';
      box.appendChild(hint);
    }
  }
  function setPins(list) {
    state.pins = list.slice(0, PINS_MAX);
    save();
    renderTabs();
    renderMenuPins();
    markTab(curTab);
  }
  function unpin(id) {
    setPins(pins().filter(function (p) { return p !== id; }));
    toast('Вкладка «' + secTitle(id) + '» убрана');
  }
  function pinToggle(id) {
    var p = pins();
    if (p.indexOf(id) >= 0) { unpin(id); return; }
    if (p.length >= PINS_MAX) {
      toast('Уже ' + PINS_MAX + ' вкладки — сначала уберите лишнюю');
      return;
    }
    setPins(p.concat([id]));
    toast('Вкладка «' + secTitle(id) + '» закреплена');
  }
  function renderMenuPins() {
    var p = pins();
    var bs = $('menuList').querySelectorAll('button[data-pin]');
    for (var i = 0; i < bs.length; i++) {
      var on = p.indexOf(bs[i].getAttribute('data-pin')) >= 0;
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      bs[i].textContent = on ? '★' : '☆';
      bs[i].title = on ? 'Убрать из строки вкладок' : 'Закрепить вкладкой';
    }
    var f = $('pinsInfo');
    if (f) f.textContent = 'Закреплено ' + p.length + ' из ' + PINS_MAX;
  }

  var menuList = fresh('menuList');
  SECTIONS.forEach(function (s) {
    var row = d.createElement('div');
    row.className = 'mrow';
    var b = d.createElement('button');
    b.type = 'button';
    b.setAttribute('data-t', s.id);
    b.setAttribute('role', 'menuitem');
    b.innerHTML = '<span>' + esc(s.title) + '</span><small>' + esc(s.hint) + '</small>';
    b.addEventListener('click', function () {
      showTab(s.id);
      closeMenu();
    });
    var pb = d.createElement('button');
    pb.type = 'button';
    pb.className = 'pinbtn';
    pb.setAttribute('data-pin', s.id);
    pb.setAttribute('aria-pressed', 'false');
    pb.textContent = '☆';
    pb.addEventListener('click', function (e) {
      e.stopPropagation();
      pinToggle(s.id);
    });
    row.appendChild(b);
    row.appendChild(pb);
    menuList.appendChild(row);
  });
  var mfoot = d.createElement('div');
  mfoot.className = 'mfoot';
  mfoot.innerHTML = '<span id="pinsInfo"></span>';
  var reset = d.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Вернуть по умолчанию';
  reset.addEventListener('click', function (e) {
    e.stopPropagation();
    setPins(PINS_DEF.slice());
    toast('Вкладки: ' + PINS_DEF.map(secTitle).join(', '));
  });
  mfoot.appendChild(reset);
  menuList.appendChild(mfoot);

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    var ok = guidePartIds().indexOf(h) >= 0;
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

  // Подсветка активного раздела вынесена отдельно: её же зовёт перерисовка
  // строки вкладок после закрепления или снятия
  function markTab(name) {
    var tb = tabBtns();
    for (var i = 0; i < tb.length; i++) {
      tb[i].setAttribute('aria-selected',
        tb[i].getAttribute('data-t') === name ? 'true' : 'false');
    }
    var mi = $('menuList').querySelectorAll('button[data-t]');
    for (var k = 0; k < mi.length; k++) {
      mi[k].setAttribute('aria-selected',
        mi[k].getAttribute('data-t') === name ? 'true' : 'false');
    }
    // Кнопка показывает, где мы находимся, если раздела нет в строке вкладок
    var inTabs = pins().indexOf(name) >= 0;
    $('menuBtn').textContent = inTabs ? 'Разделы' : secTitle(name);
  }
  // Часть справочника: рисуем переключатель и показываем нужный блок
  function showGuidePart(part) {
    if (guidePartIds().indexOf(part) < 0) part = 'match';
    state.guidePart = part;
    save();
    var box = d.getElementById('guideTabs');
    if (!box) return;
    var bs = box.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-sub') === part;
      bs[i].className = on ? 'pill on' : 'pill';
      bs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    GUIDE_PARTS.forEach(function (g) {
      var n = d.getElementById('g-' + g.id);
      if (n) n.classList.toggle('active', g.id === part);
    });
  }
  (function () {
    if (!d.getElementById('guideTabs')) return;
    var box = fresh('guideTabs');   // очищаем: пререндер запускает файл дважды
    GUIDE_PARTS.forEach(function (g) {
      var b = el('button', 'pill', g.title);
      b.type = 'button';
      b.setAttribute('data-sub', g.id);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () {
        showGuidePart(g.id);
        try {
          if (location.hash !== '#' + g.id) history.replaceState(null, '', '#' + g.id);
        } catch (e) { /* file:// — адрес не трогаем */ }
      });
      box.appendChild(b);
    });
  }());
  function showTab(name) {
    // прежние адреса частей справочника ведут в справочник, на нужную часть
    var part = '';
    if (guidePartIds().indexOf(name) >= 0) { part = name; name = 'guide'; }
    curTab = name;
    markTab(name);
    if (name === 'guide') showGuidePart(part || state.guidePart || 'match');
    var panels = d.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('active', panels[j].id === 'p-' + name);
    }
    // При открытии файла с диска (file://) браузер запрещает replaceState и
    // бросает SecurityError. Раньше это валило остаток инициализации.
    var hashName = (name === 'guide') ? (state.guidePart || 'match') : name;
    try {
      if (location.hash !== '#' + hashName) {
        history.replaceState(null, '', '#' + hashName);
      }
    } catch (e) { location.hash = hashName; }
    // не window.scrollTo — в jsdom он не реализован и валит проверку сборки
    d.documentElement.scrollTop = 0;
    d.body.scrollTop = 0;
  }
  renderTabs();
  renderMenuPins();

  /* Высота шапки зависит от переносов текста, поэтому прибиваем вкладки
     не к жёстким 63px из CSS, а к фактической высоте шапки. */
  function fixNavOffset() {
    var h = d.querySelector('header'), n = d.querySelector('nav');
    if (h && n && h.offsetHeight) n.style.top = h.offsetHeight + 'px';
  }
  window.addEventListener('resize', fixNavOffset);

  // ------------------------------------------------------------- плашка-клятва
  // Рисунок подставляется маской: бумаги в файле нет, цвет чернил даёт CSS.
  (function () {
    var box = $('oath');
    if (!box) return;
    $('oathScan').style.setProperty('--oath-img',
      'url("data:image/webp;base64,' + APP.oathScan + '")');
  }());

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
        cnt(rows.length, ['строка', 'строки', 'строк'])));
    }
  }

  // ------------------------------------------------------ боковые «мысли»
  // Пояснения, предупреждения и техданные уезжают в правую колонку шага:
  // слева остаётся то, что нужно нажать, справа — то, что нужно знать.
  // Функция идемпотентна, её можно звать после любой перерисовки.
  var THINK_SEL = '.note, .calcsteps, .muted, .advice, .miss';
  function thinkify() {
    // В смете и ТКП боковая колонка мешает читать таблицу — там пояснения
    // остаются в потоке под шагом.
    var bodies = d.querySelectorAll('.panel:not(#p-smeta) .step-b');
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
        var qty = el('select');
        qty.style.width = '84px'; qty.style.padding = '6px 8px';
        if (/Виброопор/i.test(c)) {
          // опоры продаются комплектом под станок: 4/6/8/10 шт
          APP.vibroQtyChoices.forEach(function (n4) {
            opt(qty, String(n4), n4 + ' шт');
          });
          var f = $('mFormat').value;
          qty.value = String(APP.vibroQty[f] || 4);
        } else {
          for (var qi = 1; qi <= 20; qi++) opt(qty, String(qi), String(qi));
          qty.value = '1';
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
    $('sumBarTx').textContent = cnt(n, ['позиция', 'позиции', 'позиций']) +
      ' на ' + fmtRub(T.total) + ' ₽' +
      (zero ? ' · ' + cnt(zero, ['строка', 'строки', 'строк']) + ' без цены' : '');
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
      ? cnt(state.items.length, ['позиция', 'позиции', 'позиций']) : '';
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
    // значок живёт во вкладке «Смета и ТКП», а её могли снять из строки
    var sBadge = $('smetaBadge');
    if (sBadge) sBadge.textContent = has ? String(state.items.length) : '';

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
    // разделы собираются по станку из сметы: фрезер, CO₂, маркиратор, волокно
    var mach = machineInSmeta();

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Что закрывает эта конфигурация'));
    var rows = kindConfigRows(mach);
    if (rows.length) {
      box.appendChild(kpPairTable(rows));
    } else {
      box.appendChild(el('p', 'kp-propis', 'В смете нет станка — раздел ' +
        'заполняется по выбранной конфигурации.'));
    }

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Комплектация' +
      (mach ? ' — ' + esc(mach.title) : '')));
    var incl = kindIncluded(mach), inc = el('ul', 'kp-list');
    incl.list.forEach(function (x) { inc.appendChild(el('li', '', esc(x))); });
    box.appendChild(inc);
    box.appendChild(el('p', 'kp-propis', esc(incl.note)));

    box.appendChild(el('div', 'kp-sec', (n++) + '.&nbsp; Технические характеристики'));
    box.appendChild(kpPairTable(kindTechRows(mach)));
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
    box.appendChild(kpPairTable(kindAdvantages(mach)));

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

  // Станок из сметы для полного ТКП. Раньше разделы всегда собирались по
  // волокну, и в КП на фрезер уезжала чужая комплектация с преимуществами
  // про волоконный источник. Теперь тип определяется по наименованию.
  function machineInSmeta() {
    var fib = fiberInSmeta();
    if (fib) return { kind: 'fiber', title: 'волоконный станок по металлу', cfg: fib };
    var found = null;
    state.items.forEach(function (it) {
      if (found || it.type !== 'eq') return;
      if (/Фрезерный станок/i.test(it.name)) {
        found = { kind: 'milling', title: 'фрезерный станок с ЧПУ', name: it.name };
      } else if (/Лазерный станок CO₂/i.test(it.name)) {
        found = { kind: 'co2', title: 'лазерный CO₂-станок', name: it.name };
      } else if (/маркиратор/i.test(it.name)) {
        found = { kind: 'marker', title: 'лазерный маркиратор', name: it.name };
      }
    });
    return found;
  }
  // Строка таблицы характеристик фрезера: ищем модель в TECH_MILL по
  // совпадению «серия + формат», иначе — по формату
  function millTechRow(name) {
    var s = String(name || ''), hit = null;
    APP.techMill.forEach(function (r) {
      if (hit) return;
      var key = String(r[0]);
      if (new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s*\/\s*/g, '|') + '\\b', 'i').test(s)) hit = r;
    });
    if (!hit) {
      APP.techMill.forEach(function (r) {
        if (hit) return;
        var f = (/(\d{4})/.exec(String(r[0])) || [])[1];
        if (f && new RegExp('\\b' + f + '\\b').test(s)) hit = r;
      });
    }
    return hit;
  }
  // Охлаждение шпинделя надёжнее читать из шифра модели (2.2wc / 6.0ac),
  // чем из таблицы: там у части строк стоит «—»
  function millCooling(name) {
    var s2 = String(name || '');
    if (/\d\s*wc/i.test(s2)) return 'водяное';
    if (/\d\s*ac/i.test(s2)) return 'воздушное';
    return '';
  }
  // Пустые и неподтверждённые значения в КП клиенту не показываем
  function firmRows(rows) {
    return rows.filter(function (r) {
      var v = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
      return v && v !== '—' && !/^уточнить$/i.test(v) && !/^—/.test(v);
    });
  }
  function millFormat(name) {
    var f = (/\b(0404|0609|6090|1313|1325|1616|1625|1630|2030|2040|2060)\b/
      .exec(String(name || '')) || [])[1] || '';
    return f;
  }
  // «Что закрывает эта конфигурация» по типу станка
  function kindConfigRows(m) {
    if (!m) return [];
    if (m.kind === 'fiber') return configRows(m.cfg);
    var rows = [];
    if (m.kind === 'milling') {
      var f = millFormat(m.name), tr2 = millTechRow(m.name);
      if (APP.millFields[f]) rows.push(['Рабочее поле', APP.millFields[f] + ' мм']);
      if (tr2) {
        rows.push(['Шпиндель', tr2[1]]);
        rows.push(['Охлаждение шпинделя', millCooling(m.name) || tr2[3]]);
        rows.push(['Ход по Z', tr2[4]]);
      }
      if (/VAC/i.test(m.name)) rows.push(['Стол', 'вакуумный (VAC), питание 380 В']);
      else rows.push(['Стол', 'профильный (Т-паз), питание 220 В']);
      rows = firmRows(rows);
      APP.millMaterials.forEach(function (r) {
        // столбцы таблицы: A1 · M1 · M3 — берём тот, что соответствует серии
        var col = /M3/i.test(m.name) ? 3 : (/M1|M2/i.test(m.name) ? 2 : 1);
        rows.push([r[0], r[col]]);
      });
      return rows;
    }
    if (m.kind === 'co2') {
      rows.push(['Материалы', 'фанера, МДФ, дерево, акрил, кожа, ткань, картон, ' +
        'резина, пластик']);
      rows.push(['Чего не берёт', 'металл (кроме NC-C — до 1,5 мм) и ПВХ-плёнку']);
      rows.push(['Охлаждение', 'водяное, чиллер S&A по мощности трубки']);
      return rows;
    }
    rows.push(['Назначение', 'маркировка и гравировка по металлу и части пластиков']);
    rows.push(['Обвязка', 'поворотное устройство и вытяжка — отдельными позициями']);
    return rows;
  }
  // Комплектация по типу станка
  function kindIncluded(m) {
    if (!m) return { list: [], note: APP.kpIncludedNote };
    if (m.kind === 'fiber') {
      var list = APP.kpIncluded.slice();
      var c = m.cfg;
      if (c) {
        list.push('Контроллер ' + c.ctrl + ', голова ' + c.head + ', чиллер ' + c.chiller);
      }
      return { list: list, note: APP.kpIncludedNote };
    }
    return { list: (APP.kpIncludedByKind[m.kind] || []).slice(),
      note: APP.kpIncludedKindNote[m.kind] || APP.kpIncludedNote };
  }
  // Технические характеристики по типу станка
  function kindTechRows(m) {
    if (!m) return techRows(null);
    if (m.kind === 'fiber') return techRows(m.cfg);
    var rows = [['Модель', m.name]];
    if (m.kind === 'milling') {
      var tr3 = millTechRow(m.name);
      if (tr3) {
        rows.push(['Шпиндель', tr3[1]]);
        rows.push(['Цанга', tr3[2]]);
        rows.push(['Охлаждение', millCooling(m.name) || tr3[3]]);
        rows.push(['Ход по Z', tr3[4]]);
        rows.push(['Стойка ЧПУ', tr3[5]]);
        rows.push(['Масса', tr3[6]]);
      }
      rows.push(['Механика', 'привод X и Y — кривозубая рейка, Z — ШВП, ' +
        'направляющие Hiwin 20, смазка ручная']);
    }
    rows.push(['Соответствие', 'ТР ТС 004/2011, 010/2011, 020/2011']);
    return firmRows(rows);
  }
  // Преимущества: две строки говорят про волоконный источник — в ТКП на
  // фрезер, CO₂ или маркиратор они не идут
  function kindAdvantages(m) {
    var kind = m ? m.kind : 'fiber';
    return APP.kpAdvantages.filter(function (r) {
      return kind === 'fiber' || APP.kpAdvFiberOnly.indexOf(r[0]) < 0;
    });
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
      var mach = machineInSmeta();
      out += dSection(secNo++, 'Что закрывает эта конфигурация');
      var cRows = kindConfigRows(mach);
      if (cRows.length) {
        out += pairTableRows(cRows);
      } else {
        out += DOCX.p(DOCX.run('В смете нет станка — раздел заполняется ' +
          'по выбранной конфигурации.', { sz: 17, color: GREY }), { space: { after: 80 } });
      }
      out += dGap();

      out += dSection(secNo++, 'Комплектация' + (mach ? ' — ' + mach.title : ''));
      var incl = kindIncluded(mach);
      incl.list.forEach(function (x) {
        out += DOCX.p(DOCX.run('•  ' + x, { sz: 17 }), { space: { after: 20 } });
      });
      out += DOCX.p(DOCX.run(incl.note, { sz: 15, color: GREY }),
        { space: { after: 80 } });
      out += dGap();

      out += dSection(secNo++, 'Технические характеристики');
      out += pairTableRows(kindTechRows(mach));
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
      out += pairTableRows(kindAdvantages(mach));
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
      String(cyls).replace('.', ',') + ' ' + plural(cyls, ['баллон', 'баллона', 'баллонов']) +
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
  // Пояснения и техничка в «Подборе и цены» по умолчанию скрыты: экран должен
  // быть рабочим, а не читательским. Тумблер запоминается в черновике.
  function applyHints(on) {
    $('p-cfg').classList.toggle('hints', !!on);
  }
  $('cfgHints').checked = !!state.cfgHints;
  applyHints(state.cfgHints);
  $('cfgHints').addEventListener('change', function () {
    state.cfgHints = this.checked; save(); applyHints(this.checked);
  });

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
    toast('Убрано из сметы: ' + cnt(n, ['позиция', 'позиции', 'позиций']));
  });

  // =====================================================================
  //                    ГЛАВНАЯ: три плитки-инструмента
  // =====================================================================
  (function () {
    var tiles = $('p-home').querySelectorAll('.tile');
    for (var i = 0; i < tiles.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { showTab(b.getAttribute('data-go')); });
      }(tiles[i]));
    }
    var map = fresh('homeMap');
    SECTIONS.forEach(function (sec) {
      if (sec.id === 'home') return;
      var row = el('div', 'maprow');
      row.innerHTML = '<b>' + esc(sec.title) + '</b><span class="muted">' +
        esc(sec.hint) + '</span>';
      var b = el('button', 'btn mini sec', 'Открыть');
      b.type = 'button';
      b.addEventListener('click', function () { showTab(sec.id); });
      row.appendChild(b);
      map.appendChild(row);
    });
  }());

  // =====================================================================
  //                       ПИСЬМА И УВЕДОМЛЕНИЯ
  // Бланк на фирменной шапке: шапка адресата и отправителя, заголовок,
  // свободно правимый текст, подпись. Данные клиента не сохраняются.
  // =====================================================================
  var ltrClient = {};                     // живёт только до перезагрузки
  function ltrTpl() {
    var id = state.ltr.tpl || APP.letterTemplates[0].id, found = null;
    APP.letterTemplates.forEach(function (t) { if (t.id === id) found = t; });
    return found || APP.letterTemplates[0];
  }
  function ltrFieldDef(id) {
    var found = null;
    APP.letterFields.forEach(function (f) { if (f.id === id) found = f; });
    return found;
  }
  function ltrVal(id) {
    var def = ltrFieldDef(id);
    if (def && def.client) return ltrClient[id] || '';
    return (state.ltr.vals && state.ltr.vals[id]) || '';
  }
  function ltrSetVal(id, v) {
    var def = ltrFieldDef(id);
    if (def && def.client) { ltrClient[id] = v; renderLtr(); return; }
    if (!state.ltr.vals) state.ltr.vals = {};
    state.ltr.vals[id] = v;
    save(); renderLtr();
  }
  function ltrSup() {
    var id = state.ltr.sup || APP.supplierDefault, found = null;
    APP.suppliers.forEach(function (s) { if (s.id === id) found = s; });
    return found || APP.suppliers[0];
  }
  function ltrCeoName() {
    return (state.ltr.ceo || '').trim() || ltrSup().ceo_full ||
      'руководителю (ФИО уточнить)';
  }
  // Дата по-русски: 09.10.2025 → «09 октября 2025 г.»
  var MONTHS_G2 = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function ruDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    if (!m) return String(v || '').trim() || '—';
    return m[3] + ' ' + (MONTHS_G2[parseInt(m[2], 10) - 1] || '') + ' ' + m[1] + ' г.';
  }
  // Дата в кадровом виде: «21» мая 2026 г. — так оформлены присланные бланки
  function ruDateQ(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    // пустую дату не рисуем подчёркиваниями: в готовом файле это выглядит
    // как незаполненный шаблон, а место под дату и так видно
    if (!m) return String(v || '').trim() || '«     »                     20      г.';
    return '«' + m[3] + '» ' + (MONTHS_G2[parseInt(m[2], 10) - 1] || '') +
      ' ' + m[1] + ' г.';
  }
  // «Генеральному директору» — должность в дательном падеже и без названия
  // компании: название идёт следующей строкой, как в присланных бланках
  function staffAddressee(sup) {
    var t = String(sup.ceo_title || 'Директор').replace(/\s*ООО.*$/i, '').trim();
    return t.replace(/^Генеральный директор$/i, 'Генеральному директору')
      .replace(/^Директор$/i, 'Директору')
      .replace(/^Исполнительный директор$/i, 'Исполнительному директору');
  }
  // «Е.В. Греков» — инициалы перед фамилией, как в шапке служебных записок
  function ltrCeoShort(sup) {
    var full = String(ltrCeoName() || sup.ceo_full || sup.ceo_short || '').trim();
    var p = full.split(/\s+/);
    if (p.length >= 3) return p[1].charAt(0) + '.' + p[2].charAt(0) + '. ' + p[0];
    return full || '—';
  }
  var DAYS_WORDS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть',
    'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать',
    'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать',
    'восемнадцать', 'девятнадцать', 'двадцать'];
  function daysWords(v) {
    var n = parseInt(String(v || '').replace(/\D/g, ''), 10);
    return (n >= 0 && n < DAYS_WORDS.length) ? DAYS_WORDS[n] : String(v || '');
  }
  function ltrSubst(text) {
    var sup = ltrSup();
    var sumCents = toCents(parseFloat(String(ltrVal('sum') || '0')
      .replace(/\s| /g, '').replace(',', '.')) || 0);
    var map = {
      company: sup.name, ceo_name: ltrCeoName(), ceo_title: sup.ceo_title,
      sum_rub: fmt(sumCents) + ' ₽', sum_words: propisyu(sumCents),
      docDate: ruDate(ltrVal('docDate')), payDate: ruDate(ltrVal('payDate')),
      basisDate: ruDate(ltrVal('basisDate')), basisDate2: ruDate(ltrVal('basisDate2')),
      // кадровые: даты в кавычках и число дней словами
      eventDate: ruDateQ(ltrVal('eventDate')), startDate: ruDateQ(ltrVal('startDate')),
      days_words: daysWords(ltrVal('daysCnt'))
    };
    APP.letterFields.forEach(function (f) {
      if (map[f.id] === undefined) map[f.id] = ltrVal(f.id) || '—';
    });
    return String(text).replace(/\{([a-zA-Z_]+)\}/g, function (all, key) {
      return map[key] !== undefined ? map[key] : all;
    });
  }
  function ltrHeadText() {
    return (state.ltr.head !== undefined && state.ltr.head !== null &&
      state.ltr.head !== '') ? state.ltr.head : ltrTpl().heading;
  }
  function ltrBodyText() {
    var b = state.ltr.bodies && state.ltr.bodies[ltrTpl().id];
    return (b === undefined || b === null || b === '') ? ltrTpl().body : b;
  }
  function ltrGroupOf(t) { return t.kind === 'staff' ? 'staff' : 'client'; }
  function ltrGrp() {
    var g = state.ltr.grp;
    return (g === 'staff' || g === 'client') ? g : ltrGroupOf(ltrTpl());
  }
  function ltrTplsOfGroup(gid) {
    return APP.letterTemplates.filter(function (t) { return ltrGroupOf(t) === gid; });
  }
  // После выбора группы над каждой плиткой шаблона на пару секунд всплывает
  // стрелка — видно, что выбирать дальше. Стрелки появляются по очереди.
  var ltrPointTimer = null;
  function pointToTpls() {
    var bs = $('ltrPills').querySelectorAll('button');
    if (!bs.length) return;
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.add('point');
      bs[i].style.setProperty('--point-delay', (i * 0.12).toFixed(2) + 's');
    }
    if (ltrPointTimer) clearTimeout(ltrPointTimer);
    ltrPointTimer = setTimeout(function () {
      var ps = $('ltrPills').querySelectorAll('button.point');
      for (var j = 0; j < ps.length; j++) {
        ps[j].classList.remove('point');
        ps[j].style.removeProperty('--point-delay');
      }
    }, 3200);
  }
  function renderLtrPills() {
    var pl = fresh('ltrPills'), gid = ltrGrp();
    ltrTplsOfGroup(gid).forEach(function (t) {
      var b = el('button', 'pill', esc(t.title));
      b.type = 'button';
      b.setAttribute('data-tpl', t.id);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () {
        state.ltr.tpl = t.id;
        state.ltr.head = '';
        save(); renderLtrFields(); renderLtr();
      });
      pl.appendChild(b);
    });
    var gb = $('ltrGroups').querySelectorAll('button');
    for (var i = 0; i < gb.length; i++) {
      var on = gb[i].getAttribute('data-grp') === gid;
      gb[i].className = on ? 'pill on' : 'pill';
      gb[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }
  function renderLtrFields() {
    var box = fresh('ltrFields'), tpl = ltrTpl();
    var row = null, n = 0;
    tpl.use.forEach(function (fid) {
      var def = ltrFieldDef(fid);
      if (!def) return;
      if (n % 3 === 0) { row = el('div', 'row'); box.appendChild(row); }
      n++;
      var staff = tpl.kind === 'staff';
      var cell = el('div', (def.client && !staff) ? 'clientfield' : '');
      var lab = el('label', 'f', esc(def.label) +
        ((def.client && !staff) ? ' <span class="cf">клиент</span>' : ''));
      cell.appendChild(lab);
      var inp = el(def.kind === 'area' ? 'textarea' : 'input');
      if (def.kind !== 'area') inp.type = def.kind === 'date' ? 'date' : 'text';
      if (def.kind === 'money') inp.setAttribute('inputmode', 'decimal');
      inp.id = 'lf_' + fid;
      if (def.ph) inp.placeholder = def.ph;
      inp.value = ltrVal(fid);
      inp.addEventListener('input', function () { ltrSetVal(fid, this.value); });
      cell.appendChild(inp);
      row.appendChild(cell);
    });
  }
  function renderLtrPage() {
    var page = fresh('ltrPage'), tpl = ltrTpl(), sup = ltrSup();
    // У служебных записок и заявлений фирменной шапки нет: это внутренний
    // документ, сверху сразу адресат.
    if (tpl.kind === 'staff') { renderStaffPage(page, tpl, sup); return; }
    var head = el('div', 'lp-head');
    head.innerHTML = '<img src="data:image/png;base64,' + APP.logoWide +
      '" alt="LASERCUT" class="lp-logo">' +
      '<div class="lp-co"><b>' + esc(sup.name) + '</b>' +
      legalLines(sup).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
      '</div>';
    page.appendChild(head);

    var addr = el('div', 'lp-addr');
    if (tpl.kind === 'staff') {
      // Кадровый документ: шапка «Генеральному директору … от <должность> <ФИО>»
      addr.className = 'lp-addr staff';
      addr.innerHTML = '<div class="lp-to"><b>' + esc(sup.ceo_title) + '</b><br>' +
        esc(sup.name) + '<br>' + esc(ltrCeoShort(sup)) + '</div>' +
        '<div class="lp-from">от ' + esc(ltrVal('staffPost') || '—') +
        '<span class="lp-hint">должность</span>' +
        esc(ltrVal('staffFio') || '—') +
        '<span class="lp-hint">ФИО полностью</span></div>';
    } else if (tpl.fromOur) {
      addr.innerHTML = '<div class="lp-to">' + esc(ltrVal('fromName') || 'Адресат') +
        '</div>';
    } else {
      addr.innerHTML = '<div class="lp-to"><b>' + esc(sup.ceo_title) + '</b><br>' +
        esc(ltrCeoName()) + '<br><span class="muted">ИНН ' + esc(sup.inn || '—') +
        (sup.kpp ? ' / КПП ' + esc(sup.kpp) : '') + '</span></div>' +
        '<div class="lp-from"><b>От:</b> ' + esc(ltrVal('fromName') || '—') +
        (ltrVal('fromInn') ? '<br>ИНН ' + esc(ltrVal('fromInn')) : '') +
        (ltrVal('fromAddr') ? '<br>' + esc(ltrVal('fromAddr')) : '') +
        (ltrVal('fromPhone') ? '<br>тел. ' + esc(ltrVal('fromPhone')) : '') + '</div>';
    }
    page.appendChild(addr);

    page.appendChild(el('h2', 'lp-h', esc(ltrSubst(ltrHeadText()))));
    if (tpl.id === 'official' && ltrVal('subject')) {
      page.appendChild(el('div', 'lp-sub', esc(ltrVal('subject'))));
    }
    var body = el('div', 'lp-body');
    ltrSubst(ltrBodyText()).split(/\n{1,}/).forEach(function (par) {
      if (par.trim()) body.appendChild(el('p', '', esc(par.trim())));
    });
    page.appendChild(body);

    var sign = el('div', 'lp-sign' + (tpl.kind === 'staff' ? ' staff' : ''));
    if (tpl.kind === 'staff') {
      sign.innerHTML = '<span>' + esc(ruDateQ(ltrVal('docDate'))) + '</span>' +
        '<span class="lp-line"><span class="lp-blank">\u00a0</span>' +
        '<span class="lp-hint">подпись</span></span>' +
        '<span class="lp-line">' + esc(ltrVal('fromSign') || '') +
        '<span class="lp-hint">расшифровка</span></span>';
    } else {
      sign.innerHTML = '<span>' + esc(ruDate(ltrVal('docDate'))) + '</span>' +
        '<span class="lp-line">' + esc(ltrVal('fromSign') || '') +
        ' <span class="lp-blank">\u00a0</span></span>';
    }
    page.appendChild(sign);
  }
  function renderStaffPage(page, tpl, sup) {
    var addr = el('div', 'lp-addr staff');
    addr.innerHTML = '<div class="lp-to"><b>' + esc(staffAddressee(sup)) + '</b><br>' +
      esc(sup.name) + '<br>' + esc(ltrCeoShort(sup)) + '</div>' +
      '<div class="lp-from">от ' + esc(ltrVal('staffPost') || '—') +
      '<span class="lp-hint">должность</span>' +
      esc(ltrVal('staffFio') || '—') +
      '<span class="lp-hint">ФИО полностью</span></div>';
    page.appendChild(addr);
    page.appendChild(el('h2', 'lp-h', esc(ltrSubst(ltrHeadText()))));
    var body = el('div', 'lp-body');
    ltrSubst(ltrBodyText()).split(/\n{1,}/).forEach(function (par) {
      if (par.trim()) body.appendChild(el('p', '', esc(par.trim())));
    });
    page.appendChild(body);
    var sign = el('div', 'lp-sign staff');
    sign.innerHTML = '<span>' + esc(ruDateQ(ltrVal('docDate'))) + '</span>' +
      '<span class="lp-line"><span class="lp-blank">\u00a0</span>' +
      '<span class="lp-hint">подпись</span></span>' +
      '<span class="lp-line">' + esc(ltrVal('fromSign') || '\u00a0') +
      '<span class="lp-hint">расшифровка</span></span>';
    page.appendChild(sign);
  }
  function ltrPlainText() {
    var tpl = ltrTpl(), sup = ltrSup(), out = [];
    if (tpl.kind === 'staff') {
      out.push(staffAddressee(sup));
      out.push(sup.name);
      out.push(ltrCeoShort(sup));
      out.push('от ' + (ltrVal('staffPost') || '—'));
      out.push(ltrVal('staffFio') || '—');
      out.push('');
      out.push(ltrSubst(ltrHeadText()));
      out.push('');
      out.push(ltrSubst(ltrBodyText()));
      out.push('');
      out.push(ruDateQ(ltrVal('docDate')) + '        (подпись)        ' +
        (ltrVal('fromSign') || ''));
      return out.join('\n');
    }
    if (!tpl.fromOur) {
      out.push(sup.ceo_title);
      out.push(ltrCeoName());
      out.push('ИНН ' + (sup.inn || '—') + (sup.kpp ? ' / КПП ' + sup.kpp : ''));
      out.push('');
      out.push('От: ' + (ltrVal('fromName') || '—'));
      if (ltrVal('fromInn')) out.push('ИНН ' + ltrVal('fromInn'));
      if (ltrVal('fromAddr')) out.push(ltrVal('fromAddr'));
      if (ltrVal('fromPhone')) out.push('тел. ' + ltrVal('fromPhone'));
    } else {
      out.push(sup.name);
      out.push('Кому: ' + (ltrVal('fromName') || '—'));
    }
    out.push('');
    out.push(ltrSubst(ltrHeadText()));
    out.push('');
    out.push(ltrSubst(ltrBodyText()));
    out.push('');
    out.push(ruDate(ltrVal('docDate')) + '   ' + (ltrVal('fromSign') || '') +
      '  (подпись)');
    return out.join('\n');
  }
  // Живая миниатюра бланка в правой колонке: копия готового листа, сжатая по
  // ширине колонки. Клик — прокрутка к полноразмерному листу ниже.
  function renderLtrMini() {
    var box = $('ltrMini'), inner = $('ltrMiniIn'), page = $('ltrPage');
    if (!box || !inner || !page) return;
    inner.innerHTML = '<div class="ltrpage">' + page.innerHTML + '</div>';
    var w = box.clientWidth || 360;
    var k = Math.max(0.35, Math.min(1, w / 794));
    inner.style.transform = 'scale(' + k.toFixed(3) + ')';
    var cnt2 = $('ltrPageCnt');
    if (cnt2) cnt2.textContent = 'масштаб ' + Math.round(k * 100) + ' %';
  }
  function ltrMiniGo() {
    var page = $('ltrPage');
    if (!page) return;
    try { page.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch (e) { d.documentElement.scrollTop = page.offsetTop; }
  }
  function renderLtr() {
    var tpl = ltrTpl();
    $('ltrTitle').textContent = tpl.title;
    $('ltrHint').textContent = tpl.hint;
    // подсказка о приватности меняется по типу документа
    var pv = $('ltrPrivacy');
    if (pv) pv.textContent = tpl.kind === 'staff' ? APP.letterStaffNote : APP.letterPrivacy;
    var bs = $('ltrPills').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-tpl') === tpl.id;
      var pt = bs[i].classList.contains('point') ? ' point' : '';
      bs[i].className = (on ? 'pill on' : 'pill') + pt;
      bs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if ($('ltrHead').value !== ltrHeadText()) $('ltrHead').value = ltrHeadText();
    if ($('ltrBody').value !== ltrBodyText()) $('ltrBody').value = ltrBodyText();
    renderLtrPage();
    renderLtrMini();
    thinkify();
  }
  (function () {
    // Две группы: письма по оплатам и кадровые документы. Плитки шаблонов
    // показываются только для выбранной группы — иначе их одиннадцать в ряд.
    var gr = fresh('ltrGroups');
    APP.letterGroups.forEach(function (g) {
      var gb = el('button', 'pill', esc(g.title));
      gb.type = 'button';
      gb.setAttribute('data-grp', g.id);
      gb.setAttribute('role', 'tab');
      gb.addEventListener('click', function () {
        state.ltr.grp = g.id;
        // при смене группы берём первый шаблон из неё
        var first = ltrTplsOfGroup(g.id)[0];
        if (first) { state.ltr.tpl = first.id; state.ltr.head = ''; }
        save(); renderLtrPills(); renderLtrFields(); renderLtr();
        pointToTpls();
      });
      gr.appendChild(gb);
    });
    renderLtrPills();
    var sel = fresh('ltrSupplier');
    APP.suppliers.forEach(function (s) { opt(sel, s.id, s.name); });
    sel.value = state.ltr.sup || APP.supplierDefault;
    var ho = fresh('ltrHowto');
    APP.letterHowto.forEach(function (t) { ho.appendChild(el('li', '', esc(t))); });
  }());
  $('ltrSupplier').addEventListener('change', function () {
    state.ltr.sup = this.value;
    state.ltr.ceo = '';
    $('ltrCeo').value = '';
    save(); renderLtr();
  });
  $('ltrCeo').addEventListener('input', function () {
    state.ltr.ceo = this.value; save(); renderLtr();
  });
  $('ltrHead').addEventListener('input', function () {
    state.ltr.head = this.value; save(); renderLtrPage();
  });
  $('ltrBody').addEventListener('input', function () {
    if (!state.ltr.bodies) state.ltr.bodies = {};
    state.ltr.bodies[ltrTpl().id] = this.value;
    save(); renderLtrPage();
  });
  $('ltrReset').addEventListener('click', function () {
    if (state.ltr.bodies) delete state.ltr.bodies[ltrTpl().id];
    state.ltr.head = '';
    save(); renderLtr();
    toast('Текст письма вернулся к шаблону');
  });
  $('ltrPrint').addEventListener('click', function () {
    var p = $('p-letters');
    p.classList.add('printme');
    try { window.print(); } finally {
      setTimeout(function () { p.classList.remove('printme'); }, 300);
    }
  });
  $('ltrCopy').addEventListener('click', function () {
    var txt = ltrPlainText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () {
        toast('Письмо скопировано');
      }, function () { toast('Скопировать не удалось — выделите текст на листе'); });
      return;
    }
    toast('Буфер обмена недоступен — выделите текст на листе');
  });
  $('ltrDocx').addEventListener('click', function () {
    try {
      var sup = ltrSup(), tpl = ltrTpl(), body = '';
      var NAVY2 = '1F3864', INK2 = '222222', GREY2 = '777777';
      var imgs = [];
      if (tpl.kind === 'staff') {
        // Кадровый документ: без фирменной шапки — шапка адресата справа
        body += DOCX.p(DOCX.run(staffAddressee(sup), { b: true, sz: 19 }),
          { align: 'right', space: { after: 20 } });
        body += DOCX.p(DOCX.run(sup.name, { sz: 19 }),
          { align: 'right', space: { after: 20 } });
        body += DOCX.p(DOCX.run(ltrCeoShort(sup), { sz: 19 }),
          { align: 'right', space: { after: 140 } });
        body += DOCX.p(DOCX.run('от ' + (ltrVal('staffPost') || '—'), { sz: 19 }),
          { align: 'right', space: { after: 10 } });
        body += DOCX.p(DOCX.run('должность', { sz: 13, color: GREY2 }),
          { align: 'right', space: { after: 40 } });
        body += DOCX.p(DOCX.run(ltrVal('staffFio') || '—', { sz: 19 }),
          { align: 'right', space: { after: 10 } });
        body += DOCX.p(DOCX.run('ФИО полностью', { sz: 13, color: GREY2 }),
          { align: 'right', space: { after: 260 } });
        body += DOCX.p(DOCX.run(ltrSubst(ltrHeadText()), { b: true, sz: 24 }),
          { align: 'center', space: { after: 200 } });
        ltrSubst(ltrBodyText()).split(/\n{1,}/).forEach(function (par) {
          if (!par.trim()) return;
          body += DOCX.p(DOCX.run(par.trim(), { sz: 19, color: INK2 }),
            { align: 'both', space: { after: 140 } });
        });
        body += DOCX.p('', { space: { after: 520 } });
        body += DOCX.p(DOCX.run(ruDateQ(ltrVal('docDate')), { sz: 19 }) +
          DOCX.run('                    ', { sz: 19 }) +
          DOCX.run('                        ', { sz: 19, u: true }) +
          DOCX.run('                    ', { sz: 19 }) +
          DOCX.run(ltrVal('fromSign') || '                        ',
            { sz: 19, u: !ltrVal('fromSign') }),
          { space: { after: 10 } });
        body += DOCX.p(DOCX.run('                                              ' +
          'подпись                                    расшифровка',
          { sz: 13, color: GREY2 }), { space: { after: 0 } });
        var bytesS = DOCX.build({ body: body, images: [] });
        var nameS = (tpl.docType || 'Документ') + ' — ' + tpl.title + '.docx';
        downloadBlob(new Blob([bytesS], { type: DOCX_MIME }), nameS);
        toast('Файл готов: ' + nameS);
        return;
      }
      if (APP.logoWide) {
        imgs.push({ name: 'logo.png', b64: APP.logoWide });
        body += DOCX.p(DOCX.image(1, 6.4, 1.49, 'LASERCUT'), { space: { after: 120 } });
      }
      body += DOCX.p(DOCX.run(sup.name, { b: true, color: NAVY2, sz: 22 }),
        { space: { after: 40 } });
      legalLines(sup).forEach(function (t) {
        body += DOCX.p(DOCX.run(t, { sz: 15, color: GREY2 }), { space: { after: 0 } });
      });
      body += DOCX.p('', { space: { after: 160 } });
      if (!tpl.fromOur) {
        body += DOCX.p(DOCX.run(sup.ceo_title, { b: true, sz: 19 }),
          { space: { after: 20 }, align: 'right' });
        body += DOCX.p(DOCX.run(ltrCeoName(), { sz: 19 }),
          { space: { after: 20 }, align: 'right' });
        body += DOCX.p(DOCX.run('ИНН ' + (sup.inn || '—') +
          (sup.kpp ? ' / КПП ' + sup.kpp : ''), { sz: 17, color: GREY2 }),
          { space: { after: 140 }, align: 'right' });
        body += DOCX.p(DOCX.run('От: ' + (ltrVal('fromName') || '—'), { sz: 19 }),
          { space: { after: 20 } });
        ['fromInn', 'fromAddr', 'fromPhone'].forEach(function (k) {
          if (ltrVal(k)) {
            body += DOCX.p(DOCX.run(ltrVal(k), { sz: 17, color: INK2 }),
              { space: { after: 0 } });
          }
        });
      } else {
        body += DOCX.p(DOCX.run('Кому: ' + (ltrVal('fromName') || '—'), { sz: 19 }),
          { space: { after: 40 } });
      }
      body += DOCX.p('', { space: { after: 160 } });
      body += DOCX.p(DOCX.run(ltrSubst(ltrHeadText()), { b: true, sz: 22, color: NAVY2 }),
        { space: { after: 160 }, align: 'center' });
      ltrSubst(ltrBodyText()).split(/\n{1,}/).forEach(function (par) {
        if (!par.trim()) return;
        body += DOCX.p(DOCX.run(par.trim(), { sz: 19, color: INK2 }),
          { space: { after: 120 } });
      });
      body += DOCX.p('', { space: { after: 240 } });
      body += DOCX.p(DOCX.run(ruDate(ltrVal('docDate')), { sz: 19 }) +
        DOCX.run('                                        ', { sz: 19 }) +
        DOCX.run((ltrVal('fromSign') || '') + ' ', { sz: 19 }) +
        DOCX.run('                        ', { sz: 19, u: true }),
        { space: { after: 0 } });
      // DOCX.build отдаёт байты, а не Blob: без обёртки createObjectURL падал
      var bytes = DOCX.build({ body: body, images: imgs });
      var name = 'Письмо — ' + tpl.title + '.docx';
      downloadBlob(new Blob([bytes], { type: DOCX_MIME }), name);
      toast('Файл готов: ' + name);
    } catch (e) {
      toast('Не удалось собрать файл: ' + (e && e.message ? e.message : 'ошибка'));
    }
  });
  // Должность, ФИО и подпись сотрудника подставляются из карточки менеджера,
  // если менеджер их там заполнил и в письмах поля ещё пустые
  (function () {
    var m = mgr();                       // имя и должность менеджера сделки
    var full = String(m.name || '').trim();
    if (full && !ltrVal('staffFioNom')) ltrSetVal('staffFioNom', full);
    if (full && !ltrVal('staffFio')) ltrSetVal('staffFio', full);
    if (full && !ltrVal('fromSign')) {
      var p = full.split(/\s+/);
      ltrSetVal('fromSign', p.length >= 3
        ? p[0] + ' ' + p[1].charAt(0) + '.' + p[2].charAt(0) + '.' : full);
    }
    if (m.role && !ltrVal('staffPost')) ltrSetVal('staffPost', m.role);
  }());
  if (state.ltr.ceo) $('ltrCeo').value = state.ltr.ceo;
  $('ltrMini').addEventListener('click', ltrMiniGo);
  $('ltrMiniGo').addEventListener('click', ltrMiniGo);
  window.addEventListener('resize', renderLtrMini);
  renderLtrFields();
  renderLtr();

  // =====================================================================
  //                          РАСЧЁТ ЗАРПЛАТЫ
  // Перенос калькулятора: оклад по дням, переработки, выходные, отпуск,
  // больничный, аванс. НДФЛ и внутренний налог — от начисленной суммы.
  // Считаем в копейках, как и всё остальное в приложении.
  // =====================================================================
  var ZP_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
    'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var ZP_FIELDS = {
    zpSalary: 'salary', zpNormDays: 'normDays', zpNormHours: 'normHours',
    zpWorked: 'worked', zpBonus: 'bonus', zpPenalty: 'penalty', zpDuty: 'duty',
    zpOt15: 'ot15', zpOt20: 'ot20', zpHolH: 'holH', zpVacDays: 'vacDays',
    zpVacDaily: 'vacDaily', zpVacEarn: 'vacEarn', zpSickDays: 'sickDays',
    zpSickDaily: 'sickDaily', zpSickEarn: 'sickEarn', zpSickYears: 'sickYears',
    zpHalfDays: 'halfDays', zpAdvManual: 'advManual', zpNdfl: 'ndfl',
    zpInternal: 'internal'
  };
  function num(v) {
    var x = parseFloat(String(v === undefined || v === null ? '' : v)
      .replace(/\s| /g, '').replace(',', '.'));
    return isFinite(x) ? x : 0;
  }
  function zpWeekdays(y, m) {
    var c = 0, dd = new Date(y, m, 1);
    while (dd.getMonth() === m) {
      var w = dd.getDay();
      if (w > 0 && w < 6) c++;
      dd.setDate(dd.getDate() + 1);
    }
    return c;
  }
  function zpWeekdaysHalf(y, m) {
    var c = 0;
    for (var i = 1; i <= 15; i++) {
      var w = new Date(y, m, i).getDay();
      if (w > 0 && w < 6) c++;
    }
    return c;
  }
  function sickPct(years) {
    var y = num(years), out = 60;
    (APP.zp.sickPct || []).forEach(function (r) { if (y >= r[0] && r[1] > out) out = r[1]; });
    return out;
  }
  // Расчёт целиком в копейках: доли процентов делим через divHalfUp
  function zpCalc() {
    var z = state.zp;
    var nRate = Math.round(num(z.ndfl) * 10);          // 13 % → 130 (десятые)
    var iRate = Math.round(num(z.internal) * 10);
    var kPct = 1000 - nRate - iRate;                   // доля «на руки», ‰
    var salaryIn = toCents(num(z.salary));
    var salaryFull = z.mode === 'net'
      ? (kPct > 0 ? divHalfUp(salaryIn * 1000, kPct) : 0)
      : salaryIn;
    var normDays = Math.max(num(z.normDays), 1);
    var normHours = Math.max(num(z.normHours), 1);
    var dayRate = divHalfUp(salaryFull, normDays);
    var hourRate = divHalfUp(salaryFull, normHours);
    var lines = [];
    function add(label, formula, cents) {
      if (cents) lines.push({ label: label, formula: formula, cents: cents });
    }
    var worked = num(z.worked);
    var salaryPart = divHalfUp(salaryFull * Math.round(worked * 100), normDays * 100);
    lines.push({ label: 'Оклад за ' + worked + ' из ' + normDays + ' раб. дн.',
      formula: fmtRub(salaryFull) + ' ÷ ' + normDays + ' × ' + worked,
      cents: salaryPart });
    var ot15 = num(z.ot15), ot20 = num(z.ot20);
    add('Сверхурочные: ' + ot15 + ' ч ×1,5 + ' + ot20 + ' ч ×2',
      fmt(hourRate) + ' × (1,5×' + ot15 + ' + 2×' + ot20 + ')',
      divHalfUp(hourRate * Math.round(ot15 * 150) + hourRate * Math.round(ot20 * 200), 100));
    var holH = num(z.holH), holMult = z.holOver ? 2 : 1;
    add('Выходные и праздники: ' + holH + ' ч, доплата ×' + holMult,
      fmt(hourRate) + ' × ' + holMult + ' × ' + holH,
      divHalfUp(hourRate * holMult * Math.round(holH * 100), 100));
    add('Отпускные, ' + num(z.vacDays) + ' кал. дн.',
      fmt(toCents(num(z.vacDaily))) + ' × ' + num(z.vacDays),
      toCents(num(z.vacDaily)) * num(z.vacDays));
    var sickDays = num(z.sickDays), sDaily = toCents(num(z.sickDaily));
    var pct = sickPct(z.sickYears);
    var sickEmpDays = Math.min(sickDays, 3), sickSfrDays = Math.max(sickDays - 3, 0);
    var sickEmployer = divHalfUp(sDaily * pct * sickEmpDays, 100);
    var sickSfr = divHalfUp(sDaily * pct * sickSfrDays, 100);
    add('Больничный, ' + sickEmpDays + ' дн. от работодателя (' + pct + ' % по стажу)',
      fmt(sDaily) + ' × ' + pct + ' % × ' + sickEmpDays, sickEmployer);
    add('Бонус', 'введён вручную', toCents(num(z.bonus)));
    add('Дежурство', 'введено вручную', toCents(num(z.duty)));
    var accrued = 0;
    lines.forEach(function (l) { accrued += l.cents; });
    var ndfl = divHalfUp(accrued * nRate, 1000);
    var internal = divHalfUp(accrued * iRate, 1000);
    var penalty = toCents(num(z.penalty));
    var deductions = ndfl + internal + penalty;
    var net = accrued - deductions;
    var advGross, advNdfl, advInternal, advNet;
    if (String(z.advManual || '').trim() !== '') {
      advNet = toCents(num(z.advManual));
      advGross = kPct > 0 ? divHalfUp(advNet * 1000, kPct) : 0;
      advNdfl = divHalfUp(advGross * nRate, 1000);
      advInternal = divHalfUp(advGross * iRate, 1000);
    } else {
      advGross = divHalfUp(salaryFull * Math.round(num(z.halfDays) * 100), normDays * 100);
      advNdfl = divHalfUp(advGross * nRate, 1000);
      advInternal = divHalfUp(advGross * iRate, 1000);
      advNet = advGross - advNdfl - advInternal;
    }
    return { salaryFull: salaryFull, dayRate: dayRate, hourRate: hourRate,
      lines: lines, accrued: accrued, ndfl: ndfl, internal: internal,
      penalty: penalty, deductions: deductions, net: net,
      sickSfr: sickSfr, sickSfrDays: sickSfrDays, advNet: advNet,
      rest: net - advNet, nRate: nRate, iRate: iRate,
      effective: accrued ? divHalfUp(deductions * 1000, accrued) : 0 };
  }
  function zpText(T) {
    var out = ['Расчёт зарплаты: ' + ZP_MONTHS[state.zp.month] + ' ' + state.zp.year];
    T.lines.forEach(function (l) { out.push(l.label + ': ' + fmt(l.cents) + ' ₽'); });
    out.push('Начислено: ' + fmt(T.accrued) + ' ₽');
    out.push('НДФЛ ' + pctText(T.nRate) + ': −' + fmt(T.ndfl) + ' ₽');
    out.push('Внутренний налог ' + pctText(T.iRate) + ': −' + fmt(T.internal) + ' ₽');
    if (T.penalty) out.push('Штраф: −' + fmt(T.penalty) + ' ₽');
    out.push('На руки: ' + fmt(T.net) + ' ₽');
    if (T.advNet) {
      out.push('Аванс: ' + fmt(T.advNet) + ' ₽, остаток к выплате: ' + fmt(T.rest) + ' ₽');
    }
    if (T.sickSfr) {
      out.push('Больничный от СФР (' + T.sickSfrDays + ' дн.): ' + fmt(T.sickSfr) +
        ' ₽ — платит фонд, не работодатель');
    }
    return out.join('\n');
  }
  function renderZp() {
    var z = state.zp, T = zpCalc();
    $('zpPeriod').textContent = ZP_MONTHS[z.month] + ' ' + z.year;
    var hero = fresh('zpHero');
    hero.innerHTML = '<div class="l">На руки за месяц</div><div class="v">' +
      fmtRub(T.net) + ' ₽</div><div class="split"><div><div class="l">Начислено</div>' +
      '<div class="s">' + fmtRub(T.accrued) + ' ₽</div></div>' +
      '<div><div class="l">Удержано</div><div class="s">' + fmtRub(T.deductions) +
      ' ₽</div></div></div>';
    $('zpRateCnt').textContent = 'ставка удержаний ' + pctText(T.effective);
    var body = fresh('zpBody');
    T.lines.forEach(function (l) {
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + esc(l.label) + '<br><span class="muted">' +
        esc(l.formula) + '</span></td><td class="num">' + fmt(l.cents) + ' ₽</td>';
      body.appendChild(tr);
    });
    [['НДФЛ ' + pctText(T.nRate), T.ndfl], ['Внутренний налог ' + pctText(T.iRate), T.internal],
      ['Штраф', T.penalty]].forEach(function (r) {
      if (!r[1]) return;
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + esc(r[0]) + '</td><td class="num minus">−' +
        fmt(r[1]) + ' ₽</td>';
      body.appendChild(tr);
    });
    var tot = fresh('zpTotals');
    function line(k, v, cls) {
      var n = el('div', cls || '');
      n.innerHTML = '<span>' + k + '</span><span>' + v + '</span>';
      tot.appendChild(n);
    }
    line('Начислено', fmt(T.accrued) + ' ₽');
    line('Удержано', '−' + fmt(T.deductions) + ' ₽', 'gain');
    line('На руки', fmt(T.net) + ' ₽', 'big');
    if (T.advNet) {
      line('Аванс за 1–15', fmt(T.advNet) + ' ₽');
      line('Остаток к выплате', fmt(T.rest) + ' ₽');
    }
    if (T.sickSfr) {
      line('Больничный от СФР', fmt(T.sickSfr) + ' ₽');
    }
    var wd = zpWeekdays(z.year, z.month);
    var warn = fresh('zpNormWarn');
    if (num(z.normDays) > wd) {
      warn.appendChild(el('div', 'note alert', 'Указано ' + z.normDays +
        ' рабочих дней, а будних в месяце ' + wd + '. Сверьтесь с производственным ' +
        'календарём: праздники и переносы кнопка не знает.'));
    } else {
      warn.appendChild(el('div', 'note', 'Норму дней и часов проверьте по ' +
        'производственному календарю: кнопка «Пн–Пт» считает будние дни без ' +
        'учёта праздников.'));
    }
    $('zpOut').value = zpText(T);
    thinkify();
  }
  (function () {
    var sel = fresh('zpMonth');
    ZP_MONTHS.forEach(function (m, i) { opt(sel, String(i), m); });
    sel.value = String(state.zp.month);
    $('zpMode').value = state.zp.mode || 'gross';
    $('zpHolOver').checked = !!state.zp.holOver;
    Object.keys(ZP_FIELDS).forEach(function (id) {
      var key = ZP_FIELDS[id], n = $(id);
      if (!n) return;
      n.value = state.zp[key] === undefined || state.zp[key] === null
        ? '' : state.zp[key];
      n.addEventListener('input', function () {
        state.zp[key] = this.value; save(); renderZp();
      });
    });
  }());
  $('zpMonth').addEventListener('change', function () {
    state.zp.month = parseInt(this.value, 10) || 0; save(); renderZp();
  });
  $('zpMode').addEventListener('change', function () {
    state.zp.mode = this.value; save(); renderZp();
  });
  $('zpHolOver').addEventListener('change', function () {
    state.zp.holOver = this.checked; save(); renderZp();
  });
  $('zpFillNorm').addEventListener('click', function () {
    var wd = zpWeekdays(state.zp.year, state.zp.month);
    state.zp.normDays = wd; state.zp.normHours = wd * 8; state.zp.worked = wd;
    $('zpNormDays').value = wd; $('zpNormHours').value = wd * 8; $('zpWorked').value = wd;
    save(); renderZp();
    toast('Норма по будням: ' + wd + ' дн., ' + wd * 8 + ' ч');
  });
  $('zpHalfAuto').addEventListener('click', function () {
    var h = zpWeekdaysHalf(state.zp.year, state.zp.month);
    state.zp.halfDays = h; $('zpHalfDays').value = h;
    save(); renderZp();
  });
  $('zpVacCalc').addEventListener('click', function () {
    var e = num(state.zp.vacEarn);
    if (!e) { toast('Впишите заработок за 12 месяцев'); return; }
    var v = Math.round(e / 12 / 29.3 * 100) / 100;
    state.zp.vacDaily = v; $('zpVacDaily').value = v;
    save(); renderZp();
    toast('Средний дневной для отпуска: ' + v.toFixed(2) + ' ₽');
  });
  $('zpSickCalc').addEventListener('click', function () {
    var e = num(state.zp.sickEarn);
    if (!e) { toast('Впишите заработок за два года'); return; }
    var v = Math.round(e / 730 * 100) / 100;
    state.zp.sickDaily = v; $('zpSickDaily').value = v;
    save(); renderZp();
    toast('Средний дневной для больничного: ' + v.toFixed(2) + ' ₽');
  });
  $('zpPrint').addEventListener('click', function () {
    var p = $('p-zp');
    p.classList.add('printme');
    try { window.print(); } finally {
      setTimeout(function () { p.classList.remove('printme'); }, 300);
    }
  });
  $('zpCopy').addEventListener('click', function () {
    var ta = $('zpOut');
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () {
        toast('Расчёт скопирован');
      }, function () { toast('Скопируйте текст вручную — поле выделено'); });
      return;
    }
    toast(ok ? 'Расчёт скопирован' : 'Скопируйте текст вручную — поле выделено');
  });
  $('zpReset').addEventListener('click', function () {
    state.zp = zpDefaults();
    Object.keys(ZP_FIELDS).forEach(function (id) {
      var n = $(id);
      if (n) n.value = state.zp[ZP_FIELDS[id]];
    });
    $('zpMonth').value = String(state.zp.month);
    $('zpMode').value = state.zp.mode;
    $('zpHolOver').checked = false;
    save(); renderZp();
    toast('Расчёт сброшен к значениям по умолчанию');
  });
  renderZp();

  // =====================================================================
  //                            СБОРКА КОМПЛЕКТА
  // Слоты вместо длинной простыни шагов: у каждого узла своё место,
  // обязательные помечены, лишние для категории не показываются.
  // Выбор позиции — из тех же прайсов, что и в конфигураторе.
  // =====================================================================
  var BUILD_KINDS = [
    { id: 'fiber', title: 'Волоконный по металлу',
      note: 'В цену станка входят контроллер FSCUT, голова BLT и чиллер CWFL. ' +
        'Компрессор, вытяжка, газ, стабилизатор и ПНР — отдельные слоты.' },
    { id: 'milling', title: 'Фрезерный с ЧПУ',
      note: 'Чиллер нужен при водяном охлаждении шпинделя. Вакуумный стол требует ' +
        '380 В. Аспирация и виброопоры влияют на качество и ресурс.' },
    { id: 'co2', title: 'Лазерный CO₂',
      note: 'Чиллер в цену не входит и обязателен. Цены CO₂ — розница с витрины сайта.' },
    { id: 'marker', title: 'Маркиратор',
      note: 'Питание 220 В, чиллер не нужен. Поворотная ось и ПНР — по цене к сервису.' }
  ];

  // Источники позиций для слотов. Каждый возвращает единый вид:
  // { name, price, sub, meta } — meta нужна проверке совместимости.
  function srcFiber() {
    var out = [];
    APP.fiberOrder.forEach(function (f) {
      Object.keys(fiberIdx[f] || {}).map(Number).sort(function (a, b) { return a - b; })
        .forEach(function (p) {
          out.push({ name: nomFiber('S', f, p), price: fiberIdx[f][p].base,
            sub: 'поле ' + APP.fiberFormats[f] + ' мм · приводы Yaskawa',
            meta: { kind: 'fiber', format: f, power: p, volts: 380 } });
        });
    });
    APP.fiberA.forEach(function (r) {
      out.push({ name: nomFiber('A', r.format, r.power), price: r.price,
        sub: 'серия A · поле ' + APP.fiberFormats[r.format] + ' мм',
        meta: { kind: 'fiber', format: r.format, power: r.power, volts: 380 } });
    });
    return out;
  }
  function srcMill() {
    return APP.milling.map(function (r) {
      // двигатели и стол в прайсе живут внутри названия сборки — вытаскиваем,
      // чтобы по ним можно было фильтровать конфигурацию
      var motor = /Leadshine/i.test(r.name)
        ? 'Шаговые с обратной связью (Leadshine)' : 'Шаговые';
      var table = r.vac ? 'Вакуумный (VAC)' : 'Профильный (Т-паз)';
      return { name: nomMill(r.name), price: r.order,
        sub: 'шпиндель ' + r.kw + ' кВт · ' + r.cool + ' · стойка ' + r.ctrl +
          ' · ' + table.toLowerCase(),
        meta: { kind: 'milling', kw: r.kw, cool: r.cool, vac: r.vac,
          ctrl: r.ctrl, motor: motor, table: table,
          format: r.format, volts: r.vac ? 380 : 220 } };
    });
  }
  function srcCo2() {
    return APP.co2.map(function (r) {
      return { name: co2Name(r), price: r.price,
        sub: 'поле ' + r.field + ' мм · трубка ' + r.tube + ' Вт',
        meta: { kind: 'co2', tube: r.tube, brand: r.brand, volts: 220 } };
    });
  }
  function srcMarker() {
    return APP.markers.filter(function (m) { return !/Батарея/i.test(m.name); })
      .map(function (m) {
        return { name: markerName(m, 'order'), price: m.order,
          sub: 'серия ' + m.series + (m.watt ? ' · ' + m.watt + ' Вт' : '') +
            ' · MOPA: ' + (m.mopa ? 'да' : 'нет'),
          meta: { kind: 'marker', watt: m.watt, volts: 220 } };
      });
  }
  function srcStab() {
    var out = APP.stabsFull.map(function (s) {
      return { name: s.n, price: s.p,
        sub: s.kw + ' кВт · ' + (s.ph === 1 ? '1 фаза, 220 В' : '3 фазы, 380 В') +
          ' · ' + s.src,
        meta: { watt: s.kw * 1000, phase: s.ph, spec: s.d, idx: s.idx, src: s.src } };
    });
    stabOptions().forEach(function (o) {
      var w = parseInt(String(o.name).replace(/\D+/g, '').slice(0, 6), 10) || 0;
      out.push({ name: nomOption(o.cat, o.name), price: o.price,
        sub: 'из прайса опций LASERCUT',
        meta: { watt: w, phase: /3-ЭМ|380/.test(o.name) ? 3 : 1 } });
    });
    return out;
  }
  function srcCompressor() {
    return APP.compressors.map(function (c) {
      return { name: c.name, price: c.price,
        sub: c.bar + ' бар · ' + c.lmin + ' л/мин · ' + c.kw + ' кВт · ресивер ' +
          c.tank + ' л',
        meta: { bar: c.bar, lmin: c.lmin, tank: c.tank } };
    });
  }
  function srcExtraction() {
    return APP.extraction.map(function (e) {
      return { name: e.name, price: e.price,
        sub: e.flow + ' м³/ч · ' + e.kw + ' кВт · патрубок ' + e.port,
        meta: { flow: e.flow } };
    });
  }
  function srcCryo() {
    return APP.cryo.map(function (c) {
      return { name: c.name, price: c.price, sub: c.flow + ' нм³/ч · ' + c.src,
        meta: { flow: c.flow } };
    });
  }
  function srcChiller() {
    return APP.chillersFull.map(function (c) {
      return { name: 'Чиллер ' + c.n, price: c.p || 0,
        sub: (c.kwMin ? 'шпиндель ' + c.kwMin + '–' + c.kwMax + ' кВт · ' : '') +
          (c.p ? c.src : 'цены нет — уточнить'),
        meta: { kwMin: c.kwMin, kwMax: c.kwMax, priced: !!c.p, spec: c.d } };
    });
  }
  function srcAspiration() {
    return APP.aspiration.map(function (a) {
      return { name: 'Пылеулавливающий агрегат ' + a.n, price: aspPrice(a),
        sub: a.q + ' м³/ч · ' + a.w + ' Вт · фильтр ' + a.f + ' мкм · ' + a.db + ' дБ',
        meta: { flow: a.q, volts: (a.v || [220])[0] } };
    });
  }
  function srcOptCat(cat) {
    return APP.options.filter(function (o) { return o.cat === cat; })
      .map(function (o) {
        return { name: nomOption(o.cat, o.name), price: o.price, sub: cat, meta: {} };
      });
  }
  function srcRotary() {
    return APP.markerRotary.map(function (r) {
      return { name: r.name, price: 0, sub: r.note + ' · цены в прайсе нет',
        meta: { noPrice: true } };
    });
  }
  // Группа прайса сервиса по модели фрезера: правила лежат в данных,
  // поэтому ПНР подтягивается к станку сам и выбирать модель дважды не нужно
  function millPnrGroup(name) {
    var s = String(name || ''), hit = '';
    APP.pnrGroupRules.forEach(function (r) {
      if (hit) return;
      if (new RegExp(r[0], 'i').test(s)) hit = r[1];
    });
    return hit;
  }
  function pnrGroupById(k) {
    var g = null;
    APP.pnrGroups.forEach(function (x) { if (x.k === k) g = x; });
    return g;
  }
  // Позиция ПНР по группе станка и виду работ из APP.pnrKinds
  function pnrItem(groupKey, kindKey) {
    var g = pnrGroupById(groupKey);
    if (!g) return null;
    var kd = null;
    APP.pnrKinds.forEach(function (x) { if (x.k === kindKey) kd = x; });
    if (!kd) return null;
    var price = g[kindKey];
    if (!price) return null;
    return { name: kd.nom + ' — ' + g.n, price: price,
      sub: kindKey === 'edu' ? 'отдельной услугой'
        : 'выезд ' + g.d + ' дн.' + (g.eduIncl ? ' · обучение включено' : ''),
      meta: { group: g.k, kind: kindKey, days: g.d } };
  }
  function srcPnrMill() {
    // если станок в слоте уже выбран, показываем только его группу:
    // менеджеру остаётся выбрать вид работ, а не искать модель в списке
    var mach = (slotItems().machine || {}).name || '';
    var gk = millPnrGroup(mach);
    if (gk && pnrGroupById(gk)) {
      var only = [];
      APP.pnrKinds.forEach(function (kd) {
        var it = pnrItem(gk, kd.k);
        if (it) only.push(it);
      });
      if (only.length) return only;
    }
    var out = [];
    APP.pnrGroups.forEach(function (g) {
      if (g.pnr) {
        out.push({ name: 'Пусконаладочные работы — ' + g.n, price: g.pnr,
          sub: 'выезд ' + g.d + ' дн.' + (g.eduIncl ? ' · обучение включено' : ''),
          meta: { group: g.k, days: g.d } });
      }
      if (g.both) {
        out.push({ name: 'Пусконаладочные работы и обучение — ' + g.n, price: g.both,
          sub: 'пакет · выезд ' + g.d + ' дн.', meta: { group: g.k, days: g.d } });
      }
      if (g.edu) {
        out.push({ name: 'Обучение оператора — ' + g.n, price: g.edu,
          sub: 'отдельной услугой', meta: { group: g.k } });
      }
    });
    return out;
  }
  function srcPnrNoPrice(kind) {
    return APP.pnrNoPrice.filter(function (p) { return p['for'] === kind; })
      .map(function (p) {
        return { name: p.name + ' — цену уточнить у сервиса', price: 0,
          sub: 'в прайсе сервиса этой категории нет', meta: { noPrice: true } };
      });
  }
  function srcFree() { return []; }   // слот заполняется руками

  // Описание слотов по категориям: id, подпись, обязательность, источник
  var BUILD_SLOTS = {
    fiber: [
      ['machine', 'Станок', true, srcFiber],
      ['stab', 'Стабилизатор напряжения', true, srcStab],
      ['compressor', 'Компрессор', false, srcCompressor],
      ['extraction', 'Дымоуловитель (ФВУ)', false, srcExtraction],
      ['cryo', 'Источник газа (криоцилиндр)', false, srcCryo],
      ['pnr', 'ПНР и обучение', false, function () { return srcPnrNoPrice('co2'); }],
      ['delivery', 'Доставка и прочее', false, srcFree]
    ],
    milling: [
      ['machine', 'Станок', true, srcMill],
      ['stab', 'Стабилизатор напряжения', true, srcStab],
      ['chiller', 'Чиллер', false, srcChiller],
      ['sensor', 'Датчик высоты инструмента', false,
        function () { return srcOptCat('Датчики высоты инструмента'); }],
      ['vibro', 'Виброопоры', false, function () { return srcOptCat('Виброопоры'); }],
      ['asp', 'Аспирация', false, srcAspiration],
      ['ctrl', 'Стойка ЧПУ отдельной позицией', false,
        function () { return srcOptCat('DSP-контроллеры'); }],
      ['pnr', 'ПНР и обучение', false, srcPnrMill],
      ['delivery', 'Доставка и прочее', false, srcFree]
    ],
    co2: [
      ['machine', 'Станок', true, srcCo2],
      ['chiller', 'Чиллер', true, srcChiller],
      ['stab', 'Стабилизатор напряжения', true, srcStab],
      ['extraction', 'Вытяжка (ФВУ)', false, srcExtraction],
      ['compressor', 'Компрессор воздуха', false, srcCompressor],
      ['pnr', 'ПНР и обучение', false, function () { return srcPnrNoPrice('co2'); }],
      ['delivery', 'Доставка и прочее', false, srcFree]
    ],
    marker: [
      ['machine', 'Маркиратор', true, srcMarker],
      ['stab', 'Стабилизатор напряжения', false, srcStab],
      ['rotary', 'Поворотное устройство', false, srcRotary],
      ['extraction', 'Вытяжка (ФВУ)', false, srcExtraction],
      ['pnr', 'ПНР и обучение', false, function () { return srcPnrNoPrice('marker'); }],
      ['delivery', 'Доставка и прочее', false, srcFree]
    ]
  };
  var SLOT_SHORT = { machine: 'СТАНОК', stab: 'СТАБ', compressor: 'КОМПР',
    extraction: 'ФВУ', cryo: 'ГАЗ', chiller: 'ЧИЛЛЕР', sensor: 'ДАТЧИК',
    vibro: 'ОПОРЫ', asp: 'АСПИР', ctrl: 'ЧПУ', rotary: 'ОСЬ', pnr: 'ПНР',
    delivery: 'ДОСТАВКА' };

  function buildKind() { return state.build.kind || 'fiber'; }
  function buildSlots() { return BUILD_SLOTS[buildKind()] || BUILD_SLOTS.fiber; }
  function slotDef(id) {
    var found = null;
    buildSlots().forEach(function (s) { if (s[0] === id) found = s; });
    return found;
  }
  function slotItems() { return state.build.slots[buildKind()] || {}; }
  // Слоты, где позиция считается штуками: виброопоры ставят комплектом
  var QTY_SLOTS = { vibro: true };
  function slotQty(v) {
    var q = parseInt((v || {}).qty, 10);
    return q > 0 ? Math.min(99, q) : 1;
  }
  function setSlotQty(id, q) {
    var box = state.build.slots[buildKind()];
    if (!box || !box[id]) return;
    box[id].qty = Math.max(1, Math.min(99, parseInt(q, 10) || 1));
    save(); renderBuild();
  }
  // Количество опор по формату станка из слота: прайс задаёт его для 6090…2040
  function vibroDefaultQty() {
    var m = slotItems().machine;
    var f = m && m.meta ? m.meta.format : '';
    return APP.vibroQty[f] || 4;
  }
  function setSlot(id, item) {
    if (!state.build.slots[buildKind()]) state.build.slots[buildKind()] = {};
    if (item) {
      // опоры сразу берут количество по формату станка, дальше меняется кнопками
      if (QTY_SLOTS[id] && !item.qty) item.qty = vibroDefaultQty();
      state.build.slots[buildKind()][id] = item;
    } else {
      delete state.build.slots[buildKind()][id];
    }
    save(); renderBuild();
  }

  // ---- диалог выбора позиции ----
  // Для слота «Станок» сверху появляется набор фильтров-конфигурации: мощность
  // шпинделя, стойка, двигатели, стол (у фрезерных), мощность и модули
  // (у волокна). Цена в строке показывается вместе с разницей к базовой —
  // видно, во что обходится каждое изменение конфигурации.
  var pickState = { slot: '', rows: [], cfg: {}, base: 0 };
  var PICK_CFG = {
    milling: [
      ['kw', 'Шпиндель, кВт', function (r) { return r.meta.kw ? r.meta.kw + ' кВт' : ''; }],
      ['cool', 'Охлаждение', function (r) { return r.meta.cool || ''; }],
      ['ctrl', 'Система управления', function (r) { return r.meta.ctrl || ''; }],
      ['motor', 'Двигатели', function (r) { return r.meta.motor || ''; }],
      ['table', 'Стол', function (r) { return r.meta.table || ''; }]
    ],
    fiber: [
      ['power', 'Мощность источника', function (r) {
        return r.meta.power ? (r.meta.power / 1000) + ' кВт' : ''; }],
      ['format', 'Рабочее поле', function (r) {
        return r.meta.format ? APP.fiberFormats[r.meta.format] + ' мм' : ''; }]
    ],
    co2: [
      ['tube', 'Трубка, Вт', function (r) { return r.meta.tube || ''; }],
      ['brandC', 'Бренд', function (r) { return r.meta.brand || ''; }]
    ],
    marker: [
      ['watt', 'Мощность', function (r) { return r.meta.watt ? r.meta.watt + ' Вт' : ''; }],
      ['mopa', 'MOPA', function (r) { return r.meta.mopa ? 'да' : 'нет'; }]
    ]
  };
  // Вариантов сверх прайса в файле цен нет, но менеджеру они нужны: показываем
  // их с пометкой «по запросу» и цену станка не подменяем выдуманной.
  var PICK_REQ = {
    milling: {
      motor: ['Серводвигатели (по запросу)', 'Шаговые Yako (по запросу)'],
      table: ['С СОЖ — ванна охлаждения (по запросу)']
    }
  };
  function reqVals(key) {
    return ((PICK_REQ[buildKind()] || {})[key] || []);
  }
  function isReqVal(key, v) { return reqVals(key).indexOf(v) >= 0; }
  function pickCfgDefs() {
    if (pickState.slot !== 'machine') return [];
    return PICK_CFG[buildKind()] || [];
  }
  function renderPickCfg() {
    var box = fresh('pickCfg'), defs = pickCfgDefs();
    if (!defs.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.appendChild(el('div', 'mc-h', 'Конфигурация: параметры меняются, ' +
      'цена пересчитывается по прайсу'));
    var row = el('div', 'mc-row');
    defs.forEach(function (d) {
      var key = d[0], label = d[1], get = d[2];
      var vals = [];
      pickState.rows.forEach(function (r) {
        var v = get(r);
        if (v && vals.indexOf(v) < 0) vals.push(v);
      });
      var extra = reqVals(key);
      if (vals.length < 2 && !extra.length) return;
      var cell = el('div');
      cell.appendChild(el('label', 'f', esc(label)));
      var sel = el('select');
      opt(sel, '', 'любая');
      vals.forEach(function (v) { opt(sel, v, v); });
      extra.forEach(function (v) { opt(sel, v, v); });
      sel.value = pickState.cfg[key] || '';
      sel.addEventListener('change', function () {
        pickState.cfg[key] = this.value;
        // перерисовываем и сам блок: иначе сводка отбора и предупреждение
        // о вариантах «по запросу» оставались от прошлого состояния
        renderPickCfg();
        renderPick();
      });
      cell.appendChild(sel);
      row.appendChild(cell);
    });
    box.appendChild(row);
    var chosen = [];
    defs.forEach(function (d) {
      if (pickState.cfg[d[0]]) chosen.push(d[1] + ': ' + pickState.cfg[d[0]]);
    });
    box.appendChild(el('div', 'mc-f', chosen.length
      ? 'Отбор: ' + esc(chosen.join(' · ')) + '. Разница в цене — от позиции ' +
        'слота или самой дешёвой в отборе.'
      : 'Фильтры не заданы — показан весь список.'));
    // выбранные «запросные» варианты: список не сужаем, но говорим прямо
    var reqChosen = [];
    defs.forEach(function (d) {
      var v = pickState.cfg[d[0]];
      if (v && isReqVal(d[0], v)) reqChosen.push(d[1] + ': ' + v);
    });
    if (reqChosen.length) {
      box.appendChild(el('div', 'mc-req', 'В прайсе этого нет: ' +
        esc(reqChosen.join(' · ')) + '. Цену уточнить у поставщика — в позицию ' +
        'уйдёт пометка «по запросу», стоимость станка не меняется.'));
    }
    var reset = el('button', 'btn mini sec', 'Сбросить конфигурацию');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      pickState.cfg = {};
      renderPickCfg(); renderPick();
    });
    box.appendChild(reset);
  }
  function pickFilter(rows) {
    var defs = pickCfgDefs();
    if (!defs.length) return rows;
    return rows.filter(function (r) {
      var ok = true;
      defs.forEach(function (d) {
        var want = pickState.cfg[d[0]];
        if (want && isReqVal(d[0], want)) return;   // варианта нет в прайсе
        if (want && d[2](r) !== want) ok = false;
      });
      return ok;
    });
  }
  function openPick(slotId) {
    var def = slotDef(slotId);
    if (!def) return;
    pickState.slot = slotId;
    pickState.rows = def[3]();
    pickState.cfg = {};
    // база для разницы: то, что уже стоит в слоте
    var cur = slotItems()[slotId];
    pickState.base = cur ? toCents(cur.price || 0) : 0;
    $('pickTitle').textContent = def[1] + ' — выбор позиции';
    $('pickSearch').value = '';
    $('pickModal').classList.add('open');
    renderPickCfg();
    renderPick();
    try { $('pickSearch').focus(); } catch (e) {}
  }
  function closePick() { $('pickModal').classList.remove('open'); closeSegPop(); }
  // Разметка названия: куски вида «1.5wc», «A11 + Leadshine», «VAC» становятся
  // кнопками — по ним меняют шпиндель, стойку и стол, не листая список
  var SEG_RULES = [
    [/^\d+(?:[.,]\d+)?\s*(?:wc|ac)$/i, 'kw'],
    [/^(NC8|NC|A11|A18|Syntec)(\s*\+\s*\w+)?$/i, 'ctrl'],
    [/^VAC$/i, 'table']
  ];
  function segKeyFor(part) {
    var key = '';
    SEG_RULES.forEach(function (rl) {
      if (!key && rl[0].test(part.trim())) key = rl[1];
    });
    return key;
  }
  function nameWithSegs(r) {
    if (pickState.slot !== 'machine' || buildKind() !== 'milling') return esc(r.name);
    var parts = String(r.name).split(',');
    return parts.map(function (part, i) {
      var key = i ? segKeyFor(part) : '';
      if (!key) return esc(part);
      return ' <button type="button" class="seg" data-key="' + key + '" title="' +
        'Сменить параметр">' + esc(part.trim()) + '</button>';
    }).join(',');
  }
  var segPop = null;
  function closeSegPop() {
    if (segPop && segPop.parentNode) segPop.parentNode.removeChild(segPop);
    segPop = null;
  }
  function openSegPop(btn, key) {
    closeSegPop();
    var defs = pickCfgDefs(), def = null;
    defs.forEach(function (d) { if (d[0] === key) def = d; });
    if (!def) return;
    var vals = [];
    pickState.rows.forEach(function (r) {
      var v = def[2](r);
      if (v && vals.indexOf(v) < 0) vals.push(v);
    });
    reqVals(key).forEach(function (v) { vals.push(v); });
    segPop = el('div', 'segpop');
    var cur = pickState.cfg[key] || '';
    var head = el('div', 'muted');
    head.style.cssText = 'font-size:11px;padding:2px 9px 4px';
    head.textContent = def[1];
    segPop.appendChild(head);
    var any = el('button', cur ? '' : 'on', 'любой');
    any.type = 'button';
    any.addEventListener('click', function () {
      delete pickState.cfg[key];
      closeSegPop(); renderPickCfg(); renderPick();
    });
    segPop.appendChild(any);
    vals.forEach(function (v) {
      var b2 = el('button', cur === v ? 'on' : '', v);
      b2.type = 'button';
      b2.addEventListener('click', function () {
        pickState.cfg[key] = v;
        closeSegPop(); renderPickCfg(); renderPick();
      });
      segPop.appendChild(b2);
    });
    var row = btn.closest ? btn.closest('.pickrow') : null;
    (row || $('pickList')).appendChild(segPop);
    segPop.style.left = Math.max(0, btn.offsetLeft - 8) + 'px';
    segPop.style.top = (btn.offsetTop + 22) + 'px';
  }
  function renderPick() {
    var q = ($('pickSearch').value || '').trim().toLowerCase();
    var sort = $('pickSort').value;
    var rows = pickFilter(pickState.rows).filter(function (r) {
      return !q || r.name.toLowerCase().indexOf(q) >= 0 ||
        (r.sub || '').toLowerCase().indexOf(q) >= 0;
    });
    // если в слоте пусто, базой считаем самую дешёвую строку отбора
    var base = pickState.base;
    if (!base && rows.length) {
      base = rows.reduce(function (m, r) {
        var c = toCents(r.price || 0);
        return (!m || (c && c < m)) ? c : m;
      }, 0);
    }
    if (sort === 'asc') rows = rows.slice().sort(function (a, b) { return a.price - b.price; });
    if (sort === 'desc') rows = rows.slice().sort(function (a, b) { return b.price - a.price; });
    $('pickCnt').textContent = cnt(rows.length, ['позиция', 'позиции', 'позиций']);
    var box = fresh('pickList');
    if (!rows.length) {
      box.appendChild(el('div', 'empty small',
        pickState.rows.length
          ? 'Ничего не найдено. Уберите часть запроса.'
          : 'В этом слоте нет позиций с ценой — впишите её вручную кнопкой «Своя позиция».'));
      return;
    }
    rows.slice(0, 200).forEach(function (r) {
      var row = el('div', 'pickrow');
      row.style.position = 'relative';
      var cents = toCents(r.price || 0);
      var diff = base && cents ? cents - base : 0;
      var diffTx = diff
        ? '<span class="pd ' + (diff > 0 ? 'up' : 'dn') + '">' +
          (diff > 0 ? '+' : '−') + fmtRub(Math.abs(diff)) + ' ₽</span>'
        : (base && cents ? '<span class="pd same">без изменения</span>' : '');
      row.innerHTML = '<div class="pn"><b>' + nameWithSegs(r) + '</b>' +
        (r.sub ? '<span class="muted">' + esc(r.sub) + '</span>' : '') + '</div>' +
        '<div class="pp">' + (r.price ? fmtRub(cents) + ' ₽'
          : '<span class="muted">цену уточнить</span>') + diffTx + '</div>';
      // параметры в самом названии: клик по «1.5wc» или «VAC» открывает список
      var segs = row.querySelectorAll('button.seg');
      for (var sg = 0; sg < segs.length; sg++) {
        segs[sg].addEventListener('click', function (e) {
          e.stopPropagation();
          openSegPop(this, this.getAttribute('data-key'));
        });
      }
      var b = el('button', 'btn mini', 'Выбрать');
      b.type = 'button';
      b.addEventListener('click', function () {
        // выбранные варианты «по запросу» дописываются в наименование:
        // цену прайса они не меняют, но менеджер и клиент видят их в смете
        var extra = [];
        pickCfgDefs().forEach(function (d) {
          var v = pickState.cfg[d[0]];
          if (v && isReqVal(d[0], v)) {
            extra.push(d[1].toLowerCase() + ': ' + v.replace(/\s*\(по запросу\)/i, ''));
          }
        });
        var nm = r.name + (extra.length ? ' + ' + extra.join(' + ') + ' (по запросу)' : '');
        setSlot(pickState.slot, { name: nm, price: r.price,
          sub: (r.sub || '') + (extra.length ? ' · доплата за исполнение по запросу' : ''),
          meta: r.meta || {} });
        closePick();
        toast('В слот «' + slotDef(pickState.slot)[1] + '»: ' +
          (nm.length > 40 ? nm.slice(0, 40) + '…' : nm));
      });
      row.appendChild(b);
      box.appendChild(row);
    });
    if (rows.length > 200) {
      box.appendChild(el('div', 'muted small', 'Показаны первые 200 из ' +
        cnt(rows.length, ['позиция', 'позиции', 'позиций']) + ' — уточните поиск'));
    }
  }
  $('pickClose').addEventListener('click', closePick);
  $('pickSearch').addEventListener('input', renderPick);
  $('pickSort').addEventListener('change', renderPick);
  $('pickModal').addEventListener('click', function (e) {
    if (e.target === $('pickModal')) closePick();
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('pickModal').classList.contains('open')) closePick();
  });

  // ---- проверка сборки ----
  // Считаем то, что можно проверить по данным, и честно говорим, чего в данных нет.
  function buildCheckList() {
    var it = slotItems(), kind = buildKind(), out = [];
    var machine = it.machine;
    if (!machine) {
      out.push(['stop', 'Станок не выбран — без него комплект не считается.']);
      return out;
    }
    buildSlots().forEach(function (s) {
      if (s[2] && !it[s[0]]) {
        out.push(['stop', 'Обязательный слот «' + s[1] + '» пуст.']);
      }
    });
    // стабилизатор: мощность и фаза
    if (it.stab) {
      var needW = 0;
      if (kind === 'fiber') needW = stabNeedWatt();
      var w = (it.stab.meta || {}).watt || 0;
      if (needW && w && w < needW) {
        out.push(['stop', 'Стабилизатор ' + fmtRub(toCents(w)).replace(',00', '') +
          ' Вт не проходит: карта готовности требует от ' +
          fmtRub(toCents(needW)).replace(',00', '') + ' Вт. Работа без подходящего ' +
          'стабилизатора снимает гарантию.']);
      } else if (needW && w) {
        out.push(['ok', 'Стабилизатор проходит по мощности: ' +
          fmtRub(toCents(w)).replace(',00', '') + ' Вт против требуемых ' +
          fmtRub(toCents(needW)).replace(',00', '') + ' Вт.']);
      }
      var mv = (machine.meta || {}).volts;
      var ph = (it.stab.meta || {}).phase;
      if (mv === 380 && ph === 1) {
        out.push(['stop', 'Станку нужен ввод 380 В, а стабилизатор однофазный.']);
      }
      if (mv === 220 && ph === 3) {
        out.push(['warn', 'Станок на 220 В, стабилизатор трёхфазный — проверьте, ' +
          'что в цеху есть 380 В и это оправдано.']);
      }
      if (!needW) {
        out.push(['warn', 'Потребление этого станка в данных не записано — ' +
          'мощность стабилизатора приложение не проверяет, сверьте по паспорту.']);
      }
    }
    // чиллер
    if (kind === 'milling') {
      var kw = (machine.meta || {}).kw || 0;
      var water = (machine.meta || {}).cool === 'водяное';
      if (water && !it.chiller) {
        out.push(['warn', 'Шпиндель с водяным охлаждением, а чиллер не выбран — ' +
          'без него станок работать не должен.']);
      }
      if (it.chiller && it.chiller.meta && it.chiller.meta.kwMin) {
        var c = it.chiller.meta;
        if (kw && (kw < c.kwMin || kw > c.kwMax)) {
          out.push(['warn', 'Чиллер рассчитан на шпиндель ' + c.kwMin + '–' + c.kwMax +
            ' кВт, у станка ' + kw + ' кВт. Диапазоны — рекомендация производителя, ' +
            'а не наш прайс: подтвердите у сервиса.']);
        } else if (kw) {
          out.push(['ok', 'Чиллер попадает в диапазон по шпинделю (' + c.kwMin + '–' +
            c.kwMax + ' кВт).']);
        }
      }
      if (!water && it.chiller) {
        out.push(['warn', 'У станка воздушное охлаждение шпинделя — чиллер, скорее ' +
          'всего, лишний.']);
      }
      if ((machine.meta || {}).vac) {
        out.push(['warn', 'Вакуумный стол — питание 380 В: это надо учесть в ' +
          'подготовке цеха и в стабилизаторе.']);
      }
    }
    if (kind === 'fiber' && it.chiller) {
      out.push(['warn', 'У металлореза чиллер CWFL входит в цену станка — ' +
        'вторая единица обычно не нужна.']);
    }
    // компрессор против расхода воздуха
    if (it.compressor) {
      var lmin = (it.compressor.meta || {}).lmin || 0;
      var maxM3 = APP.airDemand.max;                 // м³/ч на верхней толщине
      var needL = Math.round(maxM3 * 1000 / 60 * 1.25);
      if (lmin && lmin < needL) {
        out.push(['warn', 'Компрессор ' + lmin + ' л/мин: верх таблицы расхода (' +
          APP.airDemand.maxLabel + ', ' + String(maxM3).replace('.', ',') +
          ' м³/ч) с запасом 25 % требует около ' + needL + ' л/мин.']);
      } else if (lmin) {
        out.push(['ok', 'Компрессор закрывает таблицу расхода с запасом.']);
      }
      var tank = (it.compressor.meta || {}).tank || 0;
      if (tank && tank < APP.minTankL) {
        out.push(['warn', 'Ресивер ' + tank + ' л меньше рекомендованных ' +
          APP.minTankL + ' л.']);
      }
    }
    // ПНР под формат станка
    if (kind === 'milling' && it.pnr && it.pnr.meta && it.pnr.meta.group) {
      var fmt = (machine.meta || {}).format || '';
      var g = it.pnr.meta.group;
      var okGroup = (g === 'mini' && (fmt === '0404' || fmt === '0609')) ||
        (g === '6090' && fmt === '6090') || (g === '1313' && fmt === '1313') ||
        (g === '1616' && fmt === '1616') || (g === '1325' && fmt === '1325') ||
        (g === '2030' && (fmt === '2030' || fmt === '2040')) ||
        g === 'm3' || g === 's4' || g === 'rd' || g === 'miniCab';
      if (!okGroup) {
        out.push(['warn', 'Группа ПНР не совпадает с форматом станка (' + fmt +
          ') — сверьте строку прайса.']);
      }
    }
    // позиции без цены
    var zero = [];
    Object.keys(it).forEach(function (k) { if (!it[k].price) zero.push(slotDef(k)[1]); });
    if (zero.length) {
      out.push(['warn', 'Без цены: ' + zero.join(', ') +
        '. В смете эти строки уйдут нулём — поставьте сумму руками.']);
    }
    return out;
  }

  function buildTotals() {
    var it = slotItems(), rate = parseInt($('ndsRate').value, 10) || APP.ndsDefault * 10;
    var sum = 0, rows = [];
    buildSlots().forEach(function (s) {
      var v = it[s[0]];
      if (!v) return;
      // у слотов со штучными позициями (виброопоры) цена умножается на количество
      var q = slotQty(v);
      var cents = toCents(v.price || 0) * q;
      sum += cents;
      rows.push({ slot: s[0], label: s[1], item: v, qty: q, cents: cents });
    });
    var nds = ndsIznutri(sum, rate);
    return { rows: rows, total: sum, rate: rate, nds: nds.nds, bez: nds.bez };
  }

  function buildText(T) {
    var lines = ['Комплект: ' + (BUILD_KINDS.filter(function (k) {
      return k.id === buildKind(); })[0] || {}).title];
    T.rows.forEach(function (r) {
      lines.push(r.label + ': ' + r.item.name +
        ((r.qty || 1) > 1 ? ' × ' + r.qty + ' шт' : '') + ' — ' +
        (r.cents ? fmt(r.cents) + ' ₽' : 'цену уточнить'));
    });
    lines.push('');
    lines.push('Итого: ' + fmt(T.total) + ' ₽, в т. ч. НДС ' + pctText(T.rate) +
      ' — ' + fmt(T.nds) + ' ₽');
    lines.push('Гарантия ' + APP.guarantee.label + ' · поставка под заказ ' +
      APP.deliveryOrder);
    return lines.join('\n');
  }

  function renderBuild() {
    var it = slotItems(), reqOnly = $('buildReqOnly').checked;
    var kindDef = BUILD_KINDS.filter(function (k) { return k.id === buildKind(); })[0] ||
      BUILD_KINDS[0];
    $('buildKindTitle').textContent = kindDef.title;
    $('buildKindNote').textContent = kindDef.note;
    var bs = $('buildKinds').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-kind') === buildKind();
      bs[i].className = on ? 'pill on' : 'pill';
      bs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    // слоты
    var box = fresh('buildSlots');
    buildSlots().forEach(function (s) {
      var id = s[0], label = s[1], req = s[2], v = it[id];
      if (reqOnly && !req && !v) return;
      var row = el('div', 'slot' + (v ? ' filled' : '') + (req ? ' req' : ''));
      var head = el('div', 'slot-h');
      head.innerHTML = '<b>' + esc(label) + (req ? ' <span class="star">*</span>' : '') +
        '</b><span class="muted">' + (v ? '' : cnt(s[3]().length, ['позиция', 'позиции', 'позиций'])) +
        '</span>';
      row.appendChild(head);
      var body = el('div', 'slot-b');
      if (v) {
        var q = slotQty(v), sumC = toCents(v.price || 0) * q;
        body.innerHTML = '<div class="slot-n"><b>' + esc(v.name) + '</b>' +
          (v.sub ? '<span class="muted">' + esc(v.sub) + '</span>' : '') +
          (QTY_SLOTS[id] && q > 1 ? '<span class="muted">' + q + ' шт × ' +
            fmtRub(toCents(v.price || 0)) + ' ₽</span>' : '') + '</div>' +
          '<div class="slot-p">' + (v.price ? fmtRub(sumC) + ' ₽'
            : '<span class="muted">цену уточнить</span>') + '</div>';
      } else {
        body.innerHTML = '<div class="slot-n muted">Слот пуст</div><div class="slot-p"></div>';
      }
      // Количество для штучных слотов: типовые комплекты опор 4/6/8/10
      var extras = [];
      if (QTY_SLOTS[id] && v) {
        var qrow = el('div', 'slot-q noprint');
        qrow.appendChild(el('span', 'muted', 'Количество'));
        APP.vibroQtyChoices.forEach(function (n3) {
          var qb = el('button', 'pill sm' + (slotQty(v) === n3 ? ' on' : ''), n3 + ' шт');
          qb.type = 'button';
          qb.setAttribute('data-qty', String(n3));
          qb.addEventListener('click', function () { setSlotQty(id, n3); });
          qrow.appendChild(qb);
        });
        extras.push(qrow);
      }
      // ПНР у фрезеров тянется к станку: модель уже известна, выбираем вид работ
      if (id === 'pnr' && buildKind() === 'milling') {
        var mach2 = it.machine, gk2 = millPnrGroup((mach2 || {}).name || '');
        var prow = el('div', 'slot-q noprint');
        if (!mach2) {
          prow.appendChild(el('span', 'muted', 'Сначала выберите станок — ' +
            'цена ПНР подтянется по его модели'));
        } else if (!gk2) {
          prow.appendChild(el('span', 'muted', 'Для этой модели строки в прайсе ' +
            'сервиса нет — цену уточнить'));
        } else {
          prow.appendChild(el('span', 'muted', pnrGroupById(gk2).n));
          APP.pnrKinds.forEach(function (kd) {
            var pi = pnrItem(gk2, kd.k);
            if (!pi) return;
            var on = v && v.meta && v.meta.kind === kd.k && v.meta.group === gk2;
            var pb2 = el('button', 'pill sm' + (on ? ' on' : ''),
              kd.label + ' · ' + fmtRub(toCents(pi.price)) + ' ₽');
            pb2.type = 'button';
            pb2.setAttribute('data-pnr', kd.k);
            pb2.addEventListener('click', function () { setSlot('pnr', pi); });
            prow.appendChild(pb2);
          });
        }
        extras.push(prow);
      }
      var btns = el('div', 'slot-a noprint');
      var addB = el('button', 'btn mini' + (v ? ' sec' : ''), v ? 'Заменить' : 'Добавить');
      addB.type = 'button';
      addB.setAttribute('data-slot', id);
      addB.addEventListener('click', function () { openPick(id); });
      btns.appendChild(addB);
      if (id === 'delivery' || (v && v.price === 0) || id === 'pnr') {
        var handB = el('button', 'btn mini sec', 'Своя позиция');
        handB.type = 'button';
        handB.addEventListener('click', function () {
          var nm = prompt('Наименование позиции для слота «' + label + '»',
            (v && v.name) || '');
          if (nm === null) return;
          nm = String(nm).trim();
          if (!nm) return;
          var pr = prompt('Цена в рублях (0 — уточняется)', v ? String(v.price) : '0');
          if (pr === null) return;
          var num = parseFloat(String(pr).replace(/\s| /g, '').replace(',', '.'));
          if (!(num >= 0)) num = 0;
          setSlot(id, { name: nm, price: num, sub: 'вписано вручную', meta: {} });
        });
        btns.appendChild(handB);
      }
      if (v) {
        var delB = el('button', 'btn mini danger', 'Убрать');
        delB.type = 'button';
        delB.addEventListener('click', function () { setSlot(id, null); });
        btns.appendChild(delB);
      }
      row.appendChild(body);
      extras.forEach(function (x) { row.appendChild(x); });
      row.appendChild(btns);
      box.appendChild(row);
    });

    // полоса заполнения
    var fill = fresh('buildFill'), done = 0;
    buildSlots().forEach(function (s) {
      var v = it[s[0]];
      if (v) done++;
      var chip = el('span', 'chip' + (v ? ' on' : '') + (s[2] ? ' req' : ''),
        esc(SLOT_SHORT[s[0]] || s[1]));
      chip.setAttribute('title', s[1] + (v ? ': ' + v.name : ': пусто'));
      fill.appendChild(chip);
    });
    $('buildFillCnt').textContent = done + ' из ' + buildSlots().length;

    // итог
    var T = buildTotals();
    var body2 = fresh('buildBody');
    var has = T.rows.length > 0;
    $('buildEmpty').style.display = has ? 'none' : '';
    $('buildTable').style.display = has ? '' : 'none';
    $('buildCnt').textContent = has ? cnt(T.rows.length, ['позиция', 'позиции', 'позиций']) : '';
    T.rows.forEach(function (r) {
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + esc(r.label) + '<br><span class="muted">' +
        esc(r.item.name) + '</span></td><td class="num">' +
        (r.cents ? fmtRub(r.cents) + ' ₽' : '—') + '</td>';
      body2.appendChild(tr);
    });
    var tot = fresh('buildTotals');
    if (has) {
      function line(k, v, cls) {
        var n = el('div', cls || '');
        n.innerHTML = '<span>' + k + '</span><span>' + v + '</span>';
        tot.appendChild(n);
      }
      line('в т. ч. НДС ' + pctText(T.rate), fmtRub(T.nds) + ' ₽');
      line('Итого', fmtRub(T.total) + ' ₽', 'big');
      $('buildOut').value = buildText(T);
    } else {
      $('buildOut').value = '';
    }

    // проверка
    var chk = fresh('buildCheck');
    var list = buildCheckList();
    var bad = list.filter(function (x) { return x[0] === 'stop'; }).length;
    var warn = list.filter(function (x) { return x[0] === 'warn'; }).length;
    var head2 = el('div', 'chk-h' + (bad ? ' bad' : (warn ? ' warn' : ' ok')));
    head2.textContent = bad ? 'Сборка не годится: ' + cnt(bad, ['ошибка', 'ошибки', 'ошибок'])
      : (warn ? 'Сборка считается, есть ' + cnt(warn, ['замечание', 'замечания', 'замечаний'])
        : 'Проверка пройдена, замечаний нет');
    chk.appendChild(head2);
    list.forEach(function (x) {
      chk.appendChild(el('div', 'chk-i ' + x[0], esc(x[1])));
    });
    thinkify();
  }

  // ---- типовые комплекты ----
  function renderTemplates() {
    var box = fresh('buildTemplates');
    var kind = buildKind();
    var tpls = BUILD_TPL.filter(function (t) { return t.kind === kind; });
    if (!tpls.length) {
      box.appendChild(el('div', 'muted small', 'Для этой категории типовых нет.'));
      return;
    }
    tpls.forEach(function (t) {
      var row = el('div', 'tplrow');
      var sum = 0;
      var items = t.pick();
      Object.keys(items).forEach(function (k) { sum += toCents(items[k].price || 0); });
      row.innerHTML = '<div class="pn"><b>' + esc(t.title) + '</b>' +
        '<span class="muted">' + esc(t.hint) + '</span></div>' +
        '<div class="pp">' + fmtRub(sum) + ' ₽</div>';
      var b = el('button', 'btn mini sec', 'В слоты');
      b.type = 'button';
      b.addEventListener('click', function () {
        state.build.slots[kind] = items;
        save(); renderBuild();
        toast('Подставлен типовой комплект: ' + t.title);
      });
      row.appendChild(b);
      box.appendChild(row);
    });
  }
  function pickByName(rows, re) {
    var found = null;
    rows.forEach(function (r) { if (!found && re.test(r.name)) found = r; });
    return found;
  }
  function slotItem(r) {
    return r ? { name: r.name, price: r.price, sub: r.sub || '', meta: r.meta || {} } : null;
  }
  var BUILD_TPL = [
    { kind: 'fiber', title: 'Волокно 1530, 3 кВт — под ключ',
      hint: 'станок, стабилизатор 30 кВт, компрессор 16 бар, ФВУ, криоцилиндр',
      pick: function () {
        var o = {};
        o.machine = slotItem(pickByName(srcFiber(), /S 1530 3000 Вт/));
        o.stab = slotItem(pickByName(srcStab(), /АСН-30000\/3-ЭМ/));
        o.compressor = slotItem(pickByName(srcCompressor(), /ESC-20X/));
        o.extraction = slotItem(pickByName(srcExtraction(), /PA-6000CT/));
        o.cryo = slotItem(pickByName(srcCryo(), /DPL-210/));
        Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
        return o;
      } },
    { kind: 'fiber', title: 'Волокно 1530, 6 кВт с труборезом',
      hint: 'станок с rotary, стабилизатор 60 кВт под планку 50 кВт, компрессор 22 кВт',
      pick: function () {
        var o = {};
        o.machine = slotItem(pickByName(srcFiber(), /S 1530 6000 Вт/));
        o.stab = slotItem(pickByName(srcStab(), /АСН-60000\/3-ЭМ/));
        o.compressor = slotItem(pickByName(srcCompressor(), /ESC-30X/));
        o.extraction = slotItem(pickByName(srcExtraction(), /PA-6000CT/));
        Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
        return o;
      } },
    { kind: 'milling', title: 'Фрезер A1 1313 — рабочий минимум',
      hint: 'станок, стабилизатор, чиллер, датчик высоты, виброопоры',
      pick: function () {
        var o = {};
        o.machine = slotItem(pickByName(srcMill(), /A1 1313, 2\.2wc/));
        o.stab = slotItem(pickByName(srcStab(), /Ресанта-8000\/1-Ц|АСН-8000\/1-Ц/));
        o.chiller = slotItem(pickByName(srcChiller(), /CW-3000/));
        o.sensor = slotItem(pickByName(srcOptCat('Датчики высоты инструмента'), /нажимной/i));
        o.vibro = slotItem(pickByName(srcOptCat('Виброопоры'), /Виброопора/));
        o.pnr = slotItem(pickByName(srcPnrMill(), /работы и обучение — A1 \/ M1 1313/));
        Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
        return o;
      } },
    { kind: 'co2', title: 'CO₂ 1290 ST — витрина и реклама',
      hint: 'станок, чиллер CW-5200, стабилизатор, вытяжка',
      pick: function () {
        var o = {};
        o.machine = slotItem(pickByName(srcCo2(), /1290 ST/));
        o.chiller = slotItem(pickByName(srcChiller(), /CW-5200/));
        o.stab = slotItem(pickByName(srcStab(), /Ресанта-8000\/1-Ц|АСН-8000\/1-Ц/));
        o.extraction = slotItem(pickByName(srcExtraction(), /PA-6000CT/));
        Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
        return o;
      } },
    { kind: 'marker', title: 'Маркиратор FL TT 30 Вт — цех',
      hint: 'маркиратор, стабилизатор 220 В, поворотная ось',
      pick: function () {
        var o = {};
        o.machine = slotItem(pickByName(srcMarker(), /FL TT R30/));
        o.stab = slotItem(pickByName(srcStab(), /Ресанта-5000\/1-Ц|АСН-5000\/1-Ц/));
        o.rotary = slotItem(pickByName(srcRotary(), /кулачковое/));
        Object.keys(o).forEach(function (k) { if (!o[k]) delete o[k]; });
        return o;
      } }
  ];

  // ---- сохранённые сборки ----
  function renderSaved() {
    var box = fresh('buildSaved');
    var list = state.build.saved || [];
    if (!list.length) {
      box.appendChild(el('div', 'muted small', 'Сохранённых сборок пока нет.'));
      return;
    }
    list.forEach(function (rec, i) {
      var row = el('div', 'tplrow');
      var n = Object.keys(rec.slots || {}).length;
      row.innerHTML = '<div class="pn"><b>' + esc(rec.name) + '</b>' +
        '<span class="muted">' + esc(rec.kindTitle) + ' · ' +
        cnt(n, ['позиция', 'позиции', 'позиций']) + ' · ' + esc(rec.date) + '</span></div>' +
        '<div class="pp">' + fmtRub(rec.total || 0) + ' ₽</div>';
      var b = el('button', 'btn mini sec', 'Открыть');
      b.type = 'button';
      b.addEventListener('click', function () {
        state.build.kind = rec.kind;
        state.build.slots[rec.kind] = JSON.parse(JSON.stringify(rec.slots));
        save(); renderBuild(); renderTemplates();
        toast('Открыта сборка: ' + rec.name);
      });
      var x = el('button', 'btn mini danger', 'Удалить');
      x.type = 'button';
      x.addEventListener('click', function () {
        state.build.saved.splice(i, 1);
        save(); renderSaved();
      });
      row.appendChild(b); row.appendChild(x);
      box.appendChild(row);
    });
  }
  $('buildSave').addEventListener('click', function () {
    var name = ($('buildName').value || '').trim();
    if (!name) { toast('Впишите название сборки'); return; }
    var it = slotItems();
    if (!Object.keys(it).length) { toast('Слоты пусты — сохранять нечего'); return; }
    var T = buildTotals();
    var kindDef = BUILD_KINDS.filter(function (k) { return k.id === buildKind(); })[0];
    if (!state.build.saved) state.build.saved = [];
    state.build.saved.unshift({ name: name, kind: buildKind(),
      kindTitle: kindDef.title, slots: JSON.parse(JSON.stringify(it)),
      total: T.total, date: new Date().toLocaleDateString('ru-RU') });
    state.build.saved = state.build.saved.slice(0, 20);
    $('buildName').value = '';
    save(); renderSaved();
    toast('Сборка сохранена в этом браузере: ' + name);
  });

  $('buildToSmeta').addEventListener('click', function () {
    var T = buildTotals();
    if (!T.rows.length) { toast('Слоты пусты'); return; }
    var n = 0;
    T.rows.forEach(function (r) {
      var type = r.slot === 'pnr' ? 'srv' : (r.slot === 'machine' ? 'eq' : 'opt');
      if (r.slot === 'delivery') type = 'srv';
      addItem(r.item.name, r.item.price || 0, r.qty || 1, type);
      n++;
    });
    toast('Перенесено в смету: ' + cnt(n, ['позиция', 'позиции', 'позиций']));
    showTab('smeta');
  });
  $('buildCopy').addEventListener('click', function () {
    var ta = $('buildOut');
    if (!ta.value) { toast('Слоты пусты'); return; }
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () {
        toast('Комплект скопирован');
      }, function () { toast('Скопируйте текст вручную — поле выделено'); });
      return;
    }
    toast(ok ? 'Комплект скопирован' : 'Скопируйте текст вручную — поле выделено');
  });
  $('buildPrint').addEventListener('click', function () {
    var p = $('p-build');
    p.classList.add('printme');
    try { window.print(); } finally {
      setTimeout(function () { p.classList.remove('printme'); }, 300);
    }
  });
  $('buildReset').addEventListener('click', function () {
    if (!Object.keys(slotItems()).length) return;
    state.build.slots[buildKind()] = {};
    save(); renderBuild();
    toast('Слоты очищены');
  });
  $('buildReqOnly').addEventListener('change', function () {
    state.build.reqOnly = this.checked; save(); renderBuild();
  });
  (function () {
    var box = fresh('buildKinds');
    BUILD_KINDS.forEach(function (k) {
      var b = el('button', 'pill', esc(k.title));
      b.type = 'button';
      b.setAttribute('data-kind', k.id);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () {
        state.build.kind = k.id;
        save(); renderBuild(); renderTemplates();
      });
      box.appendChild(b);
    });
  }());
  if (state.build.reqOnly) $('buildReqOnly').checked = true;
  renderBuild();
  renderTemplates();
  renderSaved();

  renderStab();
  renderMgr();
  fillStabFull();
  fillAsp();
  fillCo2();
  // =====================================================================
  //                            КАЛЬКУЛЯТОРЫ
  // Четыре расчёта: НДС, лизинг с графиком, стоимость часа работы станка
  // и окупаемость. Все исходные цифры вводит менеджер — придуманных
  // констант здесь нет, пустое поле честно даёт пустой результат.
  // Деньги, как и везде в приложении, считаем в копейках.
  // =====================================================================
  var CALC_PARTS = [
    { id: 'nds', title: 'НДС' },
    { id: 'lease', title: 'Лизинг и график' },
    { id: 'cost', title: 'Час работы станка' },
    { id: 'roi', title: 'Окупаемость' }
  ];
  function calcPartIds() {
    return CALC_PARTS.map(function (c) { return c.id; });
  }
  function showCalcPart(part) {
    if (calcPartIds().indexOf(part) < 0) part = 'nds';
    state.calcPart = part;
    save();
    var box = d.getElementById('calcTabs');
    if (!box) return;
    var bs = box.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-sub') === part;
      bs[i].className = on ? 'pill on' : 'pill';
      bs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    CALC_PARTS.forEach(function (c) {
      var n = d.getElementById('c-' + c.id);
      if (n) n.classList.toggle('active', c.id === part);
    });
  }
  (function () {
    if (!d.getElementById('calcTabs')) return;
    var box = fresh('calcTabs');
    CALC_PARTS.forEach(function (c) {
      var b = el('button', 'pill', c.title);
      b.type = 'button';
      b.setAttribute('data-sub', c.id);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { showCalcPart(c.id); });
      box.appendChild(b);
    });
  }());

  // Число из поля: пробелы и запятая, пусто = 0
  function cnum(id) {
    var n = $(id);
    if (!n) return 0;
    var x = parseFloat(String(n.value || '').replace(/\s| /g, '').replace(',', '.'));
    return isFinite(x) ? x : 0;
  }
  function cfilled(id) {
    var n = $(id);
    return !!n && String(n.value || '').trim() !== '';
  }
  function calcBind(ids, fn) {
    ids.forEach(function (id) {
      var n = $(id);
      if (!n) return;
      n.addEventListener('input', fn);
      n.addEventListener('change', fn);
    });
  }
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('Скопировано'); },
        function () { toast('Скопировать не удалось'); });
      return;
    }
    toast('Буфер обмена недоступен');
  }
  function specRow(tb, label, value, cls) {
    var tr = d.createElement('tr');
    tr.innerHTML = '<td>' + esc(label) + '</td><td class="num' +
      (cls ? ' ' + cls : '') + '">' + value + '</td>';
    tb.appendChild(tr);
  }
  function totLine(box, k, v, cls) {
    var n = el('div', cls || '');
    n.innerHTML = '<span>' + esc(k) + '</span><span>' + v + '</span>';
    box.appendChild(n);
  }
  // Итог сметы берём из общего расчёта: одна цифра, один источник
  function smetaTotalCents() {
    try { return totals().itogo; } catch (e) { return 0; }
  }

  // ------------------------------ НДС ---------------------------------
  function ndsRate10() { return parseInt($('cnRate').value, 10) || 0; }
  function renderNds() {
    var cents = toCents(cnum('cnSum'));
    var rate = ndsRate10();
    var mode = $('cnMode').value;
    var bez, nalog, itog;
    if (mode === 'out') {                       // сумма без НДС — начисляем
      bez = cents;
      nalog = divHalfUp(cents * rate, 1000);
      itog = bez + nalog;
    } else {                                    // сумма с НДС — выделяем
      var r = ndsIznutri(cents, rate);
      bez = r.bez; nalog = r.nds; itog = cents;
    }
    var hero = fresh('cnHero');
    hero.innerHTML = '<div class="l">' +
      (mode === 'out' ? 'Сумма с НДС' : 'В том числе НДС') + '</div><div class="v">' +
      fmtRub(mode === 'out' ? itog : nalog) + ' ₽</div>' +
      '<div class="split"><div><div class="l">Без НДС</div><div class="s">' +
      fmtRub(bez) + ' ₽</div></div><div><div class="l">Ставка</div><div class="s">' +
      pctText(rate) + '</div></div></div>';
    var tb = fresh('cnBody');
    specRow(tb, 'Сумма без НДС', fmt(bez) + ' ₽');
    specRow(tb, 'НДС ' + pctText(rate), fmt(nalog) + ' ₽');
    specRow(tb, 'Сумма с НДС', fmt(itog) + ' ₽');
    $('ndsHint').textContent = mode === 'out'
      ? 'налог сверху' : 'налог внутри суммы';
    var w = fresh('cnWords');
    w.textContent = itog ? propisyu(itog) + ', в том числе НДС ' +
      pctText(rate) + ' — ' + fmt(nalog) + ' ₽' : 'Введите сумму';
    state.calc.nds = { sum: $('cnSum').value, rate: rate, mode: mode };
    save();
  }
  function ndsText() {
    var cents = toCents(cnum('cnSum')), rate = ndsRate10();
    var out = $('cnMode').value === 'out';
    var bez = out ? cents : ndsIznutri(cents, rate).bez;
    var nal = out ? divHalfUp(cents * rate, 1000) : ndsIznutri(cents, rate).nds;
    return ['Проверка НДС ' + pctText(rate),
      'Без НДС: ' + fmt(bez) + ' ₽',
      'НДС: ' + fmt(nal) + ' ₽',
      'С НДС: ' + fmt(bez + nal) + ' ₽',
      propisyu(bez + nal)].join('\n');
  }

  // ---------------------------- ЛИЗИНГ --------------------------------
  // Удорожание — надбавка к цене за год договора, а не банковская ставка.
  function leaseCalc() {
    var price = toCents(cnum('clPrice'));
    var advPct = cnum('clAdv');
    var months = Math.max(Math.round(cnum('clMonths')), 0);
    var up10 = Math.round(cnum('clUp') * 10);        // десятые доли процента
    var advance = divHalfUp(price * Math.round(advPct * 10), 1000);
    var fin = price - advance;                        // сумма финансирования
    var years10 = months * 10 / 12;                   // срок в годах × 10
    var over = months > 0
      ? divHalfUp(fin * Math.round(up10 * years10 / 10), 1000) : 0;
    var body = fin + over;
    var pay = months > 0 ? divHalfUp(body, months) : 0;
    var last = months > 0 ? body - pay * (months - 1) : 0;
    return { price: price, advance: advance, fin: fin, over: over, body: body,
      pay: pay, last: last, months: months, total: advance + body };
  }
  function renderLease() {
    var T = leaseCalc();
    var hero = fresh('clHero');
    hero.innerHTML = '<div class="l">Платёж в месяц</div><div class="v">' +
      fmtRub(T.pay) + ' ₽</div><div class="split">' +
      '<div><div class="l">Аванс сразу</div><div class="s">' + fmtRub(T.advance) +
      ' ₽</div></div><div><div class="l">Переплата</div><div class="s">' +
      fmtRub(T.over) + ' ₽</div></div></div>';
    var tot = fresh('clTotals');
    totLine(tot, 'Цена комплекта', fmt(T.price) + ' ₽');
    totLine(tot, 'Аванс', fmt(T.advance) + ' ₽');
    totLine(tot, 'Финансируется', fmt(T.fin) + ' ₽');
    totLine(tot, 'Удорожание за срок', fmt(T.over) + ' ₽', 'gain');
    totLine(tot, 'Всего с авансом', fmt(T.total) + ' ₽', 'big');
    var tb = fresh('clBody');
    var acc = T.advance;
    if (T.advance) {
      var tr0 = d.createElement('tr');
      tr0.innerHTML = '<td>Аванс</td><td class="num">' + fmt(T.advance) +
        ' ₽</td><td class="num">' + fmt(acc) + ' ₽</td>';
      tb.appendChild(tr0);
    }
    for (var i = 1; i <= T.months && i <= 120; i++) {
      var v = (i === T.months) ? T.last : T.pay;
      acc += v;
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + i + '-й месяц</td><td class="num">' + fmt(v) +
        ' ₽</td><td class="num">' + fmt(acc) + ' ₽</td>';
      tb.appendChild(tr);
    }
    $('clCnt').textContent = T.months
      ? cnt(T.months, ['платёж', 'платежа', 'платежей']) : 'срок не задан';
    state.calc.lease = { price: $('clPrice').value, adv: $('clAdv').value,
      months: $('clMonths').value, up: $('clUp').value };
    save();
  }
  function leaseText() {
    var T = leaseCalc();
    return ['Лизинг: ' + fmt(T.price) + ' ₽, аванс ' + fmt(T.advance) +
      ' ₽, срок ' + T.months + ' мес.',
      'Платёж в месяц: ' + fmt(T.pay) + ' ₽',
      'Удорожание за срок: ' + fmt(T.over) + ' ₽',
      'Всего с авансом: ' + fmt(T.total) + ' ₽',
      'Ориентир, точные условия — у лизингодателя.'].join('\n');
  }

  // --------------------- СТОИМОСТЬ ЧАСА РАБОТЫ -------------------------
  function costCalc() {
    var power = cnum('ccPower'), kwh = cnum('ccKwh');
    var elec = toCents(power * kwh);
    var gas = toCents(cnum('ccGas'));
    var nozzle = cnum('ccNozzleH') > 0
      ? divHalfUp(toCents(cnum('ccNozzle')), Math.round(cnum('ccNozzleH'))) : 0;
    var glass = cnum('ccGlassH') > 0
      ? divHalfUp(toCents(cnum('ccGlass')), Math.round(cnum('ccGlassH'))) : 0;
    var oper = cnum('ccHours') > 0
      ? divHalfUp(toCents(cnum('ccOper')), Math.round(cnum('ccHours'))) : 0;
    var amort = cnum('ccLife') > 0
      ? divHalfUp(toCents(cnum('ccPrice')), Math.round(cnum('ccLife'))) : 0;
    var other = toCents(cnum('ccOther'));
    var rows = [
      ['Электричество', elec, power && kwh
        ? power + ' кВт × ' + String(kwh).replace('.', ',') + ' ₽' : ''],
      ['Газ', gas, ''],
      ['Сопло', nozzle, cnum('ccNozzleH') ? 'на ' + cnum('ccNozzleH') + ' ч' : ''],
      ['Защитное стекло', glass, cnum('ccGlassH') ? 'на ' + cnum('ccGlassH') + ' ч' : ''],
      ['Оператор', oper, cnum('ccHours') ? cnum('ccHours') + ' ч в месяц' : ''],
      ['Амортизация', amort, cnum('ccLife') ? 'ресурс ' + cnum('ccLife') + ' ч' : ''],
      ['Прочее', other, '']
    ];
    var sum = 0;
    rows.forEach(function (r) { sum += r[1]; });
    // чего не хватает, чтобы расчёт был полным
    var missing = [];
    if (!power || !kwh) missing.push('потребление и тариф на электричество');
    if (!cfilled('ccGas')) missing.push('газ за час');
    if (!cnum('ccNozzleH') || !cnum('ccGlassH')) missing.push('ресурс расходников');
    if (!cnum('ccHours')) missing.push('часы работы оператора');
    if (!cnum('ccLife')) missing.push('срок службы станка в часах');
    return { rows: rows, sum: sum, missing: missing };
  }
  function renderCost() {
    var T = costCalc();
    var hero = fresh('ccHero');
    hero.innerHTML = '<div class="l">Себестоимость часа</div><div class="v">' +
      fmt(T.sum) + ' ₽</div><div class="split"><div><div class="l">За смену 8 ч' +
      '</div><div class="s">' + fmtRub(T.sum * 8) + ' ₽</div></div>' +
      '<div><div class="l">За месяц 160 ч</div><div class="s">' +
      fmtRub(T.sum * 160) + ' ₽</div></div></div>';
    var tb = fresh('ccBody');
    T.rows.forEach(function (r) {
      if (!r[1]) return;
      specRow(tb, r[0] + (r[2] ? ' — ' + r[2] : ''), fmt(r[1]) + ' ₽');
    });
    if (!T.sum) specRow(tb, 'Заполните поля слева', '—');
    var note = fresh('ccNote');
    note.textContent = T.missing.length
      ? 'Не хватает: ' + T.missing.join(', ') + '. Пока эти поля пусты, ' +
        'цифра занижена.'
      : APP.costNote;
    state.calc.cost = {};
    ['ccPower', 'ccKwh', 'ccGas', 'ccNozzle', 'ccNozzleH', 'ccGlass', 'ccGlassH',
      'ccOper', 'ccHours', 'ccPrice', 'ccLife', 'ccOther'].forEach(function (id) {
      state.calc.cost[id] = $(id).value;
    });
    save();
  }
  function costText() {
    var T = costCalc(), out = ['Себестоимость часа работы: ' + fmt(T.sum) + ' ₽'];
    T.rows.forEach(function (r) {
      if (r[1]) out.push(r[0] + ': ' + fmt(r[1]) + ' ₽/ч');
    });
    if (T.missing.length) out.push('Не учтено: ' + T.missing.join(', '));
    return out.join('\n');
  }

  // --------------------------- ОКУПАЕМОСТЬ -----------------------------
  function roiCalc() {
    var outsource = toCents(cnum('crOut'));       // платят подрядчику в месяц
    var hours = cnum('crHours');
    var own = toCents(cnum('crCost'));            // своя себестоимость часа
    var price = toCents(cnum('crPrice'));
    var sell = toCents(cnum('crSell'));           // продажа резки на сторону
    var ownMonth = own * Math.round(hours * 100) / 100;
    ownMonth = Math.round(ownMonth);
    var save = outsource - ownMonth;              // экономия в месяц
    var earn = sell ? Math.round((sell - own) * Math.round(hours * 100) / 100) : 0;
    var profit = save + earn;
    var months = profit > 0 ? Math.ceil(price / profit) : 0;
    // сколько часов в месяц нужно, чтобы выйти в ноль по цене подрядчика
    var perHour = hours > 0 ? divHalfUp(outsource, Math.round(hours)) : 0;
    var breakeven = (perHour > own && own >= 0 && price)
      ? Math.ceil(price / (perHour - own)) : 0;
    return { outsource: outsource, ownMonth: ownMonth, save: save, earn: earn,
      profit: profit, months: months, price: price, perHour: perHour,
      own: own, hours: hours, breakeven: breakeven };
  }
  function renderRoi() {
    var T = roiCalc();
    var hero = fresh('crHero');
    hero.innerHTML = '<div class="l">Окупится за</div><div class="v">' +
      (T.months ? T.months + ' ' + plural(T.months, ['месяц', 'месяца', 'месяцев'])
        : '—') + '</div><div class="split"><div><div class="l">Выгода в месяц' +
      '</div><div class="s">' + fmtRub(T.profit) + ' ₽</div></div>' +
      '<div><div class="l">За год</div><div class="s">' +
      fmtRub(T.profit * 12) + ' ₽</div></div></div>';
    var tot = fresh('crTotals');
    totLine(tot, 'Платите подрядчику', fmt(T.outsource) + ' ₽/мес');
    totLine(tot, 'Своя резка', fmt(T.ownMonth) + ' ₽/мес');
    totLine(tot, 'Экономия', fmt(T.save) + ' ₽/мес', 'gain');
    if (T.earn) totLine(tot, 'Заработок на заказах', fmt(T.earn) + ' ₽/мес', 'gain');
    totLine(tot, 'Цена комплекта', fmt(T.price) + ' ₽');
    totLine(tot, 'Срок окупаемости',
      (T.months ? T.months + ' ' + plural(T.months, ['месяц', 'месяца', 'месяцев'])
        : 'нет выгоды'), 'big');
    var st = fresh('crStory');
    if (T.hours && T.outsource) {
      st.appendChild(el('div', '', 'Час у подрядчика обходится в ' +
        fmt(T.perHour) + ' ₽ — это ' + fmt(T.outsource) + ' ₽ за ' +
        T.hours + ' ' + plural(Math.round(T.hours), ['час', 'часа', 'часов']) +
        ' в месяц.'));
      st.appendChild(el('div', '', 'Свой час стоит ' + fmt(T.own) +
        ' ₽ — разница ' + fmt(T.perHour - T.own) + ' ₽ на каждом часе.'));
      if (T.breakeven) {
        st.appendChild(el('div', '', 'Точка безубыточности: ' + T.breakeven +
          ' ' + plural(T.breakeven, ['час', 'часа', 'часов']) +
          ' резки — столько нужно наработать, чтобы вернуть вложения.'));
      }
    } else {
      st.appendChild(el('div', '', 'Заполните месячный счёт подрядчику, ' +
        'часы резки и свою себестоимость часа.'));
    }
    $('crNote').textContent = APP.roiNote;
    $('crMarket').textContent = APP.roiMarket;
    state.calc.roi = {};
    ['crOut', 'crHours', 'crCost', 'crPrice', 'crSell'].forEach(function (id) {
      state.calc.roi[id] = $(id).value;
    });
    save();
  }
  function roiText() {
    var T = roiCalc();
    return ['Окупаемость станка',
      'Сейчас на стороне: ' + fmt(T.outsource) + ' ₽/мес',
      'Своя резка: ' + fmt(T.ownMonth) + ' ₽/мес',
      'Выгода: ' + fmt(T.profit) + ' ₽/мес, за год ' + fmt(T.profit * 12) + ' ₽',
      'Цена комплекта: ' + fmt(T.price) + ' ₽',
      T.months ? 'Окупаемость: ' + T.months + ' ' +
        plural(T.months, ['месяц', 'месяца', 'месяцев']) : 'Выгоды нет'].join('\n');
  }

  // ------------------------- сборка раздела ----------------------------
  (function () {
    if (!d.getElementById('calcTabs')) return;
    // ставки НДС из данных: 22 % текущая, 20 % в старых счетах
    var rs = fresh('cnRate');
    APP.ndsRates.forEach(function (r) { opt(rs, String(r.v), r.label); });
    rs.value = String(state.calc.nds.rate || APP.ndsDefault * 10);
    $('cnSum').value = state.calc.nds.sum || '';
    $('cnMode').value = state.calc.nds.mode || 'in';
    calcBind(['cnSum', 'cnRate', 'cnMode'], renderNds);
    $('cnFromSmeta').addEventListener('click', function () {
      var c = smetaTotalCents();
      if (!c) { toast('Смета пуста'); return; }
      $('cnSum').value = fmt(c);
      $('cnMode').value = 'in';
      renderNds();
    });
    $('cnCopy').addEventListener('click', function () { copyText(ndsText()); });

    var L = APP.leasing;
    $('clPrice').value = state.calc.lease.price || '';
    $('clAdv').value = state.calc.lease.adv || String(L.advance_pct);
    $('clMonths').value = state.calc.lease.months || String(L.months);
    $('clUp').value = state.calc.lease.up || String(L.markup_year / 10).replace('.', ',');
    $('clNote').textContent = APP.leasingNote;
    $('clSrc').textContent = L.source;
    calcBind(['clPrice', 'clAdv', 'clMonths', 'clUp'], renderLease);
    $('clFromSmeta').addEventListener('click', function () {
      var c = smetaTotalCents();
      if (!c) { toast('Смета пуста'); return; }
      $('clPrice').value = fmt(c);
      renderLease();
    });
    $('clCopy').addEventListener('click', function () { copyText(leaseText()); });

    var costIds = ['ccPower', 'ccKwh', 'ccGas', 'ccNozzle', 'ccNozzleH', 'ccGlass',
      'ccGlassH', 'ccOper', 'ccHours', 'ccPrice', 'ccLife', 'ccOther'];
    costIds.forEach(function (id) {
      $(id).value = (state.calc.cost && state.calc.cost[id]) || '';
    });
    calcBind(costIds, renderCost);
    $('ccFromSmeta').addEventListener('click', function () {
      var c = smetaTotalCents();
      if (!c) { toast('Смета пуста'); return; }
      $('ccPrice').value = fmt(c);
      renderCost();
    });
    $('ccCopy').addEventListener('click', function () { copyText(costText()); });
    var help = fresh('ccHelp');
    APP.costFields.forEach(function (f) {
      var row = el('div', 'maprow');
      row.innerHTML = '<b>' + esc(f.label) + '</b><span class="muted">' +
        esc(f.hint) + '</span>';
      help.appendChild(row);
    });

    var roiIds = ['crOut', 'crHours', 'crCost', 'crPrice', 'crSell'];
    roiIds.forEach(function (id) {
      $(id).value = (state.calc.roi && state.calc.roi[id]) || '';
    });
    calcBind(roiIds, renderRoi);
    $('crFromCost').addEventListener('click', function () {
      var T = costCalc();
      if (!T.sum) { toast('Сначала посчитайте час работы'); return; }
      $('crCost').value = fmt(T.sum);
      renderRoi();
    });
    $('crFromSmeta').addEventListener('click', function () {
      var c = smetaTotalCents();
      if (!c) { toast('Смета пуста'); return; }
      $('crPrice').value = fmt(c);
      renderRoi();
    });
    $('crCopy').addEventListener('click', function () { copyText(roiText()); });

    renderNds();
    renderLease();
    renderCost();
    renderRoi();
    showCalcPart(state.calcPart || 'nds');
  }());

  // =====================================================================
  //                       ТРЕНАЖЁР ПО ТЕХНИЧКЕ
  // Вопросы не написаны руками, а собраны из тех же данных, что и весь
  // остальной интерфейс: таблицы толщин, газ по материалам, комплектация
  // под мощность, условия поставки и гарантии. Значит, при правке прайса
  // тренажёр обновляется сам и не начинает врать.
  // =====================================================================
  var quizState = null;                 // партия живёт до конца прогона

  function qShuffle(list) {             // перемешивание Фишера — Йетса
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // варианты ответа: правильный плюс отвлекающие, всё перемешано
  function qMake(question, right, wrong, why, part) {
    var opts = qShuffle([right].concat(wrong.slice(0, 3)));
    return { q: question, right: right, opts: opts, why: why, part: part };
  }
  function quizPool() {
    var out = [];
    var cut = APP.cutLimits || {};
    var powers = ['3000', '6000', '12000'];
    // 1. предельная толщина по материалу и мощности
    Object.keys(cut).forEach(function (mat) {
      cut[mat].forEach(function (row) {
        var kw = row[0] / 1000, mm = row[1];
        var all = [];
        Object.keys(cut).forEach(function (m2) {
          cut[m2].forEach(function (r2) { if (r2[1] !== mm) all.push(r2[1] + ' мм'); });
        });
        out.push(qMake('Предел по заводским таблицам: ' + mat.toLowerCase() +
          ' на источнике ' + kw + ' кВт — какая толщина?', mm + ' мм',
          qShuffle(all), 'Из таблицы предельных толщин. Клиенту называем ' +
          'рабочую толщину, а не предельную: у предела режет медленно и грязно.',
          'tech'));
      });
    });
    // 2. газ под материал
    var gas = APP.gasByMaterial || {};
    var gasVals = [];
    Object.keys(gas).forEach(function (m) {
      if (gasVals.indexOf(gas[m]) < 0) gasVals.push(gas[m]);
    });
    Object.keys(gas).forEach(function (mat) {
      out.push(qMake('Каким газом режут ' + mat.toLowerCase() + '?', gas[mat],
        gasVals.filter(function (v) { return v !== gas[mat]; })
          .concat(['Аргон 99,99 %', 'Сжатый воздух']),
        'Кислород даёт скорость по углеродистой стали, азот — чистый рез ' +
        'без окисла на нержавейке и алюминии.', 'gas'));
    });
    // 3. комплектация под мощность источника
    var kit = APP.fiberKit || {};
    powers.forEach(function (p) {
      if (!kit[p]) return;
      var others = [];
      powers.forEach(function (p2) {
        if (p2 !== p && kit[p2]) others.push(kit[p2].ctrl);
      });
      out.push(qMake('Какой контроллер идёт с источником ' + (p / 1000) +
        ' кВт?', kit[p].ctrl, others.concat(['BCS100', 'FSCUT2000']),
        'Контроллер и голова подбираются под мощность источника — это ' +
        'заводская комплектация, а не выбор менеджера.', 'tech'));
      var heads = [];
      powers.forEach(function (p2) {
        if (p2 !== p && kit[p2]) heads.push(kit[p2].head);
      });
      out.push(qMake('Какая голова ставится на источник ' + (p / 1000) +
        ' кВт?', kit[p].head, heads.concat(['BLT640', 'BLT210']),
        'Голова Boci подбирается под мощность: слабая на большой мощности ' +
        'сгорит, мощная на слабой — деньги на ветер.', 'tech'));
    });
    // 4. запас по мощности
    out.push(qMake('Какой запас по мощности требует завод при подборе?',
      APP.reservePct + ' %', ['10 %', '50 %', 'запас не нужен'],
      'Требование завода: считать мощность с запасом, иначе станок работает ' +
      'на пределе и ресурс источника падает.', 'match'));
    // 5. сроки поставки
    out.push(qMake('Срок поставки станка под заказ?', APP.deliveryOrder,
      [APP.deliveryStock, 'до 30 раб. дней', 'до 120 раб. дней'],
      'Под заказ — до 80 рабочих дней, из наличия — 1–3 дня. Это разные ' +
      'сроки и разные цены.', 'shop'));
    out.push(qMake('Срок поставки из наличия?', APP.deliveryStock,
      [APP.deliveryOrder, '7–10 раб. дней', 'в день оплаты'],
      'Из наличия отгружаем за 1–3 рабочих дня, но цена выше: наценка ' +
      'за склад.', 'shop'));
    // 6. гарантия
    out.push(qMake('Гарантия на станок?', APP.guarantee.label,
      ['6 месяцев', '24 месяца', '36 месяцев'],
      'Гарантия 12 месяцев, расходники под неё не попадают.', 'tech'));
    // 7. ставка НДС
    out.push(qMake('Какая ставка НДС в текущих счетах?',
      (APP.ndsDefault) + ' %', ['20 %', '18 %', '10 %'],
      'В счетах и ТКП сейчас 22 %. Ставка 20 % встречается в документах ' +
      'прошлых лет — при проверке старого счёта берите её.', 'data'));
    return out;
  }
  function quizPartTitle(id) {
    var t = id;
    GUIDE_PARTS.forEach(function (g) { if (g.id === id) t = g.title; });
    return t;
  }
  function quizRender() {
    var S = quizState;
    if (!S) return;
    $('quizStart').hidden = true;
    $('quizDone').hidden = true;
    $('quizPlay').hidden = false;
    var q = S.list[S.i];
    $('quizNum').textContent = 'Вопрос ' + (S.i + 1) + ' из ' + S.list.length;
    $('quizScore').textContent = 'верно ' + S.ok + ' из ' + S.i;
    $('quizBar').style.width = Math.round(S.i / S.list.length * 100) + '%';
    $('quizQ').textContent = q.q;
    var box = fresh('quizOpts');
    q.opts.forEach(function (o) {
      var b = el('button', 'quizopt', esc(o));
      b.type = 'button';
      b.addEventListener('click', function () { quizAnswer(o, b); });
      box.appendChild(b);
    });
    fresh('quizWhy');
    $('quizNext').hidden = true;
  }
  function quizAnswer(picked, btn) {
    var S = quizState, q = S.list[S.i];
    if (S.answered) return;
    S.answered = true;
    var right = picked === q.right;
    if (right) S.ok++;
    else S.errors.push({ q: q.q, right: q.right, picked: picked, why: q.why,
      part: q.part });
    var bs = $('quizOpts').querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      var t = bs[i].textContent;
      bs[i].disabled = true;
      if (t === q.right) bs[i].className = 'quizopt ok';
      else if (bs[i] === btn) bs[i].className = 'quizopt bad';
    }
    var why = fresh('quizWhy');
    why.appendChild(el('div', right ? 'note ok-note' : 'note alert',
      (right ? 'Верно. ' : 'Правильный ответ: ' + q.right + '. ') + q.why));
    var jump = el('button', 'btn mini sec', 'Открыть «' +
      quizPartTitle(q.part) + '»');
    jump.type = 'button';
    jump.addEventListener('click', function () { showGuidePart(q.part); });
    why.appendChild(jump);
    $('quizNext').hidden = false;
    $('quizScore').textContent = 'верно ' + S.ok + ' из ' + (S.i + 1);
  }
  function quizFinish() {
    var S = quizState;
    $('quizPlay').hidden = true;
    $('quizDone').hidden = false;
    var pct = Math.round(S.ok / S.list.length * 100);
    var mark = pct >= 90 ? 'отлично' : (pct >= 70 ? 'сойдёт' : 'надо подтянуть');
    var hero = fresh('quizHero');
    hero.innerHTML = '<div class="l">Результат</div><div class="v">' + pct +
      ' %</div><div class="split"><div><div class="l">Верно</div><div class="s">' +
      S.ok + ' из ' + S.list.length + '</div></div><div><div class="l">Оценка' +
      '</div><div class="s">' + mark + '</div></div></div>';
    var box = fresh('quizErrors');
    if (!S.errors.length) {
      box.appendChild(el('div', 'note ok-note', 'Ни одной ошибки.'));
    } else {
      box.appendChild(el('h3', '', 'Разбор ошибок'));
      S.errors.forEach(function (e) {
        var row = el('div', 'quizerr');
        row.innerHTML = '<b>' + esc(e.q) + '</b><div class="muted">Вы выбрали: ' +
          esc(e.picked) + ' · верно: ' + esc(e.right) + '</div><div>' +
          esc(e.why) + '</div>';
        box.appendChild(row);
      });
    }
    // лучший результат храним в черновике: видно прогресс
    var best = state.quiz && state.quiz.best;
    if (!best || pct > best.pct) {
      state.quiz = { best: { pct: pct, of: S.list.length,
        date: new Date().toISOString().slice(0, 10) } };
      save();
    }
    quizBest();
  }
  function quizBest() {
    var n = $('quizBest');
    if (!n) return;
    var b = state.quiz && state.quiz.best;
    n.textContent = b ? 'лучший результат ' + b.pct + ' % (' + b.of +
      ' вопросов, ' + ruDate(b.date) + ')' : 'прогонов ещё не было';
  }
  function quizStart(n) {
    var pool = quizPool();
    quizState = { list: qShuffle(pool).slice(0, Math.min(n, pool.length)),
      i: 0, ok: 0, errors: [], answered: false };
    quizRender();
  }
  function quizText() {
    var S = quizState;
    if (!S) return '';
    var pct = Math.round(S.ok / S.list.length * 100);
    var out = ['Тренажёр по техничке: ' + S.ok + ' из ' + S.list.length +
      ' (' + pct + ' %)'];
    S.errors.forEach(function (e) {
      out.push('Ошибка: ' + e.q + ' — верно: ' + e.right);
    });
    return out.join('\n');
  }
  (function () {
    if (!d.getElementById('quizStart')) return;
    $('quizGo10').addEventListener('click', function () { quizStart(10); });
    $('quizGo25').addEventListener('click', function () { quizStart(25); });
    $('quizNext').addEventListener('click', function () {
      var S = quizState;
      S.i++;
      S.answered = false;
      if (S.i >= S.list.length) quizFinish();
      else quizRender();
    });
    $('quizStop').addEventListener('click', function () {
      quizState = null;
      $('quizPlay').hidden = true;
      $('quizDone').hidden = true;
      $('quizStart').hidden = false;
    });
    $('quizAgain').addEventListener('click', function () {
      $('quizDone').hidden = true;
      $('quizStart').hidden = false;
    });
    $('quizCopy').addEventListener('click', function () { copyText(quizText()); });
    quizBest();
  }());

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
  var valid = SECTIONS.map(function (s) { return s.id; }).concat(guidePartIds());
  showTab(valid.indexOf(hash) >= 0 ? hash : 'cfg');
  fixNavOffset();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}());
