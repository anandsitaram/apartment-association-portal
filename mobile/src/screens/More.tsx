import React, { useState } from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  Database,
  Dumbbell,
  Home,
  Inbox,
  Landmark,
  Lock,
  Mail,
  MoreHorizontal,
  PartyPopper,
  Phone,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRound,
  Vote,
  Wallet,
  Building2,
  Bell,
} from 'lucide-react-native';
import type { NavItem } from '../../../shared/navigation';
import { ROLE_LABEL } from '../../../shared/roles';
import { Button, Field, Section, Sheet } from '../components';
import {
  AppLockConfig,
  defaultAppLock,
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometrySupported,
  isValidPin,
  makePinLock,
} from '../services';
import { APP_BRAND_NAME } from '../../../shared/branding';
import type { ScreenProps } from './types';
import s, { GREEN } from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

const ITEM_ICONS: Record<string, any> = {
  dashboard: Home,
  months: Calendar,
  corpus: Landmark,
  mymaintenance: Wallet,
  tickets: ClipboardList,
  hall: PartyPopper,
  gym: Dumbbell,
  events: Calendar,
  polls: Vote,
  flats: Building2,
  'flat-users': UserCog,
  summary: TrendingUp,
  notifications: Bell,
  audit: ShieldCheck,
  'service-contacts': Phone,
  'visitor-access': UserCheck,
  'security-desk': Shield,
  contact: Mail,
  'contact-submissions': Inbox,
  settings: SlidersHorizontal,
  'feature-config': SlidersHorizontal,
  backups: Database,
  users: ClipboardList,
  'developer-accounts': UserCog,
  security: Lock,
};

interface Props extends ScreenProps {
  items: NavItem[];
  onOpen: (id: string) => void;
  role: string;
  appLock: AppLockConfig;
  onAppLock: (c: AppLockConfig) => Promise<void>;
  onLogout: () => void;
}

export default function More({ items, onOpen, role, username, flat, save, appLock, onAppLock, onLogout }: Props) {
  const [pwOpen, setPwOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  return (
    <View>
      <Section title="Account details">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 }}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C8E6C9' }}>
            <UserRound size={28} color={GREEN} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: '#17351D' }}>{username || 'Account'}</Text>
            <View style={{ alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#E8F5E9' }}>
              <Text style={{ fontSize: 12, color: GREEN, fontWeight: '700' }}>{ROLE_LABEL[role] ?? role}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E3F0E4', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <UserRound size={17} color="#5F6F60" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: '#5F6F60', fontSize: 12 }}>Username</Text>
              <Text style={{ color: '#17351D', fontSize: 15, fontWeight: '600' }}>{username || 'Not available'}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Building2 size={17} color="#5F6F60" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: '#5F6F60', fontSize: 12 }}>Flat / unit</Text>
              <Text style={{ color: '#17351D', fontSize: 15, fontWeight: '600' }}>{flat ? `Flat ${flat}` : 'Not assigned'}</Text>
            </View>
          </View>
        </View>
        {role !== 'security' && <Button title="Change password" kind="secondary" onPress={() => setPwOpen(true)} />}
      </Section>
      {items.length > 0 && (
        <Section title="More">
          {items.map((it) => {
            const Icon = ITEM_ICONS[it.id] ?? MoreHorizontal;
            return (
              <TouchableOpacity key={it.id} style={[s.listRow, s.rowBetween]} onPress={() => onOpen(it.id)} accessibilityRole="button">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
                  <Icon size={20} color={GREEN} strokeWidth={2} />
                  <Text style={s.rowTitle}>{it.label}</Text>
                </View>
                <ChevronRight size={18} color={GREEN} />
              </TouchableOpacity>
            );
          })}
        </Section>
      )}
      <Section title="Security">
        <View style={s.rowBetween}>
          <Text style={s.rowTitle}>App lock</Text>
          <Text style={s.small}>{appLock.mode === 'off' ? 'Off' : appLock.mode === 'pin' ? 'PIN' : 'PIN + biometrics'}</Text>
        </View>
        <Button title={appLock.mode === 'off' ? 'Set up app lock' : 'Manage app lock'} kind="secondary" onPress={() => setLockOpen(true)} />
      </Section>
      <Section title="About us">
        <Text style={s.rowTitle}>{APP_BRAND_NAME}</Text>
        <Text style={[s.muted, { marginTop: 6 }]}>
          A community management app that helps residents and the association coordinate maintenance payments, service requests, bookings, visitor access, and parcel updates.
        </Text>
      </Section>
      <Section title="Privacy & data protection">
        <Text style={{ color: '#5f5a74', fontSize: 14, lineHeight: 22, marginTop: 2 }}>
          My Apartment is for association-related activities. The information and actions available to an account are controlled by its assigned role and server-side permissions. Only share information needed to manage community activities, and keep your password and device secure.
        </Text>
        <View style={{ height: 1, backgroundColor: '#E3F0E4', marginVertical: 14 }} />
        <Text style={{ color: '#17351D', fontSize: 14, lineHeight: 21, fontWeight: '700', marginBottom: 6 }}>
          Protections implemented in the app
        </Text>
        <Text style={{ color: '#5f5a74', fontSize: 13, lineHeight: 21 }}>
          • Account passwords are stored as salted scrypt hashes, not as readable passwords.

• The mobile app encrypts locally stored session and selected settings data with AES; its encryption key is stored using the device’s secure Keychain/Keystore facility.

• The server encrypts selected sensitive fields, including contact details, using AES-256-GCM when the required server encryption key is configured.

• Server-side role checks restrict access to supported features and records. The default server connection uses HTTPS.
        </Text>
        <View style={{ height: 1, backgroundColor: '#E3F0E4', marginVertical: 14 }} />
        <Text style={{ color: '#17351D', fontSize: 14, lineHeight: 21, fontWeight: '700', marginBottom: 6 }}>
          Important limits
        </Text>
        <Text style={{ color: '#5f5a74', fontSize: 13, lineHeight: 21 }}>
          Not every database column is encrypted separately at the application layer. Full database-at-rest encryption and provider-level backup/snapshot encryption depend on the database host and must be verified in its settings. Keep ENCRYPTION_SECRET private and stable; without it, protected data and encrypted backups cannot be decrypted. Use the official server connection and sign out on shared devices.
        </Text>
      </Section>
      <Button
        title="Sign out"
        kind="danger"
        onPress={() =>
          showAppDialog('Sign out', 'Sign out of this device?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: onLogout },
          ])
        }
      />
      {pwOpen && <PasswordSheet save={save} onClose={() => setPwOpen(false)} />}
      {lockOpen && <LockSheet appLock={appLock} onAppLock={onAppLock} onClose={() => setLockOpen(false)} />}
    </View>
  );
}

function PasswordSheet({ save, onClose }: { save: ScreenProps['save']; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (next.length < 6) return setError('New password must be at least 6 characters');
    if (next !== again) return setError("The new passwords don't match");
    setBusy(true);
    const ok = await save({ action: 'changePassword', currentPassword: cur, newPassword: next }, 'Password changed — please sign in again');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="Change password">
      <Field label="Current password" value={cur} onChangeText={setCur} secureTextEntry />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry />
      <Field label="Repeat new password" value={again} onChangeText={setAgain} secureTextEntry />
      {!!error && <Text style={s.danger}>{error}</Text>}
      <Button title="Change password" onPress={submit} busy={busy} />
    </Sheet>
  );
}

function LockSheet({
  appLock,
  onAppLock,
  onClose,
}: {
  appLock: AppLockConfig;
  onAppLock: (c: AppLockConfig) => Promise<void>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [bio, setBio] = useState(appLock.mode === 'biometric');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    if (!isValidPin(pin)) return setError('PIN must be 4–6 digits');
    if (pin !== again) return setError("The PINs don't match");
    setBusy(true);
    try {
      let mode: 'pin' | 'biometric' = 'pin';
      if (bio && (await isBiometrySupported())) {
        await enableBiometricUnlock();
        mode = 'biometric';
      } else await disableBiometricUnlock();
      await onAppLock(makePinLock(pin, mode));
      onClose();
    } catch {
      setError('Could not save the app lock. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    await disableBiometricUnlock();
    await onAppLock(defaultAppLock);
    onClose();
  };
  return (
    <Sheet visible onClose={onClose} title="App lock">
      <Text style={s.muted}>The app asks for your PIN every time it is opened or comes back from the background.</Text>
      <Field
        label={appLock.mode === 'off' ? 'New PIN (4–6 digits)' : 'New PIN to replace the current one'}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
      />
      <Field label="Repeat PIN" value={again} onChangeText={setAgain} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <View style={[s.rowBetween, { marginTop: 12 }]}>
        <Text style={s.rowTitle}>Unlock with fingerprint / Face ID</Text>
        <Switch value={bio} onValueChange={setBio} trackColor={{ true: GREEN }} />
      </View>
      {!!error && <Text style={s.danger}>{error}</Text>}
      <Button title={appLock.mode === 'off' ? 'Turn on app lock' : 'Update app lock'} onPress={enable} busy={busy} />
      {appLock.mode !== 'off' && <Button title="Turn off app lock" kind="danger" onPress={disable} />}
    </Sheet>
  );
}
