import React, { useCallback, useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Field, Loading, Section } from '../components';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';
type BackupRow = { id: number; at: string; size: number };
export default function Backups({ token, data, superAdmin }: ScreenProps) {
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoreText, setRestoreText] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await call<{ backups?: BackupRow[] }>({ action: 'listBackups' }, token);
      setRows(r.backups ?? []);
      setError('');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => {
    if (data.features.autoBackup) void load();
  }, [load, data.features.autoBackup]);
  const shareBackup = async (id?: number) => {
    setBusy(true);
    setError('');
    try {
      const r = await call<{ backup: unknown }>({ action: id == null ? 'backup' : 'getBackup', ...(id == null ? {} : { id }) }, token);
      const text = JSON.stringify(r.backup, null, 2);
      await Share.share({ title: 'My Apartment data backup', message: text });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const restoreBackup = () => {
    if (!restoreText.trim()) {
      setError('Paste a trusted backup JSON first.');
      return;
    }
    if (restoreConfirm !== 'RESTORE') {
      setError('Type RESTORE exactly to confirm.');
      return;
    }
    try {
      JSON.parse(restoreText);
    } catch {
      setError('Backup JSON is invalid.');
      return;
    }
    showAppDialog(
      'Restore database backup?',
      'This replaces application data with the supplied backup. Create and save a current backup first. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore database',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError('');
              try {
                await call({ action: 'restoreBackup', backup: restoreText, confirm: 'RESTORE' }, token);
                setRestoreText('');
                setRestoreConfirm('');
                showAppDialog('Restore complete', 'Backup restored. Sign out and sign back in or reload the app to refresh data.');
              } catch (e) {
                setError(errText(e));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };
  return (
    <View>
      <Section title="Create backup">
        <Text style={s.muted}>
          Generate a JSON backup of application data. Use the system share sheet to save it to a secure location. User passwords are not
          included.
        </Text>
        {!!error && <Text style={s.danger}>{error}</Text>}
        <Button title="Generate and share backup" onPress={() => void shareBackup()} busy={busy} />
      </Section>
      {data.features.autoBackup && (
        <Section title="Automatic backups">
          <Text style={s.muted}>Daily backups stored by the server.</Text>
          <Button title="Refresh backup list" kind="secondary" onPress={() => void load()} busy={busy} />
          {busy && !rows.length ? (
            <Loading text="Loading backups…" />
          ) : !rows.length ? (
            <EmptyState text="No saved backups were returned by the server." />
          ) : (
            rows.map((row) => (
              <View key={row.id} style={s.listRow}>
                <Text style={s.rowTitle}>{new Date(row.at).toLocaleString()}</Text>
                <Text style={s.muted}>{Math.ceil(row.size / 1024)} KB</Text>
                <Button title="Share this backup" kind="secondary" onPress={() => void shareBackup(row.id)} />
              </View>
            ))
          )}
        </Section>
      )}
      {superAdmin && (
        <Section title="Restore database backup">
          <Text style={s.danger}>
            Super Admin only. This replaces application data. Restore only a trusted backup and save a current backup first.
          </Text>
          <Field
            label="Backup JSON"
            value={restoreText}
            onChangeText={setRestoreText}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholder="Paste backup JSON here"
          />
          <Field label="Type RESTORE to confirm" value={restoreConfirm} onChangeText={setRestoreConfirm} autoCapitalize="characters" />
          <Button
            title="Restore database backup"
            kind="danger"
            onPress={restoreBackup}
            busy={busy}
            disabled={restoreConfirm !== 'RESTORE' || !restoreText.trim()}
          />
        </Section>
      )}
    </View>
  );
}
