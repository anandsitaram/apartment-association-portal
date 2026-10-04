import React from 'react';
import { Linking, Text, View } from 'react-native';
import { EmptyState, Section, SmallButton } from '../components';
import type { ScreenProps } from './types';
import s from '../styles/styles';

export default function ServiceContacts({ data }: ScreenProps) {
  const list = data.settings.serviceContacts ?? [];
  const groups = list.reduce<Record<string, typeof list>>((acc, c) => ((acc[c.category || 'Other'] ||= []).push(c), acc), {});
  if (!list.length) return <EmptyState text="No service contacts have been added." />;
  return (
    <View>
      {Object.entries(groups).map(([cat, items]) => (
        <Section key={cat} title={cat}>
          {items.map((c) => (
            <View key={c.id} style={[s.listRow, s.rowBetween]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={s.rowTitle}>{c.name}</Text>
                <Text style={s.small}>
                  {c.phone}
                  {c.notes ? ` · ${c.notes}` : ''}
                </Text>
              </View>
              <SmallButton title="Call" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
            </View>
          ))}
        </Section>
      ))}
    </View>
  );
}
