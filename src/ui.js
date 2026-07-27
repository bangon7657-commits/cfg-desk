/* Интерфейс. Все деньги — через money.js, в копейках. Ни одного числа «на глаз». */
(function () {
  'use strict';
  var LS = 'cfg-state-v1';
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

  d.body.classList.add('js');

  // ------------------------------------------------------------------ состояние
  var state = {
    items: [],
    kp: {}, disc: 0, nds: 220, demo: false,
    ready: {}, gas: { nozzle: 2, gas: 'n2', hours: 80, price: '' },
    mode: 'order'
  };
  try {
    var raw = localStorage.getItem(LS);
    if (raw) {
      var s = JSON.parse(raw);
      for (var k in s) if (s.hasOwnProperty(k)) state[k] = s[k];
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
      var on = tabs[i].getAttribute('data-t') === name;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    var panels = d.querySelectorAll('.panel');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('active', panels[j].id === 'p-' + name);
    }
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function () { showTab(this.getAttribute('data-t')); });
  }

  // ------------------------------------------------------------------ демо-режим
  $('demoMode').checked = !!state.demo;
  d.body.classList.toggle('demo', !!state.demo);
  $('demoMode').addEventListener('change', function () {
    state.demo = this.checked;
    d.body.classList.toggle('demo', this.checked);
    save(); renderMill();
  });

  // ------------------------------------------------------------------ волокно
  var fiberIdx = {};
  APP.fiberS.forEach(function (r) {
    fiberIdx[r.format] = fiberIdx[r.format] || {};
    fiberIdx[r.format][r.power] = r;
  });
  var fiberAIdx = {};
  APP.fiberA.forEach(function (r) {
    fiberAIdx[r.format] = fiberAIdx[r.format] || {};
    fiberAIdx[r.format][r.power] = r.price;
  });

  opt($('fSeries'), 'S', 'S — лист и трубы');
  opt($('fSeries'), 'A', 'A — компактная, 3–4 мм в 24/7');

  function fillFiberFormats() {
    var series = $('fSeries').value;
    var sel = $('fFormat'); var prev = sel.value; clear(sel);
    var src = series === 'A' ? fiberAIdx : fiberIdx;
    APP.fiberOrder.forEach(function (f) {
      if (src[f]) opt(sel, f, f + ' — ' + APP.fiberFormats[f] + ' мм');
    });
    if (prev && src[prev]) sel.value = prev;
    fillFiberPowers();
  }
  function fillFiberPowers() {
    var series = $('fSeries').value, f = $('fFormat').value;
    var sel = $('fPower'); var prev = sel.value; clear(sel);
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
      if (tbl || rot) return { err: 'По серии A сменного стола и RD-модуля в прайсе нет — только серия S.' };
      var price = fiberAIdx[f] && fiberAIdx[f][p];
      if (!price) return { err: 'Цены на эту конфигурацию в прайсе нет.' };
      return { name: 'Wattsan A ' + f + ' ' + p + 'W', price: price, base: price, steps: [] };
    }
    var r = fiberIdx[f] && fiberIdx[f][p];
    if (!r) return { err: 'Цены на эту конфигурацию в прайсе нет.' };
    var name = 'Wattsan S ' + f + ' ' + p + 'W', price, steps = [];
    if (!tbl && !rot) { price = r.base; }
    else if (tbl && !rot) { price = r.table; name += ' + сменный стол'; }
    else if (!tbl && rot) { price = r.rot[rot]; name += ' + rotary ' + rot; }
    else { price = r.tableRot[rot]; name += ' + сменный стол + rotary ' + rot; }
    steps.push(['База ' + f + ' ' + p + 'W', r.base]);
    if (tbl && !rot) steps.push(['Доплата за сменный стол', r.table - r.base]);
    if (!tbl && rot) steps.push(['Доплата за rotary ' + rot, r.rot[rot] - r.base]);
    if (tbl && rot) {
      steps.push(['Доплата за сменный стол', r.table - r.base]);
      steps.push(['Доплата за rotary ' + rot, r.rot[rot] - r.base]);
      var sep = r.table + (r.rot[rot] - r.base);
      var gain = sep - price;
      steps.push(['По отдельности вышло бы', sep]);
      steps.push(['Пакетная выгода (стол и ось вместе)', -gain]);
    }
    return { name: name, price: price, base: r.base, steps: steps };
  }

  function renderFiber() {
    var out = $('fOut'); clear(out);
    var pick = fiberPick();
    if (pick.err) {
      out.appendChild(el('div', 'note stop', esc(pick.err)));
      return;
    }
    var box = el('div', 'pricebox');
    var a = el('div', 'pb');
    a.innerHTML = '<div class="lbl">Цена, НДС включён</div><div class="val">' +
      fmtRub(toCents(pick.price)) + ' ₽</div>' +
      '<div class="sub">' + esc(pick.name) + '</div>';
    box.appendChild(a);
    var b = el('div', 'pb stock');
    b.innerHTML = '<div class="lbl">Второй ценник</div>' +
      '<div class="val" style="font-size:17px">нет в прайсе</div>' +
      '<div class="sub">По волокну в прайсе одна цена. Наценку за наличие не выдумываем.</div>';
    box.appendChild(b);
    out.appendChild(box);
    if (pick.steps.length) {
      var st = el('div', 'calcsteps');
      pick.steps.forEach(function (s) {
        st.appendChild(el('div', '', esc(s[0]) + ': <b>' +
          (s[1] < 0 ? '−' : '') + fmtRub(toCents(Math.abs(s[1]))) + ' ₽</b>'));
      });
      st.appendChild(el('div', '', 'Итого по прайсу: <b>' + fmtRub(toCents(pick.price)) + ' ₽</b>'));
      out.appendChild(st);
    }
    out.appendChild(el('div', 'note',
      'Сверх цены станка: доставка, ПНР, обучение и подготовка цеха. ' +
      'Стабилизатор 30 000 или 50 000 Вт — отдельная статья и условие гарантии.'));
  }

  ['fSeries'].forEach(function (id) { $(id).addEventListener('change', fillFiberFormats); });
  $('fFormat').addEventListener('change', fillFiberPowers);
  ['fPower', 'fTable', 'fRot'].forEach(function (id) {
    $(id).addEventListener('change', renderFiber);
  });
  $('fAdd').addEventListener('click', function () {
    var p = fiberPick();
    if (p.err) return;
    addItem(p.name, p.price, 1);
  });

  // ------------------------------------------------------------------ фрезерные
  APP.millingOrder.forEach(function (f) {
    opt($('mFormat'), f, f + ' — ' + APP.millingFields[f] + ' мм');
  });
  function fillMillConfigs() {
    var f = $('mFormat').value, sel = $('mConfig'); clear(sel);
    APP.milling.filter(function (r) { return r.format === f; })
      .forEach(function (r, i) { opt(sel, r.name, r.name); });
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
    var a = el('div', 'pb' + (mode === 'order' ? ' stock' : ''));
    a.innerHTML = '<div class="lbl">Под заказ — завод, ~60 дней</div><div class="val">' +
      fmtRub(toCents(r.order)) + ' ₽</div><div class="sub">Оплата 50 % + остаток</div>';
    box.appendChild(a);
    var b = el('div', 'pb' + (mode === 'stock' ? ' stock' : ''));
    b.innerHTML = '<div class="lbl">Из наличия — склад</div><div class="val">' +
      fmtRub(toCents(r.stock)) + ' ₽</div><div class="sub">Оплата 100 %</div>';
    box.appendChild(b);
    out.appendChild(box);

    var st = el('div', 'calcsteps internal');
    var diff = r.stock - r.order;
    var pct = Math.round(diff / r.order * 10000) / 100;
    st.appendChild(el('div', '', 'Разница: <b>' + fmtRub(toCents(diff)) + ' ₽</b>, это <b>+' +
      String(pct).replace('.', ',') + ' %</b> к цене под заказ'));
    st.appendChild(el('div', '', 'Правило прайса: +11 % с округлением до 100 ₽. ' +
      'Цена берётся из таблицы, а не считается.'));
    out.appendChild(st);

    var facts = el('div', 'muted');
    facts.innerHTML = 'Шпиндель ' + r.kw + ' кВт · охлаждение ' + esc(r.cool) +
      ' · стойка ' + esc(r.ctrl) + ' · вакуумный стол: ' + (r.vac ? 'да' : 'нет') +
      ' · поле ' + APP.millingFields[r.format] + ' мм' +
      (r.vac ? ' · питание 380 В (вакуумная версия)' : ' · питание 220 В');
    out.appendChild(facts);
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
      mode === 'stock' ? r.stock : r.order, 1);
  });

  // опции
  (function () {
    var box = $('mOptions'), cats = {};
    APP.options.forEach(function (o) { (cats[o.cat] = cats[o.cat] || []).push(o); });
    Object.keys(cats).forEach(function (c) {
      box.appendChild(el('div', 'muted', '<b>' + esc(c) + '</b>'));
      cats[c].forEach(function (o) {
        var row = el('div', 'chk');
        var qtyId = 'q_' + o.name.replace(/\W+/g, '_');
        row.innerHTML = '<input type="checkbox">' +
          '<span style="flex:1">' + esc(o.name) + ' — <b>' + fmtRub(toCents(o.price)) + ' ₽</b></span>' +
          '<input type="number" min="1" max="20" value="1" id="' + qtyId +
          '" style="width:62px;padding:3px 5px">' +
          '<button class="btn mini sec" type="button">В смету</button>';
        var qty = row.querySelector('#' + qtyId);
        if (/Виброопор/i.test(o.cat)) {
          var f = $('mFormat').value;
          if (APP.vibroQty[f]) qty.value = APP.vibroQty[f];
        }
        row.querySelector('button').addEventListener('click', function () {
          addItem(o.name, o.price, Math.max(1, parseInt(qty.value, 10) || 1));
        });
        box.appendChild(row);
      });
    });
  }());

  // ПНР
  APP.pnr.forEach(function (p, i) { opt($('pnrModel'), String(i), p.model); });
  function pnrPick() {
    var p = APP.pnr[parseInt($('pnrModel').value, 10)];
    var kind = $('pnrKind').value;
    var labels = { pnr: 'ПНР', plus1: 'ПНР +1 день', plus2: 'ПНР +2 дня',
      training: 'Обучение', package: 'ПНР + обучение' };
    var v = p[kind];
    if (kind === 'training' && typeof v === 'string' && !/^\d/.test(v.replace(/\s/g, ''))) {
      return { text: v, price: null, name: labels[kind] + ' — ' + p.model };
    }
    if (typeof v === 'string') v = parseInt(v.replace(/\s/g, ''), 10);
    if (!v) return { text: 'В прайсе для этой комбинации цены нет — уточнить у сервиса.',
      price: null, name: labels[kind] + ' — ' + p.model };
    var third = $('thirdParty').checked;
    var base = v;
    var final = third ? Math.round(v * 1.2) : v;
    return { price: final, base: base, third: third, days: p.days,
      name: labels[kind] + ' — ' + p.model + (third ? ' (сторонний, ×1,2)' : '') };
  }
  function renderPnr() {
    var out = $('pnrOut'); clear(out);
    var p = pnrPick();
    if (p.price === null) { out.appendChild(el('div', 'note alert', esc(p.text))); return; }
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'По прайсу: <b>' + fmtRub(toCents(p.base)) + ' ₽</b>' +
      (p.days ? ' · выезд ' + p.days + ' дн.' : '')));
    if (p.third) st.appendChild(el('div', '', 'Коэффициент ×1,2 на сторонний станок: <b>' +
      fmtRub(toCents(p.price)) + ' ₽</b>'));
    st.appendChild(el('div', '', 'Минимальный выезд за день — 22 000 ₽, ' +
      'штраф за ложный выезд 19 000 ₽'));
    out.appendChild(st);
  }
  ['pnrModel', 'pnrKind', 'thirdParty'].forEach(function (id) {
    $(id).addEventListener('change', renderPnr);
  });
  $('pnrAdd').addEventListener('click', function () {
    var p = pnrPick(); if (p.price === null) return;
    addItem(p.name, p.price, 1);
  });

  // категория
  function switchCat() {
    var c = $('cat').value;
    $('blkFiber').style.display = c === 'fiber' ? '' : 'none';
    $('blkMill').style.display = c === 'milling' ? '' : 'none';
  }
  $('cat').addEventListener('change', switchCat);

  // ------------------------------------------------------------------ смета
  for (var dd = 0; dd <= 100; dd += 5) opt($('discount'), String(dd), (dd / 10).toString().replace('.', ',') + ' %');
  [120, 150, 200, 250, 300].forEach(function (v) {
    opt($('discount'), String(v), (v / 10).toString().replace('.', ',') + ' %');
  });
  $('discount').value = String(state.disc || 0);
  $('ndsRate').value = String(state.nds || APP.ndsDefault * 10);

  var KPF = ['kpClient', 'kpInn', 'kpNum', 'kpContact', 'kpPhone', 'kpNote', 'kpDate'];
  KPF.forEach(function (id) {
    if (state.kp[id]) $(id).value = state.kp[id];
    $(id).addEventListener('input', function () {
      state.kp[id] = this.value; save(); renderKP();
    });
  });
  if (!state.kp.kpDate) {
    var now = new Date();
    var dt = ('0' + now.getDate()).slice(-2) + '.' + ('0' + (now.getMonth() + 1)).slice(-2) +
      '.' + now.getFullYear();
    $('kpDate').value = dt; state.kp.kpDate = dt;
  }

  function addItem(name, priceRub, qty) {
    state.items.push({ name: name, price: toCents(priceRub), qty: qty });
    save(); renderSmeta();
    showTab('smeta');
  }

  function totals() {
    var disc = parseInt($('discount').value, 10) || 0;
    var rate = parseInt($('ndsRate').value, 10) || 0;
    var listSum = 0, discSum = 0, lines = [];
    state.items.forEach(function (it) {
      var unit = soSkidkoy(it.price, disc);
      var line = unit * it.qty;
      listSum += it.price * it.qty;
      discSum += line;
      lines.push({ item: it, unit: unit, line: line });
    });
    var nds = ndsIznutri(discSum, rate);
    return { disc: disc, rate: rate, listSum: listSum, total: discSum,
      gain: listSum - discSum, bez: nds.bez, nds: nds.nds, lines: lines };
  }

  function renderSmeta() {
    var body = $('smetaBody'); clear(body);
    var T = totals();
    $('smetaEmpty').style.display = state.items.length ? 'none' : '';
    $('smetaTable').style.display = state.items.length ? '' : 'none';

    T.lines.forEach(function (L, i) {
      var tr = d.createElement('tr');
      tr.innerHTML = '<td>' + esc(L.item.name) + '</td>' +
        '<td><input type="number" min="1" max="99" value="' + L.item.qty + '"></td>' +
        '<td>' + fmt(L.item.price) + '</td>' +
        '<td>' + fmt(L.unit) + '</td>' +
        '<td><b>' + fmt(L.line) + '</b></td>' +
        '<td class="noprint"><button class="btn mini sec" type="button">Удалить</button></td>';
      tr.querySelector('input').addEventListener('change', function () {
        L.item.qty = Math.max(1, Math.min(99, parseInt(this.value, 10) || 1));
        save(); renderSmeta();
      });
      tr.querySelector('button').addEventListener('click', function () {
        state.items.splice(i, 1); save(); renderSmeta();
      });
      body.appendChild(tr);
    });

    var tot = $('totals'); clear(tot);
    if (!state.items.length) { clear($('propis')); clear($('checkBlock')); renderKP(); return; }
    function row(k, v, cls) {
      var n = el('div', cls || '');
      n.innerHTML = '<span>' + k + '</span><span>' + v + '</span>';
      tot.appendChild(n);
    }
    row('Сумма по прайсу', fmt(T.listSum) + ' ₽');
    row('Ваша выгода — скидка ' + (T.disc / 10).toString().replace('.', ',') + ' %',
      '−' + fmt(T.gain) + ' ₽', 'gain');
    row('Итого без НДС', fmt(T.bez) + ' ₽');
    row('в т. ч. НДС ' + (T.rate / 10).toString().replace('.', ',') + ' %', fmt(T.nds) + ' ₽');
    row('ИТОГО к оплате', fmt(T.total) + ' ₽', 'big');

    $('propis').innerHTML = 'Сумма прописью: ' + esc(propisyu(T.total)) +
      ', в том числе НДС ' + (T.rate / 10).toString().replace('.', ',') + ' % — ' +
      esc(propisyu(T.nds)) + '.';

    // сходимость — независимая перепроверка, не повторное чтение тех же чисел
    var cb = $('checkBlock'); clear(cb);
    var problems = [];
    var reBez = T.bez + T.nds;
    if (reBez !== T.total) {
      problems.push('Без НДС + НДС = ' + fmt(reBez) + ' ₽, а ИТОГО = ' + fmt(T.total) +
        ' ₽. Расхождение ' + fmt(Math.abs(reBez - T.total)) + ' ₽');
    }
    var reSum = 0;
    T.lines.forEach(function (L) { reSum += soSkidkoy(L.item.price, T.disc) * L.item.qty; });
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
  function renderKP() {
    var box = $('kpPreview'); clear(box);
    var T = totals();
    var k = state.kp;
    var head = el('div', 'kp-head');
    head.innerHTML = '<div class="kp-logo">LASERCUT<small>оборудование с ЧПУ</small></div>' +
      '<div class="kp-meta">Технико-коммерческое предложение<br>' +
      'Исх. № ' + esc(k.kpNum || '—') + ' от ' + esc(k.kpDate || '—') + '<br>' +
      'Действует ' + APP.kpValidDays + ' дней</div>';
    box.appendChild(head);

    var first = state.items.length ? state.items[0].name : '—';
    box.appendChild(el('h1', '', esc(first)));
    box.appendChild(el('p', '', 'Кому: <b>' + esc(k.kpClient || '—') + '</b>' +
      (k.kpInn ? ', ИНН ' + esc(k.kpInn) : '') +
      (k.kpNote ? ' - ' + esc(k.kpNote) : '')));
    box.appendChild(el('p', 'muted',
      'Оборудование соответствует ТР ТС 004/2011, 010/2011, 020/2011.'));

    var sum = el('div', 'kp-sum');
    sum.innerHTML =
      '<div><div class="k">Модель</div><div class="v">' + esc(first) + '</div></div>' +
      '<div><div class="k">Стоимость, с НДС ' + (T.rate / 10).toString().replace('.', ',') +
      ' %</div><div class="v">' + fmt(T.total) + ' ₽</div></div>' +
      '<div><div class="k">Ваша выгода (скидка ' + (T.disc / 10).toString().replace('.', ',') +
      ' %)</div><div class="v">' + fmt(T.gain) + ' ₽</div></div>' +
      '<div><div class="k">Гарантия</div><div class="v">12 месяцев</div></div>';
    box.appendChild(sum);

    if (state.items.length) {
      var tb = el('table');
      var rows = T.lines.map(function (L, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(L.item.name) + '</td><td>' +
          L.item.qty + '</td><td>' + fmt(L.unit) + '</td><td><b>' + fmt(L.line) + '</b></td></tr>';
      }).join('');
      tb.innerHTML = '<thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th>' +
        '<th>Цена со скидкой</th><th>Сумма</th></tr></thead><tbody>' + rows +
        '<tr><td colspan="4">Ваша выгода</td><td><b>' + fmt(T.gain) + ' ₽</b></td></tr>' +
        '<tr><td colspan="4">Итого без НДС</td><td>' + fmt(T.bez) + ' ₽</td></tr>' +
        '<tr><td colspan="4">в т. ч. НДС ' + (T.rate / 10).toString().replace('.', ',') +
        ' %</td><td>' + fmt(T.nds) + ' ₽</td></tr>' +
        '<tr><td colspan="4"><b>ИТОГО к оплате</b></td><td><b>' + fmt(T.total) +
        ' ₽</b></td></tr></tbody>';
      box.appendChild(tb);
      box.appendChild(el('p', '', '<i>' + esc(propisyu(T.total)) + '</i>'));
    }

    box.appendChild(el('p', 'muted',
      'Условия поставки: под заказ — 50 % предоплата, остаток перед отгрузкой, срок с завода ' +
      'около 60 дней. Из наличия — 100 % оплата, отгрузка 1–3 рабочих дня. ' +
      'Доставка, пуско-наладка и обучение рассчитываются отдельно.'));

    var mgr = el('div', 'kp-mgr');
    mgr.innerHTML = 'Ваш менеджер: <b>' + esc(k.kpContact || APP.manager.name) + '</b><br>' +
      esc(APP.manager.phone) + ' · ' + esc(APP.manager.email) +
      (k.kpPhone ? '<br>Контакт клиента: ' + esc(k.kpPhone) : '');
    box.appendChild(mgr);
    box.appendChild(el('div', 'kp-foot',
      'Предложение действует ' + APP.kpValidDays + ' дней. Счёт фиксирует цену и наличие на ' +
      APP.invoiceValidDays + ' дней. Цены указаны с НДС.'));
  }

  $('btnPrint').addEventListener('click', function () {
    var p = $('p-smeta');
    p.classList.add('printme');
    window.print();
    setTimeout(function () { p.classList.remove('printme'); }, 400);
  });

  $('btnJson').addEventListener('click', function () {
    var T = totals(), k = state.kp;
    var dparts = (k.kpDate || '').split('.');
    var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
      'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    var payload = {
      'КЛИЕНТ': k.kpClient || '', 'ИНН': k.kpInn || '',
      'ПРИМЕЧАНИЕ': k.kpNote ? ' - ' + k.kpNote : '',
      'ИСХ_НОМЕР': k.kpNum || '',
      'КОНТАКТ_ИМЯ': k.kpContact || APP.manager.name,
      'КОНТАКТ_ТЕЛЕФОН': k.kpPhone || APP.manager.phone,
      'ДД': dparts[0] || '', 'МЕСЯЦА': MONTHS[(parseInt(dparts[1], 10) || 1) - 1],
      'ГГГГ': dparts[2] || '',
      'менеджер': APP.manager,
      'ставка_НДС': T.rate / 10,
      'скидка_процент': T.disc / 10,
      'позиции': T.lines.map(function (L) {
        return { наименование: L.item.name, количество: L.item.qty,
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
      navigator.clipboard.writeText(text).then(function () {
        $('saveDot').textContent = 'JSON скопирован';
      }, function () {});
    } else if (ok) { $('saveDot').textContent = 'JSON скопирован'; }
  });

  // ------------------------------------------------------------------ подбор
  Object.keys(APP.cutLimits).forEach(function (m) { opt($('mtMaterial'), m, m); });
  function renderMatch() {
    var out = $('matchOut'); clear(out);
    var m = $('mtMaterial').value;
    var th = parseFloat($('mtThick').value.replace(',', '.'));
    if (!(th > 0)) { out.appendChild(el('div', 'note', 'Введите толщину.')); return; }
    var lim = APP.cutLimits[m];
    var needReserve = th / (1 - APP.reservePct / 100);   // запас не менее 30 %
    var needComfort = th * 2;                            // комфортный поток
    var absMax = lim[lim.length - 1][1];
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'Толщина: <b>' + String(th).replace('.', ',') + ' мм</b> по ' +
      esc(m.toLowerCase())));
    st.appendChild(el('div', '', 'С запасом ' + APP.reservePct + ' % нужен предел не ниже <b>' +
      (Math.round(needReserve * 10) / 10).toString().replace('.', ',') + ' мм</b>'));
    st.appendChild(el('div', '', 'Комфортный поток — вдвое ниже предела, то есть предел от <b>' +
      String(needComfort).replace('.', ',') + ' мм</b>'));
    out.appendChild(st);

    if (th > absMax) {
      out.appendChild(el('div', 'note stop',
        'Максимум по таблицам режимов для этого материала — ' + absMax +
        ' мм. Толщина ' + String(th).replace('.', ',') +
        ' мм за пределами линейки: это серия HARD, цен на неё в прайсе нет. К менеджеру.'));
      return;
    }
    function findPower(need) {
      for (var i = 0; i < lim.length; i++) if (lim[i][1] >= need) return lim[i];
      return null;
    }
    var pr = findPower(needReserve), pc = findPower(needComfort);
    var recs = [];
    if (pr) recs.push({ label: 'Минимум с запасом ' + APP.reservePct + ' %',
      power: pr[0], max: pr[1] });
    if (pc && (!pr || pc[0] !== pr[0])) recs.push({ label: 'Комфортный режим',
      power: pc[0], max: pc[1] });
    if (!recs.length) {
      out.appendChild(el('div', 'note stop',
        'Под эту толщину с обязательным запасом 30 % в заведённых мощностях решения нет. ' +
        'Это серия HARD — к менеджеру.'));
      return;
    }
    recs.slice(0, 2).forEach(function (r) {
      var c = el('div', 'card');
      var series = r.power === 3000 ?
        'Серия S ' + (r.power / 1000) + ' кВт, либо серия A (только 3 кВт, компактная)' :
        'Серия S ' + (r.power / 1000) + ' кВт';
      var cheapest = null;
      APP.fiberS.forEach(function (x) {
        if (x.power === r.power && (!cheapest || x.base < cheapest.base)) cheapest = x;
      });
      c.innerHTML = '<div class="muted">' + esc(r.label) + '</div>' +
        '<div style="font-size:17px;font-weight:700;color:var(--navy)">' + esc(series) + '</div>' +
        '<div class="muted">Предел по таблицам: ' + r.max + ' мм · газ: ' +
        esc(APP.gasByMaterial[m]) + '</div>' +
        (cheapest ? '<div style="margin-top:6px">Самая доступная конфигурация этой мощности: ' +
          'S ' + cheapest.format + ' ' + cheapest.power + 'W — <b>' +
          fmtRub(toCents(cheapest.base)) + ' ₽</b> (поле ' +
          APP.fiberFormats[cheapest.format] + ' мм)</div>' : '');
      out.appendChild(c);
    });
    out.appendChild(el('div', 'note alert',
      'Формат подбирается по размеру заготовки, а не по толщине. ' +
      'Толщину без газа и режима клиенту не называть.'));
  }
  ['mtMaterial', 'mtThick'].forEach(function (id) {
    $(id).addEventListener('input', renderMatch);
    $(id).addEventListener('change', renderMatch);
  });

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
      var openBlockers = [], openOther = 0;
      APP.readiness.forEach(function (r, i) {
        if (!state.ready[kind + '_' + i]) {
          if (r.blocker) openBlockers.push(r.name); else openOther++;
        }
      });
      if (openBlockers.length) {
        out.className = 'check fail';
        out.innerHTML = '<b>КП не выпускать: не закрыто блокеров — ' + openBlockers.length +
          ' из ' + APP.readiness.filter(function (r) { return r.blocker; }).length + '.</b><ul>' +
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
  APP.gas.forEach(function (g, i) { opt($('gNozzle'), String(i), 'Сопло ' + g.nozzle); });
  $('gNozzle').value = String(state.gas.nozzle || 0);
  $('gGas').value = state.gas.gas || 'n2';
  $('gHours').value = state.gas.hours || 80;
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
    var st = el('div', 'calcsteps');
    st.appendChild(el('div', '', 'Поток: <b>' + esc(flow) + ' л/мин</b>'));
    st.appendChild(el('div', '', 'Баллонов в час: <b>' +
      String(bal[0]).replace('.', ',') + '–' + String(bal[1]).replace('.', ',') + '</b>'));
    var lo = Math.round(bal[0] * hours * 10) / 10, hi = Math.round(bal[1] * hours * 10) / 10;
    st.appendChild(el('div', '', 'За ' + hours + ' ч: <b>' +
      String(lo).replace('.', ',') + '–' + String(hi).replace('.', ',') + ' баллонов</b>'));
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
      out.appendChild(el('div', 'note alert',
        'Это ' + String(bal[0]).replace('.', ',') + '–' + String(bal[1]).replace('.', ',') +
        ' баллонов в час. Нужен криоцилиндр или газогенератор — иначе логистика ' +
        'баллонов съест экономику.'));
    }
    if (kind === 'o2') {
      out.appendChild(el('div', 'note',
        'Кислород для углеродистой стали, чистота 99,99 %, давление 0,5–1 бар. ' +
        'Если материал допускает воздух — компрессор подбирается по потоку азота, ресивер ≥ 500 л.'));
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
  switchCat();
  renderMill();
  renderPnr();
  renderSmeta();
  renderMatch();
  renderReady();
  renderGas();
  var hash = (location.hash || '').replace('#', '');
  var valid = ['cfg', 'smeta', 'match', 'shop', 'gas', 'data'];
  showTab(valid.indexOf(hash) >= 0 ? hash : 'cfg');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}());
