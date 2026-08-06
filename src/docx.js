/* Сборка настоящего .docx (OOXML) прямо в браузере, без библиотек и CDN.
 *
 * Зачем: файл «HTML внутри .doc» настольный Word ещё открывает, а мобильные
 * Word, Google Документы и просмотрщики Android/iOS считают повреждённым.
 * Поэтому собирается настоящий пакет: ZIP + WordprocessingML + логотип в media.
 *
 * ZIP пишется без сжатия (метод 0, stored) — так не нужен deflate, а Word
 * и LibreOffice читают такие пакеты штатно. CRC32 считается по байтам.
 *
 * Наружу отдаётся один объект DOCX с методами:
 *   DOCX.build(doc)  -> Uint8Array  — готовый файл
 *   DOCX.p, DOCX.tbl, ... — хелперы для сборки содержимого
 * Единицы: 1 pt = 20 twips; размер шрифта в half-points (w:sz).
 */
var DOCX = (function () {
  'use strict';

  // ---------------------------------------------------------------- CRC32
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // запасной путь для очень старых движков
    var esc = unescape(encodeURIComponent(str));
    var out = new Uint8Array(esc.length);
    for (var i = 0; i < esc.length; i++) out[i] = esc.charCodeAt(i) & 0xFF;
    return out;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
    return out;
  }

  // ------------------------------------------------------------------ ZIP
  function zip(files) {
    var chunks = [], central = [], offset = 0, total = 0;

    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) {
      return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    }

    files.forEach(function (f) {
      var name = utf8(f.name);
      var data = f.bytes;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0));
      var head = new Uint8Array(local.length + name.length);
      head.set(local, 0); head.set(name, local.length);
      chunks.push(head, data);
      total += head.length + data.length;

      var cen = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      var centry = new Uint8Array(cen.length + name.length);
      centry.set(cen, 0); centry.set(name, cen.length);
      central.push(centry);
      offset += head.length + data.length;
    });

    var cenSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cenSize), u32(offset), u16(0));
    var tail = new Uint8Array(end.length);
    tail.set(end, 0);

    var out = new Uint8Array(total + cenSize + tail.length);
    var pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    central.forEach(function (c) { out.set(c, pos); pos += c.length; });
    out.set(tail, pos);
    return out;
  }

  // ------------------------------------------------------------------ XML
  function xesc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Прогон текста: opt = {b:true, i:true, color:'1F3A5F', sz:19, font:'Calibri'}
  function run(text, opt) {
    opt = opt || {};
    // Порядок элементов внутри w:rPr задан схемой (CT_RPr):
    // rFonts → b → i → color → sz → szCs → u. Иначе Word ругается на файл.
    var rpr = '<w:rFonts w:ascii="' + (opt.font || 'Calibri') + '" w:hAnsi="' +
      (opt.font || 'Calibri') + '"/>' +
      (opt.b ? '<w:b/>' : '') + (opt.i ? '<w:i/>' : '') +
      (opt.color ? '<w:color w:val="' + opt.color + '"/>' : '') +
      '<w:sz w:val="' + (opt.sz || 19) + '"/>' +
      '<w:szCs w:val="' + (opt.sz || 19) + '"/>' +
      (opt.u ? '<w:u w:val="single"/>' : '');
    var parts = String(text === null || text === undefined ? '' : text).split('\n');
    return parts.map(function (t, i) {
      return '<w:r><w:rPr>' + rpr + '</w:rPr>' +
        (i ? '<w:br/>' : '') +
        '<w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r>';
    }).join('');
  }

  // Абзац: opt = {align:'center'|'right'|'both', space:{before,after}, keepNext:true}
  function p(runs, opt) {
    opt = opt || {};
    var sp = opt.space || {};
    // Порядок в CT_PPr: keepNext → spacing → jc (схема строгая)
    var ppr = '<w:pPr>' +
      (opt.keepNext ? '<w:keepNext/>' : '') +
      '<w:spacing w:before="' + (sp.before || 0) + '" w:after="' +
      (sp.after === undefined ? 60 : sp.after) + '" w:line="240" w:lineRule="auto"/>' +
      (opt.align ? '<w:jc w:val="' + opt.align + '"/>' : '') +
      '</w:pPr>';
    return '<w:p>' + ppr + (runs || '') + '</w:p>';
  }

  // Ячейка: opt = {w:2000, fill:'DCE8F4', span:2, noBorder:true, valign,
  //                edge:'bottom' — только одна граница, для линии под подпись}
  function tc(content, opt) {
    opt = opt || {};
    var borders = '<w:tcBorders>' +
      ['top', 'left', 'bottom', 'right'].map(function (s) {
        var on = opt.edge ? (s === opt.edge) : !opt.noBorder;
        var col = opt.edge ? '5A6572' : 'B7C9DC';
        return '<w:' + s + ' w:val="' + (on ? 'single' : 'none') +
          '" w:sz="4" w:space="0" w:color="' + (on ? col : 'auto') + '"/>';
      }).join('') + '</w:tcBorders>';
    return '<w:tc><w:tcPr>' +
      '<w:tcW w:w="' + (opt.w || 0) + '" w:type="dxa"/>' +
      (opt.span ? '<w:gridSpan w:val="' + opt.span + '"/>' : '') +
      borders +
      (opt.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opt.fill + '"/>' : '') +
      '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>' +
      '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar>' +
      (opt.valign ? '<w:vAlign w:val="' + opt.valign + '"/>' : '') +
      '</w:tcPr>' + (content || p('')) + '</w:tc>';
  }

  function tr(cells, opt) {
    opt = opt || {};
    // Порядок в CT_TrPr: cantSplit → tblHeader → trHeight
    return '<w:tr><w:trPr><w:cantSplit/>' +
      (opt.header ? '<w:tblHeader/>' : '') +
      (opt.h ? '<w:trHeight w:val="' + opt.h + '"/>' : '') +
      '</w:trPr>' + cells.join('') + '</w:tr>';
  }

  function tbl(rows, grid) {
    var total = grid.reduce(function (a, w) { return a + w; }, 0);
    return '<w:tbl><w:tblPr>' +
      '<w:tblW w:w="' + total + '" w:type="dxa"/>' +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/>' +
      '</w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + grid.map(function (w) {
        return '<w:gridCol w:w="' + w + '"/>';
      }).join('') + '</w:tblGrid>' +
      rows.join('') + '</w:tbl>';
  }

  // Картинка внутри абзаца: размеры в сантиметрах
  function image(id, cmW, cmH, name) {
    var cx = Math.round(cmW * 360000), cy = Math.round(cmH * 360000);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + id + '" name="' + xesc(name || 'Рисунок') + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + xesc(name || 'Рисунок') +
      '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rId' + id + '"/><a:stretch><a:fillRect/>' +
      '</a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy +
      '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  // ------------------------------------------------------------ упаковка
  // doc = { body: '<w:p>...', images: [{name:'logo.png', b64:'...'}] }
  function build(doc) {
    var images = doc.images || [];
    var rels = images.map(function (im, i) {
      return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats' +
        '.org/officeDocument/2006/relationships/image" Target="media/' + im.name + '"/>';
    }).join('');

    var defaults = '<Default Extension="rels" ContentType="application/vnd.openxml' +
      'formats-package.relationships+xml"/><Default Extension="xml" ContentType=' +
      '"application/xml"/><Default Extension="png" ContentType="image/png"/>';

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      defaults +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxml' +
      'formats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxml' +
      'formats-officedocument.wordprocessingml.styles+xml"/></Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument' +
      '/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/office' +
      'Document/2006/relationships/styles" Target="styles.xml"/></Relationships>';

    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
      '<w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>' +
      '</w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/></w:style></w:styles>';

    // A4 = 11906 x 16838 twips, поля 1,27 см = 720 twips
    var sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" ' +
      'w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';

    var document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document ' +
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
      '><w:body>' + doc.body + sectPr + '</w:body></w:document>';

    var files = [
      { name: '[Content_Types].xml', bytes: utf8(contentTypes) },
      { name: '_rels/.rels', bytes: utf8(rootRels) },
      { name: 'word/document.xml', bytes: utf8(document) },
      { name: 'word/styles.xml', bytes: utf8(styles) },
      { name: 'word/_rels/document.xml.rels', bytes: utf8(docRels) }
    ];
    images.forEach(function (im) {
      files.push({ name: 'word/media/' + im.name, bytes: b64ToBytes(im.b64) });
    });
    return zip(files);
  }

  return {
    build: build, p: p, run: run, tc: tc, tr: tr, tbl: tbl, image: image,
    esc: xesc, crc32: crc32, utf8: utf8, zip: zip
  };
}());
