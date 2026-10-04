import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { Ticket, TicketCategory, TicketStatus } from '../../../shared/types';
import { Badge, Button, Chip, EmptyState, Field, Section, SmallButton } from '../components';
import { fmtDate } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';

const CATS: TicketCategory[] = ['maintenance', 'delivery', 'security'];
const STATUS_TONE: Record<TicketStatus, 'info' | 'ok' | 'warn' | 'bad' | 'muted'> = {
  open: 'info',
  approved: 'ok',
  in_progress: 'warn',
  resolved: 'ok',
  rejected: 'bad',
};
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace('_', ' ');

export default function Tickets({ data, admin, superAdmin, flat, save }: ScreenProps) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<TicketCategory>('maintenance');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const canRaise = admin || !!flat;
  const list = data.tickets.filter((t) => filter === 'all' || t.status === 'open' || t.status === 'approved' || t.status === 'in_progress');

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const ok = await save({ action: 'createTicket', category, title: title.trim(), description: description.trim() }, 'Ticket raised');
    setBusy(false);
    if (ok) {
      setAdding(false);
      setTitle('');
      setDescription('');
    }
  };
  const setStatus = (t: Ticket, status: TicketStatus) =>
    save({ action: 'updateTicketStatus', id: t.id, status, note: t.note ?? '' }, `Ticket #${t.id} ${cap(status).toLowerCase()}`);

  return (
    <View>
      {!canRaise && (
        <View style={s.banner}>
          <Text style={s.bannerText}>Your login isn't linked to a flat, so you can't raise tickets. Ask the MC to link it.</Text>
        </View>
      )}
      {canRaise && !adding && <Button title="Raise a ticket" onPress={() => setAdding(true)} />}
      {adding && (
        <Section title="New ticket">
          <View style={s.rowWrap}>
            {CATS.map((c) => (
              <Chip key={c} label={cap(c)} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} autoCapitalize="sentences" />
          <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={2000} autoCapitalize="sentences" />
          <Button title="Submit" onPress={create} busy={busy} disabled={!title.trim()} />
          <Button title="Cancel" kind="secondary" onPress={() => setAdding(false)} />
        </Section>
      )}
      <View style={[s.rowWrap, { marginTop: 14 }]}>
        <Chip label="Active" active={filter === 'active'} onPress={() => setFilter('active')} />
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
      </View>
      <Section title="Tickets">
        {list.length === 0 && <EmptyState text="No tickets here." />}
        {list.map((t) => (
          <View key={t.id} style={s.listRow}>
            <View style={s.rowBetween}>
              <Text style={s.rowTitle}>
                #{t.id} · {t.title}
              </Text>
              <Badge text={cap(t.status)} tone={STATUS_TONE[t.status]} />
            </View>
            <Text style={s.small}>
              {cap(t.category)} · Flat {t.flat || '—'} · {fmtDate(t.created_at)}
            </Text>
            {!!t.description && <Text style={[s.muted, { color: '#17351D' }]}>{t.description}</Text>}
            {!!t.note && <Text style={s.small}>MC note: {t.note}</Text>}
            {admin && t.status !== 'resolved' && t.status !== 'rejected' && (
              <View style={[s.rowWrap, { marginTop: 8 }]}>
                {t.status === 'open' && <SmallButton title="Approve" onPress={() => setStatus(t, 'approved')} />}
                {t.status !== 'in_progress' && <SmallButton title="In progress" onPress={() => setStatus(t, 'in_progress')} />}
                <SmallButton title="Resolve" onPress={() => setStatus(t, 'resolved')} />
                <SmallButton title="Reject" danger onPress={() => setStatus(t, 'rejected')} />
              </View>
            )}
            {superAdmin && (
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                <SmallButton title="Delete" danger onPress={() => save({ action: 'deleteTicket', id: t.id }, 'Ticket deleted')} />
              </View>
            )}
          </View>
        ))}
      </Section>
    </View>
  );
}
