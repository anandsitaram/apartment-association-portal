import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Button, EmptyState, Field, Section, SmallButton } from '../components';
import type { ScreenProps } from './types';
import s from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one flat record.');
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  if (!headers.includes('flat')) throw new Error('CSV header must include a flat column.');
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = (values[index] ?? '').trim();
      const key = header === 'corpexcluded' ? 'corpExcluded' : header;
      if (['flat', 'name', 'type', 'bua', 'uds', 'phone', 'email', 'excluded', 'corpExcluded'].includes(key)) record[key] = value;
    });
    return record;
  });
}

export default function Flats({ data, admin, save }: ScreenProps) {
  const [q, setQ] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importMode, setImportMode] = useState<'create' | 'update'>('create');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const needle = q.trim().toLowerCase();
  const list = data.flats.filter((f) => !needle || f.flat.toLowerCase().includes(needle) || (f.name || '').toLowerCase().includes(needle));
  const beginEdit = (f: any) => {
    setEditing({ ...f });
    setEditError('');
  };
  const saveFlat = async () => {
    if (!editing) return;
    const bua = Number(editing.bua),
      uds = Number(editing.uds || 0),
      sl = Number(editing.sl || 0);
    if (!Number.isFinite(bua) || bua <= 0 || !Number.isFinite(uds) || uds < 0 || !Number.isInteger(sl) || sl < 0) {
      setEditError('SL must be a whole number, BUA must be greater than 0, and UDS must be 0 or more.');
      return;
    }
    setEditBusy(true);
    setEditError('');
    const ok = await save(
      {
        action: 'saveFlat',
        flat: editing.flat,
        sl,
        name: editing.name || '',
        type: editing.type || '',
        bua,
        uds,
        phone: editing.phone || '',
        email: editing.email || '',
        excluded: !!editing.excluded,
        corpExcluded: !!editing.corp_excluded,
      },
      `Saved flat ${editing.flat}`,
    );
    setEditBusy(false);
    if (ok) setEditing(null);
    else setEditError('Could not save flat. Check the message and try again.');
  };
  const exportFlatExcel = async () => {
    if (!admin || exportBusy) return;
    setExportBusy(true);
    try {
      const headers = ['flat', 'name', 'type', 'bua', 'uds', 'phone', 'email', 'excluded', 'corpexcluded'];
      const rows = [headers, ...[...data.flats].sort((a, b) => a.flat.localeCompare(b.flat, undefined, { numeric: true })).map((f) => [
        f.flat, f.name || '', f.type || '', f.bua, f.uds, f.phone || '', f.email || '', f.excluded ? 'TRUE' : 'FALSE', f.corp_excluded ? 'TRUE' : 'FALSE',
      ])];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Flat Master');
      const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const path = `${RNFS.CachesDirectoryPath}/my-apartment-flat-master-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await RNFS.writeFile(path, base64, 'base64');
      await Share.open({ title: 'My Apartment flat master Excel', url: `file://${path}`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `my-apartment-flat-master-${new Date().toISOString().slice(0, 10)}.xlsx`, failOnCancel: false });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not create or share the Excel workbook.');
    } finally {
      setExportBusy(false);
    }
  };

  const importFlats = () => {
    let rows: any[];
    try {
      const source = importJson.trim();
      if (source.startsWith('[') || source.startsWith('{')) {
        const parsed = JSON.parse(source);
        rows = Array.isArray(parsed) ? parsed : parsed.rows;
      } else {
        rows = parseCsv(source);
      }
      if (!Array.isArray(rows) || !rows.length) throw new Error('Provide a JSON array or CSV with flat data.');
      if (rows.length > 500) throw new Error('Import is limited to 500 rows at a time.');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Invalid CSV or JSON.');
      return;
    }
    if (rows.some((r) => !r || typeof r !== 'object' || !String(r.flat ?? '').trim())) {
      setImportError('Every row must be an object with a flat field.');
      return;
    }
    showAppDialog(
      'Import flat data?',
      `${rows.length} row(s) will be sent in ${importMode} mode. Review the CSV/JSON data carefully before continuing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => {
            void (async () => {
              setImportBusy(true);
              setImportError('');
              const ok = await save({ action: 'importFlats', rows, mode: importMode }, `Flat data import submitted (${rows.length} rows)`);
              setImportBusy(false);
              if (ok) setImportJson('');
              else setImportError('Import failed. Check the error message and correct the rows.');
            })();
          },
        },
      ],
    );
  };
  return (
    <View>
      <Field label="Search flat or owner" value={q} onChangeText={setQ} />
      <Section title={`Flats (${list.length})`}>
        {list.length === 0 && <EmptyState text="No flats match." />}
        {list.map((f) => (
          <View key={f.flat} style={s.listRow}>
            <View style={s.rowBetween}>
              <Text style={s.rowTitle}>
                Flat {f.flat}
                {f.name ? ` · ${f.name}` : ''}
              </Text>
              <View style={s.rowWrap}>
                {!!f.phone && <SmallButton title="Call" onPress={() => Linking.openURL(`tel:${f.phone}`)} />}
                {admin && <SmallButton title="Edit" onPress={() => beginEdit(f)} />}
              </View>
            </View>
            <Text style={s.small}>
              {f.type || '—'} · {f.bua} sq ft · UDS {f.uds}
              {f.excluded ? ' · maint. excluded' : ''}
              {f.corp_excluded ? ' · corp excluded' : ''}
            </Text>
            {!!f.email && <Text style={s.small}>{f.email}</Text>}
          </View>
        ))}
      </Section>
      {admin && editing && (
        <Section title={`Edit flat ${editing.flat}`}>
          <Field
            label="SL number"
            value={String(editing.sl ?? 0)}
            onChangeText={(v) => setEditing({ ...editing, sl: v })}
            keyboardType="number-pad"
          />
          <Field
            label="Owner / resident name"
            value={String(editing.name ?? '')}
            onChangeText={(v) => setEditing({ ...editing, name: v })}
          />
          <Field label="Type" value={String(editing.type ?? '')} onChangeText={(v) => setEditing({ ...editing, type: v })} />
          <Field
            label="Built-up area (sq ft)"
            value={String(editing.bua ?? '')}
            onChangeText={(v) => setEditing({ ...editing, bua: v })}
            keyboardType="decimal-pad"
          />
          <Field
            label="UDS"
            value={String(editing.uds ?? 0)}
            onChangeText={(v) => setEditing({ ...editing, uds: v })}
            keyboardType="decimal-pad"
          />
          <Field
            label="Phone"
            value={String(editing.phone ?? '')}
            onChangeText={(v) => setEditing({ ...editing, phone: v })}
            keyboardType="phone-pad"
          />
          <Field
            label="Email"
            value={String(editing.email ?? '')}
            onChangeText={(v) => setEditing({ ...editing, email: v })}
            keyboardType="email-address"
          />
          <View style={s.rowWrap}>
            <Button
              title={`Maintenance ${editing.excluded ? 'excluded' : 'included'}`}
              kind={editing.excluded ? 'primary' : 'secondary'}
              onPress={() => setEditing({ ...editing, excluded: !editing.excluded })}
              fullWidth={false}
            />
            <Button
              title={`Corp fund ${editing.corp_excluded ? 'excluded' : 'included'}`}
              kind={editing.corp_excluded ? 'primary' : 'secondary'}
              onPress={() => setEditing({ ...editing, corp_excluded: !editing.corp_excluded })}
              fullWidth={false}
            />
          </View>
          {!!editError && <Text style={s.danger}>{editError}</Text>}
          <View style={s.rowWrap}>
            <Button title="Save flat changes" onPress={() => void saveFlat()} busy={editBusy} fullWidth={false} />
            <Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} fullWidth={false} />
          </View>
        </Section>
      )}
      {admin && (
        <Section title="Flat data import & export">
          <Text style={s.muted}>
            Export flat master records for Excel, or paste CSV/JSON records to import. Create mode requires flat and bua; update mode matches flat and leaves blank fields unchanged. Maximum 500 rows. Login accounts are managed separately.
          </Text>
          <Button title={exportBusy ? 'Preparing export…' : 'Export flats to Excel (.xlsx)'} kind="secondary" onPress={() => void exportFlatExcel()} busy={exportBusy} />
          <Text style={s.small}>For import, use CSV or JSON headers: flat, name, type, bua, uds, phone, email, excluded, corpexcluded. Excel exports contain owner contact details, so share them only with authorized people.</Text>
          <View style={s.rowWrap}>
            <Button
              title="Create new flats"
              kind={importMode === 'create' ? 'primary' : 'secondary'}
              onPress={() => setImportMode('create')}
              fullWidth={false}
            />
            <Button
              title="Update existing"
              kind={importMode === 'update' ? 'primary' : 'secondary'}
              onPress={() => setImportMode('update')}
              fullWidth={false}
            />
          </View>
          <Field
            label="Flat records CSV or JSON"
            value={importJson}
            onChangeText={setImportJson}
            multiline
            numberOfLines={7}
            textAlignVertical="top"
            placeholder={'flat,name,type,bua,uds,phone,email,excluded,corpexcluded\nA-101,Resident,N,1200,300,9876543210,resident@example.com,FALSE,FALSE'}
          />
          <Text style={s.small}>
            Paste CSV rows or a JSON array. Create mode skips existing flats. Update mode changes matching records; blank fields remain unchanged.
          </Text>
          {!!importError && <Text style={s.danger}>{importError}</Text>}
          <Button title="Import flat records (CSV / JSON)" onPress={importFlats} busy={importBusy} disabled={!importJson.trim()} />
        </Section>
      )}
    </View>
  );
}
