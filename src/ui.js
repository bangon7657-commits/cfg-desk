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
    mode: 'order', cat: 'fiber', mtCat: 'fiber'
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
  var tabs = $('tabs').querySelectorAll('button');
  function showTab(name) {
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected',
        tabs[i].getAttribute('data-t') === name ? 'true' : 'false');
    }
    var panels = d.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('active', panels[j].id === 'p-' + name);
    }
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
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
  function applyDemo(on) {
    state.demo = on;
    $('demoMode').checked = on;
    d.body.classList.toggle('demo', on);
    save(); renderMill();
  }
  $('demoMode').addEventListener('change', function () { applyDemo(this.checked); });
  $('demoOff').addEventListener('click', function () { applyDemo(false); });
  applyDemo(!!state.demo);

  // ------------------------------------------------------------------ тост
  var toastTimer = null;
  function toast(text) {
    $('toastText').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 4000);
  }
  $('toastGo').addEventListener('click', function () {
    $('toast').classList.remove('show');
    showTab('smeta');
  });

  // ------------------------------------------------------------------ волокно
  var fiberIdx = {}, fiberAIdx = {};
  APP.fiberS.forEach(function (r) {
    fiberIdx[r.format] = fiberIdx[r.format] || {};
    fiberIdx[r.format][r.power] = r;
  });
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
      return { name: 'Wattsan A ' + f + ' ' + p + 'W', price: price, steps: [] };
    }
    var r = fiberIdx[f] && fiberIdx[f][p];
    if (!r) return { err: 'Цены на эту конфигурацию в прайсе нет.' };
    var name = 'Wattsan S ' + f + ' ' + p + 'W', price, steps = [];
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
    return { name: name, price: price, steps: steps };
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
      'Стабилизатор 30 000 или 50 000 Вт — отдельная статья и условие гарантии.'));
  }

  $('fSeries').addEventListener('change', fillFiberFormats);
  $('fFormat').addEventListener('change', fillFiberPowers);
  ['fPower', 'fTable', 'fRot'].forEach(function (id) {
    $(id).addEventListener('change', renderFiber);
  });
  $('fAdd').addEventListener('click', function () {
    var p = fiberPick();
    if (p.err) return;
    addItem(p.name, p.price, 1, 'eq');
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
    addItem(r.name + (mode === 'stock' ? ' (из наличия)' : ' (под заказ)'),
      mode === 'stock' ? r.stock : r.order, 1, 'eq');
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
          addItem(o.name, o.price, Math.max(1, parseInt(qty.value, 10) || 1), 'opt');
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
    var labels = { pnr: 'ПНР', plus1: 'ПНР +1 день', plus2: 'ПНР +2 дня',
      training: 'Обучение', package: 'ПНР + обучение' };
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
    st.appendChild(el('div', '', 'Минимальный выезд за день — 22 000 ₽, ' +
      'штраф за ложный выезд 19 000 ₽'));
    out.appendChild(st);
  }
  ['pnrModel', 'pnrKind', 'thirdParty'].forEach(function (id) {
    $(id).addEventListener('change', renderPnr);
  });
  $('pnrAdd').addEventListener('click', function () {
    var p = pnrPick(); if (p.price === null) return;
    addItem(p.name, p.price, 1, 'srv');
  });

  function switchCat() {
    var c = $('cat').value;
    state.cat = c;
    $('blkFiber').style.display = c === 'fiber' ? '' : 'none';
    $('blkMill').style.display = c === 'milling' ? '' : 'none';
    save();
  }
  $('cat').addEventListener('change', switchCat);

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
  // Срок поставки в ТКП: под заказ или из наличия. Формулировки — из данных.
  if (state.kp.kpTerm) $('kpTerm').value = state.kp.kpTerm;
  $('kpTerm').addEventListener('change', function () {
    state.kp.kpTerm = this.value; save(); renderKP();
  });
  if (!state.kp.kpDate) {
    var now = new Date();
    var dt = ('0' + now.getDate()).slice(-2) + '.' + ('0' + (now.getMonth() + 1)).slice(-2) +
      '.' + now.getFullYear();
    $('kpDate').value = dt; state.kp.kpDate = dt;
  }

  var TYPES = { eq: 'Оборудование', opt: 'Опция', srv: 'Услуга' };
  var TYPE_ORDER = { eq: 0, opt: 1, srv: 2 };

  function addItem(name, priceRub, qty, type) {
    var cents = toCents(priceRub);
    var found = null;
    state.items.forEach(function (it) {
      if (it.name === name && it.price === cents) found = it;
    });
    if (found) {
      found.qty = Math.min(99, found.qty + qty);
      toast('Уже было в смете — количество стало ' + found.qty);
    } else {
      state.items.push({ name: name, price: cents, qty: qty, type: type || 'eq', disc: null });
      toast('Добавлено: ' + (name.length > 42 ? name.slice(0, 42) + '…' : name));
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

  function renderSmeta() {
    var body = $('smetaBody'); clear(body);
    var T = totals();
    var has = state.items.length > 0;
    $('smetaEmpty').style.display = has ? 'none' : '';
    $('smetaWrap').style.display = has ? '' : 'none';
    $('smetaBadge').textContent = has ? String(state.items.length) : '';

    T.lines.forEach(function (L, i) {
      var tr = d.createElement('tr');
      tr.className = 'item';
      var nameCell = '<b style="color:var(--tx);font-weight:600">' + esc(L.item.name) +
        '</b><br><span class="muted">' + (TYPES[L.item.type] || '') +
        (L.item.disc !== null && L.item.disc !== undefined ? ' · своя скидка' : '') + '</span>';
      tr.innerHTML = '<td>' + nameCell + '</td>' +
        '<td><input type="number" min="1" max="99" value="' + L.item.qty + '" aria-label="количество"></td>' +
        '<td>' + fmt(L.item.price) + '</td>' +
        '<td><input type="number" min="0" max="' + APP.maxDiscount +
        '" step="0.5" value="' +
        String(L.dsc / 10).replace('.', ',') + '" aria-label="скидка"></td>' +
        '<td>' + fmt(L.unit) + '</td>' +
        '<td><b>' + fmt(L.line) + '</b></td>' +
        '<td class="noprint"><button class="btn mini danger" type="button">Убрать</button></td>';
      var inputs = tr.querySelectorAll('input');
      inputs[0].addEventListener('change', function () {
        L.item.qty = Math.max(1, Math.min(99, parseInt(this.value, 10) || 1));
        save(); renderSmeta();
      });
      inputs[1].addEventListener('change', function () {
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
    row('Сумма по прайсу', fmt(T.listSum) + ' ₽');
    row('Ваша выгода — скидка ' + pctText(T.gDisc), '−' + fmt(T.gain) + ' ₽', 'gain');
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
    var reSum = 0;
    T.lines.forEach(function (L) { reSum += soSkidkoy(L.item.price, L.dsc) * L.item.qty; });
    if (reSum !== T.total) {
      problems.push('Пересчёт построчно даёт ' + fmt(reSum) + ' ₽ против ' + fmt(T.total) + ' ₽');
    }
    if (T.listSum - T.gain !== T.total) {
      problems.push('Прайс − выгода = ' + fmt(T.listSum - T.gain) + ' ₽ против ИТОГО ' +
        fmt(T.total) + ' ₽');
    }
    if (problems.length) {
      cb.className = 'check fail';
      cb.innerHTML = '<b>Сходимость нарушена — КП не выпускать.</b><ul>' +
        problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    } else {
      cb.className = 'check good';
      cb.innerHTML = '<b>Сходимость проверена.</b> Плашка-резюме, смета и сумма прописью ' +
        'считаются от одного числа: ' + fmt(T.total) + ' ₽. Без НДС + НДС = ИТОГО, ' +
        'построчный пересчёт совпадает, прайс минус выгода совпадает.';
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
    var first = state.items.length ? state.items[0].name : '';
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
      (k.kpNote ? ' - ' + esc(k.kpNote) : '') + '</div>' +
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
      esc(first || '—') + '</div></div>' +
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
      pctText(T.rate) + ' — ' + esc(propisyu(T.nds)) +
      '. Доставка в стоимость не включена. Счёт фиксирует цену и наличие на ' +
      APP.invoiceValidDays + ' дней.'));
  }

  $('btnPrint').addEventListener('click', function () {
    var p = $('p-smeta');
    p.classList.add('printme');
    window.print();
    setTimeout(function () { p.classList.remove('printme'); }, 400);
  });

  // ------------------------------------------------- выгрузка ТКП в файл
  // Word открывает HTML-документ как обычный .doc и сохраняет таблицы,
  // заливки и логотип. Но flex и grid он не понимает, поэтому блоки-сетки
  // пересобираются в таблицы. Файл автономный: логотип уже data-URL,
  // внешних ссылок нет — открывается офлайн и в Word, и в Google Docs.
  // Стили — только inline и атрибутом bgcolor: и Word, и LibreOffice, и
  // Google Документы применяют их гарантированно, тогда как классы из <style>
  // теряются (проверено рендером в LibreOffice — заливки пропадали).
  var NAVY = '#1F3A5F', LIGHT = '#DCE8F4', PALE = '#EAF1F8', GREY = '#5A6572';
  var BRD = 'border:1px solid #B7C9DC;';
  var CELL = BRD + 'padding:3px 6px;vertical-align:top;font-family:Calibri,sans-serif;' +
    'font-size:8.5pt;line-height:1.25;color:#202020;';
  var HEADCELL = CELL + 'background:' + LIGHT + ';color:' + NAVY + ';font-weight:bold;';
  var NUM = 'text-align:right;';
  var MID = 'text-align:center;';

  function td(html, style, attrs) {
    return '<td style="' + CELL + (style || '') + '"' + (attrs || '') + '>' + html + '</td>';
  }

  function band(html, bg, style) {
    // плашка на всю ширину: таблица из одной ячейки — так заливка не теряется.
    // page-break-inside:avoid — иначе плашка рвётся между страницами и наверху
    // следующей остаётся пустая синяя полоса.
    return '<table width="100%" cellspacing="0" cellpadding="0" border="0" ' +
      'style="page-break-inside:avoid"><tr>' +
      '<td bgcolor="' + bg + '" style="padding:6px 9px;font-family:Calibri,sans-serif;' +
      'page-break-inside:avoid;' + (style || '') + '">' + html + '</td></tr></table>';
  }

  function sectionBand(t) {
    return '<p style="margin:14px 0 7px;page-break-after:avoid">' +
      band(t, NAVY, 'color:#FFFFFF;font-weight:bold;font-size:10.5pt') + '</p>';
  }

  function rowsFromTable(node) {
    // таблицу условий / гарантии пересобираем с inline-стилями
    if (!node) return '';
    var out = Array.prototype.map.call(node.querySelectorAll('tr'), function (tr) {
      var h = tr.querySelector('th'), c = tr.querySelector('td');
      return '<tr>' + td(esc(h ? h.textContent : ''),
        'background:' + LIGHT + ';color:' + NAVY + ';font-weight:bold;width:29%') +
        td(esc(c ? c.textContent : '')) + '</tr>';
    }).join('');
    return '<table width="100%" cellspacing="0" cellpadding="0">' + out + '</table>';
  }

  function buildWordDoc() {
    var T = totals(), k = state.kp;
    var first = state.items.length ? state.items[0].name : '';
    var title = k.kpTitle || first || 'Оборудование с ЧПУ LASERCUT';
    var logo = d.querySelector('#kpDoc img.kp-logo');
    var contacts = d.querySelector('#kpDoc .kp-contacts');
    var kpTables = d.querySelectorAll('#kpDoc table.kp-t');
    var cta = d.querySelector('#kpDoc .kp-cta');
    var legal = d.querySelector('#kpDoc .kp-legal');

    var head = '<table width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
      '<td width="45%" style="vertical-align:top"><img src="' +
      (logo ? logo.getAttribute('src') : '') +
      '" width="200" height="47" alt="LASERCUT"></td>' +
      '<td style="text-align:right;vertical-align:top;font-family:Calibri,sans-serif;' +
      'font-size:8pt;color:' + GREY + '">' + (contacts ? contacts.innerHTML : '') +
      '</td></tr></table>';

    var titleBand = '<p style="margin:10px 0 10px">' + band(
      '<div style="font-size:14pt;font-weight:bold;text-align:center;color:#FFFFFF">' +
      'ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div>' +
      '<div style="font-size:10pt;text-align:center;color:' + LIGHT + '">' +
      esc(title) + '</div>', NAVY, 'padding:9px 12px') + '</p>';

    var line = '<span style="border-bottom:1px solid #8A99A8">' +
      '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>';
    var to = '<table width="100%" cellspacing="0" cellpadding="0">' +
      '<tr>' + td('Кому: <b>' + (k.kpClient ? esc(k.kpClient) : line) + '</b> ИНН ' +
        (k.kpInn ? esc(k.kpInn) : line) + (k.kpNote ? ' - ' + esc(k.kpNote) : ''),
        'width:62%') +
      td('Исх. № <b>' + (k.kpNum ? esc(k.kpNum) : line) + '</b>') + '</tr>' +
      '<tr>' + td('Контакты: <b>' + (k.kpContact ? esc(k.kpContact) : line) + '</b>' +
        (k.kpPhone ? ', тел. ' + esc(k.kpPhone) : '')) +
      td(esc(dateLong(k.kpDate))) + '</tr></table>';

    var lead = '<p style="font-family:Calibri,sans-serif;font-size:9.5pt;text-align:justify">' +
      'Благодарим за интерес к оборудованию LASERCUT. Ниже — состав поставки, ' +
      'стоимость и условия. Оборудование новое, не бывшее в эксплуатации, ' +
      'соответствует требованиям ТР ТС 004/2011, 010/2011, 020/2011.</p>';

    function sumCell(kk, vv) {
      return '<td bgcolor="' + NAVY + '" width="25%" style="border:1px solid #2E5B94;' +
        'padding:6px 9px;font-family:Calibri,sans-serif;vertical-align:top">' +
        '<div style="font-size:7.5pt;color:#B9CBE0">' + kk + '</div>' +
        '<div style="font-size:11pt;font-weight:bold;color:#FFFFFF">' + vv + '</div></td>';
    }
    var sum = '<table width="100%" cellspacing="0" cellpadding="0"><tr>' +
      sumCell('Рекомендуем', esc(first || '—')) +
      sumCell('Стоимость, с НДС ' + pctText(T.rate), fmt(T.total) + ' ₽') +
      sumCell('Срок поставки', esc(termLabel())) +
      sumCell('Гарантия', esc(APP.guarantee.label)) + '</tr></table>';

    var smeta = '';
    if (state.items.length) {
      var rows = T.lines.map(function (L, i) {
        return '<tr>' + td(String(i + 1), MID + 'color:' + GREY) +
          td('<b style="color:' + NAVY + '">' + esc(L.item.name) + '</b>' +
            (L.dsc ? '<br><span style="font-size:7.5pt;color:' + GREY + '">скидка ' +
              pctText(L.dsc) + ' от цены прайса ' + fmt(L.item.price) + ' ₽</span>' : '')) +
          td(L.item.qty + ' шт', MID) + td(fmt(L.unit), NUM) +
          td('<b>' + fmt(L.line) + '</b>', NUM) + '</tr>';
      }).join('');
      var totStyle = 'background:' + PALE + ';color:' + NAVY + ';font-weight:bold;' + NUM;
      var tot = '';
      if (T.gain) {
        tot += '<tr>' + td('Ваша выгода:', totStyle, ' colspan="4"') +
          td(fmt(T.gain), totStyle) + '</tr>';
      }
      tot += '<tr>' + td('Итого без НДС:', totStyle, ' colspan="4"') +
        td(fmt(T.bez), totStyle) + '</tr>' +
        '<tr>' + td('в т. ч. НДС ' + pctText(T.rate) + ':', totStyle, ' colspan="4"') +
        td(fmt(T.nds), totStyle) + '</tr>';
      var finStyle = 'background:' + NAVY + ';color:#FFFFFF;font-weight:bold;' + NUM;
      tot += '<tr>' + td('ИТОГО к оплате (с НДС ' + pctText(T.rate) + '):',
        finStyle, ' colspan="4" bgcolor="' + NAVY + '"') +
        td(fmt(T.total) + ' ₽', finStyle, ' bgcolor="' + NAVY + '"') + '</tr>';
      smeta = '<table width="100%" cellspacing="0" cellpadding="0"><tr>' +
        '<th style="' + HEADCELL + MID + 'width:6%">№</th>' +
        '<th style="' + HEADCELL + 'text-align:left">Наименование</th>' +
        '<th style="' + HEADCELL + MID + 'width:9%">Кол-во</th>' +
        '<th style="' + HEADCELL + NUM + 'width:17%">Цена за ед., с НДС ₽</th>' +
        '<th style="' + HEADCELL + NUM + 'width:17%">Сумма, с НДС ₽</th></tr>' +
        rows + tot + '</table>' +
        '<p style="font-family:Calibri,sans-serif;font-size:8.5pt;text-align:justify">' +
        '<b style="color:' + NAVY + '">Сумма прописью:</b> ' + esc(propisyu(T.total)) +
        ', в том числе НДС ' + pctText(T.rate) + ' — ' + esc(propisyu(T.nds)) +
        '. Доставка в стоимость не включена. Счёт фиксирует цену и наличие на ' +
        APP.invoiceValidDays + ' дней.</p>';
    } else {
      smeta = '<p style="font-family:Calibri,sans-serif;font-size:9pt;color:' + GREY +
        '">Смета пуста: позиции добавляются на вкладке «Конфигуратор».</p>';
    }

    var capStyle = 'font-size:7.5pt;color:' + GREY;
    // Линия под подпись — нижняя граница ячейки фиксированной высоты:
    // border-bottom у div внутри ячейки LibreOffice печатает обрезанным.
    var sign = '<table width="100%" cellspacing="0" cellpadding="0" border="0" ' +
      'style="page-break-inside:avoid;margin-top:16px">' +
      '<tr><td width="48%" style="font-family:Calibri,sans-serif;font-size:9pt;' +
      'vertical-align:top">С уважением,<br><b>' + esc(APP.company.ceoTitle) + '</b></td>' +
      '<td width="4%"></td><td width="48%"></td></tr>' +
      '<tr><td height="46" style="border-bottom:1px solid ' + GREY + '">&nbsp;</td>' +
      '<td></td><td height="46" style="border-bottom:1px solid ' + GREY +
      '">&nbsp;</td></tr>' +
      '<tr><td style="font-family:Calibri,sans-serif;' + capStyle + '"><b>' +
      esc(APP.company.ceoShort) + '</b> · подпись / Ф.И.О.</td><td></td>' +
      '<td style="font-family:Calibri,sans-serif;' + capStyle + '">М.П.</td></tr></table>';

    var mgr = '<p style="margin:14px 0 0">' + band(
      '<div style="' + capStyle + '">Ваш менеджер</div>' +
      '<div style="font-size:9.5pt"><b style="color:' + NAVY + '">' +
      esc(APP.manager.name) + '</b> · ' + esc(APP.manager.role) + '<br>' +
      esc(APP.manager.phone) + ' · ' + esc(APP.manager.email) + ' · ' +
      esc(APP.manager.sites) + '</div>', PALE, 'color:#202020') + '</p>';

    var ctaBlock = '';
    if (cta) {
      ctaBlock = '<p style="margin:14px 0 0">' + band(
        '<div style="font-size:12pt;font-weight:bold;color:#FFFFFF">' +
        esc(cta.querySelector('b').textContent) + '</div>' +
        '<div style="font-size:8.5pt;color:' + LIGHT + '">' +
        esc(cta.querySelector('span').textContent) + '</div>', NAVY) + '</p>';
    }

    var legalBlock = '';
    if (legal) {
      var parts = Array.prototype.map.call(legal.querySelectorAll('span'), function (s) {
        return esc(s.textContent);
      }).join('<br>');
      legalBlock = '<p style="margin:14px 0 0;border-top:1px solid #B7C9DC;padding-top:6px;' +
        'font-family:Calibri,sans-serif;font-size:7.5pt;color:' + GREY + '">' +
        '<b style="color:' + NAVY + ';font-size:8pt">' +
        esc(legal.querySelector('b').textContent) + '</b><br>' + parts + '</p>';
    }

    var gap = '<p style="margin:0;font-size:6pt">&nbsp;</p>';
    var body = head + titleBand + to + lead + gap + sum + gap +
      sectionBand('1.&nbsp; Смета поставки') + smeta + gap +
      sectionBand('2.&nbsp; Условия поставки') + rowsFromTable(kpTables[0]) + gap +
      sectionBand('3.&nbsp; Гарантия и сервис') + rowsFromTable(kpTables[1]) +
      ctaBlock + gap + sign + gap + mgr + legalBlock;

    // Поля 1,27 см: Word берёт их из mso-разметки, LibreOffice — из @page
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word"><head>' +
      '<meta charset="utf-8"><title>ТКП LASERCUT</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>' +
      '</w:WordDocument></xml><![endif]-->' +
      '<style>@page{size:21cm 29.7cm;margin:1.27cm;mso-page-orientation:portrait}' +
      'body{font-family:Calibri,sans-serif;font-size:9.5pt;color:#202020;margin:0}' +
      'table{border-collapse:collapse}</style>' +
      '</head><body>' + body + '</body></html>';
  }

  function kpFileName(ext) {
    var k = state.kp;
    var who = (k.kpClient || 'клиент').replace(/[\\/:*?"<>|]/g, ' ').trim();
    var num = k.kpNum ? ' № ' + k.kpNum : '';
    return 'ТКП ' + who + num + ' от ' + (k.kpDate || '') + '.' + ext;
  }

  function kpBlob() {
    // BOM в начале — Word без него иногда читает файл как ANSI и ломает кириллицу
    return new Blob(['﻿' + buildWordDoc()],
      { type: 'application/msword;charset=utf-8' });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = d.createElement('a');
    a.href = url; a.download = name;
    d.body.appendChild(a); a.click(); d.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  $('btnWord').addEventListener('click', function () {
    if (!state.items.length && !confirm('Смета пуста. Всё равно скачать файл?')) return;
    downloadBlob(kpBlob(), kpFileName('doc'));
    toast('Файл скачан — открывается в Word');
  });

  $('btnSend').addEventListener('click', function () {
    var name = kpFileName('doc');
    var blob = kpBlob();
    var f = null;
    try { f = new File([blob], name, { type: blob.type }); } catch (e) { f = null; }
    if (f && navigator.canShare && navigator.canShare({ files: [f] }) && navigator.share) {
      navigator.share({ files: [f], title: 'ТКП LASERCUT' }).then(function () {
        toast('Файл передан');
      }, function () { /* пользователь отменил — молчим */ });
      return;
    }
    downloadBlob(blob, name);
    toast('Отправка файлом недоступна в этом браузере — файл скачан');
  });

  $('btnJson').addEventListener('click', function () {
    var T = totals(), k = state.kp;
    var dp = (k.kpDate || '').split('.');
    var payload = {
      'КЛИЕНТ': k.kpClient || '', 'ИНН': k.kpInn || '',
      'ПРИМЕЧАНИЕ': k.kpNote ? ' - ' + k.kpNote : '',
      'ИСХ_НОМЕР': k.kpNum || '',
      'КОНТАКТ_ИМЯ': k.kpContact || APP.manager.name,
      'КОНТАКТ_ТЕЛЕФОН': k.kpPhone || APP.manager.phone,
      'ДД': dp[0] || '', 'МЕСЯЦА': MONTHS_G[(parseInt(dp[1], 10) || 1) - 1], 'ГГГГ': dp[2] || '',
      'менеджер': APP.manager,
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
        'Под эту толщину с обязательным запасом 30 % в заведённых мощностях решения нет. ' +
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
        (r.power === 3000 ? ' — либо серия A, она только в 3 кВт' : '') + '</div>' +
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
    { task: 'Крупная 3D-обработка', series: ['M2'],
      answer: 'Wattsan M2 — серия под крупную 3D-обработку' },
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
  $('priceMode').value = state.mode || 'order';
  $('cat').value = state.cat || 'fiber';
  switchCat();
  renderMill();
  renderPnr();
  sortItems();
  renderSmeta();
  renderMatch();
  $('mtCat').value = state.mtCat || 'fiber';
  switchMtCat();
  fillMkSize();
  renderReady();
  renderGas();
  var hash = (location.hash || '').replace('#', '');
  var valid = ['cfg', 'smeta', 'match', 'shop', 'gas', 'data'];
  showTab(valid.indexOf(hash) >= 0 ? hash : 'cfg');
  fixNavOffset();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}());
