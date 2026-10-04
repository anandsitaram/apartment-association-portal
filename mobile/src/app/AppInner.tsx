import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  ClipboardList,
  Home,
  MoreHorizontal,
  PartyPopper,
  ShieldCheck,
  Wallet,
  SlidersHorizontal,
  UserCog,
  Database,
  Dumbbell,
  Landmark,
  Vote,
  Building2,
  TrendingUp,
  Bell,
  Phone,
  UserCheck,
  Shield,
  Mail,
  Inbox,
  Lock,
} from 'lucide-react-native';
import type { ActionBody, Data } from '../../../shared/types';
import { APP_BRAND_NAME } from '../../../shared/branding';
import { call, errText, isAuthError, setApiBase } from '../core/api';
import { DEFAULT_API_BASE_URL } from '../core/config';
import { isAdminRole, isSuperRole } from '../../../shared/roles';
import { MobilePage, availablePages, splitTabs } from '../core/pages';
import { Button, ErrorState, Loading } from '../components';
import { LockScreen } from '../components/common/LockScreen';
import {
  Auth,
  AppLockConfig,
  clearSession,
  defaultAppLock,
  loadAppLock,
  readMonth,
  readServer,
  readSession,
  readApiServerVersion,
  saveAppLock,
  writeMonth,
  writeSession,
  writeApiServerVersion,
  writeServer,
} from '../services';
import Login from '../screens/Login';
import Dashboard from '../screens/Dashboard';
import Months from '../screens/Months';
import MyMaintenance from '../screens/MyMaintenance';
import Tickets from '../screens/Tickets';
import Bookings from '../screens/Bookings';
import Polls from '../screens/Polls';
import Events from '../screens/Events';
import Corpus from '../screens/Corpus';
import Flats from '../screens/Flats';
import ServiceContacts from '../screens/ServiceContacts';
import SecurityDesk from '../screens/SecurityDesk';
import More from '../screens/More';
import FinancialSummary from '../screens/FinancialSummary';
import Notifications from '../screens/Notifications';
import FlatUsers from '../screens/FlatUsers';
import Audit from '../screens/Audit';
import VisitorAccess from '../screens/VisitorAccess';
import Contact from '../screens/Contact';
import ContactSubmissions from '../screens/ContactSubmissions';
import Settings from '../screens/Settings';
import Backups from '../screens/Backups';
import Users from '../screens/Users';
import DeveloperAccounts from '../screens/DeveloperAccounts';
import FeatureConfiguration from '../screens/FeatureConfiguration';
import SecurityCenter from '../screens/SecurityCenter';
import type { ScreenProps } from '../screens/types';
import { EMPTY_DATA } from './emptyData';
import s, { BAD, BORDER, DARK, MUTED, GREEN } from '../styles/styles';
import { dismissAppDialog, showAppDialog, subscribeAppDialog, type AppDialogState } from '../core/appDialog';

const ICONS: Record<string, any> = {
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
  more: MoreHorizontal,
};

export default function AppInner() {
  const [booting, setBooting] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [appLock, setAppLockState] = useState<AppLockConfig>(defaultAppLock);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [selectedParcelNoticeId, setSelectedParcelNoticeId] = useState<number | null>(null);
  const [month, setMonth] = useState('');
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<AppDialogState | null>(null);
  const seq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parcelNoticeIds = useRef<Set<number>>(new Set());

  const token = auth?.token;
  const role = auth?.user.role;
  const admin = isAdminRole(role);
  const superAdmin = isSuperRole(role);
  const flat = data.me?.flat ?? auth?.user.flat ?? null;

  useEffect(() => subscribeAppDialog(setDialog), []);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const logout = useCallback((why = '') => {
    seq.current++;
    void clearSession();
    setAuth(null);
    setData(EMPTY_DATA);
    setLoaded(false);
    setPage('dashboard');
    setNotice(why);
  }, []);

  // ---- boot: session, server override, app lock, last month ----
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [a, server, lock, m, serverVersion] = await Promise.all([
          readSession(),
          readServer(),
          loadAppLock(),
          readMonth(),
          readApiServerVersion(),
        ]);
        if (!active) return;

        // This mobile app belongs to the Apartment Association Portal, not the
        // RV Fallon deployment. On upgrade, clear any saved RV Fallon server
        // override and its session token so RV Fallon data cannot be loaded.
        const needsServerMigration = serverVersion !== DEFAULT_API_BASE_URL;
        if (needsServerMigration) {
          await Promise.all([clearSession(), writeServer(''), writeApiServerVersion(DEFAULT_API_BASE_URL)]);
          setApiBase(DEFAULT_API_BASE_URL);
        } else {
          setApiBase(server || DEFAULT_API_BASE_URL);
        }

        setAppLockState(lock);
        setMonth(m);
        if (a && !needsServerMigration) {
          setAuth(a);
          setLocked(lock.mode !== 'off');
        }
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ---- re-lock when the app goes to the background ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' && appLock.mode !== 'off') setLocked(true);
    });
    return () => sub.remove();
  }, [appLock.mode]);

  // ---- data loading (same GET contract as the web app; the screen id decides what the server sends) ----
  const load = useCallback(
    async (screen: string, quiet = false, monthOverride?: string): Promise<boolean> => {
      if (!token) return false;
      const my = ++seq.current;
      if (!quiet) setLoaded(false);
      try {
        const d = await call<Data>(undefined, token, screen, screen === 'months' ? (monthOverride ?? month) : undefined);
        if (my !== seq.current) return false;
        setData(d);
        setLoadError('');
        if (!d.me) {
          logout('Please sign in again.');
          return false;
        }
        if (!month && d.months.length) {
          const last = d.months[d.months.length - 1].month;
          setMonth(last);
          void writeMonth(last);
        }
        return true;
      } catch (e) {
        if (my !== seq.current) return false;
        if (isAuthError(e)) logout('Your session has expired. Please sign in again.');
        else if (quiet) showToast(`Couldn't refresh: ${errText(e)}`);
        else setLoadError(errText(e));
        return false;
      } finally {
        if (my === seq.current) setLoaded(true);
      }
    },
    [token, month, logout, showToast],
  );

  useEffect(() => {
    if (!booting && token && !locked) void load(page, loaded && !data.paymentsMonth && (page === 'dashboard' || page === 'months'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, booting, locked]);

  // Parcel notices are not push notifications. Poll while a resident is signed in,
  // show existing pending parcels at login, and alert only once for newly created parcels.
  useEffect(() => {
    if (!token || role !== 'user' || locked || booting) return;
    let active = true;
    let firstCheck = true;
    parcelNoticeIds.current = new Set();

    const checkParcelNotices = async () => {
      try {
        const result = await call<{ notices?: Array<{ id: number; flat: string; courier?: string; status: string }> }>(
          { action: 'listPendingParcelNotifications' },
          token,
        );
        if (!active) return;
        const notices = result.notices ?? [];
        const pending = notices.filter((notice) => notice.status === 'pending');
        const unseen = firstCheck ? pending : pending.filter((notice) => !parcelNoticeIds.current.has(notice.id));
        notices.forEach((notice) => parcelNoticeIds.current.add(notice.id));
        if (unseen.length) {
          const first = unseen[0];
          const summary =
            unseen.length === 1
              ? `A parcel for flat ${first.flat}${first.courier ? ` from ${first.courier}` : ''} is awaiting collection.`
              : `${unseen.length} parcels are awaiting collection, including flat ${first.flat}.`;
          showAppDialog('Parcel delivery notification', `${summary} Open the parcel details to view the photo and collection options.`, [
            { text: 'Later', style: 'cancel' },
            {
              text: 'View parcel details',
              onPress: () => {
                setSelectedParcelNoticeId(first.id);
                setPage('visitor-access');
              },
            },
          ]);
        }
        firstCheck = false;
      } catch {
        // A temporary network error should not block login; the next poll retries.
      }
    };

    void checkParcelNotices();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void checkParcelNotices();
    }, 45_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkParcelNotices();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [token, role, locked, booting]);

  // Months screen holds just the selected month's payments: fetch when another month is picked
  useEffect(() => {
    if (token && loaded && page === 'months' && month && data.paymentsMonth && data.paymentsMonth !== month)
      void load('months', true, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const save = useCallback(
    async (body: ActionBody, okMessage?: string): Promise<boolean> => {
      try {
        await call(body, token);
      } catch (e) {
        if (isAuthError(e)) logout('Your session has expired. Please sign in again.');
        else showToast(errText(e));
        return false;
      }
      if (body.action === 'changePassword') {
        logout('Password changed. Please sign in with the new password.');
        return true;
      }
      if (okMessage) showToast(okMessage);
      await load(page, true);
      return true;
    },
    [token, page, load, logout, showToast],
  );

  // Visitor Access is strictly a resident-only mobile screen. Filter it from admin navigation
  // even if role aliases or feature configuration accidentally include it.
  const pages = useMemo(
    () => availablePages(role, data.features).filter((p) => p.id !== 'visitor-access' || role === 'user'),
    [role, data.features],
  );

  // Security accounts have a dedicated native workflow instead of the resident dashboard.
  useEffect(() => {
    if (role === 'security' && page === 'dashboard') setPage('security-desk');
    else if (role === 'developer' && page === 'dashboard') setPage('feature-config');
  }, [role, page]);
  const { tabs, more } = useMemo(() => splitTabs(pages, role), [pages, role]);
  const current = pages.find((p) => p.id === page) ?? tabs[0];
  const inTabs = tabs.some((t) => t.id === current?.id);
  const showMore = page === 'more' || (!inTabs && !!current && page !== 'more');

  // Android back: sub-pages opened from More return to More
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (auth && !inTabs && page !== 'more') {
        setPage('more');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [auth, inTabs, page]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(page, true);
    setRefreshing(false);
  };
  const updateAppLock = async (c: AppLockConfig) => {
    await saveAppLock(c);
    setAppLockState(c);
  };

  // ---------------- render ----------------
  if (booting) return <Loading />;
  if (!auth) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="#F5FAF5" />
        <Login
          notice={notice}
          onLoggedIn={async (a) => {
            await writeSession(a);
            setNotice('');
            setLocked(false);
            setAuth(a);
          }}
        />
      </>
    );
  }
  if (locked) return <LockScreen appLock={appLock} onUnlock={() => setLocked(false)} />;

  if (data.maintenanceMode?.enabled && role === 'user') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <Text style={s.title}>Under maintenance</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>
            {data.maintenanceMode.message || 'System maintenance in progress. Please try again shortly.'}
          </Text>
          <Button title="Retry" onPress={() => load(page)} />
          <Button title="Sign out" kind="secondary" onPress={() => logout()} />
        </View>
      </SafeAreaView>
    );
  }

  const props: ScreenProps = {
    data,
    admin,
    superAdmin,
    flat,
    username: auth.user.name,
    save,
    token,
    onNavigate: (p: string) => setPage(p),
  };
  const activeId = showMore ? 'more' : (current?.id ?? 'dashboard');
  const title = page === 'more' ? 'More' : (current?.label ?? 'Dashboard');

  const renderPage = () => {
    // Block direct/stale navigation to the resident visitor screen for every non-resident role.
    if (page === 'visitor-access' && role !== 'user') return <Dashboard {...props} />;
    if (page === 'more' || (!current && page !== 'dashboard'))
      return (
        <More
          {...props}
          items={more}
          role={role ?? 'user'}
          onOpen={setPage}
          appLock={appLock}
          onAppLock={updateAppLock}
          onLogout={() => logout()}
        />
      );
    switch (current?.id as MobilePage | undefined) {
      case 'months':
        return (
          <Months
            {...props}
            month={month}
            onSelectMonth={(m) => {
              setMonth(m);
              void writeMonth(m);
            }}
          />
        );
      case 'mymaintenance':
        return <MyMaintenance {...props} />;
      case 'tickets':
        return <Tickets {...props} />;
      case 'hall':
        return <Bookings {...props} kind="hall" />;
      case 'gym':
        return <Bookings {...props} kind="gym" />;
      case 'polls':
        return <Polls {...props} />;
      case 'events':
        return <Events {...props} />;
      case 'corpus':
        return <Corpus {...props} />;
      case 'flats':
        return <Flats {...props} />;
      case 'summary':
        return <FinancialSummary {...props} />;
      case 'notifications':
        return <Notifications {...props} />;
      case 'flat-users':
        return <FlatUsers {...props} />;
      case 'audit':
        return <Audit {...props} />;
      case 'service-contacts':
        return <ServiceContacts {...props} />;
      case 'security-desk':
        return <SecurityDesk {...props} />;
      case 'visitor-access':
        return (
          <VisitorAccess {...props} parcelNoticeId={selectedParcelNoticeId} onClearParcelNotice={() => setSelectedParcelNoticeId(null)} />
        );
      case 'contact':
        return <Contact {...props} />;
      case 'contact-submissions':
        return <ContactSubmissions {...props} />;
      case 'settings':
        return <Settings {...props} />;
      case 'backups':
        return <Backups {...props} />;
      case 'users':
        return <Users {...props} />;
      case 'feature-config':
        return <FeatureConfiguration {...props} />;
      case 'developer-accounts':
        return <DeveloperAccounts {...props} />;
      case 'security':
        return <SecurityCenter {...props} />;
      default:
        return <Dashboard {...props} />;
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <View style={s.topBar}>
        <View>
          <Text style={s.topBarTitle}>{title}</Text>
          <Text style={s.topBarSub}>{data.settings.orgName || APP_BRAND_NAME}</Text>
        </View>
        {!inTabs && page !== 'more' && (
          <TouchableOpacity onPress={() => setPage('more')} accessibilityRole="button" accessibilityLabel="Back to More">
            <Text style={s.topBarSub}>‹ More</Text>
          </TouchableOpacity>
        )}
      </View>
      {!loaded && data.me == null ? (
        <Loading />
      ) : loadError && !loaded ? (
        <ErrorState text={loadError} onRetry={() => load(page)} />
      ) : (
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
        >
          {loadError ? <ErrorState text={loadError} onRetry={() => load(page)} /> : !loaded ? <Loading /> : renderPage()}
        </ScrollView>
      )}
      {!!toast && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={dismissAppDialog}>
        <Pressable
          onPress={dismissAppDialog}
          style={{ flex: 1, backgroundColor: 'rgba(20,12,40,0.48)', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: BORDER,
              padding: 20,
              width: '100%',
              maxWidth: 440,
              alignSelf: 'center',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: DARK }}>{dialog?.title}</Text>
            {!!dialog?.message && <Text style={{ fontSize: 14, color: MUTED, marginTop: 10, lineHeight: 20 }}>{dialog.message}</Text>}
            <View style={{ marginTop: 18, gap: 8 }}>
              {(dialog?.buttons ?? []).map((button, index) => (
                <TouchableOpacity
                  key={`${button.text}-${index}`}
                  onPress={() => {
                    dismissAppDialog();
                    void button.onPress?.();
                  }}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: button.style === 'destructive' ? BAD : button.style === 'cancel' ? BORDER : GREEN,
                    backgroundColor: button.style === 'destructive' ? '#fff7f6' : button.style === 'cancel' ? '#fff' : GREEN,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: button.style === 'destructive' ? BAD : button.style === 'cancel' ? MUTED : '#fff',
                      fontWeight: '700',
                      fontSize: 15,
                    }}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <View style={s.nav} accessibilityRole="tablist">
        {[
          ...tabs.map((t) => ({
            id: t.id,
            label: t.id === 'mymaintenance' ? 'My dues' : t.label.replace('Party Hall', 'Hall').replace('Gym Booking', 'Gym'),
          })),
          { id: 'more', label: 'More' },
        ].map((t) => {
          const Icon = ICONS[t.id] ?? MoreHorizontal;
          const on = activeId === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={s.navItem}
              onPress={() => setPage(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Icon size={22} color={on ? GREEN : '#5f5a74'} strokeWidth={on ? 2.3 : 2} />
              <Text style={on ? s.navTextActive : s.navText} numberOfLines={1}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
