import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Field, Loading, Section } from '../components';
import s from '../styles/styles';

type UserRow = { username: string; role: string; flat: string | null; phone?: string | null; email?: string | null };
export default function FlatUsers({ data, save, token }: ScreenProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [flat, setFlat] = useState(data.flats[0]?.flat ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await call<{ users?: UserRow[] }>({ action: 'listUsers' }, token);
      setUsers((r.users ?? []).filter((u) => u.role === 'user'));
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
    if (username.trim().length < 3 || password.length < 6 || !flat) {
      setError('Enter a username (at least 3 characters), password (at least 6 characters), and flat.');
      return;
    }
    setSaving(true);
    setError('');
    const ok = await save(
      { action: 'saveUser', username: username.trim(), password, role: 'user', flat, phone: phone.trim(), email: email.trim() },
      'Resident account created',
    );
    setSaving(false);
    if (ok) {
      setUsername('');
      setPassword('');
      setPhone('');
      setEmail('');
      await load();
    }
  };
  return (
    <View>
      <Section title="Resident login accounts">
        <Text style={s.muted}>Manage the resident login accounts linked to flats. Passwords are never displayed.</Text>
        <View style={s.row2}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Resident accounts</Text>
            <Text style={s.statValue}>{users.length}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Flats</Text>
            <Text style={s.statValue}>{data.flats.length}</Text>
          </View>
        </View>
        <Button title="Refresh accounts" kind="secondary" onPress={() => void load()} busy={busy} />
        {busy ? (
          <Loading text="Loading accounts…" />
        ) : error ? (
          <Text style={s.danger}>{error}</Text>
        ) : !users.length ? (
          <EmptyState text="No resident login accounts found." />
        ) : (
          users.map((u) => (
            <View key={u.username} style={s.listRow}>
              <Text style={s.rowTitle}>{u.username}</Text>
              <Text style={s.muted}>Flat {u.flat || 'Not linked'}</Text>
              {!!u.phone && <Text style={s.small}>{u.phone}</Text>}
              {!!u.email && <Text style={s.small}>{u.email}</Text>}
            </View>
          ))
        )}
      </Section>
      <Section title="Create resident account">
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Field label="Temporary password" value={password} onChangeText={setPassword} secureTextEntry />
        <Text style={s.label}>Flat</Text>
        <View style={s.rowWrap}>
          {data.flats.map((f) => (
            <Button
              key={f.flat}
              title={f.flat}
              kind={flat === f.flat ? 'primary' : 'secondary'}
              onPress={() => setFlat(f.flat)}
              fullWidth={false}
            />
          ))}
        </View>
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Text style={s.small}>Share temporary passwords securely and ask residents to change them after their first login.</Text>
        <Button title="Create resident account" onPress={() => void create()} busy={saving} />
      </Section>
    </View>
  );
}
