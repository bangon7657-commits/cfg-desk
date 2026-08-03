# -*- coding: utf-8 -*-
"""Сверка money.js с dengi.py и проверка целостности прайса.
Показывает фактические отклонения, не «примерно».

Прогоняет одни и те же значения через Python (Decimal, эталон из скилла)
и через Node (money.js, то, что реально считает приложение).
Любое расхождение хотя бы на копейку — это ошибка, а не погрешность.
"""
import json
import os
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dengi import propisyu, nds_iznutri, so_skidkoy  # noqa: E402
import data  # noqa: E402
import wattsan as wt  # noqa: E402


def all_prices():
    """Все цены из прайса — на них и проверяем, а не на выдуманных числах."""
    out = []
    for price in data.FIBER_A_BASE.values():
        out.append(price)
    for cfg in data.FIBER_S_BASE.values():
        out.append(cfg['base'])
        out.append(cfg['table'])
        out.extend(cfg['rot'].values())
        out.extend(cfg['table_rot'].values())
    for row in data.MILLING_BASE:
        out.append(row[6])
        out.append(row[7])
    for _, _, price in data.OPTIONS:
        out.append(price)
    return out


RATES = [220, 200, 205]          # ставка НДС × 10
DISCOUNTS = [0, 25, 50, 75, 100, 125, 150, 200, 300]   # скидка × 10
MARKUPS = [110, 75, 80, 55, 0]   # наценка × 10

prices = all_prices()
print(f'Позиций прайса в проверке: {len(prices)}')

cases = [{'cents': p * 100} for p in prices]

# Эталон Python
ref = []
for p in prices:
    cents = p * 100
    row = {'cents': cents, 'propisyu': [], 'nds': [], 'skidka': [], 'nacenka': []}
    for r in RATES:
        bez, nds = nds_iznutri(Decimal(p), Decimal(r) / 10)
        row['nds'].append([int((bez * 100).to_integral_value()),
                           int((nds * 100).to_integral_value())])
    for dsc in DISCOUNTS:
        v = so_skidkoy(Decimal(p), Decimal(dsc) / 10)
        row['skidka'].append(int((v * 100).to_integral_value()))
    for m in MARKUPS:
        v = (Decimal(p) * (1000 + m) / 1000).quantize(Decimal('0.01'))
        row['nacenka'].append(int((v * 100).to_integral_value()))
    row['propisyu'] = propisyu(p)
    ref.append(row)

# То же через money.js
js = r'''
var m = require('%s/money.js');
var input = JSON.parse(require('fs').readFileSync('%s/cases.json','utf8'));
var RATES = %s, DISCOUNTS = %s, MARKUPS = %s;
var out = input.map(function(c){
  var cents = c.cents;
  return {
    cents: cents,
    nds: RATES.map(function(r){ var x = m.ndsIznutri(cents, r); return [x.bez, x.nds]; }),
    skidka: DISCOUNTS.map(function(d){ return m.soSkidkoy(cents, d); }),
    nacenka: MARKUPS.map(function(k){ return m.sNacenkoy(cents, k); }),
    propisyu: m.propisyu(cents)
  };
});
console.log(JSON.stringify(out));
''' % (HERE, HERE, json.dumps(RATES), json.dumps(DISCOUNTS), json.dumps(MARKUPS))

with open(os.path.join(HERE, 'cases.json'), 'w') as f:
    json.dump(cases, f)
with open(os.path.join(HERE, 'run.js'), 'w') as f:
    f.write(js)

got = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'run.js')]).decode())

errors = []
for r, g in zip(ref, got):
    if r['nds'] != g['nds']:
        errors.append(('НДС', r['cents'], r['nds'], g['nds']))
    if r['skidka'] != g['skidka']:
        errors.append(('скидка', r['cents'], r['skidka'], g['skidka']))
    if r['nacenka'] != g['nacenka']:
        errors.append(('наценка', r['cents'], r['nacenka'], g['nacenka']))
    if r['propisyu'] != g['propisyu']:
        errors.append(('прописью', r['cents'], r['propisyu'], g['propisyu']))

os.remove(os.path.join(HERE, 'cases.json'))
os.remove(os.path.join(HERE, 'run.js'))

checks = len(ref) * (len(RATES) + len(DISCOUNTS) + len(MARKUPS) + 1)
print(f'Сверок выполнено: {checks}')
if errors:
    print(f'РАСХОЖДЕНИЙ: {len(errors)}')
    for e in errors[:20]:
        print('  ', e)
    sys.exit(1)
print('Расхождений: 0 — money.js считает копейка в копейку как dengi.py')

# ---- Проверка самих данных ----
print()
print('--- Проверка самих данных ---')

# Наценка на фрезерных: гипотеза «+11 % с округлением до 100 ₽»
bad = []
for fmt_, name, kw, cool, ctrl, vac, order, stock in data.MILLING_BASE:
    r100 = int((Decimal(order) * Decimal('1.11') / 100).quantize(Decimal('1'), ROUND_HALF_UP)) * 100
    if r100 != stock:
        bad.append((name, order, stock, r100))
print(f'Фрезерных позиций: {len(data.MILLING_BASE)}')
if bad:
    print(f'Отклонений от правила «+11 %, округление до 100 ₽»: {len(bad)}')
    for b in bad[:10]:
        print(f'  {b[0]}: прайс {b[2]} ₽, расчёт {b[3]} ₽')
    sys.exit(1)
print('Правило «+11 % с округлением до 100 ₽» подтверждается на всех позициях')

# Количество конфигураций
n_fiber = len(data.FIBER_A) + sum(2 + len(c['rot']) + len(c['table_rot'])
                                 for c in data.FIBER_S_BASE.values())
print(f'Конфигураций волокна: {n_fiber} (в источнике заявлено 122)')
print(f'Конфигураций фрезерных: {len(data.MILLING_BASE)} (в источнике заявлено 110)')
assert n_fiber == 122, n_fiber
assert len(data.MILLING_BASE) == 110, len(data.MILLING_BASE)

# Пакетная скидка: стол+ось против стола и оси по отдельности
print()
print('--- Пакетная скидка на стол + ось ---')
mismatch = 0
undeclared = {}
for (fmt_, power), cfg in sorted(data.FIBER_S_BASE.items()):
    exp = data.BUNDLE_DISCOUNT.get(fmt_)
    for rot, price in sorted(cfg['table_rot'].items()):
        sep = cfg['table'] + (cfg['rot'][rot] - cfg['base'])
        diff = sep - price
        if exp is None:
            # молчаливый пропуск скрывал бы, что для формата выгода не заявлена
            undeclared.setdefault(fmt_, set()).add(diff)
        elif diff != exp:
            mismatch += 1
            print(f'  S {fmt_} {power}W + стол + {rot}: выгода {diff} ₽, заявлено {exp} ₽')
print(f'Несовпадений с заявленной пакетной скидкой: {mismatch}')
for fmt_, diffs in sorted(undeclared.items()):
    vals = ', '.join(f'{d} ₽' for d in sorted(diffs))
    print(f'  формат {fmt_}: выгода в прайсе не заявлена, по факту {vals}')
print(f'Форматов без заявленной пакетной скидки: {len(undeclared)}')

# ---- Второй прайс: приводы Bochu S9 ----
print()
print('--- Прайс Bochu: состав и разница с Yaskawa ---')
assert set(data.FIBER_S_BOCHU_BASE) == set(data.FIBER_S_BASE), 'наборы конфигураций разошлись'
bo_sum, bo_count, diffs = 0, 0, []
for key, c in sorted(data.FIBER_S_BASE.items()):
    b = data.FIBER_S_BOCHU_BASE[key]
    assert set(b['rot']) == set(c['rot']) and set(b['table_rot']) == set(c['table_rot']), key
    pairs = [(c['base'], b['base']), (c['table'], b['table'])]
    pairs += [(c['rot'][r], b['rot'][r]) for r in c['rot']]
    pairs += [(c['table_rot'][r], b['table_rot'][r]) for r in c['table_rot']]
    for y, bb in pairs:
        bo_sum += bb
        bo_count += 1
        diffs.append((key[0], y - bb))
        assert bb < y, f'{key}: Bochu не дешевле Yaskawa'
print(f'Позиций в прайсе Bochu: {bo_count}, сумма: {bo_sum}')
BOCHU_SUM_EXPECTED = 760015000
BOCHU_COUNT_EXPECTED = 120
if bo_sum == BOCHU_SUM_EXPECTED and bo_count == BOCHU_COUNT_EXPECTED:
    print('Совпадает с эталоном — второй прайс не изменился')
else:
    print(f'ВНИМАНИЕ: эталон {BOCHU_SUM_EXPECTED} / {BOCHU_COUNT_EXPECTED}')
    sys.exit(1)
by_fmt = {}
for fmt, d in diffs:
    by_fmt.setdefault(fmt, set()).add(d)
for fmt, ds in sorted(by_fmt.items()):
    lo, hi = min(ds), max(ds)
    rng = f'{lo} ₽' if lo == hi else f'от {lo} до {hi} ₽'
    print(f'  {fmt}: Bochu дешевле на {rng}')
print('Заявлено менеджером: 200 000 ₽ на 1530/1560 и 260 000 ₽ на 2030/2040/2060 — '
      'фактические цифры выше и по форматам расходятся с этой формулировкой')

# ---- Надбавки за усиленные приводы ----
print()
print('--- Надбавки за усиление ---')
for s in data.SERVO:
    a, b_ = s['add']['small'], s['add']['big']
    print(f'  {s["label"]}: 1530/1560 +{a} ₽ · 2030/2040/2060 +{b_} ₽ · '
          f'{s["speed"]}, {s["accel"]}')
assert data.SERVO[1]['add'] == {'small': 85000, 'big': 85000}
assert data.SERVO[3]['add'] == {'small': 20000, 'big': 40000}
print('Надбавки совпадают с присланными: Yaskawa 85 000 ₽, Bochu 20 000 / 40 000 ₽')

# ---- Обвязка волокна ----
print()
print('--- Обвязка волокна из КП поставщиков ---')
for c in data.COMPRESSORS:
    print(f'  {c["name"]}: {c["price"]} ₽ · {c["bar"]} бар · {c["lmin"]} л/мин · '
          f'{c["kw"]} кВт · ресивер {c["tank"]} л')
for e in data.EXTRACTION:
    print(f'  {e["name"]}: {e["price"]} ₽ · {e["flow"]} м³/ч · {e["kw"]} кВт')
for c in data.CRYO:
    print(f'  {c["name"]}: {c["price"]} ₽ · {c["flow"]} нм³/ч')
assert all(c['price'] > 0 for c in data.COMPRESSORS + data.EXTRACTION + data.CRYO)

# ---- Контрольная сумма обвязки: эти цены идут прямо в смету клиенту ----
kit_sum = (sum(c['price'] for c in data.COMPRESSORS) +
           sum(e['price'] for e in data.EXTRACTION) +
           sum(c['price'] for c in data.CRYO) +
           sum(s['price'] for s in data.STABILIZERS))
kit_count = (len(data.COMPRESSORS) + len(data.EXTRACTION) + len(data.CRYO) +
             len(data.STABILIZERS))
print()
print(f'Позиций обвязки: {kit_count}, сумма: {kit_sum}')
KIT_SUM_EXPECTED = 10294890   # 03.08.2026: АСН-12000/1-ЭМ поднят до 37 590 ₽ по 1С
KIT_COUNT_EXPECTED = 18
if kit_sum != KIT_SUM_EXPECTED or kit_count != KIT_COUNT_EXPECTED:
    print(f'ВНИМАНИЕ: эталон {KIT_SUM_EXPECTED} / {KIT_COUNT_EXPECTED}')
    sys.exit(1)
print('Совпадает с эталоном — цены обвязки не изменились')

# ---- Контрольная сумма прайса ----
# Защита от тихой порчи цифр при любой правке data.py.
# Если меняете прайс осознанно — пересчитайте и обновите оба числа ниже.
# 30.07.2026: +4 стабилизатора под фрезерные станки на 232 460 ₽
# (28 090 + 33 590 + 75 590 + 95 190), было 351 цен на 952 547 932.
# 03.08.2026: прайс фрезерных обновлён на август 2026 — 110 конфигураций
# вместо 85, было 355 цен на 952 780 392.
PRICE_SUM_EXPECTED = 1015179192   # прайс фрезерных обновлён на август 2026
PRICE_COUNT_EXPECTED = 405

print()
print('--- Контрольная сумма прайса ---')
tot = 0
cnt = 0
for v in data.FIBER_A_BASE.values():
    tot += v
    cnt += 1
for c in data.FIBER_S_BASE.values():
    tot += c['base'] + c['table']
    cnt += 2
    for v in c['rot'].values():
        tot += v
        cnt += 1
    for v in c['table_rot'].values():
        tot += v
        cnt += 1
for r in data.MILLING_BASE:
    tot += r[6] + r[7]
    cnt += 2
for _, _, p in data.OPTIONS:
    tot += p
    cnt += 1
for row in data.PNR:
    for v in row[2:5] + (row[6],):
        if isinstance(v, int):
            tot += v
            cnt += 1
for _, _, p in data.SERVICE:
    tot += p
    cnt += 1
print(f'Цен в базе: {cnt}, сумма: {tot}')
if cnt != PRICE_COUNT_EXPECTED or tot != PRICE_SUM_EXPECTED:
    print(f'НЕ СОВПАДАЕТ: ожидалось {PRICE_COUNT_EXPECTED} цен '
          f'на сумму {PRICE_SUM_EXPECTED}. Прайс изменён или испорчен.')
    sys.exit(1)
print('Совпадает с эталоном — цены не изменились')

# ---- Одна модель — одна цена ----
# Справочник допоборудования и прайс обвязки ведут часть моделей параллельно.
# Молча расходиться они не должны: менеджер увидит одну цену, клиент — другую.
def _norm_stab(n):
    n = n.replace('Стабилизатор напряжения ', '').replace('Ресанта ', '')
    return n.replace('Ресанта', '').replace('АСН-', '').replace('/', chr(92)).strip().lower()


_full = {_norm_stab(x['n']): x for x in wt.STABS_FULL}
_diff = []
for _st in data.STABILIZERS:
    _k = _norm_stab(_st['name'])
    if _k in _full and _full[_k]['p'] != _st['price']:
        _diff.append((_st['name'], _full[_k]['p'], _st['price']))
print()
print('--- Цены стабилизаторов: справочник против прайса обвязки ---')
if _diff:
    print(f'Расходятся {len(_diff)} из {len(data.STABILIZERS)} позиций прайса:')
    for _n, _a, _b in _diff:
        _d = _b - _a
        print(f'  {_n[:52]:52} справочник {_a:>9} · прайс {_b:>9} · '
              f'{"прайс выше" if _d > 0 else "прайс ниже"} на {abs(_d)}')
    print('Ожидаемо там, где справочник — розница сайта производителя, а прайс —')
    print('наша цена. Перед КП на стабилизатор от 20 кВт сверяйтесь с 1С.')
else:
    print('Расхождений нет — обе таблицы дают одинаковые цены')

print()
print('Проверка завершена.')
