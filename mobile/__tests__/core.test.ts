import { n2, inr, monthLabel, toIso, isDateKey, isTimeKey, fmtDate } from '../../shared/format';
import { normalizeBaseUrl, isValidBaseUrl } from '../src/core/api';
import { effectiveRole } from '../../shared/roles';
import { availablePages, splitTabs } from '../src/core/pages';
import { flatDues, monthTotals } from '../../shared/dues';
import type { Flat, Month, Payment } from '../../shared/types';

const flat = (f: string, bua = 1000): Flat => ({ flat: f, sl: 1, name: 'X', type: '3BHK', bua, uds: 1 });
const month: Month = {
  month: '2026-09',
  expenses: [{ description: 'Bescom', amount: 5000 }],
  method: 'divide',
  value: 10,
  rounding: 'nearest',
  corp_rate: 0.5,
};

describe('format', () => {
  test('Indian grouping', () => {
    expect(n2(1234567.5)).toBe('12,34,567.50');
    expect(n2(999)).toBe('999.00');
    expect(n2(-1500)).toBe('-1,500.00');
    expect(inr(100000)).toBe('₹1,00,000.00');
    expect(n2(null)).toBe('0.00');
  });
  test('month label and dates', () => {
    expect(monthLabel('2026-09')).toBe('Sep 2026');
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-09-30')).toBe(true);
    expect(isTimeKey('24:00')).toBe(false);
    expect(isTimeKey('18:30')).toBe(true);
    expect(toIso('2026-09-30', '18:30')).toMatch(/^2026-09-\d\dT/);
    expect(toIso('bad', '18:30')).toBeNull();
    expect(fmtDate('2026-09-05')).toBe('05 Sep 2026');
  });
});

describe('api helpers', () => {
  test('server url normalisation', () => {
    expect(normalizeBaseUrl(' https://a.example.com/api/app/ ')).toBe('https://a.example.com');
    expect(isValidBaseUrl('https://a.example.com')).toBe(true);
    expect(isValidBaseUrl('http://a.example.com')).toBe(false);
    expect(isValidBaseUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('roles / navigation', () => {
  test('residents do not get admin pages', () => {
    const ids = availablePages('user', { tickets: true, hallBooking: true } as any).map((p) => p.id);
    expect(ids).toContain('mymaintenance');
    expect(ids).not.toContain('corpus');
    expect(ids).not.toContain('flats');
    expect(ids).not.toContain('months-admin');
  });
  test('admins get corpus + flats, not My Maintenance', () => {
    const ids = availablePages('admin', {} as any).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['corpus', 'flats', 'months']));
    expect(ids).not.toContain('mymaintenance');
  });
  test('disabled feature hides its page', () => {
    const ids = availablePages('user', { hallBooking: false } as any).map((p) => p.id);
    expect(ids).not.toContain('hall');
  });
  test('tabs capped at 4, rest in More', () => {
    const pages = availablePages('admin', {} as any);
    const { tabs, more } = splitTabs(pages, 'admin');
    expect(tabs.length).toBeLessThanOrEqual(4);
    expect(tabs.length + more.length).toBe(pages.length);
  });
  test('super maps to superadmin', () => expect(effectiveRole('super')).toBe('superadmin'));
});

describe('dues', () => {
  test('status from payments', () => {
    const f = flat('A1');
    const due = flatDues(month, f, undefined, false);
    expect(due.due).toBe(500); // 5000 / 10
    expect(due.status).toBe('unpaid');
    const part: Payment = { month: '2026-09', flat: 'A1', maint: 200, corp: 0, mode: 'UPI', paid_date: null };
    expect(flatDues(month, f, part, false).status).toBe('unpaid'); // same rule as the web app: no "part paid" state
    const full: Payment = { ...part, maint: 500 };
    expect(flatDues(month, f, full, false).status).toBe('paid');
  });
  test('corp fund only counted for admins', () => {
    const f = flat('A1', 1000);
    expect(flatDues(month, f, undefined, false).cdue).toBe(0);
    expect(flatDues(month, f, undefined, true).cdue).toBe(500); // 0.5 * 1000
  });
  test('totals', () => {
    const flats = [flat('A1'), flat('A2')];
    const pay: Payment[] = [{ month: '2026-09', flat: 'A1', maint: 500, corp: 0, mode: 'Cash', paid_date: null }];
    const t = monthTotals(month, flats, pay, false);
    expect(t.due).toBe(1000);
    expect(t.paid).toBe(500);
    expect(t.unpaidFlats).toBe(1);
  });
});
