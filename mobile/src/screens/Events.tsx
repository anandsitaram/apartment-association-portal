import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState, Section } from '../components';
import { fmtDateTime } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';

export default function Events({ data }: ScreenProps) {
  const now = Date.now();
  const list = [...(data.events ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = list.filter((e) => new Date(e.ends_at).getTime() >= now);
  const past = list.filter((e) => new Date(e.ends_at).getTime() < now).reverse();
  const row = (e: (typeof list)[number]) => (
    <View key={e.id} style={s.listRow}>
      <Text style={s.rowTitle}>{e.title}</Text>
      <Text style={s.small}>
        {fmtDateTime(e.starts_at)} → {fmtDateTime(e.ends_at)}
        {e.location ? ` · ${e.location}` : ''}
      </Text>
      {!!e.description && <Text style={[s.muted, { color: '#17351D' }]}>{e.description}</Text>}
    </View>
  );
  return (
    <View>
      <Section title="Upcoming">{upcoming.length ? upcoming.map(row) : <EmptyState text="No upcoming events." />}</Section>
      {past.length > 0 && <Section title="Past">{past.slice(0, 10).map(row)}</Section>}
    </View>
  );
}
