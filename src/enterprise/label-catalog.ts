import type { EnterpriseGeneralSettingsLabels } from "./general-settings-surface";
import type { EnterpriseLoginControllerLabels, EnterpriseOidcCompleteLabels } from "./auth-controller";
import type { EnterpriseAccessSettingsLabels } from "./access-settings-surface";
import type { EnterpriseDeliveryStatusLabels } from "./delivery-status";
import type { EnterpriseSecurityOperationsLabels } from "./security-workspace";
import type { EnterpriseUpstreamHealthControllerLabels } from "./upstream-health-controller";
import type { EnterpriseShellLabels } from "./models";

export type EnterpriseCatalogLocale = "zh-CN" | "en";

export interface EnterpriseCatalogBrand {
  appName: string;
  appDescription: string;
  footerText?: string;
}

export interface EnterpriseStaticLabelCatalog {
  locale: EnterpriseCatalogLocale;
  metadata: { title: string; description: string };
  navigation: { menu: string; close: string; backToMain: string; settings: string; security: string; access: string; upstream: string; general: string; dashboard: string; backToSecurity: string };
  common: { permissionDenied: string; loading: string; retry: string; notAvailable: string; permissionCount: (count: number) => string };
  shell: EnterpriseShellLabels;
  login: EnterpriseLoginControllerLabels;
  security: EnterpriseSecurityOperationsLabels;
  access: EnterpriseAccessSettingsLabels;
  upstream: EnterpriseUpstreamHealthControllerLabels;
  /** Notification outbox delivery wording, shared by every host that sends through EasyAuth notify. */
  delivery: EnterpriseDeliveryStatusLabels;
  notifications: { title: string; description: string; empty: string; loadFailed: string; retry: string; dismiss: string };
  generalSettings: EnterpriseGeneralSettingsLabels;
  /** User-menu identity line; see `resolveEnterpriseIdentityLabel`. */
  identity: { admin: string; user: string; guest: string };
  public: { loginEyebrow: string; loggedOutTitle: string; loggedOutDescription: string; loginAgain: string; footer: string };
  oidcComplete: EnterpriseOidcCompleteLabels;
}

export type EnterpriseCatalogCopyMode = "legacy" | "business";

/**
 * Package-owned bilingual catalog for every shared enterprise surface.
 *
 * Omitted `copyMode` is the exact pre-Customs catalog. Hosts must explicitly
 * opt into business-facing copy so shared-package upgrades cannot rewrite the
 * main EasyTrade application's labels.
 */
export function createEnterpriseLabelCatalog(
  locale: EnterpriseCatalogLocale,
  brand: EnterpriseCatalogBrand,
  copyMode: EnterpriseCatalogCopyMode = "legacy",
): EnterpriseStaticLabelCatalog {
  const catalog = locale === "en" ? englishCatalog(brand) : chineseCatalog(brand);
  if (copyMode === "legacy") return legacyCatalog(catalog);
  return {
    ...catalog,
    access: {
      ...catalog.access,
      authorization: {
        ...catalog.access.authorization,
        authorizationTitle: locale === "en" ? "Permissions service" : "权限服务",
        authorizationDescription:
          locale === "en"
            ? "Business permissions and subject status."
            : "业务权限与主体状态。",
        credential: locale === "en" ? "Service credential" : "服务凭据",
      },
    },
  };
}

function legacyCatalog(catalog: EnterpriseStaticLabelCatalog): EnterpriseStaticLabelCatalog {
  if (catalog.locale === "zh-CN") {
    return {
      ...catalog,
      navigation: { ...catalog.navigation, access: "登录与权限", upstream: "上游监控" },
      login: {
        ...catalog.login,
        oidcErrorTitle: "上游登录失败",
        oidcErrors: {
          access_denied: "上游身份提供方拒绝了本次登录（已取消或被策略拦截）。",
          not_configured: "上游登录未启用或配置不完整。",
          state_mismatch: "登录状态已过期或不匹配，请重新发起登录。",
          missing_code: "回调缺少授权码，请重新发起登录。",
          unreachable: "无法访问上游身份提供方。",
          invalid_response: "上游身份提供方返回了无效响应。",
          invalid_token: "上游令牌校验失败。",
          inactive_user: "该账号已停用。",
          identity_binding_conflict: "当前工作账号无法自动关联已有账号，请联系管理员处理后重试。",
        },
      },
      security: {
        ...catalog.security,
        page: {
          ...catalog.security.page,
          passwordDescription: "定期更新密码；生产工作账号的密码由身份上游管理。",
        },
      },
      access: {
        ...catalog.access,
        page: {
          title: "登录与权限",
          tabsAriaLabel: "登录与权限",
          description: "登录由 Authentik 提供，业务授权由 EasyAuth 提供。",
          loginTab: "登录",
          permissionsTab: "权限",
          authentikTitle: "Authentik 登录",
          authentikDescription: "可信身份与单点登录上游。",
          easyAuthTitle: "EasyAuth 权限",
          easyAuthDescription: "业务权限、范围与导航事实上游。",
          configured: "已配置",
          notConfigured: "未配置",
          endpoint: "服务地址",
          lastChecked: "最近检查",
        },
        configuration: {
          ...catalog.access.configuration,
          loading: "正在加载集成配置",
          loadFailed: "集成配置加载失败",
          saveFailed: "集成配置保存失败",
          saved: "集成配置已保存",
          enabled: "启用 OIDC 登录",
          authorityHint: "留空会保留现有凭据；更改 authority 后端会清除旧凭据。",
          oidcTitle: "Authentik / OIDC 配置",
          oidcDescription: "配置工作账号登录、回调与 Authentik 管理接口。",
          issuer: "Issuer",
          clientId: "Client ID",
          clientSecret: "Client secret",
          scopes: "Scopes",
          authorizationEndpoint: "Authorization endpoint",
          tokenEndpoint: "Token endpoint",
          jwksUri: "JWKS URI",
          userinfoEndpoint: "UserInfo endpoint",
          easyAuthTitle: "EasyAuth 配置",
          easyAuthDescription: "配置权限服务 authority、应用凭据与权限申请入口。",
          baseUrl: "EasyAuth 地址",
          appKey: "App Key",
          advancedTitle: "高级配置",
          advancedDescription: "OIDC 高级地址与协议端点。",
        },
      },
      upstream: {
        ...catalog.upstream,
        title: "上游监控",
        description: "检查身份和授权上游的连接状态。",
        empty: "暂无上游",
        loadFailed: "上游状态加载失败",
        checkSucceeded: "巡检完成",
        checkFailed: "巡检失败",
        permissionDenied: "当前账号没有访问上游监控的权限。",
        checkedAt: (relative) => `巡检于 ${relative}`,
        checkedAtNever: "尚未巡检",
        dependencyNames: {
          database: "数据库",
          easyauth: "EasyAuth（权限授权）",
          authentik: "Authentik（SSO 登录）",
          authentik_directory: "Authentik 用户目录",
          scheduler: "定时任务调度器",
        },
        summaries: {
          healthy: "连接正常",
          warning: "连接存在警告",
          unhealthy: "连接异常",
          unknown: "状态未知",
          notChecked: "尚未检查",
          notSupported: "当前宿主不提供此能力",
        },
      },
      oidcComplete: {
        ...catalog.oidcComplete,
        missingTitle: "登录信息缺失",
        missingDescription: "登录回调中没有可用的会话令牌，请重新登录。",
      },
    };
  }
  return {
    ...catalog,
    navigation: { ...catalog.navigation, access: "Login & Permissions", upstream: "Upstream Health" },
    login: {
      ...catalog.login,
      oidcErrorTitle: "Upstream sign-in failed",
      oidcErrors: {
        access_denied: "The upstream identity provider denied the sign-in (cancelled or blocked by policy).",
        not_configured: "Upstream sign-in is not enabled or not fully configured.",
        state_mismatch: "The sign-in session expired or did not match. Please try again.",
        missing_code: "The callback did not carry an authorization code. Please try again.",
        unreachable: "The upstream identity provider could not be reached.",
        invalid_response: "The upstream identity provider returned an invalid response.",
        invalid_token: "The upstream token failed validation.",
        inactive_user: "This account has been deactivated.",
        identity_binding_conflict: "This work account cannot be linked to an existing account automatically. Contact an administrator and retry.",
      },
    },
    security: {
      ...catalog.security,
      page: {
        ...catalog.security.page,
        passwordDescription: "Rotate this password regularly. Work-account passwords are managed upstream.",
      },
    },
    access: {
      ...catalog.access,
      page: {
        title: "Login & Permissions",
        tabsAriaLabel: "Login & Permissions",
        description: "Authentik supplies identities; EasyAuth supplies business authorization.",
        loginTab: "Login",
        permissionsTab: "Permissions",
        authentikTitle: "Authentik login",
        authentikDescription: "Trusted identity and single sign-on upstream.",
        easyAuthTitle: "EasyAuth permissions",
        easyAuthDescription: "Business permissions, scopes and navigation upstream.",
        configured: "Configured",
        notConfigured: "Not configured",
        endpoint: "Endpoint",
        lastChecked: "Last checked",
      },
      configuration: {
        ...catalog.access.configuration,
        loading: "Loading integration configuration",
        loadFailed: "Failed to load integration configuration",
        saveFailed: "Failed to save integration configuration",
        saved: "Integration configuration saved",
        enabled: "Enable OIDC sign-in",
        authorityHint: "Leave blank to keep the current credential. Changing authority clears the old credential on the server.",
        oidcTitle: "Authentik / OIDC configuration",
        oidcDescription: "Configure work-account sign-in, callbacks and the Authentik management API.",
        issuer: "Issuer",
        clientId: "Client ID",
        clientSecret: "Client secret",
        scopes: "Scopes",
        authorizationEndpoint: "Authorization endpoint",
        tokenEndpoint: "Token endpoint",
        jwksUri: "JWKS URI",
        userinfoEndpoint: "UserInfo endpoint",
        easyAuthTitle: "EasyAuth configuration",
        easyAuthDescription: "Configure the authorization authority, app credential and permission-request entry.",
        baseUrl: "EasyAuth URL",
        appKey: "App Key",
        advancedTitle: "Advanced configuration",
        advancedDescription: "Advanced OIDC endpoints and available directory-sync capability.",
      },
    },
    upstream: {
      ...catalog.upstream,
      title: "Upstream Health",
      description: "Check connectivity to identity and authorization upstreams.",
      empty: "No upstreams",
      endpoint: "Endpoint",
      loadFailed: "Failed to load upstream health",
      checkSucceeded: "Health check completed",
      checkFailed: "Health check failed",
      permissionDenied: "This account cannot view upstream health.",
      checkedAtNever: "Not checked yet",
      dependencyNames: {
        database: "Database",
        easyauth: "EasyAuth (authorization)",
        authentik: "Authentik (SSO)",
        authentik_directory: "Authentik directory",
        scheduler: "Task scheduler",
      },
      summaries: {
        healthy: "Connection healthy",
        warning: "Connection has warnings",
        unhealthy: "Connection unhealthy",
        unknown: "Status unknown",
        notChecked: "Not checked",
        notSupported: "This host does not provide this capability",
      },
    },
    oidcComplete: {
      ...catalog.oidcComplete,
      missingTitle: "Sign-in details missing",
      missingDescription: "The sign-in callback did not contain a usable session token. Please try again.",
    },
  };
}

function chineseCatalog(brand: EnterpriseCatalogBrand): EnterpriseStaticLabelCatalog {
  // Title kept for inline hosts; toast-mode EmptyState adds detail + home action (FE-FB-02).
  const permissionDenied = "当前账号没有访问此页面的权限。";
  const permissionDeniedDetail = "可返回工作台，使用当前账号可访问的功能。";
  const permissionDeniedAction = "返回工作台";
  const loading = "正在加载";
  const retry = "重试";
  const close = "关闭";
  return {
    locale: "zh-CN",
    metadata: { title: brand.appName, description: brand.appDescription },
    navigation: { menu: "菜单", close, backToMain: "返回主菜单", settings: "设置", security: "安全", access: "工作账号与访问", upstream: "系统服务", general: "通用", dashboard: "工作台", backToSecurity: "返回安全设置" },
    common: { permissionDenied, loading, retry, notAvailable: "—", permissionCount: (count) => `${count} 项权限` },
    shell: { switchLanguage: "切换语言", notifications: "通知", notificationsEmpty: "暂无通知", notificationsLoadFailed: "通知加载失败", notificationsClearAll: "全部清除", notificationsViewAll: "查看全部", notificationsDismiss: "忽略", userMenu: "用户菜单", securitySettings: "安全设置", logout: "退出登录", loggingOut: "正在退出" },
    login: {
      title: "登录", username: "用户名", password: "密码", login: "登录", loggingIn: "登录中…", oidcLogin: "使用工作账号登录", oidcDivider: "或使用本地账号登录", oidcDisabledReason: "工作账号登录暂未启用",
      secondFactorTitle: "二次验证", secondFactorSubtitle: "请选择一种方式完成验证", secondFactorSubtitleTotp: "请输入验证器中的 6 位验证码", secondFactorSubtitlePasskey: "请使用通行密钥完成验证", methodTotp: "验证器验证码", methodPasskey: "通行密钥", totpCode: "TOTP 验证码", verifyAndLogin: "验证并登录", passkeyHint: "使用指纹、面容或安全密钥完成验证。", passkeyVerify: "使用通行密钥验证", passkeyVerifying: "验证中…", passkeyUnsupported: "当前浏览器不支持通行密钥",
      usernameRequired: "请输入用户名", passwordRequired: "请输入密码", totpRequired: "请输入验证码", invalidCredentials: "用户名或密码错误", invalidTotp: "TOTP 验证码错误", unknownError: "登录失败", passkeyCancelled: "已取消通行密钥验证", passkeyFailed: "通行密钥验证失败",
      oidcLoading: "正在检查工作账号登录…", oidcLoadFailed: "无法读取工作账号登录状态，请重试。", oidcRetry: "重试",
      oidcErrorTitle: "工作账号登录未完成", oidcErrorUnknown: "工作账号登录失败，请重试或联系管理员。", oidcErrors: { access_denied: "工作账号登录被取消或拒绝，请重试。", not_configured: "工作账号登录暂未启用，请联系管理员。", state_mismatch: "登录已过期，请重新开始。", missing_code: "工作账号登录未完成，请重试。", unreachable: "工作账号登录暂时不可用，请稍后重试。", invalid_response: "工作账号登录暂时不可用，请稍后重试。", invalid_token: "工作账号登录未完成，请重试。", inactive_user: "该账号已停用。", identity_binding_conflict: "当前工作账号无法自动关联已有账号，请联系管理员处理后重试。" },
    },
    security: {
      page: { title: "安全", description: "管理本地应急账号的密码和两步认证。", passwordTitle: "密码", passwordDescription: "定期更新密码；生产工作账号的密码由身份服务管理。", twoFactorTitle: "两步认证", twoFactorDescription: "管理验证器与通行密钥。" },
      password: { currentPassword: "当前密码", newPassword: "新密码", confirmPassword: "确认新密码", submit: "修改密码", submitting: "正在提交", tooShort: "新密码至少 8 位", mismatch: "两次输入的新密码不一致", failed: "密码修改失败", success: "密码已修改" },
      authenticatorOperationFailed: "验证器操作失败，请重试",
      authenticator: "验证器", authenticatorHint: "为本地账号启用 TOTP 身份验证器。", loading, statusFailed: "两步认证状态加载失败", retry, enabled: "已启用", enable: "启用", disable: "停用", scanQr: "使用验证器扫描二维码", qrAlt: "验证器二维码", manualEntry: "手动输入密钥", currentCode: "验证码", currentPassword: "当前密码", cancel: "取消", confirmEnable: "确认启用", confirmDisable: "停用两步认证", missingFields: "请填写所有必填项", enabledSuccess: "两步认证已启用", disabledSuccess: "两步认证已停用",
      passkeysTitle: "通行密钥", passkeysDescription: "管理此账号已登记的通行密钥。", addPasskey: "添加", passkeyUnsupported: "当前浏览器不支持通行密钥", passkeysLoadFailed: "通行密钥加载失败", passkeysEmpty: "暂无通行密钥", passkeyName: "通行密钥名称", passkeyNamePlaceholder: "例如 MacBook 指纹", addPasskeyHint: "命名后按浏览器提示完成验证。", confirmAddPasskey: "开始验证", deletePasskey: "删除", confirmDeletePasskey: "确认删除", passkeyUnnamed: "未命名通行密钥", passkeyAdded: "通行密钥已添加", passkeyDeleted: "通行密钥已删除", passkeyOperationFailed: "通行密钥操作失败", permissionDenied, permissionDeniedDetail, permissionDeniedAction, close, totpDigit: (position) => `TOTP 第 ${position} 位`,
    },
    access: {
      page: { title: "工作账号与访问", tabsAriaLabel: "工作账号与访问", description: "管理工作账号登录与业务权限服务。", loginTab: "工作账号登录", permissionsTab: "业务权限", authentikTitle: "工作账号登录", authentikDescription: "公司统一身份登录服务。", easyAuthTitle: "权限服务", easyAuthDescription: "业务权限、数据范围与菜单授权。", configured: "已配置", notConfigured: "未配置", endpoint: "服务地址", lastChecked: "最近检查" },
      configuration: { loading: "正在加载配置", loadFailed: "配置加载失败", saveFailed: "配置保存失败", saved: "配置已保存", save: "保存", enabled: "启用工作账号登录", configured: "已配置（不回显）", notConfigured: "未配置", clearSecret: "清除已保存凭据", authorityHint: "留空会保留现有凭据；更改服务地址会清除旧凭据。", oidcTitle: "工作账号登录配置", oidcDescription: "配置工作账号登录与回调地址。", issuer: "登录服务地址", clientId: "应用标识", clientSecret: "应用密钥", scopes: "授权范围", authorizationEndpoint: "授权地址", tokenEndpoint: "令牌地址", jwksUri: "密钥集地址", userinfoEndpoint: "用户信息地址", redirectBaseUrl: "回调站点地址", redirectUri: "回调地址", frontendBaseUrl: "前端地址", serverBaseUrl: "服务端地址", easyAuthTitle: "权限服务配置", easyAuthDescription: "配置权限服务地址、应用凭据与权限申请入口。", baseUrl: "权限服务地址", appKey: "应用标识", credential: "应用凭据", webhookSecret: "Webhook 密钥", webhookSecretHint: "须与权限服务的事件密钥一致。", permissionRequestUrl: "权限申请地址", discover: "自动发现", connectionTest: "连接测试", advancedTitle: "高级管理员配置", advancedDescription: "协议端点等高级项，仅管理员需要。", advancedShow: "展开", advancedHide: "收起", operationSucceeded: "操作成功", operationFailed: "操作失败", guideAriaLabel: "查看 {field} 说明", guides: {} },
      authorization: authorizationChinese(close, loading),
      directory: {
        title: "用户目录同步", description: "从用户目录同步花名册。",
        save: "保存", enabled: "启用用户目录同步", baseUrl: "目录服务地址", appKey: "应用标识",
        credential: "目录凭据", credentialHint: "留空会保留现有凭据；目录凭据必须与权限凭据分开申请。",
        configured: "已配置（不回显）", notConfigured: "未配置", clearSecret: "清除已保存凭据",
        authMode: "认证方式", authModes: { static_app_token: "应用静态凭据", oauth_client_credentials: "OAuth 客户端凭据" },
        syncInterval: "同步间隔（分钟）", connectionTest: "测试连接", syncNow: "立即同步",
        operationSucceeded: "操作成功", operationFailed: "操作失败",
        lastSyncTitle: "最近一次同步", lastSyncNever: "尚未同步过。", lastSyncAt: "同步时间",
        statusLabels: { completed: "已完成", not_authoritative: "数据不完整，未写入", drift: "读取期间目录发生变化", failed: "同步失败", not_configured: "未配置" },
        statusExplanations: {
          completed: "整份花名册已读完并写入本系统：新增、更新与离职停用都已生效。",
          not_authoritative: "这次只读到部分或已过期的花名册。为避免误停用，本系统没有做任何改动，本地名单保持原样。",
          drift: "读取过程中对方目录发生了变化，本次结果整体作废、未写入任何改动，稍后会重试。",
          failed: "同步没有完成，本地名单保持原样，详情见下方错误信息。",
          not_configured: "尚未配置用户目录，本系统不会自动同步任何人员。",
        },
        trustAuthoritative: "本次读到的是完整且新鲜的花名册，所以“目录里已经没有的人”才会在本系统里被停用。",
        trustNotAuthoritative: "本次花名册不完整或不够新鲜，所以没有停用任何人；下面的数字只说明读到了什么，不代表已经写入。",
        trustUnchanged: "本次同步没有完成，本地名单未改动，也没有停用任何人。",
        trustNotConfigured: "尚未读取目录，本地名单未做任何改动。",
        incomplete: "没有读完整份花名册（分页未取完，或部分来源不可用）。",
        stale: "目录数据已过期。",
        counts: { upstreamTotal: "目录人数", created: "新增", updated: "更新", deactivated: "停用", unmapped: "无登录账号" },
        unmappedHint: "“无登录账号”指目录里没有对应登录身份的人：他们会被建档，可以作为负责人或审批人，但无法登录本系统。",
        errorDetail: "错误详情", notAvailable: "—",
      },
      permissionDenied,
      permissionDeniedDetail,
      permissionDeniedAction,
    },
    upstream: { title: "系统服务", description: "查看登录与权限等系统服务的运行状态。", refresh: "立即刷新", refreshing: "正在刷新", empty: "暂无服务", lastChecked: "最近检查", endpoint: "地址", loadFailed: "系统服务状态加载失败", checkSucceeded: "状态检查完成", checkFailed: "状态检查失败", permissionDenied: "当前账号没有访问系统服务状态的权限。", permissionDeniedDetail, permissionDeniedAction, checkedAt: (relative) => `检查于 ${relative}`, checkedAtNever: "尚未检查", status: { healthy: "正常", warning: "警告", unhealthy: "异常", unknown: "尚未检查" }, dependencyNames: { database: "数据库", easyauth: "权限服务", authentik: "工作账号登录", authentik_directory: "用户目录", scheduler: "定时任务" }, summaries: { healthy: "运行正常", warning: "需要关注", unhealthy: "服务异常", unknown: "状态未知", notChecked: "尚未检查", notSupported: "当前环境不支持此服务" } },
    delivery: {
      title: "发送状态",
      statusLabels: { queued: "排队中", accepted: "已受理(待发送)", sent: "已发送", delivered: "已投递(不代表已读)", failed: "失败", superseded: "已作废" },
      statusExplanations: {
        queued: "已进入发送队列，还没有提交给通知服务。",
        accepted: "通知服务已受理，正在等待发往钉钉。",
        sent: "钉钉已接收这条消息，这是目前能拿到的最强保证。",
        delivered: "钉钉回执确认消息已送到对方，但不代表对方已经读过。",
        failed: "发送失败，详情见下方错误信息；本版本不支持手动重发。",
        superseded: "已被更新的一条提醒取代，本条不会再发送。",
      },
      acceptedAt: "受理时间", sentAt: "发送时间", deliveredAt: "投递时间", lastReconciledAt: "最近对账",
      providerMessageId: "通知服务消息号", recipientCount: "接收人数", lastError: "错误信息",
      unconfirmedHint: "已发送超过 24 小时仍未收到投递回执，可能对方并未收到，请通过其他方式确认。",
      notAvailable: "—",
    },
    notifications: { title: "通知中心", description: "查看并处理当前账号的企业通知。", empty: "暂无通知", loadFailed: "通知加载失败", retry, dismiss: "忽略" },
    generalSettings: generalSettingsChinese(retry), identity: { admin: "管理员", user: "用户", guest: "游客" },
    public: { loginEyebrow: "企业账号", loggedOutTitle: "已退出登录", loggedOutDescription: "当前会话已结束。", loginAgain: "重新登录", footer: brand.footerText ?? brand.appName },
    oidcComplete: { processing: "正在完成工作账号登录…", missingTitle: "登录未完成", missingDescription: "工作账号登录未完成，请重新登录。", back: "返回登录" },
  };
}

function englishCatalog(brand: EnterpriseCatalogBrand): EnterpriseStaticLabelCatalog {
  // Title kept for inline hosts; toast-mode EmptyState adds detail + home action (FE-FB-02).
  const permissionDenied = "This account cannot access this page.";
  const permissionDeniedDetail = "You can return to the workbench and use the pages you have access to.";
  const permissionDeniedAction = "Back to workbench";
  const loading = "Loading";
  const retry = "Retry";
  const close = "Close";
  return {
    locale: "en",
    metadata: { title: brand.appName, description: brand.appDescription },
    navigation: { menu: "Menu", close, backToMain: "Back to main menu", settings: "Settings", security: "Security", access: "Work account & access", upstream: "System services", general: "General", dashboard: "Workbench", backToSecurity: "Back to security settings" },
    common: { permissionDenied, loading, retry, notAvailable: "—", permissionCount: (count) => `${count} permissions` },
    shell: { switchLanguage: "Switch language", notifications: "Notifications", notificationsEmpty: "No notifications", notificationsLoadFailed: "Failed to load notifications", notificationsClearAll: "Clear all", notificationsViewAll: "View all", notificationsDismiss: "Dismiss", userMenu: "User menu", securitySettings: "Security settings", logout: "Log out", loggingOut: "Logging out" },
    login: {
      title: "Sign in", username: "Username", password: "Password", login: "Sign in", loggingIn: "Signing in…", oidcLogin: "Continue with work account", oidcDivider: "or use a local account", oidcDisabledReason: "Work-account login is not enabled",
      secondFactorTitle: "Second-factor verification", secondFactorSubtitle: "Choose a verification method", secondFactorSubtitleTotp: "Enter the six-digit code from your authenticator", secondFactorSubtitlePasskey: "Verify with your passkey", methodTotp: "Authenticator code", methodPasskey: "Passkey", totpCode: "TOTP code", verifyAndLogin: "Verify and sign in", passkeyHint: "Use your fingerprint, face, or security key.", passkeyVerify: "Verify with passkey", passkeyVerifying: "Verifying…", passkeyUnsupported: "This browser does not support passkeys",
      usernameRequired: "Enter your username", passwordRequired: "Enter your password", totpRequired: "Enter the verification code", invalidCredentials: "Invalid username or password", invalidTotp: "Invalid TOTP code", unknownError: "Sign-in failed", passkeyCancelled: "Passkey verification was cancelled", passkeyFailed: "Passkey verification failed",
      oidcLoading: "Checking work-account sign-in…", oidcLoadFailed: "Work-account sign-in status could not be loaded. Please try again.", oidcRetry: "Retry",
      oidcErrorTitle: "Work-account sign-in didn’t finish", oidcErrorUnknown: "Work-account sign-in failed. Please try again or contact an administrator.", oidcErrors: { access_denied: "Work-account sign-in was cancelled or denied. Please try again.", not_configured: "Work-account sign-in is not available. Contact an administrator.", state_mismatch: "Your sign-in attempt expired. Start again.", missing_code: "Work-account sign-in didn’t finish. Try again.", unreachable: "Work-account sign-in is temporarily unavailable. Contact an administrator if this continues.", invalid_response: "Work-account sign-in is temporarily unavailable. Contact an administrator if this continues.", invalid_token: "Work-account sign-in didn’t finish. Try again.", inactive_user: "This account has been deactivated.", identity_binding_conflict: "This work account cannot be linked to an existing account automatically. Contact an administrator and retry." },
    },
    security: {
      page: { title: "Security", description: "Manage the local break-glass account password and second factor.", passwordTitle: "Password", passwordDescription: "Rotate this password regularly. Work-account passwords are managed by the identity service.", twoFactorTitle: "Two-step verification", twoFactorDescription: "Manage authenticators and passkeys." },
      password: { currentPassword: "Current password", newPassword: "New password", confirmPassword: "Confirm new password", submit: "Change password", submitting: "Submitting", tooShort: "The new password must contain at least 8 characters", mismatch: "The new passwords do not match", failed: "Failed to change password", success: "Password changed" },
      authenticatorOperationFailed: "Authenticator operation failed. Please try again.",
      authenticator: "Authenticator", authenticatorHint: "Enable a TOTP authenticator for this local account.", loading, statusFailed: "Failed to load two-step verification status", retry, enabled: "Enabled", enable: "Enable", disable: "Disable", scanQr: "Scan this QR code with your authenticator", qrAlt: "Authenticator QR code", manualEntry: "Manual entry secret", currentCode: "Verification code", currentPassword: "Current password", cancel: "Cancel", confirmEnable: "Confirm enrollment", confirmDisable: "Disable two-step verification", missingFields: "Complete all required fields", enabledSuccess: "Two-step verification enabled", disabledSuccess: "Two-step verification disabled",
      passkeysTitle: "Passkeys", passkeysDescription: "Manage passkeys registered to this account.", addPasskey: "Add", passkeyUnsupported: "Passkeys are unavailable in this browser", passkeysLoadFailed: "Failed to load passkeys", passkeysEmpty: "No passkeys", passkeyName: "Passkey name", passkeyNamePlaceholder: "MacBook fingerprint", addPasskeyHint: "Name this passkey, then follow the browser prompt.", confirmAddPasskey: "Start verification", deletePasskey: "Delete", confirmDeletePasskey: "Confirm delete", passkeyUnnamed: "Unnamed passkey", passkeyAdded: "Passkey added", passkeyDeleted: "Passkey deleted", passkeyOperationFailed: "Passkey operation failed", permissionDenied, permissionDeniedDetail, permissionDeniedAction, close, totpDigit: (position) => `TOTP digit ${position}`,
    },
    access: {
      page: { title: "Work account & access", tabsAriaLabel: "Work account & access", description: "Manage work-account sign-in and business permissions.", loginTab: "Work-account sign-in", permissionsTab: "Permissions", authentikTitle: "Work-account sign-in", authentikDescription: "Company single sign-on for work accounts.", easyAuthTitle: "Permissions service", easyAuthDescription: "Business permissions, data scopes and navigation grants.", configured: "Configured", notConfigured: "Not configured", endpoint: "Service URL", lastChecked: "Last checked" },
      configuration: { loading: "Loading configuration", loadFailed: "Failed to load configuration", saveFailed: "Failed to save configuration", saved: "Configuration saved", save: "Save", enabled: "Enable work-account sign-in", configured: "Configured (never displayed)", notConfigured: "Not configured", clearSecret: "Clear saved credential", authorityHint: "Leave blank to keep the current credential. Changing the service URL clears the old credential on the server.", oidcTitle: "Work-account sign-in configuration", oidcDescription: "Configure work-account sign-in and callback URLs.", issuer: "Sign-in service URL", clientId: "Application ID", clientSecret: "Application secret", scopes: "Scopes", authorizationEndpoint: "Authorization URL", tokenEndpoint: "Token URL", jwksUri: "Key set URL", userinfoEndpoint: "User info URL", redirectBaseUrl: "Callback site URL", redirectUri: "Redirect URI", frontendBaseUrl: "Frontend URL", serverBaseUrl: "Server URL", easyAuthTitle: "Permissions service configuration", easyAuthDescription: "Configure the permissions service URL, app credential and permission-request entry.", baseUrl: "Permissions service URL", appKey: "App key", credential: "App credential", webhookSecret: "Webhook secret", webhookSecretHint: "Must match the permissions service event secret.", permissionRequestUrl: "Permission request URL", discover: "Discover", connectionTest: "Test connection", advancedTitle: "Advanced administrator configuration", advancedDescription: "Protocol endpoints — for administrators only.", advancedShow: "Show", advancedHide: "Hide", operationSucceeded: "Operation succeeded", operationFailed: "Operation failed", guideAriaLabel: "View {field} guidance", guides: {} },
      authorization: authorizationEnglish(close, loading),
      directory: {
        title: "User directory sync", description: "Sync the staff roster from the user directory.",
        save: "Save", enabled: "Enable user directory sync", baseUrl: "Directory service URL", appKey: "App key",
        credential: "Directory credential", credentialHint: "Leave blank to keep the current credential. The directory credential must be issued separately from the permissions credential.",
        configured: "Configured (never displayed)", notConfigured: "Not configured", clearSecret: "Clear saved credential",
        authMode: "Authentication mode", authModes: { static_app_token: "Static app credential", oauth_client_credentials: "OAuth client credentials" },
        syncInterval: "Sync interval (minutes)", connectionTest: "Test connection", syncNow: "Sync now",
        operationSucceeded: "Operation succeeded", operationFailed: "Operation failed",
        lastSyncTitle: "Last sync", lastSyncNever: "Never synced.", lastSyncAt: "Synced at",
        statusLabels: { completed: "Completed", not_authoritative: "Incomplete data, nothing written", drift: "Directory changed while reading", failed: "Sync failed", not_configured: "Not configured" },
        statusExplanations: {
          completed: "The whole roster was read and applied: additions, updates and departures all took effect.",
          not_authoritative: "Only part of the roster — or an out-of-date copy — could be read. To avoid deactivating people by mistake, nothing was changed and the local list is untouched.",
          drift: "The upstream directory changed while it was being read, so the whole run was discarded. Nothing was written; it will be retried.",
          failed: "The sync did not finish. The local list is untouched — see the error below.",
          not_configured: "No user directory is configured, so nobody is synced automatically.",
        },
        trustAuthoritative: "This run read a complete, fresh roster, so people who are no longer in the directory were deactivated here.",
        trustNotAuthoritative: "This roster was incomplete or out of date, so nobody was deactivated. The numbers below describe what was read, not what was written.",
        trustUnchanged: "This sync did not finish. The local list is unchanged and nobody was deactivated.",
        trustNotConfigured: "The directory has not been read yet, so the local list is unchanged.",
        incomplete: "The roster was not read in full (pages missing, or a source was unavailable).",
        stale: "Directory data is out of date.",
        counts: { upstreamTotal: "People in directory", created: "Created", updated: "Updated", deactivated: "Deactivated", unmapped: "No sign-in account" },
        unmappedHint: "\u201cNo sign-in account\u201d means directory people with no matching sign-in identity: they are recorded and can own or approve work, but cannot sign in here.",
        errorDetail: "Error detail", notAvailable: "—",
      },
      permissionDenied,
      permissionDeniedDetail,
      permissionDeniedAction,
    },
    upstream: { title: "System services", description: "Check the status of sign-in and permissions services.", refresh: "Refresh now", refreshing: "Refreshing", empty: "No services", lastChecked: "Last checked", endpoint: "URL", loadFailed: "Failed to load system service status", checkSucceeded: "Status check completed", checkFailed: "Status check failed", permissionDenied: "This account cannot view system service status.", permissionDeniedDetail, permissionDeniedAction, checkedAt: (relative) => `Checked ${relative}`, checkedAtNever: "Not checked yet", status: { healthy: "Healthy", warning: "Warning", unhealthy: "Unhealthy", unknown: "Not checked" }, dependencyNames: { database: "Database", easyauth: "Permissions service", authentik: "Work-account sign-in", authentik_directory: "User directory", scheduler: "Task scheduler" }, summaries: { healthy: "Running normally", warning: "Needs attention", unhealthy: "Service issue", unknown: "Status unknown", notChecked: "Not checked", notSupported: "Not available in this environment" } },
    delivery: {
      title: "Delivery status",
      statusLabels: { queued: "Queued", accepted: "Accepted (not sent yet)", sent: "Sent", delivered: "Delivered (not a read receipt)", failed: "Failed", superseded: "Superseded" },
      statusExplanations: {
        queued: "Queued for sending; not handed to the notification service yet.",
        accepted: "The notification service accepted it and is waiting to send it to DingTalk.",
        sent: "DingTalk accepted the message. This is the strongest guarantee available.",
        delivered: "DingTalk confirmed the message reached the recipient. It is not a read receipt.",
        failed: "Sending failed — see the error below. Manual resend is not available in this version.",
        superseded: "Replaced by a newer reminder; this one will not be sent.",
      },
      acceptedAt: "Accepted at", sentAt: "Sent at", deliveredAt: "Delivered at", lastReconciledAt: "Last reconciled",
      providerMessageId: "Provider message ID", recipientCount: "Recipients", lastError: "Last error",
      unconfirmedHint: "Sent more than 24 hours ago with no delivery receipt — the recipient may not have got it. Confirm another way.",
      notAvailable: "—",
    },
    notifications: { title: "Notification center", description: "Review and dismiss notifications for this account.", empty: "No notifications", loadFailed: "Failed to load notifications", retry, dismiss: "Dismiss" },
    generalSettings: generalSettingsEnglish(retry), identity: { admin: "Administrator", user: "User", guest: "Guest" },
    public: { loginEyebrow: "Enterprise account", loggedOutTitle: "You’re signed out", loggedOutDescription: "The current session has ended.", loginAgain: "Sign in again", footer: brand.footerText ?? brand.appName },
    oidcComplete: { processing: "Completing work-account sign-in…", missingTitle: "Sign-in didn’t finish", missingDescription: "Work-account sign-in didn’t finish. Please try again.", back: "Back to sign in" },
  };
}

function generalSettingsChinese(retry: string): EnterpriseGeneralSettingsLabels {
  return { title: "通用", description: "应用名称、副标题、Logo 与页脚。", loading: "正在加载通用设置", loadFailed: "通用设置加载失败", retry, localeTabs: { "zh-CN": "中文", en: "English" }, appTitle: "应用名称", appTitleHint: "留空使用默认名称。", subtitle: "副标题", subtitleHint: "留空使用默认副标题。", footerHtml: "页脚", footerHtmlHint: "支持少量文本标签与链接；{year} 会替换为当前年份。", logo: "Logo", logoHint: "PNG、JPEG 或 WebP，不超过 128 KB。", logoUpload: "上传 Logo", logoRemove: "移除", logoDefaultCaption: "当前使用默认 Logo", logoCustomCaption: "自定义 Logo", logoInvalid: "仅支持 PNG、JPEG 或 WebP 图片。", logoTooLarge: "图片超过 128 KB，请更换更小的文件。", save: "保存", saving: "正在保存", saved: "通用设置已保存", saveFailed: "通用设置保存失败" };
}

function generalSettingsEnglish(retry: string): EnterpriseGeneralSettingsLabels {
  return { title: "General", description: "Application name, subtitle, logo and footer.", loading: "Loading general settings", loadFailed: "Failed to load general settings", retry, localeTabs: { "zh-CN": "中文", en: "English" }, appTitle: "Application name", appTitleHint: "Leave blank to use the default name.", subtitle: "Subtitle", subtitleHint: "Leave blank to use the default subtitle.", footerHtml: "Footer", footerHtmlHint: "A few text tags and links are allowed; {year} is replaced with the current year.", logo: "Logo", logoHint: "PNG, JPEG or WebP, up to 128 KB.", logoUpload: "Upload logo", logoRemove: "Remove", logoDefaultCaption: "Using default logo", logoCustomCaption: "Custom logo", logoInvalid: "Only PNG, JPEG or WebP images are supported.", logoTooLarge: "The image is larger than 128 KB. Choose a smaller file.", save: "Save", saving: "Saving", saved: "General settings saved", saveFailed: "Failed to save general settings" };
}

function authorizationChinese(close: string, loading: string): EnterpriseAccessSettingsLabels["authorization"] {
  return { identityTitle: "工作账号登录", identityDescription: "工作账号身份与用户同步状态。", authorizationTitle: "权限服务授权", authorizationDescription: "业务权限与主体状态。", enabled: "已启用", disabled: "未启用", configured: "已配置", notConfigured: "未配置", credential: "应用凭据", clientSecret: "OIDC 客户端密钥", issuer: "Issuer", clientId: "Client ID", redirectUri: "回调地址", endpoint: "服务地址", appKey: "App Key", principalMode: "主体模式", connectionTest: "连接测试", testing: "正在测试", connectionOk: "连接正常", connectionFailed: "连接失败", catalogTitle: "权限目录", catalogDescription: "可授权的权限点与数据范围。", permissionCode: "权限代码", permissionName: "名称", scopes: "范围", risk: "风险", status: "状态", snapshotsTitle: "用户授权", snapshotsDescription: "用户当前授权，可按用户刷新。", user: "用户", grants: "授权数", roles: "授权组", fetchedAt: "获取时间", refresh: "刷新", refreshing: "正在刷新", expired: "已过期", manifestTitle: "应用声明", manifestDescription: "应用声明的能力与权限目录。", version: "版本", capabilities: "能力", permissions: "权限数", loading, loadFailed: "集成信息加载失败", empty: "暂无数据", myGrantsTitle: "我的授权", myGrantsDescription: "当前账号已获授的权限与数据范围。", scopeSelf: "仅本人", scopeManagedUsers: "指定成员", scopeAll: "全部可用数据", manifestExport: "导出应用声明", descriptorKeysTitle: "应用信息密钥", descriptorKeysDescription: "管理读取应用信息的凭据。", create: "创建", cancel: "取消", close, delete: "删除", disable: "停用", name: "名称", confirm: "确认", baseUrlGuide: "权限服务地址。", guideAriaLabel: "查看权限服务地址说明", roleGroupSeparator: "、", notAvailable: "—", manifestFileName: "easyauth-manifest.json" };
}

function authorizationEnglish(close: string, loading: string): EnterpriseAccessSettingsLabels["authorization"] {
  return { identityTitle: "Work-account sign-in", identityDescription: "Work-account identity and user-sync status.", authorizationTitle: "Permissions service authorization", authorizationDescription: "Business permissions and subject status.", enabled: "Enabled", disabled: "Disabled", configured: "Configured", notConfigured: "Not configured", credential: "App credential", clientSecret: "OIDC client secret", issuer: "Issuer", clientId: "Client ID", redirectUri: "Redirect URI", endpoint: "Endpoint", appKey: "App Key", principalMode: "Subject mode", connectionTest: "Test connection", testing: "Testing", connectionOk: "Connection healthy", connectionFailed: "Connection failed", catalogTitle: "Permission catalog", catalogDescription: "Permissions and supported data scopes.", permissionCode: "Permission code", permissionName: "Name", scopes: "Scopes", risk: "Risk", status: "Status", snapshotsTitle: "User grants", snapshotsDescription: "Current grants, refreshable per user.", user: "User", grants: "Grants", roles: "Role groups", fetchedAt: "Fetched at", refresh: "Refresh", refreshing: "Refreshing", expired: "Expired", manifestTitle: "Application declaration", manifestDescription: "Capabilities and permissions declared by this application.", version: "Version", capabilities: "Capabilities", permissions: "Permissions", loading, loadFailed: "Failed to load integration data", empty: "No data", myGrantsTitle: "My grants", myGrantsDescription: "Permissions and data scopes issued to this account.", scopeSelf: "Self", scopeManagedUsers: "Managed users", scopeAll: "All permitted data", manifestExport: "Export declaration", descriptorKeysTitle: "Application info keys", descriptorKeysDescription: "Manage credentials used to read the application information.", create: "Create", cancel: "Cancel", close, delete: "Delete", disable: "Disable", name: "Name", confirm: "Confirm", baseUrlGuide: "Permissions service URL.", guideAriaLabel: "View permissions service URL guidance", roleGroupSeparator: ", ", notAvailable: "—", manifestFileName: "easyauth-manifest.json" };
}
