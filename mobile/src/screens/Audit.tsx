import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, Chip, EmptyState, Loading, Section } from '../components';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

type Entry = { id: number; at: string; username: string; action: string; target: string; detail?: Record<string, unknown> };
export default function Audit({ token, superAdmin }: ScreenProps) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'features'>('all');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await call<{ entries?: Entry[] }>({ action: 'listAudit', limit: 200 }, token);
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
  const clear = async () => {
    if (!superAdmin) return;
    showAppDialog('Clear audit log?', 'This permanently removes audit history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear log',
        style: 'destructive',
        onPress: async () => {
          try {
            await call({ action: 'clearAuditLog' }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);
  };
  const shown = rows.filter((e) => filter === 'all' || e.target === 'feature-configuration' || /feature/i.test(e.action));
  return (
    <View>
      <Section title="Audit history">
        <Text style={s.muted}>Latest 200 recorded changes, newest first.</Text>
        <Button title="Refresh audit logs" kind="secondary" onPress={() => void load()} busy={busy} />
        <View style={s.rowWrap}>
          <Chip label="All activity" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Feature changes" active={filter === 'features'} onPress={() => setFilter('features')} />
        </View>
        {!!error && <Text style={s.danger}>{error}</Text>}
        {busy ? (
          <Loading text="Loading audit history…" />
        ) : !shown.length ? (
          <EmptyState text="No matching audit entries." />
        ) : (
          shown.map((e) => (
            <View key={e.id} style={s.listRow}>
              <Text style={s.rowTitle}>{e.action}</Text>
              <Text style={s.muted}>
                {new Date(e.at).toLocaleString()} · {e.username}
              </Text>
              <Text style={s.small}>Target: {e.target}</Text>
              {!!e.detail && (
                <Text style={s.small}>
                  {Object.entries(e.detail)
                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                    .join(' · ')}
                </Text>
              )}
            </View>
          ))
        )}
        {superAdmin && <Button title="Clear audit log" kind="danger" onPress={() => void clear()} />}
      </Section>
    </View>
  );
}
