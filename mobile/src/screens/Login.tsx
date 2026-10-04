import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { Button, Field } from '../components';
import { call, errText, getApiBase, isValidBaseUrl, normalizeBaseUrl, setApiBase } from '../core/api';
import { DEFAULT_API_BASE_URL } from '../core/config';
import { Auth, writeServer } from '../services';
import { APP_BRAND_NAME } from '../../../shared/branding';
import s from '../styles/styles';

export default function Login({ onLoggedIn, notice }: { onLoggedIn: (a: Auth) => void; notice?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getApiBase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) return setError('Enter your username and password');
    if (!isValidBaseUrl(server)) return setError('Server address must start with https://');
    setBusy(true);
    setError('');
    try {
      setApiBase(server);
      const r = await call<{ token: string; user: Auth['user'] }>({ action: 'login', username: username.trim(), password });
      await writeServer(normalizeBaseUrl(server) === DEFAULT_API_BASE_URL ? '' : normalizeBaseUrl(server));
      onLoggedIn({ token: r.token, user: r.user });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.container, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <Image
            source={require('../assets/my-apartment-building.jpg')}
            resizeMode="cover"
            accessibilityLabel="My Apartment apartment building"
            style={{
              width: '100%',
              height: 170,
              alignSelf: 'center',
              marginBottom: 22,
              borderRadius: 18,
              backgroundColor: '#E8F5E9',
            }}
          />
          <Text style={[s.title, { textAlign: 'center' }]}>{APP_BRAND_NAME}</Text>
          <Text style={[s.subtitle, { textAlign: 'center', marginBottom: 24 }]}>Apartment maintenance</Text>
          {!!notice && (
            <View style={s.banner}>
              <Text style={s.bannerText}>{notice}</Text>
            </View>
          )}
          <Field label="Username" value={username} onChangeText={setUsername} autoCorrect={false} textContentType="username" />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            onSubmitEditing={submit}
          />
          {!!error && <Text style={s.danger}>{error}</Text>}
          <Button title="Sign in" onPress={submit} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
