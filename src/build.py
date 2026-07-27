# -*- coding: utf-8 -*-
"""Сборка самодостаточного HTML. Данные и логика — из модулей, разметка — здесь.

Запуск: python3 build.py
Результат: dist/index.html, dist/manifest.webmanifest, dist/sw.js, dist/robots.txt,
иконки 192/512/maskable/180.
"""
import json
import os
import struct
import zlib
from decimal import Decimal, ROUND_HALF_UP

import data
import reference as ref

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST_DIR') or os.path.join(HERE, 'dist')
CACHE_VERSION = 1          # поднимать при каждом обновлении, иначе телефон отдаст старое

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

MARKUP_FINDING = {
    'total': len(data.MILLING),
    'dev_exact': dev_exact,
    'max_dev': max_dev,
    'dev_r100': dev_r100,
}

n_fiber = len(data.FIBER_A) + sum(2 + len(c['rot']) + len(c['table_rot'])
                                  for c in data.FIBER_S.values())

# ---------------------------------------------------------------------------
# Данные для клиента (JSON внутри файла)
# ---------------------------------------------------------------------------
APP = {
    'cacheVersion': CACHE_VERSION,
    'priceDates': data.PRICE_DATES,
    'ndsDefault': data.NDS_DEFAULT,
    'kpValidDays': data.KP_VALID_DAYS,
    'invoiceValidDays': data.INVOICE_VALID_DAYS,
    'manager': data.MANAGER,
    'fiberFormats': data.FIBER_FORMATS,
    'fiberA': [{'format': f, 'power': p, 'price': v} for (f, p), v in sorted(data.FIBER_A.items())],
    'fiberS': [{'format': f, 'power': p, 'base': c['base'], 'table': c['table'],
                'rot': c['rot'], 'tableRot': c['table_rot']}
               for (f, p), c in sorted(data.FIBER_S.items())],
    'bundleDiscount': data.BUNDLE_DISCOUNT,
    'fiberMissing': data.FIBER_MISSING,
    'milling': [{'format': f, 'name': n, 'kw': kw, 'cool': c, 'ctrl': ct,
                 'vac': v, 'order': o, 'stock': s}
                for f, n, kw, c, ct, v, o, s in data.MILLING],
    'millingFields': data.MILLING_FIELDS,
    # Явный порядок форматов: JS сортирует ключи объекта, у которых вид
    # целого числа ('6090'), впереди остальных ('0404'), и список ломается.
    'millingOrder': list(data.MILLING_FIELDS.keys()),
    'fiberOrder': sorted(data.FIBER_FORMATS.keys()),
    'millingMass': data.MILLING_MASS,
    'options': [{'cat': c, 'name': n, 'price': p} for c, n, p in data.OPTIONS],
    'vibroQty': data.VIBRO_QTY,
    'vibroUnit': data.VIBRO_UNIT,
    'a11ToA18': data.A11_TO_A18,
    'pnr': [{'model': m, 'days': d, 'pnr': p, 'plus1': p1, 'plus2': p2,
             'training': t, 'package': pk}
            for m, d, p, p1, p2, t, pk in data.PNR],
    'service': [{'kind': k, 'name': n, 'price': p} for k, n, p in data.SERVICE],
    'cutLimits': ref.CUT_LIMITS,
    'gasByMaterial': ref.GAS_BY_MATERIAL,
    'reservePct': ref.RESERVE_PCT,
    'gas': [{'nozzle': n, 'o2': o2, 'o2b': list(o2b), 'n2': n2, 'n2b': list(n2b)}
            for n, o2, o2b, n2, n2b in ref.GAS],
    'readiness': [{'name': n, 'a': a, 's': s, 'blocker': b, 'note': note}
                  for n, a, s, b, note in ref.READINESS],
    'matchRules': [{'kind': k, 'task': t, 'answer': a, 'scope': s}
                   for k, t, a, s in ref.MATCH_RULES],
    'markupFinding': MARKUP_FINDING,
    'counts': {'fiber': n_fiber, 'milling': len(data.MILLING)},
}

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


NAVY = (31, 58, 95)
WHITE = (255, 255, 255)
ICONS = {
    'icon-192.png': png(192, NAVY, WHITE, 0.18),
    'icon-512.png': png(512, NAVY, WHITE, 0.18),
    'icon-maskable-512.png': png(512, NAVY, WHITE, 0.28),
    'apple-touch-icon-180.png': png(180, NAVY, WHITE, 0.18),
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

OPTIONS_TABLE = table(['Категория', 'Позиция', 'Цена'],
                      [[c, esc(n), f'<b>{rub(p)}</b>'] for c, n, p in data.OPTIONS])

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

with open(os.path.join(HERE, 'money.js'), encoding='utf-8') as f:
    MONEY_JS = f.read()
with open(os.path.join(HERE, 'ui.js'), encoding='utf-8') as f:
    UI_JS = f.read()
with open(os.path.join(HERE, 'style.css'), encoding='utf-8') as f:
    CSS = f.read()
with open(os.path.join(HERE, 'template.html'), encoding='utf-8') as f:
    TPL = f.read()

html = TPL
repl = {
    '__CSS__': CSS,
    '__DATA__': json.dumps(APP, ensure_ascii=False),
    '__MONEY_JS__': MONEY_JS,
    '__UI_JS__': UI_JS,
    '__FIBER_TABLE__': FIBER_TABLE,
    '__MILLING_TABLE__': MILLING_TABLE,
    '__OPTIONS_TABLE__': OPTIONS_TABLE,
    '__PNR_TABLE__': PNR_TABLE,
    '__SERVICE_TABLE__': SERVICE_TABLE,
    '__CUT_TABLE__': CUT_TABLE,
    '__CUT_SITE_TABLE__': CUT_SITE_TABLE,
    '__GAS_TABLE__': GAS_TABLE,
    '__READINESS_TABLE__': READINESS_TABLE,
    '__MATCH_TABLE__': MATCH_TABLE,
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
    '__N_FIBER__': str(n_fiber),
    '__N_MILLING__': str(len(data.MILLING)),
    '__DATE_FIBER__': data.PRICE_DATES['fiber'],
    '__DATE_MILLING__': data.PRICE_DATES['milling'],
    '__DATE_OPTIONS__': data.PRICE_DATES['options'],
    '__NDS__': str(data.NDS_DEFAULT),
    '__KP_DAYS__': str(data.KP_VALID_DAYS),
    '__INVOICE_DAYS__': str(data.INVOICE_VALID_DAYS),
    '__MGR_NAME__': data.MANAGER['name'],
    '__MGR_PHONE__': data.MANAGER['phone'],
    '__MGR_EMAIL__': data.MANAGER['email'],
    '__DEV_EXACT__': str(dev_exact),
    '__DEV_TOTAL__': str(len(data.MILLING)),
    '__DEV_OK__': str(len(data.MILLING) - dev_exact),
    '__DEV_MAX__': str(max_dev),
    '__DEV_R100__': str(dev_r100),
    '__RESERVE__': str(ref.RESERVE_PCT),
    '__CACHE_V__': str(CACHE_VERSION),
}
for k, v in repl.items():
    html = html.replace(k, v)

leftovers = [k for k in repl if k in html]
if leftovers:
    raise SystemExit(f'Незаменённые плейсхолдеры: {leftovers}')

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
    'background_color': '#F4F7FB',
    'theme_color': '#1F3A5F',
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

SW = """// Версия кеша поднимается при каждой сборке — иначе телефон отдаст старую версию.
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
print(f'index.html: {size / 1024:.0f} КБ')
print(f'Конфигураций волокна: {n_fiber} · фрезерных: {len(data.MILLING)}')
print(f'Наценка +11 %: отклонений от точного расчёта {dev_exact} из {len(data.MILLING)}, '
      f'максимум {max_dev} ₽; при округлении до 100 ₽ отклонений {dev_r100}')
print(f'Версия кеша: {CACHE_VERSION}')
