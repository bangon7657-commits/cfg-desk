# -*- coding: utf-8 -*-
"""Сборка самодостаточного HTML. Данные и логика — из модулей, разметка — здесь.

Запуск: python3 build.py
Результат: dist/index.html, dist/manifest.webmanifest, dist/sw.js, dist/robots.txt,
иконки 192/512/maskable/180.
"""
import base64
import json
import os
import struct
import zlib
from decimal import Decimal, ROUND_HALF_UP

import data
import reference as ref

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST_DIR') or os.path.join(HERE, 'dist')

# Версия кеша живёт в отдельном файле: поднять её при выпуске — одна правка одной цифры.
# Не поднимешь — телефон отдаст старую версию из service worker.
with open(os.path.join(HERE, 'cache_version.txt'), encoding='utf-8') as _f:
    CACHE_VERSION = int(_f.read().strip())

os.makedirs(DIST, exist_ok=True)

# ---------------------------------------------------------------------------
# Фактические отклонения — считаем, а не заявляем
# ---------------------------------------------------------------------------
dev_exact, dev_r100, max_dev = 0, 0, 0
for row in data.MILLING:
    order, stock = row[6], row[7]
    exact = int((Decimal(order) * Decimal('1.11')).quantize(Decimal('1'), ROUND_HALF_UP))
    r100 = int((Decimal(order) * Decimal('1.11') / 100).quantize(Decimal('1'), ROUND_HALF_UP)) * 100
    if exact != stock:
        dev_exact += 1
        max_dev = max(max_dev, abs(stock - exact))
    if r100 != stock:
        dev_r100 += 1

n_fiber = len(data.FIBER_A) + sum(2 + len(c['rot']) + len(c['table_rot'])
                                  for c in data.FIBER_S.values())

# ---------------------------------------------------------------------------
# Данные для клиента. В JSON попадает только то, что реально читает интерфейс.
# Остальное (массы, сервис, наценки) рисуется статическими таблицами.
# ---------------------------------------------------------------------------
APP = {
    'ndsDefault': data.NDS_DEFAULT,
    'kpValidDays': data.KP_VALID_DAYS,
    'invoiceValidDays': data.INVOICE_VALID_DAYS,
    'manager': data.MANAGER,
    'guarantee': data.GUARANTEE,
    # Для выгрузки ТКП в файл и для смены поставщика
    'company': {'phone': data.COMPANY['phone'], 'email': data.COMPANY['email'],
                'site': data.COMPANY['site'], 'brand': data.COMPANY['brand'],
                'social': data.COMPANY['social']},
    'suppliers': data.SUPPLIERS,
    'supplierDefault': data.SUPPLIER_DEFAULT,
    'supplierByWarning': data.SUPPLIER_BY_WARNING,
    'deliveryOrder': data.DELIVERY_ORDER_LABEL,
    'deliveryStock': data.DELIVERY_STOCK_LABEL,
    'deliveryTerms': data.DELIVERY_TERMS,
    'maxDiscount': data.MAX_DISCOUNT_PCT,
    'discountOnServices': data.DISCOUNT_ON_SERVICES_BY_DEFAULT,
    'fiberFormats': data.FIBER_FORMATS,
    'fiberA': [{'format': f, 'power': p, 'price': v} for (f, p), v in sorted(data.FIBER_A.items())],
    'fiberS': [{'format': f, 'power': p, 'base': c['base'], 'table': c['table'],
                'rot': c['rot'], 'tableRot': c['table_rot']}
               for (f, p), c in sorted(data.FIBER_S.items())],
    # второй прайс: те же конфигурации, приводы Bochu S9
    'fiberSBochu': [{'format': f, 'power': p, 'base': c['base'], 'table': c['table'],
                     'rot': c['rot'], 'tableRot': c['table_rot']}
                    for (f, p), c in sorted(data.FIBER_S_BOCHU.items())],
    'servo': data.SERVO,
    'servoDefault': data.SERVO_DEFAULT,
    'servoSmall': list(data.SERVO_SMALL),
    'fiberKit': {str(k): v for k, v in data.FIBER_KIT.items()},
    'fiberKitRotaryCtrl': data.FIBER_KIT_ROTARY_CTRL,
    'stabilizers': data.STABILIZERS,
    'stabilizerNote': data.STABILIZER_NOTE,
    'compressors': data.COMPRESSORS,
    'compressorAdvice': data.COMPRESSOR_ADVICE,
    'compressorNote': data.COMPRESSOR_NOTE,
    # Границы расхода воздуха и объём баллона считаем из таблиц, чтобы текст
    # на экране не расходился с данными при правке прайса.
    'airDemand': {
        'min': float(data.GAS_6KW_STEEL[0][2].replace(',', '.')),
        'max': float(data.GAS_6KW_INOX[-1][2].replace(',', '.')),
        'maxLabel': f'нержавейка {data.GAS_6KW_INOX[-1][0]} мм',
    },
    'cylinderM3': float(dict(data.GAS_CYLINDER)['Объём газа'].split()[0].replace(',', '.')),
    'minTankL': ref.MIN_RECEIVER_L,
    'extraction': data.EXTRACTION,
    'cryo': data.CRYO,
    'milling': [{'format': f, 'name': n, 'kw': kw, 'cool': c, 'ctrl': ct,
                 'vac': v, 'order': o, 'stock': s}
                for f, n, kw, c, ct, v, o, s in data.MILLING],
    'millingFields': data.MILLING_FIELDS,
    # Явный порядок форматов: JS сортирует ключи объекта, у которых вид
    # целого числа ('6090'), впереди остальных ('0404'), и список ломается.
    'millingOrder': list(data.MILLING_FIELDS.keys()),
    'fiberOrder': sorted(data.FIBER_FORMATS.keys()),
    'options': [{'cat': c, 'name': n, 'price': p} for c, n, p in data.OPTIONS],
    'vibroQty': data.VIBRO_QTY,
    'pnr': [{'model': m, 'days': d, 'pnr': p, 'plus1': p1, 'plus2': p2,
             'training': t, 'package': pk}
            for m, d, p, p1, p2, t, pk in data.PNR],
    'pnrTerms': data.PNR_TERMS,
    'fiberAWorkMm': data.FIBER_A_WORK_MM,
    'cutLimits': ref.CUT_LIMITS,
    'gasByMaterial': ref.GAS_BY_MATERIAL,
    'reservePct': ref.RESERVE_PCT,
    'gas': [{'nozzle': n, 'o2': o2, 'o2b': list(o2b), 'n2': n2, 'n2b': list(n2b)}
            for n, o2, o2b, n2, n2b in ref.GAS],
    'readiness': [{'name': n, 'a': a, 's': s, 'blocker': b, 'note': note}
                  for n, a, s, b, note in ref.READINESS],
    'matchRules': [{'kind': k, 'task': t, 'answer': a, 'scope': s}
                   for k, t, a, s in ref.MATCH_RULES],
}

assert 'service' not in APP and 'millingMass' not in APP

# ---------------------------------------------------------------------------
# Иконки: генерируем PNG кодом, без внешних файлов
# ---------------------------------------------------------------------------
def png(size, bg, fg, inset):
    """Минимальный PNG: фон bg, по центру квадратная рамка цветом fg."""
    def chunk(tag, payload):
        c = tag + payload
        return struct.pack('>I', len(payload)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    rows = b''
    m = int(size * inset)
    thick = max(2, size // 14)
    for y in range(size):
        row = b'\x00'
        for x in range(size):
            on_frame = (m <= x < size - m and m <= y < size - m and
                        (x < m + thick or x >= size - m - thick or
                         y < m + thick or y >= size - m - thick))
            bar = (size * 0.42 <= y < size * 0.42 + thick and
                   m + thick * 2 <= x < size - m - thick * 2)
            row += bytes(fg if (on_frame or bar) else bg)
        rows += row
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


DARK = (16, 14, 12)
ORANGE = (255, 122, 24)
ICONS = {
    'icon-192.png': png(192, DARK, ORANGE, 0.18),
    'icon-512.png': png(512, DARK, ORANGE, 0.18),
    'icon-maskable-512.png': png(512, DARK, ORANGE, 0.28),
    'apple-touch-icon-180.png': png(180, DARK, ORANGE, 0.18),
}
for name, blob in ICONS.items():
    with open(os.path.join(DIST, name), 'wb') as f:
        f.write(blob)

# ---------------------------------------------------------------------------
# Статические таблицы: рендерим в HTML, чтобы файл читался без JS
# ---------------------------------------------------------------------------
def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def rub(n):
    return f'{n:,}'.replace(',', ' ') + ' ₽'


def plural(n, forms):
    """Согласование существительного с числом: (1, 2-4, 5+).
    plural(122, ('конфигурация','конфигурации','конфигураций')) -> '122 конфигурации'
    """
    m = n % 100
    if 11 <= m <= 19:
        w = forms[2]
    else:
        m = n % 10
        w = forms[0] if m == 1 else forms[1] if 2 <= m <= 4 else forms[2]
    return f'{n} {w}'


CFG_FORMS = ('конфигурация', 'конфигурации', 'конфигураций')


def table(headers, rows, cls=''):
    out = [f'<table class="{cls}"><thead><tr>']
    out += [f'<th>{esc(h)}</th>' for h in headers]
    out.append('</tr></thead><tbody>')
    for r in rows:
        out.append('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>')
    out.append('</tbody></table>')
    return ''.join(out)


# Волокно — полная таблица
fiber_rows = []
for (f, p), v in sorted(data.FIBER_A.items()):
    fiber_rows.append([f'Wattsan A {f} {p}W', data.FIBER_FORMATS[f], f'{p} Вт',
                       'база', f'<b>{rub(v)}</b>'])
for (f, p), c in sorted(data.FIBER_S.items()):
    fiber_rows.append([f'Wattsan S {f} {p}W', data.FIBER_FORMATS[f], f'{p} Вт',
                       'база', f'<b>{rub(c["base"])}</b>'])
    fiber_rows.append([f'Wattsan S {f} {p}W + сменный стол', data.FIBER_FORMATS[f],
                       f'{p} Вт', f'+{rub(c["table"] - c["base"])}', f'<b>{rub(c["table"])}</b>'])
    for r, pr in sorted(c['rot'].items()):
        fiber_rows.append([f'Wattsan S {f} {p}W + rotary {r}', data.FIBER_FORMATS[f],
                           f'{p} Вт', f'+{rub(pr - c["base"])}', f'<b>{rub(pr)}</b>'])
    for r, pr in sorted(c['table_rot'].items()):
        fiber_rows.append([f'Wattsan S {f} {p}W + стол + rotary {r}', data.FIBER_FORMATS[f],
                           f'{p} Вт', f'+{rub(pr - c["base"])}', f'<b>{rub(pr)}</b>'])
FIBER_TABLE = table(['Конфигурация', 'Поле, мм', 'Мощность', 'Доплата к базе', 'Цена'],
                    fiber_rows, 'wide')

MILLING_TABLE = table(
    ['Конфигурация', 'Поле, мм', 'Шпиндель', 'Охлажд.', 'Стойка', 'Вакуум',
     'Под заказ', 'Из наличия'],
    [[esc(n), data.MILLING_FIELDS[f], f'{kw} кВт', c, ct, 'да' if v else 'нет',
      rub(o), f'<b>{rub(s)}</b>'] for f, n, kw, c, ct, v, o, s in data.MILLING],
    'wide')

PNR_TABLE = table(['Станок', 'Дней', 'ПНР', '+1 день', '+2 дня', 'Обучение', 'ПНР+обучение'],
                  [[esc(m), d, rub(p), rub(p1) if p1 else '—', rub(p2) if p2 else '—',
                    esc(t) if isinstance(t, str) else rub(t), rub(pk) if pk else '—']
                   for m, d, p, p1, p2, t, pk in data.PNR])

SERVICE_TABLE = table(['Тип работ', 'Наименование', 'Цена'],
                      [[k, esc(n), f'<b>{rub(p)}</b>'] for k, n, p in data.SERVICE])

CUT_TABLE = table(['Мощность', 'Углеродистая сталь', 'Нержавейка', 'Алюминий', 'Латунь', 'Медь'],
                  [[f'<b>{p} Вт</b>', d['Углеродистая сталь'], d['Нержавейка'],
                    d['Алюминий'], d['Латунь'], d['Медь']] for p, d in ref.CUT_MAX])

CUT_SITE_TABLE = table(['Модель', 'Чёрная сталь', 'Нержавейка', 'Алюминий', 'Латунь'],
                       [[f'<b>{esc(a)}</b>', b, c, d, e] for a, b, c, d, e in ref.CUT_SITE])

GAS_TABLE = table(['Сопло', 'Кислород (сталь)', 'Баллонов/ч', 'Азот (нержавейка, алюминий)', 'Баллонов/ч'],
                  [[f'<b>{n}</b>', f'{o2} л/мин', f'{o2b[0]}–{o2b[1]}'.replace('.', ','),
                    f'{n2} л/мин', f'<b>{n2b[0]}–{n2b[1]}</b>'.replace('.', ',')]
                   for n, o2, o2b, n2, n2b in ref.GAS])

READINESS_TABLE = table(['Требование', 'A 1313 / 1530, 1,5–3 кВт', 'S-HP (RD) 1530, 6–6,6 кВт', ''],
                        [[f'<b>{esc(n)}</b>', esc(a), esc(s),
                          '<span class="flag-block">блокер</span>' if b else '']
                         for n, a, s, b, note in ref.READINESS])

MATCH_TABLE = table(['Задача клиента', 'Решение', 'В этой версии'],
                    [[esc(t), esc(a),
                      {'in': '<span class="ok">есть</span>',
                       'ask': '<span class="warn">к менеджеру</span>',
                       'other': '<span class="warn">другая категория</span>'}[s]]
                     for k, t, a, s in ref.MATCH_RULES])

MARKUP_TABLE = table(['Что', 'Наценка за наличие', 'Замечание'],
                     [[esc(k),
                       ('нет второго ценника' if v['pct'] is None
                        else f'<b>+{str(v["pct"]).replace(".", ",").replace(",0", "")} %</b>'),
                       esc(v['note'])]
                      for k, v in data.STOCK_MARKUP.items()])

# --- новые справочники: приводы, головы, обвязка, газ 6 кВт, узлы ---
HEADS_TABLES = ''.join(
    f'<h3>{esc(group)}</h3>' +
    table(['Голова', 'Предел по источнику'],
          [[f'<b>{esc(n)}</b>', f'{kw} кВт'] for n, kw in rows])
    for group, rows in data.HEADS.items())

KIT_TABLE = table(['Мощность источника', 'Контроллер', 'Голова', 'Чиллер'],
                  [[f'<b>{p} Вт</b>', esc(v['ctrl']), esc(v['head']), esc(v['chiller'])]
                   for p, v in sorted(data.FIBER_KIT.items())])


def _servo_add(s):
    a, b_ = s['add']['small'], s['add']['big']
    if not a and not b_:
        return 'в цене прайса'
    if a == b_:
        return f'+{rub(a)}'
    return f'+{rub(a)} (1530/1560) · +{rub(b_)} (2030/2040/2060)'


SERVO_TABLE = table(['Привод', 'Оси 1530 / 1560', 'Оси 2030 / 2040 / 2060',
                     'Скорость', 'Ускорение', 'Надбавка'],
                    [[f'<b>{esc(s["label"])}</b>', esc(s['axes']['small']),
                      esc(s['axes']['big']), esc(s['speed']), esc(s['accel']),
                      _servo_add(s)] for s in data.SERVO])

# Фактическая разница двух прайсов — считаем, а не пересказываем «−200 тыс.»
_diffs = {}
for (f_, p_), c_ in data.FIBER_S.items():
    b_ = data.FIBER_S_BOCHU[(f_, p_)]
    vals = [c_['base'] - b_['base'], c_['table'] - b_['table']]
    vals += [c_['rot'][r] - b_['rot'][r] for r in c_['rot']]
    vals += [c_['table_rot'][r] - b_['table_rot'][r] for r in c_['table_rot']]
    _diffs.setdefault(f_, []).extend(vals)
SERVO_DIFF_TABLE = table(['Формат', 'Bochu дешевле Yaskawa', 'Позиций в прайсе'],
                         [[f'<b>{esc(f_)}</b>',
                           (rub(min(v)) if min(v) == max(v)
                            else f'от {rub(min(v))} до {rub(max(v))}'), str(len(v))]
                          for f_, v in sorted(_diffs.items())])

STAB_TABLE = table(['Модель', 'Мощность', 'Питание', 'Назначение', 'Цена'],
                   [[f'<b>{esc(s["name"])}</b>', esc(s['power']), esc(s['phase']),
                     'металлорез' if s['for'] == 'fiber' else 'сварка',
                     f'<b>{rub(s["price"])}</b>'] for s in data.STABILIZERS])

COMPRESSOR_TABLE = table(['Модель', 'Давление', 'Подача', 'Мощность', 'Ресивер',
                          'Шум', 'Габариты, масса', 'Гарантия', 'КП', 'Цена с НДС'],
                         [[f'<b>{esc(c["name"])}</b>', f'{c["bar"]} бар',
                           f'{c["lmin"]} л/мин', f'{str(c["kw"]).replace(".", ",")} кВт',
                           f'{c["tank"]} л', esc(c['noise']),
                           f'{esc(c["size"])}, {c["mass"]} кг', esc(c['warranty']),
                           f'{esc(c["kp_date"])} — {esc(c["kp_valid"])}',
                           f'<b>{rub(c["price"])}</b>'] for c in data.COMPRESSORS])

EXTRACTION_TABLE = table(['Модель', 'Производительность', 'Разрежение', 'Мощность',
                          'Патрубок', 'Фильтр', 'Цена с НДС'],
                         [[f'<b>{esc(e["name"])}</b>', f'{e["flow"]} м³/ч',
                           esc(e['vacuum']), f'{str(e["kw"]).replace(".", ",")} кВт',
                           esc(e['port']), esc(e['filter']), f'<b>{rub(e["price"])}</b>']
                          for e in data.EXTRACTION])

CRYO_TABLE = table(['Позиция', 'Производительность', 'Цена с НДС'],
                   [[f'<b>{esc(c["name"])}</b>',
                     f'{str(c["flow"]).replace(".", ",")} нм³/ч',
                     f'<b>{rub(c["price"])}</b>'] for c in data.CRYO])
CRYO_SPEC_TABLE = table(['Параметр', 'Значение'],
                        [[esc(a), esc(v)] for a, v in data.CRYO_SPEC])


def gas6_table(rows):
    return table(['Толщина', 'Расход в час', 'Расход в минуту', 'На 1 м реза', 'Газ'],
                 [[f'<b>{t} мм</b>', f'{h} м³', f'{m} м³', f'{one} м³', esc(g)]
                  for t, h, m, one, g in rows])


GAS6_STEEL_TABLE = gas6_table(data.GAS_6KW_STEEL)
GAS6_INOX_TABLE = gas6_table(data.GAS_6KW_INOX)
GAS_LIQ_O2_TABLE = table(['кг', 'л', 'м³ при 0 °C', 'м³ при 20 °C'],
                         [list(r) for r in data.GAS_LIQUID_O2])
GAS_LIQ_N2_TABLE = table(['кг', 'л', 'м³ при 0 °C', 'м³ при 20 °C'],
                         [list(r) for r in data.GAS_LIQUID_N2])
GAS_CYL_TABLE = table(['Параметр', 'Значение'],
                      [[esc(a), f'<b>{esc(v)}</b>'] for a, v in data.GAS_CYLINDER])

COMPONENTS_HTML = ''.join(
    f'<details><summary>{esc(model)}</summary><div class="det-b">' +
    table(['Узел', 'Что стоит'], [[f'<b>{esc(a)}</b>', esc(v)] for a, v in rows]) +
    '</div></details>'
    for model, rows in data.COMPONENTS)
COMPONENTS_COMMON_TABLE = table(['Группа', 'Состав'],
                                [[f'<b>{esc(a)}</b>', esc(v)]
                                 for a, v in data.COMPONENTS_COMMON])


CONFLICTS_HTML = ''.join(
    f'<div class="conflict"><div class="conflict-t">{esc(t)}</div>'
    f'<div class="conflict-b">{esc(b)}</div>'
    f'<div class="conflict-a">Что делать: {esc(a)}</div></div>'
    for t, b, a in ref.CONFLICTS)

MISSING_HTML = ''.join(
    f'<div class="miss"><b>{esc(t)}</b><span>{esc(d)}</span></div>'
    for t, d in ref.MISSING_DATA)

SERIES_TABLE = table(['Серия', 'Что внутри', 'Кому'],
                     [[f'<b>{esc(a)}</b>', esc(b), esc(c)] for a, b, c in data.MILLING_SERIES])

MATERIALS_TABLE = table(['Материал', 'A1', 'M1', 'M3'],
                        [[esc(m), a, b, c] for m, a, b, c in data.MILLING_MATERIALS])

MASS_TABLE = table(['Модель', 'Масса'],
                   [[esc(k), f'<b>{v} кг</b>'] for k, v in data.MILLING_MASS.items()])

OUT_OF_SCOPE_HTML = ''.join(
    f'<div class="miss"><b>{esc(a)}</b><span>{esc(b)}</span></div>'
    for a, b in ref.MATCH_OUT_OF_SCOPE)

GAS_FACTS_HTML = ''.join(f'<li>{esc(x)}</li>' for x in ref.GAS_FACTS)
GAS_ADVICE_HTML = ''.join(f'<div class="advice"><b>{esc(a)}</b><span>{esc(b)}</span></div>'
                          for a, b in ref.GAS_ADVICE)
PNR_TERMS_HTML = ''.join(f'<li>{esc(x)}</li>' for x in data.PNR_TERMS)
FIBER_MISSING_HTML = ''.join(f'<li>{esc(x)}</li>' for x in data.FIBER_MISSING)
DATA_RULES_HTML = ''.join(
    f'<div class="rule"><span class="st st-{i}">{esc(a)}</span><span>{esc(b)}</span></div>'
    for i, (a, b) in enumerate(ref.DATA_RULES))

# ---------------------------------------------------------------------------
# Печатный ТКП: фирменное оформление шаблона lasercut-kp («синий фон»).
# Шапка, подвал и постоянные разделы — статическая разметка: печатаются
# и без JS, и логотип не приходится тащить через JSON.
# ---------------------------------------------------------------------------
with open(os.path.join(HERE, 'kp_logo.png'), 'rb') as f:
    LOGO_B64 = base64.b64encode(f.read()).decode('ascii')

SUP_DEFAULT = [s for s in data.SUPPLIERS if s['id'] == data.SUPPLIER_DEFAULT][0]


def legal_lines(sup_raw):
    """Строки блока реквизитов. Пустые поля пропускаются — не выдумываем.

    Тот же порядок строк собирает ui.js при смене поставщика; совпадение
    статики и скрипта проверяется в prerender.js.
    """
    # .get(): профиль без какого-то ключа не должен ронять сборку
    sup = {k: (sup_raw.get(k) or '') for k in
           ('name', 'inn', 'kpp', 'ogrn', 'okpo', 'unp', 'ceo_full', 'account',
            'bank', 'bik', 'corr', 'addr_legal', 'addr_fact')}
    out = []
    ident = []
    if sup['inn']:
        ident.append('ИНН/КПП ' + sup['inn'] + (' / ' + sup['kpp'] if sup['kpp'] else ''))
    if sup['ogrn']:
        ident.append('ОГРН/ОКПО ' + sup['ogrn'] + (' / ' + sup['okpo'] if sup['okpo'] else ''))
    if sup['unp']:
        ident.append('УНП ' + sup['unp'])
    out.append('Юр. лицо: ' + sup['name'] + (' · ' + ' · '.join(ident) if ident else ''))
    if sup['ceo_full']:
        out.append('Руководитель: ' + sup['ceo_full'])
    if sup['account']:
        acc = 'Р/счёт: ' + sup['account']
        for extra in (sup['bank'], 'БИК ' + sup['bik'] if sup['bik'] else '',
                      'К/счёт ' + sup['corr'] if sup['corr'] else ''):
            if extra:
                acc += ' · ' + extra
        out.append(acc)
    if sup['addr_legal']:
        out.append('Юр. адрес: ' + sup['addr_legal'])
    if sup['addr_fact']:
        out.append('Факт. адрес: ' + sup['addr_fact'])
    out.append(data.COMPANY['social'])
    return out


KP_HEAD = (
    '<div class="kp-head">'
    f'<img class="kp-logo" src="data:image/png;base64,{LOGO_B64}" '
    'alt="LASERCUT" width="260" height="61">'
    '<div class="kp-contacts">'
    f'{esc(data.COMPANY["phone"])} · {esc(data.COMPANY["email"])} · '
    f'{esc(data.COMPANY["site"])}<br>'
    f'<span id="kpHeadLine">{esc(SUP_DEFAULT["head_line"])}</span>'
    '</div></div>')


def kp_rows(rows):
    return ''.join(
        f'<tr><th>{esc(a)}</th><td>{esc(b)}</td></tr>' for a, b in rows)


KP_TERMS = kp_rows(data.DELIVERY_ROWS) + (
    f'<tr><th>Срок действия КП</th><td>{data.KP_VALID_DAYS} дней с даты выставления '
    '(цены и наличие могут измениться)</td></tr>')
KP_SERVICE = kp_rows(data.SERVICE_ROWS)
KP_NEXT = (f'<div class="kp-cta"><b>{esc(data.NEXT_STEP["title"])}</b>'
           f'<span>{esc(data.NEXT_STEP["text"])}</span></div>')
KP_SIGN = (
    '<div class="kp-sign">'
    '<div><div class="kp-sign-t">С уважением,<br>'
    f'<b id="kpSignTitle">{esc(SUP_DEFAULT["ceo_title"])}</b></div>'
    '<div class="kp-line"></div>'
    f'<span class="kp-cap"><b id="kpSignName">{esc(SUP_DEFAULT["ceo_short"])}</b>'
    ' · подпись / Ф.И.О.</span>'
    '</div>'
    '<div><div class="kp-sign-t"></div><div class="kp-line"></div>'
    '<span class="kp-cap">М.П.</span></div></div>')
KP_MGR = ('<div class="kp-mgr"><span>Ваш менеджер</span>'
          f'<b>{esc(data.MANAGER["name"])}</b> · {esc(data.MANAGER["role"])}<br>'
          f'{esc(data.MANAGER["phone"])} · {esc(data.MANAGER["email"])} · '
          f'{esc(data.MANAGER["sites"])}</div>')
KP_LEGAL = ('<div class="kp-legal" id="kpLegal"><b>' + esc(data.COMPANY['brand']) +
            '</b>' +
            ''.join(f'<span>{esc(x)}</span>' for x in legal_lines(SUP_DEFAULT)) +
            '</div>')

SUPPLIER_OPTIONS = ''.join(
    f'<option value="{s["id"]}">{esc(s["short"])}'
    f'{"" if s["confirmed"] else " — реквизиты заполнить"}</option>'
    for s in data.SUPPLIERS)

SUPPLIER_FIELDS = [
    ('name', 'Юр. лицо'), ('ceo_title', 'Должность и лицо в подписи'),
    ('ceo_short', 'Фамилия И.О.'), ('ceo_full', 'Руководитель полностью'),
    ('head_line', 'Строка в шапке ТКП'),
    ('inn', 'ИНН'), ('kpp', 'КПП'), ('ogrn', 'ОГРН'), ('okpo', 'ОКПО'),
    ('unp', 'УНП (РБ)'), ('account', 'Р/счёт'), ('bank', 'Банк'),
    ('bik', 'БИК'), ('corr', 'К/счёт'),
    ('addr_legal', 'Юр. адрес'), ('addr_fact', 'Факт. адрес'),
]
SUPPLIER_FORM = ''.join(
    f'<div style="flex:1 1 240px"><label class="f">{esc(t)}</label>'
    f'<input type="text" id="sup_{k}" data-sup="{k}"></div>'
    for k, t in SUPPLIER_FIELDS)

with open(os.path.join(HERE, 'money.js'), encoding='utf-8') as f:
    MONEY_JS = f.read()
with open(os.path.join(HERE, 'docx.js'), encoding='utf-8') as f:
    DOCX_JS = f.read()
with open(os.path.join(HERE, 'ui.js'), encoding='utf-8') as f:
    UI_JS = f.read()
with open(os.path.join(HERE, 'style.css'), encoding='utf-8') as f:
    CSS = f.read()
with open(os.path.join(HERE, 'template.html'), encoding='utf-8') as f:
    TPL = f.read()

# Инвариант печати: правило скрывает соседей .kpstep, значит блок с предпросмотром
# обязан иметь этот класс. Ошибка здесь один раз уже приводила к пустому листу.
assert 'class="step kpstep"' in TPL, 'в шаблоне нет блока с классом kpstep'
assert '.printme>*:not(.kpstep)' in CSS, 'в CSS нет правила печати для .kpstep'
assert 'id="kpPreview"' in TPL
# Фирменное оформление: палитра шаблона «синий фон» и логотип обязаны быть на месте.
assert '#1f3a5f' in CSS.lower(), 'в CSS нет тёмно-синего 1F3A5F из шаблона ТКП'
assert '#dce8f4' in CSS.lower(), 'в CSS нет светло-голубой заливки DCE8F4'
assert len(LOGO_B64) > 3000, 'логотип LASERCUT не встроился'

html = TPL
repl = {
    '__CSS__': CSS,
    '__DATA__': json.dumps(APP, ensure_ascii=False),
    '__MONEY_JS__': MONEY_JS,
    '__UI_JS__': UI_JS,
    '__FIBER_TABLE__': FIBER_TABLE,
    '__MILLING_TABLE__': MILLING_TABLE,
    '__PNR_TABLE__': PNR_TABLE,
    '__SERVICE_TABLE__': SERVICE_TABLE,
    '__CUT_TABLE__': CUT_TABLE,
    '__CUT_SITE_TABLE__': CUT_SITE_TABLE,
    '__GAS_TABLE__': GAS_TABLE,
    '__READINESS_TABLE__': READINESS_TABLE,
    '__MATCH_TABLE__': MATCH_TABLE,
    '__MARKUP_TABLE__': MARKUP_TABLE,
    '__HEADS_TABLES__': HEADS_TABLES,
    '__HEADS_NOTE__': esc(data.HEADS_NOTE),
    '__KIT_TABLE__': KIT_TABLE,
    '__KIT_NOTE__': esc(data.FIBER_KIT_NOTE),
    '__SERVO_TABLE__': SERVO_TABLE,
    '__SERVO_DIFF_TABLE__': SERVO_DIFF_TABLE,
    '__SERVO_NOTE__': esc(data.SERVO_NOTE),
    '__SERVO_A_NOTE__': esc(data.SERVO_A_NOTE),
    '__COMPRESSOR_TABLE__': COMPRESSOR_TABLE,
    '__STAB_TABLE__': STAB_TABLE,
    '__STAB_NOTE__': esc(data.STABILIZER_NOTE),
    '__STAB_WELD_NOTE__': esc(data.STABILIZER_WELD_NOTE),
    '__EXTRACTION_TABLE__': EXTRACTION_TABLE,
    '__CRYO_TABLE__': CRYO_TABLE,
    '__CRYO_SPEC_TABLE__': CRYO_SPEC_TABLE,
    '__CRYO_NOTE__': esc(data.CRYO_NOTE),
    '__GAS6_STEEL_TABLE__': GAS6_STEEL_TABLE,
    '__GAS6_INOX_TABLE__': GAS6_INOX_TABLE,
    '__GAS6_NOTE__': esc(data.GAS_6KW_NOTE),
    '__GAS_LIQ_O2_TABLE__': GAS_LIQ_O2_TABLE,
    '__GAS_LIQ_N2_TABLE__': GAS_LIQ_N2_TABLE,
    '__GAS_CYL_TABLE__': GAS_CYL_TABLE,
    '__COMPONENTS__': COMPONENTS_HTML,
    '__COMPONENTS_COMMON__': COMPONENTS_COMMON_TABLE,
    '__COMPONENTS_NOTE__': esc(data.COMPONENTS_NOTE),
    '__KP_HEAD__': KP_HEAD,
    '__KP_TERMS__': KP_TERMS,
    '__KP_SERVICE__': KP_SERVICE,
    '__KP_NEXT__': KP_NEXT,
    '__KP_SIGN__': KP_SIGN,
    '__KP_MGR__': KP_MGR,
    '__PAY_TERMS__': esc(dict(data.DELIVERY_ROWS)['Условия оплаты']),
    '__SUPPLIER_OPTIONS__': SUPPLIER_OPTIONS,
    '__SUPPLIER_FORM__': SUPPLIER_FORM,
    '__SUPPLIER_NOTE__': esc(data.SUPPLIER_NOTE),
    '__DOCX_JS__': DOCX_JS,
    '__KP_LEGAL__': KP_LEGAL,
    '__DELIVERY_ORDER__': esc(data.DELIVERY_ORDER_LABEL),
    '__DELIVERY_ORDER_FULL__': esc(data.DELIVERY_TERMS['order']),
    '__DELIVERY_STOCK_FULL__': esc(data.DELIVERY_TERMS['stock']),
    '__CONFLICTS__': CONFLICTS_HTML,
    '__MISSING__': MISSING_HTML,
    '__SERIES_TABLE__': SERIES_TABLE,
    '__MATERIALS_TABLE__': MATERIALS_TABLE,
    '__MASS_TABLE__': MASS_TABLE,
    '__OUT_OF_SCOPE__': OUT_OF_SCOPE_HTML,
    '__GAS_FACTS__': GAS_FACTS_HTML,
    '__GAS_ADVICE__': GAS_ADVICE_HTML,
    '__PNR_TERMS__': PNR_TERMS_HTML,
    '__FIBER_MISSING__': FIBER_MISSING_HTML,
    '__DATA_RULES__': DATA_RULES_HTML,
    '__CUT_WARNING__': esc(ref.CUT_MAX_WARNING),
    '__CUT_SITE_NOTE__': esc(ref.CUT_SITE_NOTE),
    '__READINESS_PREP__': esc(ref.READINESS_CLIENT_PREP),
    '__GAS_PRICE_MISSING__': esc(ref.GAS_PRICE_MISSING),
    '__VIBRO_NOTE__': esc(data.VIBRO_NOTE),
    '__FIBER_A_NOTE__': esc(data.FIBER_A_NOTE),
    '__GUARANTEE__': esc(data.GUARANTEE['label']),
    '__GUARANTEE_NOTE__': esc(data.GUARANTEE['note']),
    '__MAX_DISC__': str(data.MAX_DISCOUNT_PCT),
    '__FIBER_COUNT__': plural(n_fiber, CFG_FORMS),
    '__MILLING_COUNT__': plural(len(data.MILLING), CFG_FORMS),
    '__DATE_FIBER__': data.PRICE_DATES['fiber'],
    '__DATE_MILLING__': data.PRICE_DATES['milling'],
    '__DATE_OPTIONS__': data.PRICE_DATES['options'],
    '__KP_DAYS__': str(data.KP_VALID_DAYS),
    '__INVOICE_DAYS__': str(data.INVOICE_VALID_DAYS),
    '__DEV_EXACT__': str(dev_exact),
    '__DEV_TOTAL__': str(len(data.MILLING)),
    '__DEV_OK__': str(len(data.MILLING) - dev_exact),
    '__DEV_MAX__': str(max_dev),
    '__DEV_R100__': str(dev_r100),
    '__RESERVE__': str(ref.RESERVE_PCT),
}
for k, v in repl.items():
    html = html.replace(k, v)

leftovers = [k for k in repl if k in html]
if leftovers:
    raise SystemExit(f'Незаменённые плейсхолдеры: {leftovers}')

# Обратная сторона: запись в карте замен, которой нет в шаблоне, — мёртвый код.
unused = sorted(k for k in repl if k not in TPL)
if unused:
    raise SystemExit(f'Лишние записи в карте замен (нет в шаблоне): {unused}')

with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)

# ---------------------------------------------------------------------------
# PWA
# ---------------------------------------------------------------------------
manifest = {
    'name': 'Конфигуратор и смета',
    'short_name': 'Конфигуратор',
    'start_url': './index.html',
    'scope': './',
    'display': 'standalone',
    'background_color': '#100e0c',
    'theme_color': '#100e0c',
    'lang': 'ru',
    'icons': [
        {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
        {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
        {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png',
         'purpose': 'maskable'},
    ],
}
with open(os.path.join(DIST, 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

SW = """// Версия кеша берётся из cache_version.txt — поднимать при каждом выпуске.
const CACHE = 'cfg-v%d';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
""" % CACHE_VERSION
with open(os.path.join(DIST, 'sw.js'), 'w', encoding='utf-8') as f:
    f.write(SW)

with open(os.path.join(DIST, 'robots.txt'), 'w', encoding='utf-8') as f:
    f.write('User-agent: *\nDisallow: /\n')

size = os.path.getsize(os.path.join(DIST, 'index.html'))
print(f'index.html до пререндера: {size / 1024:.0f} КБ '
      f'(после пререндера вырастет — итоговый размер печатает prerender.js)')
print(f'Конфигураций волокна: {n_fiber} · фрезерных: {len(data.MILLING)}')
print(f'Наценка +11 %: отклонений от точного расчёта {dev_exact} из {len(data.MILLING)}, '
      f'максимум {max_dev} ₽; при округлении до 100 ₽ отклонений {dev_r100}')
print(f'Версия кеша: {CACHE_VERSION}')
