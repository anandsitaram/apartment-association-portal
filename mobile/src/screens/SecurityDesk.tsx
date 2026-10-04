import React, { useState } from 'react';
import { PermissionsAndroid, Platform, Text, View } from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { launchCamera } from 'react-native-image-picker';
import { call, errText } from '../core/api';
import { Button, Field, Section, Badge } from '../components';
import type { ScreenProps } from './types';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

type Visitor = {
  id: number;
  code: string;
  visitor_name: string;
  flat: string;
  phone?: string;
  purpose?: string;
  expires_at: string;
};

export default function SecurityDesk({ token }: ScreenProps) {
  const [mode, setMode] = useState<'visitor' | 'parcel'>('visitor');
  const [parcelFlat, setParcelFlat] = useState('');
  const [parcelCourier, setParcelCourier] = useState('');
  const [parcelTracking, setParcelTracking] = useState('');
  const [parcelNotes, setParcelNotes] = useState('');
  const [parcelSent, setParcelSent] = useState(false);
  const [code, setCode] = useState('');
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [requestStatus, setRequestStatus] = useState<'pending' | 'approved' | 'rejected' | ''>('');
  const [photoData, setPhotoData] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  const lookup = async (rawCode = code) => {
    const normalized = rawCode.trim().replace(/^RVFALLON:/i, '');
    if (!/^\d{6}$/.test(normalized)) {
      setError(true);
      setMessage('Scan the visitor QR code or enter the 6-digit access code.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await call<{ visitor: Visitor }>({ action: 'lookupSecurityCode', code: normalized }, token);
      setVisitor(result.visitor);
      setCode(result.visitor.code);
      setPhotoData('');
      setRequestId(null);
      setRequestStatus('');
      setScanning(false);
      setError(false);
      setMessage('Access code verified. Capture a visitor photo and send it to the flat owner for approval.');
    } catch (e) {
      setVisitor(null);
      setError(true);
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const capturePhoto = async () => {
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
          title: 'Allow camera access',
          message: 'My Apartment needs camera access to capture visitor and parcel photos.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        });
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setError(true);
          setMessage('Camera permission is required. Enable Camera in your phone Settings and try again.');
          return;
        }
      }
      const result = await launchCamera({
        mediaType: 'photo',
        cameraType: 'back',
        includeBase64: true,
        maxWidth: 960,
        maxHeight: 960,
        quality: 0.35,
        saveToPhotos: false,
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        setError(true);
        setMessage(result.errorMessage || 'Could not open the camera.');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        setError(true);
        setMessage('No photo was captured. Please try again.');
        return;
      }
      const mime = asset.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const data = `data:${mime};base64,${asset.base64}`;
      if (data.length > 750_000) {
        setError(true);
        setMessage('Photo is too large. Retake it closer to the visitor or reduce the camera resolution.');
        return;
      }
      setPhotoData(data);
      setError(false);
      setMessage(mode === 'parcel' ? 'Parcel photo captured. Send the parcel notice to the flat owner.' : 'Photo captured. Send it to the flat owner for approval.');
    } catch (e) {
      setError(true);
      setMessage(errText(e));
    }
  };

  const submitParcel = async () => {
    if (!parcelFlat.trim() || !photoData) {
      setError(true);
      setMessage('Enter the destination flat and capture a parcel photo first.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await call<{ notice: { id: number; status: 'pending' | 'collected' } }>({ action: 'createParcelNotice', flat: parcelFlat.trim(), courier: parcelCourier.trim(), trackingNumber: parcelTracking.trim(), notes: parcelNotes.trim(), photoData }, token);
      setPhotoData('');
      setParcelSent(true);
      setError(false);
      setMessage(`Parcel notice #${result.notice.id} sent to flat ${parcelFlat}.`);
      showAppDialog('Parcel notice sent', `Flat ${parcelFlat} has been notified about the parcel.`);
      setParcelCourier(''); setParcelTracking(''); setParcelNotes('');
    } catch (e) { setError(true); setMessage(errText(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!visitor || !photoData) {
      setError(true);
      setMessage('Verify an access code and capture a photo first.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await call<{ request: { id: number; status: 'pending' | 'approved' | 'rejected' } }>({ action: 'createVisitorPhotoRequest', accessCodeId: visitor.id, photoData }, token);
      setRequestId(result.request.id);
      setRequestStatus(result.request.status);
      setPhotoData('');
      setError(false);
      setMessage('Visitor photo submitted. Waiting for the flat owner. Use Check approval status before allowing entry.');
      showAppDialog('Sent for approval', `Visitor photo for flat ${visitor.flat} has been sent to the flat owner. Entry remains pending until approved.`);
    } catch (e) {
      setError(true);
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const checkApproval = async () => {
    if (!requestId) return;
    setBusy(true);
    try {
      const result = await call<{ request: { status: 'pending' | 'approved' | 'rejected'; review_note?: string } }>({ action: 'getVisitorPhotoRequestStatus', id: requestId }, token);
      setRequestStatus(result.request.status);
      if (result.request.status === 'approved') {
        setError(false);
        setMessage('Approved by the flat owner. Entry may be allowed.');
      } else if (result.request.status === 'rejected') {
        setError(true);
        setMessage(`Rejected by the flat owner.${result.request.review_note ? ` ${result.request.review_note}` : ''} Do not allow entry.`);
      } else {
        setError(false);
        setMessage('Still pending. Do not allow entry until the owner approves.');
      }
    } catch (e) {
      setError(true);
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleScanner = async () => {
    if (scanning) {
      setScanning(false);
      return;
    }
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Allow camera access',
        message: 'My Apartment needs camera access to scan visitor QR codes.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      });
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setError(true);
        setMessage('Camera permission is required to scan visitor QR codes. Enable Camera in phone Settings and try again.');
        return;
      }
    }
    setError(false);
    setMessage('');
    setScanning(true);
  };

  const onScan = (event: any) => {
    const scanned = String(event?.nativeEvent?.codeStringValue || '').trim();
    if (!scanned) return;
    const normalized = scanned.replace(/^RVFALLON:/i, '');
    if (!/^\d{6}$/.test(normalized)) {
      setError(true);
      setMessage('This QR code is not a valid My Apartment visitor access code.');
      setScanning(false);
      return;
    }
    setCode(normalized);
    void lookup(normalized);
  };

  return (
    <View>
      <Section title="Security desk">
        <Text style={s.muted}>Choose whether you are checking a visitor or recording a parcel delivery.</Text>
        <View style={{ marginTop: 8, gap: 2, alignItems: 'stretch' }}>
          <Button title={mode === 'visitor' ? '✓  Visitor access' : 'Visitor access'} onPress={() => { setMode('visitor'); setPhotoData(''); setMessage(''); setError(false); }} kind={mode === 'visitor' ? 'primary' : 'secondary'} />
          <Button title={mode === 'parcel' ? '✓  Parcel notice' : 'Parcel notice'} onPress={() => { setMode('parcel'); setVisitor(null); setPhotoData(''); setMessage(''); setError(false); setScanning(false); }} kind={mode === 'parcel' ? 'primary' : 'secondary'} />
        </View>
      </Section>
      {mode === 'visitor' && <Section title="Scan visitor QR code">
        <Text style={s.muted}>Scan the QR code shared by a resident, or enter the 6-digit code manually. Verify the visitor, take a photo, and send it to the flat owner. Entry remains pending until the owner approves.</Text>
        <View style={[s.rowWrap, { marginTop: 10 }]}>
          <Button title={scanning ? 'Close scanner' : 'Scan QR code'} onPress={() => void toggleScanner()} kind="secondary" fullWidth={false} />
        </View>
        {scanning && (
          <View style={{ height: 300, overflow: 'hidden', borderRadius: 12, marginTop: 12 }}>
            <Camera
              style={{ flex: 1, width: '100%' }}
              scanBarcode
              onReadCode={onScan}
              showFrame
              laserColor="#2E7D32"
              frameColor="#ffffff"
            />
          </View>
        )}
        <Field
          label="6-digit access code"
          value={code}
          onChangeText={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)); setVisitor(null); setPhotoData(''); }}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          textContentType="oneTimeCode"
        />
        <Button title="Verify access code" onPress={() => void lookup()} busy={busy} disabled={code.length !== 6} />
      </Section>}

      {mode === 'parcel' && (
        <Section title="Record parcel delivery">
          <Text style={s.muted}>Take a photo of the parcel or delivery label. The flat owner will receive a notice and can mark it collected.</Text>
          <Field label="Destination flat *" value={parcelFlat} onChangeText={setParcelFlat} placeholder="e.g. 101" />
          <Field label="Courier / delivery company" value={parcelCourier} onChangeText={setParcelCourier} placeholder="e.g. Amazon, Blue Dart, India Post" />
          <Field label="Tracking / reference number" value={parcelTracking} onChangeText={setParcelTracking} placeholder="Optional tracking number" />
          <Field label="Notes" value={parcelNotes} onChangeText={setParcelNotes} placeholder="Package location, recipient name, etc." />
          <Button title={photoData ? 'Retake parcel photo' : 'Take parcel photo'} onPress={() => void capturePhoto()} kind="secondary" />
          {!!photoData && <Text style={s.ok}>Parcel photo captured and ready to send.</Text>}
          <Button title="Notify flat owner" onPress={() => void submitParcel()} busy={busy} disabled={!parcelFlat.trim() || !photoData} />
          {parcelSent && <Text style={s.ok}>Parcel notice submitted. You can record another parcel below.</Text>}
        </Section>
      )}

      {mode === 'visitor' && visitor && (
        <Section title="Visitor details">
          <View style={s.rowBetween}><Text style={s.rowTitle}>{visitor.visitor_name}</Text><Badge text="Pending owner approval" tone="warn" /></View>
          <Text style={s.muted}>Flat {visitor.flat} · {visitor.purpose || 'Visitor'}</Text>
          {!!visitor.phone && <Text style={s.muted}>Phone: {visitor.phone}</Text>}
          <Text style={s.small}>Code expires {new Date(visitor.expires_at).toLocaleString()}</Text>
          <Button title={photoData ? 'Retake visitor photo' : 'Take visitor photo'} onPress={() => void capturePhoto()} kind="secondary" />
          {!!photoData && <Text style={s.ok}>Photo captured and ready to send.</Text>}
          <Button title="Send photo to flat owner" onPress={() => void submit()} busy={busy} disabled={!photoData} />
        </Section>
      )}
      {mode === 'visitor' && requestId !== null && (
        <Section title="Owner approval status">
          <View style={s.rowBetween}><Text style={s.rowTitle}>Request #{requestId}</Text><Badge text={requestStatus || 'pending'} tone={requestStatus === 'approved' ? 'ok' : requestStatus === 'rejected' ? 'bad' : 'warn'} /></View>
          <Button title="Check approval status" onPress={() => void checkApproval()} busy={busy} kind="secondary" />
          {requestStatus === 'approved' && <Text style={s.ok}>Owner approved. You may allow entry.</Text>}
          {requestStatus === 'rejected' && <Text style={s.danger}>Owner rejected. Do not allow entry.</Text>}
        </Section>
      )}
      {!!message && <Text style={error ? s.danger : s.ok}>{message}</Text>}
    </View>
  );
}
