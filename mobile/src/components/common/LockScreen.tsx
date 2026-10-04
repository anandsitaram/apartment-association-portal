import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { AppLockConfig, checkPin, verifyBiometricUnlock } from '../../services';
import s, { GREEN } from '../../styles/styles';

export function LockScreen({ appLock, onUnlock }: { appLock: AppLockConfig; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [usePin, setUsePin] = useState(appLock.mode !== 'biometric');

  useEffect(() => {
    if (appLock.mode === 'biometric' && !usePin) {
      verifyBiometricUnlock().then((ok) => (ok ? onUnlock() : setUsePin(true)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePin]);

  const tryPin = () => {
    if (checkPin(appLock, pin)) onUnlock();
    else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Lock size={40} color={GREEN} strokeWidth={1.6} />
        <Text style={s.title}>Locked</Text>
        <Text style={s.muted}>{usePin ? 'Enter your PIN to continue' : 'Unlock with Face ID / fingerprint'}</Text>
        {usePin ? (
          <>
            <TextInput
              style={[s.input, s.pinInput]}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              value={pin}
              onChangeText={(t) => {
                setPin(t);
                setError('');
              }}
              onSubmitEditing={tryPin}
              placeholder="••••"
              autoFocus
            />
            {!!error && <Text style={s.danger}>{error}</Text>}
            <TouchableOpacity style={s.primary} onPress={tryPin}>
              <Text style={s.primaryText}>Unlock</Text>
            </TouchableOpacity>
            {appLock.mode === 'biometric' && (
              <TouchableOpacity style={s.secondary} onPress={() => setUsePin(false)}>
                <Text style={s.secondaryText}>Use Face ID / fingerprint instead</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity style={s.primary} onPress={() => verifyBiometricUnlock().then((ok) => (ok ? onUnlock() : setUsePin(true)))}>
            <Text style={s.primaryText}>Try again</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
