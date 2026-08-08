/* Шаблон КП: менеджер один раз загружает готовый .pptx, приложение
   подставляет в него данные сделки и отдаёт файл обратно.

   Оформление шаблона не трогаем совсем: меняем только текст и, если позиций
   в смете больше или меньше, чем было в образце, двигаем то, что ниже таблицы.
   Внешних библиотек нет: ZIP разбираем сами, deflate — через
   DecompressionStream и CompressionStream самого браузера. */
var TPL = (function () {
  'use strict';

  var A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

  // ---------------------------------------------------------------- ZIP
  function u32(dv, p) { return dv.getUint32(p, true); }
  function u16(dv, p) { return dv.getUint16(p, true); }

  function inflate(bytes) {
    var st = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(st).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }
  function deflate(bytes) {
    var st = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(st).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }
  function supported() {
    return typeof DecompressionStream === 'function' &&
      typeof CompressionStream === 'function';
  }

  // Читаем по центральному каталогу: это единственное надёжное оглавление ZIP.
  function unzip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('это не .pptx: нет оглавления ZIP'));
    var count = u16(dv, eocd + 10);
    var start = u32(dv, eocd + 16);
    var p = start, jobs = [], names = [];
    for (var n = 0; n < count; n++) {
      if (u32(dv, p) !== 0x02014b50) break;
      var method = u16(dv, p + 10);
      var csize = u32(dv, p + 20);
      var nlen = u16(dv, p + 28);
      var elen = u16(dv, p + 30);
      var clen = u16(dv, p + 32);
      var lho = u32(dv, p + 42);
      var nm = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nlen));
      var lnlen = u16(dv, lho + 26);
      var lelen = u16(dv, lho + 28);
      var from = lho + 30 + lnlen + lelen;
      names.push(nm);
      jobs.push(method === 8 ? inflate(bytes.subarray(from, from + csize))
        : Promise.resolve(bytes.subarray(from, from + csize)));
      p += 46 + nlen + elen + clen;
    }
    if (!names.length) return Promise.reject(new Error('в файле нет ни одной части'));
    return Promise.all(jobs).then(function (list) {
      var out = {};
      names.forEach(function (nm, i) { out[nm] = list[i]; });
      return out;
    });
  }

  // Пакуем со сжатием: без него файл с фотографиями раздувается.
  function zip(parts) {
    var names = Object.keys(parts);
    return Promise.all(names.map(function (nm) {
      var raw = parts[nm];
      return deflate(raw).then(function (packed) {
        return { name: nm, raw: raw, packed: packed };
      });
    })).then(function (list) {
      var enc = new TextEncoder();
      var local = [], central = [], off = 0;
      list.forEach(function (it) {
        var nb = enc.encode(it.name);
        var crc = DOCX.crc32(it.raw);
        var use = it.packed.length < it.raw.length ? it.packed : it.raw;
        var method = use === it.packed ? 8 : 0;
        var lh = new Uint8Array(30 + nb.length);
        var d1 = new DataView(lh.buffer);
        d1.setUint32(0, 0x04034b50, true);
        d1.setUint16(4, 20, true);
        d1.setUint16(6, 0x0800, true);
        d1.setUint16(8, method, true);
        d1.setUint32(14, crc, true);
        d1.setUint32(18, use.length, true);
        d1.setUint32(22, it.raw.length, true);
        d1.setUint16(26, nb.length, true);
        lh.set(nb, 30);
        local.push(lh, use);
        var ch = new Uint8Array(46 + nb.length);
        var d2 = new DataView(ch.buffer);
        d2.setUint32(0, 0x02014b50, true);
        d2.setUint16(4, 20, true);
        d2.setUint16(6, 20, true);
        d2.setUint16(8, 0x0800, true);
        d2.setUint16(10, method, true);
        d2.setUint32(16, crc, true);
        d2.setUint32(20, use.length, true);
        d2.setUint32(24, it.raw.length, true);
        d2.setUint16(28, nb.length, true);
        d2.setUint32(42, off, true);
        ch.set(nb, 46);
        central.push(ch);
        off += lh.length + use.length;
      });
      var cLen = central.reduce(function (s, c) { return s + c.length; }, 0);
      var end = new Uint8Array(22);
      var d3 = new DataView(end.buffer);
      d3.setUint32(0, 0x06054b50, true);
      d3.setUint16(8, list.length, true);
      d3.setUint16(10, list.length, true);
      d3.setUint32(12, cLen, true);
      d3.setUint32(16, off, true);
      var all = local.concat(central, [end]);
      var size = all.reduce(function (s, a) { return s + a.length; }, 0);
      var out = new Uint8Array(size), p = 0;
      all.forEach(function (a) { out.set(a, p); p += a.length; });
      return out;
    });
  }

  // ---------------------------------------------------------------- разбор листа
  function txtOf(n) {
    var ts = n.getElementsByTagNameNS(A, 't'), o = [];
    for (var i = 0; i < ts.length; i++) o.push(ts[i].textContent);
    return o;
  }
  function runsOf(n) {
    var ts = n.getElementsByTagNameNS(A, 't'), o = [];
    for (var i = 0; i < ts.length; i++) o.push(ts[i]);
    return o;
  }
  function offOf(n) {
    var o = n.getElementsByTagNameNS(A, 'off')[0];
    return o ? { x: +o.getAttribute('x'), y: +o.getAttribute('y') } : null;
  }
  function extOf(n) {
    var e = n.getElementsByTagNameNS(A, 'ext')[0];
    return e ? { w: +e.getAttribute('cx'), h: +e.getAttribute('cy') } : null;
  }
  function moveY(n, dy) {
    var o = n.getElementsByTagNameNS(A, 'off')[0];
    if (o) o.setAttribute('y', String(+o.getAttribute('y') + dy));
  }
  function boxOf(n) {
    var e = n.getElementsByTagNameNS(A, 'ext')[0];
    var o = n.getElementsByTagNameNS(A, 'off')[0];
    if (!e || !o) return null;
    return { x: +o.getAttribute('x'), w: +e.getAttribute('cx'), off: o, ext: e };
  }
  function setBox(n, x, w) {
    var b = boxOf(n);
    if (!b) return;
    b.off.setAttribute('x', String(Math.round(x)));
    b.ext.setAttribute('cx', String(Math.round(w)));
  }
  // Лишние раны гасим, но не удаляем: так остаются шрифт, цвет и кегль шаблона.
  function setRuns(n, values) {
    var rs = runsOf(n);
    for (var i = 0; i < rs.length; i++) {
      rs[i].textContent = i < values.length ? String(values[i]) : '';
    }
  }
  function setFirst(n, value) {
    var rs = runsOf(n);
    if (!rs.length) return;
    rs[0].textContent = String(value);
    for (var i = 1; i < rs.length; i++) rs[i].textContent = '';
  }
  // Иногда нужный текст лежит не первым раном, а третьим — например, строка
  // поставщика внутри блока сносок. Меняем именно её, остальное не трогаем.
  function setRunStarting(n, re, value) {
    var rs = runsOf(n);
    for (var i = 0; i < rs.length; i++) {
      if (re.test(rs[i].textContent)) { rs[i].textContent = String(value); return true; }
    }
    return false;
  }
  function shapes(tree) {
    var out = [];
    for (var i = 0; i < tree.childNodes.length; i++) {
      var n = tree.childNodes[i];
      if (n.nodeType === 1 && (n.localName === 'sp' || n.localName === 'pic' ||
          n.localName === 'graphicFrame' || n.localName === 'grpSp')) out.push(n);
    }
    return out;
  }
  function findByText(list, re) {
    for (var i = 0; i < list.length; i++) {
      if (re.test(txtOf(list[i]).join(' '))) return list[i];
    }
    return null;
  }
  function treeOf(doc) {
    return doc.getElementsByTagName('p:spTree')[0] ||
      doc.getElementsByTagName('spTree')[0];
  }

  // Строки таблицы: всё между шапкой «№» и строкой «ИТОГО». Границу строки
  // берём от самого большого разрыва по вертикали — так разбор не зависит от
  // того, какого формата лист в шаблоне.
  function readTable(list) {
    var head = findByText(list, /^№$/);
    var itog = findByText(list, /ИТОГО/);
    if (!head || !itog) return null;
    var yHead = offOf(head).y, yItog = offOf(itog).y;
    var inside = list.filter(function (n) {
      var o = offOf(n);
      return o && o.y > yHead + 10000 && o.y < yItog - 10000;
    });
    if (!inside.length) return null;
    inside.sort(function (a, b) { return offOf(a).y - offOf(b).y; });
    var ys = inside.map(function (n) { return offOf(n).y; });
    var maxGap = 0;
    for (var i = 1; i < ys.length; i++) maxGap = Math.max(maxGap, ys[i] - ys[i - 1]);
    var edge = Math.max(maxGap * 0.5, 1000);
    var base = [], groups = [];
    inside.forEach(function (n) {
      var y = offOf(n).y;
      if (!groups.length || y - base[base.length - 1] > edge) {
        groups.push([n]); base.push(y);
      } else groups[groups.length - 1].push(n);
    });
    var step = groups.length > 1 ? base[1] - base[0] : yItog - base[0];
    return { head: head, itog: itog, groups: groups, base: base, step: step,
      yHead: yHead, yItog: yItog };
  }
  function rowSlots(group) {
    var withText = group.filter(function (n) {
      return txtOf(n).join('').trim() !== '';
    });
    withText.sort(function (a, b) { return offOf(a).x - offOf(b).x; });
    return withText;
  }
  // Денежные колонки образца считались под те суммы. Сумма сделки бывает
  // длиннее и переносится на вторую строку — раздвигаем колонки за счёт
  // наименования, сохраняя правый край таблицы.
  function widen(cells) {
    if (cells.length < 5) return;
    var first = boxOf(cells[0]), last = boxOf(cells[4]);
    if (!first || !last) return;
    var right = last.x + last.w, total = right - first.x;
    var wSum = total * 0.175, wPrice = total * 0.167, wQty = total * 0.112;
    setBox(cells[4], right - wSum, wSum);
    setBox(cells[3], right - wSum - wPrice, wPrice);
    setBox(cells[2], right - wSum - wPrice - wQty, wQty);
    var nm = boxOf(cells[1]);
    if (nm) setBox(cells[1], nm.x, right - wSum - wPrice - wQty - nm.x - total * 0.02);
  }

  // Сколько строк влезает на лист: с итогом и всем низом — и без них.
  function capacity(doc, slideH) {
    var list = shapes(treeOf(doc));
    var t = readTable(list);
    if (!t) return null;
    var yFirst = t.base[0], bottom = 0;
    list.forEach(function (n) {
      var o = offOf(n), e = extOf(n);
      if (o && e) bottom = Math.max(bottom, o.y + e.h);
    });
    var tailH = bottom - t.yItog;              // ИТОГО и всё, что ниже него
    var gap = Math.round(slideH * 0.012);
    return {
      withTail: Math.max(1, Math.floor((slideH - yFirst - tailH - gap) / t.step)),
      only: Math.max(1, Math.floor((slideH - yFirst - gap) / t.step)),
      step: t.step, yItog: t.yItog, bottom: bottom
    };
  }

  // Раскладка позиций по листам: итог и низ живут на последнем листе,
  // предыдущие несут только продолжение таблицы.
  function planPages(n, only, withTail) {
    if (n <= withTail) return [n];
    var sheets = Math.ceil((n - withTail) / only);
    var last = Math.min(withTail, Math.ceil(n / (sheets + 1)));
    var rest = n - last, pages = [], done = 0;
    // делим поровну: иначе один лист набит под завязку, а соседний почти пустой
    for (var i = 0; i < sheets; i++) {
      var take = Math.ceil((rest - done) / (sheets - i));
      pages.push(take); done += take;
    }
    pages.push(last);
    return pages;
  }

  // opts: rows — строки этого листа, from — номер первой позиции,
  // tail — нести ли итог и низ, part — лист-продолжение.
  function fillSmeta(doc, data, opts) {
    opts = opts || {};
    var rows = opts.rows || data.rows;
    var from = opts.from || 0;
    var tail = opts.tail !== false;
    var tree = treeOf(doc);
    if (!tree) throw new Error('в листе нет дерева фигур');
    var list = shapes(tree);
    var t = readTable(list);
    if (!t) throw new Error('на листе не нашлась таблица позиций');

    var komu = findByText(list, /^Кому:/);
    if (komu) setRuns(komu, ['Кому:  ', data.client]);
    var ot = findByText(list, /^От:/);
    if (ot) {
      setRuns(ot, ['От:  ', data.manager, '     Дата:  ', data.date,
        '     Предложение действительно до:  ', data.validUntil]);
    }
    var intro = findByText(list, /благодарим за обращение/);
    if (intro) {
      setFirst(intro, opts.part ? (data.introPart || 'Смета, продолжение.')
        : data.intro);
    }

    var headRow = list.filter(function (n) {
      var o = offOf(n);
      return o && o.y >= t.yHead - 1000 && o.y < t.base[0] - 1000 &&
        txtOf(n).join('').trim() !== '';
    }).sort(function (a, b) { return offOf(a).x - offOf(b).x; });
    if (headRow.length >= 5) {
      setFirst(headRow[3], 'Цена за шт.');
      setFirst(headRow[4], 'Сумма');
      widen(headRow);
    }

    var proto = t.groups[0], n = rows.length;
    if (rowSlots(proto).length < 5) {
      throw new Error('строка таблицы в шаблоне не похожа на «№ · наименование · ' +
        'кол-во · цена · сумма» — подставлять некуда');
    }
    for (var g = 1; g < t.groups.length; g++) {
      t.groups[g].forEach(function (node) { tree.removeChild(node); });
    }
    var anchor = proto[proto.length - 1].nextSibling;
    for (var i = 0; i < n; i++) {
      var row = rows[i];
      var nodes = i === 0 ? proto : proto.map(function (x) { return x.cloneNode(true); });
      if (i > 0) {
        nodes.forEach(function (node) {
          moveY(node, t.step * i);
          tree.insertBefore(node, anchor);
        });
      }
      var cells = rowSlots(nodes);
      widen(cells);
      setFirst(cells[0], String(from + i + 1));
      setRuns(cells[1], row.sub ? [row.name, row.sub] : [row.name]);
      setFirst(cells[2], row.qty);
      setFirst(cells[3], row.price);
      setFirst(cells[4], row.sum);
    }

    // Тексты прошлой сделки чистим на каждом листе. Правило с флагом once
    // остаётся только на первом листе, на продолжениях фигура убирается.
    (data.extras || []).forEach(function (rule) {
      var node = findByText(list, rule.find);
      if (!node) return;
      if (rule.text === '' || (rule.once && opts.part)) {
        if (node.parentNode) node.parentNode.removeChild(node);
        return;
      }
      if (rule.run) { setRunStarting(node, rule.run, rule.text); return; }
      setFirst(node, rule.text);
    });

    var below = list.filter(function (node) {
      var o = offOf(node);
      return o && o.y >= t.yItog - 1000;
    });
    if (!tail) {
      below.forEach(function (node) {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
      return doc;
    }
    var dy = (n - t.groups.length) * t.step;
    if (dy !== 0) below.forEach(function (node) { moveY(node, dy); });

    setRuns(t.itog, ['ИТОГО', 'в том числе НДС ' + data.ndsRate + ' %']);
    var yItogNow = t.yItog + dy;
    var itogRow = below.filter(function (node) {
      var o = offOf(node);
      return o && o.y >= yItogNow - 1000 && o.y < yItogNow + t.step * 0.9 &&
        txtOf(node).join('').trim() !== '';
    }).sort(function (a, b) { return offOf(a).x - offOf(b).x; });
    if (itogRow.length >= 3) {
      var lastCells = itogRow.slice(-2);
      var ref = rowSlots(t.groups[0]);
      var b4 = boxOf(ref[3]), b5 = boxOf(ref[4]);
      if (b4) setBox(lastCells[0], b4.x, b4.w);
      if (b5) setBox(lastCells[1], b5.x, b5.w);
      setRuns(lastCells[0], ['', '']);
      setRuns(lastCells[1], [data.total, data.nds]);
    }
    return doc;
  }

  // ---------------------------------------------------------------- пакет
  var SLIDE_CT =
    'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
  var SLIDE_REL =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';

  function dec(b) { return new TextDecoder('utf-8').decode(b); }
  function enc(s) { return new TextEncoder().encode(s); }

  // Лист сметы узнаём по содержимому, а не по номеру: в разных шаблонах
  // порядок листов свой.
  function findSmetaSlide(parts) {
    var names = Object.keys(parts).filter(function (n) {
      return /^ppt\/slides\/slide\d+\.xml$/.test(n);
    });
    for (var i = 0; i < names.length; i++) {
      var s = dec(parts[names[i]]);
      if (s.indexOf('ИТОГО') >= 0 && s.indexOf('Кому:') >= 0) return names[i];
    }
    return null;
  }
  function slideHeight(parts) {
    var p = parts['ppt/presentation.xml'];
    if (!p) return 0;
    var m = dec(p).match(/<p:sldSz[^>]*cy="(\d+)"/);
    return m ? +m[1] : 0;
  }

  // Новый лист в пакете: сам файл, свои связи, тип части, связь презентации
  // и место в порядке показа — прямо перед листом-образцом.
  function addSlideBefore(parts, srcName, xmlText) {
    var nums = Object.keys(parts).filter(function (n) {
      return /^ppt\/slides\/slide\d+\.xml$/.test(n);
    }).map(function (n) { return +n.match(/slide(\d+)\.xml/)[1]; });
    var num = Math.max.apply(null, nums) + 1;
    var name = 'ppt/slides/slide' + num + '.xml';
    parts[name] = enc(xmlText);

    var srcRels = 'ppt/slides/_rels/' + srcName.split('/').pop() + '.rels';
    if (parts[srcRels]) {
      // заметки не копируем: две страницы на одну заметку PowerPoint не любит
      parts['ppt/slides/_rels/slide' + num + '.xml.rels'] =
        enc(dec(parts[srcRels]).replace(/<Relationship[^>]*notesSlide[^>]*\/>/g, ''));
    }
    var ct = dec(parts['[Content_Types].xml']);
    if (ct.indexOf('PartName="/' + name + '"') < 0) {
      parts['[Content_Types].xml'] = enc(ct.replace('</Types>',
        '<Override PartName="/' + name + '" ContentType="' + SLIDE_CT + '"/></Types>'));
    }
    var pr = dec(parts['ppt/_rels/presentation.xml.rels']);
    var maxRid = 0;
    (pr.match(/Id="rId(\d+)"/g) || []).forEach(function (s) {
      maxRid = Math.max(maxRid, +s.match(/\d+/)[0]);
    });
    var rid = 'rId' + (maxRid + 1);
    var srcTarget = 'slides/' + srcName.split('/').pop();
    var mm = pr.match(new RegExp('<Relationship Id="(rId\\d+)"[^>]*Target="' +
      srcTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    var srcRid = mm ? mm[1] : null;
    parts['ppt/_rels/presentation.xml.rels'] = enc(pr.replace('</Relationships>',
      '<Relationship Id="' + rid + '" Type="' + SLIDE_REL +
      '" Target="slides/slide' + num + '.xml"/></Relationships>'));

    var pres = dec(parts['ppt/presentation.xml']);
    var maxId = 255;
    (pres.match(/<p:sldId id="(\d+)"/g) || []).forEach(function (s) {
      maxId = Math.max(maxId, +s.match(/\d+/)[0]);
    });
    var tag = '<p:sldId id="' + (maxId + 1) + '" r:id="' + rid + '"/>';
    if (srcRid) {
      pres = pres.replace(new RegExp('<p:sldId id="\\d+" r:id="' + srcRid + '"\\s*/>'),
        tag + '$&');
    } else {
      pres = pres.replace('</p:sldIdLst>', tag + '</p:sldIdLst>');
    }
    parts['ppt/presentation.xml'] = enc(pres);
    return name;
  }

  function build(parts, data) {
    var src = findSmetaSlide(parts);
    if (!src) throw new Error('в шаблоне нет листа со сметой: нужны «Кому:» и «ИТОГО»');
    var H = slideHeight(parts);
    if (!H) throw new Error('в шаблоне не читается размер листа');
    var xml = dec(parts[src]);
    var probe = new DOMParser().parseFromString(xml, 'application/xml');
    if (probe.getElementsByTagName('parsererror').length) {
      throw new Error('лист сметы не читается как XML');
    }
    var cap = capacity(probe, H);
    if (!cap) throw new Error('на листе сметы не нашлась таблица позиций');
    var pages = planPages(data.rows.length, cap.only, cap.withTail);

    var out = {};
    Object.keys(parts).forEach(function (k) { out[k] = parts[k]; });
    var from = 0;
    for (var i = 0; i < pages.length; i++) {
      var last = i === pages.length - 1;
      var doc = new DOMParser().parseFromString(xml, 'application/xml');
      fillSmeta(doc, data, { rows: data.rows.slice(from, from + pages[i]),
        from: from, tail: last, part: i > 0 });
      var text = new XMLSerializer().serializeToString(doc);
      if (last) out[src] = enc(text);
      else addSlideBefore(out, src, text);
      from += pages[i];
    }
    if (out['docProps/core.xml'] && data.title) {
      out['docProps/core.xml'] = enc(dec(out['docProps/core.xml'])
        .replace(/<dc:title>[^<]*<\/dc:title>/, '<dc:title>' +
          String(data.title).replace(/[<>&]/g, ' ') + '</dc:title>'));
    }
    out.__pages = pages;
    return out;
  }

  return { unzip: unzip, zip: zip, build: build, fillSmeta: fillSmeta,
    findSmetaSlide: findSmetaSlide, slideHeight: slideHeight, capacity: capacity,
    planPages: planPages, readTable: readTable, shapes: shapes, treeOf: treeOf,
    findByText: findByText, txtOf: txtOf, supported: supported };
}());
