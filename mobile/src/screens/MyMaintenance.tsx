import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Chip, EmptyState, Section, Stat } from '../components';
import { flatDues } from '../../../shared/dues';
import { STATUS_LABEL, STATUS_TONE } from '../core/status';
import { fmtDate, inr, inr0, monthLabel } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';

export default function MyMaintenance({ data, flat }: ScreenProps) {
  const [range, setRange] = useState<3 | 6>(6);
  const mine = data.flats.find((f) => f.flat === flat);
  const rows = useMemo(() => {
    if (!mine) return [];
    return data.months
      .slice(-range)
      .map((m) => {
        const p = data.payments.find((x) => x.month === m.month && x.flat === mine.flat);
        return { m, p, d: flatDues(m, mine, p, false) };
      })
      .reverse();
  }, [data.months, data.payments, mine, range]);

  if (!flat) return <EmptyState text="No flat is linked to your login. Ask the MC to link it to see your maintenance record." />;
  const due = rows.reduce((a, r) => a + r.d.totalDue, 0);
  const paid = rows.reduce((a, r) => a + r.d.totalPaid, 0);
  return (
    <View>
      <View style={s.row2}>
        <Stat t="Flat" v={flat} />
        <Stat t="Outstanding" v={inr0(due - paid)} tone={due - paid > 0.005 ? 'bad' : 'ok'} />
      </View>
      <View style={s.row2}>
        <Stat t="Billed" v={inr0(due)} />
        <Stat t="Paid" v={inr0(paid)} tone="ok" />
      </View>
      <View style={[s.rowWrap, { marginTop: 14 }]}>
        <Chip label="Last 3 months" active={range === 3} onPress={() => setRange(3)} />
        <Chip label="Last 6 months" active={range === 6} onPress={() => setRange(6)} />
      </View>
      <Section title="Month by month">
        {rows.length === 0 && <EmptyState text="No billing records yet." />}
        {rows.map(({ m, p, d }) => (
          <View key={m.month} style={s.listRow}>
            <View style={s.rowBetween}>
              <Text style={s.rowTitle}>{monthLabel(m.month)}</Text>
              <Badge text={STATUS_LABEL[d.status]} tone={STATUS_TONE[d.status]} />
            </View>
            <View style={[s.rowBetween, { marginTop: 4 }]}>
              <Text style={s.small}>Due {inr(d.due)}</Text>
              <Text style={s.small}>Paid {inr(d.paid)}</Text>
              <Text style={s.small}>{p?.paid_date ? fmtDate(p.paid_date) : '—'}</Text>
            </View>
          </View>
        ))}
      </Section>
    </View>
  );
}
