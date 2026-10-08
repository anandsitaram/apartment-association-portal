import React, { useCallback, useEffect, useState } from 'react';
import { Image, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { call, errText } from '../core/api';
import type { ScreenProps } from './types';
import { Badge, Button, Chip, EmptyState, Field, Section, SmallButton } from '../components';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

type PhotoRequest = {
  id: number;
  visitor_name: string;
  flat: string;
  purpose: string;
  phone?: string;
  photo_data: string;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string;
};
type ParcelNotice = {
  id: number;
  flat: string;
  courier: string;
  tracking_number: string;
  notes: string;
  photo_data: string;
  status: 'pending' | 'collected';
  created_by: string;
  created_at: string;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
};
type CodeRow = {
  id: number;
  code: string;
  visitor_name: string;
  flat: string;
  phone: string;
  purpose: string;
  visit_at?: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
};
export default function VisitorAccess({
  token,
  data,
  flat: userFlat,
  parcelNoticeId,
  onClearParcelNotice,
}: ScreenProps & { parcelNoticeId?: number | null; onClearParcelNotice?: () => void }) {
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [photoRequests, setPhotoRequests] = useState<PhotoRequest[]>([]);
  const [parcelNotices, setParcelNotices] = useState<ParcelNotice[]>([]);
  const [viewingParcelId, setViewingParcelId] = useState<number | null>(parcelNoticeId ?? null);
  const [parcelUnavailable, setParcelUnavailable] = useState(false);

  useEffect(() => {
    if (parcelNoticeId != null) {
      setParcelUnavailable(false);
      setViewingParcelId(parcelNoticeId);
    }
  }, [parcelNoticeId]);

  // A notification contains a parcel ID. Resolve that ID directly from the
  // server instead of depending on the separately loaded list/cache. This
  // prevents a valid notification from opening an empty detail view.
  useEffect(() => {
    if (viewingParcelId == null) return;
    let active = true;
    void call<{ notice: ParcelNotice }>({ action: 'getParcelNotice', id: viewingParcelId }, token)
      .then((result) => {
        if (!active) return;
        setParcelUnavailable(false);
        setParcelNotices((current) => [result.notice, ...current.filter((notice) => notice.id !== result.notice.id)]);
      })
      .catch(() => {
        if (!active) return;
        setParcelNotices((current) => current.filter((notice) => notice.id !== viewingParcelId));
        setParcelUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [viewingParcelId, token]);
  const [selectedQr, setSelectedQr] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [selectedFlat, setSelectedFlat] = useState(userFlat ?? '');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('Visitor');
  const [visitAt, setVisitAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await call<{ codes?: CodeRow[] }>({ action: 'listMySecurityCodes' }, token);
      setRows(r.codes ?? []);
      const approvals = await call<{ requests?: PhotoRequest[] }>({ action: 'listVisitorPhotoRequests' }, token);
      setPhotoRequests(approvals.requests ?? []);
      const parcels = await call<{ notices?: ParcelNotice[] }>({ action: 'listParcelNotices' }, token);
      setParcelNotices(parcels.notices ?? []);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedFlat || !data.flats.length) return;
    const target = userFlat ?? data.flats[0]?.flat;
    if (!target) return;
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const req = norm(target);
    const match = data.flats.find((f) => norm(f.flat) === req) || data.flats.find((f) => norm(f.flat).startsWith(req));
    if (match) setSelectedFlat(match.flat);
    else setSelectedFlat(target);
  }, [userFlat, data.flats, selectedFlat]);

  const create = async () => {
    if (!visitorName.trim() || !selectedFlat.trim()) {
      setError('Enter a visitor name and a flat number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await call<{ code: CodeRow }>(
        {
          action: 'createSecurityCode',
          visitorName: visitorName.trim(),
          flat: selectedFlat.trim(),
          phone: phone.trim(),
          purpose: purpose.trim() || 'Visitor',
          visitAt: visitAt.trim(),
        },
        token,
      );
      setVisitorName('');
      setSelectedQr(r.code.code);
      setPhone('');
      setPurpose('Visitor');
      setVisitAt('');
      showAppDialog('Visitor code created', `Access code: ${r.code.code}\nExpires: ${new Date(r.code.expires_at).toLocaleString()}`, [
        {
          text: 'Share details',
          onPress: () =>
            void Share.share({
              message: `My Apartment visitor access\nVisitor: ${r.code.visitor_name}\nFlat: ${r.code.flat}\nPurpose: ${r.code.purpose}\nAccess code: ${r.code.code}\nExpires: ${new Date(r.code.expires_at).toLocaleString()}`,
            }),
        },
        { text: 'Done' },
      ]);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const reviewRequest = async (row: PhotoRequest, status: 'approved' | 'rejected') => {
    const actionLabel = status === 'approved' ? 'Approve entry' : 'Reject entry';
    showAppDialog(`${actionLabel}?`, `${status === 'approved' ? 'Allow' : 'Deny'} access for ${row.visitor_name} to flat ${row.flat}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: actionLabel,
        style: status === 'rejected' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await call({ action: 'reviewVisitorPhotoRequest', id: row.id, status }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);
  };

  const markParcelCollected = (notice: ParcelNotice) =>
    showAppDialog('Mark parcel as collected?', `Confirm that the parcel for flat ${notice.flat} has been collected.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark collected',
        onPress: async () => {
          try {
            await call({ action: 'acknowledgeParcelNotice', id: notice.id }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);

  const deleteParcelPhoto = (notice: ParcelNotice) =>
    showAppDialog('Delete parcel photo?', `Remove the parcel photo for flat ${notice.flat}? The parcel notice will remain available.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete photo',
        style: 'destructive',
        onPress: async () => {
          try {
            await call({ action: 'deleteParcelPhoto', id: notice.id }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);

  const deleteParcel = (notice: ParcelNotice) =>
    showAppDialog(
      'Delete parcel notice?',
      `Remove the parcel notice for flat ${notice.flat}? This also removes it from your parcel list and prevents the notification from reopening it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete parcel',
          style: 'destructive',
          onPress: async () => {
            try {
              await call({ action: 'deleteParcelNotice', id: notice.id }, token);
              setParcelNotices((current) => current.filter((row) => row.id !== notice.id));
              if (viewingParcelId === notice.id) {
                setViewingParcelId(null);
                setParcelUnavailable(false);
                onClearParcelNotice?.();
              }
            } catch (e) {
              setError(errText(e));
            }
          },
        },
      ],
    );

  const remove = (row: CodeRow) =>
    showAppDialog('Delete visitor code?', `Remove code ${row.code} for ${row.visitor_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await call({ action: 'deleteMySecurityCode', id: row.id }, token);
            await load();
          } catch (e) {
            setError(errText(e));
          }
        },
      },
    ]);

  const selectedParcel = viewingParcelId == null ? null : (parcelNotices.find((notice) => notice.id === viewingParcelId) ?? null);
  if (viewingParcelId != null) {
    return (
      <View>
        <Section title="Parcel details">
          <Button
            title="Back to Visitor / Parcel list"
            kind="secondary"
            onPress={() => {
              setViewingParcelId(null);
              onClearParcelNotice?.();
            }}
          />
          {!selectedParcel ? (
            <EmptyState
              text={parcelUnavailable ? 'This parcel is no longer available. It may have been deleted.' : 'Loading parcel details…'}
            />
          ) : (
            <View style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>Parcel for flat {selectedParcel.flat}</Text>
                <Badge
                  text={selectedParcel.status === 'collected' ? 'collected' : 'awaiting collection'}
                  tone={selectedParcel.status === 'collected' ? 'ok' : 'warn'}
                />
              </View>
              <Text style={s.muted}>
                {selectedParcel.courier || 'Courier not specified'}
                {selectedParcel.tracking_number ? ` · ${selectedParcel.tracking_number}` : ''}
              </Text>
              <Text style={s.small}>Received by security: {new Date(selectedParcel.created_at).toLocaleString()}</Text>
              {!!selectedParcel.notes && <Text style={s.muted}>Notes: {selectedParcel.notes}</Text>}
              {!!selectedParcel.photo_data ? (
                <Image
                  source={{ uri: selectedParcel.photo_data }}
                  resizeMode="contain"
                  style={{ width: '100%', height: 300, borderRadius: 10, backgroundColor: '#f3f4f6', marginTop: 8 }}
                />
              ) : (
                <Text style={s.small}>Parcel photo removed.</Text>
              )}
              <View style={[s.rowWrap, { marginTop: 12 }]}>
                {selectedParcel.status === 'pending' ? (
                  <Button title="Mark as collected" onPress={() => markParcelCollected(selectedParcel)} />
                ) : (
                  <Text style={s.small}>
                    Collected {selectedParcel.acknowledged_at ? new Date(selectedParcel.acknowledged_at).toLocaleString() : ''}
                  </Text>
                )}
                {!!selectedParcel.photo_data && (
                  <Button title="Delete photo" kind="secondary" onPress={() => deleteParcelPhoto(selectedParcel)} />
                )}
                <Button title="Delete parcel" kind="secondary" onPress={() => deleteParcel(selectedParcel)} />
              </View>
            </View>
          )}
        </Section>
      </View>
    );
  }

  const availableFlats = data.flats.filter(
    (f) => !userFlat || f.flat === userFlat || ['admin', 'super', 'superadmin'].includes(data.me?.role ?? ''),
  );

  return (
    <View>
      <Section title="Create visitor access code">
        <Text style={s.muted}>
          Create a one-time code for a visitor. Security will verify the code when they arrive. Codes expire after 24 hours.
        </Text>
        <Field
          label="Visitor name *"
          value={visitorName}
          onChangeText={setVisitorName}
          maxLength={100}
          placeholder="Visitor or delivery person"
        />
        <Field label="Flat number *" value={selectedFlat} onChangeText={setSelectedFlat} placeholder="e.g. 101 or A-101" />
        {availableFlats.length > 0 && availableFlats.length <= 20 && (
          <View style={[s.rowWrap, { marginTop: 6 }]}>
            {availableFlats.map((f) => (
              <Chip key={f.flat} label={f.flat} active={selectedFlat === f.flat} onPress={() => setSelectedFlat(f.flat)} />
            ))}
          </View>
        )}
        <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Purpose" value={purpose} onChangeText={setPurpose} placeholder="Visitor, delivery, cab…" />
        <Field label="Expected visit (optional)" value={visitAt} onChangeText={setVisitAt} placeholder="YYYY-MM-DD HH:mm" />
        {!!error && <Text style={s.danger}>{error}</Text>}
        <Button title="Create access code" onPress={() => void create()} busy={busy} />
      </Section>
      {!!selectedQr && (
        <Section title="Visitor QR code">
          <Text style={s.muted}>Show this QR code to security at the entrance. It contains only the one-time access code.</Text>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <QRCode value={selectedQr} size={190} backgroundColor="#ffffff" color="#111827" />
          </View>
          <Text style={[s.rowTitle, { textAlign: 'center' }]}>{selectedQr}</Text>
          <Button title="Hide QR code" kind="secondary" onPress={() => setSelectedQr('')} />
        </Section>
      )}
      <Section
        title={`Parcel notices (${parcelNotices.filter((n) => n.status === 'pending').length} awaiting collection)`}
        right={<SmallButton title="Refresh" onPress={() => void load()} />}
      >
        {!parcelNotices.length ? (
          <EmptyState text="No parcel notices for your flat." />
        ) : (
          parcelNotices.map((notice) => (
            <View key={notice.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>Parcel for flat {notice.flat}</Text>
                <Badge
                  text={notice.status === 'collected' ? 'collected' : 'awaiting collection'}
                  tone={notice.status === 'collected' ? 'ok' : 'warn'}
                />
              </View>
              <Text style={s.muted}>
                {notice.courier || 'Courier not specified'}
                {notice.tracking_number ? ` · ${notice.tracking_number}` : ''}
              </Text>
              <Text style={s.small}>Received by security: {new Date(notice.created_at).toLocaleString()}</Text>
              {!!notice.notes && <Text style={s.muted}>Notes: {notice.notes}</Text>}
              {!!notice.photo_data ? (
                <Image
                  source={{ uri: notice.photo_data }}
                  resizeMode="contain"
                  style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: '#f3f4f6', marginTop: 8 }}
                />
              ) : (
                <Text style={s.small}>Parcel photo removed.</Text>
              )}
              <View style={[s.rowWrap, { marginTop: 8 }]}>
                {notice.status === 'pending' ? (
                  <SmallButton title="Mark as collected" onPress={() => markParcelCollected(notice)} />
                ) : (
                  <Text style={s.small}>Collected {notice.acknowledged_at ? new Date(notice.acknowledged_at).toLocaleString() : ''}</Text>
                )}
                {!!notice.photo_data && <SmallButton title="Delete photo" danger onPress={() => deleteParcelPhoto(notice)} />}
                <SmallButton title="Delete parcel" danger onPress={() => deleteParcel(notice)} />
              </View>
            </View>
          ))
        )}
      </Section>
      <Section
        title={`Visitor photo approvals (${photoRequests.filter((r) => r.status === 'pending').length} pending`}
        right={<SmallButton title="Refresh" onPress={() => void load()} />}
      >
        {!photoRequests.length ? (
          <EmptyState text="No visitor photo requests for your flat." />
        ) : (
          photoRequests.map((request) => (
            <View key={request.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>
                  {request.visitor_name} · Flat {request.flat}
                </Text>
                <Badge text={request.status} tone={request.status === 'approved' ? 'ok' : request.status === 'rejected' ? 'bad' : 'warn'} />
              </View>
              <Text style={s.muted}>
                {request.purpose || 'Visitor'} · Submitted {new Date(request.created_at).toLocaleString()}
              </Text>
              <Image
                source={{ uri: request.photo_data }}
                resizeMode="contain"
                style={{ width: '100%', height: 240, borderRadius: 10, backgroundColor: '#f3f4f6', marginTop: 8 }}
              />
              {!!request.review_note && <Text style={s.muted}>Note: {request.review_note}</Text>}
              {request.status === 'pending' && (
                <View style={[s.rowWrap, { marginTop: 8 }]}>
                  <SmallButton title="Approve" onPress={() => reviewRequest(request, 'approved')} />
                  <SmallButton title="Reject" danger onPress={() => reviewRequest(request, 'rejected')} />
                </View>
              )}
            </View>
          ))
        )}
      </Section>
      <Section title="My visitor codes" right={<SmallButton title="Refresh" onPress={() => void load()} />}>
        {!rows.length ? (
          <EmptyState text="No visitor codes found." />
        ) : (
          rows.map((row) => (
            <View key={row.id} style={s.listRow}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>
                  {row.visitor_name || 'Visitor'} · {row.code}
                </Text>
                <Badge
                  text={row.status}
                  tone={row.status === 'accepted' ? 'ok' : row.status === 'expired' || row.status === 'rejected' ? 'bad' : 'warn'}
                />
              </View>
              <Text style={s.muted}>
                Flat {row.flat} · {row.purpose || 'Visitor'}
              </Text>
              <Text style={s.small}>Expires {new Date(row.expires_at).toLocaleString()}</Text>
              <View style={[s.rowWrap, { marginTop: 6 }]}>
                <SmallButton title="Show QR" onPress={() => setSelectedQr(row.code)} />
                <SmallButton
                  title="Share"
                  onPress={() =>
                    void Share.share({
                      message: `My Apartment visitor access\nVisitor: ${row.visitor_name}\nFlat: ${row.flat}\nPurpose: ${row.purpose}\nAccess code: ${row.code}\nExpires: ${new Date(row.expires_at).toLocaleString()}`,
                    })
                  }
                />
                <SmallButton title="Delete" danger onPress={() => remove(row)} />
              </View>
            </View>
          ))
        )}
      </Section>
    </View>
  );
}
