/* Сборка настоящей .pptx (OOXML) прямо в браузере, без библиотек и CDN.
 *
 * Зачем: менеджеру нужен не только лист Word, но и презентация под смету —
 * такую удобно отправить в мессенджер и показать на экране у клиента.
 *
 * Пакет собирается тем же ZIP-писателем, что и .docx: метод 0 (stored),
 * без deflate. PowerPoint, Google Презентации и LibreOffice читают штатно.
 *
 * Картинок внутри нет сознательно: приложение — один HTML-файл, а фотографии
 * станков из образца весят двадцать мегабайт. Оформление держится на
 * заливках и типографике.
 *
 * Размер слайда — A1 книжной ориентации (594 x 841 мм), как в образце,
 * который прислал менеджер. Пропорция та же, что у A4, поэтому лист
 * нормально печатается уменьшением.
 *
 * Наружу отдаётся объект PPTX:
 *   PPTX.build(deck) -> Uint8Array
 * где deck = { title: '...', slides: [ [блок, блок, ...], ... ] }.
 * Блоки:
 *   { t: 'bar',   text, sub }                    — синяя плашка-заголовок
 *   { t: 'text',  text, size, bold, color, fill } — абзац
 *   { t: 'note',  text }                          — сноска на светлой плашке
 *   { t: 'kv',    rows: [[ключ, значение], ...] } — две колонки без шапки
 *   { t: 'table', head, rows, w, rowH }           — таблица с шапкой
 */
var PPTX = (function () {
  'use strict';

  var EMU = 12700;              // 1 pt = 12700 EMU
  var W = 21240000;             // ширина слайда, A1 книжный
  var H = 30240000;             // высота слайда
  var PAD = 1080000;            // поля страницы
  var INNER = W - PAD * 2;

  var C = {
    dark: '1F3A5F',   // фирменный тёмно-синий шапки ТКП
    mid: '2E5B94',
    soft: 'EAF1F8',
    line: 'DCE8F4',
    zebra: 'FAFCFE',
    tx: '1A1F26',
    muted: '5A6572',
    white: 'FFFFFF'
  };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Один или несколько абзацев. rPr обязан идти до текста, иначе PowerPoint
  // теряет шрифт и цвет.
  function para(text, o) {
    o = o || {};
    var sz = Math.round((o.size || 20) * 100);
    return String(text === undefined ? '' : text).split('\n').map(function (line) {
      return '<a:p><a:pPr algn="' + (o.align || 'l') + '"/>' +
        '<a:r><a:rPr lang="ru-RU" sz="' + sz + '"' +
        (o.bold ? ' b="1"' : '') + ' dirty="0">' +
        '<a:solidFill><a:srgbClr val="' + (o.color || C.tx) + '"/></a:solidFill>' +
        '<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:rPr>' +
        '<a:t>' + esc(line) + '</a:t></a:r></a:p>';
    }).join('');
  }

  var uid = 1;
  function shape(x, y, w, h, body, fill) {
    uid++;
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + uid + '" name="tx' + uid + '"/>' +
      '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/>' +
      '<a:ext cx="' + Math.round(w) + '" cy="' + Math.round(h) + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
      (fill ? '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill>'
        : '<a:noFill/>') +
      '</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="180000" tIns="140000" ' +
      'rIns="180000" bIns="140000" anchor="t"><a:normAutofit/></a:bodyPr>' +
      '<a:lstStyle/>' + body + '</p:txBody></p:sp>';
  }

  function cell(text, o) {
    o = o || {};
    var ln = ['L', 'R', 'T', 'B'].map(function (s) {
      return '<a:ln' + s + ' w="12700" cap="flat"><a:solidFill>' +
        '<a:srgbClr val="' + C.line + '"/></a:solidFill></a:ln' + s + '>';
    }).join('');
    return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' +
      para(text, { size: o.size || 17, bold: o.bold, color: o.color, align: o.align }) +
      '</a:txBody><a:tcPr marL="120000" marR="120000" marT="90000" marB="90000" ' +
      'anchor="ctr">' + ln +
      (o.fill ? '<a:solidFill><a:srgbClr val="' + o.fill + '"/></a:solidFill>' : '') +
      '</a:tcPr></a:tc>';
  }

  function table(x, y, w, head, rows, widths, rowH) {
    uid++;
    var cols = widths.map(function (part) {
      return '<a:gridCol w="' + Math.round(w * part) + '"/>';
    }).join('');
    var out = '', n = 0;
    if (head && head.length) {
      n++;
      out += '<a:tr h="' + rowH + '">' + head.map(function (t, i) {
        return cell(t, { bold: true, color: C.white, fill: C.dark, size: 16,
          align: i === 0 ? 'l' : (i === head.length - 1 ? 'r' : 'ctr') });
      }).join('') + '</a:tr>';
    }
    rows.forEach(function (r, ri) {
      n++;
      var strong = !!r.strong;
      out += '<a:tr h="' + rowH + '">' + r.map(function (t, i) {
        var last = i === r.length - 1;
        return cell(t, { size: 17, bold: strong,
          color: strong ? C.dark : null,
          fill: strong ? C.soft : (ri % 2 ? C.zebra : null),
          align: i === 0 ? 'l' : (last ? 'r' : 'ctr') });
      }).join('') + '</a:tr>';
    });
    return '<p:graphicFrame><p:nvGraphicFramePr>' +
      '<p:cNvPr id="' + uid + '" name="tbl' + uid + '"/>' +
      '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>' +
      '<p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/>' +
      '<a:ext cx="' + Math.round(w) + '" cy="' + Math.round(rowH * n) + '"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>' + cols + '</a:tblGrid>' +
      out + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }

  // Блоки укладываются сверху вниз: высоту считаем по числу строк, чтобы
  // текст не наезжал на соседний блок.
  function slideXml(blocks) {
    var y = PAD, body = '';
    (blocks || []).forEach(function (b) {
      if (b.t === 'bar') {
        var h1 = b.sub ? 700000 : 480000;
        body += shape(PAD, y, INNER, h1,
          para(b.text, { size: 30, bold: true, color: C.white }) +
          (b.sub ? para(b.sub, { size: 17, color: C.line }) : ''), C.dark);
        y += h1 + 200000;
      } else if (b.t === 'text') {
        var sz = b.size || 20;
        var h2 = 280000 + String(b.text).split('\n').length * sz * 1.6 * EMU;
        body += shape(PAD, y, INNER, h2,
          para(b.text, { size: sz, bold: b.bold, color: b.color || C.tx }),
          b.fill || null);
        y += h2 + 140000;
      } else if (b.t === 'note') {
        var h3 = 260000 + String(b.text).split('\n').length * 15 * 1.6 * EMU;
        body += shape(PAD, y, INNER, h3,
          para(b.text, { size: 15, color: C.muted }), C.soft);
        y += h3 + 140000;
      } else if (b.t === 'kv') {
        var rh = 400000;
        body += table(PAD, y, INNER, null, b.rows.slice(), [0.34, 0.66], rh);
        y += rh * b.rows.length + 200000;
      } else if (b.t === 'table') {
        var rh2 = b.rowH || 460000;
        body += table(PAD, y, INNER, b.head, b.rows, b.w, rh2);
        y += rh2 * (b.rows.length + (b.head ? 1 : 0)) + 200000;
      }
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/>' +
      '<p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/>' +
      '<a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/>' +
      '</a:xfrm></p:grpSpPr>' + body +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  function theme() {
    var three = function (inner) { return inner + inner + inner; };
    var font = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'name="LASERCUT"><a:themeElements><a:clrScheme name="LASERCUT">' +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
      '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="' + C.dark + '"/></a:dk2>' +
      '<a:lt2><a:srgbClr val="' + C.soft + '"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="' + C.mid + '"/></a:accent1>' +
      '<a:accent2><a:srgbClr val="' + C.dark + '"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="' + C.line + '"/></a:accent3>' +
      '<a:accent4><a:srgbClr val="' + C.muted + '"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="' + C.mid + '"/></a:accent5>' +
      '<a:accent6><a:srgbClr val="' + C.dark + '"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="' + C.mid + '"/></a:hlink>' +
      '<a:folHlink><a:srgbClr val="' + C.muted + '"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="LASERCUT"><a:majorFont>' + font +
      '</a:majorFont><a:minorFont>' + font + '</a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="LASERCUT"><a:fillStyleLst>' +
      three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>') +
      '</a:fillStyleLst><a:lnStyleLst>' +
      three('<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>') +
      '</a:lnStyleLst><a:effectStyleLst>' +
      three('<a:effectStyle><a:effectLst/></a:effectStyle>') +
      '</a:effectStyleLst><a:bgFillStyleLst>' +
      three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>') +
      '</a:bgFillStyleLst></a:fmtScheme>' +
      '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function emptyTree() {
    return '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/>' +
      '<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>' +
      '<a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/>' +
      '<a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>';
  }

  function build(deck) {
    uid = 1;
    var slides = (deck.slides || []).map(slideXml);
    var n = slides.length;
    var R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var O = 'http://schemas.openxmlformats.org/officeDocument/2006';
    var P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var relsOpen = head + '<Relationships xmlns="http://schemas.openxmlformats.org/' +
      'package/2006/relationships">';

    var ct = head +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slides.map(function (_, i) {
        return '<Override PartName="/ppt/slides/slide' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
      }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    var rootRels = relsOpen +
      '<Relationship Id="rId1" Type="' + O + '/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="' + O + '/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + O + '/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    var presRels = relsOpen +
      '<Relationship Id="rId1" Type="' + R + '/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      slides.map(function (_, i) {
        return '<Relationship Id="rId' + (i + 2) + '" Type="' + R +
          '/slide" Target="slides/slide' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (n + 2) + '" Type="' + R + '/theme" Target="theme/theme1.xml"/>' +
      '</Relationships>';

    var pres = head +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="' + R + '" xmlns:p="' + P + '" saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + slides.map(function (_, i) {
        return '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>';
      }).join('') + '</p:sldIdLst>' +
      '<p:sldSz cx="' + W + '" cy="' + H + '"/>' +
      '<p:notesSz cx="' + H + '" cy="' + W + '"/></p:presentation>';

    var master = head +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="' + R + '" xmlns:p="' + P + '">' + emptyTree() +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
      'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
      'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/>' +
      '</p:sldLayoutIdLst></p:sldMaster>';

    var layout = head +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="' + R + '" xmlns:p="' + P + '" type="blank" preserve="1">' +
      emptyTree() +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

    var masterRels = relsOpen +
      '<Relationship Id="rId1" Type="' + R + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="' + R + '/theme" Target="../theme/theme1.xml"/>' +
      '</Relationships>';
    var layoutRels = relsOpen +
      '<Relationship Id="rId1" Type="' + R + '/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>';
    var slideRels = relsOpen +
      '<Relationship Id="rId1" Type="' + R + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '</Relationships>';

    var core = head +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(deck.title || 'Технико-коммерческое предложение') + '</dc:title>' +
      '<dc:creator>LASERCUT</dc:creator>' +
      '<cp:lastModifiedBy>LASERCUT</cp:lastModifiedBy></cp:coreProperties>';

    var app = head +
      '<Properties xmlns="' + O + '/extended-properties" xmlns:vt="' + O + '/docPropsVTypes">' +
      '<Application>LASERCUT</Application><Slides>' + n + '</Slides></Properties>';

    var enc = DOCX.utf8;
    var files = [
      { name: '[Content_Types].xml', bytes: enc(ct) },
      { name: '_rels/.rels', bytes: enc(rootRels) },
      { name: 'docProps/core.xml', bytes: enc(core) },
      { name: 'docProps/app.xml', bytes: enc(app) },
      { name: 'ppt/presentation.xml', bytes: enc(pres) },
      { name: 'ppt/_rels/presentation.xml.rels', bytes: enc(presRels) },
      { name: 'ppt/theme/theme1.xml', bytes: enc(theme()) },
      { name: 'ppt/slideMasters/slideMaster1.xml', bytes: enc(master) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', bytes: enc(masterRels) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', bytes: enc(layout) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', bytes: enc(layoutRels) }
    ];
    slides.forEach(function (s, i) {
      files.push({ name: 'ppt/slides/slide' + (i + 1) + '.xml', bytes: enc(s) });
      files.push({ name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels',
        bytes: enc(slideRels) });
    });
    return DOCX.zip(files);
  }

  return { build: build, W: W, H: H, C: C };
}());
