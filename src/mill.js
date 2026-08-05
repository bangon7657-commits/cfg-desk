/* Вкладка «Фрезерный»: сборка станка по узлам, допоборудование, ПНР.
   Вёрстка и порядок блоков — как в присланном конфигураторе, цвета берутся
   из темы приложения. Файл вставляется в ui.js по маркеру, поэтому пользуется
   его $, esc, cnt, toast, addItem, showTab, state и save. Деньги считаются
   только через money.js, в копейках. Документ отсюда не печатается:
   спецификация уходит в раздел «Смета и ТКП». */
var M = APP.mill;

// Точная мощность шпинделя есть только в названии конфигурации: в колонке
// прайса она округлена до целых, а 3,0 и 3,2 кВт — разные шпиндели.
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
function mzRub(rub) { return fmtMoney(toCents(rub || 0)) + ' ₽'; }
function mzNum(id) { return +$(id).value || 0; }
function mzTouched(id) { return $(id).dataset.touched === '1'; }
function mzTouch(id, on) { $(id).dataset.touched = on === false ? '0' : '1'; }

if (!state.mill) state.mill = {};
var mzS = state.mill;
if (!mzS.rotPrices) mzS.rotPrices = {};
if (!mzS.mode) mzS.mode = 'ready';
var mzSel = null;
var mzCat = 'stab';
var mzMCat = 'spin';
var mzFlags = {};

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
    return '<div class="hint ' + (r[1] || '') + '">' + r[0] + '</div>';
  }).join('');
}
// Карточка узла: раскрывающийся блок с парами «параметр — значение» и пояснением.
function mzCard(id, title, sub, pairs, foot, open) {
  var box = $(id);
  if (!box) return;
  var wasOpen = open;
  var det = box.querySelector('details');
  if (det && wasOpen === undefined) wasOpen = det.open;
  var dl = (pairs && pairs.length)
    ? '<dl>' + pairs.map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(String(p[1])) + '</dd>';
    }).join('') + '</dl>' : '';
  box.innerHTML = '<details class="specbox"' + (wasOpen ? ' open' : '') +
    '><summary>' + esc(title) + (sub ? ' <span>· ' + esc(sub) + '</span>' : '') +
    '</summary><div class="body">' + dl +
    (foot ? '<div class="idx">' + foot + '</div>' : '') + '</div></details>';
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
  var box = $('mzReadyList');
  $('mzReady').style.display = mzS.mode === 'ready' ? '' : 'none';
  if (mzS.mode !== 'ready') { box.innerHTML = ''; return; }
  var list = mzBySeries($('mzSeries').value).filter(function (c) {
    return c.f === $('mzFmt').value;
  });
  if (!list.length) {
    box.innerHTML = '<div class="hint warn">Готовых конфигураций для этой пары ' +
      'в прайсе нет. Соберите свою и введите цену вручную.</div>';
    return;
  }
  box.innerHTML = list.map(function (c) {
    return '<button type="button" class="rcard' + (mzSel === c.i ? ' on' : '') +
      '" data-cfg="' + c.i + '"><b>' + esc(c.n) + '</b><div class="rs">' +
      esc(mzCfgSpec(c)) + '</div><div class="rp">' + mzRub(mzPriceOf(c)) +
      '<em>' + (mzKey() === 'order' ? 'под заказ' : 'из наличия') + '</em></div></button>';
  }).join('');
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
  scored.sort(function (a, b) {
    return a.w - b.w || Math.abs(mzPriceOf(a.c) - base) - Math.abs(mzPriceOf(b.c) - base);
  });
  scored = scored.slice(0, 6);
  if (!scored.length) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="simh">Рядом в прайсе</div><div class="sim">' +
    scored.map(function (x) {
      var dp = mzPriceOf(x.c) - base;
      var cls = dp > 0 ? 'up' : (dp < 0 ? 'dn' : 'eq');
      var txt = dp > 0 ? '+' + mzRub(dp) : (dp < 0 ? '−' + mzRub(-dp) : 'та же цена');
      return '<button type="button" class="simc" data-cfg="' + x.c.i + '"><b>' +
        esc(x.c.n) + '</b><div class="df">' + esc(x.d.join(', ')) +
        '</div><div class="dp ' + cls + '">' + txt + '</div></button>';
    }).join('') + '</div>';
}
function mzRenderMatches() {
  var list = mzBySeries($('mzSeries').value).filter(function (c) {
    return c.f === $('mzFmt').value;
  });
  var box = $('mzMatchList');
  var e = mzExact();
  if (!list.length) {
    box.innerHTML = '<div class="hint warn">В прайсе нет такой связки ' +
      '«серия и рабочее поле». Проверьте выбор или введите цену вручную.</div>';
    return;
  }
  box.innerHTML = list.map(function (c) {
    return '<button type="button" class="mrow' + (e && e.i === c.i ? ' best' : '') +
      '" data-price="' + mzPriceOf(c) + '"><span>' + (e && e.i === c.i ? '▸ ' : '') +
      esc(c.n) + '<br><span style="color:var(--muted);font-size:11.5px">' +
      esc(mzCfgSpec(c)) + '</span></span><b>' + mzRub(mzPriceOf(c)) + '</b></button>';
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
  $('mzSV220').checked = v.v === '220';
  $('mzSV380').checked = v.v === '380';
  $('mzSV220').disabled = v.only;
  $('mzSV380').disabled = v.only;
}
function mzSV() { return mzSpindleVolt().v; }
function mzTV() { return $('mzTV220').checked ? '220' : '380'; }
function mzAV() { return $('mzAV220').checked ? '220' : '380'; }
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
  rows.push(['Конфигураций', list.length]);
  if (prices.length) {
    rows.push(['Цена в прайсе', prices.length > 1
      ? mzRub(prices[0]) + ' – ' + mzRub(prices[prices.length - 1]) : mzRub(prices[0])]);
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
function mzSyncMachine() {
  var tbl = $('mzTable').value, cool = $('mzCool').value;
  var s = $('mzSeries').value, kw = parseFloat($('mzSpindle').value);
  var isVac = tbl === 'VAC';
  $('mzTV220').disabled = !isVac;
  $('mzTV380').disabled = !isVac;
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
  if (force || !mzTouched('mzSens')) $('mzSens').value = M.sensorByFormat[f] || 'Нажимной';
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
    return '<option value="' + s.k + '">' + esc(s.n) + '</option>';
  }).join('');
  if (list.some(function (s) { return s.k === cur; })) $('mzStab').value = cur;
}
function mzRenderStab() {
  var s = mzStabM();
  if (!s) return;
  var req = mzStabNeed();
  mzCard('mzStabCard', s.n, mzDec(s.kw) + ' кВт · ' + (s.ph === 3 ? '3 фазы' : '1 фаза'),
    s.d, esc(s.idx || '') + (s.idx ? '<br><br>' : '') + '<b>Источник:</b> ' +
    esc(s.src) + '<br><br>' + esc(APP.stabNote[s.b] || ''));
  var h = [];
  h.push(['Расчётное потребление станка — около ' + req + ' кВт: шпиндель ' +
    mzDec($('mzSpindle').value) + ' кВт плюс приводы и стойка' +
    ($('mzTable').value === 'VAC' ? ' плюс вакуумный насос' : '') + '.', 'ok']);
  if (s.kw < req) {
    h.push(['Стабилизатор на ' + mzDec(s.kw) + ' кВт слабее расчётной нагрузки ' +
      req + ' кВт. Возьмите мощнее — иначе он уйдёт в защиту под нагрузкой.', 'bad']);
  }
  var need380 = mzSV() === '380' || ($('mzTable').value === 'VAC' && mzTV() === '380');
  if (need380 && s.ph === 1) h.push(['Станку нужны три фазы, а выбран однофазный стабилизатор.', 'bad']);
  if (!need380 && s.ph === 3) h.push(['Станок однофазный, а стабилизатор трёхфазный — переплата без пользы.', 'warn']);
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
      ' кВт этой модели. По мощности подходит CW-' + esc(mzChillerFor(kw)) + '.', 'warn']);
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
    'Датчик ставит ноль по Z автоматически: оператор не выставляет вылет фрезы ' +
    'на глаз. Магнитный держится на столе магнитом и удобен на настольных станках, ' +
    'нажимной устойчивее на больших полях.');
  var f = $('mzFmt').value, rec = M.sensorByFormat[f] || 'Нажимной', h = [];
  if (rec !== k) h.push(['Для формата ' + f + ' обычно берут ' + rec.toLowerCase() + ' датчик.', 'warn']);
  mzHints('mzSensHint', h);
}
function mzRenderVib() {
  var q = parseInt($('mzVib').value, 10) || 0;
  var p = mzNum('mzVibP') || M.vibro.p;
  mzCard('mzVibCard', M.vibro.n, q + ' шт',
    [['Цена за штуку', mzRub(p)], ['Количество', q + ' шт'], ['Сумма', mzRub(p * q)]],
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
  var can220 = (a.v || []).indexOf(220) >= 0, can380 = (a.v || []).indexOf(380) >= 0;
  $('mzAV220').disabled = !can220;
  $('mzAV380').disabled = !can380;
  if (!can220 && can380) $('mzAV380').checked = true;
  if (!can380 && can220) $('mzAV220').checked = true;
  if (!$('mzAV220').checked && !$('mzAV380').checked) $('mzAV220').checked = true;
  if (a.nodata) {
    mzCard('mzAspCard', a.n, '', [['Данные', 'в источнике нет']],
      'По этой модели в рознице BELMASH характеристик и цены нет — уточняйте у поставщика.');
    mzHints('mzAspHint', [['Ни характеристик, ни цены по модели нет. Цену поставьте вручную.', 'bad']]);
    return;
  }
  var rows = [['Производительность', a.q + ' м³/ч'], ['Мощность', a.w + ' Вт'],
    ['Патрубков', a.np], ['Диаметр патрубка', a.dp + ' мм'],
    ['Фильтрация', a.f + ' мкм · ' + a.fe], ['Мешок', a.bag + ' л']];
  if (a.db) rows.push(['Шум', a.db + ' дБ']);
  rows.push(['Масса', a.kg + ' кг']);
  rows.push(['Артикул', (a.art || {})[mzAV()] || '—']);
  rows.push(['Розница BELMASH', mzRub(a.p)]);
  rows.push(['С наценкой 20 %', mzRub(mzAspPrice(a.p))]);
  mzCard('mzAspCard', a.n, mzAV() + ' В', rows,
    mzAspIdx(a.k).map(esc).join('<br><br>') ||
    'Аспирация уносит стружку и пыль от фрезы. Производительность подбирают ' +
    'по числу патрубков и длине магистрали.');
  var h = [], kw = parseFloat($('mzSpindle').value);
  if (kw >= 4.5 && a.q < 2000) {
    h.push(['Шпиндель ' + mzDec(kw) + ' кВт снимает много стружки, а у модели ' +
      a.q + ' м³/ч. Возьмите производительнее.', 'warn']);
  }
  h.push(['Цена в смету идёт с наценкой 20 % к рознице belmash.ru.', 'ok']);
  mzHints('mzAspHint', h);
}
function mzRenderBr() {
  var dd = $('mzBr').value;
  mzCard('mzBrCard', M.brush.n + ' ⌀' + dd + ' мм', '',
    [['Диаметр патрона', dd + ' мм'], ['Цена по прайсу', mzRub(M.brush.p)]],
    'Щётка надевается на шпиндель и не даёт стружке разлетаться, работая вместе ' +
    'с аспирацией. Диаметр подбирается под патрон.');
  mzHints('mzBrHint', [['Диаметр щётки должен совпадать с диаметром патрона вашего ' +
    'шпинделя — проверьте по паспорту станка.', 'warn']]);
}
function mzDspPrice() { return (M.dsp[$('mzDsp').value] || {}).p || 0; }
function mzRenderDsp() {
  var v = $('mzDsp').value, ctrl = $('mzCtrl').value, i = M.dsp[v];
  mzCard('mzDspCard', i.n, v === 'up' ? 'доплата' : 'полная стоимость',
    [['RichAuto A11', mzRub(M.dsp.a11.p)], ['RichAuto A18', mzRub(M.dsp.a18.p)],
     ['Доплата за замену', mzRub(M.dsp.up.p)], ['Штатно A18', 'только M1 1325 RD']],
    'Цены из прайса LASERCUT от 25.03.2026. Стойка уже входит в стоимость ' +
    'конфигурации станка — эта вкладка нужна либо для доплаты за замену, либо ' +
    'когда стойка идёт отдельной строкой. В остальных случаях позиция задвоится.' +
    '<br><br>A11 — трёхосевой пульт, A18 — четырёхосевой с полноценной осью A/C. ' +
    'По руководству RichAuto A11 тоже способен крутить поворотную ось, но методом ' +
    'подмены: ось C подключается вместо X или Y через внешний переключатель, ' +
    'одновременной четырёхосевой интерполяции при этом нет.');
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
  if (v === 'a11' && /A11/.test(ctrl)) h.push(['A11 уже указана как стойка станка — позиция задвоится.', 'bad']);
  if (v === 'a18' && /A18/.test(ctrl)) h.push(['A18 уже указана как стойка станка — позиция задвоится.', 'bad']);
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
    rows.push(['Заготовка по расчёту', fit.bad ? 'не проходит' : 'до ⌀' + fit.eff + ' мм']);
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
  if (best && best.k !== r.k) h.push(['Максимум для этой серии по расчёту — ' + esc(best.n) + '.', 'ok']);
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
// Коэффициент выезда — это наценка, поэтому считаем её в копейках через money.js.
function mzPnrPrice() {
  var base = toCents(mzPnrBase());
  return $('mzPnrK').value === '12' ? sNacenkoy(base, 200) : base;
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
  if (g.eduIncl) h.push(['У этой группы обучение входит в ПНР — отдельной строкой его ставить не нужно.', 'ok']);
  if ($('mzPnrK').value === '12') {
    h.push(['Коэффициент 1,2 применяется, когда инженер выезжает к станку, купленному не у нас.', 'ok']);
  }
  mzHints('mzPnrHint', h);
}

// ------------------------------------------------------- спецификация и смета
var MZ_SECS = [{ k: 'eq', n: 'Станок', c: 'var(--or)' },
  { k: 'opt', n: 'Допоборудование', c: 'var(--ok)' },
  { k: 'srv', n: 'Услуги', c: 'var(--warn)' }];

function mzSpec() {
  if (mzKind() === 'fiber') return fbSpec();
  var out = [];
  var f = $('mzFmt').value;
  var F = M.formats.filter(function (x) { return x[0] === f; })[0];
  var c = MZCAT[mzSel];
  var name = c ? 'Фрезерный станок с ЧПУ Wattsan ' + c.n
    : 'Фрезерный станок с ЧПУ Wattsan ' + $('mzSeries').value + ' ' + f + ', ' +
      mzDec($('mzSpindle').value) + ' кВт ' + ($('mzCool').value === 'wc' ? 'wc' : 'ac') +
      ', ' + $('mzCtrl').value + ($('mzTable').value === 'VAC' ? ', вакуумный стол' : '');
  if (mzNum('mzPrice')) {
    out.push({ n: name, c: toCents(mzNum('mzPrice')), q: 1, t: 'eq',
      d: [['Рабочее поле', (F ? F[1] : f) + ' мм'],
        ['Шпиндель', mzDec($('mzSpindle').value) + ' кВт · ' +
          ($('mzCool').value === 'wc' ? 'водяное' : 'воздушное') + ' · ' + mzSV() + ' В'],
        ['Стол', $('mzTable').value + ($('mzTable').value === 'VAC' ? ', насос ' + mzTV() + ' В' : '')],
        ['Стойка ЧПУ', $('mzCtrl').value],
        ['Двигатели', $('mzMotor').value],
        ['Поставка', mzKey() === 'order' ? APP.deliveryOrder : APP.deliveryStock]] });
  }
  if ($('mzStabOn').checked && mzStabM()) out.push({ n: mzStabM().n, c: toCents(mzNum('mzStabP')), q: 1, t: 'opt' });
  if ($('mzChOn').checked && mzChM()) out.push({ n: 'Чиллер ' + mzChM().n, c: toCents(mzNum('mzChP')), q: 1, t: 'opt' });
  if ($('mzSensOn').checked) {
    var sn = M.sensors.filter(function (x) { return x.k === $('mzSens').value; })[0];
    out.push({ n: sn ? sn.n : 'Датчик высоты инструмента', c: toCents(mzNum('mzSensP')), q: 1, t: 'opt' });
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
    out.push({ n: M.brush.n + ' ⌀' + $('mzBr').value + ' мм', c: toCents(mzNum('mzBrP')), q: 1, t: 'opt' });
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
function mzIssues() {
  if (mzKind() === 'fiber') return fbIssues();
  var out = [];
  if (!mzNum('mzPrice')) {
    out.push(['Цена станка не заполнена — выберите конфигурацию из прайса или введите цену вручную.', 'bad']);
  }
  if ($('mzCool').value === 'wc' && !$('mzChOn').checked) {
    out.push(['Шпиндель с водяным охлаждением, а чиллера в спецификации нет. Без него станок работать не должен.', 'bad']);
  }
  if ($('mzCool').value === 'ac' && $('mzChOn').checked) {
    out.push(['Охлаждение воздушное, а чиллер в спецификации есть — лишняя позиция.', 'bad']);
  }
  if (!$('mzStabOn').checked) {
    out.push(['Стабилизатора в спецификации нет. Паспорт требует стабильного питания, без него гарантия под вопросом.', 'warn']);
  }
  if (!$('mzPnrOn').checked) {
    out.push(['ПНР и обучение не включены. Они платные и в цену станка не входят — клиент должен видеть их отдельной строкой.', 'warn']);
  }
  if ($('mzRotOn').checked && !/A18|Syntec|NC8|F7324/.test($('mzCtrl').value)) {
    out.push(['В смете есть поворотная ось, а стойка станка не четырёхосевая.', 'bad']);
  }
  return out;
}
function mzRenderSpec() {
  var rows = mzSpec(), sum = 0, byType = { eq: 0, opt: 0, srv: 0 };
  rows.forEach(function (r) { sum += r.c * r.q; byType[r.t] += r.c * r.q; });

  if (mzKind() === 'fiber') {
    $('mzCfgHead').innerHTML = '<b>' + esc(fbName()) + '</b><span>' +
      esc('Источник ' + $('fbPow').value + ' Вт · поле ' +
        APP.fiberFormats[$('fbFmt').value] + ' мм') + '</span>';
    $('mzSpecMeta').textContent = 'Прайс волокна от ' + APP.priceDatesFiber;
  }
  var c = MZCAT[mzSel];
  if (mzKind() !== 'fiber') $('mzCfgHead').innerHTML = '<b>' + esc(c ? 'Wattsan ' + c.n
    : 'Wattsan ' + $('mzSeries').value + ' ' + $('mzFmt').value) + '</b><span>' +
    esc(mzDec($('mzSpindle').value) + ' кВт · ' +
      ($('mzCool').value === 'wc' ? 'водяное' : 'воздушное') + ' · стол ' +
      $('mzTable').value + ' · ' + $('mzCtrl').value) + '</span>';
  $('mzSpecMeta').textContent = c ? 'Конфигурация из прайса, ' +
    (mzKey() === 'order' ? 'цена под заказ' : 'цена из наличия')
    : 'Своя конфигурация — цену вводите вручную';

  var html = '';
  MZ_SECS.forEach(function (sec) {
    var list = rows.filter(function (r) { return r.t === sec.k; });
    if (!list.length) return;
    html += '<div class="sec"><div class="sech"><span>' + sec.n + '</span><b>' +
      fmtMoney(byType[sec.k]) + ' ₽</b></div>';
    list.forEach(function (r) {
      html += '<div class="srow"><span>' + esc(r.n) +
        (r.q > 1 ? ' × ' + r.q : '') + '</span><span class="v">' +
        fmtMoney(r.c * r.q) + ' ₽</span></div>';
      (r.d || []).forEach(function (dd) {
        html += '<div class="sdet"><span>' + esc(dd[0]) + '</span><span>' +
          esc(String(dd[1])) + '</span></div>';
      });
    });
    html += '</div>';
  });
  $('mzSpecBody').innerHTML = html;

  // полоса долей: сразу видно, сколько в смете станка, обвязки и услуг
  $('mzSplit').innerHTML = sum ? MZ_SECS.map(function (sec) {
    var w = byType[sec.k] / sum * 100;
    return w ? '<i style="width:' + w.toFixed(2) + '%;background:' + sec.c + '"></i>' : '';
  }).join('') : '';
  $('mzLegend').innerHTML = sum ? MZ_SECS.filter(function (sec) { return byType[sec.k]; })
    .map(function (sec) {
      return '<span><em style="background:' + sec.c + '"></em>' + sec.n + ' — ' +
        fmtMoney(byType[sec.k]) + ' ₽</span>';
    }).join('') : '';

  $('mzSum').textContent = fmtMoney(sum) + ' ₽';
  $('mzSumBar').textContent = fmtMoney(sum) + ' ₽';
  $('mzPosCount').textContent = rows.length
    ? ' · ' + cnt(rows.length, ['позиция', 'позиции', 'позиций']) : '';
  // ndsIznutri отдаёт пару «без НДС и сам НДС» — в плашке нужен второй
  $('mzVat').textContent = sum
    ? 'в том числе НДС ' + APP.ndsDefault + ' % — ' +
      fmtMoney(ndsIznutri(sum, APP.ndsDefault * 10).nds) + ' ₽' : '';
  $('mzIssues').innerHTML = mzIssues().map(function (r) {
    return '<div class="issue' + (r[1] === 'warn' ? ' warn' : '') + '">' + r[0] + '</div>';
  }).join('');
  $('mzOut').value = rows.map(function (r) {
    return r.n + (r.q > 1 ? ' × ' + r.q : '') + ' — ' + fmtMoney(r.c * r.q) + ' руб.';
  }).join('\n') + (rows.length ? '\nИтого: ' + fmtMoney(sum) + ' руб.' : '');
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

// ------------------------------------------------------- категория станка
// По узлам пока собирается только фрезерный. Остальные три категории живут
// в старом конфигураторе — он ещё работает в разделе «На удаление», поэтому
// отсюда на него можно перейти, не теряя набранную смету.
var MZ_KINDS = [
  { id: 'milling', t: 'Фрезерный', here: true },
  { id: 'fiber', t: 'Волокно по металлу', here: true },
  { id: 'co2', t: 'Лазерный CO₂' },
  { id: 'marker', t: 'Маркиратор' }
];
function mzKind() { return mzS.kind === 'fiber' ? 'fiber' : 'milling'; }
function mzRenderKinds() {
  var box = $('mzKinds');
  if (!box) return;
  var cur = mzKind();
  box.innerHTML = MZ_KINDS.map(function (k) {
    var on = k.here && k.id === cur;
    return '<button type="button" class="' + (on ? 'on' : '') + '" data-kind="' +
      k.id + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
      (k.here ? '' : ' title="Пока собирается в старом конфигураторе"') + '>' +
      esc(k.t) + (k.here ? '' : '<small>в старом конфигураторе</small>') + '</button>';
  }).join('');
  var h1 = $('p-mill').querySelector('.mzhead h1');
  if (h1) {
    h1.textContent = cur === 'fiber'
      ? 'Конфигуратор v2 · лазерный станок по металлу Wattsan'
      : 'Конфигуратор v2 · фрезерный станок Wattsan';
  }
}

// -------------------------------------------------------------------- шаги
// Три блока показываются по одному: слева видно, где ты находишься и что уже
// заполнено, внизу — листалка. Так на экране помещается сам блок, а не его шапка.
var MZ_STEPS = [
  { n: 1, t: 'Станок', s: 'серия, поле, узлы' },
  { n: 2, t: 'Доп. оборудование', s: 'обвязка и 4-я ось' },
  { n: 3, t: 'ПНР и обучение', s: 'пусконаладка по прайсу' }
];
function mzStepDone(n) {
  if (mzKind() === 'fiber') {
    if (n === 1) return !!mzNum('fbPrice');
    if (n === 2) {
      return ['fbStabOn', 'fbComprOn', 'fbExtOn', 'fbCryoOn', 'fbExtraOn',
        'fbCabinOn', 'fbBedOn'].some(function (id) { return $(id) && $(id).checked; });
    }
    return $('fbPnrOn') && $('fbPnrOn').checked;
  }
  if (n === 1) return !!mzNum('mzPrice');
  if (n === 2) {
    return ['mzStabOn', 'mzChOn', 'mzSensOn', 'mzVibOn', 'mzAspOn', 'mzBrOn',
      'mzDspOn', 'mzRotOn', 'mzExtraOn'].some(function (id) {
      return $(id) && $(id).checked;
    });
  }
  return $('mzPnrOn') && $('mzPnrOn').checked;
}
function mzShowStep(n) {
  n = Math.min(MZ_STEPS.length, Math.max(1, n || 1));
  mzS.step = n;
  var box = $('p-mill'), kind = mzKind();
  Array.prototype.forEach.call(box.querySelectorAll('.mzstep'), function (c) {
    var mine = !c.dataset.kind || c.dataset.kind === 'any' || c.dataset.kind === kind;
    c.classList.toggle('on', mine && +c.dataset.step === n);
  });
  // у волокна ПНР в прайсе нет: вместо групп — своя строка с ручной ценой
  var pnrBox = $('fbPnrBox');
  if (pnrBox) pnrBox.hidden = kind !== 'fiber';
  Array.prototype.forEach.call(
    box.querySelectorAll('[data-step="3"] .panehead.b5, #mzPnrHint'), function (el2) {
      el2.style.display = kind === 'fiber' ? 'none' : '';
    });
  $('mzStepNav').innerHTML = MZ_STEPS.map(function (st) {
    var done = mzStepDone(st.n) && st.n !== n;
    return '<li><button type="button" class="mzstep-b' + (st.n === n ? ' on' : '') +
      (done ? ' done' : '') + '" data-step="' + st.n + '"' +
      (st.n === n ? ' aria-current="step"' : '') + '><span class="n"><span>' +
      st.n + '</span></span><span class="t">' + esc(st.t) +
      '<small>' + esc(st.s) + '</small></span></button></li>';
  }).join('');
  $('mzPrev').disabled = n === 1;
  $('mzNext').disabled = n === MZ_STEPS.length;
  $('mzStepTx').textContent = 'Шаг ' + n + ' из ' + MZ_STEPS.length + ' · ' +
    MZ_STEPS[n - 1].t;
  save();
}

// ------------------------------------------------------------------ вкладки
function mzRenderMTabs() {
  $('mzMTabs').style.display = mzS.mode === 'custom' ? '' : 'none';
  $('mzMatchWrap').style.display = mzS.mode === 'custom' ? '' : 'none';
  $('mzMTabs').innerHTML = M.mcats.map(function (c) {
    return '<button type="button" class="tab' + (c.k === mzMCat ? ' on' : '') +
      '" data-mcat="' + c.k + '">' + esc(c.n) + '</button>';
  }).join('');
  M.mcats.forEach(function (c) {
    var p = $('mzp_' + c.k);
    if (p) p.classList.toggle('on', mzS.mode === 'custom' && c.k === mzMCat);
  });
}
function mzRenderTabs() {
  $('mzTabs').innerHTML = M.cats.map(function (c) {
    var ids = c.hi || [c.k + 'Hint'];
    var flag = '';
    ids.forEach(function (x) {
      var key = 'mz' + x.charAt(0).toUpperCase() + x.slice(1);
      if (mzFlags[key] === 'bad') flag = 'f-bad';
      else if (mzFlags[key] === 'warn' && flag !== 'f-bad') flag = 'f-warn';
    });
    var on = (c.on || []).some(function (id) {
      var box = $('mz' + id.charAt(0).toUpperCase() + id.slice(1));
      return box && box.checked;
    });
    return '<button type="button" class="tab' + (c.k === mzCat ? ' on' : '') +
      (on ? ' sel' : '') + (flag ? ' ' + flag : '') + '" data-cat="' + c.k + '">' +
      esc(c.n) + '</button>';
  }).join('');
  M.cats.forEach(function (c) {
    var p = $('mzp_' + c.k);
    if (p) p.classList.toggle('on', c.k === mzCat);
  });
}
function mzRenderModes() {
  Array.prototype.forEach.call($('mzModes').children, function (b) {
    b.classList.toggle('on', b.dataset.mode === mzS.mode);
  });
}

// ------------------------------------------------------------- пересчёт всего
var mzBusy = false;
function mzUpdate() {
  if (mzBusy) return;
  mzBusy = true;
  if (mzKind() === 'fiber') {
    fbUpdate();
    mzRenderKinds();
    mzRenderSpec();
    mzShowStep(mzS.step || 1);
    $('mzCfgCnt').textContent = ' · ' + cnt(APP.fiberA.length + APP.fiberS.length,
      ['конфигурация', 'конфигурации', 'конфигураций']) + ' в прайсе';
    mzSave();
    mzBusy = false;
    return;
  }
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
  mzRenderKinds();
  mzRenderModes(); mzRenderMTabs(); mzRenderTabs();
  mzRenderReady(); mzRenderMatches(); mzRenderSimilar();
  mzRenderSpec();
  mzShowStep(mzS.step || 1);
  $('mzCfgCnt').textContent = ' · ' + cnt(MZCAT.length,
    ['конфигурация', 'конфигурации', 'конфигураций']) + ' в прайсе';
  mzSave();
  mzBusy = false;
}
var MZ_FIELDS = ['mzSeries', 'mzFmt', 'mzPrice', 'mzStock', 'mzSpindle', 'mzCool',
  'mzTable', 'mzCtrl', 'mzMotor', 'mzStabB', 'mzStab', 'mzStabP', 'mzCh', 'mzChP',
  'mzSens', 'mzSensP', 'mzVibM', 'mzVib', 'mzVibP', 'mzAsp', 'mzAspP', 'mzBr', 'mzBrP',
  'mzDsp', 'mzDspP', 'mzRot', 'mzRotT', 'mzRotP', 'mzExtraN', 'mzExtraP',
  'mzPnrGroup', 'mzPnrVar', 'mzPnrK', 'mzPnrP'];
var MZ_CHECKS = ['mzStabOn', 'mzChOn', 'mzSensOn', 'mzVibOn', 'mzAspOn', 'mzBrOn',
  'mzDspOn', 'mzRotOn', 'mzExtraOn', 'mzPnrOn'];
var MZ_RADIO = ['mzSV220', 'mzSV380', 'mzTV220', 'mzTV380', 'mzAV220', 'mzAV380'];
function mzSave() {
  var f = {};
  MZ_FIELDS.forEach(function (id) {
    if ($(id)) f[id] = { v: $(id).value, t: $(id).dataset.touched || '0' };
  });
  var ch = {};
  MZ_CHECKS.concat(MZ_RADIO).forEach(function (id) { if ($(id)) ch[id] = $(id).checked; });
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
    return '<option value="' + s + '">' + mzDec(s) + '</option>';
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
    return '<option value="' + c.k + '">' + esc(c.n) + '</option>';
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
    return '<option value="' + b + '">⌀ ' + b + ' мм</option>';
  }).join('');
  $('mzRot').innerHTML = M.rot.map(function (r) {
    return '<option value="' + r.k + '">' + esc(r.n) + '</option>';
  }).join('');
  $('mzPnrGroup').innerHTML = APP.pnrGroups.map(function (g) {
    return '<option value="' + g.k + '">' + esc(g.n) + '</option>';
  }).join('');
  $('mzSeries').value = 'M1';
  $('mzCtrl').value = 'DSP RichAuto A11';
  $('mzMotor').value = 'Шаговые с обратной связью (Leadshine)';
  $('mzSpindle').value = '4.5';
  $('mzAsp').value = 'DC2500';
  $('mzBr').value = '100';
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
      if (id === 'mzSeries') mzFillFmt();
      if (id === 'mzSeries' || id === 'mzFmt') {
        var g = mzPnrGroupOf();
        if (g.k && !mzTouched('mzPnrGroup')) $('mzPnrGroup').value = g.k;
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
  MZ_RADIO.forEach(function (id) {
    if ($(id)) {
      $(id).addEventListener('change', function () {
        if (id.indexOf('mzSV') === 0) mzS.sv = $(id).value;
        mzUpdate();
      });
    }
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
  $('mzKinds').addEventListener('click', function (e) {
    var b = e.target.closest('[data-kind]');
    if (!b) return;
    var id = b.dataset.kind;
    var here = MZ_KINDS.filter(function (k) { return k.id === id; })[0];
    if (here && here.here) {
      if (mzKind() === id) return;
      mzS.kind = id;
      mzS.step = 1;
      save();
      mzUpdate();
      return;
    }
    state.build.kind = id;
    save();
    // без перерисовки старый конфигуратор откроется на прошлой категории
    renderBuild();
    renderTemplates();
    toast('Эта категория пока собирается в старом конфигураторе');
    showTab('build');
  });
  $('mzStepNav').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (b) mzShowStep(+b.dataset.step);
  });
  $('mzPrev').addEventListener('click', function () { mzShowStep((mzS.step || 1) - 1); });
  $('mzNext').addEventListener('click', function () { mzShowStep((mzS.step || 1) + 1); });
  ['mzReadyList', 'mzSimilar', 'mzMatchList'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('[data-cfg]');
      if (b) { mzApplyCfg(+b.dataset.cfg); return; }
      var p = e.target.closest('[data-price]');
      if (p) {
        if (mzTouched('mzPrice') && mzNum('mzPrice') && mzNum('mzPrice') !== +p.dataset.price &&
            !window.confirm('Цена станка была введена вручную. Заменить на ' +
              mzRub(+p.dataset.price) + '?')) return;
        $('mzPrice').value = +p.dataset.price;
        mzTouch('mzPrice');
        mzUpdate();
      }
    });
  });
  // Документ собирает раздел «Смета и ТКП»: сюда позиции только уходят.
  function toSmeta() {
    var rows = mzSpec();
    if (!rows.length) { toast('Спецификация пуста — начните со станка'); return; }
    rows.forEach(function (r) { addItem(r.n, Math.round(r.c / 100), r.q, r.t); });
    toast('Перенесено в смету: ' + cnt(rows.length, ['позиция', 'позиции', 'позиций']));
    showTab('smeta');
  }
  $('mzToSmeta').addEventListener('click', toSmeta);
  $('mzBarSmeta').addEventListener('click', toSmeta);
  $('mzBarSpec').addEventListener('click', function () {
    $('p-mill').querySelector('.side').scrollIntoView({ behavior: 'smooth' });
  });
  $('mzCopy').addEventListener('click', function () {
    var ta = $('mzOut');
    if (!ta.value) { toast('Спецификация пуста'); return; }
    ta.classList.add('on');
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
    $('mzOut').classList.remove('on');
    mzFill();
    mzUpdate();
    toast('Конфигурация сброшена');
  });
}


// ====================================================================
// ВОЛОКНО ПО МЕТАЛЛУ. Второй конфигуратор в том же разделе: шаги, шапка
// и спецификация общие, свои — только состав станка и обвязка.
// ====================================================================
if (!mzS.fb) mzS.fb = {};
var fbS = mzS.fb;
if (!fbS.series) fbS.series = 'S';
if (!fbS.mode) fbS.mode = 'ready';
var fbCat = 'stab';
var fbSel = null;

function fbSeries() { return fbS.series === 'A' ? 'A' : 'S'; }
function fbRows() {
  // строки прайса выбранной серии: у A только база, у S ещё стол и труборез
  if (fbSeries() === 'A') {
    return APP.fiberA.map(function (r) {
      return { f: r.format, p: r.power, base: r.price };
    });
  }
  var src = fbServoM() && fbServoM().price_from === 'bochu' ? APP.fiberSBochu : APP.fiberS;
  return src.map(function (r) {
    return { f: r.format, p: r.power, base: r.base, table: r.table,
      rot: r.rot, tableRot: r.tableRot };
  });
}
// Привод и усиление — два отдельных поля, как в прайсе: бренд и уровень осей.
function fbServoId() {
  var drive = ($('fbDrive') && $('fbDrive').value) || 'yaskawa';
  var boost = $('fbBoost') && $('fbBoost').value === '1';
  return drive + (boost ? '_plus' : '_std');
}
function fbServoM() {
  var id = fbServoId();
  return APP.servo.filter(function (s) { return s.id === id; })[0] || APP.servo[0];
}
function fbRow() {
  var f = $('fbFmt').value, p = parseInt($('fbPow').value, 10);
  return fbRows().filter(function (r) { return r.f === f && r.p === p; })[0] || null;
}
// Надбавка за усиленные приводы зависит от формата: у больших станков оси мощнее
function fbServoAdd() {
  var s = fbServoM();
  if (!s) return 0;
  var small = APP.servoSmall.indexOf($('fbFmt').value) >= 0;
  return small ? s.add.small : s.add.big;
}
function fbBasePrice() {
  var r = fbRow();
  if (!r) return 0;
  if (fbSeries() === 'A') return r.base;
  var rot = $('fbRot').value, table = $('fbTable').value === '1';
  var price = r.base;
  if (table && rot) price = (r.tableRot || {})[rot] || price;
  else if (table) price = r.table || price;
  else if (rot) price = (r.rot || {})[rot] || price;
  return price + fbServoAdd();
}
function fbFillFmt() {
  var cur = $('fbFmt').value, seen = {}, out = [];
  fbRows().forEach(function (r) { if (!seen[r.f]) { seen[r.f] = 1; out.push(r.f); } });
  out.sort();
  $('fbFmt').innerHTML = out.map(function (f) {
    return '<option value="' + f + '">' + f + ' · ' + APP.fiberFormats[f] + ' мм</option>';
  }).join('');
  if (out.indexOf(cur) >= 0) $('fbFmt').value = cur;
}
function fbFillPow() {
  var f = $('fbFmt').value, cur = $('fbPow').value, out = [];
  fbRows().forEach(function (r) { if (r.f === f && out.indexOf(r.p) < 0) out.push(r.p); });
  out.sort(function (a, b) { return a - b; });
  $('fbPow').innerHTML = out.map(function (p) {
    return '<option value="' + p + '">' + p + ' Вт</option>';
  }).join('');
  if (out.indexOf(parseInt(cur, 10)) >= 0) $('fbPow').value = cur;
}
function fbFillRot() {
  var r = fbRow(), cur = $('fbRot').value;
  var keys = r && r.rot ? Object.keys(r.rot) : [];
  $('fbRot').innerHTML = '<option value="">не нужен</option>' + keys.map(function (k) {
    return '<option value="' + k + '">труборез ' + k + '</option>';
  }).join('');
  if (keys.indexOf(cur) >= 0) $('fbRot').value = cur;
}
function fbFillServo() {
  var sel = $('fbSeriesSel');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="A">Серия A</option>' +
      '<option value="S">Серия S</option>';
  }
  if (fbS.series !== 'A' && fbS.series !== 'S') fbS.series = 'S';
  if (sel.value !== fbS.series) sel.value = fbS.series;
  var isA = fbSeries() === 'A';
  // У серии A привод один — DELTA, выбора нет
  $('fbDrive').disabled = isA;
  $('fbBoost').disabled = isA;
  if (isA) $('fbBoost').value = '0';
  $('fbBoostP').value = fbServoAdd() || '';
}
function fbName() {
  var f = $('fbFmt').value, p = $('fbPow').value;
  var n = 'Лазерный станок по металлу Wattsan ' + fbSeries() + ' ' + f + ' ' + p + ' Вт';
  if (fbSeries() === 'S') {
    if ($('fbTable').value === '1') n += ', сменный стол';
    if ($('fbRot').value) n += ', труборез ' + $('fbRot').value;
    n += ', приводы ' + fbServoM().label;
  }
  return n;
}
function fbRenderKit() {
  var p = parseInt($('fbPow').value, 10);
  var kit = APP.fiberKit[String(p)];
  if (!kit) { $('fbKitCard').innerHTML = ''; return; }
  var rows = [['Контроллер', kit.ctrl], ['Голова', kit.head], ['Чиллер', kit.chiller]];
  if ($('fbRot').value) rows.push(['Стойка под труборез', APP.fiberKitRotaryCtrl]);
  mzCard('fbKitCard', 'Что входит в цену станка', p + ' Вт', rows,
    esc(APP.kpIncluded.join('. ')) + '.<br><br>' + esc(APP.kpIncludedNote));
}
function fbRenderSeries() {
  var rows = APP.techAvsS.map(function (r) { return [r[0], fbSeries() === 'A' ? r[1] : r[2]]; });
  mzCard('fbSeriesCard', 'Серия Wattsan ' + fbSeries(),
    fbSeries() === 'A' ? 'начальный уровень' : 'рабочая серия, сменный стол и труборез',
    rows, esc(APP.techAvsSAnswer || ''));
}
function fbRenderHints() {
  var h = [], p = parseInt($('fbPow').value, 10);
  var cut = APP.techCutMax.filter(function (r) { return r[0].indexOf(String(p)) === 0; })[0];
  if (cut) {
    h.push(['Предельные толщины на ' + p + ' Вт: сталь ' + cut[1] + ', нержавейка ' +
      cut[2] + ', алюминий ' + cut[3] + '. Это максимум по паспорту, рабочие ' +
      'толщины ниже.', 'ok']);
  }
  if (fbSeries() === 'A') {
    h.push(['У серии A нет сменного стола и трубореза — они есть только у S.', 'warn']);
    h.push(['В прайсе серия A есть только на 3000 Вт и в двух форматах.', 'warn']);
  }
  if ($('fbRot').value) {
    h.push(['С труборезом ставится стойка ' + APP.fiberKitRotaryCtrl +
      ' — она уже учтена в цене конфигурации.', 'ok']);
  }
  if (fbServoAdd()) {
    h.push(['Усиленные приводы: надбавка ' + mzRub(fbServoAdd()) + ' к цене прайса. ' +
      esc(fbServoM().note), 'ok']);
  }
  h.push(['Стабилизатор для металлореза обязателен: паспорт запрещает работу без ' +
    'него, генератор как источник питания запрещён.', 'warn']);
  mzHints('fbHints', h);
}
function fbRenderSimilar() {
  var base = mzNum('fbPrice');
  var f = $('fbFmt').value, p = parseInt($('fbPow').value, 10);
  if (!base) { $('fbSimilar').innerHTML = ''; return; }
  var out = [];
  fbRows().forEach(function (r) {
    if (r.f === f && r.p === p) return;
    var d = [];
    if (r.f !== f) d.push('поле ' + APP.fiberFormats[r.f]);
    if (r.p !== p) d.push(r.p + ' Вт');
    if (d.length > 1) return;
    out.push({ r: r, d: d.join(', '), price: r.base + fbServoAdd() });
  });
  out.sort(function (a, b) { return Math.abs(a.price - base) - Math.abs(b.price - base); });
  out = out.slice(0, 6);
  if (!out.length) { $('fbSimilar').innerHTML = ''; return; }
  $('fbSimilar').innerHTML = '<div class="simh">Рядом в прайсе</div><div class="sim">' +
    out.map(function (x) {
      var dp = x.price - base;
      var cls = dp > 0 ? 'up' : (dp < 0 ? 'dn' : 'eq');
      var txt = dp > 0 ? '+' + mzRub(dp) : (dp < 0 ? '−' + mzRub(-dp) : 'та же цена');
      return '<button type="button" class="simc" data-fb="' + x.r.f + ':' + x.r.p +
        '"><b>' + esc('Wattsan ' + fbSeries() + ' ' + x.r.f + ' ' + x.r.p + ' Вт') +
        '</b><div class="df">' + esc(x.d) + '</div><div class="dp ' + cls + '">' +
        txt + '</div></button>';
    }).join('') + '</div>';
}

// -------------------------------------- готовые конфигурации из прайса
// Разворачиваем строки прайса в плоский список: одна плитка — одна цена.
function fbCatalog() {
  var out = [];
  fbRows().forEach(function (r) {
    if (fbSeries() === 'A') {
      out.push({ f: r.f, p: r.p, tbl: 0, rot: '', price: r.base });
      return;
    }
    out.push({ f: r.f, p: r.p, tbl: 0, rot: '', price: r.base });
    if (r.table) out.push({ f: r.f, p: r.p, tbl: 1, rot: '', price: r.table });
    Object.keys(r.rot || {}).forEach(function (k) {
      out.push({ f: r.f, p: r.p, tbl: 0, rot: k, price: r.rot[k] });
    });
    Object.keys(r.tableRot || {}).forEach(function (k) {
      out.push({ f: r.f, p: r.p, tbl: 1, rot: k, price: r.tableRot[k] });
    });
  });
  return out;
}
function fbCfgKey(c) { return c.f + ':' + c.p + ':' + c.tbl + ':' + c.rot; }
function fbCfgSpec(c) {
  var o = [];
  if (c.tbl) o.push('сменный стол');
  if (c.rot) o.push('труборез ' + c.rot);
  return o.length ? o.join(' + ') : 'база';
}
function fbCfgName(c) {
  return 'Wattsan ' + fbSeries() + ' ' + c.f + ' ' + (c.p / 1000) + ' кВт';
}
function fbApplyCfg(key) {
  var c = fbCatalog().filter(function (x) { return fbCfgKey(x) === key; })[0];
  if (!c) return;
  var full = c.price + fbServoAdd();
  if (mzTouched('fbPrice') && mzNum('fbPrice') && mzNum('fbPrice') !== full &&
      !window.confirm('Цена станка была введена вручную. Заменить на ' +
        mzRub(full) + '?')) return;
  $('fbFmt').value = c.f;
  fbFillPow();
  $('fbPow').value = String(c.p);
  fbFillRot();
  $('fbTable').value = String(c.tbl);
  $('fbRot').value = c.rot;
  fbSel = fbCfgKey(c);
  mzTouch('fbPrice', false);
  mzUpdate();
}
function fbRenderModes() {
  Array.prototype.forEach.call($('fbModes').children, function (b) {
    b.classList.toggle('on', b.dataset.fbmode === fbS.mode);
  });
  $('fbReady').style.display = fbS.mode === 'ready' ? '' : 'none';
}
// Фильтры над плитками: без них 24 карточки на поле — это стена текста.
function fbOptKind(c) {
  if (c.tbl && c.rot) return 'both';
  if (c.tbl) return 'tbl';
  if (c.rot) return 'rot';
  return 'base';
}
var FB_OPT_NAMES = { base: 'База', tbl: 'Со столом', rot: 'С труборезом',
  both: 'Стол и труборез' };
function fbChips(group, items, cur) {
  return '<div class="rfgroup"><b>' + esc(group.n) + '</b>' +
    items.map(function (it) {
      return '<button type="button" class="chip' + (it.k === cur ? ' on' : '') +
        '" data-fbf="' + group.k + ':' + it.k + '">' + esc(it.n) +
        (it.c === undefined ? '' : '<span class="n">' + it.c + '</span>') +
        '</button>';
    }).join('') + '</div>';
}
function fbRenderReady() {
  var box = $('fbReadyList'), fbox = $('fbReadyFilter');
  if (fbS.mode !== 'ready') { box.innerHTML = ''; fbox.innerHTML = ''; return; }
  var f = $('fbFmt').value;
  var all = fbCatalog().filter(function (c) { return c.f === f; });
  if (!fbS.fPow) fbS.fPow = 'all';
  if (!fbS.fOpt) fbS.fOpt = 'all';

  // счётчики считаем по второму фильтру, чтобы цифры не врали
  function count(pred) { return all.filter(pred).length; }
  var pows = [];
  all.forEach(function (c) { if (pows.indexOf(c.p) < 0) pows.push(c.p); });
  pows.sort(function (a, b) { return a - b; });
  var powItems = [{ k: 'all', n: 'Любая',
    c: count(function (c) { return fbS.fOpt === 'all' || fbOptKind(c) === fbS.fOpt; }) }];
  pows.forEach(function (w) {
    powItems.push({ k: String(w), n: (w / 1000) + ' кВт',
      c: count(function (c) {
        return c.p === w && (fbS.fOpt === 'all' || fbOptKind(c) === fbS.fOpt);
      }) });
  });
  var kinds = ['base', 'tbl', 'rot', 'both'].filter(function (k) {
    return all.some(function (c) { return fbOptKind(c) === k; });
  });
  var optItems = [{ k: 'all', n: 'Любая',
    c: count(function (c) { return fbS.fPow === 'all' || String(c.p) === fbS.fPow; }) }];
  kinds.forEach(function (k) {
    optItems.push({ k: k, n: FB_OPT_NAMES[k],
      c: count(function (c) {
        return fbOptKind(c) === k && (fbS.fPow === 'all' || String(c.p) === fbS.fPow);
      }) });
  });
  fbox.innerHTML = fbChips({ k: 'pow', n: 'Мощность' }, powItems, fbS.fPow) +
    fbChips({ k: 'opt', n: 'Комплектация' }, optItems, fbS.fOpt);

  var list = all.filter(function (c) {
    return (fbS.fPow === 'all' || String(c.p) === fbS.fPow) &&
      (fbS.fOpt === 'all' || fbOptKind(c) === fbS.fOpt);
  });
  if (!list.length) {
    box.innerHTML = '<div class="rempty"><div class="hint warn">Под этот фильтр ' +
      'в прайсе ничего нет. Снимите ограничение по мощности или комплектации.</div></div>';
    return;
  }
  // группируем по мощности: менеджер сначала выбирает киловатты, потом опции
  var add = fbServoAdd(), out = [], seen = {};
  list.sort(function (a, b) { return a.p - b.p || a.price - b.price; });
  list.forEach(function (c) {
    if (!seen[c.p]) {
      seen[c.p] = 1;
      out.push('<div class="rgh">Источник ' + (c.p / 1000) + ' кВт</div>' +
        '<div class="rgrid" data-pow="' + c.p + '"></div>');
    }
  });
  box.innerHTML = out.join('');
  list.forEach(function (c) {
    var g = box.querySelector('.rgrid[data-pow="' + c.p + '"]');
    if (!g) return;
    g.insertAdjacentHTML('beforeend', '<button type="button" class="rcard' +
      (fbSel === fbCfgKey(c) ? ' on' : '') + '" data-fbcfg="' + fbCfgKey(c) +
      '"><b>' + esc(fbCfgSpec(c)) + '</b><div class="rs">' +
      esc(fbCfgName(c)) + '</div><div class="rp">' + mzRub(c.price + add) +
      '<em>' + esc(fbServoM().brand) + '</em></div></button>');
  });
}
function fbRenderMatches() {
  var f = $('fbFmt').value, cur = fbCurKey();
  var list = fbCatalog().filter(function (c) { return c.f === f; });
  list.sort(function (a, b) { return a.p - b.p || a.tbl - b.tbl; });
  var add = fbServoAdd();
  $('fbMatchList').innerHTML = list.length ? list.map(function (c) {
    return '<button type="button" class="mrow' +
      (cur === fbCfgKey(c) ? ' best' : '') + '" data-fbcfg="' + fbCfgKey(c) +
      '"><span>' + (cur === fbCfgKey(c) ? '▸ ' : '') + esc(fbCfgName(c)) +
      '<br><span style="color:var(--muted);font-size:11.5px">' +
      esc(fbCfgSpec(c)) + '</span></span><b>' + mzRub(c.price + add) +
      '</b></button>';
  }).join('') : '<div class="hint warn">Конфигураций нет.</div>';
}
function fbCurKey() {
  return $('fbFmt').value + ':' + $('fbPow').value + ':' +
    ($('fbTable').value === '1' ? 1 : 0) + ':' + $('fbRot').value;
}

// -------------------------------------------------- шаг 1: вкладки станка
var FB_MTABS = [
  { k: 'src', n: 'Источник' },
  { k: 'opt', n: 'Опции' },
  { k: 'cut', n: 'Что режет' },
  { k: 'unit', n: 'Узлы станка' }
];
var fbMTab = 'src';
function fbRenderMTabs() {
  var custom = fbS.mode === 'custom';
  $('fbMTabs').style.display = custom ? '' : 'none';
  $('fbMatchWrap').style.display = custom ? '' : 'none';
  $('fbMTabs').innerHTML = FB_MTABS.map(function (c) {
    return '<button type="button" class="tab' + (c.k === fbMTab ? ' on' : '') +
      '" data-fbm="' + c.k + '">' + esc(c.n) + '</button>';
  }).join('');
  FB_MTABS.forEach(function (c) {
    var pane = $('fbm_' + c.k);
    if (pane) pane.classList.toggle('on', custom && c.k === fbMTab);
  });
}

// ---------------------------------------------------------------- опции
function fbRenderOpt() {
  if (fbSeries() === 'A') {
    mzCard('fbOptCard', 'У серии A опций нет', 'только база',
      [['Сменный стол', 'нет'], ['Труборез', 'нет']],
      'Сменный стол и поворотная ось есть только у серии S. Если клиенту нужна ' +
      'труба — это сразу S, разговор про A закончен.');
    return;
  }
  var r = fbRow();
  if (!r) { $('fbOptCard').innerHTML = ''; return; }
  var base = r.base;
  var rows = [['База', mzRub(base + fbServoAdd())]];
  if (r.table) {
    rows.push(['Сменный стол', mzRub(r.table + fbServoAdd()) +
      ' · +' + mzRub(r.table - base)]);
  }
  Object.keys(r.rot || {}).forEach(function (k) {
    rows.push(['Труборез ' + k, mzRub(r.rot[k] + fbServoAdd()) +
      ' · +' + mzRub(r.rot[k] - base)]);
  });
  var pack = '';
  if (r.table && r.tableRot && r.tableRot['6-360']) {
    var apart = (r.table - base) + (r.rot['6-360'] - base);
    var both = r.tableRot['6-360'] - base;
    if (apart > both) {
      pack = 'Пакетом стол и труборез 6-360 дешевле, чем по отдельности, ' +
        'на ' + mzRub(apart - both) + '. Это довод в разговоре: клиент, ' +
        'который берёт оба, платит меньше суммы двух опций.';
    } else {
      pack = 'Скидки за пару «стол плюс труборез» на этом формате нет: ' +
        'вместе стоит столько же, сколько по отдельности.';
    }
  }
  mzCard('fbOptCard', 'Опции по прайсу', $('fbFmt').value + ' · ' +
    $('fbPow').value + ' Вт', rows, esc(pack));
}

// ------------------------------------------- станины кабины и сменного стола
function fbBedList(kind) {
  return APP.fiberBeds.filter(function (b) { return b.kind === kind; });
}
function fbBedM(sel) {
  var k = $(sel).value;
  return APP.fiberBeds.filter(function (b) { return b.id === k; })[0] || null;
}
function fbFillBeds() {
  if ($('fbCabin').options.length) return;
  function opts(kind) {
    return '<option value="">не нужна</option>' + fbBedList(kind).map(function (b) {
      return '<option value="' + b.id + '">' + esc(b.format) + ' — ' +
        mzRub(b.price) + '</option>';
    }).join('');
  }
  $('fbCabin').innerHTML = opts('cabin');
  $('fbBed').innerHTML = opts('table');
}
function fbRenderBeds() {
  var h = [];
  var cab = fbBedM('fbCabin'), bed = fbBedM('fbBed');
  var f = $('fbFmt').value;
  [cab, bed].forEach(function (b) {
    if (b && b.format !== f) {
      h.push(['Выбрана станина на формат ' + b.format + ', а станок — ' + f +
        '. Либо это осознанно, либо промах в списке.', 'bad']);
    }
  });
  if (bed && $('fbTable').value === '1') {
    h.push(['В конфигурации уже стоит сменный стол отдельной строкой прайса, ' +
      'и сверху добавлена станина стола из 1С. Это разные позиции — ' +
      'убедитесь у сервиса, что клиенту нужны обе.', 'warn']);
  }
  if (!fbBedList('cabin').some(function (b) { return b.format === f; })) {
    h.push(['На формат ' + f + ' станин в номенклатуре 1С нет: там только ' +
      '1530, 1325, 2040 и 2060.', 'ok']);
  }
  h.push([esc(APP.fiberBedsNote), 'warn']);
  mzHints('fbBedHint', h);
}

// ------------------------------------------------------- что режет источник
// Режимы завода: скорость, газ, давление, сопло по материалу и толщине.
function fbCutPow() {
  var p = parseInt($('fbPow').value, 10);
  return APP.cutModes[String(p)] ? p : 3000;
}
function fbCutRows() { return APP.cutModes[String(fbCutPow())] || []; }
function fbFillCut() {
  var rows = fbCutRows();
  var mats = [];
  rows.forEach(function (r) { if (mats.indexOf(r.mat) < 0) mats.push(r.mat); });
  var m = $('fbCutM').value;
  if (mats.indexOf(m) < 0) m = mats[0] || '';
  $('fbCutM').innerHTML = mats.map(function (k) {
    return '<option value="' + k + '">' + esc(APP.cutModeMat[k] || k) + '</option>';
  }).join('');
  $('fbCutM').value = m;
  var th = [];
  rows.forEach(function (r) {
    if (r.mat === m && th.indexOf(r.th) < 0) th.push(r.th);
  });
  th.sort(function (a, b) { return (+a) - (+b); });
  var t = $('fbCutT').value;
  if (th.indexOf(t) < 0) t = th[0] || '';
  $('fbCutT').innerHTML = th.map(function (x) {
    return '<option value="' + x + '">' + esc(x) + '</option>';
  }).join('');
  $('fbCutT').value = t;
}
// Расход газа берём из заводской таблицы 6 кВт: другой у нас просто нет.
function fbGasRow(mat, th) {
  var src = mat === 'inox' ? APP.gas6kwInox : (mat === 'carbon' ? APP.gas6kwSteel : null);
  if (!src) return null;
  var best = null;
  src.forEach(function (r) {
    if (+r.mm <= +th && (!best || +r.mm > +best.mm)) best = r;
  });
  return best;
}
function fbRenderCut() {
  var mat = $('fbCutM').value, th = $('fbCutT').value, len = mzNum('fbCutL');
  var modes = fbCutRows().filter(function (r) {
    return r.mat === mat && r.th === th;
  });
  if (!modes.length) { $('fbCutCard').innerHTML = ''; return; }
  var rows = modes.map(function (r) {
    return [r.gas + ', сопло ' + r.noz,
      r.v + ' м/мин · ' + r.kw + ' Вт · ' + r.bar + ' атм · фокус ' + r.foc + ' мм'];
  });
  var foot = esc(APP.cutModesNote);
  var g = fbGasRow(mat, th);
  if (g && len > 0) {
    var per = (String(g.perM) || '0').replace(',', '.');
    var total = (+per) * len;
    var balloons = total / APP.cylinderM3;
    rows.push(['Расход газа на ' + len + ' м реза',
      total.toFixed(1).replace('.', ',') + ' м³ ≈ ' +
      (balloons < 1 ? balloons.toFixed(2) : Math.ceil(balloons)) +
      ' баллона по 40 л (' + APP.cylinderM3 + ' м³)']);
    rows.push(['Расход в час', g.perH + ' м³/ч · ' + g.perMin + ' м³/мин · ' + g.gas]);
    foot = 'Расход — из заводской таблицы для источника 6000 Вт, по ближайшей ' +
      'толщине снизу. На других мощностях он отличается: точных таблиц по ' +
      '3 и 12 кВт у нас нет.<br><br>' + foot;
  }
  mzCard('fbCutCard', (APP.cutModeMat[mat] || mat) + ' ' + th + ' мм',
    'источник ' + fbCutPow() + ' Вт', rows, foot, true);
}

// ------------------------------------------------------------ узлы станка
function fbFillUnit() {
  if ($('fbUnit').options.length) return;
  $('fbUnit').innerHTML = APP.components.map(function (c) {
    return '<option value="' + esc(c.model) + '">' + esc(c.model) + '</option>';
  }).join('') + '<option value="__common">Общее по всем партиям</option>';
}
function fbRenderUnit() {
  var k = $('fbUnit').value, rows, title, sub;
  if (k === '__common') {
    rows = APP.componentsCommon.map(function (r) { return [r.n, r.v]; });
    title = 'Общее по всем партиям'; sub = 'электрика, газ, вытяжка, смазка';
  } else {
    var c = APP.components.filter(function (x) { return x.model === k; })[0];
    if (!c) { $('fbUnitCard').innerHTML = ''; return; }
    rows = c.rows.map(function (r) { return [r.n, r.v]; });
    title = c.model; sub = 'сервисная карточка партии';
  }
  mzCard('fbUnitCard', title, sub, rows, esc(APP.componentsNote), true);
}

// -------------------------------------------------------- подготовка цеха
function fbRenderShop() {
  var k = fbSeries();
  var rows = (APP.shopReady[k] || []).map(function (r) { return [r.n, r.v]; });
  mzCard('fbShopCard', 'Подготовка цеха под серию ' + k,
    'за счёт клиента, в смету не входит', rows, esc(APP.shopReadyNote), true);
  mzHints('fbShopHint', [
    ['Это не позиции сметы, а условия запуска. Проговорите их до счёта: ' +
      'станок, приехавший в неготовый цех, стоит клиенту простоя.', 'warn'],
    ['Стабилизатор из этого списка — та же позиция, что и во вкладке ' +
      '«Стабилизатор»: там она попадает в смету, здесь просто названа.', 'ok']
  ]);
}

// Варианты «не нужно» и «уже в комплекте» стоят 0 ₽ и в смету не идут:
// иначе клиент получит строку на ноль рублей и вопрос «а это что такое».
function fbFreeLine(model, onId, why) {
  var box = $(onId);
  var free = !model || !model.price;
  if (free && box.checked) box.checked = false;
  box.disabled = free;
  box.parentNode.classList.toggle('off', free);
  return free ? [why, 'ok'] : null;
}

// ------------------------------------------------------------- ПНР волокна
function fbPnrM() {
  var k = $('fbPnrGroup').value;
  return APP.pnrFiber.filter(function (g) { return g.k === k; })[0] || null;
}
function fbPnrAddM() {
  var k = $('fbPnrAdd').value;
  return APP.pnrFiberAdd.filter(function (g) { return g.k === k; })[0] || null;
}
function fbFillPnr() {
  if (!$('fbPnrGroup').options.length) {
    $('fbPnrGroup').innerHTML = APP.pnrFiber.map(function (g) {
      return '<option value="' + g.k + '">' + esc(g.n) + '</option>';
    }).join('');
    $('fbPnrAdd').innerHTML = APP.pnrFiberAdd.map(function (g) {
      return '<option value="' + g.k + '">' + esc(g.n) + '</option>';
    }).join('');
  }
  if (!mzTouched('fbPnrGroup')) {
    $('fbPnrGroup').value = fbSeries() === 'A' ? 'a' : 's';
  }
}
function fbPnrBase() {
  var g = fbPnrM();
  if (!g) return 0;
  var v = $('fbPnrVar').value;
  var sum = v === 'edu' ? g.edu : (v === 'both' ? g.pnr + g.edu : g.pnr);
  return divHalfUp(sum * (+$('fbPnrK').value || 10), 10);
}
function fbPnrName() {
  var g = fbPnrM(), v = $('fbPnrVar').value;
  if (!g) return 'Пусконаладочные работы';
  var n = v === 'edu' ? 'Обучение оператора'
    : (v === 'both' ? 'Пусконаладочные работы и обучение оператора'
      : 'Пусконаладочные работы');
  return n + ' (' + g.n + ')';
}
function fbRenderPnrHint() {
  var g = fbPnrM(), h = [];
  if (g) {
    h.push(['По прайсу: ПНР ' + mzRub(g.pnr) + ' за ' + g.d + ' дн., обучение ' +
      mzRub(g.edu) + ' за ' + g.edu_d + ' дн.', 'ok']);
  }
  if (+$('fbPnrK').value === 12) {
    h.push(['Коэффициент ×1,2 — станок не наш. Цена пересчитана.', 'warn']);
  }
  var a = fbPnrAddM();
  if (a && a.k !== 'none') {
    h.push(['Доплата за узел «' + a.n + '»: ' + mzRub(a.p) + ', +' +
      String(a.d).replace('.', ',') + ' дн. к выезду.', 'ok']);
  }
  h.push([esc(APP.pnrFiberNote), 'warn']);
  mzHints('fbPnrHint', h);
}

// ------------------------------------------------------------- обвязка
var FB_CATS = [
  { k: 'stab', n: 'Стабилизатор', on: 'fbStabOn' },
  { k: 'compr', n: 'Компрессор', on: 'fbComprOn' },
  { k: 'ext', n: 'Дымоуловитель', on: 'fbExtOn' },
  { k: 'gas', n: 'Газ', on: 'fbCryoOn' },
  { k: 'shop', n: 'Подготовка цеха' },
  { k: 'extra', n: 'Своя позиция', on: 'fbExtraOn' }
];
function fbStabM() {
  var k = $('fbStab').value;
  return APP.stabilizers.filter(function (s) { return s.id === k; })[0] || null;
}
function fbComprM() {
  var k = $('fbCompr').value;
  return APP.compressors.filter(function (c) { return c.id === k; })[0] || null;
}
function fbExtM() {
  var k = $('fbExt').value;
  return APP.extraction.filter(function (e) { return e.id === k; })[0] || null;
}
function fbCryoM() {
  var k = $('fbCryo').value;
  return APP.gasSource.filter(function (c) { return c.id === k; })[0] || null;
}
function fbFillKit() {
  if (!$('fbStab').options.length) {
    $('fbStab').innerHTML = APP.stabilizers.filter(function (s) { return s.for === 'fiber'; })
      .map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.name.replace('Стабилизатор напряжения ', '')) +
          ' — ' + s.power + '</option>';
      }).join('');
    $('fbCompr').innerHTML = APP.compressors.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
    $('fbExt').innerHTML = APP.extraction.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.name) + '</option>';
    }).join('');
    $('fbCryo').innerHTML = APP.gasSource.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
  }
}
function fbRenderStab() {
  var s = fbStabM();
  if (!s) return;
  mzCard('fbStabCard', s.name, s.power + ' · ' + s.phase,
    [['Мощность', s.power], ['Питание', s.phase], ['Цена по прайсу', mzRub(s.price)]],
    esc(APP.stabilizerNote));
  var h = [];
  var need = parseInt($('fbPow').value, 10) >= 6000 ? 50000 : 30000;
  h.push(['Карта готовности цеха требует от ' + (need / 1000) + ' кВт для этой ' +
    'мощности источника' + (need > 30000 ? ', потому что в станке труборез или ' +
    'источник от 6 кВт' : '') + '.', 'ok']);
  if (s.watt < need) {
    h.push(['Этот стабилизатор на ' + (s.watt / 1000) + ' кВт слабее требуемых ' +
      (need / 1000) + ' кВт — непроходной вариант.', 'bad']);
  }
  mzHints('fbStabHint', h);
}
function fbRenderCompr() {
  var c = fbComprM();
  if (!c) return;
  mzCard('fbComprCard', c.name, c.bar + ' бар · ' + c.lmin + ' л/мин',
    [['Давление', c.bar + ' бар'], ['Подача', c.lmin + ' л/мин'],
     ['Мощность', c.kw + ' кВт'], ['Ресивер', c.tank + ' л'], ['Шум', c.noise],
     ['Осушитель', c.dryer], ['Гарантия', c.warranty], ['Срок', c.lead],
     ['Цена с НДС', mzRub(c.price)], ['Источник', c.src]],
    esc(APP.compressorNote));
  var h = [];
  if (/истёк/.test(c.kp_valid)) {
    h.push(['Срок этого КП истёк (' + esc(c.kp_date) + ') — подтвердите цену ' +
      'у поставщика перед отправкой нашего КП.', 'bad']);
  }
  h.push(['Воздух нужен и для резки, и для пневматики станка. Расход считайте ' +
    'по таблице газа, запас 20–30 %.', 'ok']);
  h.push(fbFreeLine(c, 'fbComprOn', 'Компрессор не покупаем — в смету строка ' +
    'не пойдёт. Проверьте у клиента подачу по таблице расхода газа и наличие ' +
    'осушителя: сырой воздух сажает защитное стекло и сопло.'));
  mzHints('fbComprHint', h);
}
function fbRenderExt() {
  var e = fbExtM();
  if (!e) return;
  mzCard('fbExtCard', e.name, e.flow + ' м³/ч',
    [['Производительность', e.flow + ' м³/ч'], ['Разрежение', e.vacuum],
     ['Мощность', e.kw + ' кВт'], ['Патрубок', e.port], ['Фильтр', e.filter],
     ['Цена с НДС', mzRub(e.price)], ['Источник', e.src]],
    esc(e.terms || ''));
  var h = [['Дым от реза металла — это не пыль, а аэрозоль: без фильтра класса H13 ' +
    'он оседает в лёгких оператора.', 'warn']];
  if (/истёк/.test(e.kp_valid || '')) {
    h.push(['Срок КП истёк — подтвердите цену у поставщика.', 'bad']);
  }
  h.push(fbFreeLine(e, 'fbExtOn', 'Штатная вытяжка входит в комплект станка и ' +
    'отдельной строкой в смету не идёт. Но это вентилятор без фильтрации: ' +
    'он выбрасывает дым на улицу. Если так нельзя — нужен дымоуловитель.'));
  mzHints('fbExtHint', h);
}
function fbRenderCryo() {
  var c = fbCryoM();
  if (!c) return;
  var rows = [['Цена с НДС', c.price ? mzRub(c.price) : 'в смету не идёт']];
  if (c.flow) rows.unshift(['Производительность', c.flow + ' нм³/ч']);
  mzCard('fbCryoCard', c.name, c.flow ? c.flow + ' нм³/ч' : 'базовый вариант',
    rows, esc(c.note) + '<br><br>' + esc(APP.gasSourceNote));
  var h = [['Один баллон — ' + APP.cylinderM3 + ' м³ газа. На резе нержавейки ' +
    'азотом расход доходит до ' + String(APP.airDemand.max).replace('.', ',') +
    ' м³/мин, поэтому баллоны заканчиваются за смену — криоцилиндр окупается быстро.',
    'ok']];
  h.push(fbFreeLine(c, 'fbCryoOn', 'Баллоны в смету не ставим: их клиент берёт ' +
    'у своего газового поставщика.'));
  mzHints('fbCryoHint', h);
}
function fbRenderTabs() {
  $('fbTabs').innerHTML = FB_CATS.map(function (c) {
    var on = c.on && $(c.on) && $(c.on).checked;
    return '<button type="button" class="tab' + (c.k === fbCat ? ' on' : '') +
      (on ? ' sel' : '') + '" data-fbcat="' + c.k + '">' + esc(c.n) + '</button>';
  }).join('');
  FB_CATS.forEach(function (c) {
    var p = $('fbp_' + c.k);
    if (p) p.classList.toggle('on', c.k === fbCat);
  });
}
function fbPriceDefaults() {
  if (!mzTouched('fbPrice')) $('fbPrice').value = fbBasePrice() || '';
  var s = fbStabM(), c = fbComprM(), e = fbExtM(), g = fbCryoM();
  if (!mzTouched('fbStabP')) $('fbStabP').value = s ? s.price : '';
  if (!mzTouched('fbComprP')) $('fbComprP').value = c ? c.price : '';
  if (!mzTouched('fbExtP')) $('fbExtP').value = e ? e.price : '';
  if (!mzTouched('fbCryoP')) $('fbCryoP').value = g ? g.price : '';
  var cab = fbBedM('fbCabin'), bed = fbBedM('fbBed');
  if (!mzTouched('fbCabinP')) $('fbCabinP').value = cab ? cab.price : '';
  if (!mzTouched('fbBedP')) $('fbBedP').value = bed ? bed.price : '';
  if (!cab && $('fbCabinOn').checked) $('fbCabinOn').checked = false;
  if (!bed && $('fbBedOn').checked) $('fbBedOn').checked = false;
  $('fbCabinOn').disabled = !cab;
  $('fbBedOn').disabled = !bed;
  $('fbCabinOn').parentNode.classList.toggle('off', !cab);
  $('fbBedOn').parentNode.classList.toggle('off', !bed);
  if (!mzTouched('fbPnrP')) $('fbPnrP').value = fbPnrBase() || '';
  var a = fbPnrAddM();
  if (!mzTouched('fbPnrAddP')) $('fbPnrAddP').value = a && a.p ? a.p : '';
}
// Состав спецификации по волокну — в общем виде, как у фрезерного
function fbSpec() {
  var out = [];
  if (mzNum('fbPrice')) {
    var p = parseInt($('fbPow').value, 10);
    var kit = APP.fiberKit[String(p)] || {};
    out.push({ n: fbName(), c: toCents(mzNum('fbPrice')), q: 1, t: 'eq',
      d: [['Рабочее поле', APP.fiberFormats[$('fbFmt').value] + ' мм'],
        ['Источник', p + ' Вт'],
        ['Контроллер и голова', [kit.ctrl, kit.head].filter(Boolean).join(' · ')],
        ['Приводы', fbSeries() === 'A' ? 'серво DELTA' : fbServoM().label],
        ['Поставка', APP.deliveryOrder]] });
  }
  if ($('fbStabOn').checked && fbStabM()) {
    out.push({ n: fbStabM().name, c: toCents(mzNum('fbStabP')), q: 1, t: 'opt' });
  }
  if ($('fbComprOn').checked && fbComprM()) {
    out.push({ n: fbComprM().name, c: toCents(mzNum('fbComprP')), q: 1, t: 'opt' });
  }
  if ($('fbExtOn').checked && fbExtM()) {
    out.push({ n: fbExtM().name, c: toCents(mzNum('fbExtP')), q: 1, t: 'opt' });
  }
  if ($('fbCryoOn').checked && fbCryoM()) {
    out.push({ n: fbCryoM().name, c: toCents(mzNum('fbCryoP')), q: 1, t: 'opt' });
  }
  if ($('fbCabinOn').checked && fbBedM('fbCabin')) {
    out.push({ n: fbBedM('fbCabin').name, c: toCents(mzNum('fbCabinP')), q: 1, t: 'opt' });
  }
  if ($('fbBedOn').checked && fbBedM('fbBed')) {
    out.push({ n: fbBedM('fbBed').name, c: toCents(mzNum('fbBedP')), q: 1, t: 'opt' });
  }
  if ($('fbExtraOn').checked && $('fbExtraN').value.trim()) {
    out.push({ n: $('fbExtraN').value.trim(), c: toCents(mzNum('fbExtraP')), q: 1, t: 'opt' });
  }
  if ($('fbPnrOn').checked && mzNum('fbPnrP')) {
    out.push({ n: fbPnrName(), c: toCents(mzNum('fbPnrP')), q: 1, t: 'srv' });
  }
  if ($('fbPnrAddOn').checked && mzNum('fbPnrAddP') && fbPnrAddM()) {
    out.push({ n: 'Доплата к ПНР: ' + fbPnrAddM().n,
      c: toCents(mzNum('fbPnrAddP')), q: 1, t: 'srv' });
  }
  return out;
}
function fbIssues() {
  var out = [];
  if (!mzNum('fbPrice')) out.push(['Цена станка не заполнена.', 'bad']);
  if (!$('fbStabOn').checked) {
    out.push(['Стабилизатора в спецификации нет. Паспорт металлореза запрещает ' +
      'работу без него — гарантия под вопросом.', 'bad']);
  }
  if (!$('fbComprOn').checked && fbComprM() && fbComprM().price) {
    out.push(['Компрессора нет. Воздух нужен и для резки, и для пневматики станка.', 'warn']);
  }
  if (fbExtM() && !fbExtM().price) {
    out.push(['Дымоуловителя нет, в смете только штатная вытяжка. Она без ' +
      'фильтра: годится, только если дым можно выбросить наружу.', 'warn']);
  } else if (!$('fbExtOn').checked) {
    out.push(['Дымоуловителя нет. Для металла это вопрос охраны труда, а не удобства.', 'warn']);
  }
  if (!$('fbPnrOn').checked) {
    out.push(['ПНР не включена. Металлорез сам себя не запустит: без выезда ' +
      'инженера станок не вводится в эксплуатацию.', 'warn']);
  }
  if ($('fbRot').value && $('fbPnrAdd').value !== 'rot') {
    out.push(['В конфигурации есть поворотная ось, а доплаты к ПНР за неё нет — ' +
      'по прайсу это 42 000 ₽ и лишний день выезда.', 'warn']);
  }
  if (mzNum('fbTable') && $('fbPnrAdd').value !== 'table' && $('fbTable').value === '1') {
    out.push(['Сменный стол выбран, а доплаты к ПНР за него нет — 11 000 ₽.', 'warn']);
  }
  return out;
}
function fbUpdate() {
  fbFillServo();
  fbFillFmt();
  fbFillPow();
  fbFillRot();
  fbFillKit();
  var isA = fbSeries() === 'A';
  $('fbOptsRow').style.display = isA ? 'none' : '';
  fbFillCut(); fbFillUnit(); fbFillPnr(); fbFillBeds();
  fbPriceDefaults();
  fbRenderKit(); fbRenderSeries(); fbRenderHints(); fbRenderSimilar();
  fbRenderOpt(); fbRenderBeds(); fbRenderCut(); fbRenderUnit(); fbRenderShop();
  fbRenderStab(); fbRenderCompr(); fbRenderExt(); fbRenderCryo();
  fbRenderPnrHint();
  fbSel = fbCurKey();
  fbRenderModes(); fbRenderReady(); fbRenderMatches();
  fbRenderMTabs(); fbRenderTabs();
}

function fbBind() {
  ['fbFmt', 'fbPow', 'fbPrice', 'fbTable', 'fbRot', 'fbStab', 'fbStabP',
    'fbCompr', 'fbComprP', 'fbExt', 'fbExtP', 'fbCryo', 'fbCryoP', 'fbExtraN',
    'fbExtraP', 'fbCutM', 'fbCutT', 'fbCutL', 'fbUnit', 'fbPnrGroup', 'fbPnrVar',
    'fbPnrK', 'fbPnrP', 'fbPnrAdd', 'fbPnrAddP', 'fbSeriesSel', 'fbDrive',
    'fbBoost', 'fbCabin', 'fbCabinP', 'fbBed', 'fbBedP'].forEach(function (id) {
    var box = $(id);
    if (!box) return;
    box.addEventListener('change', function () {
      mzTouch(id);
      if (id === 'fbDrive' || id === 'fbBoost') mzTouch('fbPrice', false);
      if (id === 'fbSeriesSel') {
        fbS.series = box.value;
        mzTouch('fbPrice', false);
        mzTouch('fbPnrGroup', false);
      }
      if (id === 'fbFmt' || id === 'fbPow' || id === 'fbTable' || id === 'fbRot') {
        mzTouch('fbPrice', false);
      }
      if (id === 'fbStab') mzTouch('fbStabP', false);
      if (id === 'fbCompr') mzTouch('fbComprP', false);
      if (id === 'fbExt') mzTouch('fbExtP', false);
      if (id === 'fbCryo') mzTouch('fbCryoP', false);
      if (id === 'fbCutM') $('fbCutT').value = '';
      if (id === 'fbPnrGroup' || id === 'fbPnrVar' || id === 'fbPnrK') {
        mzTouch('fbPnrP', false);
      }
      if (id === 'fbPnrAdd') mzTouch('fbPnrAddP', false);
      if (id === 'fbCabin') mzTouch('fbCabinP', false);
      if (id === 'fbBed') mzTouch('fbBedP', false);
      mzUpdate();
    });
  });
  ['fbStabOn', 'fbComprOn', 'fbExtOn', 'fbCryoOn', 'fbExtraOn', 'fbPnrOn',
    'fbPnrAddOn', 'fbCabinOn', 'fbBedOn'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('change', mzUpdate);
    });
  $('fbModes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbmode]');
    if (!b) return;
    fbS.mode = b.dataset.fbmode;
    mzUpdate();
  });
  $('fbReadyFilter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbf]');
    if (!b) return;
    var parts = b.dataset.fbf.split(':');
    fbS[parts[0] === 'pow' ? 'fPow' : 'fOpt'] = parts[1];
    mzUpdate();
  });
  $('fbReadyList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbcfg]');
    if (b) fbApplyCfg(b.dataset.fbcfg);
  });
  $('fbMatchList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbcfg]');
    if (b) fbApplyCfg(b.dataset.fbcfg);
  });
  $('fbTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbcat]');
    if (!b) return;
    fbCat = b.dataset.fbcat;
    fbRenderTabs();
  });
  $('fbMTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fbm]');
    if (!b) return;
    fbMTab = b.dataset.fbm;
    fbRenderMTabs();
  });
  $('fbSimilar').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fb]');
    if (!b) return;
    var parts = b.dataset.fb.split(':');
    $('fbFmt').value = parts[0];
    fbFillPow();
    $('fbPow').value = parts[1];
    mzTouch('fbPrice', false);
    mzUpdate();
  });
}

mzFill();
mzLoad();
mzBind();
fbBind();
mzUpdate();
if (!mzS.fields || !mzS.fields.mzPrice || !mzS.fields.mzPrice.v) {
  var mzFirst = mzBySeries($('mzSeries').value).filter(function (c) {
    return c.f === $('mzFmt').value;
  })[0];
  if (mzFirst) mzApplyCfg(mzFirst.i);
}
