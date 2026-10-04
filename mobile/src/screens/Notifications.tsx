import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { NotificationChannel } from '../../../shared/types';
import type { ScreenProps } from './types';
import { Button, Chip, EmptyState, Field, Section } from '../components';
import s from '../styles/styles';

export default function Notifications({ data, save }: ScreenProps) {
  const [channel, setChannel] = useState<NotificationChannel>('all');
  const [targetType, setTargetType] = useState<'all' | 'unpaid' | 'flat'>('all');
  const [targetFlat, setTargetFlat] = useState(data.flats[0]?.flat ?? '');
  const [subject, setSubject] = useState('Maintenance Payment Reminder');
  const [message, setMessage] = useState('Dear resident, this is a friendly reminder to pay your monthly maintenance dues. Thank you!');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const send = async () => {
    if (!subject.trim() || !message.trim()) {
      setFeedback('Subject and message are required.');
      return;
    }
    if (targetType === 'flat' && !targetFlat) {
      setFeedback('Select a flat first.');
      return;
    }
    setBusy(true);
    setFeedback('');
    const ok = await save(
      {
        action: 'sendNotificationMessage',
        channel,
        targetType,
        targetFlat: targetType === 'flat' ? targetFlat : undefined,
        subject: subject.trim(),
        message: message.trim(),
      },
      'Notification request submitted',
    );
    setBusy(false);
    if (ok) setFeedback('Notification request submitted successfully. Check the delivery log below.');
  };
  const logs = [...(data.notificationLogs ?? [])].reverse();
  return (
    <View>
      <Section title="Send notification">
        <Text style={s.muted}>Send announcements or maintenance reminders through the configured delivery channels.</Text>
        <Text style={s.label}>Channel</Text>
        <View style={s.rowWrap}>
          {(['all', 'email', 'sms', 'whatsapp'] as NotificationChannel[]).map((c) => (
            <Chip key={c} label={c === 'all' ? 'All channels' : c.toUpperCase()} active={channel === c} onPress={() => setChannel(c)} />
          ))}
        </View>
        <Text style={s.label}>Recipients</Text>
        <View style={s.rowWrap}>
          {(
            [
              { id: 'all', label: 'All residents' },
              { id: 'unpaid', label: 'Unpaid only' },
              { id: 'flat', label: 'Specific flat' },
            ] as const
          ).map((t) => (
            <Chip key={t.id} label={t.label} active={targetType === t.id} onPress={() => setTargetType(t.id)} />
          ))}
        </View>
        {targetType === 'flat' && (
          <>
            <Text style={s.label}>Choose flat</Text>
            <View style={s.rowWrap}>
              {data.flats.map((f) => (
                <Chip key={f.flat} label={f.flat} active={targetFlat === f.flat} onPress={() => setTargetFlat(f.flat)} />
              ))}
            </View>
          </>
        )}
        <Field label="Subject" value={subject} onChangeText={setSubject} />
        <Field label="Message" value={message} onChangeText={setMessage} multiline numberOfLines={5} />
        {!!feedback && <Text style={s.muted}>{feedback}</Text>}
        <Button title="Send notification" onPress={() => void send()} busy={busy} />
      </Section>
      <Section title="Recent delivery log">
        {!logs.length ? (
          <EmptyState text="No notification logs are available." />
        ) : (
          logs.slice(0, 50).map((log) => (
            <View key={log.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>{log.subject}</Text>
                <Text style={s.small}>{log.status.toUpperCase()}</Text>
              </View>
              <Text style={s.muted}>
                {log.channel.toUpperCase()} · {log.target} · {new Date(log.sent_at).toLocaleString()}
              </Text>
              <Text style={s.small}>{log.message}</Text>
            </View>
          ))
        )}
      </Section>
    </View>
  );
}
