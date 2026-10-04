import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Field, Loading, Section, SmallButton } from '../components';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

type DeveloperRow = { username: string; role: 'developer'; email?: string | null; phone?: string | null };
type Draft = { username: string; password: string; email: string };
const blank: Draft = { username: '', password: '', email: '' };

export default function DeveloperAccounts({ token, username: me }: ScreenProps) {
  const [rows, setRows] = useState<DeveloperRow[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await call<{ users?: DeveloperRow[] }>({ action: 'listUsers' }, token);
      setRows((result.users ?? []).filter((user) => user.role === 'developer'));
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

  const create = async () => {
    const username = draft.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      setError('Username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.');
      return;
    }
    if (draft.password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await call({ action: 'saveUser', username, password: draft.password, role: 'developer', email: draft.email.trim() }, token);
      setDraft(blank);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (username: string) =>
    showAppDialog('Delete developer account?', `Permanently remove ${username}? This does not delete apartment data or feature settings.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await call({ action: 'deleteUser', username }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);

  return (
    <View>
      <Section title="Developer accounts">
        <Text style={s.muted}>
          Super Admin only. Developer accounts can configure feature availability, but cannot manage resident finances, bookings, or
          permissions.
        </Text>
        <Button title="Refresh accounts" kind="secondary" onPress={() => void load()} busy={busy} />
        {!!error && <Text style={s.danger}>{error}</Text>}
      </Section>
      <Section title="Create developer">
        <Field
          label="Username"
          value={draft.username}
          onChangeText={(username) => setDraft({ ...draft, username })}
          autoCapitalize="none"
        />
        <Field
          label="Password (minimum 6 characters)"
          value={draft.password}
          onChangeText={(password) => setDraft({ ...draft, password })}
          secureTextEntry
        />
        <Field
          label="Email (optional)"
          value={draft.email}
          onChangeText={(email) => setDraft({ ...draft, email })}
          keyboardType="email-address"
        />
        <Button title="Create developer" onPress={() => void create()} busy={saving} />
      </Section>
      <Section title={`Developer accounts (${rows.length})`}>
        {busy && !rows.length ? (
          <Loading text="Loading developer accounts…" />
        ) : !rows.length ? (
          <EmptyState text="No developer accounts found." />
        ) : (
          rows.map((user) => (
            <View key={user.username} style={s.listRow}>
              <Text style={s.rowTitle}>{user.username}</Text>
              <Text style={s.muted}>{user.email || 'No email address'}</Text>
              {user.username === me ? (
                <Text style={s.small}>Current account</Text>
              ) : (
                <SmallButton title="Delete account" danger onPress={() => remove(user.username)} />
              )}
            </View>
          ))
        )}
      </Section>
    </View>
  );
}
