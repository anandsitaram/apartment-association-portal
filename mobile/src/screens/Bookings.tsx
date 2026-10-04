import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { BookingStatus, GymBooking, HallBooking } from '../../../shared/types';
import { Badge, Button, EmptyState, Field, Section, SmallButton } from '../components';
import { fmtDateTime, inr0, isDateKey, isTimeKey, toIso, todayKey } from '../../../shared/format';
import type { ScreenProps } from './types';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

const TONE: Record<BookingStatus, 'warn' | 'ok' | 'bad' | 'muted'> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'bad',
  cancelled: 'muted',
};
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** One screen for both the Party Hall and the Gym: same flow, different actions and list. */
export default function Bookings({ kind, data, admin, superAdmin, flat, save }: ScreenProps & { kind: 'hall' | 'gym' }) {
  const hall = kind === 'hall';
  const list: (HallBooking | GymBooking)[] = hall ? data.hallBookings : data.gymBookings;
  const act = hall
    ? { create: 'createBooking', status: 'updateBookingStatus', cancel: 'cancelBooking', del: 'deleteBooking' }
    : { create: 'createGymBooking', status: 'updateGymBookingStatus', cancel: 'cancelGymBooking', del: 'deleteGymBooking' };
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('21:00');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canBook = admin || !!flat;
  const now = Date.now();
  const sorted = [...list].sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const create = async () => {
    const lastDay = endDate || date;
    if (!title.trim()) return setError(hall ? 'Enter the purpose / function name' : 'Enter a title');
    if (![date, lastDay].every(isDateKey) || ![start, end].every(isTimeKey))
      return setError('Use date YYYY-MM-DD and time HH:mm (24-hour)');
    const startsAt = toIso(date, start),
      endsAt = toIso(lastDay, end);
    if (!startsAt || !endsAt) return setError('Invalid date or time');
    if (new Date(endsAt) <= new Date(startsAt)) return setError('End must be after the start');
    if (new Date(startsAt).getTime() <= now) return setError("You can't book a slot in the past");
    if (new Date(endsAt).getTime() - new Date(startsAt).getTime() > 24 * 3600e3) return setError('A booking can span at most 24 hours');
    setError('');
    setBusy(true);
    const ok = await save({ action: act.create, title: title.trim(), startsAt, endsAt, note: '' }, 'Request sent to the MC');
    setBusy(false);
    if (ok) {
      setAdding(false);
      setTitle('');
    }
  };

  return (
    <View>
      {hall && !!data.settings.hallBookingAmount && (
        <View style={s.banner}>
          <Text style={s.bannerText}>Party hall booking charge: {inr0(data.settings.hallBookingAmount)}</Text>
        </View>
      )}
      {!canBook && (
        <View style={s.banner}>
          <Text style={s.bannerText}>Your login isn't linked to a flat, so you can't make bookings. Ask the MC to link it.</Text>
        </View>
      )}
      {canBook && !adding && <Button title={hall ? 'Request the party hall' : 'Book a gym slot'} onPress={() => setAdding(true)} />}
      {adding && (
        <Section title="New request">
          <Field
            label={hall ? 'Purpose / function' : 'Title'}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            autoCapitalize="sentences"
          />
          <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
          <Field label="Start time (HH:mm, 24-hour)" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" />
          <Field label="End time (HH:mm, 24-hour)" value={end} onChangeText={setEnd} keyboardType="numbers-and-punctuation" />
          <Field
            label="End date (only if it ends on another day)"
            value={endDate}
            onChangeText={setEndDate}
            placeholder={date}
            keyboardType="numbers-and-punctuation"
          />
          {!!error && <Text style={s.danger}>{error}</Text>}
          <Button title="Send request" onPress={create} busy={busy} />
          <Button title="Cancel" kind="secondary" onPress={() => setAdding(false)} />
        </Section>
      )}
      <Section title={hall ? 'Party hall bookings' : 'Gym bookings'}>
        {sorted.length === 0 && <EmptyState text="No bookings yet." />}
        {sorted.map((b) => {
          const open = b.status === 'pending' || b.status === 'approved';
          const mineOrStaff = admin || b.flat === flat;
          return (
            <View key={b.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>{b.title}</Text>
                <Badge text={cap(b.status)} tone={TONE[b.status]} />
              </View>
              <Text style={s.small}>
                Flat {b.flat || '—'} · {fmtDateTime(b.starts_at)} → {fmtDateTime(b.ends_at)}
              </Text>
              {!!b.note && <Text style={s.small}>MC note: {b.note}</Text>}
              <View style={[s.rowWrap, { marginTop: 8 }]}>
                {admin && b.status === 'pending' && new Date(b.starts_at).getTime() > now && (
                  <SmallButton
                    title="Approve"
                    onPress={() => save({ action: act.status, id: b.id, status: 'approved', note: '' }, 'Booking approved')}
                  />
                )}
                {admin && b.status === 'pending' && (
                  <SmallButton
                    title="Reject"
                    danger
                    onPress={() => save({ action: act.status, id: b.id, status: 'rejected', note: '' }, 'Booking rejected')}
                  />
                )}
                {open && mineOrStaff && (
                  <SmallButton title="Cancel booking" danger onPress={() => save({ action: act.cancel, id: b.id }, 'Booking cancelled')} />
                )}
                {superAdmin && (
                  <SmallButton
                    title="Delete booking"
                    danger
                    onPress={() =>
                      showAppDialog(
                        'Delete booking?',
                        `Permanently remove booking #${b.id} for flat ${b.flat || '—'}? This will be recorded in the audit log.`,
                        [
                          { text: 'Keep booking', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => void save({ action: act.del, id: b.id }, 'Booking deleted'),
                          },
                        ],
                      )
                    }
                  />
                )}
              </View>
            </View>
          );
        })}
      </Section>
    </View>
  );
}
