import {
  Avatar,
  Button,
  Chip,
  Dropdown,
  Header,
  Label,
  Modal,
  Separator,
  toast,
} from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, type ReactElement, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { getAdminPanelApi } from '@trapmap/web-panel/services/admin-panel-service-context';
import { SkeletonBlock } from '@trapmap/web-panel/shared/ui/skeleton-block';
import { useI18nStore } from '@trapmap/web-panel/stores/i18n-store';
import { useSessionStore } from '@trapmap/web-panel/stores/session-store';
import { useThemeStore } from '@trapmap/web-panel/stores/theme-store';

type NavigationItem = {
  end?: boolean;
  labelKey: 'dashboard' | 'reviewQueue' | 'artifacts' | 'trapGraph' | 'skillGraph' | 'activity';
  to: string;
  icon: () => ReactElement;
};

const DashboardIcon = () => (
  <svg
    role="img"
    aria-label="Dashboard"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Dashboard</title>
    <rect x={3} y={3} width={7} height={7} rx={1} />
    <rect x={14} y={3} width={7} height={7} rx={1} />
    <rect x={14} y={14} width={7} height={7} rx={1} />
    <rect x={3} y={14} width={7} height={7} rx={1} />
  </svg>
);

const QueueIcon = () => (
  <svg
    role="img"
    aria-label="Review Queue"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Review Queue</title>
    <path
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H7a2 2 0 00-2 2v2m14-4V5a2 2 0 00-2-2H7a2 2 0 00-2 2v2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArtifactsIcon = () => (
  <svg
    role="img"
    aria-label="Artifacts"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Artifacts</title>
    <path
      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-18L4 7m8 4L4 7m0 0v10l8 4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrapGraphIcon = () => (
  <svg
    role="img"
    aria-label="Trap Graph"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Trap Graph</title>
    <path
      d="M18 3a3 3 0 00-3 3c0 .3.05.58.13.85l-4.5 2.25A3 3 0 008 9a3 3 0 00-2.87 2.15L3.6 15.3a3 3 0 00-.6.7 3 3 0 105.7-.7l1.53-4.15A3 3 0 0012 11c.7 0 1.34-.24 1.84-.65l4.5 2.25c-.08.27-.13.55-.13.85a3 3 0 103-3 3 3 0 00-3 3c0-.3-.05-.58-.13-.85l-4.5-2.25A3 3 0 0016 9c.7 0 1.34-.24 1.84-.65l4.5 2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SkillGraphIcon = () => (
  <svg
    role="img"
    aria-label="Skill Graph"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Skill Graph</title>
    <path
      d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ActivityIcon = () => (
  <svg
    role="img"
    aria-label="Activity"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Activity</title>
    <path
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UserIcon = () => (
  <svg
    role="img"
    aria-label="User Settings"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>User Settings</title>
    <path
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LockIcon = () => (
  <svg
    role="img"
    aria-label="Security settings"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Security Settings</title>
    <path
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg
    role="img"
    aria-label="Toggle dropdown"
    className="h-4 w-4 shrink-0 transition-transform duration-200"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Toggle Dropdown</title>
    <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TranslateIcon = () => (
  <svg
    role="img"
    aria-label="Translate"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>Translate</title>
    <path
      d="M3 5h12M9 3v2m-4.5 9h9M5 5c.5 4.5 4.5 7 4.5 7s4.5-2.5 4.5-7M6 14.5c0-1.5 1.5-2.5 3-2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ThemeIcon = ({
  darkLabel,
  lightLabel,
  theme,
}: {
  darkLabel: string;
  lightLabel: string;
  theme: 'dark' | 'light';
}) => (
  <svg
    role="img"
    aria-label={theme === 'dark' ? lightLabel : darkLabel}
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <title>{theme === 'dark' ? lightLabel : darkLabel}</title>
    {theme === 'dark' ? (
      <path
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path
        d="M21 12.79A9 9 0 1111.21 3c0 .34.02.67.05 1A7 7 0 0020 11.74c.35.03.68.05 1 .05z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const navigationItems: NavigationItem[] = [
  { to: '/', labelKey: 'dashboard', end: true, icon: DashboardIcon },
  { to: '/reviews', labelKey: 'reviewQueue', icon: QueueIcon },
  { to: '/artifacts', labelKey: 'artifacts', icon: ArtifactsIcon },
  { to: '/trap-graph', labelKey: 'trapGraph', icon: TrapGraphIcon },
  { to: '/skill-graph', labelKey: 'skillGraph', icon: SkillGraphIcon },
  { to: '/activity', labelKey: 'activity', icon: ActivityIcon },
];

export function AppShell(): ReactElement {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'profile' | 'security' | 'switch-account' | null>(
    null,
  );

  const sessionRequest = useSessionStore((state) => state.request);
  const setSession = useSessionStore((state) => state.setSession);
  const setLoading = useSessionStore((state) => state.setLoading);
  const setError = useSessionStore((state) => state.setError);
  const setSwitchError = useSessionStore((state) => state.setSwitchError);

  const [displayNameInput, setDisplayNameInput] = useState('');
  const location = useLocation();
  const { t, language, setLanguage } = useI18nStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  useEffect(() => {
    document.documentElement.lang = language === 'cn' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    if (sessionRequest.status === 'idle') {
      setLoading();
      getAdminPanelApi()
        .loadSession()
        .then((data) => {
          setSession(data);
          if (data.user) {
            setDisplayNameInput(data.user.displayName);
          }
        })
        .catch((err: Error) => setError(err.message));
    } else if (sessionRequest.payload?.user && !displayNameInput) {
      setDisplayNameInput(sessionRequest.payload.user.displayName);
    }
  }, [
    sessionRequest.status,
    sessionRequest.payload,
    setSession,
    setLoading,
    setError,
    displayNameInput,
  ]);

  const user = sessionRequest.payload?.user;
  const token = sessionRequest.payload?.token;
  const accounts = sessionRequest.payload?.accounts ?? [];
  const activeAccountId = sessionRequest.payload?.activeAccountId ?? null;

  const getInitials = (name?: string) => {
    if (!name) return 'OP';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const handleSaveProfile = () => {
    if (sessionRequest.payload && user) {
      const updated = {
        ...sessionRequest.payload,
        user: {
          ...user,
          displayName: displayNameInput,
        },
      };
      setSession(updated);
      setActiveModal(null);
      toast.success(t('profileUpdated'));
    }
  };

  const handleDropdownAction = (key: string | number) => {
    if (key === 'profile') {
      setActiveModal('profile');
    } else if (key === 'switch-account') {
      setActiveModal('switch-account');
    } else if (key === 'security') {
      setActiveModal('security');
    } else if (key === 'logout') {
      toast.info(t('loggingOut'));
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === activeAccountId) {
      setActiveModal(null);
      return;
    }

    toast.info(t('switchingAccount'));

    try {
      const session = await getAdminPanelApi().switchSessionAccount(accountId);
      setSession(session);
      setSwitchError(null);
      setDisplayNameInput(session.user?.displayName ?? '');
      setActiveModal(null);
      toast.success(t('accountSwitched'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('accountSwitchFailed');
      setSwitchError(message);
      toast.danger(t('accountSwitchFailed'));
    }
  };

  const getPageTitle = () => {
    if (location.pathname === '/') return t('dashboard');
    if (location.pathname.startsWith('/reviews')) return t('reviewQueue');
    if (location.pathname.startsWith('/artifacts')) return t('artifacts');
    if (location.pathname.startsWith('/trap-graph')) return t('trapGraph');
    if (location.pathname.startsWith('/skill-graph')) return t('skillGraph');
    if (location.pathname === '/activity') return t('activity');
    return t('dashboard');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-panel-bg text-panel-text">
      {/* Sidebar / Sider */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col justify-between border-r border-panel-line bg-panel-surface p-6 select-none">
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-panel-line bg-panel-surface">
              <svg
                role="img"
                aria-label="TrapMap Logo"
                className="h-5 w-5 text-panel-text"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <title>TrapMap Logo</title>
                <path
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.83V8.072a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <span className="text-lg font-semibold tracking-[-0.4px] text-panel-text">
                TrapMap
              </span>
              <span className="block font-mono text-[12px] font-medium uppercase text-panel-muted">
                {t('adminWorkspace')}
              </span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'border border-panel-line bg-panel-text text-[var(--panel-bg)]'
                        : 'border border-transparent text-panel-muted hover:bg-panel-surface-strong hover:text-panel-text'
                    }`
                  }
                  end={item.end ?? false}
                  to={item.to}
                >
                  <Icon />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 border-t border-panel-line pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-[12px] font-medium uppercase text-panel-muted">
              {t('environment')}
            </span>
            <Chip
              className="border border-panel-line bg-panel-surface text-[11px] font-medium text-panel-text"
              size="sm"
            >
              {t('online')}
            </Chip>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl border border-panel-line bg-panel-surface-strong p-3">
            <div className="h-2.5 w-2.5 rounded-full bg-panel-text" />
            <div className="text-xs">
              <p className="font-semibold text-panel-text">team-monolith</p>
              <p className="mt-0.5 font-mono text-[12px] text-panel-muted">{t('localProfile')}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-panel-bg">
        <header className="z-40 flex h-16 shrink-0 items-center justify-between border-b border-panel-line bg-panel-bg/95 px-6 backdrop-blur-md select-none">
          <div className="flex items-center gap-4">
            <Button
              className="lg:hidden p-1 min-w-[32px] h-[32px]"
              variant="tertiary"
              isIconOnly
              onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg
                role="img"
                aria-label={mobileMenuOpen ? t('closeMenu') : t('openMenu')}
                className="h-5 w-5 text-panel-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>{mobileMenuOpen ? t('closeMenu') : t('openMenu')}</title>
                {mobileMenuOpen ? (
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                ) : (
                  <path
                    d="M4 6h16M4 12h16M4 18h16"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                )}
              </svg>
            </Button>

            <div className="hidden items-center gap-2 font-mono text-[12px] font-medium uppercase text-panel-muted lg:flex">
              <span>{t('workspace')}</span>
              <span>/</span>
              <span className="text-panel-text">{getPageTitle()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="tertiary"
              onPress={toggleTheme}
              className="flex h-[32px] min-w-[40px] items-center gap-1.5 rounded-md border border-panel-line bg-panel-surface px-2.5 text-xs font-medium text-panel-muted transition hover:text-panel-text"
            >
              <ThemeIcon
                darkLabel={t('switchToDarkMode')}
                lightLabel={t('switchToLightMode')}
                theme={theme}
              />
              <span>{theme === 'dark' ? t('darkMode') : t('lightMode')}</span>
            </Button>

            <Button
              size="sm"
              variant="tertiary"
              onPress={() => setLanguage(language === 'cn' ? 'en' : 'cn')}
              className="flex h-[32px] min-w-[40px] items-center gap-1.5 rounded-md border border-panel-line bg-panel-surface px-2.5 text-xs font-medium text-panel-muted transition hover:text-panel-text"
            >
              <TranslateIcon />
              <span>{language === 'cn' ? '中文' : 'EN'}</span>
            </Button>

            {user ? (
              <Dropdown>
                <Dropdown.Trigger>
                  <div className="flex cursor-pointer items-center gap-2.5 rounded-full border border-panel-line bg-panel-surface py-1 pl-2.5 pr-3 transition select-none">
                    <Avatar className="h-6 w-6 text-xs animate-none" variant="soft" color="accent">
                      <Avatar.Fallback>{getInitials(user.displayName)}</Avatar.Fallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-panel-text max-w-[120px] truncate">
                      {user.displayName}
                    </span>
                    <ChevronIcon />
                  </div>
                </Dropdown.Trigger>

                <Dropdown.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface shadow-panel">
                  <Dropdown.Menu onAction={handleDropdownAction}>
                    <Dropdown.Section>
                      <Header className="px-3 py-2 text-xs font-normal text-panel-muted border-b border-panel-line/30 mb-1.5">
                        <div className="font-semibold text-panel-text text-sm truncate">
                          {user.displayName}
                        </div>
                        <div className="text-[10px] mt-0.5 truncate text-panel-muted">
                          {user.handle}
                        </div>
                        <div className="mt-1">
                          <Chip
                            className="border border-panel-line bg-panel-surface text-[11px] font-medium text-panel-text"
                            size="sm"
                          >
                            {user.role}
                          </Chip>
                        </div>
                      </Header>
                    </Dropdown.Section>

                    <Dropdown.Section>
                      <Dropdown.Item id="profile" textValue={t('profileSettings')}>
                        <UserIcon />
                        <Label>{t('profileSettings')}</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="switch-account" textValue={t('switchAccount')}>
                        <svg
                          role="img"
                          aria-label={t('switchAccount')}
                          className="h-4 w-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <title>{t('switchAccount')}</title>
                          <path
                            d="M17 20h5V4h-5M7 4H2v16h5m10-8H7m0 0l3-3m-3 3l3 3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <Label>{t('switchAccount')}</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="security" textValue={t('securityKeys')}>
                        <LockIcon />
                        <Label>{t('securityKeys')}</Label>
                      </Dropdown.Item>
                    </Dropdown.Section>

                    <Separator className="bg-panel-line/30 my-1" />

                    <Dropdown.Section>
                      <Dropdown.Item id="logout" textValue={t('logOut')} variant="danger">
                        <svg
                          role="img"
                          aria-label={t('logOut')}
                          className="h-4 w-4 text-rose-400 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <title>{t('logOut')}</title>
                          <path
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <Label>{t('logOut')}</Label>
                      </Dropdown.Item>
                    </Dropdown.Section>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            ) : (
              <div className="h-6 w-24 bg-panel-elevated/40 animate-pulse rounded-full" />
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Suspense fallback={<SkeletonBlock count={6} variant="line" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile Drawer (Left Navigation) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/10 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 bottom-0 left-0 flex w-72 flex-col justify-between border-r border-panel-line bg-panel-surface p-6"
            >
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-panel-line bg-panel-surface">
                      <svg
                        role="img"
                        aria-label="TrapMap Logo"
                        className="h-4.5 w-4.5 text-panel-text"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <title>TrapMap Logo</title>
                        <path
                          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.83V8.072a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <span className="text-base font-semibold text-panel-text">TrapMap</span>
                  </div>
                  <Button
                    variant="tertiary"
                    isIconOnly
                    onPress={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg min-w-[32px] h-[32px]"
                  >
                    <svg
                      role="img"
                      aria-label={t('closeMenu')}
                      className="h-5 w-5 text-panel-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>{t('closeMenu')}</title>
                      <path
                        d="M6 18L18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                      />
                    </svg>
                  </Button>
                </div>

                <nav className="space-y-1.5">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                            isActive
                              ? 'border border-panel-line bg-panel-text text-[var(--panel-bg)]'
                              : 'border border-transparent text-panel-muted hover:bg-panel-surface-strong hover:text-panel-text'
                          }`
                        }
                        end={item.end ?? false}
                        onClick={() => setMobileMenuOpen(false)}
                        to={item.to}
                      >
                        <Icon />
                        <span>{t(item.labelKey)}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              </div>

              <div className="space-y-3 border-t border-panel-line pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[12px] font-medium uppercase text-panel-muted">
                    {t('environment')}
                  </span>
                  <Chip
                    className="border border-panel-line bg-panel-surface text-[11px] font-medium text-panel-text"
                    size="sm"
                  >
                    {t('online')}
                  </Chip>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-panel-line bg-panel-surface-strong p-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-panel-text" />
                  <div>
                    <p className="text-xs font-semibold text-panel-text">team-monolith</p>
                  </div>
                </div>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <Modal
        isOpen={activeModal === 'profile'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-[450px] border border-panel-line bg-panel-surface shadow-panel backdrop-blur rounded-2xl">
              <Modal.Header>
                <Modal.Heading className="text-lg font-bold text-panel-text flex items-center gap-2">
                  <UserIcon /> {t('profileTitle')}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="py-4 space-y-4">
                <div className="flex items-center gap-4 border-b border-panel-line/30 pb-4 mb-2">
                  <Avatar className="h-14 w-14 text-xl" variant="soft" color="accent">
                    <Avatar.Fallback>{user ? getInitials(user.displayName) : 'OP'}</Avatar.Fallback>
                  </Avatar>
                  <div>
                    <h4 className="font-bold text-panel-text">{user?.displayName}</h4>
                    <p className="text-xs text-panel-muted">{user?.handle}</p>
                    <div className="mt-1.5">
                      <Chip
                        size="sm"
                        className="bg-panel-accent/15 text-panel-accent text-[9px] font-bold uppercase tracking-wider px-2 py-0"
                      >
                        {user?.role}
                      </Chip>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="displayName"
                    className="text-xs font-semibold text-panel-muted block"
                  >
                    {t('displayName')}
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    className="w-full bg-[#0a0f1d] border border-panel-line rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-panel-accent transition"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    placeholder={t('displayNamePlaceholder')}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-panel-muted block">
                    {t('operatorHandle')}
                  </span>
                  <div className="bg-[#0a0f1d]/50 border border-panel-line/50 rounded-xl px-4 py-2.5 text-sm text-panel-muted select-none">
                    {user?.handle}
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-3 mt-4">
                <Button variant="secondary" onPress={() => setActiveModal(null)}>
                  {t('cancel')}
                </Button>
                <Button variant="primary" onPress={handleSaveProfile}>
                  {t('saveChanges')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Security & Keys Modal */}
      <Modal
        isOpen={activeModal === 'security'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-[450px] border border-panel-line bg-panel-surface shadow-panel backdrop-blur rounded-2xl">
              <Modal.Header>
                <Modal.Heading className="text-lg font-bold text-panel-text flex items-center gap-2">
                  <LockIcon /> {t('securityTitle')}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="py-4 space-y-4">
                <div className="p-4 rounded-xl bg-panel-elevated/40 border border-panel-line/30 space-y-2">
                  <h4 className="text-xs font-bold text-panel-text uppercase tracking-wider">
                    {t('activeToken')}
                  </h4>
                  <p className="text-xs text-panel-muted leading-relaxed">{t('tokenDesc')}</p>
                  <div className="flex gap-2 items-center mt-3 bg-[#0a0f1d] border border-panel-line rounded-lg px-3 py-2 text-xs font-mono text-panel-accent">
                    <span className="flex-1 truncate">{token || t('noActiveToken')}</span>
                    {token && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        isIconOnly
                        onPress={() => {
                          void navigator.clipboard.writeText(token);
                          toast.success(t('tokenCopied'));
                        }}
                        className="p-1 rounded hover:bg-panel-elevated min-w-[28px] h-[28px]"
                      >
                        <svg
                          role="img"
                          aria-label={t('copyToken')}
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>{t('copyToken')}</title>
                          <path
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                          />
                        </svg>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-panel-muted block">
                    {t('securityLevel')}
                  </span>
                  <div className="flex items-center gap-2 text-sm text-panel-text bg-[#0a0f1d]/50 border border-panel-line/50 rounded-xl px-4 py-2.5 select-none">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span>{t('securityLevelDesc')}</span>
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer className="flex justify-end mt-4">
                <Button variant="primary" onPress={() => setActiveModal(null)}>
                  {t('close')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal
        isOpen={activeModal === 'switch-account'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-[520px] border border-panel-line bg-panel-surface shadow-panel backdrop-blur rounded-2xl">
              <Modal.Header>
                <Modal.Heading className="text-lg font-bold text-panel-text flex items-center gap-2">
                  <UserIcon /> {t('switchAccount')}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="py-4 space-y-4">
                <div className="text-sm text-panel-muted">{t('availableAccounts')}</div>
                <div className="space-y-2">
                  {accounts.map((account) => {
                    const isActive = account.id === activeAccountId;
                    return (
                      <button
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-panel-accent/40 bg-panel-accent/10'
                            : 'border-panel-line/40 bg-panel-elevated/20 hover:border-panel-line hover:bg-panel-elevated/40'
                        }`}
                        key={account.id}
                        onClick={() => void handleSwitchAccount(account.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-panel-text">
                              {account.user.displayName}
                            </div>
                            <div className="text-xs text-panel-muted">{account.user.handle}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-[0.12em] text-panel-muted">
                              {t('signedInRole')}
                            </div>
                            <div className="text-xs font-semibold text-panel-text">
                              {account.user.role}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Modal.Body>
              <Modal.Footer className="flex justify-end mt-4">
                <Button variant="secondary" onPress={() => setActiveModal(null)}>
                  {t('close')}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
