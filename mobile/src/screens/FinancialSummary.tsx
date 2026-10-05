import React, { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { monthTotals } from '../../../shared/dues';
import { inr0, monthLabel } from '../../../shared/format';
import type { ScreenProps } from './types';
import { Button, Chip, EmptyState, Section, Stat } from '../components';
import s from '../styles/styles';

export default function FinancialSummary({ data }: ScreenProps) {
  const [sharing, setSharing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const visibleMonths = data.months.filter((month) => selectedMonth === 'all' || month.month === selectedMonth);
  const exportCsv = async () => {
    setSharing(true);
    try {
      const rows = [['Month', 'Total billed', 'Collected', 'Outstanding', 'Expenses', 'Pending flats']];
      for (const month of [...visibleMonths].sort((a, b) => a.month.localeCompare(b.month))) {
        const t = monthTotals(month, data.flats, data.payments, true, data.settings.isBlocks === true);
        const expenses = month.expenses.reduce((sum, e) => sum + (+e.amount || 0), 0);
        rows.push([month.month, String(t.due), String(t.paid), String(t.outstanding), String(expenses), String(t.unpaidFlats)]);
      }
      const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      await Share.share({ title: 'My Apartment financial summary CSV', message: csv });
    } finally {
      setSharing(false);
    }
  };
  if (!data.months.length) return <EmptyState text="No financial months are available yet." />;
  const totals = visibleMonths.reduce(
    (acc, month) => {
      const t = monthTotals(month, data.flats, data.payments, true, data.settings.isBlocks === true);
      return {
        due: acc.due + t.due,
        paid: acc.paid + t.paid,
        outstanding: acc.outstanding + t.outstanding,
        unpaidFlats: acc.unpaidFlats + t.unpaidFlats,
      };
    },
    { due: 0, paid: 0, outstanding: 0, unpaidFlats: 0 },
  );
  const expenses = visibleMonths.reduce((sum, month) => sum + month.expenses.reduce((a, e) => a + (+e.amount || 0), 0), 0);
  return (
    <View>
      <View style={s.hero}>
        <Text style={s.heroLabel}>
          {selectedMonth === 'all' ? `All available months · ${data.months.length} month(s)` : monthLabel(selectedMonth)}
        </Text>
        <Text style={s.heroValue}>{inr0(totals.paid)}</Text>
        <Text style={s.heroLabel}>Total collected</Text>
      </View>
      <View style={s.row2}>
        <Stat t="Total billed" v={inr0(totals.due)} />
        <Stat t="Outstanding" v={inr0(totals.outstanding)} tone={totals.outstanding > 0 ? 'warn' : 'ok'} />
      </View>
      <View style={s.row2}>
        <Stat t="Total expenses" v={inr0(expenses)} />
        <Stat t="Flats pending" v={totals.unpaidFlats} tone={totals.unpaidFlats ? 'warn' : 'ok'} />
      </View>
      <Section title="Filter financial summary">
        <Text style={s.muted}>Choose a single month or view all available months.</Text>
        <View style={s.rowWrap}>
          <Chip label="All months" active={selectedMonth === 'all'} onPress={() => setSelectedMonth('all')} />
          {[...data.months]
            .sort((a, b) => b.month.localeCompare(a.month))
            .map((m) => (
              <Chip
                key={m.month}
                label={monthLabel(m.month)}
                active={selectedMonth === m.month}
                onPress={() => setSelectedMonth(m.month)}
              />
            ))}
        </View>
      </Section>
      <Section title="Reports & export">
        <Text style={s.muted}>
          Export the currently filtered month totals as plain-text CSV using your device's share sheet. CSV exports are not encrypted and
          may contain confidential financial information. Share only with trusted recipients and avoid public/shared devices.
        </Text>
        <Button title="Share financial summary CSV" onPress={() => void exportCsv()} busy={sharing} />
      </Section>
      <Section title={selectedMonth === 'all' ? 'Month-by-month overview' : `Overview · ${monthLabel(selectedMonth)}`}>
        {[...visibleMonths]
          .sort((a, b) => b.month.localeCompare(a.month))
          .map((month) => {
            const t = monthTotals(month, data.flats, data.payments, true, data.settings.isBlocks === true);
            const expenseTotal = month.expenses.reduce((sum, e) => sum + (+e.amount || 0), 0);
            return (
              <View key={month.month} style={[s.listRow, { gap: 5 }]}>
                <Text style={s.rowTitle}>{monthLabel(month.month)}</Text>
                <View style={s.rowBetween}>
                  <Text style={s.muted}>Collected</Text>
                  <Text style={s.rowTitle}>{inr0(t.paid)}</Text>
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.muted}>Due / outstanding</Text>
                  <Text style={s.rowTitle}>
                    {inr0(t.due)} / {inr0(t.outstanding)}
                  </Text>
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.muted}>Expenses</Text>
                  <Text style={s.rowTitle}>{inr0(expenseTotal)}</Text>
                </View>
              </View>
            );
          })}
      </Section>
    </View>
  );
}
