/**
 * 「设置 → 通知 → 通知渠道」的文案,挂在 `NotificationSettingsLabels.channel` 上。
 *
 * 与通知设置页其余文案一样,两种 copyMode(`legacy` / `business`)用同一份:这是只有管理员
 * 才看得到的配置卡,「EasyAuth」是他们要去操作的那个系统的名字,不需要换成业务说法。
 * 单独成文件是为了不把 `label-catalog.ts` 顶过文件规模门禁。
 */

import type { NotificationChannelSettingsLabels } from "./notification-settings-types";

export function notificationChannelLabelsChinese(): NotificationChannelSettingsLabels {
  return {
    sections: { rules: "通知规则", channels: "通知渠道" },
    configure: "前往配置",
    unavailableMember: "钉钉通知尚未配置，相关开关暂不生效，请联系管理员。",
    dingtalkTitle: "钉钉",
    dingtalkDescription: "钉钉应用凭据（AppKey、AppSecret、AgentId）由 EasyAuth 统一维护，此处只需配置本应用的通知凭据。",
    configured: "已配置",
    notConfigured: "未配置",
    baseUrl: "EasyAuth 地址",
    appKey: "应用标识",
    credential: "通知凭据",
    inheritedHint: "留空则沿用「登录与权限」中的配置。",
    credentialSaved: "已保存，留空则不修改",
    credentialEmpty: "未配置",
    credentialFromEnv: "当前使用部署环境提供的凭据；在此保存后以此处为准。",
    clearCredential: "清除已保存的凭据",
    save: "保存",
    saved: "已保存",
    saveFailed: "保存失败，请检查后重试。",
    loadFailed: "无法加载渠道配置",
    test: "测试连接",
    saveBeforeTest: "请先保存更改，再测试连接。",
    testOk: "连接正常",
    testFailed: {
      auth: "凭据无效或无权访问",
      unreachable: "无法连接 EasyAuth",
      notConfigured: "配置不完整，请补全后保存",
      unexpected: "连接测试失败",
    },
  };
}

export function notificationChannelLabelsEnglish(): NotificationChannelSettingsLabels {
  return {
    sections: { rules: "Rules", channels: "Channels" },
    configure: "Set up",
    unavailableMember: "DingTalk isn't set up yet. Contact your administrator.",
    dingtalkTitle: "DingTalk",
    dingtalkDescription: "DingTalk app credentials (AppKey, AppSecret, AgentId) are managed in EasyAuth. Only this app's notification credential is set here.",
    configured: "Configured",
    notConfigured: "Not configured",
    baseUrl: "EasyAuth URL",
    appKey: "App key",
    credential: "Notification credential",
    inheritedHint: "Leave blank to use the sign-in and permissions settings.",
    credentialSaved: "Saved. Leave blank to keep it.",
    credentialEmpty: "Not configured",
    credentialFromEnv: "Using the credential from the deployment environment. A value saved here takes precedence.",
    clearCredential: "Clear saved credential",
    save: "Save",
    saved: "Saved",
    saveFailed: "Couldn't save. Check the values and try again.",
    loadFailed: "Couldn't load channel settings",
    test: "Test connection",
    saveBeforeTest: "Save your changes before testing.",
    testOk: "Connection healthy",
    testFailed: {
      auth: "Credential rejected",
      unreachable: "Can't reach EasyAuth",
      notConfigured: "Setup incomplete. Fill in and save first.",
      unexpected: "Connection test failed",
    },
  };
}
