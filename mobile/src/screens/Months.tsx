import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { Badge, Button, Chip, EmptyState, Field, Section, Sheet, SmallButton, Stat } from '../components';
import { FlatDues, flatDues, monthTotals } from '../../../shared/dues';
import { STATUS_LABEL, STATUS_TONE } from '../core/status';
import { createMonthlyWorkbook } from '../core/monthlyWorkbook';
import { inr, inr0, isDateKey, monthLabel, todayKey } from '../../../shared/format';
import {
  allocateTotal,
  billingOf,
  calcText,
  corpOf,
  dueDateText,
  isDueDatePassed,
  maintOf,
  splitOf,
  total,
  vsum,
} from '../../../shared/lib';
import { call, errText } from '../core/api';
import type { Expense, Flat, Month, Payment } from '../../../shared/types';
import type { ScreenProps } from './types';
import s, { BAD, MUTED, OK, GREEN, WARN } from '../styles/styles';
import { showAppDialog } from '../core/appDialog';

const MODES = ['UPI', 'Bank', 'Cash', 'Cheque'];

export default function Months({
  data,
  admin,
  superAdmin,
  save,
  token,
  month: selected,
  onSelectMonth,
}: ScreenProps & { month: string; onSelectMonth: (m: string) => void }) {
  const month = data.months.find((m) => m.month === selected) ?? data.months[data.months.length - 1];
  const [editing, setEditing] = useState<Flat | null>(null);
  const [filter, setFilter] = useState<'all' | 'due'>('all');
  const [editingCalculation, setEditingCalculation] = useState(false);
  const [calcMethod, setCalcMethod] = useState<Month['method']>(month?.method || 'divide');
  const [calcValue, setCalcValue] = useState(String(month?.value ?? data.flats.length));
  const [calcRounding, setCalcRounding] = useState<NonNullable<Month['rounding']>>(month?.rounding || 'none');
  const [corpApplicable, setCorpApplicable] = useState(month?.corp_applicable === true);
  const [mergeMaintenanceCorp, setMergeMaintenanceCorp] = useState(month?.notes?.mergeMaintenanceCorp === true);
  const [corpMethod, setCorpMethod] = useState<'sqft' | 'common'>(month?.corp_method || 'sqft');
  const [corpRate, setCorpRate] = useState(String(month?.corp_value ?? month?.corp_rate ?? 0.5));
  const [corp2Bhk, setCorp2Bhk] = useState(String(month?.corp_2bhk ?? ''));
  const [corp3Bhk, setCorp3Bhk] = useState(String(month?.corp_3bhk ?? ''));
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [corpRounding, setCorpRounding] = useState<NonNullable<Month['corp_rounding']>>(month?.corp_rounding || 'nearest');
  const [reminding, setReminding] = useState(false);
  const [expandedCarry, setExpandedCarry] = useState(false);
  const [receiptFlat, setReceiptFlat] = useState<{ flat: Flat; dues: FlatDues; payment?: Payment } | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<Expense[]>(
    (month?.expenses || []).map((e) => ({ ...e, description: e.description || '', amount: Number(e.amount) || 0 })),
  );
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [exportingMonth, setExportingMonth] = useState(false);

  const payments = useMemo(
    () => new Map<string, Payment>(data.payments.filter((p) => p.month === month?.month).map((p) => [p.flat, p])),
    [data.payments, month?.month],
  );

  useEffect(() => {
    setEditingCalculation(false);
    setExpenseDraft((month?.expenses || []).map((e) => ({ ...e, description: e.description || '', amount: Number(e.amount) || 0 })));
    setCalcMethod(month?.method || 'divide');
    setCalcValue(String(month?.value ?? data.flats.length));
    setCalcRounding(month?.rounding || 'none');
    setCorpApplicable(month?.corp_applicable === true);
    setMergeMaintenanceCorp(month?.notes?.mergeMaintenanceCorp === true);
    setCorpMethod(month?.corp_method || 'sqft');
    setCorpRate(String(month?.corp_value ?? month?.corp_rate ?? 0.5));
    setCorp2Bhk(String(month?.corp_2bhk ?? ''));
    setCorp3Bhk(String(month?.corp_3bhk ?? ''));
    setSelectedBlock('all');
    setCorpRounding(month?.corp_rounding || 'nearest');
  }, [month?.month, month?.expenses, data.flats.length]);

  const saveMaintenanceCalculation = async () => {
    if (!admin || locked) return;
    const value = calcMethod === 'divide' ? data.flats.length : Math.max(0, Number(calcValue) || 0);
    const corp = Math.max(0, Number(corpRate) || 0);
    const ok = await save(
      {
        action: 'saveMonth',
        month: month.month,
        expenses: month.expenses || [],
        method: calcMethod,
        value,
        rounding: calcRounding,
        corpApplicable,
        corpMethod,
        corpRate: corp,
        corpValue: corp,
        corp2Bhk: corp2Bhk.trim() === '' ? null : Math.max(0, Number(corp2Bhk) || 0),
        corp3Bhk: corp3Bhk.trim() === '' ? null : Math.max(0, Number(corp3Bhk) || 0),
        corpRounding,
        calculatedExpenseTotal: total(month),
        notes: { ...(month.notes || {}), expensesStage: 'actual', mergeMaintenanceCorp },
        recalculate: true,
      },
      'Maintenance calculation saved',
    );
    if (ok) setEditingCalculation(false);
  };

  const saveActualExpenses = async () => {
    if (!admin || locked || savingExpenses) return;
    const invalid = expenseDraft.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0);
    if (invalid) {
      showAppDialog('Check expense amounts', 'Each expense amount must be a number greater than or equal to zero.');
      return;
    }
    setSavingExpenses(true);
    try {
      const expectedStage = month.notes?.expensesStage !== 'actual';
      const draftTotal = expenseDraft.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const ok = await save(
        {
          action: 'saveMonth',
          month: month.month,
          expenses: expenseDraft.map((row) => ({ ...row, description: row.description.trim(), amount: Number(row.amount) || 0 })),
          method: expectedStage ? calcMethod : month.method || 'divide',
          value: expectedStage
            ? calcMethod === 'divide'
              ? data.flats.length
              : Math.max(0, Number(calcValue) || 0)
            : (month.value ?? data.flats.length),
          rounding: expectedStage ? calcRounding : month.rounding || 'none',
          corpApplicable: expectedStage ? corpApplicable : month.corp_applicable === true,
          corpMethod: expectedStage ? corpMethod : month.corp_method || 'sqft',
          corpRate: expectedStage ? Math.max(0, Number(corpRate) || 0) : (month.corp_value ?? month.corp_rate ?? 0.5),
          corpValue: expectedStage ? Math.max(0, Number(corpRate) || 0) : (month.corp_value ?? month.corp_rate ?? 0.5),
          corp2Bhk: expectedStage ? (corp2Bhk.trim() === '' ? null : Math.max(0, Number(corp2Bhk) || 0)) : (month.corp_2bhk ?? null),
          corp3Bhk: expectedStage ? (corp3Bhk.trim() === '' ? null : Math.max(0, Number(corp3Bhk) || 0)) : (month.corp_3bhk ?? null),
          corpRounding: expectedStage ? corpRounding : month.corp_rounding || 'nearest',
          calculatedExpenseTotal: expectedStage ? draftTotal : (month.calculated_expense_total ?? total(month)),
          notes: {
            ...(month.notes || {}),
            expensesStage: 'actual',
            mergeMaintenanceCorp: expectedStage ? mergeMaintenanceCorp : month.notes?.mergeMaintenanceCorp === true,
          },
          recalculate: expectedStage,
        },
        expectedStage ? 'Expenses saved and maintenance recalculated' : 'Actual expenses saved',
      );
      if (!ok) setExpenseDraft((month.expenses || []).map((e) => ({ description: e.description || '', amount: Number(e.amount) || 0 })));
    } finally {
      setSavingExpenses(false);
    }
  };

  const resetMaintenanceCalculation = () => {
    if (!superAdmin || locked) return;
    showAppDialog('Reset maintenance calculation?', 'Billing settings will become editable again. Existing payments will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset calculation',
        style: 'destructive',
        onPress: () => {
          void save(
            {
              action: 'saveMonth',
              month: month.month,
              expenses: month.expenses || [],
              method: month.method || 'divide',
              value: month.value ?? data.flats.length,
              rounding: month.rounding || 'none',
              corpApplicable: month.corp_applicable === true,
              corpMethod: month.corp_method || 'sqft',
              corpRate: month.corp_value ?? month.corp_rate ?? 0.5,
              corpValue: month.corp_value ?? month.corp_rate ?? 0.5,
              corp2Bhk: month.corp_2bhk ?? null,
              corp3Bhk: month.corp_3bhk ?? null,
              corpRounding: month.corp_rounding || 'nearest',
              notes: { ...(month.notes || {}), expensesStage: 'expected', mergeMaintenanceCorp },
              recalculate: false,
            },
            'Maintenance calculation reset',
          );
        },
      },
    ]);
  };

  if (!month) return <EmptyState text="No months have been added yet." />;

  const isCompleted = Boolean(month.notes?.completion);
  const isArchived = Boolean(month.archived);
  const locked = isCompleted || isArchived;
  const totals = monthTotals(month, data.flats, data.payments, admin, data.settings.isBlocks === true);
  const billing = billingOf(data.settings, month);
  const isDuePassed = isDueDatePassed(month.month, data.settings.dueDay);

  const actualTotalPaid = totals.paid;
  const actualExpenses = total(month);
  const completionBalance = Math.round((actualTotalPaid - actualExpenses) * 100) / 100;

  const carryForwardEntries = Object.entries(month.notes?.carryForward || {});
  const carryForwardTotal = carryForwardEntries.reduce(
    (sum, [, amount]) => sum + (Number(amount?.maintenance) || 0) + (Number(amount?.corp) || 0),
    0,
  );

  const isLatestMonth = data.months[data.months.length - 1]?.month === month.month;

  const remindUnpaid = () => {
    showAppDialog(
      'Remind unpaid flats?',
      `Send a payment reminder for ${monthLabel(month.month)} to every flat that still has a balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send reminders',
          onPress: async () => {
            setReminding(true);
            try {
              const r = await call<{ sentCount: number }>(
                {
                  action: 'sendNotificationMessage',
                  channel: 'all',
                  targetType: 'unpaid',
                  subject: `Maintenance reminder – ${monthLabel(month.month)}`,
                  message: `Dear resident, your ${monthLabel(month.month)} maintenance payment is still pending. Please pay at the earliest. If you have already paid, please ignore this message. – ${data.settings.orgName || 'My Apartment'}`,
                },
                token,
              );
              showAppDialog(
                'Reminders sent',
                r.sentCount
                  ? `Reminder sent to ${r.sentCount} flat(s).`
                  : 'No reminders were sent (no unpaid flats or missing contact info).',
              );
            } catch (e) {
              showAppDialog('Error', errText(e));
            } finally {
              setReminding(false);
            }
          },
        },
      ],
    );
  };

  const handleCompleteMonth = () => {
    showAppDialog(
      `Complete ${monthLabel(month.month)}?`,
      `The combined balance (collected ${inr(actualTotalPaid)} − actual expenses ${inr(actualExpenses)}) is ${inr(completionBalance)}. Unpaid dues will be carried forward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete month',
          onPress: () => {
            showAppDialog(
              'How should unpaid amounts carry forward?',
              'Choose "Combine" to add Maintenance + Corp Fund arrears together under Maintenance in the next month. Choose "Separate" to keep them distinct.',
              [
                {
                  text: 'Separate',
                  onPress: () => void save({ action: 'completeMonth', month: month.month, combineCarryForward: false }, 'Month completed'),
                },
                {
                  text: 'Combine',
                  onPress: () => void save({ action: 'completeMonth', month: month.month, combineCarryForward: true }, 'Month completed'),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleUndoCompleteMonth = () => {
    showAppDialog(
      `Undo Complete for ${monthLabel(month.month)}?`,
      'This restores the previous Corp Fund transfer and removes the unpaid-amount carry-forward created by Complete. The month will become editable again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo Complete',
          style: 'destructive',
          onPress: () => void save({ action: 'undoCompleteMonth', month: month.month }, 'Undo complete finished'),
        },
      ],
    );
  };

  const handleArchiveToggle = () => {
    const action = isArchived ? 'unarchiveMonth' : 'archiveMonth';
    showAppDialog(
      isArchived ? `Unarchive ${monthLabel(month.month)}?` : `Archive ${monthLabel(month.month)}?`,
      isArchived ? 'This will make the month editable again.' : 'This month will become read-only until it is unarchived.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isArchived ? 'Unarchive' : 'Archive',
          onPress: () => void save({ action, month: month.month }, isArchived ? 'Month unarchived' : 'Month archived'),
        },
      ],
    );
  };

  const handleDeleteMonth = () => {
    showAppDialog(
      `Delete month ${monthLabel(month.month)}?`,
      'This will permanently delete all expenses and payment records for this month. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void save({ action: 'deleteMonth', month: month.month }, 'Month deleted'),
        },
      ],
    );
  };

  const handleClearPayments = () => {
    showAppDialog(
      `Clear flat payments for ${monthLabel(month.month)}?`,
      'This removes saved payment entries for every flat in this month.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear flat payments',
          style: 'destructive',
          onPress: () => void save({ action: 'clearPayments', month: month.month }, 'Flat payments cleared'),
        },
      ],
    );
  };

  const blockNames =
    data.settings.isBlocks === true
      ? Array.from(new Set(data.flats.map((f) => String(f.block || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      : [];

  const rows = data.flats
    .filter((f) => selectedBlock === 'all' || String(f.block || '').trim() === selectedBlock)
    .map((f) => ({ f, d: flatDues(month, f, payments.get(f.flat), admin, data.flats, data.settings.isBlocks === true) }))
    .filter((r) => filter === 'all' || r.d.status === 'unpaid');

  const exportMonthExcel = async () => {
    if (!admin || exportingMonth) return;
    setExportingMonth(true);
    try {
      const pays = Object.fromEntries(payments.entries());
      const base64 = await createMonthlyWorkbook({
        flats: [...data.flats].sort((a, b) => a.flat.localeCompare(b.flat, undefined, { numeric: true })),
        m: month,
        pays,
        hide: false,
        settings: data.settings,
        sheet: monthLabel(month.month),
        corpOf,
        maintOf: (monthArg, flatArg) => maintOf(monthArg, flatArg, data.flats, data.settings.isBlocks === true),
      });
      const safeMonth = month.month.replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `${RNFS.CachesDirectoryPath}/my-apartment-maintenance-${safeMonth}.xlsx`;
      await RNFS.writeFile(path, base64, 'base64');
      await Share.open({
        title: `My Apartment ${month.month} maintenance report`,
        url: `file://${path}`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `my-apartment-maintenance-${safeMonth}.xlsx`,
        failOnCancel: false,
      });
    } catch (error) {
      showAppDialog('Export failed', error instanceof Error ? error.message : 'Could not create or share the Excel workbook.');
    } finally {
      setExportingMonth(false);
    }
  };

  return (
    <View>
      {admin && (
        <Section title="Export month data">
          <Text style={s.muted}>
            Generate the same formatted monthly Excel report as the web Months tab, including expenses, billing settings, flat charges,
            payment details, totals, and balance. Share it only with authorized recipients.
          </Text>
          <Button
            title={exportingMonth ? 'Preparing export…' : 'Export to Excel (.xlsx)'}
            onPress={() => void exportMonthExcel()}
            busy={exportingMonth}
          />
        </Section>
      )}
      {/* Month Selector Pills */}
      <View style={[s.rowWrap, { marginBottom: 4 }]}>
        {[...data.months].reverse().map((m) => (
          <Chip key={m.month} label={monthLabel(m.month)} active={m.month === month.month} onPress={() => onSelectMonth(m.month)} />
        ))}
      </View>

      {/* Due Date Notice */}
      {isDuePassed && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Payment due date ({dueDateText(month.month, data.settings.dueDay)}) has passed. Outstanding flats are highlighted below.
          </Text>
        </View>
      )}

      {/* Lifecycle Status Banner */}
      {locked && (
        <View style={[s.banner, isCompleted && { backgroundColor: '#E8F5E9' }]}>
          <Text style={[s.bannerText, isCompleted && { color: GREEN }]}>
            {isCompleted ? 'Completed month — read-only.' : 'Archived month — read-only.'}
          </Text>
        </View>
      )}

      {/* Summary KPI Cards */}
      <View style={s.row2}>
        <Stat t="Expected Combined" v={inr0(totals.due)} />
        <Stat t="Collected" v={inr0(totals.paid)} tone="ok" />
      </View>
      <View style={s.row2}>
        <Stat t="Outstanding" v={inr0(totals.outstanding)} tone={totals.outstanding > 0 ? 'bad' : 'ok'} />
        <Stat t="Pending flats" v={String(totals.unpaidFlats)} />
      </View>

      {/* Expense editing */}
      <Section title="Expense Details">
        <Text style={s.muted}>
          Add or edit actual expense descriptions and amounts for {monthLabel(month.month)}. Saving actual expenses does not change the
          maintenance amount already calculated.
        </Text>
        <Text style={[s.rowTitle, { marginTop: 8 }]}>
          Actual expense total: {inr0(expenseDraft.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))}
        </Text>
        {expenseDraft.map((expense, index) => (
          <View key={`expense-${index}`} style={[s.listRow, { gap: 4 }]}>
            {admin && !locked ? (
              <>
                <Field
                  label={`Expense ${index + 1} description`}
                  value={expense.description}
                  onChangeText={(value) =>
                    setExpenseDraft((rows) => rows.map((row, i) => (i === index ? { ...row, description: value } : row)))
                  }
                  placeholder="e.g. Lift maintenance"
                />
                <Field
                  label="Amount (₹)"
                  value={String(expense.amount ?? 0)}
                  onChangeText={(value) =>
                    setExpenseDraft((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, amount: value === '' ? 0 : Number(value) } : row)),
                    )
                  }
                  keyboardType="decimal-pad"
                />
                <SmallButton title="Remove expense" danger onPress={() => setExpenseDraft((rows) => rows.filter((_, i) => i !== index))} />
              </>
            ) : (
              <View style={s.rowBetween}>
                <Text style={[s.rowTitle, { flex: 1 }]}>{expense.description || `Expense ${index + 1}`}</Text>
                <Text style={s.rowTitle}>{inr0(Number(expense.amount) || 0)}</Text>
              </View>
            )}
          </View>
        ))}
        {!expenseDraft.length && <EmptyState text="No expense rows added yet." />}
        {admin && !locked && (
          <>
            <Button
              title="+ Add expense"
              kind="secondary"
              onPress={() => setExpenseDraft((rows) => [...rows, { description: '', amount: 0 }])}
            />
            <Button
              title={
                savingExpenses
                  ? 'Saving expenses…'
                  : month.notes?.expensesStage === 'actual'
                    ? 'Save actual expenses'
                    : 'Save expenses & calculate maintenance'
              }
              onPress={() => void saveActualExpenses()}
              busy={savingExpenses}
            />
          </>
        )}
      </Section>

      {/* Maintenance calculation and billing settings */}
      <Section title="Maintenance Calculation & Billing Rules">
        {!editingCalculation ? (
          <>
            <Text style={[s.rowTitle, { marginBottom: 4 }]}>{calcText(month)}</Text>
            {month.notes?.mergeMaintenanceCorp && month.corp_applicable !== false && (
              <Text style={s.small}>Selected rounding applies to the combined Maintenance + Corp Fund charge per flat.</Text>
            )}
            <Text style={s.small}>
              Method: {month.method || 'divide'} ({month.value || data.flats.length}) · Rounding: {month.rounding || 'none'}
            </Text>
            <Text style={s.small}>
              Billing display:{' '}
              {month.notes?.mergeMaintenanceCorp
                ? 'Combined amount shown and recorded under Maintenance'
                : 'Maintenance and Corp Fund shown separately'}
            </Text>
            <Text style={[s.small, { marginTop: 6 }]}>
              Corp Fund:{' '}
              {month.corp_applicable
                ? `Applicable · ${month.corp_method || 'sqft'} · rate ${month.corp_value ?? month.corp_rate ?? 0.5} · rounding ${month.corp_rounding || 'nearest'}`
                : 'Not applicable this month'}
            </Text>
            {admin && !locked && (
              <Button title="Edit maintenance calculation" kind="secondary" onPress={() => setEditingCalculation(true)} />
            )}
            {superAdmin && !locked && month.notes?.expensesStage === 'actual' && (
              <Button title="Reset maintenance calculation" kind="danger" onPress={resetMaintenanceCalculation} />
            )}
          </>
        ) : (
          <>
            <Text style={s.muted}>
              Choose the same billing options available on the web app. Saving recalculates this month's maintenance dues.
            </Text>
            <Text style={s.label}>Maintenance calculation</Text>
            <View style={s.rowWrap}>
              <Chip label="Expenses ÷ flats" active={calcMethod === 'divide'} onPress={() => setCalcMethod('divide')} />
              <Chip label="Fixed per flat" active={calcMethod === 'common'} onPress={() => setCalcMethod('common')} />
              <Chip label="Per sq ft" active={calcMethod === 'sqft'} onPress={() => setCalcMethod('sqft')} />
            </View>
            {(calcMethod === 'common' || calcMethod === 'sqft') && (
              <Field
                label={calcMethod === 'common' ? 'Maintenance amount per flat (₹)' : 'Maintenance rate per sq ft (₹)'}
                value={calcValue}
                onChangeText={setCalcValue}
                keyboardType="decimal-pad"
              />
            )}
            <Text style={s.label}>Corp Fund applicable?</Text>
            <View style={s.rowWrap}>
              <Chip label="Applicable" active={corpApplicable} onPress={() => setCorpApplicable(true)} />
              <Chip label="Not applicable" active={!corpApplicable} onPress={() => setCorpApplicable(false)} />
            </View>
            {corpApplicable && (
              <>
                <Text style={s.label}>Corp Fund calculation</Text>
                <View style={s.rowWrap}>
                  <Chip label="Based on sq ft" active={corpMethod === 'sqft'} onPress={() => setCorpMethod('sqft')} />
                  <Chip label="Fixed per flat" active={corpMethod === 'common'} onPress={() => setCorpMethod('common')} />
                </View>
                <Field
                  label={corpMethod === 'sqft' ? 'Corp Fund rate per sq ft (₹)' : 'Corp Fund amount per flat (₹)'}
                  value={corpRate}
                  onChangeText={setCorpRate}
                  keyboardType="decimal-pad"
                />
                <>
                  <Field
                    label="Corp Fund — 2 BHK (₹ per flat)"
                    value={corp2Bhk}
                    onChangeText={setCorp2Bhk}
                    keyboardType="decimal-pad"
                    placeholder={corpRate || 'Default amount'}
                  />
                  <Field
                    label="Corp Fund — 3 BHK (₹ per flat)"
                    value={corp3Bhk}
                    onChangeText={setCorp3Bhk}
                    keyboardType="decimal-pad"
                    placeholder={corpRate || 'Default amount'}
                  />
                </>
              </>
            )}
            <Text style={s.label}>Merge Maintenance and Corp Fund?</Text>
            <View style={s.rowWrap}>
              <Chip label="No — separate" active={!mergeMaintenanceCorp} onPress={() => setMergeMaintenanceCorp(false)} />
              <Chip label="Yes — combine" active={mergeMaintenanceCorp} onPress={() => setMergeMaintenanceCorp(true)} />
            </View>
            <Text style={s.small}>Rounding is applied to the combined monthly charge.</Text>
            <Text style={s.label}>{mergeMaintenanceCorp ? 'Combined charge rounding' : 'Maintenance rounding'}</Text>
            <View style={s.rowWrap}>
              <Chip label="2 decimals" active={calcRounding === 'none'} onPress={() => setCalcRounding('none')} />
              <Chip label="Nearest ₹1" active={calcRounding === 'nearest'} onPress={() => setCalcRounding('nearest')} />
              <Chip label="Round up ₹1" active={calcRounding === 'up'} onPress={() => setCalcRounding('up')} />
              <Chip label="Next ₹50" active={calcRounding === 'up50'} onPress={() => setCalcRounding('up50')} />
              <Chip label="Next ₹100" active={calcRounding === 'up100'} onPress={() => setCalcRounding('up100')} />
            </View>
            {corpApplicable && !mergeMaintenanceCorp && (
              <>
                <Text style={s.label}>Corp Fund rounding</Text>
                <View style={s.rowWrap}>
                  <Chip label="2 decimals" active={corpRounding === 'none'} onPress={() => setCorpRounding('none')} />
                  <Chip label="Nearest ₹1" active={corpRounding === 'nearest'} onPress={() => setCorpRounding('nearest')} />
                  <Chip label="Round up ₹1" active={corpRounding === 'up'} onPress={() => setCorpRounding('up')} />
                </View>
              </>
            )}
            <Button
              title="Save and recalculate"
              onPress={() =>
                showAppDialog('Recalculate maintenance?', 'This will update maintenance dues for this month using the selected settings.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Recalculate', onPress: () => void saveMaintenanceCalculation() },
                ])
              }
            />
            <Button
              title="Cancel"
              kind="secondary"
              onPress={() => {
                setEditingCalculation(false);
                setCalcMethod(month.method || 'divide');
                setCalcValue(String(month.value ?? data.flats.length));
                setCalcRounding(month.rounding || 'none');
                setCorpApplicable(month.corp_applicable === true);
                setMergeMaintenanceCorp(month.notes?.mergeMaintenanceCorp === true);
                setCorpMethod(month.corp_method || 'sqft');
                setCorpRate(String(month.corp_value ?? month.corp_rate ?? 0.5));
                setCorpRounding(month.corp_rounding || 'nearest');
              }}
            />
          </>
        )}
      </Section>

      {/* Carried Forward Arrears Details */}
      {carryForwardEntries.length > 0 && (
        <Section
          title={`Carried Forward Dues (${inr0(carryForwardTotal)})`}
          right={
            <TouchableOpacity onPress={() => setExpandedCarry(!expandedCarry)}>
              <Text style={{ color: GREEN, fontWeight: 'bold' }}>{expandedCarry ? 'Hide' : 'Details'}</Text>
            </TouchableOpacity>
          }
        >
          <Text style={s.muted}>
            Arrears carried forward across {carryForwardEntries.length} flat(s). Combined arrears are included in Maintenance.
          </Text>
          {expandedCarry &&
            carryForwardEntries.map(([flatNo, amt]) => {
              const maint = Number(amt?.maintenance) || 0;
              const corp = Number(amt?.corp) || 0;
              const flatInfo = data.flats.find((f) => f.flat === flatNo);
              return (
                <View key={flatNo} style={[s.rowBetween, s.listRow]}>
                  <Text style={s.rowTitle}>
                    Flat {flatNo}
                    {flatInfo?.name ? ` (${flatInfo.name})` : ''}
                  </Text>
                  <Text style={s.small}>
                    Maint: {inr0(maint)} · Corp: {inr0(corp)} · Total: {inr0(maint + corp)}
                  </Text>
                </View>
              );
            })}
        </Section>
      )}

      {/* Admin Actions */}
      {admin && (
        <Section title="Month Actions">
          <View style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, width: '100%' }}>
            {isCompleted ? (
              <Button title="Undo Complete" kind="secondary" onPress={handleUndoCompleteMonth} />
            ) : (
              <Button title="Complete Month" onPress={handleCompleteMonth} disabled={isArchived} />
            )}
            <Button title={isArchived ? 'Unarchive Month' : 'Archive Month'} kind="secondary" onPress={handleArchiveToggle} />
            {isLatestMonth && !locked && (
              <Button title={reminding ? 'Sending…' : 'Remind Unpaid'} kind="secondary" onPress={remindUnpaid} disabled={reminding} />
            )}
            {!locked && <Button title="Clear Flat Payments" kind="danger" onPress={handleClearPayments} />}
            {!isCompleted && <Button title="Delete Month" kind="danger" onPress={handleDeleteMonth} />}
          </View>
        </Section>
      )}

      {/* Flat Payment List */}
      {data.settings.isBlocks === true && blockNames.length > 0 && (
        <Section title="Block">
          <View style={s.rowWrap}>
            <Chip label="All Blocks" active={selectedBlock === 'all'} onPress={() => setSelectedBlock('all')} />
            {blockNames.map((block) => (
              <Chip key={block} label={block} active={selectedBlock === block} onPress={() => setSelectedBlock(block)} />
            ))}
          </View>
        </Section>
      )}
      <Section title="Flats">
        <View style={[s.rowWrap, { marginBottom: 8 }]}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Pending" active={filter === 'due'} onPress={() => setFilter('due')} />
        </View>
        {rows.length === 0 && <EmptyState text={filter === 'due' ? 'Everything is paid 🎉' : 'No flats to show.'} />}
        {rows.map(({ f, d }) => (
          <View key={f.flat} style={s.listRow}>
            <TouchableOpacity
              disabled={!admin || locked}
              onPress={() => setEditing(f)}
              accessibilityRole={admin && !locked ? 'button' : undefined}
            >
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>
                  Flat {f.flat}
                  {admin && f.name ? ` · ${f.name}` : ''}
                </Text>
                <Badge text={STATUS_LABEL[d.status]} tone={STATUS_TONE[d.status]} />
              </View>

              <View style={[s.rowBetween, { marginTop: 4, flexWrap: 'wrap' }]}>
                {month.notes?.mergeMaintenanceCorp ? (
                  <Text style={s.small}>
                    Maintenance + Corp Fund Due {inr0(d.totalDue)} (Paid {inr0(d.totalPaid)})
                    {month.corp_applicable !== false ? ` · Corp Fund amount ${inr0(d.cdue)}` : ''}
                  </Text>
                ) : (
                  <>
                    <Text style={s.small}>
                      Maint Due {inr0(d.due)} (Paid {inr0(d.paid)})
                    </Text>
                    {month.corp_applicable !== false && !month.notes?.mergeMaintenanceCorp && (
                      <Text style={s.small}>
                        Corp Due {inr0(d.cdue)} (Paid {inr0(d.cpaid)})
                      </Text>
                    )}
                  </>
                )}
              </View>

              <View style={[s.rowBetween, { marginTop: 4, flexWrap: 'wrap' }]}>
                <Text style={s.small}>Total Due {inr(d.totalDue)}</Text>
                <Text style={s.small}>Total Paid {inr(d.totalPaid)}</Text>
                {d.balance > 0.005 && <Text style={[s.small, { color: BAD, fontWeight: 'bold' }]}>Bal {inr(d.balance)}</Text>}
              </View>
            </TouchableOpacity>

            <View style={[s.rowWrap, { marginTop: 8 }]}>
              <SmallButton title="View Receipt" onPress={() => setReceiptFlat({ flat: f, dues: d, payment: payments.get(f.flat) })} />
              {!!f.phone && (
                <SmallButton
                  title="WhatsApp"
                  onPress={() => {
                    const phoneNum = f.phone ?? '';
                    const text = `My Apartment maintenance receipt - Flat ${f.flat}\nMonth: ${monthLabel(month.month)}\nMaintenance Paid: ${inr0(d.paid)}\nCorp Fund Paid: ${inr0(d.cpaid)}\nTotal Paid: ${inr0(d.totalPaid)}\nBalance: ${inr0(d.balance)}`;
                    const url = `whatsapp://send?phone=${phoneNum.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(text)}`;
                    void Linking.openURL(url).catch(() => showAppDialog('WhatsApp', 'Could not open WhatsApp.'));
                  }}
                />
              )}
            </View>
          </View>
        ))}
      </Section>

      {/* Editing Payment Sheet */}
      {editing && (
        <PaymentSheet
          flat={editing}
          monthKey={month.month}
          payment={payments.get(editing.flat)}
          dues={flatDues(month, editing, payments.get(editing.flat), admin, data.flats, data.settings.isBlocks === true)}
          merged={month.notes?.mergeMaintenanceCorp === true}
          split={splitOf(data.settings)}
          save={save}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Receipt Modal */}
      {receiptFlat && (
        <Sheet visible onClose={() => setReceiptFlat(null)} title={`Receipt · Flat ${receiptFlat.flat.flat}`}>
          <Text style={s.rowTitle}>{data.settings.orgName || 'My Apartment'}</Text>
          <Text style={s.muted}>Maintenance Payment Receipt — {monthLabel(month.month)}</Text>

          <View style={{ marginTop: 12 }}>
            <Text style={s.small}>Flat: {receiptFlat.flat.flat}</Text>
            {receiptFlat.flat.name ? <Text style={s.small}>Resident: {receiptFlat.flat.name}</Text> : null}
            <Text style={s.small}>Maintenance Due: {inr(receiptFlat.dues.due)}</Text>
            <Text style={s.small}>Maintenance Paid: {inr(receiptFlat.dues.paid)}</Text>
            <Text style={s.small}>Corp Fund Due: {inr(receiptFlat.dues.cdue)}</Text>
            <Text style={s.small}>Corp Fund Paid: {inr(receiptFlat.dues.cpaid)}</Text>
            <Text style={[s.rowTitle, { marginTop: 8 }]}>Total Paid: {inr(receiptFlat.dues.totalPaid)}</Text>
            <Text style={[s.small, { color: receiptFlat.dues.balance > 0 ? BAD : OK }]}>Balance: {inr(receiptFlat.dues.balance)}</Text>
            {receiptFlat.payment?.mode ? <Text style={s.small}>Mode: {receiptFlat.payment.mode}</Text> : null}
            {receiptFlat.payment?.paid_date ? <Text style={s.small}>Date: {receiptFlat.payment.paid_date}</Text> : null}
          </View>
        </Sheet>
      )}
    </View>
  );
}

function PaymentSheet({
  flat,
  monthKey,
  payment,
  dues,
  merged = false,
  split = 'maint_first',
  save,
  onClose,
}: {
  flat: Flat;
  monthKey: string;
  payment?: Payment;
  dues: FlatDues;
  merged?: boolean;
  split?: import('../../../shared/types').SplitMode;
  save: ScreenProps['save'];
  onClose: () => void;
}) {
  const [maint, setMaint] = useState(String(payment?.maint ?? 0));
  const [corp, setCorp] = useState(String(payment?.corp ?? 0));
  const [combinedPaid, setCombinedPaid] = useState(String((Number(payment?.maint) || 0) + (Number(payment?.corp) || 0)));
  const [mode, setMode] = useState(payment?.mode ?? '');
  const [date, setDate] = useState(payment?.paid_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    let m = Number(maint || 0),
      c = Number(corp || 0);
    if (merged) {
      const totalPaid = Number(combinedPaid || 0);
      if (!Number.isFinite(totalPaid) || totalPaid < 0) return setError('Combined payment must be a number (0 or more)');
      m = totalPaid;
      c = 0;
    }
    if (!Number.isFinite(m) || !Number.isFinite(c) || m < 0 || c < 0) return setError('Amounts must be numbers (0 or more)');
    if (date && !isDateKey(date)) return setError('Paid date must look like 2026-09-30');
    setBusy(true);
    const ok = await save(
      { action: 'savePayment', month: monthKey, flat: flat.flat, maint: m, corp: c, mode, date, extra: payment?.extra ?? {} },
      `Saved payment for flat ${flat.flat}`,
    );
    setBusy(false);
    if (ok) onClose();
    else setError('Could not save. Please try again.');
  };

  return (
    <Sheet visible onClose={onClose} title={`Flat ${flat.flat} · ${monthLabel(monthKey)}`}>
      <Text style={s.muted}>
        {merged
          ? `Combined Maintenance + Corp Fund due ${inr(dues.totalDue)} · recorded under Maintenance`
          : `Maintenance due ${inr(dues.due)} · Corp Fund due ${inr(dues.cdue)}`}
      </Text>
      {merged ? (
        <Field label="Combined amount paid (₹)" value={combinedPaid} onChangeText={setCombinedPaid} keyboardType="decimal-pad" />
      ) : (
        <>
          <Field label="Maintenance paid (₹)" value={maint} onChangeText={setMaint} keyboardType="decimal-pad" />
          <Field label="Corp Fund paid (₹)" value={corp} onChangeText={setCorp} keyboardType="decimal-pad" />
        </>
      )}
      <Text style={s.label}>Mode</Text>
      <View style={s.rowWrap}>
        <Chip label="None" active={mode === ''} onPress={() => setMode('')} />
        {MODES.map((m) => (
          <Chip key={m} label={m} active={mode === m} onPress={() => setMode(m)} />
        ))}
      </View>
      <Field
        label="Paid date (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        placeholder={todayKey()}
        keyboardType="numbers-and-punctuation"
      />
      <View style={[s.rowWrap, { marginTop: 8 }]}>
        <Chip label="Today" onPress={() => setDate(todayKey())} />
        <Chip
          label="Mark fully paid"
          onPress={() => {
            if (merged) setCombinedPaid(String(dues.totalDue));
            else {
              setMaint(String(dues.due));
              setCorp(String(dues.cdue));
            }
            if (!date) setDate(todayKey());
          }}
        />
      </View>
      {!!error && <Text style={s.danger}>{error}</Text>}
      <Button title="Save payment" onPress={submit} busy={busy} />
    </Sheet>
  );
}
