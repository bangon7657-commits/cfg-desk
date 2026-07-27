# -*- coding: utf-8 -*-
"""Денежные расчёты для ТКП LASERCUT.

Использование:
    python3 dengi.py 735657.36 --nds 22
Выводит: итог, сумму без НДС, НДС (выделен изнутри: НДС = С × ставка / (100 + ставка)),
и сумму прописью в формате, принятом в ТКП.

Как модуль:
    from dengi import propisyu, nds_iznutri, fmt
"""
import sys
from decimal import Decimal, ROUND_HALF_UP

EDINICY = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
EDINICY_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
DESYAT_19 = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
             'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
DESYATKI = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят',
            'семьдесят', 'восемьдесят', 'девяносто']
SOTNI = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот',
         'семьсот', 'восемьсот', 'девятьсот']


def _sklon(n, forms):
    n = n % 100
    if 11 <= n <= 19:
        return forms[2]
    n = n % 10
    if n == 1:
        return forms[0]
    if 2 <= n <= 4:
        return forms[1]
    return forms[2]


def _troyka(n, fem=False):
    words = []
    if n >= 100:
        words.append(SOTNI[n // 100])
        n %= 100
    if 10 <= n <= 19:
        words.append(DESYAT_19[n - 10])
        n = 0
    elif n >= 20:
        words.append(DESYATKI[n // 10])
        n %= 10
    if n:
        words.append((EDINICY_F if fem else EDINICY)[n])
    return words


def chislo_propisyu(n):
    """Целое число прописью (до миллиардов)."""
    if n == 0:
        return 'ноль'
    parts = []
    mlrd, n = divmod(n, 10 ** 9)
    mln, n = divmod(n, 10 ** 6)
    tys, ost = divmod(n, 1000)
    if mlrd:
        parts += _troyka(mlrd) + [_sklon(mlrd, ('миллиард', 'миллиарда', 'миллиардов'))]
    if mln:
        parts += _troyka(mln) + [_sklon(mln, ('миллион', 'миллиона', 'миллионов'))]
    if tys:
        parts += _troyka(tys, fem=True) + [_sklon(tys, ('тысяча', 'тысячи', 'тысяч'))]
    if ost:
        parts += _troyka(ost)
    return ' '.join(parts)


def propisyu(summa):
    """Сумма прописью в формате ТКП: 'Семьсот ... рублей 36 копеек'.
    Первая буква заглавная, копейки цифрами."""
    d = Decimal(str(summa)).quantize(Decimal('0.01'), ROUND_HALF_UP)
    rub = int(d)
    kop = int((d - rub) * 100)
    s = chislo_propisyu(rub)
    s = s[0].upper() + s[1:]
    r = _sklon(rub, ('рубль', 'рубля', 'рублей'))
    k = _sklon(kop, ('копейка', 'копейки', 'копеек'))
    return f'{s} {r} {kop:02d} {k}'


def nds_iznutri(summa_s_nds, stavka=22):
    """НДС, выделенный из суммы с НДС. Возвращает (без_НДС, НДС)."""
    s = Decimal(str(summa_s_nds))
    nds = (s * stavka / (100 + stavka)).quantize(Decimal('0.01'), ROUND_HALF_UP)
    return s - nds, nds


def so_skidkoy(cena, skidka_pct):
    """Цена со скидкой, округление до копеек."""
    return (Decimal(str(cena)) * (100 - Decimal(str(skidka_pct))) / 100
            ).quantize(Decimal('0.01'), ROUND_HALF_UP)


def fmt(x):
    """Формат денег как в ТКП: '735 657,36' (пробел — разделитель тысяч, запятая)."""
    d = Decimal(str(x)).quantize(Decimal('0.01'), ROUND_HALF_UP)
    s = f'{d:,.2f}'.replace(',', ' ').replace('.', ',')
    return s


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
    summa = Decimal(sys.argv[1])
    stavka = 22
    if '--nds' in sys.argv:
        stavka = int(sys.argv[sys.argv.index('--nds') + 1])
    bez, nds = nds_iznutri(summa, stavka)
    print(f'ИТОГО с НДС {stavka}%: {fmt(summa)} ₽')
    print(f'Без НДС:            {fmt(bez)} ₽')
    print(f'НДС {stavka}%:            {fmt(nds)} ₽')
    print()
    print(f'Сумма прописью: {propisyu(summa)}, '
          f'в том числе НДС {stavka}% — {propisyu(nds)}.')
