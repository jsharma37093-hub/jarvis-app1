export type IntentCategory =
  | 'ConversationIntent'
  | 'WebSearchIntent'
  | 'OpenWebsiteIntent'
  | 'OpenAppIntent'
  | 'SystemSettingsIntent'
  | 'ScreenShareIntent'
  | 'DeviceActionIntent'
  | 'UnknownIntent';

export type ActionExecutionLifecycle =
  | 'REQUESTED'
  | 'STARTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'DENIED';

export type ScreenShareState =
  | 'OFF'
  | 'REQUESTING_PERMISSION'
  | 'FULL_DEVICE'
  | 'SINGLE_APP'
  | 'STOPPING'
  | 'ERROR';

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface CurrentActionContext {
  lastSearch: string;
  lastURL: string;
  lastWebsite: string;
  lastOpenedApp: string;
  lastPackage: string;
  lastScreenShareTarget: string;
  lastSearchResults: WebSearchResultItem[];
}

export interface StructuredActionPayload {
  intent: IntentCategory;
  actionType:
    | 'NONE'
    | 'WEB_SEARCH'
    | 'OPEN_WEBSITE_PREVIEW'
    | 'OPEN_WEBSITE_REAL'
    | 'OPEN_APP'
    | 'OPEN_SYSTEM_SETTINGS'
    | 'SCREEN_SHARE_FULL'
    | 'SCREEN_SHARE_SINGLE_APP'
    | 'STOP_SCREEN_SHARE'
    | 'GLOBAL_ACTION_HOME'
    | 'GLOBAL_ACTION_BACK'
    | 'GLOBAL_ACTION_RECENTS'
    | 'GLOBAL_ACTION_NOTIFICATIONS'
    | 'GLOBAL_ACTION_QUICK_SETTINGS'
    | 'FLASHLIGHT_ON'
    | 'FLASHLIGHT_OFF'
    | 'OPEN_CAMERA_FRONT'
    | 'OPEN_CAMERA_BACK'
    | 'CLOSE_CAMERA'
    | 'BACKGROUND_MODE_ON'
    | 'BACKGROUND_MODE_OFF';
  query?: string;
  url?: string;
  websiteTitle?: string;
  openMode?: 'PREVIEW' | 'REAL_OPEN';
  appName?: string;
  packageName?: string;
  setting?:
    | 'BLUETOOTH'
    | 'WIFI'
    | 'SETTINGS'
    | 'NOTIFICATIONS'
    | 'LOCATION'
    | 'HOTSPOT'
    | 'ACCESSIBILITY';
  screenShareMode?: 'FULL_DEVICE' | 'SINGLE_APP' | 'STOP';
  target?: string;
  payload?: string;
}

export interface ExecutionDebugRecord {
  timestamp: string;
  lastVoiceInput: string;
  recognizedText: string;
  detectedIntent: IntentCategory;
  generatedAction: string;
  permissionStatus: string;
  executionStatus: ActionExecutionLifecycle;
  executionResult: string;
  error: string;
}

export interface ResolvedAppEntry {
  appName: string;
  packageName: string;
  androidIntentUri: string;
  deepLink: string;
  webUrl: string;
  installed: boolean;
  category: string;
}

export const INSTALLED_PACKAGE_DIRECTORY: Record<string, ResolvedAppEntry> = {
  youtube: {
    appName: 'YouTube',
    packageName: 'com.google.android.youtube',
    androidIntentUri:
      'intent://www.youtube.com/#Intent;package=com.google.android.youtube;scheme=https;end',
    deepLink: 'vnd.youtube://',
    webUrl: 'https://m.youtube.com',
    installed: true,
    category: 'Video & Media',
  },
  whatsapp: {
    appName: 'WhatsApp',
    packageName: 'com.whatsapp',
    androidIntentUri: 'intent://send/#Intent;package=com.whatsapp;scheme=whatsapp;end',
    deepLink: 'whatsapp://send',
    webUrl: 'https://web.whatsapp.com',
    installed: true,
    category: 'Messaging',
  },
  chrome: {
    appName: 'Google Chrome',
    packageName: 'com.android.chrome',
    androidIntentUri:
      'intent://www.google.com/#Intent;package=com.android.chrome;scheme=https;end',
    deepLink: 'googlechrome://navigate?url=https://www.google.com',
    webUrl: 'https://www.google.com',
    installed: true,
    category: 'Browser',
  },
  instagram: {
    appName: 'Instagram',
    packageName: 'com.instagram.android',
    androidIntentUri:
      'intent://www.instagram.com/#Intent;package=com.instagram.android;scheme=https;end',
    deepLink: 'instagram://app',
    webUrl: 'https://www.instagram.com',
    installed: true,
    category: 'Social',
  },
  settings: {
    appName: 'Settings',
    packageName: 'com.android.settings',
    androidIntentUri: 'intent:#Intent;action=android.settings.SETTINGS;end',
    deepLink: 'intent:#Intent;action=android.settings.SETTINGS;end',
    webUrl: '#settings',
    installed: true,
    category: 'System',
  },
  maps: {
    appName: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    androidIntentUri:
      'intent://maps.google.com/#Intent;package=com.google.android.apps.maps;scheme=https;end',
    deepLink: 'geo:0,0?q=near+me',
    webUrl: 'https://maps.google.com',
    installed: true,
    category: 'Navigation',
  },
  gmail: {
    appName: 'Gmail',
    packageName: 'com.google.android.gm',
    androidIntentUri: 'intent:#Intent;package=com.google.android.gm;action=android.intent.action.MAIN;end',
    deepLink: 'mailto:',
    webUrl: 'https://mail.google.com',
    installed: true,
    category: 'Email',
  },
  spotify: {
    appName: 'Spotify',
    packageName: 'com.spotify.music',
    androidIntentUri: 'intent://open.spotify.com/#Intent;package=com.spotify.music;scheme=https;end',
    deepLink: 'spotify://',
    webUrl: 'https://open.spotify.com',
    installed: true,
    category: 'Music',
  },
  phone: {
    appName: 'Phone Dialer',
    packageName: 'com.google.android.dialer',
    androidIntentUri: 'intent:#Intent;action=android.intent.action.DIAL;end',
    deepLink: 'tel:',
    webUrl: 'tel:',
    installed: true,
    category: 'Calls',
  },
  calculator: {
    appName: 'Calculator',
    packageName: 'com.google.android.calculator',
    androidIntentUri:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end',
    deepLink:
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end',
    webUrl: 'https://www.google.com/search?q=calculator',
    installed: true,
    category: 'Utilities',
  },
};

const APP_SYNONYMS: Array<{ key: string; patterns: string[] }> = [
  { key: 'youtube', patterns: ['youtube', 'यूट्यूब', 'यू ट्यूब', 'yt'] },
  { key: 'whatsapp', patterns: ['whatsapp', 'व्हाट्सएप', 'व्हाट्सऐप', 'वाट्सएप'] },
  { key: 'chrome', patterns: ['chrome', 'क्रोम', 'ब्राउज़र', 'browser'] },
  { key: 'instagram', patterns: ['instagram', 'इंस्टाग्राम', 'इंस्टा', 'insta'] },
  { key: 'settings', patterns: ['settings', 'setting', 'सेटिंग्स', 'सेटिंग'] },
  { key: 'maps', patterns: ['maps', 'google maps', 'मैप्स', 'मैप'] },
  { key: 'gmail', patterns: ['gmail', 'जीमेल', 'ईमेल'] },
  { key: 'spotify', patterns: ['spotify', 'स्पॉटिफाई'] },
  { key: 'phone', patterns: ['dialer', 'phone', 'डायलर', 'कॉल'] },
  { key: 'calculator', patterns: ['calculator', 'कैलकुलेटर'] },
];

export class AppResolver {
  static resolveApp(
    query: string,
    customInstalledMap?: Record<string, boolean>
  ): { found: boolean; app: ResolvedAppEntry | null; requestedName: string } {
    const clean = (query || '').trim();
    const lower = clean.toLowerCase();

    for (const entry of APP_SYNONYMS) {
      if (entry.patterns.some((p) => lower.includes(p))) {
        const base = INSTALLED_PACKAGE_DIRECTORY[entry.key];
        const isInstalled =
          customInstalledMap && entry.key in customInstalledMap
            ? customInstalledMap[entry.key]
            : base.installed;
        return {
          found: isInstalled,
          app: { ...base, installed: isInstalled },
          requestedName: base.appName,
        };
      }
    }

    // Check direct key or package match
    for (const [key, val] of Object.entries(INSTALLED_PACKAGE_DIRECTORY)) {
      if (
        lower === key ||
        lower === val.packageName.toLowerCase() ||
        lower.includes(val.appName.toLowerCase())
      ) {
        const isInstalled =
          customInstalledMap && key in customInstalledMap
            ? customInstalledMap[key]
            : val.installed;
        return {
          found: isInstalled,
          app: { ...val, installed: isInstalled },
          requestedName: val.appName,
        };
      }
    }

    return {
      found: false,
      app: null,
      requestedName: clean || 'Requested App',
    };
  }
}

export const ANDROID_SETTINGS_INTENTS: Record<
  string,
  { title: string; androidAction: string; intentUri: string }
> = {
  BLUETOOTH: {
    title: 'Bluetooth Settings',
    androidAction: 'android.settings.BLUETOOTH_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end',
  },
  WIFI: {
    title: 'Wi-Fi Settings',
    androidAction: 'android.settings.WIFI_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end',
  },
  SETTINGS: {
    title: 'Android System Settings',
    androidAction: 'android.settings.SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.SETTINGS;end',
  },
  LOCATION: {
    title: 'Location Source Settings',
    androidAction: 'android.settings.LOCATION_SOURCE_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end',
  },
  HOTSPOT: {
    title: 'Hotspot & Tethering Settings',
    androidAction: 'android.settings.TETHER_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.TETHER_SETTINGS;end',
  },
  ACCESSIBILITY: {
    title: 'Accessibility Settings',
    androidAction: 'android.settings.ACCESSIBILITY_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end',
  },
  NOTIFICATIONS: {
    title: 'Notification Settings',
    androidAction: 'android.settings.NOTIFICATION_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.NOTIFICATION_SETTINGS;end',
  },
  OVERLAY: {
    title: 'Display Over Other Apps',
    androidAction: 'android.settings.action.MANAGE_OVERLAY_PERMISSION',
    intentUri: 'intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;data=package:com.krishnasharma.jarvis;end',
  },
  ASSISTANT_ROLE: {
    title: 'Default Assistant App Settings',
    androidAction: 'android.settings.VOICE_INPUT_SETTINGS',
    intentUri: 'intent:#Intent;action=android.settings.VOICE_INPUT_SETTINGS;end',
  },
};

/**
 * Strictly validates any structured action produced by Gemini or local parser
 * against our allowlisted schema so Gemini never executes arbitrary code.
 */
export function validateStructuredAction(
  raw: Partial<StructuredActionPayload> | null | undefined,
  context: CurrentActionContext
): StructuredActionPayload {
  if (!raw || !raw.actionType || raw.actionType === 'NONE') {
    return {
      intent: 'ConversationIntent',
      actionType: 'NONE',
    };
  }

  const allowedTypes: StructuredActionPayload['actionType'][] = [
    'NONE',
    'WEB_SEARCH',
    'OPEN_WEBSITE_PREVIEW',
    'OPEN_WEBSITE_REAL',
    'OPEN_APP',
    'OPEN_SYSTEM_SETTINGS',
    'SCREEN_SHARE_FULL',
    'SCREEN_SHARE_SINGLE_APP',
    'STOP_SCREEN_SHARE',
    'GLOBAL_ACTION_HOME',
    'GLOBAL_ACTION_BACK',
    'GLOBAL_ACTION_RECENTS',
    'GLOBAL_ACTION_NOTIFICATIONS',
    'GLOBAL_ACTION_QUICK_SETTINGS',
    'FLASHLIGHT_ON',
    'FLASHLIGHT_OFF',
    'OPEN_CAMERA_FRONT',
    'OPEN_CAMERA_BACK',
    'CLOSE_CAMERA',
    'BACKGROUND_MODE_ON',
    'BACKGROUND_MODE_OFF',
  ];

  if (!allowedTypes.includes(raw.actionType)) {
    return {
      intent: 'UnknownIntent',
      actionType: 'NONE',
    };
  }

  // Context resolution for follow-up commands ("अब इसे खोलो", "अब इसे real में खोलो", "इसकी screen share करो")
  const resolved = { ...raw } as StructuredActionPayload;

  if (
    (resolved.actionType === 'OPEN_WEBSITE_PREVIEW' ||
      resolved.actionType === 'OPEN_WEBSITE_REAL') &&
    (!resolved.url ||
      resolved.url === 'CONTEXT_LAST_URL' ||
      resolved.url === 'last')
  ) {
    resolved.url =
      context.lastURL ||
      context.lastSearchResults[0]?.url ||
      'https://www.google.com';
    resolved.websiteTitle =
      context.lastWebsite ||
      context.lastSearchResults[0]?.title ||
      resolved.url;
  }

  if (
    resolved.actionType === 'SCREEN_SHARE_SINGLE_APP' &&
    (!resolved.appName ||
      resolved.appName === 'CONTEXT_LAST_APP' ||
      resolved.appName === 'last')
  ) {
    resolved.appName = context.lastOpenedApp || 'YouTube';
    resolved.packageName =
      context.lastPackage || 'com.google.android.youtube';
  }

  return resolved;
}

/**
 * ============================================================================
 * RUNTIME ENVIRONMENT SEPARATION: REAL ANDROID RUNTIME vs WEB PREVIEW
 * ============================================================================
 */
export type RuntimeExecutionMode = 'REAL_ANDROID_RUNTIME' | 'WEB_PREVIEW_RUNTIME';

export interface AndroidNativeBridgeInterface {
  startVoiceForegroundService?: () => boolean | void;
  stopVoiceForegroundService?: () => boolean | void;
  isIgnoringBatteryOptimizations?: () => boolean;
  requestIgnoreBatteryOptimizations?: () => void;
  performGlobalAccessibilityAction?: (action: string) => boolean;
  launchPackage?: (packageName: string, intentUri?: string) => boolean;
  requestAllPermissions?: () => void;
  openSpecialSettings?: (id: string) => void;
  moveAppToBackground?: () => void;
  showRgbOverlay?: () => void;
  hideRgbOverlay?: () => void;
}

export function detectRuntimeMode(): RuntimeExecutionMode {
  if (typeof window === 'undefined') return 'WEB_PREVIEW_RUNTIME';
  const win = window as unknown as {
    AndroidNativeBridge?: AndroidNativeBridgeInterface;
    JarvisAndroid?: AndroidNativeBridgeInterface;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (
    win.AndroidNativeBridge ||
    win.JarvisAndroid ||
    (win.Capacitor && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform())
  ) {
    return 'REAL_ANDROID_RUNTIME';
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android/i.test(ua) && /wv|Version\/\d+\.\d+/i.test(ua)) {
    return 'REAL_ANDROID_RUNTIME';
  }
  return 'WEB_PREVIEW_RUNTIME';
}

export function getAndroidNativeBridge(): AndroidNativeBridgeInterface | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AndroidNativeBridge?: AndroidNativeBridgeInterface;
    JarvisAndroid?: AndroidNativeBridgeInterface;
  };
  return win.AndroidNativeBridge || win.JarvisAndroid || null;
}

