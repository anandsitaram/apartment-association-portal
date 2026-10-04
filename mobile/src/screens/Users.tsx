import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Field, Loading, Section, SmallButton } from '../components';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';
type UserRow = { username: string; role: string; flat: string | null; phone?: string | null; email?: string | null };
type Draft = { username: string; password: string; role: 'user' | 'admin' | 'security'; flat: string; phone: string; email: string };
const blank: Draft = { username: '', password: '', role: 'user', flat: '', phone: '', email: '' };
const roleNames: Record<string, string> = {
  user: 'Resident',
  admin: 'Admin',
  super: 'Super Admin',
  superadmin: 'Super Admin',
  security: 'Security Desk',
  developer: 'Developer',
};
export default function Users({ token, data, username: me, superAdmin }: ScreenProps) {
  const canDeleteUsers = superAdmin || data.settings.allowAdminUserDeletion !== false;
  const [rows, setRows] = useState<UserRow[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await call<{ users?: UserRow[] }>({ action: 'listUsers' }, token);
      setRows(r.users ?? []);
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
  const saveUser = async () => {
    if (draft.username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (draft.password && draft.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (draft.role === 'user' && !draft.flat) {
      setError('Select a flat for resident accounts.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await call({ action: 'saveUser', ...draft, username: draft.username.trim(), password: draft.password }, token);
      setDraft(blank);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };
  const runAction = (title: string, message: string, body: Record<string, unknown>, destructive = false) =>
    showAppDialog(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: destructive ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await call(body, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);
  return (
    <View>
      <Section title="Account management">
        <Text style={s.muted}>
          Create or update resident, admin, and security accounts. Developer accounts are managed separately on the web app.
        </Text>
        <Button title="Refresh users" kind="secondary" onPress={() => void load()} busy={busy} />
        {!!error && <Text style={s.danger}>{error}</Text>}
      </Section>
      <Section title={draft.username ? `Edit account: ${draft.username}` : 'Add account'}>
        <Field label="Username" value={draft.username} onChangeText={(v) => setDraft({ ...draft, username: v })} autoCapitalize="none" />
        <Field
          label="Password (leave blank to keep current)"
          value={draft.password}
          onChangeText={(v) => setDraft({ ...draft, password: v })}
          secureTextEntry
        />
        <Text style={s.label}>Role</Text>
        <View style={s.rowWrap}>
          {(['user', 'admin', 'security'] as const).map((role) => (
            <Button
              key={role}
              title={roleNames[role]}
              kind={draft.role === role ? 'primary' : 'secondary'}
              onPress={() => setDraft({ ...draft, role, flat: role === 'user' ? draft.flat || data.flats[0]?.flat || '' : '' })}
              fullWidth={false}
            />
          ))}
        </View>
        {draft.role === 'user' && (
          <>
            <Text style={s.label}>Linked flat</Text>
            <View style={s.rowWrap}>
              {data.flats.map((f) => (
                <Button
                  key={f.flat}
                  title={f.flat}
                  kind={draft.flat === f.flat ? 'primary' : 'secondary'}
                  onPress={() => setDraft({ ...draft, flat: f.flat })}
                  fullWidth={false}
                />
              ))}
            </View>
          </>
        )}
        <Field label="Phone" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" />
        <Field label="Email" value={draft.email} onChangeText={(v) => setDraft({ ...draft, email: v })} keyboardType="email-address" />
        <Button title="Save account" onPress={() => void saveUser()} busy={saving} />
        <Button title="Clear form" kind="secondary" onPress={() => setDraft(blank)} />
      </Section>
      <Section title={`Users (${rows.length})`}>
        {busy && !rows.length ? (
          <Loading text="Loading users…" />
        ) : !rows.length ? (
          <EmptyState text="No user accounts returned." />
        ) : (
          rows.map((u) => (
            <View key={u.username} style={s.listRow}>
              <Text style={s.rowTitle}>{u.username}</Text>
              <Text style={s.muted}>
                {roleNames[u.role] || u.role}
                {u.role === 'user' && u.flat ? ` · Flat ${u.flat}` : ''}
              </Text>
              {!!u.phone && <Text style={s.small}>{u.phone}</Text>}
              {!!u.email && <Text style={s.small}>{u.email}</Text>}
              {!(u.username === 'super-admin' && ['super', 'superadmin'].includes(u.role)) && (
                <View style={s.rowWrap}>
                  {['user', 'admin', 'security'].includes(u.role) && (
                    <SmallButton
                      title="Edit"
                      onPress={() =>
                        setDraft({
                          username: u.username,
                          password: '',
                          role: u.role as Draft['role'],
                          flat: u.flat || '',
                          phone: u.phone || '',
                          email: u.email || '',
                        })
                      }
                    />
                  )}
                  {superAdmin && u.username !== me && !['super', 'superadmin', 'developer'].includes(u.role) && (
                    <SmallButton
                      title="Revoke sessions"
                      onPress={() =>
                        runAction(
                          'Revoke sessions?',
                          `Sign ${u.username} out from all devices?`,
                          { action: 'revokeUserSessions', username: u.username },
                          true,
                        )
                      }
                    />
                  )}
                  {u.username !== me && canDeleteUsers && !['super', 'superadmin', 'developer'].includes(u.role) && (
                    <SmallButton
                      title="Delete"
                      danger
                      onPress={() =>
                        runAction(
                          'Delete account?',
                          `Permanently delete ${u.username}?`,
                          { action: 'deleteUser', username: u.username },
                          true,
                        )
                      }
                    />
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </Section>
    </View>
  );
}
