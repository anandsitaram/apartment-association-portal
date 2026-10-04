import React, { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Button, EmptyState, Field, Loading, Section, SmallButton } from '../components';
import s, { GREEN } from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

type SecurityEvent = { id: number; at: string; type: string; username?: string | null; ip?: string | null; detail?: unknown };
type Retention = { tickets: number; contacts: number; audit: number; security: number };
type SecuritySnapshot = {
  maintenance?: { enabled?: boolean; message?: string };
  retention?: Partial<Retention>;
  security?: SecurityEvent[];
};
const DEFAULT_RETENTION: Retention = { tickets: 365, contacts: 365, audit: 730, security: 90 };

export default function SecurityCenter({ token }: ScreenProps) {
  const [maintenance, setMaintenance] = useState({ enabled: false, message: 'System maintenance in progress. Please try again shortly.' });
  const [retention, setRetention] = useState<Retention>(DEFAULT_RETENTION);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await call<SecuritySnapshot>({ action: 'getSystemSecurity' }, token);
      setMaintenance({
        enabled: result.maintenance?.enabled === true,
        message: result.maintenance?.message || 'System maintenance in progress. Please try again shortly.',
      });
      setRetention({ ...DEFAULT_RETENTION, ...(result.retention || {}) });
      setEvents(result.security || []);
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

  const saveMaintenance = async () => {
    setBusy(true);
    setError('');
    try {
      await call({ action: 'setMaintenanceMode', ...maintenance }, token);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveRetention = async () => {
    const values: number[] = [retention.tickets, retention.contacts, retention.audit, retention.security];
    if (values.some((value) => !Number.isFinite(value) || value < 7 || value > 3650)) {
      setError('Retention must be between 7 and 3650 days for every category.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await call({ action: 'setRetention', ...retention }, token);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const revoke = () => {
    const target = username.trim().toLowerCase();
    if (!target) {
      setError('Enter a username first.');
      return;
    }
    if (target === 'super-admin') {
      setError('The built-in Super Admin session cannot be revoked here.');
      return;
    }
    showAppDialog('Revoke all sessions?', `Sign out ${target} from all devices? They will need to log in again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke sessions',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            await call({ action: 'revokeUserSessions', username: target }, token);
            setError(`All sessions revoked for ${target}.`);
          } catch (e) {
            setError(errText(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View>
      <Section title="Security & data">
        <Text style={s.muted}>
          Super Admin controls for maintenance access, data retention, session revocation, and recent security events.
        </Text>
        <Button title="Refresh security data" kind="secondary" onPress={() => void load()} busy={busy} />
        {!!error && <Text style={s.danger}>{error}</Text>}
      </Section>
      <Section title="Maintenance mode">
        <Text style={s.muted}>Temporarily blocks resident access while administrators work. Staff access remains available.</Text>
        <View style={s.rowBetween}>
          <Text style={s.rowTitle}>Enable maintenance mode</Text>
          <Switch
            value={maintenance.enabled}
            onValueChange={(enabled) => setMaintenance((current) => ({ ...current, enabled }))}
            trackColor={{ true: GREEN }}
          />
        </View>
        <Field
          label="Maintenance message"
          value={maintenance.message}
          onChangeText={(message) => setMaintenance((current) => ({ ...current, message }))}
          multiline
          maxLength={300}
        />
        <Button title="Save maintenance mode" onPress={() => void saveMaintenance()} busy={busy} />
      </Section>
      <Section title="Data retention (days)">
        <Text style={s.muted}>
          Automatic housekeeping removes records older than the configured retention period. Allowed range: 7–3650 days.
        </Text>
        {(['tickets', 'contacts', 'audit', 'security'] as const).map((key) => (
          <Field
            key={key}
            label={`${key[0].toUpperCase()}${key.slice(1)}`}
            value={String(retention[key])}
            onChangeText={(value) => setRetention((current) => ({ ...current, [key]: value === '' ? 0 : Number(value) }))}
            keyboardType="number-pad"
          />
        ))}
        <Button title="Save retention settings" onPress={() => void saveRetention()} busy={busy} />
      </Section>
      <Section title="Session management">
        <Field label="Username" value={username} onChangeText={setUsername} placeholder="Account to sign out everywhere" />
        <Button title="Revoke all sessions" kind="danger" onPress={revoke} busy={busy} />
      </Section>
      <Section title={`Recent security events (${events.length})`}>
        {busy && !events.length ? (
          <Loading text="Loading security events…" />
        ) : !events.length ? (
          <EmptyState text="No security events returned." />
        ) : (
          events.map((event) => (
            <View key={event.id} style={s.listRow}>
              <Text style={s.rowTitle}>{event.type}</Text>
              <Text style={s.muted}>
                {new Date(event.at).toLocaleString()} · {event.username || 'Unknown user'}
              </Text>
              <Text style={s.small}>IP: {event.ip || 'Not recorded'}</Text>
              {!!event.detail && (
                <Text style={s.small}>{typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail)}</Text>
              )}
            </View>
          ))
        )}
        <SmallButton title="Refresh events" onPress={() => void load()} />
      </Section>
    </View>
  );
}
