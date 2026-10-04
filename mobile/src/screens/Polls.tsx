import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Badge, EmptyState, ProgressBar, Section, SmallButton } from '../components';
import { fmtDate } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';

export default function Polls({ data, admin, flat, save }: ScreenProps) {
  if (data.polls.length === 0) return <EmptyState text="No polls yet." />;
  return (
    <View>
      {data.polls.map((p) => {
        const closed = p.status !== 'open' || (!!p.closes_at && new Date(p.closes_at).getTime() < Date.now());
        const canVote = !closed && (admin || !!flat);
        return (
          <Section key={p.id} title={p.title} right={<Badge text={closed ? 'Closed' : 'Open'} tone={closed ? 'muted' : 'ok'} />}>
            {!!p.description && <Text style={[s.muted, { color: '#17351D', marginBottom: 6 }]}>{p.description}</Text>}
            {p.options.map((o, i) => {
              const votes = p.tally[i] ?? 0;
              const mine = p.myVote === i;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={!canVote}
                  onPress={() => save({ action: 'votePoll', pollId: p.id, optionIndex: i }, 'Vote recorded')}
                  style={[s.listRow, mine && { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 8 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine }}
                >
                  <View style={s.rowBetween}>
                    <Text style={s.rowTitle}>
                      {mine ? '✓ ' : ''}
                      {o}
                    </Text>
                    <Text style={s.small}>
                      {votes} vote{votes === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <ProgressBar ratio={p.totalVotes ? votes / p.totalVotes : 0} />
                </TouchableOpacity>
              );
            })}
            <Text style={[s.small, { marginTop: 8 }]}>
              {p.totalVotes} total vote{p.totalVotes === 1 ? '' : 's'}
              {p.closes_at ? ` · closes ${fmtDate(p.closes_at)}` : ''}
              {!canVote && !closed ? ' · link your flat to vote' : ''}
            </Text>
            {admin && !closed && (
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                <SmallButton title="Close poll" danger onPress={() => save({ action: 'closePoll', id: p.id }, 'Poll closed')} />
              </View>
            )}
          </Section>
        );
      })}
    </View>
  );
}
