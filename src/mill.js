/* Вкладка «Фрезерный»: сборка станка по узлам, допоборудование, ПНР.
   Вставляется в ui.js по маркеру, поэтому пользуется его $, esc, toast,
   addItem, showTab, state и save. Деньги — только через money.js, в копейках.
   Документ отсюда не печатается: готовая спецификация уходит в смету. */
var M = APP.mill;

// Точная мощность шпинделя есть только в названии конфигурации: в прайсе
// колонка округлена до целых, а 3,0 и 3,2 кВт — разные шпиндели.
function mzKw(row) {
  var m = String(row.name).match(/(\d+[.,]?\d*)\s*(wc|ac)/i);
  return m ? parseFloat(m[1].replace(',', '.')) : row.kw;
}
var MZCAT = APP.milling.map(function (r, i) {
  return { i: i, f: r.format, n: r.name, kwn: mzKw(r), cool: r.cool,
    ctrl: r.ctrl, vac: !!r.vac, order: r.order, stock: r.stock };
});
var MZ_CTRL = { 'NC': 'NC Studio', 'A11': 'DSP RichAuto A11',
  'A18': 'DSP RichAuto A18', 'Syntec': 'Syntec', 'NC8': 'NC8',
  'F7324': 'F7324', 'без контр.': 'Без контроллера' };

function mzDec(v) { return String(v).replace('.', ','); }
function mzRub(rub) { return fmtRub(toCents(rub || 0)) + ' ₽'; }
function mzNum(id) { return +$(id).value || 0; }
function mzTouched(id) { return $(id).dataset.touched === '1'; }
function mzTouch(id, on) { $(id).dataset.touched = on === false ? '0' : '1'; }

// Черновик вкладки живёт в общем состоянии приложения — как и остальные разделы.
if (!state.mill) state.mill = {};
var mzS = state.mill;
if (!mzS.rotPrices) mzS.rotPrices = {};
if (!mzS.mode) mzS.mode = 'ready';
var mzSel = null;              // индекс выбранной готовой конфигурации
var mzCat = 'stab';            // активная вкладка допоборудования
var mzMCat = 'spin';           // активная вкладка узлов станка
var mzFlags = {};              // худший статус подсказок по блокам

// --------------------------------------------------------------- подсказки
function mzHints(id, list) {
  var box = $(id);
  if (!box) return;
  var rows = (list || []).filter(Boolean);
  var worst = '';
  rows.forEach(function (r) {
    if (r[1] === 'bad') worst = 'bad';
    else if (r[1] === 'warn' && worst !== 'bad') worst = 'warn';
  });
  mzFlags[id] = worst;
  box.innerHTML = rows.map(function (r) {
    return '<div class="mzhint ' + (r[1] || '') + '">' + r[0] + '</div>';
  }).join('');
}
// Карточка-справка узла: заголовок, подзаголовок, таблица, пояснение.
function mzCard(id, title, sub, rows, note) {
  var box = $(id);
  if (!box) return;
  var t = (rows || []).map(function (r) {
    return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(String(r[1])) + '</td></tr>';
  }).join('');
  box.innerHTML = '<div class="mzcard"><div class="mzcard-h"><b>' + esc(title) +
    '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' +
    (t ? '<table class="mzspec"><tbody>' + t + '</tbody></table>' : '') +
    (note ? '<div class="mzcard-n">' + note + '</div>' : '') + '</div>';
}

// ------------------------------------------------------------ серия и формат
function mzSeriesOf(c) {
  var n = c.n;
  if (/mini/i.test(n)) return /cabine/i.test(n) ? 'MINI Cabine' : 'MINI';
  if (/S2X/.test(n)) return 'M1 S2X';
  if (/ RD,/.test(n)) return 'M1 RD';
  if (/ S3,/.test(n)) return 'M1 S3';
  if (/ S4,/.test(n)) return 'M1 S4';
  return n.split(' ')[0];
}
function mzBySeries(s) {
  var base = s.split(' ')[0];
  var list = MZCAT.filter(function (c) {
    var n = c.n.toLowerCase();
    return base === 'MINI' ? n.indexOf('mini') >= 0
      : n.indexOf(base.toLowerCase() + ' ') === 0;
  });
  if (s === 'MINI Cabine') list = list.filter(function (c) { return /cabine/i.test(c.n); });
  if (s === 'MINI') list = list.filter(function (c) { return !/cabine/i.test(c.n); });
  M.variants.forEach(function (t) {
    if (s.indexOf(t) >= 0) list = list.filter(function (c) { return c.n.indexOf(t) >= 0; });
  });
  var isVariant = M.variants.some(function (t) { return s.indexOf(t) >= 0; });
  if (!isVariant) {
    list = list.filter(function (c) {
      return !M.variants.some(function (t) {
        return new RegExp('(^|\\s)' + t + '[\\s,]').test(c.n);
      });
    });
  }
  return list;
}
function mzKey() { return $('mzStock').value === 'stock' ? 'stock' : 'order'; }
function mzPriceOf(c) { return c[mzKey()]; }

function mzFillFmt() {
  var s = $('mzSeries').value, cur = $('mzFmt').value;
  var avail = {};
  mzBySeries(s).forEach(function (c) { avail[c.f] = 1; });
  var list = M.formats.filter(function (f) { return avail[f[0]]; });
  var use = list.length ? list : M.formats;
  $('mzFmt').innerHTML = use.map(function (f) {
    return '<option value="' + f[0] + '">' + f[0] + ' · ' + f[1] + ' мм' +
      (f[2] ? ' · ' + f[2] : '') + '</option>';
  }).join('');
  var has = use.some(function (f) { return f[0] === cur; });
  $('mzFmt').value = has ? cur : use[0][0];
  return { n: list.length, all: !list.length };
}

// ------------------------------------------------- готовые конфигурации прайса
function mzCfgSpec(c) {
  return [mzDec(c.kwn) + ' кВт', c.cool, 'стол ' + (c.vac ? 'VAC' : 'PROF'),
    c.ctrl].join(' · ');
}
function mzExact() {
  var s = $('mzSeries').value, f = $('mzFmt').value;
  var kw = parseFloat($('mzSpindle').value);
  var cool = $('mzCool').value === 'wc' ? 'водяное' : 'воздушное';
  var vac = $('mzTable').value === 'VAC', ctrl = $('mzCtrl').value;
  var found = null;
  mzBySeries(s).forEach(function (c) {
    if (!found && c.f === f && c.kwn === kw && c.cool === cool &&
        c.vac === vac && MZ_CTRL[c.ctrl] === ctrl) found = c;
  });
  return found;
}
function mzApplyCfg(idx) {
  var c = MZCAT[idx];
  if (!c) return;
  var p = mzPriceOf(c);
  if (mzTouched('mzPrice') && mzNum('mzPrice') && mzNum('mzPrice') !== p &&
      !window.confirm('Цена станка была введена вручную. Заменить на ' + mzRub(p) + '?')) return;
  var cs = mzSeriesOf(c);
  if ($('mzSeries').value !== cs) { $('mzSeries').value = cs; mzFillFmt(); }
  $('mzFmt').value = c.f;
  mzSel = c.i;
  var sp = M.spindles.filter(function (x) { return parseFloat(x) === c.kwn; })[0];
  if (sp) $('mzSpindle').value = sp;
  $('mzCool').value = c.cool === 'водяное' ? 'wc' : 'ac';
  $('mzTable').value = c.vac ? 'VAC' : 'PROF';
  if (MZ_CTRL[c.ctrl]) $('mzCtrl').value = MZ_CTRL[c.ctrl];
  if (/Leadshine/.test(c.n)) $('mzMotor').value = 'Шаговые с обратной связью (Leadshine)';
  ['mzSpindle', 'mzCool', 'mzTable', 'mzCtrl', 'mzMotor'].forEach(function (id) { mzTouch(id); });
  mzTouch('mzPrice', false);
  mzUpdate();
}
function mzRenderReady() {
  var box = $('mzReady');
  if (mzS.mode !== 'ready') { box.innerHTML = ''; return; }
  var list = mzBySeries($('mzSeries').value).filter(function (c) {
    return c.f === $('mzFmt').value;
  });
  if (!list.length) {
    box.innerHTML = '<div class="mzhint warn">Готовых конфигураций для этой пары ' +
      'в прайсе нет. Соберите свою и введите цену вручную.</div>';
    return;
  }
  box.innerHTML = '<div class="mzready">' + list.map(function (c) {
    return '<button type="button" class="mzrcard' + (mzSel === c.i ? ' on' : '') +
      '" data-cfg="' + c.i + '"><b>' + esc(c.n) + '</b><span class="mzrs">' +
      esc(mzCfgSpec(c)) + '</span><span class="mzrp">' + mzRub(mzPriceOf(c)) +
      '<em>' + (mzKey() === 'order' ? 'под заказ' : 'из наличия') + '</em></span></button>';
  }).join('') + '</div>';
}
// Похожие конфигурации: чем отличаются и на сколько дороже или дешевле.
function mzRenderSimilar() {
  var box = $('mzSimilar');
  var s = $('mzSeries').value, f = $('mzFmt').value;
  var kw = parseFloat($('mzSpindle').value);
  var cool = $('mzCool').value === 'wc' ? 'водяное' : 'воздушное';
  var vac = $('mzTable').value === 'VAC';
  var base = mzNum('mzPrice');
  if (!base) { box.innerHTML = ''; return; }
  var scored = [];
  MZCAT.forEach(function (c) {
    if (c.i === mzSel) return;
    var diff = [], w = 0;
    if (c.f !== f) { diff.push('поле ' + c.f); w += 3; }
    var cs = mzSeriesOf(c);
    if (cs !== s) { diff.push('серия ' + cs); w += 2; }
    if (c.kwn !== kw) { diff.push(mzDec(c.kwn) + ' кВт'); w += 1; }
    if (c.cool !== cool) { diff.push(c.cool); w += 1; }
    if (c.vac !== vac) { diff.push(c.vac ? 'вакуумный стол' : 'профильный стол'); w += 1; }
    if (w && w <= 3) scored.push({ c: c, d: diff, w: w });
  });
  scored.sort(function (a, b) { return a.w - b.w || Math.abs(mzPriceOf(a.c) - base) - Math.abs(mzPriceOf(b.c) - base); });
  scored = scored.slice(0, 6);
  if (!scored.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="mzsim"><div class="mzsim-h">Рядом в прайсе</div>' +
    scored.map(function (x) {
      var dp = mzPriceOf(x.c) - base;
      var cls = dp > 0 ? 'up' : (dp < 0 ? 'dn' : 'eq');
      var txt = dp > 0 ? '+' + mzRub(dp) : (dp < 0 ? '−' + mzRub(-dp) : 'та же цена');
      return '<button type="button" class="mzsim-r" data-cfg="' + x.c.i + '"><span>' +
        esc(x.c.n) + '<em>' + esc(x.d.join(', ')) + '</em></span>' +
        '<b class="' + cls + '">' + txt + '</b></button>';
    }).join('') + '</div>';
}
function mzRenderMatches() {
  var list = mzBySeries($('mzSeries').value).filter(function (c) {
    return c.f === $('mzFmt').value;
  });
  var box = $('mzMatchList');
  if (!list.length) {
    box.innerHTML = '<div class="mzhint warn">В прайсе нет такой связки ' +
      '«серия и рабочее поле».</div>';
    return;
  }
  box.innerHTML = list.map(function (c) {
    return '<button type="button" class="mzsim-r" data-price="' + mzPriceOf(c) +
      '"><span>' + esc(c.n) + '<em>' + esc(mzCfgSpec(c)) + '</em></span><b>' +
      mzRub(mzPriceOf(c)) + '</b></button>';
  }).join('');
}

// ------------------------------------------------- справки по узлам станка
function mzSpindleVolt() {
  var kw = parseFloat($('mzSpindle').value);
  if (kw <= 2.2) return { v: '220', only: true, txt: 'Шпиндель до 2,2 кВт — питание 220 В.' };
  if (kw >= 4.5) return { v: '380', only: true, txt: 'Шпиндель от 4,5 кВт — питание 380 В.' };
  return { v: mzS.sv || '380', only: false,
    txt: 'Шпиндели 3–3,2 кВт встречаются и на 220, и на 380 В — уточните исполнение в заказе.' };
}
function mzApplyVolt() {
  var v = mzSpindleVolt();
  mzS.sv = v.v;
  Array.prototype.forEach.call($('mzSV').children, function (b) {
    b.classList.toggle('on', b.dataset.sv === v.v);
    b.disabled = v.only;
  });
}
function mzSV() { return mzSpindleVolt().v; }
function mzTV() { return mzS.tv || '380'; }
function mzAV() { return mzS.av || '220'; }
function mzZ() { return M.zTravel[$('mzSeries').value] || null; }

function mzRenderSeries() {
  var s = $('mzSeries').value, i = M.seriesInfo[s];
  if (!i) { $('mzSeriesCard').innerHTML = ''; return; }
  var n = mzBySeries(s).length;
  mzCard('mzSeriesCard', 'Серия Wattsan ' + s, i.sub,
    i.d.concat([['Конфигураций в прайсе', n]]),
    esc(i.idx) + '<br><br>' + esc(M.seriesNote));
}
function mzRenderFmt() {
  var s = $('mzSeries').value, f = $('mzFmt').value;
  var F = M.formats.filter(function (x) { return x[0] === f; })[0];
  var list = mzBySeries(s).filter(function (c) { return c.f === f; });
  var prices = list.map(mzPriceOf).sort(function (a, b) { return a - b; });
  var rows = [['Рабочее поле', (F ? F[1] : f) + ' мм']];
  var mass = M.mass[s + ' ' + f] || M.mass[s.split(' ')[0] + ' ' + f];
  if (mass) rows.push(['Масса', mass]);
  var dim = M.dims[s + ' ' + f] || M.dims[s.split(' ')[0] + ' ' + f];
  if (dim) rows.push(['Габариты', dim]);
  var z = mzZ();
  if (z) rows.push(['Ход по Z', z + ' мм']);
  rows.push(['Конфигураций в прайсе', list.length]);
  if (prices.length) {
    rows.push(['Цена в прайсе', prices.length > 1
      ? mzRub(prices[0]) + ' – ' + mzRub(prices[prices.length - 1])
      : mzRub(prices[0])]);
  }
  mzCard('mzFmtCard', 'Формат ' + f, F && F[2] ? F[2] : '', rows, '');
}
function mzRenderSpindle() {
  var k = $('mzSpindle').value, i = M.spindleInfo[k];
  if (!i) { $('mzSpindleCard').innerHTML = ''; return; }
  var rows = [['Типичное охлаждение', i.cool], ['Класс', i.cls], ['Назначение', i.use]];
  if (i.wat) rows.push(['Где у Wattsan', i.wat]);
  rows.push(['Питание', mzSpindleVolt().v + ' В']);
  mzCard('mzSpindleCard', 'Шпиндель ' + mzDec(k) + ' кВт', i.cls, rows, esc(M.spindleNote));
}
function mzRenderTable() {
  var k = $('mzTable').value, i = M.tableInfo[k];
  if (!i) { $('mzTableCard').innerHTML = ''; return; }
  var rows = i.d.slice();
  if (k === 'VAC') rows.push(['Питание насоса', mzTV() + ' В']);
  mzCard('mzTableCard', 'Стол ' + k, i.sub, rows, esc(i.idx));
}
function mzRenderCtrl() {
  var k = $('mzCtrl').value, i = M.ctrlInfo[k];
  if (!i) { $('mzCtrlCard').innerHTML = ''; return; }
  mzCard('mzCtrlCard', k, i.sub, i.d, esc(i.idx));
}
function mzRenderMotor() {
  var k = $('mzMotor').value, i = M.motorInfo[k];
  if (!i) return;
  mzCard('mzMotorCard', 'Двигатели: ' + i.t, 'обратная связь — ' + i.fb, i.d,
    esc(i.idx) + '<br><br>' + M.motorNote);
  var s = $('mzSeries').value, h = [];
  if (k === 'Серво') {
    h.push(['В прайсе LASERCUT конфигураций фрезеров с серводвигателями нет — ' +
      'цену и возможность уточняйте у техотдела.', 'warn']);
  } else if (/ноунейм/.test(k)) {
    h.push(['Привод без обратной связи и без указания производителя. При перегрузке ' +
      'возможен пропуск шагов, деталь уйдёт в брак незаметно для оператора.', 'warn']);
  }
  if (/Leadshine/.test(k) && (s === 'M2' || s === 'M3')) {
    h.push(['В прайсовых конфигурациях серии ' + s + ' пометки «+ Leadshine» нет — ' +
      'она стоит только у A1 и M1. Уточните комплектацию привода.', 'warn']);
  }
  mzHints('mzMotorHint', h);
}
// Проверка станка целиком: питание, охлаждение, стол, стойка, наличие в прайсе.
function mzSyncMachine() {
  var tbl = $('mzTable').value, cool = $('mzCool').value;
  var s = $('mzSeries').value, kw = parseFloat($('mzSpindle').value);
  var isVac = tbl === 'VAC';
  Array.prototype.forEach.call($('mzTV').children, function (b) {
    b.disabled = !isVac;
    b.classList.toggle('on', b.dataset.tv === mzTV());
  });
  var v = mzSpindleVolt(), h = [];
  h.push([esc(v.txt), v.only ? 'ok' : 'warn']);
  if (M.catSpindles.indexOf(kw) < 0) {
    h.push(['Шпинделя ' + mzDec(kw) + ' кВт нет ни в одной конфигурации прайса. ' +
      'Цену и саму возможность такой сборки уточняйте у техотдела.', 'bad']);
  }
  h.push([cool === 'ac'
    ? 'Воздушное охлаждение (ac) — чиллер не требуется.'
    : 'Водяное охлаждение (wc) — чиллер обязателен, в цену станка он не входит.',
    cool === 'ac' ? 'ok' : 'warn']);
  var si = M.spindleInfo[$('mzSpindle').value];
  if (si && si.cool.indexOf(cool === 'ac' ? 'воздушн' : 'водян') < 0) {
    h.push(['Для ' + mzDec(kw) + ' кВт типично ' + si.cool + ' охлаждение, а выбрано ' +
      (cool === 'ac' ? 'воздушное' : 'водяное') + '. Сочетание встречается, ' +
      'но проверьте исполнение шпинделя в заказе.', 'warn']);
  }
  if (isVac) {
    h.push(['Вакуумный стол — питание насоса выбирается отдельно. В прайсе вакуумные ' +
      'версии идут на 380 В; 220 В — только если насос однофазный.', 'warn']);
  }
  if (tbl === 'СОЖ') {
    h.push(['Стол с СОЖ — для мягких металлов. В прайсе допоборудования этой позиции ' +
      'нет, цену уточняйте у техотдела.', 'warn']);
  }
  if (s === 'M3' && !/Syntec|NC8|NC Studio/.test($('mzCtrl').value)) {
    h.push(['На M3 (металл, алюминий) в прайсе идут стойки Syntec, NC8 и NC — ' +
      'DSP-пультов у этой серии нет.', 'warn']);
  }
  if (/A18/.test($('mzCtrl').value)) {
    h.push(['A18 штатно стоит только на M1 1325 RD. На остальных — доплата за замену ' +
      'A11 на A18 во вкладке «Стойка ЧПУ».', 'warn']);
  }
  var av = {};
  mzBySeries(s).forEach(function (c) { av[c.f] = 1; });
  var keys = Object.keys(av);
  h.push([keys.length
    ? 'У серии ' + s + ' в прайсе ' + cnt(keys.length, ['рабочее поле', 'рабочих поля',
      'рабочих полей']) + ': ' + keys.join(', ') + '. Список полей отфильтрован под серию.'
    : 'У серии ' + s + ' в прайсе нет ни одной конфигурации — показаны все рабочие поля, ' +
      'цену вводите вручную.', keys.length ? 'ok' : 'bad']);
  mzHints('mzMachineHints', h);
}

// --------------------------------------------------------------- автоподбор
function mzChillerFor(kw) {
  var out = M.chillerSteps[M.chillerSteps.length - 1][1];
  for (var i = 0; i < M.chillerSteps.length; i++) {
    if (kw <= M.chillerSteps[i][0]) { out = M.chillerSteps[i][1]; break; }
  }
  return out;
}
function mzStabNeed() {
  // Потребление станка: шпиндель плюс приводы, насос и стойка. Берём с запасом.
  var kw = parseFloat($('mzSpindle').value) || 0;
  var need = kw + 1.5;
  if ($('mzTable').value === 'VAC') need += 2.2;
  return Math.ceil(need);
}
function mzStabAuto() {
  var need380 = mzSV() === '380' || ($('mzTable').value === 'VAC' && mzTV() === '380');
  var ph = need380 ? 3 : 1, req = mzStabNeed(), b = $('mzStabB').value;
  var pool = APP.stabsFull.filter(function (s) { return s.b === b && s.ph === ph; });
  var fit = pool.filter(function (s) { return s.kw >= req; })
    .sort(function (a, c) { return a.kw - c.kw; });
  if (fit.length) return fit[0];
  return pool.sort(function (a, c) { return c.kw - a.kw; })[0] || null;
}
function mzAutoApply(force) {
  var f = $('mzFmt').value, kw = parseFloat($('mzSpindle').value);
  if (force || !mzTouched('mzStab')) {
    var st = mzStabAuto();
    if (st) $('mzStab').value = st.k;
  }
  if (force || !mzTouched('mzSens')) {
    $('mzSens').value = M.sensorByFormat[f] || 'Нажимной';
  }
  var v = M.vibroByFormat[f];
  if (v && (force || !mzTouched('mzVib'))) $('mzVib').value = v;
  if (force || !mzTouched('mzCh')) $('mzCh').value = mzChillerFor(kw);
  if ($('mzSeries').value === 'M3' && (force || !mzTouched('mzCtrl')) &&
      /RichAuto|NC Studio/.test($('mzCtrl').value)) $('mzCtrl').value = 'Syntec';
}

// ------------------------------------------------------- допоборудование
function mzStabM() {
  var k = $('mzStab').value;
  return APP.stabsFull.filter(function (s) { return s.k === k; })[0] || null;
}
function mzChM() {
  var k = $('mzCh').value;
  return APP.chillersFull.filter(function (c) { return c.k === k; })[0] || null;
}
function mzAspM() {
  var k = $('mzAsp').value;
  return APP.aspiration.filter(function (a) { return a.k === k; })[0] || null;
}
function mzRotM() {
  var k = $('mzRot').value;
  return M.rot.filter(function (r) { return r.k === k; })[0] || null;
}
// Розница BELMASH плюс наша наценка 20 %, округление до 10 ₽ — как в прайсе.
function mzAspPrice(p) { return Math.round(p * APP.aspMarkup / 10) * 10; }

function mzFillStab() {
  var b = $('mzStabB').value, cur = $('mzStab').value;
  var list = APP.stabsFull.filter(function (s) { return s.b === b; });
  $('mzStab').innerHTML = list.map(function (s) {
    return '<option value="' + s.k + '">' + esc(s.n) + ' — ' + mzDec(s.kw) + ' кВт' +
      (s.p == null ? ', цены нет' : '') + '</option>';
  }).join('');
  var has = list.some(function (s) { return s.k === cur; });
  if (has) $('mzStab').value = cur;
}
function mzRenderStab() {
  var s = mzStabM();
  if (!s) return;
  var req = mzStabNeed();
  mzCard('mzStabCard', s.n, mzDec(s.kw) + ' кВт · ' + (s.ph === 3 ? '3 фазы' : '1 фаза'),
    s.d, esc(s.idx || '') + (s.idx ? '<br><br>' : '') +
    '<b>Источник:</b> ' + esc(s.src) + '<br><br>' + esc(APP.stabNote[s.b] || ''));
  var h = [];
  h.push(['Расчётное потребление станка — около ' + req + ' кВт: шпиндель ' +
    mzDec($('mzSpindle').value) + ' кВт плюс приводы и стойка' +
    ($('mzTable').value === 'VAC' ? ' плюс вакуумный насос' : '') + '.', 'ok']);
  if (s.kw < req) {
    h.push(['Стабилизатор на ' + mzDec(s.kw) + ' кВт слабее расчётной нагрузки ' +
      req + ' кВт. Возьмите мощнее — иначе он уйдёт в защиту под нагрузкой.', 'bad']);
  }
  var need380 = mzSV() === '380' || ($('mzTable').value === 'VAC' && mzTV() === '380');
  if (need380 && s.ph === 1) {
    h.push(['Станку нужны три фазы, а выбран однофазный стабилизатор.', 'bad']);
  }
  if (!need380 && s.ph === 3) {
    h.push(['Станок однофазный, а стабилизатор трёхфазный — переплата без пользы.', 'warn']);
  }
  if (s.p == null) h.push(['Цены этой модели в прайсе нет — поставьте её вручную.', 'warn']);
  mzHints('mzStabHint', h);
}
function mzRenderCh() {
  var c = mzChM();
  if (!c) return;
  var kw = parseFloat($('mzSpindle').value);
  mzCard('mzChCard', c.n, c.kwMin + '–' + c.kwMax + ' кВт по TEYU', c.d,
    esc(c.idx || '') + (c.idx ? '<br><br>' : '') + '<b>Источник:</b> ' + esc(c.src) +
    '<br><br>' + esc(APP.chCommon));
  var h = [];
  if ($('mzCool').value === 'ac') {
    h.push(['У станка воздушное охлаждение шпинделя — чиллер не нужен. ' +
      'Если оставите позицию, она попадёт в смету лишней.', 'bad']);
  } else if (kw < c.kwMin || kw > c.kwMax) {
    h.push(['Шпиндель ' + mzDec(kw) + ' кВт вне диапазона ' + c.kwMin + '–' + c.kwMax +
      ' кВт этой модели. Рекомендуемая по мощности — ' +
      esc(mzChillerFor(kw)) + '.', 'warn']);
  } else {
    h.push(['Чиллер подходит по мощности шпинделя.', 'ok']);
  }
  if (c.p == null) h.push(['Цены в прайсе LASERCUT нет — поставьте её вручную.', 'warn']);
  mzHints('mzChHint', h);
}
function mzRenderSens() {
  var k = $('mzSens').value;
  var s = M.sensors.filter(function (x) { return x.k === k; })[0];
  if (!s) return;
  mzCard('mzSensCard', s.n, '', [['Тип', s.k], ['Цена по прайсу', mzRub(s.p)]],
    'Датчик ставит ноль по Z автоматически: оператор не выставляет вылет фрезы на глаз. ' +
    'Магнитный держится на столе магнитом и удобен на настольных станках, ' +
    'нажимной устойчивее на больших полях.');
  var f = $('mzFmt').value, rec = M.sensorByFormat[f] || 'Нажимной', h = [];
  if (rec !== k) {
    h.push(['Для формата ' + f + ' обычно берут ' + rec.toLowerCase() + ' датчик.', 'warn']);
  }
  mzHints('mzSensHint', h);
}
function mzRenderVib() {
  var q = parseInt($('mzVib').value, 10) || 0;
  mzCard('mzVibCard', M.vibro.n, q + ' шт',
    [['Цена за штуку', mzRub(mzNum('mzVibP') || M.vibro.p)],
     ['Количество', q + ' шт'],
     ['Сумма', mzRub((mzNum('mzVibP') || M.vibro.p) * q)]],
    'Виброопоры гасят вибрацию станины и позволяют выставить станок по уровню ' +
    'на неровном полу. Количество зависит от длины станины.');
  var f = $('mzFmt').value, rec = M.vibroByFormat[f], h = [];
  if (rec && parseInt(rec, 10) !== q) {
    h.push(['Для формата ' + f + ' под станину обычно берут ' + rec + ' опор.', 'warn']);
  }
  if (!rec) h.push(['Для этого формата рекомендации по числу опор в данных нет.', 'warn']);
  mzHints('mzVibHint', h);
}
function mzAspIdx(name) {
  var out = [];
  Object.keys(APP.idxNotes).forEach(function (k) {
    if (new RegExp('(^|[- ])' + k + '(\\d|$|[- ])').test(name)) out.push(APP.idxNotes[k]);
  });
  return out;
}
function mzRenderAsp() {
  var a = mzAspM();
  if (!a) return;
  Array.prototype.forEach.call($('mzAV').children, function (b) {
    var can = (a.v || []).indexOf(+b.dataset.av) >= 0;
    b.disabled = !can;
    b.classList.toggle('on', can && b.dataset.av === mzAV());
  });
  if (a.nodata) {
    mzCard('mzAspCard', a.n, '', [['Данные', 'в источнике нет']],
      'По этой модели в рознице BELMASH характеристик и цены нет — уточняйте у поставщика.');
    mzHints('mzAspHint', [['Ни характеристик, ни цены по модели нет. ' +
      'Цену поставьте вручную.', 'bad']]);
    return;
  }
  var rows = [['Производительность', a.q + ' м³/ч'], ['Мощность', a.w + ' Вт'],
    ['Патрубков', a.np], ['Диаметр патрубка', a.dp + ' мм'],
    ['Фильтрация', a.f + ' мкм · ' + a.fe], ['Мешок', a.bag + ' л'],
    ['Масса', a.kg + ' кг'], ['Артикул', (a.art || {})[mzAV()] || '—'],
    ['Розница BELMASH', mzRub(a.p)],
    ['С наценкой 20 %', mzRub(mzAspPrice(a.p))]];
  if (a.db) rows.splice(7, 0, ['Шум', a.db + ' дБ']);
  mzCard('mzAspCard', a.n, mzAV() + ' В', rows,
    mzAspIdx(a.k).map(esc).join('<br><br>') ||
    'Аспирация уносит стружку и пыль от фрезы. Производительность подбирают ' +
    'по числу патрубков и длине магистрали.');
  var h = [];
  if ((a.v || []).indexOf(+mzAV()) < 0) {
    h.push(['В этом исполнении модели нет питания ' + mzAV() + ' В.', 'bad']);
  }
  var kw = parseFloat($('mzSpindle').value);
  if (kw >= 4.5 && a.q < 2000) {
    h.push(['Шпиндель ' + mzDec(kw) + ' кВт снимает много стружки, а у модели ' +
      a.q + ' м³/ч. Возьмите производительнее.', 'warn']);
  }
  h.push(['Цена в смету идёт с наценкой 20 % к рознице belmash.ru.', 'ok']);
  mzHints('mzAspHint', h);
}
function mzRenderBr() {
  var d = $('mzBr').value;
  mzCard('mzBrCard', M.brush.n + ' ⌀' + d + ' мм', '',
    [['Диаметр патрона', d + ' мм'], ['Цена по прайсу', mzRub(M.brush.p)]],
    'Щётка надевается на шпиндель и не даёт стружке разлетаться, ' +
    'работая вместе с аспирацией. Диаметр подбирается под патрон.');
  mzHints('mzBrHint', [['Диаметр щётки должен совпадать с диаметром патрона ' +
    'вашего шпинделя — проверьте по паспорту станка.', 'warn']]);
}
function mzDspPrice() { return (M.dsp[$('mzDsp').value] || {}).p || 0; }
function mzRenderDsp() {
  var v = $('mzDsp').value, ctrl = $('mzCtrl').value, i = M.dsp[v];
  mzCard('mzDspCard', i.n, v === 'up' ? 'доплата' : 'полная стоимость',
    [['RichAuto A11', mzRub(M.dsp.a11.p)], ['RichAuto A18', mzRub(M.dsp.a18.p)],
     ['Доплата за замену', mzRub(M.dsp.up.p)], ['Штатно A18', 'только M1 1325 RD']],
    'Цены из прайса LASERCUT от ' + '25.03.2026. ' +
    'Стойка уже входит в стоимость конфигурации станка — эта вкладка нужна либо ' +
    'для доплаты за замену, либо когда стойка идёт отдельной строкой. ' +
    'В остальных случаях позиция задвоится.<br><br>A11 — трёхосевой пульт, ' +
    'A18 — четырёхосевой с полноценной осью A/C. По руководству RichAuto A11 тоже ' +
    'способен крутить поворотную ось, но методом подмены: ось C подключается вместо ' +
    'X или Y через внешний переключатель, одновременной четырёхосевой интерполяции нет.');
  var h = [];
  if (v === 'up') {
    if (/A11/.test(ctrl)) {
      h.push(['В станке стоит A11 — доплата за замену корректна. После замены стойка ' +
        'станет четырёхосевой и сможет работать с поворотным устройством.', 'ok']);
    } else if (/A18/.test(ctrl)) {
      h.push(['В станке уже указана A18 — доплата не нужна, позиция задвоится.', 'bad']);
    } else {
      h.push(['В станке стойка ' + esc(ctrl) + ', а не DSP RichAuto. Замена A11 на A18 ' +
        'к ней не применима.', 'warn']);
    }
  }
  if (v === 'a11' && /A11/.test(ctrl)) {
    h.push(['A11 уже указана как стойка станка — позиция задвоится.', 'bad']);
  }
  if (v === 'a18' && /A18/.test(ctrl)) {
    h.push(['A18 уже указана как стойка станка — позиция задвоится.', 'bad']);
  }
  mzHints('mzDspHint', h);
}
// Влезает ли заготовка: высота центра оси, ход Z и вылет фрезы.
function mzRotFit(r) {
  var z = mzZ();
  if (!z || r.h == null || r.k === 'wattsan') return null;
  var free = z - r.h, byZ = 2 * (free - M.toolClr);
  return { z: z, free: free, byZ: byZ, eff: Math.min(r.dmax, byZ),
    ok: byZ >= r.dmax, bad: byZ <= 0 };
}
function mzRotBest() {
  if (!mzZ()) return null;
  var fits = M.rot.filter(function (r) { return r.h != null && r.k !== 'wattsan'; })
    .map(function (r) { return { r: r, f: mzRotFit(r) }; })
    .filter(function (x) { return x.f && x.f.ok; });
  return fits.length ? fits[fits.length - 1].r : null;
}
function mzRenderRot() {
  var r = mzRotM();
  if (!r) return;
  var incl = M.rotTailIncl.indexOf(r.k) >= 0;
  $('mzRotT').disabled = incl;
  $('mzRotOn').disabled = r.k === 'wattsan';
  if (r.k === 'wattsan') $('mzRotOn').checked = false;
  var tail = $('mzRotT').value === '1' && !incl;
  var fit = mzRotFit(r), best = mzRotBest(), z = mzZ();
  var rows = r.d.slice();
  if (tail) rows.push(['Задняя бабка отдельно', mzRub(M.rotTail)]);
  if (fit) {
    rows.push(['Ход по Z у серии', fit.z + ' мм']);
    rows.push(['Просвет над патроном', fit.free + ' мм']);
    rows.push(['Заготовка по расчёту', fit.bad ? 'не проходит'
      : 'до ⌀' + fit.eff + ' мм']);
  }
  mzCard('mzRotCard', r.n, r.sub, rows,
    esc(r.idx) + '<br><br>' + esc(M.rotNote) + '<br><br>' + esc(M.rotFitNote));
  var h = [];
  if (r.k === 'wattsan') {
    h.push(['Это заводское исполнение RD: ось входит в цену станка, отдельной ' +
      'позицией в смету не идёт. Выберите конфигурацию RD в списке станков.', 'ok']);
  } else if (!z) {
    h.push(['Ход по Z для этой серии в данных не указан — влезание заготовки ' +
      'посчитать не можем.', 'warn']);
  } else if (fit && fit.bad) {
    h.push(['Высота центра ' + r.h + ' мм больше хода по Z (' + z + ' мм) с учётом ' +
      'вылета фрезы. Узел физически не встанет под портал.', 'bad']);
  } else if (fit && !fit.ok) {
    h.push(['По расчёту пройдёт заготовка до ⌀' + fit.eff + ' мм вместо паспортных ⌀' +
      r.dmax + ' мм: ход по Z ' + z + ' мм ограничивает.', 'warn']);
  } else if (fit) {
    h.push(['Заготовка до ⌀' + r.dmax + ' мм проходит по ходу Z.', 'ok']);
  }
  if (best && best.k !== r.k) {
    h.push(['Максимум для этой серии по расчёту — ' + esc(best.n) + '.', 'ok']);
  }
  var ctrl = $('mzCtrl').value;
  if (r.k !== 'wattsan' && !/A18|Syntec|NC8|F7324/.test(ctrl)) {
    h.push(['Стойка ' + esc(ctrl) + ' не четырёхосевая. Нужна A18 или промышленная ' +
      'стойка — иначе ось придётся подключать подменой оси X или Y.', 'warn']);
  }
  if (incl) h.push(['Задняя бабка у этого исполнения уже в комплекте.', 'ok']);
  h.push(['Цена — розница магазинов ЧПУ-комплектующих, разброс между продавцами ' +
    'достигает двух раз. Перед КП подтвердите её у поставщика.', 'warn']);
  mzHints('mzRotHint', h);
}

// ------------------------------------------------------------------ ПНР
function mzPnrGroupOf() {
  var s = $('mzSeries').value, f = $('mzFmt').value;
  if (s === 'M3') return { k: 'm3', exact: ['1313', '1325', '1616', '2030', '2040'].indexOf(f) >= 0 };
  if (s === 'MINI') return { k: 'mini', exact: true };
  if (s === 'MINI Cabine') return { k: 'miniCab', exact: true };
  if (s === 'M1 S4') return { k: 's4', exact: f === '1313' };
  if (s === 'M1 RD') return { k: 'rd', exact: true };
  var near = M.pnrNear[f] || f;
  if (near === '2040') near = '2030';
  var has = APP.pnrGroups.some(function (g) { return g.k === near; });
  return { k: has ? near : '', exact: has && near === f };
}
function mzPnrM() {
  var k = $('mzPnrGroup').value;
  return APP.pnrGroups.filter(function (g) { return g.k === k; })[0] || null;
}
function mzPnrVars(g) {
  var out = [['pnr', 'Только ПНР, ' + cnt(g.d, ['день', 'дня', 'дней']), g.pnr]];
  if (g.d1) out.push(['d1', 'ПНР плюс 1 день', g.d1]);
  if (g.d2) out.push(['d2', 'ПНР плюс 2 дня', g.d2]);
  if (g.eduIncl) out.push(['edu', 'Обучение — входит в ПНР', 0]);
  else if (g.edu) out.push(['edu', 'Только обучение', g.edu]);
  if (g.both) out.push(['both', 'ПНР и обучение', g.both]);
  return out;
}
function mzFillPnrVar() {
  var g = mzPnrM();
  if (!g) { $('mzPnrVar').innerHTML = ''; return; }
  var cur = $('mzPnrVar').value, vars = mzPnrVars(g);
  $('mzPnrVar').innerHTML = vars.map(function (v) {
    return '<option value="' + v[0] + '">' + esc(v[1]) + ' — ' + mzRub(v[2]) + '</option>';
  }).join('');
  if (vars.some(function (v) { return v[0] === cur; })) $('mzPnrVar').value = cur;
}
function mzPnrBase() {
  var g = mzPnrM();
  if (!g) return 0;
  var v = $('mzPnrVar').value;
  var row = mzPnrVars(g).filter(function (x) { return x[0] === v; })[0];
  return row ? row[2] : 0;
}
// Коэффициент выезда — наценка, поэтому считаем её в копейках через money.js.
function mzPnrPrice() {
  var base = toCents(mzPnrBase());
  var k = $('mzPnrK').value === '12' ? 200 : 0;
  return k ? sNacenkoy(base, k) : base;
}
function mzRenderPnr() {
  var g = mzPnrM(), auto = mzPnrGroupOf(), h = [];
  if (!g) {
    mzHints('mzPnrHint', [['Для этой серии строки ПНР в прайсе нет. Цену запрашивайте ' +
      'у сервиса и ставьте вручную.', 'warn']]);
    return;
  }
  if (auto.k && auto.k !== g.k) {
    h.push(['Под выбранный станок в прайсе идёт группа «' +
      esc((APP.pnrGroups.filter(function (x) { return x.k === auto.k; })[0] || {}).n || '') +
      '».', 'warn']);
  } else if (auto.k && !auto.exact) {
    h.push(['Своей строки ПНР у формата ' + $('mzFmt').value + ' в прайсе нет — ' +
      'подставлена группа ближайшего станка. Перед КП подтвердите цену у сервиса.', 'warn']);
  } else if (auto.k) {
    h.push(['Группа подобрана по прайсу под выбранный станок.', 'ok']);
  }
  if (g.eduIncl) h.push(['У этой группы обучение входит в ПНР — отдельной строкой ' +
    'его ставить не нужно.', 'ok']);
  if ($('mzPnrK').value === '12') {
    h.push(['Коэффициент 1,2 применяется, когда инженер выезжает к станку, ' +
      'купленному не у нас.', 'ok']);
  }
  mzHints('mzPnrHint', h);
}

// ------------------------------------------------------- спецификация и смета
// Каждая строка: наименование, цена в копейках, количество, тип для сметы.
function mzSpec() {
  var out = [];
  var f = $('mzFmt').value;
  var F = M.formats.filter(function (x) { return x[0] === f; })[0];
  var name = 'Фрезерный станок с ЧПУ Wattsan ' + $('mzSeries').value + ' ' + f +
    ', ' + mzDec($('mzSpindle').value) + ' кВт ' +
    ($('mzCool').value === 'wc' ? 'wc' : 'ac') + ', ' + $('mzCtrl').value +
    ($('mzTable').value === 'VAC' ? ', вакуумный стол' : '');
  var c = MZCAT[mzSel];
  if (c && c.i === mzSel) name = 'Фрезерный станок с ЧПУ Wattsan ' + c.n;
  if (mzNum('mzPrice')) {
    out.push({ n: name, c: toCents(mzNum('mzPrice')), q: 1, t: 'eq',
      d: [['Рабочее поле', (F ? F[1] : f) + ' мм'],
        ['Шпиндель', mzDec($('mzSpindle').value) + ' кВт · ' +
          ($('mzCool').value === 'wc' ? 'водяное' : 'воздушное') + ' · ' + mzSV() + ' В'],
        ['Стол', $('mzTable').value + ($('mzTable').value === 'VAC'
          ? ', насос ' + mzTV() + ' В' : '')],
        ['Стойка ЧПУ', $('mzCtrl').value], ['Двигатели', $('mzMotor').value],
        ['Поставка', mzKey() === 'order' ? APP.deliveryOrder : APP.deliveryStock]] });
  }
  if ($('mzStabOn').checked && mzStabM()) {
    out.push({ n: mzStabM().n, c: toCents(mzNum('mzStabP')), q: 1, t: 'opt' });
  }
  if ($('mzChOn').checked && mzChM()) {
    out.push({ n: 'Чиллер ' + mzChM().n, c: toCents(mzNum('mzChP')), q: 1, t: 'opt' });
  }
  if ($('mzSensOn').checked) {
    var sn = M.sensors.filter(function (x) { return x.k === $('mzSens').value; })[0];
    out.push({ n: (sn ? sn.n : 'Датчик высоты инструмента'),
      c: toCents(mzNum('mzSensP')), q: 1, t: 'opt' });
  }
  if ($('mzVibOn').checked) {
    out.push({ n: M.vibro.n, c: toCents(mzNum('mzVibP')),
      q: parseInt($('mzVib').value, 10) || 1, t: 'opt' });
  }
  if ($('mzAspOn').checked && mzAspM()) {
    out.push({ n: 'Аспирация ' + mzAspM().n + ', ' + mzAV() + ' В',
      c: toCents(mzNum('mzAspP')), q: 1, t: 'opt' });
  }
  if ($('mzBrOn').checked) {
    out.push({ n: M.brush.n + ' ⌀' + $('mzBr').value + ' мм',
      c: toCents(mzNum('mzBrP')), q: 1, t: 'opt' });
  }
  if ($('mzDspOn').checked) {
    out.push({ n: M.dsp[$('mzDsp').value].n, c: toCents(mzNum('mzDspP')), q: 1, t: 'opt' });
  }
  if ($('mzRotOn').checked && mzRotM() && mzRotM().k !== 'wattsan') {
    var r = mzRotM();
    var tail = $('mzRotT').value === '1' && M.rotTailIncl.indexOf(r.k) < 0;
    out.push({ n: 'Поворотное устройство ' + r.n + (tail ? ' с задней бабкой' : ''),
      c: toCents(mzNum('mzRotP')), q: 1, t: 'opt' });
  }
  if ($('mzExtraOn').checked && $('mzExtraN').value.trim()) {
    out.push({ n: $('mzExtraN').value.trim(), c: toCents(mzNum('mzExtraP')), q: 1, t: 'opt' });
  }
  if ($('mzPnrOn').checked && mzPnrM()) {
    var g = mzPnrM();
    var vv = mzPnrVars(g).filter(function (x) { return x[0] === $('mzPnrVar').value; })[0];
    out.push({ n: 'Пусконаладка и обучение: ' + g.n + ' — ' + (vv ? vv[1] : ''),
      c: toCents(mzNum('mzPnrP')), q: 1, t: 'srv' });
  }
  return out;
}
// Нестыковки всей сборки: то, что менеджер не должен отправить клиенту.
function mzIssues() {
  var out = [];
  if (!mzNum('mzPrice')) {
    out.push(['Цена станка не заполнена — выберите конфигурацию из прайса ' +
      'или введите цену вручную.', 'bad']);
  }
  if ($('mzCool').value === 'wc' && !$('mzChOn').checked) {
    out.push(['Шпиндель с водяным охлаждением, а чиллера в спецификации нет. ' +
      'Без него станок работать не должен.', 'bad']);
  }
  if ($('mzCool').value === 'ac' && $('mzChOn').checked) {
    out.push(['Охлаждение воздушное, а чиллер в спецификации есть — лишняя позиция.', 'bad']);
  }
  if (!$('mzStabOn').checked) {
    out.push(['Стабилизатора в спецификации нет. Паспорт требует стабильного питания, ' +
      'без него гарантия под вопросом.', 'warn']);
  }
  if (!$('mzPnrOn').checked) {
    out.push(['ПНР и обучение не включены. Они платные и в цену станка не входят — ' +
      'клиент должен видеть их отдельной строкой или знать, что их нет.', 'warn']);
  }
  if ($('mzRotOn').checked && !/A18|Syntec|NC8|F7324/.test($('mzCtrl').value)) {
    out.push(['В смете есть поворотная ось, а стойка станка не четырёхосевая.', 'bad']);
  }
  ['mzStabHint', 'mzChHint', 'mzSensHint', 'mzVibHint', 'mzAspHint', 'mzBrHint',
    'mzDspHint', 'mzRotHint'].forEach(function (id) {
    if (mzFlags[id] === 'bad') {
      var box = id.replace('Hint', 'On');
      if ($(box) && $(box).checked) {
        out.push(['В позиции «' + esc(($(box).closest('.mzpane')
          .querySelector('label.f') || {}).textContent || 'допоборудование') +
          '» есть нестыковка — проверьте вкладку.', 'bad']);
      }
    }
  });
  return out;
}
function mzRenderSpec() {
  var rows = mzSpec(), sum = 0;
  rows.forEach(function (r) { sum += r.c * r.q; });
  $('mzEmpty').hidden = !!rows.length;
  $('mzBody').innerHTML = rows.map(function (r) {
    return '<tr><td>' + esc(r.n) + (r.q > 1 ? ' <span class="muted">× ' + r.q + '</span>' : '') +
      '</td><td class="num">' + fmtRub(r.c * r.q) + ' ₽</td></tr>';
  }).join('');
  var nds = ndsIznutri(sum, APP.ndsDefault * 10);
  $('mzTotals').innerHTML = '<div class="spec-line"><span>Итого</span><b>' +
    fmtRub(sum) + ' ₽</b></div><div class="spec-line small muted"><span>в том числе НДС ' +
    APP.ndsDefault + ' %</span><span>' + fmtRub(nds) + ' ₽</span></div>';
  $('mzCnt').textContent = rows.length ? cnt(rows.length, ['позиция', 'позиции', 'позиций']) : '';
  var iss = mzIssues();
  $('mzIssues').innerHTML = iss.map(function (r) {
    return '<div class="mzhint ' + r[1] + '">' + r[0] + '</div>';
  }).join('');
  $('mzOut').value = rows.map(function (r) {
    return r.n + (r.q > 1 ? ' × ' + r.q : '') + ' — ' + fmtRub(r.c * r.q) + ' руб.';
  }).join('\n') + (rows.length ? '\nИтого: ' + fmtRub(sum) + ' руб.' : '');
  var c = MZCAT[mzSel];
  $('mzHead').textContent = c ? 'Из прайса: ' + c.n
    : 'Своя конфигурация — цену вводите вручную.';
}

// ------------------------------------------------------------- цены по умолчанию
function mzPriceDefaults() {
  var s = mzStabM(), c = mzChM(), a = mzAspM();
  var e = mzExact();
  mzSel = e ? e.i : null;
  if (!mzTouched('mzPrice')) $('mzPrice').value = e ? mzPriceOf(e) : '';
  if (!mzTouched('mzStabP')) $('mzStabP').value = s && s.p != null ? s.p : '';
  if (!mzTouched('mzChP')) $('mzChP').value = c && c.p != null ? c.p : '';
  if (!mzTouched('mzSensP')) {
    var sn = M.sensors.filter(function (x) { return x.k === $('mzSens').value; })[0];
    $('mzSensP').value = sn ? sn.p : '';
  }
  if (!mzTouched('mzVibP')) $('mzVibP').value = M.vibro.p;
  if (!mzTouched('mzBrP')) $('mzBrP').value = M.brush.p;
  if (!mzTouched('mzAspP')) $('mzAspP').value = a && a.p ? mzAspPrice(a.p) : '';
  if (!mzTouched('mzDspP')) $('mzDspP').value = mzDspPrice();
  var rm = mzRotM();
  if (rm && M.rotTailIncl.indexOf(rm.k) >= 0) $('mzRotT').value = '0';
  if (!mzTouched('mzRotP')) {
    var own = mzS.rotPrices[$('mzRot').value];
    $('mzRotP').value = ((own != null && own > 0) ? own : (rm ? rm.p : 0)) +
      ($('mzRotT').value === '1' ? M.rotTail : 0);
  }
  if (!mzTouched('mzPnrP')) $('mzPnrP').value = Math.round(mzPnrPrice() / 100);
}

// ------------------------------------------------------------------ вкладки
function mzRenderMTabs() {
  $('mzMTabs').innerHTML = M.mcats.map(function (c) {
    return '<button type="button" class="pill' + (c.k === mzMCat ? ' on' : '') +
      '" data-mcat="' + c.k + '" role="tab">' + esc(c.n) + '</button>';
  }).join('');
  M.mcats.forEach(function (c) {
    var p = $('mzp_' + c.k);
    if (p) p.hidden = !(mzS.mode === 'custom' && c.k === mzMCat);
  });
}
function mzRenderTabs() {
  $('mzTabs').innerHTML = M.cats.map(function (c) {
    var ids = c.hi || [c.k + 'Hint'];
    var flag = '';
    ids.forEach(function (x) {
      var key = 'mz' + x.charAt(0).toUpperCase() + x.slice(1);
      if (mzFlags[key] === 'bad') flag = 'bad';
      else if (mzFlags[key] === 'warn' && flag !== 'bad') flag = 'warn';
    });
    var on = (c.on || []).some(function (id) {
      var box = $('mz' + id.charAt(0).toUpperCase() + id.slice(1));
      return box && box.checked;
    });
    return '<button type="button" class="pill' + (c.k === mzCat ? ' on' : '') +
      (flag ? ' flag-' + flag : '') + '" data-cat="' + c.k + '" role="tab">' +
      esc(c.n) + (on ? ' ·' : '') + '</button>';
  }).join('');
  M.cats.forEach(function (c) {
    var p = $('mzp_' + c.k);
    if (p) p.hidden = c.k !== mzCat;
  });
}
function mzRenderModes() {
  $('mzModes').innerHTML = [['ready', 'Готовая из прайса'], ['custom', 'Своя конфигурация']]
    .map(function (m) {
      return '<button type="button" class="pill' + (mzS.mode === m[0] ? ' on' : '') +
        '" data-mode="' + m[0] + '" role="tab">' + m[1] + '</button>';
    }).join('');
  $('mzMTabs').hidden = mzS.mode !== 'custom';
  $('mzMatchWrap').hidden = mzS.mode !== 'custom';
}

// ------------------------------------------------------------- пересчёт всего
var mzBusy = false;
function mzUpdate() {
  if (mzBusy) return;
  mzBusy = true;
  mzApplyVolt();
  mzAutoApply(false);
  mzFillStab();
  mzPriceDefaults();
  mzSyncMachine();
  mzRenderSeries(); mzRenderFmt(); mzRenderSpindle(); mzRenderTable();
  mzRenderCtrl(); mzRenderMotor();
  mzRenderStab(); mzRenderCh(); mzRenderSens(); mzRenderVib();
  mzRenderAsp(); mzRenderBr(); mzRenderDsp(); mzRenderRot();
  mzFillPnrVar(); mzRenderPnr();
  mzRenderModes(); mzRenderMTabs(); mzRenderTabs();
  mzRenderReady(); mzRenderMatches(); mzRenderSimilar();
  mzRenderSpec();
  $('mzCfgCnt').textContent = cnt(MZCAT.length, ['конфигурация', 'конфигурации',
    'конфигураций']) + ' в прайсе';
  mzSave();
  mzBusy = false;
}
// Черновик вкладки: поля и галочки переживают перезагрузку, как в других разделах.
var MZ_FIELDS = ['mzSeries', 'mzFmt', 'mzPrice', 'mzStock', 'mzSpindle', 'mzCool',
  'mzTable', 'mzCtrl', 'mzMotor', 'mzStabB', 'mzStab', 'mzStabP', 'mzCh', 'mzChP',
  'mzSens', 'mzSensP', 'mzVib', 'mzVibP', 'mzAsp', 'mzAspP', 'mzBr', 'mzBrP',
  'mzDsp', 'mzDspP', 'mzRot', 'mzRotT', 'mzRotP', 'mzExtraN', 'mzExtraP',
  'mzPnrGroup', 'mzPnrVar', 'mzPnrK', 'mzPnrP'];
var MZ_CHECKS = ['mzStabOn', 'mzChOn', 'mzSensOn', 'mzVibOn', 'mzAspOn', 'mzBrOn',
  'mzDspOn', 'mzRotOn', 'mzExtraOn', 'mzPnrOn'];
function mzSave() {
  var f = {};
  MZ_FIELDS.forEach(function (id) {
    if ($(id)) f[id] = { v: $(id).value, t: $(id).dataset.touched || '0' };
  });
  var ch = {};
  MZ_CHECKS.forEach(function (id) { if ($(id)) ch[id] = $(id).checked; });
  mzS.fields = f; mzS.checks = ch; mzS.cat = mzCat; mzS.mcat = mzMCat;
  save();
}
function mzLoad() {
  if (mzS.fields) {
    Object.keys(mzS.fields).forEach(function (id) {
      var box = $(id), v = mzS.fields[id];
      if (!box || !v) return;
      box.value = v.v;
      box.dataset.touched = v.t;
    });
  }
  if (mzS.checks) {
    Object.keys(mzS.checks).forEach(function (id) {
      if ($(id)) $(id).checked = !!mzS.checks[id];
    });
  }
  if (mzS.cat) mzCat = mzS.cat;
  if (mzS.mcat) mzMCat = mzS.mcat;
}

// ---------------------------------------------------------------- заполнение
function mzFill() {
  $('mzSeries').innerHTML = M.series.map(function (s) {
    return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
  }).join('');
  $('mzSpindle').innerHTML = M.spindles.map(function (s) {
    return '<option value="' + s + '">' + mzDec(s) + ' кВт</option>';
  }).join('');
  $('mzCtrl').innerHTML = Object.keys(M.ctrlInfo).map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + '</option>';
  }).join('');
  $('mzMotor').innerHTML = Object.keys(M.motorInfo).map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + '</option>';
  }).join('');
  $('mzStabB').innerHTML = APP.stabBrands.map(function (b) {
    return '<option value="' + b[0] + '">' + esc(b[1]) + '</option>';
  }).join('');
  $('mzCh').innerHTML = APP.chillersFull.map(function (c) {
    return '<option value="' + c.k + '">' + esc(c.n) + ' — ' + c.kwMin + '–' +
      c.kwMax + ' кВт</option>';
  }).join('');
  $('mzSens').innerHTML = M.sensors.map(function (s) {
    return '<option value="' + esc(s.k) + '">' + esc(s.k) + '</option>';
  }).join('');
  $('mzVib').innerHTML = M.vibro.qty.map(function (q) {
    return '<option value="' + q + '">' + q + ' шт</option>';
  }).join('');
  $('mzAsp').innerHTML = APP.aspiration.map(function (a) {
    return '<option value="' + a.k + '">' + esc(a.n) + '</option>';
  }).join('');
  $('mzBr').innerHTML = APP.brushes.map(function (b) {
    return '<option value="' + b + '">⌀' + b + ' мм</option>';
  }).join('');
  $('mzRot').innerHTML = M.rot.map(function (r) {
    return '<option value="' + r.k + '">' + esc(r.n) + '</option>';
  }).join('');
  $('mzPnrGroup').innerHTML = APP.pnrGroups.map(function (g) {
    return '<option value="' + g.k + '">' + esc(g.n) + '</option>';
  }).join('');
  $('mzCtrl').value = 'DSP RichAuto A11';
  $('mzMotor').value = 'Шаговые с обратной связью (Leadshine)';
  $('mzSpindle').value = '3.2';
  mzFillFmt();
  var g = mzPnrGroupOf();
  if (g.k) $('mzPnrGroup').value = g.k;
  mzFillPnrVar();
}

// ----------------------------------------------------------------- события
function mzBind() {
  MZ_FIELDS.forEach(function (id) {
    var box = $(id);
    if (!box) return;
    box.addEventListener('change', function () {
      mzTouch(id);
      if (id === 'mzSeries') {
        mzFillFmt();
        var g = mzPnrGroupOf();
        if (g.k && !mzTouched('mzPnrGroup')) $('mzPnrGroup').value = g.k;
      }
      if (id === 'mzFmt') {
        var g2 = mzPnrGroupOf();
        if (g2.k && !mzTouched('mzPnrGroup')) $('mzPnrGroup').value = g2.k;
      }
      if (id === 'mzStabB') mzTouch('mzStab', false);
      if (id === 'mzRot' || id === 'mzRotT') mzTouch('mzRotP', false);
      if (id === 'mzPnrGroup') mzTouch('mzPnrVar', false);
      if (id === 'mzPnrGroup' || id === 'mzPnrVar' || id === 'mzPnrK') mzTouch('mzPnrP', false);
      if (id === 'mzDsp') mzTouch('mzDspP', false);
      if (id === 'mzSens') mzTouch('mzSensP', false);
      if (id === 'mzRotP') {
        var r = mzRotM();
        if (r) {
          mzS.rotPrices[r.k] = mzNum('mzRotP') -
            ($('mzRotT').value === '1' && M.rotTailIncl.indexOf(r.k) < 0 ? M.rotTail : 0);
        }
      }
      mzUpdate();
    });
  });
  MZ_CHECKS.forEach(function (id) {
    if ($(id)) $(id).addEventListener('change', mzUpdate);
  });
  $('mzModes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]');
    if (!b) return;
    mzS.mode = b.dataset.mode;
    mzUpdate();
  });
  $('mzMTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mcat]');
    if (!b) return;
    mzMCat = b.dataset.mcat;
    mzRenderMTabs();
    mzSave();
  });
  $('mzTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    mzCat = b.dataset.cat;
    mzRenderTabs();
    mzSave();
  });
  $('mzSV').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sv]');
    if (!b || b.disabled) return;
    mzS.sv = b.dataset.sv;
    mzUpdate();
  });
  $('mzTV').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tv]');
    if (!b || b.disabled) return;
    mzS.tv = b.dataset.tv;
    mzUpdate();
  });
  $('mzAV').addEventListener('click', function (e) {
    var b = e.target.closest('[data-av]');
    if (!b || b.disabled) return;
    mzS.av = b.dataset.av;
    mzUpdate();
  });
  ['mzReady', 'mzSimilar', 'mzMatchList'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('[data-cfg]');
      if (b) { mzApplyCfg(+b.dataset.cfg); return; }
      var p = e.target.closest('[data-price]');
      if (p) {
        $('mzPrice').value = +p.dataset.price;
        mzTouch('mzPrice');
        mzUpdate();
      }
    });
  });
  // Документ отсюда не собирается: позиции уходят в раздел «Смета и ТКП»,
  // где лист предложения и файл для Word делаются фирменным шаблоном.
  $('mzToSmeta').addEventListener('click', function () {
    var rows = mzSpec();
    if (!rows.length) { toast('Спецификация пуста — начните со станка'); return; }
    rows.forEach(function (r) {
      addItem(r.n, Math.round(r.c / 100), r.q, r.t);
    });
    toast('Перенесено в смету: ' + cnt(rows.length, ['позиция', 'позиции', 'позиций']));
    showTab('smeta');
  });
  $('mzCopy').addEventListener('click', function () {
    var ta = $('mzOut');
    if (!ta.value) { toast('Спецификация пуста'); return; }
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(ta.value).then(function () {
        toast('Конфигурация скопирована');
      }, function () { toast('Скопируйте текст вручную — поле выделено'); });
      return;
    }
    toast(ok ? 'Конфигурация скопирована' : 'Скопируйте текст вручную — поле выделено');
  });
  $('mzPrint').addEventListener('click', function () {
    var p = $('p-mill');
    p.classList.add('printme');
    try { window.print(); } finally {
      setTimeout(function () { p.classList.remove('printme'); }, 300);
    }
  });
  $('mzReset').addEventListener('click', function () {
    if (!window.confirm('Сбросить конфигурацию фрезерного станка?')) return;
    MZ_FIELDS.forEach(function (id) { if ($(id)) mzTouch(id, false); });
    MZ_CHECKS.forEach(function (id) { if ($(id)) $(id).checked = false; });
    state.mill = { rotPrices: {}, mode: 'ready' };
    mzS = state.mill;
    mzFill();
    mzUpdate();
    toast('Конфигурация сброшена');
  });
}

mzFill();
mzLoad();
mzBind();
mzUpdate();
