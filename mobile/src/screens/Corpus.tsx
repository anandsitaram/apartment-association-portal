import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState, Section, Stat } from '../components';
import { fmtDate, inr, inr0, monthLabel } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';

export default function Corpus({ data }: ScreenProps) {
  const rows = [...data.corpusLedger].sort((a, b) => (b.at || '').localeCompare(a.at || '') || b.id - a.id);
  const dep = rows.filter((r) => r.kind === 'deposit').reduce((a, r) => a + r.amount, 0);
  const wd = rows.filter((r) => r.kind === 'withdrawal').reduce((a, r) => a + r.amount, 0);
  return (
    <View>
      <View style={s.row2}>
        <Stat t="Balance" v={inr0(dep - wd)} tone="ok" />
        <Stat t="Entries" v={String(rows.length)} />
      </View>
      <View style={s.row2}>
        <Stat t="Deposits" v={inr0(dep)} />
        <Stat t="Withdrawals" v={inr0(wd)} tone="bad" />
      </View>
      <Section title="Ledger">
        {rows.length === 0 && <EmptyState text="No Corpus Fund entries yet." />}
        {rows.map((r) => (
          <View key={r.id} style={s.listRow}>
            <View style={s.rowBetween}>
              <Text style={s.rowTitle}>{r.description || r.source}</Text>
              <Text style={[s.rowTitle, { color: r.kind === 'deposit' ? '#1f8a4c' : '#c0392b' }]}>
                {r.kind === 'deposit' ? '+' : '−'}
                {inr(r.amount)}
              </Text>
            </View>
            <Text style={s.small}>
              {fmtDate(r.at)}
              {r.month ? ` · ${monthLabel(r.month)}` : ''}
            </Text>
          </View>
        ))}
      </Section>
      <Text style={[s.small, { marginTop: 12 }]}>Adding or editing ledger entries is done on the web app.</Text>
    </View>
  );
}
