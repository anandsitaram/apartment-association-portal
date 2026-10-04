import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import type { ScreenProps } from './types';
import { Button, Field, Section } from '../components';
import s from '../styles/styles';
export default function Contact({ data, save }: ScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const submit = async () => {
    if (!data.settings.contactEmail) {
      setResult('Management contact email is not configured.');
      return;
    }
    if (!name.trim() || !email.trim() || !message.trim()) {
      setResult('Name, email and message are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setResult('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setResult('');
    const ok = await save(
      { action: 'sendContactMessage', name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() },
      'Message sent successfully',
    );
    setBusy(false);
    if (ok) {
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
      setResult('Your message has been sent successfully.');
    } else setResult('The message could not be sent. Please check the error notification.');
  };
  return (
    <View>
      <Section title="Contact management">
        <Text style={s.muted}>Send a message to the apartment management team.</Text>
        <Text style={s.rowTitle}>{data.settings.contactEmail || 'Contact email not configured'}</Text>
        {!!data.settings.whatsappGroupName && <Text style={s.muted}>WhatsApp: {data.settings.whatsappGroupName}</Text>}
        {!!data.settings.whatsappGroupLink && (
          <Button title="Open WhatsApp group" kind="secondary" onPress={() => void Linking.openURL(data.settings.whatsappGroupLink!)} />
        )}
      </Section>
      <Section title="Send a message">
        <Field label="Name *" value={name} onChangeText={setName} maxLength={100} />
        <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" maxLength={160} />
        <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={160} />
        <Field label="Message *" value={message} onChangeText={setMessage} multiline maxLength={4000} placeholder="Write your message…" />
        {!!result && <Text style={result.includes('successfully') ? s.ok : s.danger}>{result}</Text>}
        <Button title="Send message" onPress={() => void submit()} busy={busy} />
      </Section>
    </View>
  );
}
