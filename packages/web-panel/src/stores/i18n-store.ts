import { create } from 'zustand';

export type Language = 'cn' | 'en';

export const translations = {
  cn: {
    // Shell & Nav
    dashboard: '控制台',
    reviewQueue: '审核队列',
    activity: '审计日志',
    environment: '当前环境',
    activeEnv: '活动环境',
    workspace: '工作区',
    online: '在线',
    offline: '离线',
    localProfile: '本地部署配置',

    // User Dropdown
    signedInAs: '已登录为',
    profileSettings: '个人资料设置',
    switchAccount: '切换账户',
    switchingAccount: '正在切换账户...',
    accountSwitched: '账户切换成功。',
    accountSwitchFailed: '账户切换失败。',
    securityKeys: '安全与密钥',
    logOut: '安全退出',
    loggingOut: '正在退出操作员会话...',
    availableAccounts: '可用账户',
    signedInRole: '当前角色',

    // Profile Modal
    profileTitle: '个人资料设置',
    displayName: '显示名称',
    displayNamePlaceholder: '请输入显示名称',
    operatorHandle: '操作员代号',
    cancel: '取消',
    saveChanges: '保存修改',

    // Security Modal
    securityTitle: '安全与 API 密钥',
    activeToken: '当前会话令牌',
    tokenDesc: '此令牌用于向 TrapMap fastify API 验证您的身份。请妥善保管。',
    tokenCopied: '令牌已复制到剪贴板！',
    securityLevel: '会话安全级别',
    securityLevelDesc: '5级 - 管理员权限',
    close: '关闭',

    // Dashboard translations
    systemDashboard: '系统控制台',
    dashboardDesc: '用于监测服务健康状况、队列和治理积压工作的工作台。',
    refreshMetrics: '刷新指标',
    refreshing: '正在刷新...',
    serviceHealth: '服务集成健康状况',
    noServices: '未检测到活动服务。',
    quickActions: '快捷操作',
    reviewGovQueue: '审查治理队列',
    auditLogs: '审计日志列表',
    activeIncidents: '活动事件',
    allClear: '系统运行正常，无活跃事件。',

    // Review Queue Page
    reviewQueueTitle: '治理审核队列',
    reviewQueueDesc: '审核被拦截的知识、工件或潜在的安全陷阱。',
    searchPlaceholder: '搜索条目或描述...',
    allRisk: '所有风险级别',
    highRisk: '高风险',
    mediumRisk: '中风险',
    lowRisk: '低风险',
    sortHighestRisk: '风险最高',
    sortLongestWaiting: '等待最久',
    sortNewest: '最新创建',
    sortOldest: '最早创建',
    sourceLabel: '来源',
    allSources: '所有来源',
    statusLabel: '状态',
    allStatus: '所有状态',
    noReviewsFound: '未找到待审核的条目。',
    riskLevel: '风险级别',
    timeElapsed: '已等待',
    actionRequired: '需要处理',
    resolved: '已解决',
    rejected: '已拒绝',
    approved: '已批准',
    viewDetails: '查看详情',

    // Review Details Page
    reviewDetailsTitle: '审核详情',
    backToQueue: '返回队列',
    entryInformation: '条目基本信息',
    originalPayload: '原始有效载荷 (Payload)',
    reviewDecisions: '审核判定决策',
    approveAction: '批准导入',
    rejectAction: '拒绝导入',
    escalateAction: '上报审核',
    commentsLabel: '判定批注 / 意见',
    commentsPlaceholder: '请在此输入审核判定说明...',
    decisionSuccess: '决策提交成功！',
    loadingDetails: '正在加载审核条目详情...',
    notFound: '未找到条目',
    profileUpdated: '个人资料更新成功。',
    profileUpdateFailed: '更新个人资料失败。',
    metricsRefreshed: '控制台指标刷新成功。',
    metricsRefreshFailed: '刷新指标失败。',
    jsonSaved: 'JSON 配置已成功保存。',
    jsonSaveFailed: '保存 JSON 配置失败。',
    decisionFailed: '提交决策失败。',

    // Activity Page
    activityTitle: '系统审计日志',
    activityDesc: '追踪和审计手动操作、决策与系统事件。',
    searchLogs: '搜索日志',
    searchLogsPlaceholder: '搜索操作员、事件...',
    typeFilter: '分类筛选',
    allTypes: '所有类型',
    decisions: '判定决策',
    interventions: '人工干预',
    systemIngestion: '系统导入',
    noActivityLogs: '暂无审计日志',
    noActivityLogsDesc: '暂无审计日志记录。',
    noMatchedLogsDesc: '没有匹配该筛选条件的日志。',
  },
  en: {
    // Shell & Nav
    dashboard: 'Dashboard',
    reviewQueue: 'Review Queue',
    activity: 'Activity',
    environment: 'Environment',
    activeEnv: 'Active Environment',
    workspace: 'Workspace',
    online: 'ONLINE',
    offline: 'OFFLINE',
    localProfile: 'Local deployment profile',

    // User Dropdown
    signedInAs: 'Signed in as',
    profileSettings: 'Profile Settings',
    switchAccount: 'Switch Account',
    switchingAccount: 'Switching account...',
    accountSwitched: 'Account switched.',
    accountSwitchFailed: 'Failed to switch account.',
    securityKeys: 'Security & Keys',
    logOut: 'Log Out',
    loggingOut: 'Logging out of operator session...',
    availableAccounts: 'Available Accounts',
    signedInRole: 'Signed-in Role',

    // Profile Modal
    profileTitle: 'Profile Settings',
    displayName: 'Display Name',
    displayNamePlaceholder: 'Enter display name',
    operatorHandle: 'Operator Handle',
    cancel: 'Cancel',
    saveChanges: 'Save Changes',

    // Security Modal
    securityTitle: 'Security & API Keys',
    activeToken: 'Active Session Token',
    tokenDesc: 'This token identifies this session to the TrapMap fastify API. Keep it private.',
    tokenCopied: 'Token copied to clipboard!',
    securityLevel: 'Session Security Level',
    securityLevelDesc: 'Level 5 - Administrator Privileges',
    close: 'Close',

    // Dashboard translations
    systemDashboard: 'System Dashboard',
    dashboardDesc: 'Operational dashboard for service health, queues, and governance backlogs.',
    refreshMetrics: 'Refresh Metrics',
    refreshing: 'Refreshing...',
    serviceHealth: 'Service Integration Health',
    noServices: 'No active services detected.',
    quickActions: 'Quick Actions',
    reviewGovQueue: 'Review Governance Queue',
    auditLogs: 'Audit Logs',
    activeIncidents: 'Active Incidents',
    allClear: 'All clear. No active incidents.',

    // Review Queue Page
    reviewQueueTitle: 'Governance Review Queue',
    reviewQueueDesc: 'Approve, reject, or escalate intercepted knowledge entries and skills.',
    searchPlaceholder: 'Search entries or descriptions...',
    allRisk: 'All Risks',
    highRisk: 'High Risk',
    mediumRisk: 'Medium Risk',
    lowRisk: 'Low Risk',
    sortHighestRisk: 'Highest Risk',
    sortLongestWaiting: 'Longest Waiting',
    sortNewest: 'Newest',
    sortOldest: 'Oldest',
    sourceLabel: 'Source',
    allSources: 'All Sources',
    statusLabel: 'Status',
    allStatus: 'All Statuses',
    noReviewsFound: 'No review items found.',
    riskLevel: 'Risk Level',
    timeElapsed: 'Waiting for',
    actionRequired: 'Action Required',
    resolved: 'Resolved',
    rejected: 'Rejected',
    approved: 'Approved',
    viewDetails: 'View Details',

    // Review Details Page
    reviewDetailsTitle: 'Review Details',
    backToQueue: 'Back to Queue',
    entryInformation: 'Entry Information',
    originalPayload: 'Original Payload',
    reviewDecisions: 'Review Decisions',
    approveAction: 'Approve Entry',
    rejectAction: 'Reject Entry',
    escalateAction: 'Escalate Review',
    commentsLabel: 'Decision Comments / Notes',
    commentsPlaceholder: 'Enter justifications or decision context here...',
    decisionSuccess: 'Decision submitted successfully!',
    loadingDetails: 'Loading review details...',
    notFound: 'Entry not found',
    profileUpdated: 'Profile updated successfully.',
    profileUpdateFailed: 'Failed to update profile.',
    metricsRefreshed: 'Dashboard metrics refreshed successfully.',
    metricsRefreshFailed: 'Failed to refresh dashboard metrics.',
    jsonSaved: 'JSON configuration saved successfully.',
    jsonSaveFailed: 'Failed to save JSON configuration.',
    decisionFailed: 'Failed to submit decision.',

    // Activity Page
    activityTitle: 'System Activity Feed',
    activityDesc: 'Trace and audit manual actions, decisions, and system events.',
    searchLogs: 'Search Logs',
    searchLogsPlaceholder: 'Search actor, event...',
    typeFilter: 'Type Filter',
    allTypes: 'All Types',
    decisions: 'Decisions',
    interventions: 'Interventions',
    systemIngestion: 'System Ingestion',
    noActivityLogs: 'No Activity Logs',
    noActivityLogsDesc: 'No activities have been recorded in the audit log yet.',
    noMatchedLogsDesc: 'No logs match your filter criteria.',
  },
};

type I18nStore = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof (typeof translations)['en']) => string;
};

const getInitialLanguage = (): Language => {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('trapmap-language');
      if (saved === 'cn' || saved === 'en') {
        return saved;
      }
    }
  } catch (e) {
    // Ignore storage availability errors
  }
  return 'cn';
};

export const useI18nStore = create<I18nStore>((set, get) => ({
  language: getInitialLanguage(),
  setLanguage: (language) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('trapmap-language', language);
    }
    set({ language });
  },
  t: (key) => {
    const lang = get().language;
    return translations[lang][key] || translations.en[key] || String(key);
  },
}));
