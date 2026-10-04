// Face ID / fingerprint via react-native-keychain; dummy secret gated behind biometric accessControl.
// The PIN is always the fallback. PIN is stored salted+hashed, never in plain text.
import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';
import CryptoJS from 'crypto-js';
import { secureGetItem, secureSetItem } from './secureStorage';

const BIOMETRIC_SERVICE = 'com.rvfallon.mobile.applock.biometric';
const LOCK_KEY = 'rv_applock';

export type LockMode = 'off' | 'pin' | 'biometric';
export interface AppLockConfig {
  mode: LockMode;
  salt: string;
  hash: string;
}
export const defaultAppLock: AppLockConfig = { mode: 'off', salt: '', hash: '' };
export const isValidPin = (pin: string) => /^\d{4,6}$/.test(pin);

const hashPin = (pin: string, salt: string) => CryptoJS.PBKDF2(pin, salt, { keySize: 256 / 32, iterations: 5000 }).toString();
const randomSalt = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

export const makePinLock = (pin: string, mode: Exclude<LockMode, 'off'>): AppLockConfig => {
  const salt = randomSalt();
  return { mode, salt, hash: hashPin(pin, salt) };
};
export const checkPin = (cfg: AppLockConfig, pin: string) => !!cfg.hash && hashPin(pin, cfg.salt) === cfg.hash;

export const loadAppLock = () => secureGetItem<AppLockConfig>(LOCK_KEY, defaultAppLock);
export const saveAppLock = (cfg: AppLockConfig) => secureSetItem(LOCK_KEY, cfg);

export async function isBiometrySupported() {
  try {
    return !!(await Keychain.getSupportedBiometryType());
  } catch {
    return false;
  }
}
export async function enableBiometricUnlock() {
  await Keychain.setGenericPassword('applock', 'enabled', {
    service: BIOMETRIC_SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
  });
}
export async function disableBiometricUnlock() {
  try {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE });
  } catch {
    // no entry to clean up
  }
}
export async function verifyBiometricUnlock() {
  try {
    const r = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: { title: 'Unlock My Apartment', cancel: 'Use PIN instead' },
    });
    return !!r;
  } catch {
    return false;
  }
}
