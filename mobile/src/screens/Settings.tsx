import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { ScreenProps } from './types';
import { Button, Field, Section } from '../components';
import s, { GREEN } from '../styles/styles';
export default function Settings({ data, save, admin, superAdmin }: ScreenProps) {
  const [orgName, setOrgName] = useState(data.settings.orgName || '');
  const [orgShort, setOrgShort] = useState(data.settings.orgShort || '');
  const [contactEmail, setContactEmail] = useState(data.settings.contactEmail || '');
  const [whatsappName, setWhatsappName] = useState(data.settings.whatsappGroupName || '');
  const [whatsappLink, setWhatsappLink] = useState(data.settings.whatsappGroupLink || '');
  const [dueDay, setDueDay] = useState(String(data.settings.dueDay ?? 0));
  const [autoReminders, setAutoReminders] = useState(!!data.settings.autoReminders);
  const [maintenanceMode, setMaintenanceMode] = useState(!!data.settings.maintenanceMode);
  const [maintenanceMessage, setMaintenanceMessage] = useState(data.settings.maintenanceMessage || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOrgName(data.settings.orgName || '');
    setOrgShort(data.settings.orgShort || '');
    setContactEmail(data.settings.contactEmail || '');
    setWhatsappName(data.settings.whatsappGroupName || '');
    setWhatsappLink(data.settings.whatsappGroupLink || '');
    setDueDay(String(data.settings.dueDay ?? 0));
    setAutoReminders(!!data.settings.autoReminders);
    setMaintenanceMode(!!data.settings.maintenanceMode);
    setMaintenanceMessage(data.settings.maintenanceMessage || '');
  }, [data.settings]);
  const saveGeneral = async () => {
    const due = Number(dueDay);
    if (!Number.isInteger(due) || due < 0 || due > 31) return;
    setBusy(true);
    await save(
      {
        action: 'saveSettings',
        settings: {
          orgName: orgName.trim(),
          orgShort: orgShort.trim(),
          contactEmail: contactEmail.trim(),
          whatsappGroupName: whatsappName.trim(),
          whatsappGroupLink: whatsappLink.trim(),
          dueDay: due,
          autoReminders,
        },
      },
      'General settings saved',
    );
    setBusy(false);
  };
  const saveMaintenance = async () => {
    setBusy(true);
    await save(
      { action: 'saveSettings', settings: { maintenanceMode, maintenanceMessage: maintenanceMessage.trim() } },
      'Maintenance settings saved',
    );
    setBusy(false);
  };
  return (
    <View>
      <Section title="General settings">
        <Text style={s.muted}>Update the organization name and contact details used across the app.</Text>
        <Field label="Organization name" value={orgName} onChangeText={setOrgName} />
        <Field label="Short name" value={orgShort} onChangeText={setOrgShort} />
        <Field label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" />
        <Field label="WhatsApp group name" value={whatsappName} onChangeText={setWhatsappName} />
        <Field label="WhatsApp group link" value={whatsappLink} onChangeText={setWhatsappLink} keyboardType="url" />
        <Field label="Maintenance due day (0–31)" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" />
        <View style={s.rowBetween}>
          <Text style={s.rowTitle}>Automatic reminders</Text>
          <Switch value={autoReminders} onValueChange={setAutoReminders} trackColor={{ true: GREEN }} />
        </View>
        <Button title="Save general settings" onPress={() => void saveGeneral()} busy={busy} />
      </Section>
      {superAdmin && (
        <Section title="System maintenance">
          <Text style={s.muted}>Use maintenance mode to temporarily restrict resident access during planned work.</Text>
          <View style={s.rowBetween}>
            <Text style={s.rowTitle}>Enable maintenance mode</Text>
            <Switch value={maintenanceMode} onValueChange={setMaintenanceMode} trackColor={{ true: GREEN }} />
          </View>
          <Field label="Maintenance message" value={maintenanceMessage} onChangeText={setMaintenanceMessage} multiline maxLength={500} />
          <Button title="Save maintenance settings" onPress={() => void saveMaintenance()} busy={busy} kind="secondary" />
        </Section>
      )}
      <Section title="Access note">
        <Text style={s.muted}>
          {admin
            ? 'Administrative settings are saved through the existing application API. Some advanced billing, retention, and feature configuration options are still available only on the web app.'
            : 'Settings are restricted to administrators.'}
        </Text>
      </Section>
    </View>
  );
}
