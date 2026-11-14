// Made-up shoppers, sellers and products for the load test: Bangladeshi names, phones and goods, the same every run
// from the same numbers, so two runs make the same data and a report can be compared with the last.

const FIRST = [
  'Rahima',
  'Karim',
  'Nusrat',
  'Tanvir',
  'Farhana',
  'Sabbir',
  'Ayesha',
  'Rakib',
  'Mim',
  'Hasan',
];
const LAST = [
  'Akter',
  'Hossain',
  'Islam',
  'Rahman',
  'Khatun',
  'Ahmed',
  'Begum',
  'Uddin',
  'Sarkar',
  'Mia',
];
const ROADS = ['Road 3', 'Road 7', 'Lane 2', 'Block C', 'Sector 10', 'Avenue 4'];
const GOODS = [
  ['Cotton shirt', 650],
  ['Silk saree', 2400],
  ['Panjabi', 1450],
  ['Kurti', 850],
  ['Leather sandal', 1200],
  ['Hand bag', 990],
  ['Face cream', 350],
  ['Honey 500 g', 560],
  ['Mustard oil 1 L', 290],
  ['Phone cover', 220],
  ['Wall clock', 780],
  ['Bed sheet', 1350],
];
const KINDS = ['Shirts', 'Sarees', 'Panjabis', 'Shoes', 'Bags', 'Beauty', 'Food', 'Home'];

/** A Bangladeshi mobile number, 01 then nine digits, unique for each `index` within a run's `series` (0 to 9). */
export function phoneOf(series, index) {
  const operator = ['3', '4', '5', '6', '7', '8', '9'][series % 7];
  return `01${operator}${String(series)}${String(index).padStart(7, '0')}`;
}

export function personOf(index) {
  return `${FIRST[index % FIRST.length]} ${LAST[Math.floor(index / FIRST.length) % LAST.length]}`;
}

export function addressOf(index) {
  return `House ${String((index % 90) + 1)}, ${ROADS[index % ROADS.length]}`;
}

/** The `index`th product of a shop: a name of its own, a price, and its category's place in `KINDS`. */
export function productOf(index) {
  const [name, price] = GOODS[index % GOODS.length];
  return { name: `${name} ${String(index + 1)}`, basePrice: price, kind: index % KINDS.length };
}

export const CATEGORY_NAMES = KINDS;

/** Search words a shopper types: parts of the goods' names, and a misspelling now and then. */
export const SEARCHES = [
  'shirt',
  'saree',
  'panjabi',
  'cream',
  'honey',
  'bag',
  'sandal',
  'sheet',
  'kurti',
  'shrit',
];
