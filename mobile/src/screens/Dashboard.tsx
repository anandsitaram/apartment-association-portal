import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Badge, Chip, EmptyState, ProgressBar, Section, Stat } from '../components';
import { flatDues, monthTotals } from '../../../shared/dues';
import { STATUS_LABEL, STATUS_TONE } from '../core/status';
import { inr0, monthLabel } from '../../../shared/format';
import { buildSummary, fyLabel, inr, isDueDatePassed, dueDateText, label, n2, sum, total, vsum } from '../../../shared/lib';
import type { ScreenProps } from './types';
import s, { BAD, OK, GREEN, WARN } from '../styles/styles';

const fyOfMonth = (m: string) => {
  const [year, monthNumber] = m.split('-').map(Number);
  return monthNumber >= 4 ? year : year - 1;
};

const shortDate = (value?: string | null) => {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date not set'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function Dashboard({ data, admin, flat, onNavigate }: ScreenProps) {
  const [fy, setFy] = useState<number | null>(null); // null = all months
  const [expandedCarry, setExpandedCarry] = useState(false);

  const allSummary = useMemo(() => buildSummary(data, data.flats), [data]);
  const filteredSummary = useMemo(
    () => (fy == null ? allSummary : buildSummary(data, data.flats, fy)),
    [data, fy, allSummary],
  );

  const S = fy != null && filteredSummary.ms.length === 0 ? allSummary : filteredSummary;

  const months = data.months;
  const month = months[months.length - 1];
  if (!month || !S.ms.length) return <EmptyState text="No months have been added yet." />;

  const mine = !admin ? data.flats.find((f) => f.flat === flat) : undefined;
  const totals = monthTotals(month, data.flats, data.payments, admin);

  // Month-wise calculation for the selected period
  const periodRows = S.ms.map((v) => {
    const due = vsum(v.due) + vsum(v.cdue);
    const paid = vsum(v.paid) + vsum(v.cpaid);
    return {
      v,
      exp: total(v),
      due,
      paid,
      bal: due - paid,
    };
  });

  const periodDue = sum(periodRows, (r) => r.due);
  const periodPaid = sum(periodRows, (r) => r.paid);
  const periodBalance = periodDue - periodPaid;
  const periodExpenses = sum(periodRows, (r) => r.exp);

  const ratio = periodDue > 0 ? periodPaid / periodDue : 0;
  const myDues = mine
    ? flatDues(
        month,
        mine,
        data.payments.find((p) => p.month === month.month && p.flat === mine.flat),
        false,
      )
    : null;

  // Carried forward months in period
  const carryMonths = data.months
    .filter(
      (item) =>
        (fy == null || fyOfMonth(item.month) === fy) &&
        item.notes?.carryForward &&
        Object.keys(item.notes.carryForward).length > 0,
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  const carriedTotal = carryMonths.reduce(
    (grand, item) =>
      grand +
      Object.values(item.notes?.carryForward || {}).reduce(
        (subtotal, amount) => subtotal + (Number(amount?.maintenance) || 0) + (Number(amount?.corp) || 0),
        0,
      ),
    0,
  );

  const now = Date.now();
  const upcomingHall = (data.hallBookings || [])
    .filter((b) => new Date(b.starts_at).getTime() >= now && b.status !== 'cancelled' && b.status !== 'rejected')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const upcomingGym = (data.gymBookings || [])
    .filter((b) => new Date(b.starts_at).getTime() >= now && b.status !== 'cancelled' && b.status !== 'rejected')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const upcomingEvents = (data.events || [])
    .filter((e) => new Date(e.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const openTickets = (data.tickets || []).filter((t) => t.status !== 'resolved' && t.status !== 'rejected');
  const openPolls = (data.polls || []).filter((p) => p.status === 'open');

  const isDuePassed = isDueDatePassed(month.month, data.settings.dueDay);

  return (
    <View>
      {/* Period Filter */}
      {S.years.length > 0 && (
        <View style={[s.rowWrap, { marginBottom: 10 }]}>
          <Chip label="All months" active={fy == null} onPress={() => setFy(null)} />
          {S.years.map((y) => (
            <Chip key={y} label={fyLabel(y)} active={fy === y} onPress={() => setFy(y)} />
          ))}
        </View>
      )}

      {/* Due Date Notice */}
      {isDuePassed && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Payment due date ({dueDateText(month.month, data.settings.dueDay)}) has passed. Please review the Months page for
            outstanding balances.
          </Text>
        </View>
      )}

      {/* Hero card */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>
          {admin ? (fy == null ? 'All available months' : `Financial year ${fyLabel(fy)}`) : monthLabel(month.month)}
        </Text>
        {admin ? (
          <>
            <Text style={s.heroValue}>{inr0(periodPaid)}</Text>
            <Text style={s.heroLabel}>
              collected across {S.ms.length} month(s) · {periodBalance < -0.005 ? 'surplus' : 'balance'}{' '}
              {inr0(Math.abs(periodBalance))}
            </Text>
            <ProgressBar ratio={ratio} />
          </>
        ) : myDues ? (
          <>
            <Text style={s.heroValue}>{inr0(Math.max(myDues.balance, 0))}</Text>
            <Text style={s.heroLabel}>due for flat {mine?.flat}</Text>
            <View style={{ marginTop: 8 }}>
              <Badge text={STATUS_LABEL[myDues.status]} tone={STATUS_TONE[myDues.status]} />
            </View>
          </>
        ) : (
          <Text style={s.heroLabel}>Your login isn't linked to a flat yet. Ask the MC to link it.</Text>
        )}
      </View>

      {/* Key Stats */}
      <View style={s.row2}>
        <Stat t={admin ? 'Expenses · selected period' : 'Expenses · current month'} v={inr0(periodExpenses)} />
        {admin ? (
          <Stat t="Due · selected period" v={inr0(periodDue)} />
        ) : (
          <Stat t="Paid by you" v={inr0(myDues?.totalPaid ?? 0)} tone="ok" />
        )}
      </View>
      {admin && data.corpusLedgerNet != null && (
        <View style={s.row2}>
          <Stat t="Corpus fund balance" v={inr0(data.corpusLedgerNet)} tone="ok" />
          <Stat t="Flats" v={String(data.flats.length)} />
        </View>
      )}

      {/* Current month at a glance */}
      {admin && (
        <Section title="Current month at a glance">
          <View style={s.row2}>
            <Stat t="Collected this month" v={inr0(totals.paid)} tone="ok" />
            <Stat t="Outstanding this month" v={inr0(totals.outstanding)} tone={totals.outstanding > 0 ? 'warn' : 'ok'} />
          </View>
          <Text style={[s.small, { marginTop: 10 }]}>
            {totals.unpaidFlats} flat(s) pending for {monthLabel(month.month)}.
          </Text>
        </Section>
      )}

      {/* Carried Forward Flat Details (Admin) */}
      {admin && carryMonths.length > 0 && (
        <Section
          title="Carried-forward flat details"
          right={
            <TouchableOpacity onPress={() => setExpandedCarry(!expandedCarry)}>
              <Text style={{ color: GREEN, fontWeight: 'bold' }}>{expandedCarry ? 'Hide' : 'View details'}</Text>
            </TouchableOpacity>
          }
        >
          <Text style={s.muted}>
            Total {inr(carriedTotal)} across carried-forward flat-month entries. (Maintenance arrears + Corp Fund arrears).
          </Text>
          {expandedCarry &&
            carryMonths.map((item) => {
              const entries = Object.entries(item.notes?.carryForward || {}).sort(([a], [b]) =>
                a.localeCompare(b, undefined, { numeric: true }),
              );
              const monthTotal = entries.reduce(
                (sub, [, amt]) => sub + (Number(amt?.maintenance) || 0) + (Number(amt?.corp) || 0),
                0,
              );
              return (
                <View key={item.month} style={[s.listRow, { marginTop: 6 }]}>
                  <Text style={s.rowTitle}>
                    {monthLabel(item.month)} — {inr(monthTotal)} ({entries.length} flat(s))
                  </Text>
                  {entries.map(([flatNo, amt]) => {
                    const maint = Number(amt?.maintenance) || 0;
                    const corp = Number(amt?.corp) || 0;
                    const flatInfo = data.flats.find((f) => f.flat === flatNo);
                    return (
                      <View key={flatNo} style={[s.rowBetween, { marginTop: 4, paddingLeft: 8 }]}>
                        <Text style={s.small}>
                          Flat {flatNo}
                          {flatInfo?.name ? ` (${flatInfo.name})` : ''}: Maint {inr0(maint)}, Corp {inr0(corp)}
                        </Text>
                        <Text style={[s.small, { fontWeight: 'bold' }]}>{inr0(maint + corp)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
        </Section>
      )}

      {/* Month-wise summary list */}
      <Section title="Month-wise summary">
        <Text style={s.muted}>Combined Maintenance + Corp Fund due and collected for every month.</Text>
        {periodRows.map((r) => {
          const pctVal = r.due > 0 ? Math.min(100, Math.round((r.paid / r.due) * 100)) : 0;
          return (
            <TouchableOpacity
              key={r.v.month}
              style={[s.listRow, r.v.month === month.month && { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 8 }]}
              onPress={() => onNavigate?.('months')}
            >
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>{label(r.v.month)}</Text>
                <Text style={[s.small, { fontWeight: 'bold' }]}>
                  {inr0(r.paid)} / {inr0(r.due)} ({pctVal}%)
                </Text>
              </View>
              <ProgressBar ratio={r.due > 0 ? r.paid / r.due : 0} />
              <View style={[s.rowBetween, { marginTop: 4 }]}>
                <Text style={s.small}>Expenses {inr0(r.exp)}</Text>
                {r.bal > 0.005 ? (
                  <Text style={[s.small, { color: BAD }]}>Pending {inr0(r.bal)}</Text>
                ) : (
                  <Text style={[s.small, { color: OK }]}>Fully paid</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </Section>

      {/* Community Quick View */}
      <Section title="Community quick view">
        <Text style={s.muted}>Upcoming bookings, community events, and items needing attention</Text>

        <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('summary')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <Text style={{ fontSize: 20 }}>💰</Text>
            <View>
              <Text style={s.rowTitle}>Total Expenses</Text>
              <Text style={s.small}>For the selected totals period</Text>
            </View>
          </View>
          <Text style={s.rowTitle}>{inr0(periodExpenses)}</Text>
        </TouchableOpacity>

        {data.features?.hallBooking !== false && (
          <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('hall')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 20 }}>🏛️</Text>
              <View>
                <Text style={s.rowTitle}>Party Hall</Text>
                <Text style={s.small}>
                  {upcomingHall[0]
                    ? `${upcomingHall[0].title} · ${shortDate(upcomingHall[0].starts_at)}`
                    : 'No upcoming bookings'}
                </Text>
              </View>
            </View>
            <Badge text={`${upcomingHall.length} upcoming`} tone={upcomingHall.length > 0 ? 'info' : 'muted'} />
          </TouchableOpacity>
        )}

        {data.features?.events !== false && (
          <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('events')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <View>
                <Text style={s.rowTitle}>Community Events</Text>
                <Text style={s.small}>
                  {upcomingEvents[0]
                    ? `${upcomingEvents[0].title} · ${shortDate(upcomingEvents[0].starts_at)}`
                    : 'No upcoming events'}
                </Text>
              </View>
            </View>
            <Badge text={`${upcomingEvents.length} upcoming`} tone={upcomingEvents.length > 0 ? 'info' : 'muted'} />
          </TouchableOpacity>
        )}

        {data.features?.tickets !== false && (
          <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('tickets')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 20 }}>🎫</Text>
              <View>
                <Text style={s.rowTitle}>Tickets</Text>
                <Text style={s.small}>Requests that still need attention</Text>
              </View>
            </View>
            <Badge text={`${openTickets.length} open`} tone={openTickets.length > 0 ? 'warn' : 'ok'} />
          </TouchableOpacity>
        )}

        {data.features?.gymBooking !== false && (
          <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('gym')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 20 }}>🏋️</Text>
              <View>
                <Text style={s.rowTitle}>Gym Booking</Text>
                <Text style={s.small}>
                  {upcomingGym[0]
                    ? `${upcomingGym[0].title} · ${shortDate(upcomingGym[0].starts_at)}`
                    : 'No upcoming bookings'}
                </Text>
              </View>
            </View>
            <Badge text={`${upcomingGym.length} upcoming`} tone={upcomingGym.length > 0 ? 'info' : 'muted'} />
          </TouchableOpacity>
        )}

        {data.features?.polls !== false && (
          <TouchableOpacity style={[s.listRow, s.rowBetween]} onPress={() => onNavigate?.('polls')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <Text style={{ fontSize: 20 }}>🗳️</Text>
              <View>
                <Text style={s.rowTitle}>Polls & Surveys</Text>
                <Text style={s.small}>Share your feedback and vote</Text>
              </View>
            </View>
            <Badge text={`${openPolls.length} open`} tone={openPolls.length > 0 ? 'info' : 'muted'} />
          </TouchableOpacity>
        )}
      </Section>

      {/* Expenses for current month */}
      <Section title={`${monthLabel(month.month)} expenses`}>
        {month.expenses.length === 0 && <EmptyState text="No expenses recorded for this month." />}
        {month.expenses.map((e, i) => (
          <View key={i} style={[s.listRow, s.rowBetween]}>
            <Text style={s.rowTitle}>{e.description}</Text>
            <Text style={s.rowTitle}>{inr0(e.amount)}</Text>
          </View>
        ))}
      </Section>
    </View>
  );
}
