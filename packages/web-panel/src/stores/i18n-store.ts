import { create } from 'zustand';

type Language = 'cn' | 'en';

const translations = {
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

    // Dashboard Cards & Badges
    serviceHealthLabel: '服务集成健康状况',
    pendingReviewsLabel: '待审核任务',
    failedJobsLabel: '失败任务',
    throughputLabel: '吞吐量',
    badgeHealthy: '健康',
    badgeWatch: '待观察',
    badgeAttention: '需处理',
    badgeClear: '无积压',
    badgeStable: '稳定',
    lastHealthCheck: '上次健康检查',
    backlogItems: '个任务积压中',
    noIncidents: '当前无异常事件',
    buildLabel: '构建版本',

    // Review Queue Dashboard Cards
    queuePulse: '队列状态',
    queuePulseDesc: '应用当前筛选后可见的条目。',
    highestRisk: '最高风险',
    highestRiskDesc: '优先处理有 Schema、正确性或重复压力的条目。',
    noItems: '无条目',
    focus: '关注点',
    allStatuses: '所有状态',
    focusDesc: '基于状态、来源、风险和搜索的当前队列分片。',
    searchQuery: '搜索查询',
    searchQueryPlaceholder: '搜索标题、描述或 ID...',
    sortBy: '排序方式',

    // Activity Page Dashboard Cards
    eventVolume: '事件总量',
    eventVolumeDesc: '应用当前筛选后可见的审计日志条目。',
    searchFocus: '搜索范围',
    allOperatorsAndEvents: '所有操作员和事件',
    searchFocusDesc: '按操作员、标题或事件描述缩小范围。',
    typeSlice: '分类切片',
    typeSliceDesc: '按事件类别审查操作活动。',
    operationalTimeline: '操作时间线',
    operationalTimelineDesc: '按时间顺序排列的判定决策、人工干预和运行时操作流。',

    // Dashboard Header
    runtimeSnapshot: '运行时快照',
    supervisionTitle: '治理运行状态处于活跃监控下。',
    supervisionDesc: '集中视图展示当前部署配置的服务健康状况、队列压力和高信号事件。',
    lastCheck: '上次检查',
    submitted: '已提交',
    servicesCount: '个服务',
    checkedAt: '检查于',
    reviewGovQueueDesc: '直接进入受治理的审核工作区。',
    auditLogsDesc: '在单一时间线中检查操作员和系统操作。',

    // Shared / Global UI Controls
    confirm: '确认',
    viewRelatedEntry: '查看相关条目',
    noDataAvailable: '暂无数据',
    noItemsMatched: '没有找到符合筛选条件的条目。',
    systemError: '系统错误',
    retryRequest: '重试请求',

    // Review Details Page Extra Translations
    govDetailWorkspace: '治理详情工作区',
    backToReviewQueue: '返回审核队列',
    reviewDetailsDesc: '详细的治理元数据、验证报告、JSON 配置以及审计记录。',
    reviewWorkspace: '审核工作区',
    loadingReviewItem: '正在加载审核条目...',
    noSummary: '暂无摘要说明。',
    automatedValidationReports: '自动验证报告',
    itemAuditTimeline: '条目审计时间线',
    noTimelineEntries: '未记录时间线条目。',
    assignedReviewer: '分配的审核员',
    unassigned: '未指派',
    createdAt: '创建于',

    // Decision Confirmation Dialog
    approveReviewItem: '批准审核条目',
    rejectReviewItem: '拒绝审核条目',
    returnReviewItem: '退回审核条目以进行修改',
    confirmAction: '确认操作',
    approveConfirmMsg: '您确定要批准此治理条目吗？批准的条目将被导入平台系统。',
    rejectConfirmMsg: '您确定要拒绝此条目吗？被拒绝的条目将被永久锁定，并附上指定的理由。',
    returnConfirmMsg: '您确定要将此条目退回给贡献者以进行修改吗？',

    // Review Action Bar
    govActionPanel: '治理操作面板',
    govActionPanelDesc: '提交您的正式决策。拒绝或退回修改需要提供详细的判定理由。',
    decisionRationaleLabel: '决策理由 / 批注',
    decisionRationalePlaceholder: '输入批注。拒绝和退回修改时必填。',
    approveBtn: '批准',
    rejectBtn: '拒绝',
    returnBtn: '退回修改',
    rationaleRequiredWarning: '* 提交拒绝或退回修改之前，必须填写理由。',

    // File Editor / JSON Editor Panel
    fileEditorTitle: '文件编辑器',
    fileEditorDesc: '选择审核工件、检查内容，并保存审计后的修改。',
    unsavedChangesBadge: '未保存的修改',
    syncedBadge: '已同步',
    reviewFilesTitle: '审核文件列表',
    noFileSelected: '未选择文件',
    selectFileFromList: '从列表中选择一个文件。',
    lastEdited: '最后修改时间:',
    editRationaleLabel: '修改理由',
    editRationalePlaceholder: '为什么进行此修改？',
    formatJsonBtn: '格式化 JSON',
    resetBtn: '重置',
    saveFileChangesBtn: '保存文件修改',
    jsonValidationError: 'JSON 验证错误:',
    editRationaleRequiredWarning: '保存修改之前必须填写修改理由。',
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

    // Dashboard Cards & Badges
    serviceHealthLabel: 'Service Health',
    pendingReviewsLabel: 'Pending Reviews',
    failedJobsLabel: 'Failed Jobs',
    throughputLabel: 'Throughput',
    badgeHealthy: 'Healthy',
    badgeWatch: 'Watch',
    badgeAttention: 'Attention',
    badgeClear: 'Clear',
    badgeStable: 'Stable',
    lastHealthCheck: 'Last health check',
    backlogItems: 'items in candidate backlog',
    noIncidents: 'No active incidents',
    buildLabel: 'Build',

    // Review Queue Dashboard Cards
    queuePulse: 'Queue Pulse',
    queuePulseDesc: 'Items currently visible after filter application.',
    highestRisk: 'Highest Risk',
    highestRiskDesc: 'Prioritize entries with schema, correctness, or duplicate pressure.',
    noItems: 'No items',
    focus: 'Focus',
    allStatuses: 'All statuses',
    focusDesc: 'Current queue slice based on status, source, risk, and search.',
    searchQuery: 'Search Query',
    searchQueryPlaceholder: 'Search title, description or ID...',
    sortBy: 'Sort By',

    // Activity Page Dashboard Cards
    eventVolume: 'Event Volume',
    eventVolumeDesc: 'Visible timeline events after applying current filters.',
    searchFocus: 'Search Focus',
    allOperatorsAndEvents: 'All operators and events',
    searchFocusDesc: 'Narrow by actor, title, or event description.',
    typeSlice: 'Type Slice',
    typeSliceDesc: 'Review operational activity by event class.',
    operationalTimeline: 'Operational Timeline',
    operationalTimelineDesc:
      'Ordered stream of review decisions, manual interventions, and runtime actions.',

    // Dashboard Header
    runtimeSnapshot: 'Runtime Snapshot',
    supervisionTitle: 'Governance runtime is under active supervision.',
    supervisionDesc:
      'Centralized view of service health, queue pressure, and high-signal incidents for the current deployment profile.',
    lastCheck: 'Last Check',
    submitted: 'Submitted',
    servicesCount: 'services',
    checkedAt: 'Checked',
    reviewGovQueueDesc: 'Move directly into the governed review workspace.',
    auditLogsDesc: 'Inspect operator and system actions in a single timeline.',

    // Shared / Global UI Controls
    confirm: 'Confirm',
    viewRelatedEntry: 'View Related Entry',
    noDataAvailable: 'No Data Available',
    noItemsMatched: 'No items found matching your filters.',
    systemError: 'System Error',
    retryRequest: 'Retry Request',

    // Review Details Page Extra Translations
    govDetailWorkspace: 'Governance Detail Workspace',
    backToReviewQueue: 'Back to Review Queue',
    reviewDetailsDesc:
      'Detailed governance metadata, validation reports, JSON configuration, and audit records.',
    reviewWorkspace: 'Review Workspace',
    loadingReviewItem: 'Loading review item...',
    noSummary: 'No summary available.',
    automatedValidationReports: 'Automated Validation Reports',
    itemAuditTimeline: 'Item Audit Timeline',
    noTimelineEntries: 'No timeline entries recorded.',
    assignedReviewer: 'Assigned Reviewer',
    unassigned: 'Unassigned',
    createdAt: 'Created At',

    // Decision Confirmation Dialog
    approveReviewItem: 'Approve Review Item',
    rejectReviewItem: 'Reject Review Item',
    returnReviewItem: 'Return Review Item for Correction',
    confirmAction: 'Confirm Action',
    approveConfirmMsg:
      'Are you sure you want to approve this governance item? Approved entries are ingested into the platform system.',
    rejectConfirmMsg:
      'Are you sure you want to reject this entry? Rejected items will be permanently locked with the specified rationale.',
    returnConfirmMsg:
      'Are you sure you want to return this entry to the contributor for correction?',

    // Review Action Bar
    govActionPanel: 'Governance Action Panel',
    govActionPanelDesc:
      'Submit your official decision. Rejecting or returning for correction requires providing a detailed rationale.',
    decisionRationaleLabel: 'Decision Rationale / Notes',
    decisionRationalePlaceholder: 'Enter notes. Required for Reject and Return For Correction.',
    approveBtn: 'Approve',
    rejectBtn: 'Reject',
    returnBtn: 'Return For Correction',
    rationaleRequiredWarning:
      '* Rationale is required before submitting Rejection or Return For Correction.',

    // File Editor / JSON Editor Panel
    fileEditorTitle: 'File Editor',
    fileEditorDesc: 'Select a review artifact, inspect content, and save audited edits.',
    unsavedChangesBadge: 'Unsaved Changes',
    syncedBadge: 'Synced',
    reviewFilesTitle: 'Review Files',
    noFileSelected: 'No file selected',
    selectFileFromList: 'Select a file from the list.',
    lastEdited: 'Last edited:',
    editRationaleLabel: 'Edit Rationale',
    editRationalePlaceholder: 'Why are you making this change?',
    formatJsonBtn: 'Format JSON',
    resetBtn: 'Reset',
    saveFileChangesBtn: 'Save File Changes',
    jsonValidationError: 'JSON Validation Error:',
    editRationaleRequiredWarning: 'Edit rationale is required before saving your edits.',
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
  } catch (_e) {
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
