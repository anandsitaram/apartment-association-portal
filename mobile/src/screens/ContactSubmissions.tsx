import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Loading, Section, SmallButton, Badge } from '../components';
import s from '../styles/styles';
type Entry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  submitted_by: string;
  submitted_at: string;
  status: string;
  error?: string;
  read_at?: string | null;
  read_by?: string;
};
export default function ContactSubmissions({ token }: ScreenProps) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await call<{ entries?: Entry[] }>({ action: 'listContactSubmissions', limit: 200 }, token);
      setRows(r.entries ?? []);
      setError('');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const markRead = async (id: number) => {
    try {
      await call({ action: 'markContactRead', id }, token);
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <View>
      <Section title="Contact submissions" right={<SmallButton title="Refresh" onPress={() => void load()} />}>
        <Text style={s.muted}>Latest 200 messages submitted through Contact Us.</Text>
        {!!error && <Text style={s.danger}>{error}</Text>}
        {busy ? (
          <Loading text="Loading submissions…" />
        ) : !rows.length ? (
          <EmptyState text="No contact submissions yet." />
        ) : (
          rows.map((row) => (
            <View key={row.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>{row.subject || '(No subject)'}</Text>
                <Badge text={row.read_at ? 'Read' : 'Unread'} tone={row.read_at ? 'ok' : 'warn'} />
              </View>
              <Text style={s.muted}>
                {row.name} · {row.email}
              </Text>
              <Text style={s.small}>
                {new Date(row.submitted_at).toLocaleString()} · {row.status}
              </Text>
              <Text style={s.muted}>{row.message}</Text>
              {!!row.error && <Text style={s.danger}>{row.error}</Text>}
              {!row.read_at && <Button title="Mark as read" kind="secondary" onPress={() => void markRead(row.id)} />}
            </View>
          ))
        )}
      </Section>
    </View>
  );
}
