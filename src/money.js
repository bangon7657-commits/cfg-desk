/* Денежные расчёты — порт dengi.py из скилла lasercut-kp.
   Вся арифметика в копейках целыми числами, округление ROUND_HALF_UP,
   чтобы результат совпадал с Decimal в Python до копейки.
   Проверяется скриптом verify.py на 200+ контрольных значениях. */

var EDINICY = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
var EDINICY_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
var DESYAT_19 = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
var DESYATKI = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят',
  'семьдесят', 'восемьдесят', 'девяносто'];
var SOTNI = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот',
  'семьсот', 'восемьсот', 'девятьсот'];

function sklon(n, forms) {
  var m = n % 100;
  if (m >= 11 && m <= 19) return forms[2];
  m = n % 10;
  if (m === 1) return forms[0];
  if (m >= 2 && m <= 4) return forms[1];
  return forms[2];
}

function troyka(n, fem) {
  var w = [];
  if (n >= 100) { w.push(SOTNI[Math.floor(n / 100)]); n = n % 100; }
  if (n >= 10 && n <= 19) { w.push(DESYAT_19[n - 10]); n = 0; }
  else if (n >= 20) { w.push(DESYATKI[Math.floor(n / 10)]); n = n % 10; }
  if (n) w.push((fem ? EDINICY_F : EDINICY)[n]);
  return w;
}

function chisloPropisyu(n) {
  if (n === 0) return 'ноль';
  var parts = [];
  var mlrd = Math.floor(n / 1e9); n = n % 1e9;
  var mln = Math.floor(n / 1e6); n = n % 1e6;
  var tys = Math.floor(n / 1000); var ost = n % 1000;
  if (mlrd) parts = parts.concat(troyka(mlrd, false), [sklon(mlrd, ['миллиард', 'миллиарда', 'миллиардов'])]);
  if (mln) parts = parts.concat(troyka(mln, false), [sklon(mln, ['миллион', 'миллиона', 'миллионов'])]);
  if (tys) parts = parts.concat(troyka(tys, true), [sklon(tys, ['тысяча', 'тысячи', 'тысяч'])]);
  if (ost) parts = parts.concat(troyka(ost, false));
  return parts.join(' ');
}

/* ROUND_HALF_UP для положительного a/b на целых числах */
function divHalfUp(a, b) { return Math.floor((2 * a + b) / (2 * b)); }

/* рубли (число) -> копейки (целое) */
function toCents(rub) { return divHalfUp(Math.round(rub * 1000), 10); }

/* сумма прописью из копеек: 'Семьсот ... рублей 36 копеек' */
function propisyu(cents) {
  var rub = Math.floor(cents / 100);
  var kop = cents - rub * 100;
  var s = chisloPropisyu(rub);
  s = s.charAt(0).toUpperCase() + s.slice(1);
  var r = sklon(rub, ['рубль', 'рубля', 'рублей']);
  var k = sklon(kop, ['копейка', 'копейки', 'копеек']);
  return s + ' ' + r + ' ' + (kop < 10 ? '0' + kop : kop) + ' ' + k;
}

/* НДС изнутри: НДС = С × ставка / (100 + ставка). Возвращает копейки. */
function ndsIznutri(cents, rate10) {
  // rate10 — ставка × 10 (220 = 22 %), чтобы допускать 20,5 % без float
  var nds = divHalfUp(cents * rate10, 1000 + rate10);
  return { bez: cents - nds, nds: nds };
}

/* Цена со скидкой. pct10 — скидка × 10 (75 = 7,5 %). */
function soSkidkoy(cents, pct10) {
  return divHalfUp(cents * (1000 - pct10), 1000);
}

/* Наценка «из наличия». markup10 — наценка × 10 (110 = 11 %). */
function sNacenkoy(cents, markup10) {
  return divHalfUp(cents * (1000 + markup10), 1000);
}

/* Формат денег как в ТКП: '735 657,36' */
function fmt(cents) {
  var neg = cents < 0;
  if (neg) cents = -cents;
  var rub = Math.floor(cents / 100);
  var kop = cents - rub * 100;
  var s = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−' : '') + s + ',' + (kop < 10 ? '0' + kop : kop);
}

/* Целые рубли без копеек: '2 867 000 ₽' */
function fmtRub(cents) {
  var rub = Math.round(cents / 100);
  return String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* Рубли, а копейки — только если они есть: '2 867 000' или '548 362,80'.
   Почти весь прайс в целых рублях, но станины из 1С идут с копейками,
   и округлять их в смете нельзя: это позиция счёта. */
function fmtMoney(cents) {
  return cents % 100 === 0 ? fmtRub(cents) : fmt(cents);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toCents: toCents, propisyu: propisyu, ndsIznutri: ndsIznutri,
    soSkidkoy: soSkidkoy, sNacenkoy: sNacenkoy, fmt: fmt, fmtRub: fmtRub,
    fmtMoney: fmtMoney, chisloPropisyu: chisloPropisyu };
}
