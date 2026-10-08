export class MoneyError extends Error {
  constructor(code = 'invalid') {
    super(code === 'overflow' ? 'Valor monetário excede o limite seguro.' : code === 'inconsistent' ? 'Valores monetários inconsistentes; revisão necessária.' : 'Informe valor monetário não negativo, decimal explícito com no máximo duas casas decimais.');
    this.name = 'MoneyError'; this.code = code; this.statusCode = 400;
  }
}
export function assertCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new MoneyError('overflow');
  return value;
}
export function parseMoneyToCents(value) {
  if (value === undefined || value === null) throw new MoneyError('missing');
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new MoneyError();
  const text = String(value);
  if (text.trim() !== text || !/^\d+(?:\.\d{1,2})?$/.test(text)) throw new MoneyError(/\.\d{3,}$/.test(text) ? 'precision' : 'invalid');
  const [whole, fraction = ''] = text.split('.');
  // Dígitos são convertidos diretamente; nenhuma multiplicação decimal.
  const significant = whole.replace(/^0+/, '') || '0';
  if (significant.length > 14) throw new MoneyError('overflow');
  const cents = BigInt(significant) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError('overflow');
  return Number(cents);
}
export function formatCentsToDecimal(value) {
  const cents = BigInt(assertCents(value));
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function addCents(a, b) { return assertCents(assertCents(a) + assertCents(b)); }
export function multiplyCents(cents, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new MoneyError();
  return assertCents(assertCents(cents) * quantity);
}
export function sumCents(values) { return values.reduce(addCents, 0); }
export function readCents(record, field) {
  if (!record || typeof record !== 'object') throw new MoneyError();
  return record[field + 'Cents'] !== undefined
    ? assertCents(record[field + 'Cents']) : parseMoneyToCents(record[field]);
}
export function formatBRLFromCents(value) {
  // Formatação exata inclusive no limite safe integer; Intl somente para apresentação.
  const cents = BigInt(assertCents(value));
  const parts = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).formatToParts(cents / 100n);
  return parts.map(part => part.type === 'fraction' ? String(cents % 100n).padStart(2,'0') : part.value).join('');
}
export function splitInstallments(cents, count) {
  assertCents(cents);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new MoneyError();
  const whole = BigInt(cents) / BigInt(count), remainder = BigInt(cents) % BigInt(count);
  return Array.from({length:count},(_,i)=>Number(whole + (BigInt(i)<remainder ? 1n : 0n)));
}
