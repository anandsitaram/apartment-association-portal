import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { FEATURE_DEFINITIONS, type ConfigurableFeature } from '../../../shared/features';
import type { ScreenProps } from './types';
import { Button, Section } from '../components';
import s, { GREEN } from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

export default function FeatureConfiguration({ data, save }: ScreenProps) {
  const [draft, setDraft] = useState<Record<ConfigurableFeature, boolean>>(
    () =>
      Object.fromEntries(FEATURE_DEFINITIONS.map(({ key }) => [key, data.features[key] !== false])) as Record<ConfigurableFeature, boolean>,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(
      Object.fromEntries(FEATURE_DEFINITIONS.map(({ key }) => [key, data.features[key] !== false])) as Record<ConfigurableFeature, boolean>,
    );
  }, [data.features]);

  const toggle = (key: ConfigurableFeature, label: string) => {
    if (draft[key]) {
      showAppDialog(`Disable ${label}?`, 'The feature will be hidden and its server actions will be rejected. Existing data is retained.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable feature', style: 'destructive', onPress: () => setDraft((current) => ({ ...current, [key]: false })) },
      ]);
    } else setDraft((current) => ({ ...current, [key]: true }));
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const ok = await save({ action: 'saveFeatureConfig', features: draft }, 'Feature settings saved');
      if (!ok) setError('Feature settings could not be saved. Review the error message and try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save feature settings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Section title="Feature availability">
        <Text style={s.muted}>
          Control which optional modules are available to this apartment. Disabled features disappear from navigation and their API actions
          are blocked; existing data is retained.
        </Text>
        {!!error && <Text style={s.danger}>{error}</Text>}
        {FEATURE_DEFINITIONS.map(({ key, label, description }) => {
          const systemOk = data.featureSystemAvailable?.[key] !== false;
          const enabled = draft[key] && systemOk;
          return (
            <View key={key} style={s.listRow}>
              <View style={[s.rowBetween, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.rowTitle}>{label}</Text>
                  <Text style={s.muted}>{description}</Text>
                  {!systemOk && <Text style={s.small}>Unavailable at server level. Enable the server capability first.</Text>}
                </View>
                <Switch value={enabled} disabled={!systemOk} onValueChange={() => toggle(key, label)} trackColor={{ true: GREEN }} />
              </View>
            </View>
          );
        })}
        <Text style={s.small}>Changes are audited with the previous and new values.</Text>
        <Button title="Save feature settings" onPress={() => void submit()} busy={busy} />
        <Button
          title="Discard unsaved changes"
          kind="secondary"
          onPress={() =>
            setDraft(
              Object.fromEntries(FEATURE_DEFINITIONS.map(({ key }) => [key, data.features[key] !== false])) as Record<
                ConfigurableFeature,
                boolean
              >,
            )
          }
          disabled={busy}
        />
      </Section>
    </View>
  );
}
