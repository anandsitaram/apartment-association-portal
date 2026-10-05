import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import CryptoJS from 'crypto-js';

const KEYCHAIN_SERVICE_PREFIX = 'com.myapartment.mobile.secure.';
const LEGACY_MASTER_SERVICE = 'com.myapartment.mobile.masterkey';

function serviceFor(key: string): string {
  // Keychain service identifiers are opaque; avoid arbitrary caller characters.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return `${KEYCHAIN_SERVICE_PREFIX}${safe}`;
}

/** Store small secrets/settings directly in the OS Keychain/Android Keystore.
 * This avoids password-based AES-CBC without an authentication tag. */
export async function secureSetItem<T>(key: string, value: T): Promise<void> {
  const service = serviceFor(key);
  const saved = await Keychain.setGenericPassword('rv-value', JSON.stringify(value), {
    service,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
  });
  if (!saved) throw new Error('Could not securely store app data on this device.');
  await AsyncStorage.removeItem(key);
}

/** Read native secure storage first and migrate legacy CryptoJS values once. */
export async function secureGetItem<T>(key: string, fallback: T): Promise<T> {
  const service = serviceFor(key);
  const secure = await Keychain.getGenericPassword({ service });
  if (secure && secure.password) {
    try {
      return JSON.parse(secure.password) as T;
    } catch {
      return fallback;
    }
  }

  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const legacyKey = await Keychain.getGenericPassword({ service: LEGACY_MASTER_SERVICE });
    if (!legacyKey?.password) return fallback;
    const json = CryptoJS.AES.decrypt(raw, legacyKey.password).toString(CryptoJS.enc.Utf8);
    if (!json) return fallback;
    const value = JSON.parse(json) as T;
    await secureSetItem(key, value);
    return value;
  } catch {
    // Do not pretend corrupt ciphertext is a valid value; leave it available for
    // recovery and return the caller's safe default.
    return fallback;
  }
}

export async function secureRemoveItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  await Keychain.resetGenericPassword({ service: serviceFor(key) });
}
