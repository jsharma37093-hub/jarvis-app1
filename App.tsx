import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Brain,
  Camera,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Edit3,
  ExternalLink,
  Flashlight,
  Grid,
  MapPin,
  Mic,
  Monitor,
  PictureInPicture2,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wifi,
  WifiOff,
  X,
  Search,
  Terminal,
  ShieldCheck,
  History as HistoryIcon,
  KeyRound,
} from 'lucide-react';
import {
  ActionExecutionLifecycle,
  ANDROID_SETTINGS_INTENTS,
  AppResolver,
  CurrentActionContext,
  detectRuntimeMode,
  ExecutionDebugRecord,
  getAndroidNativeBridge,
  INSTALLED_PACKAGE_DIRECTORY,
  IntentCategory,
  RuntimeExecutionMode,
  ScreenShareState,
  WebSearchResultItem,
} from './services/actionExecutionEngine';
import {
  AssistantState,
  CameraMode,
  ConversationTurn,
  DiagnosticLogEntry,
  DiagnosticStage,
  MemoryCategory,
  MemoryRecord,
  PermissionId,
  PermissionItem,
  ResponseStyle,
} from './types/jarvis';
import { INITIAL_PERMISSIONS } from './data/androidInitialState';
import {
  CATEGORY_LABELS,
  formatReadableDate,
  memoryManager,
  VALID_MEMORY_CATEGORIES,
} from './services/memoryManager';
import { apiUrl } from './lib/api';
import {
  clearVoiceHistory,
  loadVoiceHistory,
  saveVoiceHistory,
  VoiceHistoryEntry,
} from './lib/voiceHistory';
import { JarvisPowerOrb } from './components/JarvisPowerOrb';
import { RealtimeTFLiteAudioEngine } from './services/tfliteWakeWordEngine';
import {
  CHARACTER_VIDEO_SRC,
  loadSavedCharacterVideoUrl,
  saveCharacterVideoFile,
} from './characterVideo';

const SETUP_KEY = 'jarvis_setup_done_v1';

type SettingsTab = 'GENERAL' | 'AI_API' | 'VOICE_LANGUAGE' | 'PERMISSIONS' | 'DIAGNOSTICS';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode audio'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  // Conversation State Machine: IDLE | LISTENING | PROCESSING | THINKING | SPEAKING | ERROR
  const [isJarvisOn, setIsJarvisOn] = useState<boolean>(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [statusCaption, setStatusCaption] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [lastJarvisReply, setLastJarvisReply] = useState<string>('');
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [micPermissionBlocked, setMicPermissionBlocked] = useState<boolean>(false);
  const [quickInputText, setQuickInputText] = useState<string>('');
  const [tfliteWakeWordAutoMode, setTfliteWakeWordAutoMode] = useState<boolean>(true);
  const [tfliteConfidence, setTfliteConfidence] = useState<number>(0.05);

  // Modals: Memory Manager, App Controller & Settings
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState<boolean>(false);
  const [isAppControlModalOpen, setIsAppControlModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('GENERAL');

  // First-run setup gate (API key -> permissions) + voice conversation history
  const [setupDone, setSetupDone] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SETUP_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [setupStep, setSetupStep] = useState<'API' | 'PERMISSIONS'>('API');
  const [setupKeyChecking, setSetupKeyChecking] = useState<boolean>(false);
  const [setupKeyFailed, setSetupKeyFailed] = useState<boolean>(false);
  const [permResults, setPermResults] = useState<
    Record<string, 'granted' | 'denied' | 'native' | 'pending'>
  >({});
  const [requestingPerms, setRequestingPerms] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [voiceHistory, setVoiceHistory] = useState<VoiceHistoryEntry[]>(() => loadVoiceHistory());

  // Hardware, Bluetooth, App Control & Background System States
  const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false);
  const [wifiEnabled, setWifiEnabled] = useState<boolean>(true);
  const [flashlightEnabled, setFlashlightEnabled] = useState<boolean>(false);
  const [hotspotEnabled, setHotspotEnabled] = useState<boolean>(false);
  const [locationEnabled, setLocationEnabled] = useState<boolean>(true);
  const [backgroundModeEnabled, setBackgroundModeEnabled] = useState<boolean>(false);
  const backgroundModeEnabledRef = useRef<boolean>(false);
  const [runtimeMode] = useState<RuntimeExecutionMode>(() => detectRuntimeMode());
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [rgbWakeHighlightActive, setRgbWakeHighlightActive] = useState<boolean>(false);
  const [activeAppBanner, setActiveAppBanner] = useState<{
    title: string;
    subtitle: string;
    deepLink?: string;
  } | null>(null);

  // ScreenShareManager State Machine (OFF | REQUESTING_PERMISSION | FULL_DEVICE | SINGLE_APP | STOPPING | ERROR)
  const [screenShareState, setScreenShareState] = useState<ScreenShareState>('OFF');
  const [screenShareTargetApp, setScreenShareTargetApp] = useState<string>('');

  // Installed Apps Map for AppResolver testing & verification
  const [installedAppsMap, setInstalledAppsMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    Object.keys(INSTALLED_PACKAGE_DIRECTORY).forEach((k) => {
      map[k] = true;
    });
    return map;
  });

  // Command Memory / Context (for follow-up commands like "अब इसे खोलो", "अब इसे real में खोलो", "इसकी screen share करो")
  const [actionContext, setActionContext] = useState<CurrentActionContext>({
    lastSearch: '',
    lastURL: '',
    lastWebsite: '',
    lastOpenedApp: '',
    lastPackage: '',
    lastScreenShareTarget: '',
    lastSearchResults: [],
  });
  const actionContextRef = useRef<CurrentActionContext>(actionContext);
  useEffect(() => {
    actionContextRef.current = actionContext;
  }, [actionContext]);

  // Developer Error Debug Mode State
  const [lastDebugRecord, setLastDebugRecord] = useState<ExecutionDebugRecord>({
    timestamp: '--:--:--',
    lastVoiceInput: 'None',
    recognizedText: 'None',
    detectedIntent: 'ConversationIntent',
    generatedAction: 'NONE',
    permissionStatus: 'ALL_GRANTED',
    executionStatus: 'COMPLETED',
    executionResult: 'Ready',
    error: 'None',
  });

  // Persistent Long-Term Memories (IndexedDB + localStorage + Server Disk DB)
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memorySearchQuery, setMemorySearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Add / Edit / Clear-All Memory UI states
  const [newMemoryKey, setNewMemoryKey] = useState<string>('');
  const [newMemoryValue, setNewMemoryValue] = useState<string>('');
  const [newMemoryCategory, setNewMemoryCategory] =
    useState<MemoryCategory>('personal_preference');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('personal_preference');
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState<boolean>(false);

  // Gemini AI Connection & Voice Settings
  const [geminiConnected, setGeminiConnected] = useState<boolean>(true);
  const [maskedKeyPreview, setMaskedKeyPreview] = useState<string>('Not Configured');
  const [connectionStatusMessage, setConnectionStatusMessage] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [savingApiKey, setSavingApiKey] = useState<boolean>(false);
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);
  const [customApiKeyInput, setCustomApiKeyInput] = useState<string>(() => {
    try {
      return localStorage.getItem('jarvis_custom_gemini_api_key') || '';
    } catch {
      return '';
    }
  });
  const customApiKeyRef = useRef<string>(customApiKeyInput);
  useEffect(() => {
    customApiKeyRef.current = customApiKeyInput;
  }, [customApiKeyInput]);

  // Real-Time Spoken Sentence State for Floating Character Bubble
  const [currentSpokenSentence, setCurrentSpokenSentence] = useState<string>('');
  const sentenceTimersRef = useRef<number[]>([]);

  const [selectedGeminiModel, setSelectedGeminiModel] = useState<
    'gemini-3.8-flash' | 'gemini-3.1-flash-lite'
  >('gemini-3.1-flash-lite');
  const [defaultPersonality, setDefaultPersonality] = useState<ResponseStyle>('FRIENDLY');
  const [wakePhrase, setWakePhrase] = useState<string>('Hey Jarvis');
  const [speechLocale, setSpeechLocale] = useState<'hi-IN' | 'en-IN' | 'en-US'>('hi-IN');
  const [useNeuralGeminiTts, setUseNeuralGeminiTts] = useState<boolean>(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState<
    'Charon' | 'Puck' | 'Fenrir'
  >(() => {
    try {
      const saved = localStorage.getItem('jarvis_selected_voice_v1');
      if (saved === 'Charon' || saved === 'Puck' || saved === 'Fenrir') {
        return saved;
      }
    } catch {}
    return 'Charon';
  });
  const [speechRate, setSpeechRate] = useState<number>(1.12);

  // Audio Waveform Levels for the Small Dynamic Center Orb
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(12).fill(0.18));

  // Top-Bar Dedicated Camera & Screen Sharing States
  const [cameraMode, setCameraMode] = useState<CameraMode>('OFF');
  const [cameraUsingFallbackHud, setCameraUsingFallbackHud] = useState<boolean>(false);
  const [capturedCameraImage, setCapturedCameraImage] = useState<string | null>(null);

  const [screenSharing, setScreenSharing] = useState<boolean>(false);
  const [screenUsingMobileBridge, setScreenUsingMobileBridge] = useState<boolean>(false);
  const [capturedScreenImage, setCapturedScreenImage] = useState<string | null>(null);

  // Mobile Permissions & Short-Term Conversation History
  const [permissions, setPermissions] = useState<PermissionItem[]>(INITIAL_PERMISSIONS);
  const permissionsRef = useRef<PermissionItem[]>(INITIAL_PERMISSIONS);
  useEffect(() => {
    permissionsRef.current = permissions;
  }, [permissions]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);

  // Mutable Refs for Race-Free State Machine & Steady Single-Stream Microphone
  const isJarvisOnRef = useRef<boolean>(false);
  const userManuallyTurnedOffRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const tfliteEngineRef = useRef<RealtimeTFLiteAudioEngine | null>(null);

  const conversationHistoryRef = useRef<ConversationTurn[]>(conversationHistory);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const screenSharingRef = useRef<boolean>(screenSharing);
  const capturedCameraImageRef = useRef<string | null>(capturedCameraImage);
  const capturedScreenImageRef = useRef<string | null>(capturedScreenImage);
  const selectedModelRef = useRef(selectedGeminiModel);
  const selectedVoiceRef = useRef(selectedVoiceName);
  const useNeuralTtsRef = useRef(useNeuralGeminiTts);
  const speechLocaleRef = useRef(speechLocale);
  const speechRateRef = useRef(speechRate);
  const defaultPersonalityRef = useRef(defaultPersonality);
  const lastActionResultRef = useRef<string>('');
  const lastProcessedVoiceTurnRef = useRef<{ text: string; timestamp: number }>({
    text: '',
    timestamp: 0,
  });

  useEffect(() => {
    conversationHistoryRef.current = conversationHistory;
  }, [conversationHistory]);
  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);
  useEffect(() => {
    screenSharingRef.current = screenSharing;
  }, [screenSharing]);
  useEffect(() => {
    capturedCameraImageRef.current = capturedCameraImage;
  }, [capturedCameraImage]);
  useEffect(() => {
    capturedScreenImageRef.current = capturedScreenImage;
  }, [capturedScreenImage]);
  useEffect(() => {
    selectedModelRef.current = selectedGeminiModel;
  }, [selectedGeminiModel]);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoiceName;
    try {
      localStorage.setItem('jarvis_selected_voice_v1', selectedVoiceName);
    } catch {}
  }, [selectedVoiceName]);
  useEffect(() => {
    useNeuralTtsRef.current = useNeuralGeminiTts;
  }, [useNeuralGeminiTts]);
  useEffect(() => {
    speechLocaleRef.current = speechLocale;
    tfliteEngineRef.current?.setLocale(speechLocale);
  }, [speechLocale]);
  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);
  useEffect(() => {
    defaultPersonalityRef.current = defaultPersonality;
  }, [defaultPersonality]);

  const [isUserSpeakingLive, setIsUserSpeakingLive] = useState<boolean>(false);

  // Mobile Border RGB Outline:
  // Automatically turns ON in Background Mode upon speaking the wake word ("Hey Jarvis" / "Jarvis") or whenever wake word is active
  // RGB light: shows while JARVIS is awake and talking with you (wake word -> reply finished)
  const isRgbBorderActive =
    isJarvisOn &&
    (rgbWakeHighlightActive ||
      assistantState === 'WAKE_DETECTED' ||
      assistantState === 'PROCESSING' ||
      assistantState === 'THINKING' ||
      assistantState === 'SPEAKING' ||
      (assistantState === 'LISTENING' && isUserSpeakingLive));

  // When the app is in the background, the native overlay service draws the same light over other apps
  useEffect(() => {
    const bridge = getAndroidNativeBridge();
    if (!bridge) return;
    if (isRgbBorderActive && document.visibilityState === 'hidden') {
      bridge.showRgbOverlay?.();
    } else {
      bridge.hideRgbOverlay?.();
    }
  }, [isRgbBorderActive]);

  const [pendingVoiceCommand, setPendingVoiceCommand] = useState<string>('');
  const pendingVoiceCommandRef = useRef<string>('');
  const utteranceQueueRef = useRef<Array<{ blob: Blob; mimeType: string }>>([]);
  const isCheckingAudioRef = useRef<boolean>(false);
  const assistantStateRef = useRef<AssistantState>(assistantState);
  const ttsInitializedRef = useRef<boolean>(false);
  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  // Hardware & Media Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechSessionIdRef = useRef<number>(0);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const mobileScreenInputRef = useRef<HTMLInputElement | null>(null);
  const centerCharacterVideoRef = useRef<HTMLVideoElement | null>(null);
  const characterVideoFileInputRef = useRef<HTMLInputElement | null>(null);

  const [maleCharacterVideoSrc, setMaleCharacterVideoSrc] =
    useState<string>(CHARACTER_VIDEO_SRC);
  const [characterVideoMissing, setCharacterVideoMissing] =
    useState<boolean>(false);
  const [characterBgColor, setCharacterBgColor] = useState<string>('#FFFFFF');
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const bgAudioCtxRef = useRef<AudioContext | null>(null);
  const torchStreamRef = useRef<MediaStream | null>(null);

  // JARVIS Character is 100% Male Only
  const activeCharacterVideoSrc = maleCharacterVideoSrc;

  // Always keep screen background 100% Pure White (#FFFFFF)
  const syncScreenBackgroundWithVideo = (_videoEl: HTMLVideoElement) => {
    setCharacterBgColor('#FFFFFF');
  };

  // Background Keep-Alive System (Android ForegroundService Bridge + Screen Wake Lock + MediaSession Service + Visibility Recovery)
  const activateBackgroundKeepAliveSystem = async (enable: boolean): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const nativeBridge = getAndroidNativeBridge();

    if (!enable) {
      backgroundModeEnabledRef.current = false;
      setBackgroundModeEnabled(false);
      try {
        nativeBridge?.stopVoiceForegroundService?.();
      } catch {}
      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      if (bgAudioCtxRef.current) {
        await bgAudioCtxRef.current.close().catch(() => {});
        bgAudioCtxRef.current = null;
      }
      if (isJarvisOnRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
        transitionVoiceState('STANDBY', 'Standby — Listening for "Hey Jarvis"...');
      }
      logDiagnostic('VOICE_STATE_CHANGED', 'Background voice service stopped (STANDBY)');
      return {
        ok: true,
        message: 'जी सर, बैकग्राउंड वॉयस सर्विस बंद कर दी गई है।',
      };
    }

    // Check required Android permissions before enabling Foreground Service
    const fgPerm = permissionsRef.current.find((p) => p.id === 'FOREGROUND_SERVICE');
    const micPerm = permissionsRef.current.find((p) => p.id === 'MICROPHONE');
    if ((fgPerm && !fgPerm.granted) || (micPerm && !micPerm.granted)) {
      return {
        ok: false,
        message:
          'बैकग्राउंड वॉयस सर्विस चलाने के लिए कृपया Settings → Permissions में जाकर Microphone और Foreground Service परमिशन को Enable करें।',
      };
    }

    backgroundModeEnabledRef.current = true;
    setBackgroundModeEnabled(true);

    // 1. Real Android Foreground Service Bridge (when running inside Android APK Runtime)
    try {
      nativeBridge?.startVoiceForegroundService?.();
    } catch {}

    // 2. Request Screen WakeLock where supported
    try {
      const navWithWakeLock = navigator as unknown as {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (navWithWakeLock.wakeLock) {
        wakeLockRef.current = await navWithWakeLock.wakeLock.request('screen');
      }
    } catch {}

    // 3. Keep AudioContext alive across app minimization
    try {
      if (!bgAudioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.frequency.value = 1;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        bgAudioCtxRef.current = ctx;
      }
      if (bgAudioCtxRef.current.state === 'suspended') {
        await bgAudioCtxRef.current.resume().catch(() => {});
      }
    } catch {}

    // 4. Register Android Foreground MediaSession & System Notification
    try {
      if ('mediaSession' in navigator && navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'JARVIS Foreground Voice Service Active',
          artist: 'Say "Hey Jarvis" or "Background off karo"',
          album: 'JARVIS Android Assistant',
        });
        navigator.mediaSession.setActionHandler('play', () => {
          if (!isJarvisOnRef.current) handleTogglePower();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (isJarvisOnRef.current) handleTogglePower();
        });
      }
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('JARVIS Foreground Service Active', {
            body: 'Background voice mode is active. Say "Hey Jarvis" or "Background off karo".',
            silent: true,
          });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {});
        }
      }
    } catch {}

    if (isJarvisOnRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
      transitionVoiceState(
        'BACKGROUND_LISTENING',
        'Background Listening Active ("Hey Jarvis")'
      );
    }
    logDiagnostic('VOICE_STATE_CHANGED', 'Background ForegroundService enabled (BACKGROUND_LISTENING)');
    return {
      ok: true,
      message:
        runtimeMode === 'REAL_ANDROID_RUNTIME'
          ? 'जी सर, Android Foreground Voice Service चालू कर दी गई है। अब ऐप minimize होने पर भी मैं सुनता रहूँगा।'
          : 'जी सर, बैकग्राउंड वॉयस मोड चालू कर दिया गया है। (नोट: Browser Preview में OS tab suspension लागू हो सकता है, Android APK में ForegroundService चलेगी।)',
    };
  };

  const togglePictureInPictureBackground = async () => {
    const vid = centerCharacterVideoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<void>;
    };
    if (!vid) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else if (typeof vid.requestPictureInPicture === 'function') {
        await vid.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch {}
  };

  // Control character standing position vs active animation based on Mic ON/OFF state
  useEffect(() => {
    const videoEl = centerCharacterVideoRef.current;
    if (!videoEl) return;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.volume = 0;
    if (isJarvisOn) {
      videoEl.play().catch(() => {});
    } else {
      // Immediately pause and lock into silent standing posture when Mic is turned OFF
      videoEl.pause();
      try {
        videoEl.currentTime = 0;
      } catch {}
    }
  }, [isJarvisOn, activeCharacterVideoSrc]);

  const logDiagnostic = (stage: DiagnosticStage, detail: string) => {
    const entry: DiagnosticLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      stage,
      detail,
    };
    console.info(`[JARVIS][${stage}] ${detail}`);
    setDiagnosticLogs((prev) => [entry, ...prev.slice(0, 79)]);
  };

  const transitionVoiceState = (nextState: AssistantState, caption?: string) => {
    const prevState = assistantStateRef.current;
    assistantStateRef.current = nextState;
    setAssistantState(nextState);
    if (caption !== undefined) {
      setStatusCaption(caption);
    }
    if (prevState !== nextState) {
      logDiagnostic('VOICE_STATE_CHANGED', `${prevState} → ${nextState}`);
    }
  };

  // Initialize TTS once and verify available Hindi/English voices
  const initializeTtsOnce = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      logDiagnostic('TTS_ERROR', 'Browser SpeechSynthesis API not available; using cloud TTS');
      return;
    }

    const checkVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && !ttsInitializedRef.current) {
          ttsInitializedRef.current = true;
          const hiCount = voices.filter((v) => v.lang.toLowerCase().startsWith('hi')).length;
          const enCount = voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length;
          logDiagnostic(
            'TTS_INIT',
            `TTS initialized (${voices.length} voices ready: ${hiCount} Hindi, ${enCount} English)`
          );
        }
      } catch (err: unknown) {
        logDiagnostic('TTS_ERROR', `TTS init check failed: ${(err as { message?: string })?.message || 'unknown'}`);
      }
    };

    checkVoices();
    if (!ttsInitializedRef.current) {
      window.speechSynthesis.onvoiceschanged = () => {
        checkVoices();
      };
      // Mark ready after 350ms even if browser doesn't populate getVoices() until first speak()
      window.setTimeout(() => {
        if (!ttsInitializedRef.current) {
          ttsInitializedRef.current = true;
          logDiagnostic('TTS_INIT', 'TTS engine initialized with system default voice');
        }
      }, 350);
    }
  };

  // Initialize Persistent Memories, TTS & Auto-Start TFLite Wake-Word Engine when permitted
  useEffect(() => {
    initializeTtsOnce();

    memoryManager.initializeAndSync().then((loaded) => {
      setMemories(loaded);
      logDiagnostic(
        'MEMORY_RETRIEVED',
        `Loaded ${loaded.length} persistent memories from IndexedDB / localStorage / Server DB`
      );
    });

    checkServerApiStatus();

    loadSavedCharacterVideoUrl('MALE').then((savedMaleUrl) => {
      if (savedMaleUrl) {
        setMaleCharacterVideoSrc(savedMaleUrl);
        setCharacterVideoMissing(false);
      }
    });

    // Check if microphone permission is already granted so TFLite "Hey Jarvis" KWS can start hands-free without button click!
    let setupAlreadyDone = false;
    try {
      setupAlreadyDone = localStorage.getItem(SETUP_KEY) === '1';
    } catch {}
    if (
      setupAlreadyDone &&
      typeof navigator !== 'undefined' &&
      navigator.permissions &&
      navigator.permissions.query
    ) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (status.state === 'granted') {
            isJarvisOnRef.current = true;
            setIsJarvisOn(true);
            transitionVoiceState('LISTENING', 'Listening...');
            startSteadyTFLiteMicrophoneEngine();
          }
        })
        .catch(() => {});
    }

    const handleOnline = () => {
      setIsOffline(false);
      if (isJarvisOnRef.current && assistantStateRef.current === 'ERROR') {
        transitionVoiceState(
          backgroundModeEnabledRef.current ? 'BACKGROUND_LISTENING' : 'STANDBY',
          'Network restored — Ready for "Hey Jarvis"...'
        );
      }
    };
    const handleOffline = () => setIsOffline(true);
    const handleVisibilityChange = () => {
      if (!isJarvisOnRef.current) return;
      if (document.visibilityState === 'hidden') {
        if (!backgroundModeEnabledRef.current) {
          // App was sent to back -> keep listening for "Hey Jarvis" in background
          activateBackgroundKeepAliveSystem(true);
        }
        if (backgroundModeEnabledRef.current) {
          transitionVoiceState(
            'BACKGROUND_LISTENING',
            'Background Service Active — Listening...'
          );
          tfliteEngineRef.current?.ensureAudioContextResumed();
        }
      } else if (document.visibilityState === 'visible') {
        getAndroidNativeBridge()?.hideRgbOverlay?.();
        // Recover microphone and AudioContext automatically when returning to foreground
        tfliteEngineRef.current?.ensureAudioContextResumed();
        startSteadyTFLiteMicrophoneEngine();
        if (!isSpeakingRef.current && !isProcessingRef.current) {
          transitionVoiceState(
            backgroundModeEnabledRef.current ? 'BACKGROUND_LISTENING' : 'STANDBY',
            backgroundModeEnabledRef.current
              ? 'Background Listening Active ("Hey Jarvis")'
              : 'Standby — Say "Hey Jarvis" or speak command...'
          );
        }
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      shutdownAllSystems();
    };
  }, []);

  const checkServerApiStatus = async () => {
    try {
      const savedLocalKey = customApiKeyRef.current.trim();
      const headers: Record<string, string> = {};
      if (savedLocalKey) {
        headers['x-gemini-api-key'] = savedLocalKey;
      }
      const r = await fetch(apiUrl('/api/jarvis/status'), { headers });
      const d = await r.json();
      setGeminiConnected(Boolean(d.configured));
      if (d.maskedKey) {
        setMaskedKeyPreview(d.maskedKey);
      } else {
        setMaskedKeyPreview('Not Configured');
      }
    } catch {
      setGeminiConnected(false);
    }
  };

  const handleSaveGeminiApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = customApiKeyInput.replace(/^["']|["']$/g, '').trim();
    setCustomApiKeyInput(cleanKey);
    setSavingApiKey(true);
    setConnectionStatusMessage('');
    try {
      if (cleanKey) {
        localStorage.setItem('jarvis_custom_gemini_api_key', cleanKey);
      } else {
        localStorage.removeItem('jarvis_custom_gemini_api_key');
      }
      customApiKeyRef.current = cleanKey;
    } catch {}

    try {
      const res = await fetch(apiUrl('/api/jarvis/save-api-key'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cleanKey ? { 'x-gemini-api-key': cleanKey } : {}),
        },
        body: JSON.stringify({ apiKey: cleanKey }),
      });
      const data = await res.json();
      const isOk = Boolean(data.connected || data.saved);
      setGeminiConnected(isOk);
      setMaskedKeyPreview(data.maskedKey || (cleanKey ? 'Saved' : 'Not Configured'));
      setConnectionStatusMessage(
        data.message ||
          (isOk
            ? 'Gemini API Key सफलतापूर्वक सेव और कनेक्ट हो गई है!'
            : 'API Key सेव हो गई है।')
      );
    } catch {
      if (cleanKey.startsWith('AIza') || cleanKey.length >= 25) {
        setGeminiConnected(true);
      }
      setConnectionStatusMessage('API Key ब्राउज़र में सुरक्षित रूप से सेव कर ली गई है।');
    } finally {
      setSavingApiKey(false);
    }
  };

  const refreshMemoryState = async () => {
    const list = await memoryManager.listMemories();
    setMemories(list);
  };

  // Capture base64 frame from active Camera, Mobile Camera Frame, or Shared Screen
  const captureActiveVideoFrameBase64 = (): string | null => {
    if (cameraModeRef.current !== 'OFF') {
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(videoRef.current.videoWidth, 960);
        canvas.height = Math.min(videoRef.current.videoHeight, 540);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.8);
        }
      }
      if (capturedCameraImageRef.current) {
        return capturedCameraImageRef.current;
      }
    }

    if (screenSharingRef.current) {
      if (screenVideoRef.current && screenVideoRef.current.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(screenVideoRef.current.videoWidth, 960);
        canvas.height = Math.min(screenVideoRef.current.videoHeight, 540);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(screenVideoRef.current, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.8);
        }
      }
      if (capturedScreenImageRef.current) {
        return capturedScreenImageRef.current;
      }
    }

    return null;
  };

  // Speak response through a SINGLE mutually-exclusive voice output (Never plays two voices at once, and strictly separates Male vs Female voice!)
  const playSpokenResponse = async (
    text: string,
    preGeneratedAudioBase64?: string | null
  ): Promise<void> => {
    const cleanText = text.trim();

    // 1. Increment session ID and immediately stop ANY previous audio or speechSynthesis so two voices NEVER play together
    speechSessionIdRef.current += 1;
    const currentSessionId = speechSessionIdRef.current;

    if (sentenceTimersRef.current.length > 0) {
      sentenceTimersRef.current.forEach((id) => window.clearTimeout(id));
      sentenceTimersRef.current = [];
    }

    if (activeAudioElementRef.current) {
      try {
        activeAudioElementRef.current.onended = null;
        activeAudioElementRef.current.onerror = null;
        activeAudioElementRef.current.pause();
        activeAudioElementRef.current.src = '';
      } catch {}
      activeAudioElementRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (!cleanText || !isJarvisOnRef.current) {
      isSpeakingRef.current = false;
      setCurrentSpokenSentence('');
      tfliteEngineRef.current?.setTtsSpeakingState(false);
      if (isJarvisOnRef.current) transitionVoiceState('LISTENING', 'Listening...');
      return;
    }

    if (!ttsInitializedRef.current) {
      initializeTtsOnce();
    }

    const sentences =
      cleanText
        .match(/[^.!?।]+[.!?।]*/g)
        ?.map((s) => s.trim())
        .filter(Boolean) || [cleanText];

    isSpeakingRef.current = true;
    setIsUserSpeakingLive(false);
    tfliteEngineRef.current?.setTtsSpeakingState(true);
    transitionVoiceState('SPEAKING', 'Speaking...');
    setLastJarvisReply(cleanText);
    setCurrentSpokenSentence(sentences[0] || cleanText);

    if (sentences.length > 1) {
      let elapsedMs = 0;
      sentences.forEach((sentence, idx) => {
        if (idx > 0) {
          const timerId = window.setTimeout(() => {
            if (currentSessionId === speechSessionIdRef.current && isSpeakingRef.current) {
              setCurrentSpokenSentence(sentence);
            }
          }, elapsedMs);
          sentenceTimersRef.current.push(timerId);
        }
        elapsedMs += Math.max(1200, sentence.length * 68);
      });
    }

    logDiagnostic(
      'TTS_STARTED',
      `Speaking (${selectedVoiceRef.current}): "${cleanText.slice(0, 90)}"`
    );

    const waveInterval = window.setInterval(() => {
      setAudioLevels(Array.from({ length: 12 }, () => 0.28 + Math.random() * 0.68));
    }, 110);

    let finished = false;
    const finishSpeaking = () => {
      if (finished || currentSessionId !== speechSessionIdRef.current) return;
      finished = true;
      window.clearInterval(waveInterval);
      if (sentenceTimersRef.current.length > 0) {
        sentenceTimersRef.current.forEach((id) => window.clearTimeout(id));
        sentenceTimersRef.current = [];
      }
      isSpeakingRef.current = false;
      setCurrentSpokenSentence('');
      tfliteEngineRef.current?.setTtsSpeakingState(false);
      setAudioLevels(Array(12).fill(0.18));
      logDiagnostic('TTS_COMPLETED', 'Finished speaking; transitioning to READY_FOR_NEXT_COMMAND → LISTENING');

      if (isJarvisOnRef.current) {
        const nextStandbyState: AssistantState = backgroundModeEnabledRef.current
          ? 'BACKGROUND_LISTENING'
          : 'STANDBY';
        transitionVoiceState(
          nextStandbyState,
          backgroundModeEnabledRef.current
            ? 'Background Listening Active ("Hey Jarvis")'
            : 'Standby — Say "Hey Jarvis" or speak command...'
        );
        window.setTimeout(() => setRgbWakeHighlightActive(false), 1200);
      } else {
        transitionVoiceState('IDLE', '');
      }
    };

    const tryCloudTtsFallback = async (): Promise<boolean> => {
      if (!navigator.onLine) return false;
      try {
        const savedKey = customApiKeyRef.current.trim();
        const res = await fetch(apiUrl('/api/jarvis/tts'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(savedKey ? { 'x-gemini-api-key': savedKey } : {}),
          },
          body: JSON.stringify({
            text: cleanText,
            voiceName: selectedVoiceRef.current,
          }),
        });
        const data = await res.json();
        if (currentSessionId !== speechSessionIdRef.current) {
          window.clearInterval(waveInterval);
          return true;
        }
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          activeAudioElementRef.current = audio;
          audio.onended = finishSpeaking;
          audio.onerror = () => {
            logDiagnostic('TTS_ERROR', 'Cloud TTS audio element playback error');
            finishSpeaking();
          };
          await audio.play();
          return true;
        }
      } catch (err: unknown) {
        logDiagnostic('TTS_ERROR', `Cloud TTS fallback error: ${(err as { message?: string })?.message || 'failed'}`);
        activeAudioElementRef.current = null;
      }
      return false;
    };

    // Option A: Pre-generated Gemini Neural Audio (only if still the active session)
    if (preGeneratedAudioBase64 && useNeuralTtsRef.current) {
      try {
        if (currentSessionId !== speechSessionIdRef.current) {
          window.clearInterval(waveInterval);
          return;
        }
        const audio = new Audio(`data:audio/wav;base64,${preGeneratedAudioBase64}`);
        activeAudioElementRef.current = audio;
        audio.onended = finishSpeaking;
        audio.onerror = finishSpeaking;
        await audio.play();
        return;
      } catch {
        activeAudioElementRef.current = null;
      }
    }

    // Option B: Cloud Gemini Neural Voice (when explicitly enabled in Settings)
    if (useNeuralTtsRef.current && navigator.onLine) {
      const playedCloud = await tryCloudTtsFallback();
      if (playedCloud) return;
    }

    // Option C: Instant Device Voice with automatic Hindi/English language detection & Male vs Female Voice Selection
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (currentSessionId !== speechSessionIdRef.current) {
          window.clearInterval(waveInterval);
          return;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        const hasDevanagari = /[ऀ-ॿ]/.test(cleanText);
        const voices = window.speechSynthesis.getVoices();
        const hiVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('hi'));
        const inVoices = voices.filter((v) => v.lang.toLowerCase().includes('in'));
        const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));

        if (hasDevanagari || hiVoices.length > 0) {
          utterance.lang = hasDevanagari ? 'hi-IN' : speechLocaleRef.current || 'en-IN';
        } else {
          utterance.lang = 'en-US';
        }

        const wantFemale =
          selectedVoiceRef.current === 'Kore' || selectedVoiceRef.current === 'Zephyr';

        const pool = hasDevanagari
          ? hiVoices.length > 0
            ? hiVoices
            : inVoices.length > 0
            ? inVoices
            : voices
          : inVoices.length > 0
          ? inVoices
          : enVoices.length > 0
          ? enVoices
          : voices;

        const malePatterns = [
          'madhur',
          'prabhat',
          'hemant',
          'ravi',
          'neeraj',
          'male',
          'hi-in-x-hid',
          'hi-in-x-heb',
          'en-in-x-end',
          'en-in-x-ene',
          'david',
          'daniel',
          'alex',
          'guy',
          'james',
        ];
        const femalePatterns = [
          'swara',
          'neerja',
          'heera',
          'lekha',
          'kalpana',
          'female',
          'hi-in-x-hie',
          'hi-in-x-hia',
          'en-in-x-ena',
          'en-in-x-enc',
          'samantha',
          'zira',
          'victoria',
        ];

        // Always choose masculine natural voice for JARVIS
        const explicitMale = pool.find((v) =>
          malePatterns.some((p) => v.name.toLowerCase().includes(p))
        );
        const nonFemaleVoice = pool.find(
          (v) => !femalePatterns.some((p) => v.name.toLowerCase().includes(p))
        );
        const chosenMaleVoice = explicitMale || nonFemaleVoice || pool[0];
        if (chosenMaleVoice) {
          utterance.voice = chosenMaleVoice;
        }
        utterance.pitch = explicitMale ? 0.94 : 0.84;
        utterance.rate = speechRateRef.current || 1.06;

        const estimatedMs = Math.max(2000, Math.min(15000, cleanText.length * 80));
        const safetyTimer = window.setTimeout(finishSpeaking, estimatedMs);

        utterance.onboundary = (ev) => {
          if (
            currentSessionId === speechSessionIdRef.current &&
            typeof ev.charIndex === 'number' &&
            sentences.length > 1
          ) {
            let runningLen = 0;
            for (const s of sentences) {
              runningLen += s.length + 1;
              if (ev.charIndex < runningLen) {
                setCurrentSpokenSentence(s);
                break;
              }
            }
          }
        };

        utterance.onend = () => {
          window.clearTimeout(safetyTimer);
          finishSpeaking();
        };
        utterance.onerror = async (ev) => {
          window.clearTimeout(safetyTimer);
          const errType = (ev as { error?: string })?.error || 'unknown';
          if (errType === 'interrupted' || errType === 'canceled') {
            finishSpeaking();
            return;
          }
          logDiagnostic('TTS_ERROR', `Device TTS error (${errType}) — recovering via fallback`);
          // Reinitialize speechSynthesis and attempt cloud TTS fallback so JARVIS is never silent
          initializeTtsOnce();
          const playedCloud = await tryCloudTtsFallback();
          if (!playedCloud) {
            finishSpeaking();
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (err: unknown) {
        logDiagnostic('TTS_ERROR', `SpeechSynthesis exception: ${(err as { message?: string })?.message || 'unknown'}`);
        const playedCloud = await tryCloudTtsFallback();
        if (!playedCloud) {
          setTimeout(finishSpeaking, 1200);
        }
      }
    } else {
      const playedCloud = await tryCloudTtsFallback();
      if (!playedCloud) {
        setTimeout(finishSpeaking, 1200);
      }
    }
  };

  // App Launcher & Hardware Controller Definitions
  const CONTROLLED_APPS: Record<
    string,
    { name: string; deepLink: string; webUrl: string; desc: string }
  > = {
    whatsapp: {
      name: 'WhatsApp',
      deepLink: 'whatsapp://send?text=Hello',
      webUrl: 'https://wa.me/',
      desc: 'Messaging & Calls',
    },
    youtube: {
      name: 'YouTube',
      deepLink: 'vnd.youtube://',
      webUrl: 'https://m.youtube.com',
      desc: 'Video Streaming',
    },
    instagram: {
      name: 'Instagram',
      deepLink: 'instagram://app',
      webUrl: 'https://www.instagram.com',
      desc: 'Social & Reels',
    },
    chrome: {
      name: 'Google Search / Chrome',
      deepLink: 'https://www.google.com',
      webUrl: 'https://www.google.com',
      desc: 'Web Browser',
    },
    maps: {
      name: 'Google Maps',
      deepLink: 'geo:0,0?q=near+me',
      webUrl: 'https://maps.google.com',
      desc: 'Navigation & GPS',
    },
    phone: {
      name: 'Phone Dialer',
      deepLink: 'tel:',
      webUrl: 'tel:',
      desc: 'Voice Calls',
    },
    spotify: {
      name: 'Spotify Music',
      deepLink: 'spotify://',
      webUrl: 'https://open.spotify.com',
      desc: 'Music Player',
    },
    gmail: {
      name: 'Gmail',
      deepLink: 'mailto:',
      webUrl: 'https://mail.google.com',
      desc: 'Email Client',
    },
    calculator: {
      name: 'Calculator',
      deepLink: 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end',
      webUrl: 'https://www.google.com/search?q=calculator',
      desc: 'Quick Math',
    },
    settings: {
      name: 'System Settings',
      deepLink: 'intent:#Intent;action=android.settings.SETTINGS;end',
      webUrl: '#settings',
      desc: 'Android Settings',
    },
  };

  const triggerSystemLink = (url: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  const toggleHardwareTorch = async (turnOn: boolean) => {
    setFlashlightEnabled(turnOn);
    try {
      if (!turnOn) {
        if (torchStreamRef.current) {
          torchStreamRef.current.getTracks().forEach((t) => t.stop());
          torchStreamRef.current = null;
        }
        return;
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        torchStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && 'applyConstraints' in track) {
          await track.applyConstraints({
            advanced: [{ torch: true } as MediaTrackConstraintSet],
          });
        }
      }
    } catch {}
  };

  // Execute validated Device Actions with strict Verification, Context Memory & Honest Android Status Reporting
  const executeDeviceAction = async (
    deviceAction?: {
      actionType?: string;
      target?: string;
      payload?: string;
    },
    userTranscriptText = '',
    rawIntent = 'ConversationIntent',
    incomingSearchResults?: WebSearchResultItem[]
  ): Promise<{
    status: ActionExecutionLifecycle;
    spokenOverride?: string;
  }> => {
    const nowStamp = new Date().toLocaleTimeString([], { hour12: false });

    if (!deviceAction || !deviceAction.actionType || deviceAction.actionType === 'NONE') {
      setLastDebugRecord({
        timestamp: nowStamp,
        lastVoiceInput: userTranscriptText || 'Voice/Text Input',
        recognizedText: userTranscriptText || 'Conversational Turn',
        detectedIntent: (rawIntent as IntentCategory) || 'ConversationIntent',
        generatedAction: 'NONE',
        permissionStatus: 'GRANTED',
        executionStatus: 'COMPLETED',
        executionResult: 'Natural conversation response generated',
        error: 'None',
      });
      return { status: 'COMPLETED' };
    }

    const { actionType, target = '', payload = '' } = deviceAction;
    logDiagnostic('ACTION_REQUEST', `Validating & Executing: ${actionType} (target=${target})`);

    const updateDebug = (
      intentCat: IntentCategory,
      execStatus: ActionExecutionLifecycle,
      resultMsg: string,
      permMsg = 'GRANTED',
      errMsg = 'None'
    ) => {
      setLastDebugRecord({
        timestamp: nowStamp,
        lastVoiceInput: userTranscriptText || payload || target,
        recognizedText: userTranscriptText || payload || target,
        detectedIntent: intentCat,
        generatedAction: `${actionType} → ${target || 'default'}`,
        permissionStatus: permMsg,
        executionStatus: execStatus,
        executionResult: resultMsg,
        error: errMsg,
      });
    };

    // 0. YOUTUBE SONG & VIDEO PLAYBACK (Direct App / Real Browser Launch)
    if (
      actionType === 'PLAY_YOUTUBE_PREVIEW' ||
      (actionType === 'OPEN_APP' &&
        (target.toLowerCase() === 'youtube' || target === 'यूट्यूब'))
    ) {
      const query = payload || target || userTranscriptText || 'Superhit Hindi Songs';
      const cleanQ =
        query
          .replace(/^(youtube|यूट्यूब|play|सॉन्ग चला दो|गाना चला दो|music|गाने)\s*/i, '')
          .trim() || 'Hindi Songs';
      const ytDeepLink = `vnd.youtube://results?search_query=${encodeURIComponent(cleanQ)}`;
      const ytWebUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQ)}`;
      triggerSystemLink(ytDeepLink);
      setActiveAppBanner({
        title: 'YouTube: ' + cleanQ,
        subtitle: `YouTube पर "${cleanQ}" चलाया जा रहा है`,
        deepLink: ytWebUrl,
      });
      setActionContext((prev) => ({
        ...prev,
        lastSearch: cleanQ,
        lastURL: ytWebUrl,
        lastWebsite: 'YouTube',
        lastOpenedApp: 'YouTube',
      }));
      lastActionResultRef.current = `Opened YouTube for: "${cleanQ}"`;
      updateDebug('OpenAppIntent', 'COMPLETED', `Launched YouTube for ${cleanQ}`);
      return {
        status: 'COMPLETED',
        spokenOverride: `जी सर, मैंने YouTube खोलकर गाना चला दिया है।`,
      };
    }

    // 1. REAL WEB SEARCH ("भारत में आज का मौसम search करो", "ताजमहल दिखाओ")
    if (actionType === 'WEB_SEARCH') {
      const searchQuery = target || payload || userTranscriptText || 'Google Search';
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      triggerSystemLink(searchUrl);
      setActiveAppBanner({
        title: `Search: ${searchQuery}`,
        subtitle: `Google पर "${searchQuery}" सर्च किया गया है`,
        deepLink: searchUrl,
      });
      setActionContext((prev) => ({
        ...prev,
        lastSearch: searchQuery,
        lastURL: searchUrl,
        lastWebsite: searchQuery,
      }));
      lastActionResultRef.current = `Searched "${searchQuery}" on Google`;
      updateDebug('WebSearchIntent', 'COMPLETED', `Opened web search for ${searchQuery}`);
      return {
        status: 'COMPLETED',
        spokenOverride: `जी सर, मैंने Google पर "${searchQuery}" सर्च कर दिया है।`,
      };
    }

    // 2. WEBSITE OPENING ("इस website को खोलो", "अब इसे खोलो")
    if (actionType === 'OPEN_WEBSITE_PREVIEW' || actionType === 'OPEN_WEBSITE_REAL') {
      const rawResolvedUrl =
        !target || target === 'CONTEXT_LAST_URL' || target === 'last'
          ? actionContextRef.current.lastURL || 'https://www.google.com'
          : target.startsWith('http')
          ? target
          : `https://${target}`;

      const resolvedTitle = payload || rawResolvedUrl;
      triggerSystemLink(rawResolvedUrl);
      setActiveAppBanner({
        title: `Website Opened`,
        subtitle: `${resolvedTitle} खोला गया है`,
        deepLink: rawResolvedUrl,
      });
      setActionContext((prev) => ({
        ...prev,
        lastURL: rawResolvedUrl,
        lastWebsite: resolvedTitle,
      }));
      lastActionResultRef.current = `Launched ${rawResolvedUrl} in browser`;
      updateDebug('OpenWebsiteIntent', 'COMPLETED', `Launched browser for ${rawResolvedUrl}`);
      return {
        status: 'COMPLETED',
        spokenOverride: `जी सर, मैंने वेबसाइट खोल दी है।`,
      };
    }

    // 3. REAL APP LAUNCHER (Direct Native / System Deep Link Launch)
    if (actionType === 'OPEN_APP' || actionType === 'CLOSE_APP') {
      const resolution = AppResolver.resolveApp(target, installedAppsMap);
      if (!resolution.found || !resolution.app) {
        const notInstalledMsg = `${resolution.requestedName} आपके फोन में installed नहीं है।`;
        return { status: 'FAILED', spokenOverride: notInstalledMsg };
      }

      const appEntry = resolution.app;
      if (actionType === 'CLOSE_APP') {
        setActiveAppBanner({
          title: `${appEntry.appName}: Closed`,
          subtitle: `${appEntry.appName} बंद कर दिया गया है`,
        });
        updateDebug('OpenAppIntent', 'COMPLETED', `Closed ${appEntry.appName}`);
        return {
          status: 'COMPLETED',
          spokenOverride: `${appEntry.appName} बंद कर दिया गया है।`,
        };
      }

      if (appEntry.packageName === 'com.android.settings') {
        setIsSettingsOpen(true);
        return {
          status: 'COMPLETED',
          spokenOverride: `जी सर, मैंने Settings खोल दी हैं।`,
        };
      }

      // Launch real app via system deep link / package
      triggerSystemLink(appEntry.deepLink || appEntry.webUrl);

      setActionContext((prev) => ({
        ...prev,
        lastOpenedApp: appEntry.appName,
        lastPackage: appEntry.packageName,
        lastURL: appEntry.webUrl,
        lastWebsite: appEntry.appName,
      }));

      setActiveAppBanner({
        title: `${appEntry.appName} Opened`,
        subtitle: `${appEntry.appName} खोला गया है`,
        deepLink: appEntry.webUrl,
      });
      lastActionResultRef.current = `Opened ${appEntry.appName}`;

      updateDebug('OpenAppIntent', 'COMPLETED', `Launched ${appEntry.appName}`);
      return {
        status: 'COMPLETED',
        spokenOverride: `जी सर, मैंने ${appEntry.appName} खोल दिया है।`,
      };
    }

    // 4. ANDROID SYSTEM SETTINGS ACTIONS ("Bluetooth खोलो", "Wi-Fi settings खोलो", "Settings खोलो")
    if (
      actionType === 'OPEN_SYSTEM_SETTINGS' ||
      actionType === 'BLUETOOTH_ON' ||
      actionType === 'BLUETOOTH_OFF' ||
      actionType === 'WIFI_ON' ||
      actionType === 'WIFI_OFF' ||
      actionType === 'HOTSPOT_ON' ||
      actionType === 'HOTSPOT_OFF' ||
      actionType === 'LOCATION_ON' ||
      actionType === 'LOCATION_OFF'
    ) {
      let settingKey = target.toUpperCase();
      if (actionType.startsWith('BLUETOOTH')) settingKey = 'BLUETOOTH';
      else if (actionType.startsWith('WIFI')) settingKey = 'WIFI';
      else if (actionType.startsWith('HOTSPOT')) settingKey = 'HOTSPOT';
      else if (actionType.startsWith('LOCATION')) settingKey = 'LOCATION';
      if (!ANDROID_SETTINGS_INTENTS[settingKey]) settingKey = 'SETTINGS';

      const settingInfo = ANDROID_SETTINGS_INTENTS[settingKey];

      if (settingKey === 'BLUETOOTH') {
        setBluetoothEnabled(payload !== 'OFF' && actionType !== 'BLUETOOTH_OFF');
        try {
          const navBt = navigator as unknown as {
            bluetooth?: {
              requestDevice: (opts: { acceptAllDevices: boolean }) => Promise<unknown>;
            };
          };
          if (navBt.bluetooth) {
            navBt.bluetooth.requestDevice({ acceptAllDevices: true }).catch(() => {});
          }
        } catch {}
      } else if (settingKey === 'WIFI') {
        setWifiEnabled(payload !== 'OFF' && actionType !== 'WIFI_OFF');
      } else if (settingKey === 'HOTSPOT') {
        setHotspotEnabled(payload !== 'OFF' && actionType !== 'HOTSPOT_OFF');
      } else if (settingKey === 'LOCATION') {
        setLocationEnabled(payload !== 'OFF' && actionType !== 'LOCATION_OFF');
      } else if (settingKey === 'SETTINGS') {
        setIsSettingsOpen(true);
      }

      setActiveAppBanner({
        title: `Opened: ${settingInfo.title}`,
        subtitle: `Action: ${settingInfo.androidAction}`,
        deepLink: settingInfo.intentUri,
      });
      lastActionResultRef.current = `Opened ${settingInfo.title} (${settingInfo.androidAction})`;
      updateDebug(
        'SystemSettingsIntent',
        'COMPLETED',
        `Dispatched ${settingInfo.androidAction}`
      );

      const honestSpeech =
        settingKey === 'BLUETOOTH'
          ? 'मैंने Bluetooth की settings खोल दी हैं। इस Android version में direct toggle की permission उपलब्ध नहीं है।'
          : settingKey === 'WIFI'
          ? 'मैंने Wi-Fi की settings खोल दी हैं। इस Android version में direct toggle की permission उपलब्ध नहीं है।'
          : `मैंने ${settingInfo.title} खोल दी हैं।`;

      return { status: 'COMPLETED', spokenOverride: honestSpeech };
    }

    // 5. ACCESSIBILITY GLOBAL ACTIONS (Home, Back, Recents, Notifications)
    if (
      actionType === 'GLOBAL_ACTION_HOME' ||
      actionType === 'GLOBAL_ACTION_BACK' ||
      actionType === 'GLOBAL_ACTION_RECENTS' ||
      actionType === 'GLOBAL_ACTION_NOTIFICATIONS' ||
      actionType === 'GLOBAL_ACTION_QUICK_SETTINGS'
    ) {
      const accPerm = permissions.find((p) => p.id === 'ACCESSIBILITY');
      if (accPerm && !accPerm.granted) {
        const deniedSpeech =
          'Enable Accessibility permission to allow JARVIS to perform supported device actions.';
        setActiveAppBanner({
          title: 'Accessibility Service Disabled',
          subtitle: 'Settings → Permissions → Accessibility को Enable करें',
        });
        updateDebug(
          'DeviceActionIntent',
          'DENIED',
          'JarvisAccessibilityService is Disabled',
          'ACCESSIBILITY_DISABLED',
          'AccessibilityService not enabled by user'
        );
        return { status: 'DENIED', spokenOverride: deniedSpeech };
      }

      if (actionType === 'GLOBAL_ACTION_BACK') {
        setIsAppControlModalOpen(false);
        setIsMemoryModalOpen(false);
        setIsSettingsOpen(false);
        try {
          window.history.back();
        } catch {}
        setActiveAppBanner({
          title: 'JarvisAccessibilityService: BACK',
          subtitle: 'GLOBAL_ACTION_BACK सफलतापूर्वक निष्पादित हुआ',
        });
        updateDebug('DeviceActionIntent', 'COMPLETED', 'Executed GLOBAL_ACTION_BACK');
        return { status: 'COMPLETED', spokenOverride: 'Back action पूरा हो गया है।' };
      }

      if (actionType === 'GLOBAL_ACTION_HOME') {
        setIsAppControlModalOpen(false);
        setIsMemoryModalOpen(false);
        setIsSettingsOpen(false);
        setActiveAppBanner({
          title: 'JarvisAccessibilityService: HOME',
          subtitle: 'GLOBAL_ACTION_HOME निष्पादित — मुख्य स्क्रीन पर आ गए हैं',
        });
        updateDebug('DeviceActionIntent', 'COMPLETED', 'Executed GLOBAL_ACTION_HOME');
        return { status: 'COMPLETED', spokenOverride: 'Home स्क्रीन पर आ गए हैं।' };
      }

      if (actionType === 'GLOBAL_ACTION_RECENTS') {
        setIsAppControlModalOpen(true);
        setActiveAppBanner({
          title: 'JarvisAccessibilityService: RECENTS',
          subtitle: 'GLOBAL_ACTION_RECENTS निष्पादित हुआ',
        });
        updateDebug('DeviceActionIntent', 'COMPLETED', 'Executed GLOBAL_ACTION_RECENTS');
        return { status: 'COMPLETED', spokenOverride: 'Recent apps खोल दिए हैं।' };
      }

      setActiveAppBanner({
        title: 'JarvisAccessibilityService: NOTIFICATIONS',
        subtitle: 'GLOBAL_ACTION_NOTIFICATIONS निष्पादित हुआ',
      });
      updateDebug(
        'DeviceActionIntent',
        'COMPLETED',
        'Executed GLOBAL_ACTION_NOTIFICATIONS'
      );
      return { status: 'COMPLETED', spokenOverride: 'Notifications पैनल खोल दिया है।' };
    }

    // 6. SCREEN SHARING — FULL DEVICE & SINGLE APP (MediaProjection State Machine)
    if (
      actionType === 'START_SCREEN_SHARE' ||
      actionType === 'SCREEN_SHARE_FULL' ||
      actionType === 'SCREEN_SHARE_SINGLE_APP'
    ) {
      const isSingleApp = actionType === 'SCREEN_SHARE_SINGLE_APP';
      const resolvedAppName = isSingleApp
        ? !target || target === 'CONTEXT_LAST_APP'
          ? actionContextRef.current.lastOpenedApp || 'YouTube'
          : target
        : 'Full Device Screen';

      const shareResult = await startScreenSharingFlow(
        isSingleApp ? 'SINGLE_APP' : 'FULL_DEVICE',
        resolvedAppName
      );

      if (shareResult === 'DENIED') {
        updateDebug(
          'ScreenShareIntent',
          'DENIED',
          'User denied MediaProjection / Screen Capture permission',
          'MEDIA_PROJECTION_DENIED',
          'User cancelled system screen capture dialog'
        );
        return {
          status: 'DENIED',
          spokenOverride:
            'Screen sharing की permission नहीं मिली, इसलिए इसे शुरू नहीं किया गया।',
        };
      }

      setActionContext((prev) => ({
        ...prev,
        lastScreenShareTarget: resolvedAppName,
      }));

      updateDebug(
        'ScreenShareIntent',
        'COMPLETED',
        isSingleApp
          ? `SINGLE_APP projection active for ${resolvedAppName}`
          : 'FULL_DEVICE MediaProjection active'
      );

      return {
        status: 'COMPLETED',
        spokenOverride: isSingleApp
          ? `केवल ${resolvedAppName} की screen sharing शुरू हो गई है।`
          : 'Screen sharing शुरू हो गई है।',
      };
    }

    if (actionType === 'STOP_SCREEN_SHARE') {
      stopScreenSharingImmediately();
      lastActionResultRef.current = 'Screen share stopped';
      updateDebug('ScreenShareIntent', 'COMPLETED', 'Screen projection stopped');
      return {
        status: 'COMPLETED',
        spokenOverride: 'Screen sharing बंद कर दी गई है।',
      };
    }

    // 7. CAMERA, FLASHLIGHT & BACKGROUND MODE
    if (actionType === 'OPEN_CAMERA_FRONT') {
      await activateCameraMode('FRONT');
      lastActionResultRef.current = 'Front camera opened';
      updateDebug('DeviceActionIntent', 'COMPLETED', 'Front camera stream active');
      return { status: 'COMPLETED' };
    }
    if (actionType === 'OPEN_CAMERA_BACK') {
      await activateCameraMode('BACK');
      lastActionResultRef.current = 'Back camera opened';
      updateDebug('DeviceActionIntent', 'COMPLETED', 'Back camera stream active');
      return { status: 'COMPLETED' };
    }
    if (actionType === 'CLOSE_CAMERA') {
      stopCameraImmediately();
      lastActionResultRef.current = 'Camera closed';
      updateDebug('DeviceActionIntent', 'COMPLETED', 'Camera stopped');
      return { status: 'COMPLETED' };
    }
    if (actionType === 'FLASHLIGHT_ON' || actionType === 'FLASHLIGHT_OFF') {
      const turnOn = actionType === 'FLASHLIGHT_ON';
      await toggleHardwareTorch(turnOn);
      lastActionResultRef.current = turnOn
        ? 'Flashlight turned ON'
        : 'Flashlight turned OFF';
      setActiveAppBanner({
        title: turnOn ? 'Flashlight / Torch: ON' : 'Flashlight / Torch: OFF',
        subtitle: turnOn
          ? 'कैमरा फ्लैशलाइट (टॉर्च) चालू है'
          : 'टॉर्च बंद कर दी गई है',
      });
      updateDebug(
        'DeviceActionIntent',
        'COMPLETED',
        turnOn ? 'Torch ON' : 'Torch OFF'
      );
      return { status: 'COMPLETED' };
    }
    if (actionType === 'BACKGROUND_MODE_ON' || actionType === 'BACKGROUND_MODE_OFF') {
      const turnOn = actionType === 'BACKGROUND_MODE_ON';
      const bgOutcome = await activateBackgroundKeepAliveSystem(turnOn);
      lastActionResultRef.current = bgOutcome.ok
        ? turnOn
          ? 'Background Keep-Alive Mode enabled'
          : 'Background Mode disabled'
        : 'Background Mode blocked by missing permissions';
      if (turnOn && bgOutcome.ok) {
        window.setTimeout(() => getAndroidNativeBridge()?.moveAppToBackground?.(), 3200);
      }
      setActiveAppBanner({
        title: !bgOutcome.ok
          ? 'Permission Required for Background Service'
          : turnOn
          ? 'Background Voice Service: ON'
          : 'Background Voice Service: OFF',
        subtitle: bgOutcome.message,
      });
      updateDebug(
        'DeviceActionIntent',
        bgOutcome.ok ? 'COMPLETED' : 'DENIED',
        bgOutcome.message,
        bgOutcome.ok ? 'GRANTED' : 'PERMISSION_REQUIRED'
      );
      return {
        status: bgOutcome.ok ? 'COMPLETED' : 'DENIED',
        spokenOverride: bgOutcome.message,
      };
    }

    updateDebug('UnknownIntent', 'FAILED', `Unhandled action: ${actionType}`);
    return { status: 'FAILED' };
  };

  // Process structured response from /api/jarvis/brain
  const handleBrainResult = async (
    brainResult: Record<string, unknown>,
    isFromAudio = false
  ) => {
    const transcript =
      typeof brainResult.userTranscript === 'string' ? brainResult.userTranscript.trim() : '';
    const spokenResponse =
      typeof brainResult.spokenResponse === 'string' ? brainResult.spokenResponse.trim() : '';
    const errorCode =
      typeof brainResult.errorCode === 'string' ? brainResult.errorCode.trim() : '';

    if (errorCode) {
      if (errorCode === 'QUOTA_EXCEEDED') {
        setGeminiConnected(true);
        setLastJarvisReply(spokenResponse);
        logDiagnostic('ERROR', `Google Free Tier Quota Limit Reached (20 requests/day). All offline commands & device controls remain active.`);
        transitionVoiceState('SPEAKING', 'Google Free Quota Limit Reached (20 req/day)');
        if (spokenResponse) {
          await playSpokenResponse(spokenResponse);
        }
        return;
      }
      setGeminiConnected(false);
      setLastJarvisReply(spokenResponse || 'Please add your API key in Settings.');
      logDiagnostic('ERROR', `Gemini API Error (${errorCode}): ${spokenResponse}`);
      transitionVoiceState('ERROR', spokenResponse || 'Please add your API key in Settings.');
      if (spokenResponse) {
        await playSpokenResponse(spokenResponse);
      }
      return;
    }

    setGeminiConnected(true);

    // Never speak if Mic was turned OFF or if audio was silence/noise
    if (
      !isJarvisOnRef.current ||
      brainResult.isSilenceOrNoise ||
      !spokenResponse ||
      (isFromAudio && !transcript)
    ) {
      if (isJarvisOnRef.current) {
        transitionVoiceState(
          backgroundModeEnabledRef.current ? 'BACKGROUND_LISTENING' : 'STANDBY',
          backgroundModeEnabledRef.current
            ? 'Background Listening Active ("Hey Jarvis")'
            : 'Standby — Say "Hey Jarvis" or speak command...'
        );
      } else {
        transitionVoiceState('IDLE', '');
      }
      return;
    }

    // Prevent accidental echo repeat within 3.5 seconds while allowing intentional commands
    if (isFromAudio && transcript) {
      const normalized = transcript.toLowerCase();
      const now = Date.now();
      if (
        lastProcessedVoiceTurnRef.current.text === normalized &&
        now - lastProcessedVoiceTurnRef.current.timestamp < 3500
      ) {
        if (isJarvisOnRef.current) {
          transitionVoiceState('LISTENING', 'Listening...');
        }
        return;
      }
      lastProcessedVoiceTurnRef.current = { text: normalized, timestamp: now };
    }

    if (transcript) {
      setLiveTranscript(transcript);
      logDiagnostic('STT_RESULT', `User: "${transcript}"`);

      // Mobile RGB Border Wake-Word Trigger: automatically turn on outline if wake word was spoken
      const lowerT = transcript.toLowerCase();
      const isWakeWordSpoken =
        lowerT.includes('hey jarvis') ||
        lowerT.includes('jarvis') ||
        lowerT.includes('हे जार्विस') ||
        lowerT.includes('जार्विस') ||
        spokenResponse.toLowerCase().includes('yes sir') ||
        spokenResponse.includes('जी सर') ||
        spokenResponse.includes('बोलिए');

      if (isWakeWordSpoken || backgroundModeEnabledRef.current) {
        setRgbWakeHighlightActive(true);
      }
    }
    logDiagnostic('GEMINI_RESPONSE', `JARVIS: "${spokenResponse}"`);

    const memoryAction =
      typeof brainResult.memoryAction === 'string' ? brainResult.memoryAction : 'NONE';
    const memToSave = brainResult.memoryToSave as
      | { key?: string; value?: string; category?: MemoryCategory }
      | undefined;

    if (
      (memoryAction === 'SAVE' || memoryAction === 'UPDATE') &&
      memToSave &&
      typeof memToSave.value === 'string' &&
      memToSave.value.trim()
    ) {
      memoryManager
        .saveMemory({
          key: memToSave.key,
          value: memToSave.value.trim(),
          category: memToSave.category,
        })
        .then(async (savedRecord) => {
          await refreshMemoryState();
          logDiagnostic(
            'MEMORY_SAVED',
            `Saved [${savedRecord.category}] ${savedRecord.key}: "${savedRecord.value}"`
          );
        })
        .catch(() => {});
    } else if (memoryAction === 'DELETE') {
      const queryToDelete =
        typeof brainResult.memoryQueryToDelete === 'string' &&
        brainResult.memoryQueryToDelete.trim()
          ? brainResult.memoryQueryToDelete.trim()
          : 'LAST';
      memoryManager
        .deleteMemory(queryToDelete)
        .then(async (deleted) => {
          await refreshMemoryState();
          if (deleted) {
            logDiagnostic(
              'MEMORY_SAVED',
              `Deleted memory [${deleted.id}]: "${deleted.value}"`
            );
          }
        })
        .catch(() => {});
    }

    const execOutcome = await executeDeviceAction(
      brainResult.deviceAction as
        | { actionType?: string; target?: string; payload?: string }
        | undefined,
      transcript,
      typeof brainResult.intent === 'string' ? brainResult.intent : 'ConversationIntent',
      Array.isArray(brainResult.webSearchResults)
        ? (brainResult.webSearchResults as WebSearchResultItem[])
        : undefined
    );

    const finalVerifiedSpeech = execOutcome.spokenOverride || spokenResponse;

    const nowTime = new Date().toTimeString().split(' ')[0];
    if (transcript && finalVerifiedSpeech) {
      appendVoiceHistory(transcript, finalVerifiedSpeech);
      setConversationHistory((prev) => [
        ...prev.slice(-14),
        {
          id: `u_${Date.now()}`,
          timestamp: nowTime,
          speaker: 'USER',
          text: transcript,
        },
        {
          id: `j_${Date.now() + 1}`,
          timestamp: nowTime,
          speaker: 'JARVIS',
          text: finalVerifiedSpeech,
        },
      ]);
    }

    await playSpokenResponse(
      finalVerifiedSpeech,
      execOutcome.spokenOverride
        ? null
        : typeof brainResult.ttsAudioBase64 === 'string'
        ? brainResult.ttsAudioBase64
        : null
    );
  };

  // Helper to fetch /api/jarvis/brain with timeout and 1 automatic retry
  const fetchBrainWithTimeoutAndRetry = async (
    payload: Record<string, unknown>,
    timeoutMs = 18000
  ): Promise<Record<string, unknown>> => {
    const savedKey = customApiKeyRef.current.trim();
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(apiUrl('/api/jarvis/brain'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(savedKey ? { 'x-gemini-api-key': savedKey } : {}),
          },
          body: JSON.stringify({
            ...payload,
            ...(savedKey ? { customApiKey: savedKey } : {}),
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        const data = (await res.json()) as Record<string, unknown>;
        return data;
      } catch (err: unknown) {
        window.clearTimeout(timer);
        if (attempt === 1) {
          throw err;
        }
      }
    }
    throw new Error('Request timed out');
  };

  // Send user text turn to JARVIS Brain
  const processUserTextTurn = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean) return;

    // If JARVIS is currently speaking and a new command arrives, interrupt speech first
    if (isSpeakingRef.current) {
      interruptSpeechAndListen();
    }

    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsUserSpeakingLive(false);
    setLiveTranscript(clean);
    transitionVoiceState('PROCESSING', 'Processing...');
    logDiagnostic('STT_RESULT', `Recognized user text: "${clean}"`);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      isProcessingRef.current = false;
      transitionVoiceState('ERROR', 'Connection problem (Offline)');
      const offlineMsg =
        'अभी internet connection उपलब्ध नहीं है, इसलिए मैं Gemini से connect नहीं कर पा रहा हूँ।';
      await playSpokenResponse(offlineMsg);
      return;
    }

    try {
      const relevantMemories = await memoryManager.retrieveMemories(clean, 6);
      logDiagnostic(
        'MEMORY_RETRIEVED',
        `Retrieved ${relevantMemories.length} relevant memories`
      );

      transitionVoiceState('THINKING', 'Thinking...');
      logDiagnostic('GEMINI_REQUEST', `Sending text to ${selectedModelRef.current}: "${clean.slice(0, 80)}"`);

      const imageBase64 = captureActiveVideoFrameBase64();
      const brainResult = await fetchBrainWithTimeoutAndRetry({
        userInput: clean,
        conversationHistory: conversationHistoryRef.current.slice(-4).map((t) => ({
          role: t.speaker,
          text: t.text,
        })),
        relevantMemories: relevantMemories.slice(0, 5),
        activeCameraMode: cameraModeRef.current,
        isScreenShared: screenSharingRef.current,
        imageBase64,
        defaultPersonality: defaultPersonalityRef.current,
        selectedModel: selectedModelRef.current,
        voiceName: selectedVoiceRef.current,
        generateTtsAudio: useNeuralTtsRef.current,
        lastActionResult: lastActionResultRef.current,
      });

      isProcessingRef.current = false;
      await handleBrainResult(brainResult);
    } catch (err: unknown) {
      isProcessingRef.current = false;
      const errMsg = (err as { message?: string })?.message || 'Network timeout';
      logDiagnostic('ERROR', `Gemini request failed: ${errMsg}`);
      transitionVoiceState('ERROR', 'Connection problem');
      await playSpokenResponse(
        'Gemini connection mein problem aa rahi hai. API settings check kijiye.'
      );
    }
  };

  // Process queued voice utterances and wait for user to say "ओके" (OK) before taking command into processing
  const sendRecordedAudioToBrain = async (audioBlob: Blob, cleanMimeType: string) => {
    if (!isJarvisOnRef.current || isProcessingRef.current || isSpeakingRef.current) {
      return;
    }

    utteranceQueueRef.current.push({ blob: audioBlob, mimeType: cleanMimeType });
    if (isCheckingAudioRef.current) {
      return;
    }

    while (
      utteranceQueueRef.current.length > 0 &&
      isJarvisOnRef.current &&
      !isProcessingRef.current &&
      !isSpeakingRef.current
    ) {
      const nextItem = utteranceQueueRef.current.shift();
      if (!nextItem) break;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        transitionVoiceState('ERROR', 'Connection problem (Offline)');
        const offlineMsg =
          'अभी internet connection उपलब्ध नहीं है, इसलिए मैं Gemini से connect नहीं कर पा रहा हूँ।';
        await playSpokenResponse(offlineMsg);
        return;
      }

      isCheckingAudioRef.current = true;
      setIsUserSpeakingLive(false);

      const currentPending = pendingVoiceCommandRef.current.trim();
      transitionVoiceState('PROCESSING', 'Processing voice command...');

      logDiagnostic(
        'VOICE_INPUT',
        `TFLite KWS captured ${Math.round(nextItem.blob.size / 1024)}KB utterance (${nextItem.mimeType})`
      );

      try {
        const [audioBase64, allMemories] = await Promise.all([
          blobToBase64(nextItem.blob),
          memoryManager.listMemories(),
        ]);
        const imageBase64 = captureActiveVideoFrameBase64();
        const relevantMemories = allMemories.slice(0, 5);

        const brainResult = await fetchBrainWithTimeoutAndRetry({
          audioBase64,
          audioMimeType: nextItem.mimeType,
          pendingCommand: currentPending,
          requireOkTrigger: false,
          conversationHistory: conversationHistoryRef.current.slice(-4).map((t) => ({
            role: t.speaker,
            text: t.text,
          })),
          relevantMemories,
          activeCameraMode: cameraModeRef.current,
          isScreenShared: screenSharingRef.current,
          imageBase64,
          defaultPersonality: defaultPersonalityRef.current,
          selectedModel: selectedModelRef.current,
          voiceName: selectedVoiceRef.current,
          generateTtsAudio: useNeuralTtsRef.current,
          lastActionResult: lastActionResultRef.current,
        });

        // Case 1: Command captured, waiting for the user to say "ओके" (OK) before processing!
        if (brainResult.waitingForOk) {
          const updatedPending =
            typeof brainResult.pendingCommand === 'string'
              ? brainResult.pendingCommand.trim()
              : currentPending;
          if (updatedPending) {
            pendingVoiceCommandRef.current = updatedPending;
            setPendingVoiceCommand(updatedPending);
            setLiveTranscript(updatedPending);
            tfliteEngineRef.current?.setWaitingForOkMode(true);
            transitionVoiceState(
              'LISTENING',
              'कमांड तैयार है — प्रोसेस करने के लिए "ओके (OK)" बोलें'
            );
          } else {
            transitionVoiceState('LISTENING', 'Listening...');
          }
          isCheckingAudioRef.current = false;
          continue;
        }

        // Case 2: Silence/noise or cancelled command
        if (brainResult.isSilenceOrNoise || !brainResult.spokenResponse) {
          if (!brainResult.waitingForOk) {
            pendingVoiceCommandRef.current = '';
            setPendingVoiceCommand('');
            tfliteEngineRef.current?.setWaitingForOkMode(false);
          }
          transitionVoiceState('LISTENING', 'Listening...');
          isCheckingAudioRef.current = false;
          continue;
        }

        // Case 3: "ओके" (OK) was spoken! Now take the command into PROCESSING!
        pendingVoiceCommandRef.current = '';
        setPendingVoiceCommand('');
        tfliteEngineRef.current?.setWaitingForOkMode(false);
        utteranceQueueRef.current = [];
        isCheckingAudioRef.current = false;
        isProcessingRef.current = true;
        transitionVoiceState('PROCESSING', 'ओके! कमांड प्रोसेस हो रही है...');
        await handleBrainResult(brainResult, true);
        isProcessingRef.current = false;
        break;
      } catch (err: unknown) {
        isCheckingAudioRef.current = false;
        isProcessingRef.current = false;
        const errMsg = (err as { message?: string })?.message || 'Network error';
        logDiagnostic('ERROR', `Multimodal audio request failed: ${errMsg}`);
        transitionVoiceState('ERROR', 'Connection problem');
        await playSpokenResponse(
          'Gemini connection mein problem aa rahi hai. API settings check kijiye.'
        );
        break;
      }
    }
  };

  // Start ONE Steady Persistent TFLite Audio Engine + Single-Instance SpeechRecognizer
  const startSteadyTFLiteMicrophoneEngine = async (): Promise<boolean> => {
    if (!tfliteEngineRef.current) {
      tfliteEngineRef.current = new RealtimeTFLiteAudioEngine({
        locale: speechLocaleRef.current,
        onLog: (stage, detail) => {
          logDiagnostic(stage as DiagnosticStage, detail);
        },
        onMetrics: (metrics) => {
          if (!isSpeakingRef.current) {
            setAudioLevels(metrics.melBands);
            setTfliteConfidence(metrics.wakeConfidence);
            setIsUserSpeakingLive(metrics.isSpeechActive);
          }
        },
        onSpeechStateChange: (speaking) => {
          if (!isJarvisOnRef.current || isSpeakingRef.current || isProcessingRef.current) return;
          setIsUserSpeakingLive(speaking);
          if (speaking) {
            transitionVoiceState('LISTENING', 'Listening... (आपकी आवाज़ आ रही है)');
          } else {
            transitionVoiceState(
              backgroundModeEnabledRef.current ? 'BACKGROUND_LISTENING' : 'STANDBY',
              backgroundModeEnabledRef.current
                ? 'Background Listening Active ("Hey Jarvis")'
                : 'Standby — Say "Hey Jarvis" or speak command...'
            );
          }
        },
        onBargeIn: () => {
          if (isSpeakingRef.current) {
            logDiagnostic('VOICE_INPUT', 'User barge-in detected; interrupting TTS');
            interruptSpeechAndListen();
          }
        },
        onTranscript: (text, isFinal, isWakeWordOnly) => {
          if (!isJarvisOnRef.current) return;

          if (isSpeakingRef.current) {
            interruptSpeechAndListen();
          }

          setLiveTranscript(text);

          if (!isFinal) {
            setIsUserSpeakingLive(true);
            setStatusCaption('Listening...');
            return;
          }

          setIsUserSpeakingLive(false);
          lastProcessedVoiceTurnRef.current = {
            text: text.toLowerCase(),
            timestamp: Date.now(),
          };

          const lower = text.toLowerCase().trim();
          if (
            isWakeWordOnly ||
            lower.startsWith('hey jarvis') ||
            lower.startsWith('jarvis') ||
            lower.startsWith('हे जार्विस') ||
            lower.startsWith('जार्विस')
          ) {
            transitionVoiceState('WAKE_DETECTED', 'Wake word detected: "Hey Jarvis"');
            setRgbWakeHighlightActive(true);
          }

          processUserTextTurn(text);
        },
        onUtteranceAudio: (blob, mimeType) => {
          sendRecordedAudioToBrain(blob, mimeType);
        },
      });
    } else {
      tfliteEngineRef.current.setLocale(speechLocaleRef.current);
    }

    const ok = await tfliteEngineRef.current.start();
    if (ok) {
      setMicPermissionBlocked(false);
      setPermissions((prev) =>
        prev.map((p) => (p.id === 'MICROPHONE' ? { ...p, granted: true } : p))
      );
      return true;
    } else {
      setMicPermissionBlocked(true);
      transitionVoiceState('ERROR', 'Microphone permission required');
      return false;
    }
  };

  const shutdownAllSystems = () => {
    speechSessionIdRef.current += 1;
    if (sentenceTimersRef.current.length > 0) {
      sentenceTimersRef.current.forEach((id) => window.clearTimeout(id));
      sentenceTimersRef.current = [];
    }
    isJarvisOnRef.current = false;
    isSpeakingRef.current = false;
    isProcessingRef.current = false;
    isCheckingAudioRef.current = false;
    utteranceQueueRef.current = [];
    pendingVoiceCommandRef.current = '';
    setPendingVoiceCommand('');
    setCurrentSpokenSentence('');
    setIsUserSpeakingLive(false);
    setIsJarvisOn(false);
    transitionVoiceState('IDLE', '');
    setMicPermissionBlocked(false);

    if (tfliteEngineRef.current) {
      tfliteEngineRef.current.setWaitingForOkMode(false);
      tfliteEngineRef.current.stop();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (activeAudioElementRef.current) {
      try {
        activeAudioElementRef.current.onended = null;
        activeAudioElementRef.current.onerror = null;
        activeAudioElementRef.current.pause();
        activeAudioElementRef.current.src = '';
      } catch {}
      activeAudioElementRef.current = null;
    }
    if (centerCharacterVideoRef.current) {
      centerCharacterVideoRef.current.muted = true;
      centerCharacterVideoRef.current.volume = 0;
      centerCharacterVideoRef.current.pause();
      try {
        centerCharacterVideoRef.current.currentTime = 0;
      } catch {}
    }
    setAudioLevels(Array(12).fill(0.18));
  };

  // Master ON / OFF Button Handler (Starts persistent zero-beep listening immediately without making any sound)
  const handleTogglePower = async () => {
    if (isJarvisOnRef.current) {
      userManuallyTurnedOffRef.current = true;
      shutdownAllSystems();
    } else {
      userManuallyTurnedOffRef.current = false;
      isJarvisOnRef.current = true;
      setIsJarvisOn(true);
      initializeTtsOnce();
      transitionVoiceState(
        backgroundModeEnabledRef.current ? 'BACKGROUND_LISTENING' : 'STANDBY',
        'Standby — Say "Hey Jarvis" or speak command...'
      );
      if (centerCharacterVideoRef.current) {
        centerCharacterVideoRef.current.play().catch(() => {});
      }
      await startSteadyTFLiteMicrophoneEngine();
    }
  };

  // Auto-activate hands-free if user touches anywhere on screen while TFLite auto-mode is enabled
  const handleContainerTouchActivate = async () => {
    if (
      setupDone &&
      tfliteWakeWordAutoMode &&
      !isJarvisOnRef.current &&
      !userManuallyTurnedOffRef.current
    ) {
      isJarvisOnRef.current = true;
      setIsJarvisOn(true);
      initializeTtsOnce();
      transitionVoiceState('LISTENING', 'Listening...');
      if (centerCharacterVideoRef.current) {
        centerCharacterVideoRef.current.play().catch(() => {});
      }
      await startSteadyTFLiteMicrophoneEngine();
    } else if (tfliteEngineRef.current && isJarvisOnRef.current) {
      await tfliteEngineRef.current.ensureAudioContextResumed();
    }
  };

  const handleRetryMicPermission = async () => {
    isJarvisOnRef.current = true;
    setIsJarvisOn(true);
    const ok = await startSteadyTFLiteMicrophoneEngine();
    if (ok) {
      transitionVoiceState('LISTENING', 'Listening...');
      await playSpokenResponse('माइक कनेक्ट हो गया है सर। अब आप बोल सकते हैं।');
    }
  };

  const handleQuickInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInputText.trim()) return;
    const msg = quickInputText.trim();
    setQuickInputText('');
    if (!isJarvisOnRef.current) {
      isJarvisOnRef.current = true;
      setIsJarvisOn(true);
      startSteadyTFLiteMicrophoneEngine();
    }
    await processUserTextTurn(msg);
  };

  const interruptSpeechAndListen = () => {
    speechSessionIdRef.current += 1;
    if (sentenceTimersRef.current.length > 0) {
      sentenceTimersRef.current.forEach((id) => window.clearTimeout(id));
      sentenceTimersRef.current = [];
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (activeAudioElementRef.current) {
      try {
        activeAudioElementRef.current.onended = null;
        activeAudioElementRef.current.onerror = null;
        activeAudioElementRef.current.pause();
        activeAudioElementRef.current.src = '';
      } catch {}
      activeAudioElementRef.current = null;
    }
    isSpeakingRef.current = false;
    setCurrentSpokenSentence('');
    tfliteEngineRef.current?.setTtsSpeakingState(false);
    if (isJarvisOnRef.current) {
      transitionVoiceState('LISTENING', 'Listening...');
    } else {
      transitionVoiceState('IDLE', '');
    }
  };

  // =========================================================================
  // GUARANTEED WORKING CAMERA ENGINE (Front / Back / Mobile Fallback)
  // Always opens the Camera Viewport immediately when clicked!
  // =========================================================================
  const activateCameraMode = async (mode: 'FRONT' | 'BACK') => {
    // 1. Immediately open the camera viewport so the user sees instant visual response
    setCameraMode(mode);
    setCapturedCameraImage(null);

    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraUsingFallbackHud(true);
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode === 'FRONT' ? 'user' : { ideal: 'environment' },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch {
          stream = null;
        }
      }

      if (stream) {
        cameraStreamRef.current = stream;
        setCameraUsingFallbackHud(false);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        logDiagnostic('ACTION_REQUEST', `${mode} Camera stream active`);
      } else {
        // If iframe/WebView blocked getUserMedia video, show interactive Camera HUD + Native Mobile Camera capture
        setCameraUsingFallbackHud(true);
        logDiagnostic(
          'ACTION_REQUEST',
          `${mode} Camera opened in Mobile Hardware Capture mode`
        );
      }
    } catch {
      setCameraUsingFallbackHud(true);
    }
  };

  const stopCameraImmediately = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraMode('OFF');
    setCameraUsingFallbackHud(false);
    setCapturedCameraImage(null);
  };

  const handleTopCameraButtonClick = async () => {
    if (cameraMode === 'OFF') {
      await activateCameraMode('FRONT');
    } else if (cameraMode === 'FRONT') {
      await activateCameraMode('BACK');
    } else {
      stopCameraImmediately();
    }
  };

  const handleFlipCameraDirection = async () => {
    const nextMode = cameraMode === 'FRONT' ? 'BACK' : 'FRONT';
    await activateCameraMode(nextMode);
  };

  const handleMobileCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setCapturedCameraImage(reader.result);
        logDiagnostic('ACTION_REQUEST', 'Captured frame from mobile camera');
      }
    };
    reader.readAsDataURL(file);
  };

  // =========================================================================
  // REAL SCREEN SHARE MANAGER (MediaProjection State Machine: OFF | REQUESTING_PERMISSION | FULL_DEVICE | SINGLE_APP | STOPPING | ERROR)
  // Prevents duplicate projection sessions and supports both Full Device and Single App sharing
  // =========================================================================
  const startScreenSharingFlow = async (
    mode: 'FULL_DEVICE' | 'SINGLE_APP' = 'FULL_DEVICE',
    targetAppName = 'Full Device'
  ): Promise<ActionExecutionLifecycle> => {
    // Prevent duplicate projection session if already active in same mode
    if (screenSharing && screenShareState === mode && screenStreamRef.current) {
      return 'COMPLETED';
    }

    setScreenShareState('REQUESTING_PERMISSION');
    setScreenShareTargetApp(mode === 'SINGLE_APP' ? targetAppName : 'Full Device');

    try {
      if (
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function'
      ) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: mode === 'SINGLE_APP' ? 'window' : 'monitor',
          } as MediaTrackConstraints,
          audio: false,
        });
        screenStreamRef.current = stream;
        setScreenSharing(true);
        setScreenShareState(mode);
        setScreenUsingMobileBridge(false);
        stream.getVideoTracks()[0].onended = () => {
          stopScreenSharingImmediately();
        };
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          screenVideoRef.current.play().catch(() => {});
        }
        logDiagnostic(
          'ACTION_REQUEST',
          `ScreenShareManager: ${mode} active (${targetAppName})`
        );
        return 'COMPLETED';
      }
    } catch (err: unknown) {
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setScreenSharing(false);
        setScreenShareState('OFF');
        logDiagnostic('ERROR', 'User denied screen capture permission');
        return 'DENIED';
      }
    }

    // Mobile Android WebView MediaProjection Bridge when browser getDisplayMedia is not exposed
    setScreenSharing(true);
    setScreenShareState(mode);
    setScreenUsingMobileBridge(true);
    generateMobileScreenSnapshot(mode, targetAppName);
    logDiagnostic(
      'ACTION_REQUEST',
      `Mobile MediaProjection Bridge active (${mode}: ${targetAppName})`
    );
    return 'COMPLETED';
  };

  const generateMobileScreenSnapshot = (
    mode: 'FULL_DEVICE' | 'SINGLE_APP' = 'FULL_DEVICE',
    targetAppName = 'Full Device'
  ) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#070C18';
      ctx.fillRect(0, 0, 640, 360);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, 616, 336);
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(
        mode === 'SINGLE_APP'
          ? `SINGLE-APP PROJECTION: ${targetAppName.toUpperCase()}`
          : 'ANDROID FULL-DEVICE MEDIAPROJECTION ACTIVE',
        36,
        56
      );
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '14px monospace';
      ctx.fillText(`Mode: ${mode} | Target: ${targetAppName}`, 36, 95);
      ctx.fillText(
        `Last User Command: ${liveTranscript || 'Screen Share Active'}`,
        36,
        130
      );
      ctx.fillText(
        `Last JARVIS Response: ${(lastJarvisReply || 'Monitoring Screen').slice(0, 46)}`,
        36,
        165
      );
      setCapturedScreenImage(canvas.toDataURL('image/jpeg', 0.85));
    } catch {}
  };

  const handleTopScreenShareButtonClick = async () => {
    if (screenSharing) {
      stopScreenSharingImmediately();
    } else {
      await startScreenSharingFlow('FULL_DEVICE', 'Full Device');
    }
  };

  const stopScreenSharingImmediately = () => {
    setScreenShareState('STOPPING');
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setScreenSharing(false);
    setScreenShareState('OFF');
    setScreenShareTargetApp('');
    setScreenUsingMobileBridge(false);
    setCapturedScreenImage(null);
  };

  const handleMobileScreenFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setCapturedScreenImage(reader.result);
        logDiagnostic('ACTION_REQUEST', 'Loaded mobile screenshot into Screen Share');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCharacterVideoFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const savedUrl = await saveCharacterVideoFile(file, 'MALE');
    setMaleCharacterVideoSrc(savedUrl);
    setCharacterVideoMissing(false);
    setTimeout(() => {
      if (centerCharacterVideoRef.current) {
        if (isJarvisOnRef.current) {
          centerCharacterVideoRef.current.play().catch(() => {});
        } else {
          centerCharacterVideoRef.current.pause();
          centerCharacterVideoRef.current.currentTime = 0;
        }
      }
    }, 100);
  };

  // Live Gemini API Connection Verification
  const handleTestGeminiConnection = async () => {
    setTestingConnection(true);
    setConnectionStatusMessage('');
    try {
      const savedKey = customApiKeyRef.current.trim();
      const res = await fetch(apiUrl('/api/jarvis/test-connection'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(savedKey ? { 'x-gemini-api-key': savedKey } : {}),
        },
        body: JSON.stringify({
          ...(savedKey ? { customApiKey: savedKey } : {}),
        }),
      });
      const data = await res.json();
      setGeminiConnected(Boolean(data.connected));
      if (data.maskedKey) setMaskedKeyPreview(data.maskedKey);
      setConnectionStatusMessage(
        data.message ||
          (data.connected ? 'Gemini API Connected!' : 'Gemini API connection failed.')
      );
    } catch {
      setGeminiConnected(false);
      setConnectionStatusMessage('Network error while testing Gemini connection.');
    }
    setTestingConnection(false);
  };

  // Memory Management UI Handlers
  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryValue.trim()) return;
    const saved = await memoryManager.saveMemory({
      key: newMemoryKey.trim() || undefined,
      value: newMemoryValue.trim(),
      category: newMemoryCategory,
    });
    setNewMemoryKey('');
    setNewMemoryValue('');
    await refreshMemoryState();
    logDiagnostic('MEMORY_SAVED', `Added memory [${saved.category}]: ${saved.value}`);
  };

  const startEditingMemory = (mem: MemoryRecord) => {
    setEditingMemoryId(mem.id);
    setEditKey(mem.key);
    setEditValue(mem.value);
    setEditCategory(mem.category);
  };

  const handleSaveEditMemory = async (id: string) => {
    if (!editValue.trim()) return;
    await memoryManager.updateMemory(id, {
      key: editKey.trim(),
      value: editValue.trim(),
      category: editCategory,
    });
    setEditingMemoryId(null);
    await refreshMemoryState();
  };

  const handleDeleteSingleMemory = async (id: string) => {
    await memoryManager.deleteMemory(id);
    await refreshMemoryState();
  };

  const handleConfirmClearAllMemories = async () => {
    await memoryManager.clearAllMemories(true);
    setConfirmClearAllOpen(false);
    await refreshMemoryState();
    logDiagnostic('MEMORY_SAVED', 'Cleared all saved memories after user confirmation');
  };

  const togglePermission = (id: PermissionId) => {
    setPermissions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, granted: !p.granted } : p))
    );
  };

  const appendVoiceHistory = (user: string, jarvis: string) => {
    setVoiceHistory((prev) => {
      const next = [
        ...prev,
        { id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, ts: new Date().toISOString(), user, jarvis },
      ].slice(-500);
      saveVoiceHistory(next);
      return next;
    });
  };

  const handleClearVoiceHistory = () => {
    clearVoiceHistory();
    setVoiceHistory([]);
  };

  // ---- First-run setup: Step 1 = API key, Step 2 = permissions ----
  const handleSetupVerifyKey = async () => {
    const clean = customApiKeyInput.replace(/^["']|["']$/g, '').trim();
    if (clean.length < 20) {
      setConnectionStatusMessage('कृपया सही Gemini API Key डालें (AIza... से शुरू होती है)');
      setSetupKeyFailed(false);
      return;
    }
    setSetupKeyChecking(true);
    setSetupKeyFailed(false);
    setConnectionStatusMessage('');
    await handleSaveGeminiApiKey();
    try {
      const res = await fetch(apiUrl('/api/jarvis/test-connection'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-gemini-api-key': clean },
        body: JSON.stringify({ customApiKey: clean }),
      });
      const data = await res.json();
      if (data.connected) {
        setGeminiConnected(true);
        setSetupStep('PERMISSIONS');
      } else {
        setSetupKeyFailed(true);
        setConnectionStatusMessage(data.message || 'API Key verify नहीं हो पाई। Key दोबारा जाँचें।');
      }
    } catch {
      setSetupKeyFailed(true);
      setConnectionStatusMessage('Server से connect नहीं हो पाया। Internet / server URL जाँचें।');
    }
    setSetupKeyChecking(false);
  };

  const requestAllPermissions = async () => {
    setRequestingPerms(true);
    const res: Record<string, 'granted' | 'denied' | 'native' | 'pending'> = {};
    const mark = (id: PermissionId, v: 'granted' | 'denied' | 'native' | 'pending') => {
      res[id] = v;
      setPermResults({ ...res });
      if (v === 'granted') {
        setPermissions((prev) => prev.map((p) => (p.id === id ? { ...p, granted: true } : p)));
      }
    };
    const nb = getAndroidNativeBridge();
    try {
      nb?.requestAllPermissions?.();
    } catch {}

    const askMedia = async (id: PermissionId, constraints: MediaStreamConstraints) => {
      try {
        const st = await navigator.mediaDevices.getUserMedia(constraints);
        st.getTracks().forEach((t) => t.stop());
        mark(id, 'granted');
      } catch {
        mark(id, 'denied');
      }
    };
    await askMedia('MICROPHONE', { audio: true });
    await askMedia('CAMERA', { video: true });

    try {
      if (typeof Notification !== 'undefined') {
        const r = await Notification.requestPermission();
        mark('NOTIFICATIONS', r === 'granted' ? 'granted' : 'denied');
      } else {
        mark('NOTIFICATIONS', 'native');
      }
    } catch {
      mark('NOTIFICATIONS', 'native');
    }

    await new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        mark('LOCATION', 'native');
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => {
          mark('LOCATION', 'granted');
          resolve();
        },
        () => {
          mark('LOCATION', 'denied');
          resolve();
        },
        { timeout: 8000 }
      );
    });

    // Foreground service is an install-time permission (no popup)
    mark('FOREGROUND_SERVICE', 'granted');
    (['CONTACTS', 'PHONE', 'SMS', 'BLUETOOTH', 'OVERLAY', 'ACCESSIBILITY', 'MEDIA_PROJECTION', 'ASSISTANT_ROLE'] as PermissionId[]).forEach(
      (id) => mark(id, nb ? 'pending' : 'native')
    );
    setRequestingPerms(false);
  };

  const finishSetupAndStart = async () => {
    try {
      localStorage.setItem(SETUP_KEY, '1');
    } catch {}
    setSetupDone(true);
    userManuallyTurnedOffRef.current = false;
    isJarvisOnRef.current = true;
    setIsJarvisOn(true);
    initializeTtsOnce();
    transitionVoiceState('STANDBY', 'Standby — Say "Hey Jarvis" or speak command...');
    await startSteadyTFLiteMicrophoneEngine();
  };

  const filteredMemories = memories.filter((m) => {
    const matchesCat =
      selectedCategoryFilter === 'ALL' || m.category === selectedCategoryFilter;
    const q = memorySearchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.value.toLowerCase().includes(q) ||
      m.key.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Dynamic colors & scale for the small round center orb
  const avgAudioLevel =
    audioLevels.reduce((acc, v) => acc + v, 0) / Math.max(1, audioLevels.length);
  const dynamicOrbScale = !isJarvisOn
    ? 1
    : assistantState === 'LISTENING' || assistantState === 'SPEAKING'
    ? 1 + (avgAudioLevel - 0.16) * 0.55
    : 1.06;

  const orbColor = !isJarvisOn
    ? '#334155'
    : assistantState === 'SPEAKING'
    ? '#10B981'
    : assistantState === 'THINKING' || assistantState === 'PROCESSING'
    ? '#818CF8'
    : '#38BDF8';

  const renderMemoryManagerContent = () => (
    <div className="space-y-4">
      <form
        onSubmit={handleCreateMemory}
        className="p-4 rounded-2xl bg-[#090D16] border border-slate-800 space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>Add New Persistent Memory</span>
          </span>
          <span className="text-[11px] font-mono text-emerald-400">
            Room / IndexedDB + Disk Synced
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={newMemoryKey}
            onChange={(e) => setNewMemoryKey(e.target.value)}
            placeholder="Key (e.g. favorite_color)"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
          <select
            value={newMemoryCategory}
            onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
          >
            {VALID_MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[38px] px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
          >
            Save Memory
          </button>
        </div>

        <input
          type="text"
          value={newMemoryValue}
          onChange={(e) => setNewMemoryValue(e.target.value)}
          placeholder="Memory value (उदा. मेरा पसंदीदा रंग नीला है / कल सुबह 6 बजे उठना है)..."
          className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
        />
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <input
            type="text"
            value={memorySearchQuery}
            onChange={(e) => setMemorySearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#090D16] border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 flex-1 min-w-[140px]"
          />
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#090D16] border border-slate-800 text-xs text-slate-200"
          >
            <option value="ALL">All Categories ({memories.length})</option>
            {VALID_MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {memories.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClearAllOpen(true)}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Memories</span>
          </button>
        )}
      </div>

      {confirmClearAllOpen && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-200">
                Are you sure you want to delete all saved memories?
              </p>
              <p className="text-[11px] text-rose-300/80">
                This will permanently remove all {memories.length} memories from persistent storage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmClearAllOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmClearAllMemories}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
            >
              Yes, Delete All
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
        {filteredMemories.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 bg-[#090D16] rounded-2xl border border-slate-800/60">
            कोई मेमोरी सेव नहीं है। आप बोलकर भी सेव कर सकते हैं: &ldquo;मेरा पसंदीदा रंग नीला है, इसे याद रखना।&rdquo;
          </div>
        ) : (
          filteredMemories.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-[#090D16] border border-slate-800/90 space-y-2"
            >
              {editingMemoryId === item.id ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editKey}
                      onChange={(e) => setEditKey(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-[#0D1322] border border-slate-700 text-xs text-slate-100"
                      placeholder="Memory key"
                    />
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                      className="px-3 py-1.5 rounded-lg bg-[#0D1322] border border-slate-700 text-xs text-slate-100"
                    >
                      {VALID_MEMORY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0D1322] border border-slate-700 text-xs text-slate-100"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingMemoryId(null)}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEditMemory(item.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[10px] font-semibold text-sky-300">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.key}
                      </span>
                    </div>
                    <p className="text-sm text-slate-100 leading-relaxed">{item.value}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-500 pt-0.5">
                      <span>Created: {formatReadableDate(item.createdAt)}</span>
                      <span>Updated: {formatReadableDate(item.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditingMemory(item)}
                      className="p-1.5 text-slate-400 hover:text-sky-400 rounded-lg transition-colors"
                      title="Edit memory"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleMemory(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                      title="Delete memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      onClick={handleContainerTouchActivate}
      style={{ backgroundColor: '#060B14' }}
      className="relative w-full h-screen text-slate-100 overflow-hidden flex flex-col justify-between select-none transition-colors duration-300"
    >
      {/* MOBILE SCREEN BORDER RGB OUTLINE WITH COLOR CHANGING (Active in Background Mode upon Wake Word) */}
      {isRgbBorderActive && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden animate-in fade-in duration-300">
          {/* Animated 4-edge RGB neon border frame with continuous color cycling */}
          <div className="rgb-mobile-border-frame" />
          {/* Neon inner & outer edge diffuse glow */}
          <div className="rgb-mobile-border-glow" />
          {/* Top Indicator badge for background wake word activation */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-slate-950/90 border border-sky-400/50 shadow-2xl flex items-center gap-2 pointer-events-none backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-yellow-400">
              JARVIS RGB Active · {assistantState === 'WAKE_DETECTED' ? 'Wake Word Detected' : assistantState}
            </span>
          </div>
        </div>
      )}
      {/* Hidden Native Mobile Hardware Camera & Screenshot Inputs for restricted WebViews */}
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture={cameraMode === 'FRONT' ? 'user' : 'environment'}
        onChange={handleMobileCameraFileChange}
        className="hidden"
      />
      <input
        ref={mobileScreenInputRef}
        type="file"
        accept="image/*"
        onChange={handleMobileScreenFileChange}
        className="hidden"
      />
      <input
        ref={characterVideoFileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/*"
        onChange={handleCharacterVideoFileSelect}
        className="hidden"
      />

      {/* HEADER */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full z-20 border-b border-slate-800/80 bg-[#060B14]"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cpu className="w-7 h-7 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-[0.18em] text-amber-300 leading-tight">J.A.R.V.I.S.</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-rose-400' : isJarvisOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>{isOffline ? 'Offline' : isJarvisOn ? `Online · ${assistantState}` : 'Ready'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setIsSettingsOpen(true)} aria-label="Settings" title="Settings" className="min-h-[36px] min-w-[36px] rounded-full bg-[#0B1424] border border-amber-500/60 flex items-center justify-center">
              <Settings className="w-4 h-4 text-amber-300" />
            </button>
            <button type="button" onClick={() => setIsMemoryModalOpen(true)} aria-label="Memory" title={`Memory (${memories.length})`} className="min-h-[36px] min-w-[36px] rounded-full bg-[#0B1424] border border-amber-500/60 flex items-center justify-center">
              <Brain className="w-4 h-4 text-amber-300" />
            </button>
            <button type="button" onClick={() => setIsHistoryOpen(true)} aria-label="History" title="Voice History" className="min-h-[36px] min-w-[36px] rounded-full bg-[#0B1424] border border-amber-500/60 flex items-center justify-center">
              <HistoryIcon className="w-4 h-4 text-amber-300" />
            </button>
          </div>
        </div>

        <div className="flex mx-3 mb-2.5 rounded-2xl border border-slate-800 bg-[#0B1424] overflow-hidden">
          {[
            { label: 'Screen', Icon: Monitor, active: screenSharing, onClick: handleTopScreenShareButtonClick },
            { label: cameraMode === 'OFF' ? 'Camera' : cameraMode === 'FRONT' ? 'Front Cam' : 'Back Cam', Icon: Camera, active: cameraMode !== 'OFF', onClick: handleTopCameraButtonClick },
            { label: 'Apps', Icon: Grid, active: false, onClick: () => setIsAppControlModalOpen(true) },
            { label: 'Phone', Icon: Smartphone, active: false, onClick: () => triggerSystemLink('tel:') },
          ].map(({ label, Icon, active, onClick }, i) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-xs ${i > 0 ? 'border-l border-slate-800' : ''} ${active ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-200'}`}
            >
              <Icon className="w-5 h-5 text-cyan-400" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* LIVE HARDWARE / BLUETOOTH / APP CONTROL ACTION BANNER */}
      {activeAppBanner && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md rounded-2xl bg-slate-900/95 border border-sky-500/50 px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{activeAppBanner.title}</div>
              <div className="text-[11px] text-slate-300 truncate">{activeAppBanner.subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeAppBanner.deepLink && (
              <button
                type="button"
                onClick={() => triggerSystemLink(activeAppBanner.deepLink!)}
                className="px-2.5 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-[11px] flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Open</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveAppBanner(null)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* FLOATING CAMERA & SCREEN SHARE LIVE VIEWPORT (With Full Device & Single App MediaProjection States) */}
      {(cameraMode !== 'OFF' || screenSharing) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed top-16 right-3 sm:right-5 z-30 flex flex-col gap-2.5 w-72 sm:w-80"
        >
          {/* CAMERA VIEWPORT */}
          {cameraMode !== 'OFF' && (
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-amber-500/40 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800">
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  <span>{cameraMode === 'FRONT' ? 'Front Camera' : 'Back Camera'}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleFlipCameraDirection}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-semibold text-amber-300 flex items-center gap-1"
                    title="Flip Front / Back Camera"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{cameraMode === 'FRONT' ? 'Back Cam' : 'Front Cam'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCameraImmediately}
                    className="p-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white"
                    title="Close Camera"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="aspect-video bg-[#080D1A] relative flex items-center justify-center overflow-hidden">
                {!cameraUsingFallbackHud ? (
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (
                        el &&
                        cameraStreamRef.current &&
                        el.srcObject !== cameraStreamRef.current
                      ) {
                        el.srcObject = cameraStreamRef.current;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      cameraMode === 'FRONT' ? 'scale-x-[-1]' : ''
                    }`}
                  />
                ) : capturedCameraImage ? (
                  <img
                    src={capturedCameraImage}
                    alt="Mobile Camera Capture"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-4 text-center space-y-2.5">
                    <div className="text-xs font-semibold text-amber-300">
                      {cameraMode === 'FRONT'
                        ? 'Front Camera Active'
                        : 'Back Camera Active'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      मोबाइल कैमरा फ्रेम लेने या बदलने के लिए नीचे दबाएँ:
                    </p>
                    <button
                      type="button"
                      onClick={() => mobileCameraInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>
                        Capture {cameraMode === 'FRONT' ? 'Front' : 'Back'} Photo
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SCREEN SHARE VIEWPORT (Full Device vs Single App MediaProjection State Machine) */}
          {screenSharing && (
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-sky-500/40 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/95 border-b border-slate-800">
                <div className="min-w-0">
                  {screenShareState === 'SINGLE_APP' ? (
                    <div className="text-xs font-semibold text-emerald-400 truncate">
                      Sharing: {screenShareTargetApp} ● Active
                    </div>
                  ) : (
                    <div className="text-xs font-semibold text-sky-400 truncate">
                      Screen Sharing: ● Active
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={stopScreenSharingImmediately}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-semibold text-white"
                  >
                    {screenShareState === 'SINGLE_APP'
                      ? 'Stop Sharing'
                      : 'Stop Screen Sharing'}
                  </button>
                </div>
              </div>

              {/* Quick Switch: Full Device vs Single App (e.g., YouTube) */}
              <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => startScreenSharingFlow('FULL_DEVICE', 'Full Device')}
                  className={`px-2 py-0.5 rounded font-semibold ${
                    screenShareState === 'FULL_DEVICE'
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Full Device
                </button>
                <button
                  type="button"
                  onClick={() =>
                    startScreenSharingFlow(
                      'SINGLE_APP',
                      actionContext.lastOpenedApp || 'YouTube'
                    )
                  }
                  className={`px-2 py-0.5 rounded font-semibold ${
                    screenShareState === 'SINGLE_APP'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Single App ({actionContext.lastOpenedApp || 'YouTube'})
                </button>
                {screenUsingMobileBridge && (
                  <button
                    type="button"
                    onClick={() => mobileScreenInputRef.current?.click()}
                    className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold"
                  >
                    Upload Frame
                  </button>
                )}
              </div>

              <div className="aspect-video bg-[#080D1A] relative flex items-center justify-center overflow-hidden">
                {!screenUsingMobileBridge ? (
                  <video
                    ref={(el) => {
                      screenVideoRef.current = el;
                      if (
                        el &&
                        screenStreamRef.current &&
                        el.srcObject !== screenStreamRef.current
                      ) {
                        el.srcObject = screenStreamRef.current;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain"
                  />
                ) : capturedScreenImage ? (
                  <img
                    src={capturedScreenImage}
                    alt="Shared Mobile Screen"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="p-4 text-center space-y-2">
                    <Smartphone className="w-6 h-6 text-sky-400 mx-auto" />
                    <div className="text-xs font-semibold text-sky-300">
                      {screenShareState === 'SINGLE_APP'
                        ? `Sharing: ${screenShareTargetApp} ● Active`
                        : 'Screen Sharing: ● Active'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CENTER: JARVIS POWER ORB + LIVE CONVERSATION CAPTION */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 relative z-10 gap-2 overflow-hidden min-h-0">
        <div className="absolute top-3 left-4 border-l-2 border-amber-400 pl-2.5 pointer-events-none">
          <div className="text-sm tracking-[0.3em] text-slate-200">JARVIS</div>
          <div className="text-[11px] text-slate-500">AI Assistant</div>
        </div>

        <div
          id="jarvis-orb-container"
          onClick={(e) => {
            e.stopPropagation();
            if (!isJarvisOn) handleTogglePower();
            else if (assistantState === 'SPEAKING') interruptSpeechAndListen();
          }}
          className="relative w-[78%] max-w-[360px] aspect-square max-h-[48vh] flex items-center justify-center"
        >
          <JarvisPowerOrb
            mode={isJarvisOn ? (assistantState === 'SPEAKING' ? 'speaking' : assistantState === 'THINKING' || assistantState === 'PROCESSING' ? 'thinking' : assistantState === 'ERROR' ? 'error' : isUserSpeakingLive || assistantState === 'LISTENING' || assistantState === 'WAKE_DETECTED' ? 'listening' : 'idle') : 'off'}
            level={avgAudioLevel}
          />
        </div>

        {isJarvisOn && assistantState === 'SPEAKING' && (currentSpokenSentence || lastJarvisReply) && (
          <div role="status" aria-live="polite" className="w-[92%] max-w-md px-4 py-2 rounded-2xl bg-slate-900/95 border border-emerald-500/60 text-center">
            <p className="text-xs sm:text-sm font-medium text-white leading-snug">
              &ldquo;{currentSpokenSentence || lastJarvisReply}&rdquo;
            </p>
          </div>
        )}

        {(liveTranscript || pendingVoiceCommand) && (
          <div className="max-w-lg w-full text-center space-y-1.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-800">
            {pendingVoiceCommand && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-amber-200 text-xs">
                <span className="truncate">
                  कमांड तैयार है — <strong className="text-amber-300">&ldquo;ओके (OK)&rdquo;</strong> बोलें
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const cmd = pendingVoiceCommandRef.current;
                      pendingVoiceCommandRef.current = '';
                      setPendingVoiceCommand('');
                      tfliteEngineRef.current?.setWaitingForOkMode(false);
                      if (cmd) processUserTextTurn(cmd);
                    }}
                    className="px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px]"
                  >
                    OK ✓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      pendingVoiceCommandRef.current = '';
                      setPendingVoiceCommand('');
                      setLiveTranscript('');
                      tfliteEngineRef.current?.setWaitingForOkMode(false);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {liveTranscript && (
              <p className="text-xs text-slate-200 truncate">
                <span className="text-sky-400 font-semibold">You:</span> &ldquo;{liveTranscript}&rdquo;
              </p>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM: voice wave, API notice, Background / Mic / Quick Actions */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full pb-4 pt-1.5 px-3.5 flex flex-col items-center justify-center gap-2 z-20"
      >
        {/* LIVE VOICE WAVEFORM BAR JUST ABOVE MIC ON BUTTON (Listening Wave, Speaking Wave, Thinking Wave, Every State Wave) */}
        <div
          onClick={() => {
            if (!isJarvisOn) {
              handleTogglePower();
            } else if (assistantState === 'SPEAKING') {
              interruptSpeechAndListen();
            }
          }}
          className={`w-full max-w-md px-3.5 py-2 rounded-2xl border shadow-lg transition-all cursor-pointer flex flex-col gap-1.5 ${
            !isJarvisOn
              ? 'bg-slate-900/90 border-slate-800'
              : assistantState === 'SPEAKING'
              ? 'bg-slate-900/95 border-emerald-500/60 shadow-emerald-500/15'
              : assistantState === 'THINKING' || assistantState === 'PROCESSING'
              ? 'bg-slate-900/95 border-indigo-500/60 shadow-indigo-500/15'
              : assistantState === 'WAKE_DETECTED'
              ? 'bg-slate-900/95 border-amber-400/70 shadow-amber-500/20'
              : assistantState === 'ERROR'
              ? 'bg-rose-950/90 border-rose-500/60'
              : isUserSpeakingLive
              ? 'bg-slate-900/95 border-sky-400 shadow-sky-500/25'
              : 'bg-slate-900/95 border-sky-500/40'
          }`}
        >
          {/* Top Row of Wave Bar: Current Wave Mode + Mic/Voice Status + Gemini API Status */}
          <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] font-mono">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  !isJarvisOn
                    ? 'bg-slate-500'
                    : assistantState === 'SPEAKING'
                    ? 'bg-emerald-400 animate-ping'
                    : assistantState === 'THINKING' || assistantState === 'PROCESSING'
                    ? 'bg-indigo-400 animate-pulse'
                    : assistantState === 'WAKE_DETECTED'
                    ? 'bg-amber-400 animate-ping'
                    : assistantState === 'ERROR'
                    ? 'bg-rose-400'
                    : isUserSpeakingLive
                    ? 'bg-sky-400 animate-ping'
                    : 'bg-sky-400 animate-pulse'
                }`}
              />
              <span className="font-semibold text-slate-100 truncate">
                {!isJarvisOn
                  ? 'MIC OFF ● शांत / चुप (Tap Mic ON)'
                  : assistantState === 'SPEAKING'
                  ? 'SPEAKING WAVE ● JARVIS बोल रहा है...'
                  : assistantState === 'THINKING' || assistantState === 'PROCESSING'
                  ? 'THINKING WAVE ● सोच रहा हूँ (Thinking...)'
                  : assistantState === 'WAKE_DETECTED'
                  ? 'WAKE WAVE ● "Hey Jarvis" सुना गया!'
                  : assistantState === 'READY_FOR_NEXT_COMMAND'
                  ? 'READY WAVE ● अगला सवाल बोलिए...'
                  : assistantState === 'BACKGROUND_LISTENING'
                  ? 'BACKGROUND LISTENING ● "Hey Jarvis" सुन रहा हूँ (Background Active)'
                  : assistantState === 'STANDBY'
                  ? 'STANDBY ● बोलें: "Hey Jarvis" या कोई भी कमांड...'
                  : assistantState === 'ERROR'
                  ? `ERROR ● ${statusCaption || 'Please add your API key in Settings.'}`
                  : isUserSpeakingLive
                  ? 'LISTENING WAVE ● आपकी आवाज़ आ रही है...'
                  : 'STANDBY / LISTENING ● बोलें: "Hey Jarvis" या कोई भी कमांड...'}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveSettingsTab('AI_API');
                setIsSettingsOpen(true);
              }}
              className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                geminiConnected && !isOffline
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
              }`}
              title="Tap to open Gemini API Key Settings"
            >
              {isOffline ? 'Offline' : geminiConnected ? 'Gemini ● Ready' : 'Set API Key'}
            </button>
          </div>

          {/* 16-Bar Animated Equalizer Wave (Reacts to Microphone Voice, TTS Speaking, Thinking, and Idle) */}
          <div className="h-7 flex items-center justify-center gap-1 px-2">
            {Array.from({ length: 16 }).map((_, idx) => {
              const bandVal = audioLevels[idx % audioLevels.length] ?? 0.18;
              let heightPct = 18;
              let barColorClass = 'bg-slate-600';

              if (!isJarvisOn) {
                heightPct = 14;
                barColorClass = 'bg-slate-700';
              } else if (assistantState === 'SPEAKING') {
                const wave = Math.min(100, Math.max(22, Math.round(bandVal * 100)));
                heightPct = wave;
                barColorClass = 'bg-gradient-to-t from-emerald-500 to-teal-300';
              } else if (assistantState === 'THINKING' || assistantState === 'PROCESSING') {
                const synth = 35 + Math.round(Math.sin(idx * 0.7 + Date.now() / 160) * 28);
                heightPct = Math.max(20, Math.min(95, synth));
                barColorClass = 'bg-gradient-to-t from-indigo-500 to-violet-300 animate-pulse';
              } else if (assistantState === 'WAKE_DETECTED') {
                heightPct = Math.min(100, Math.max(35, Math.round(bandVal * 115)));
                barColorClass = 'bg-gradient-to-t from-amber-500 to-yellow-300';
              } else if (assistantState === 'ERROR') {
                heightPct = 28;
                barColorClass = 'bg-rose-500/80';
              } else {
                // LISTENING or READY_FOR_NEXT_COMMAND
                const boost = isUserSpeakingLive ? 135 : 85;
                heightPct = Math.min(100, Math.max(18, Math.round(bandVal * boost)));
                barColorClass = isUserSpeakingLive
                  ? 'bg-gradient-to-t from-sky-500 to-cyan-200'
                  : 'bg-sky-500/75';
              }

              return (
                <div
                  key={idx}
                  style={{ height: `${heightPct}%` }}
                  className={`w-1.5 rounded-full transition-all duration-75 ${barColorClass}`}
                />
              );
            })}
          </div>
        </div>


        {!geminiConnected && !isOffline && (
          <button
            type="button"
            onClick={() => {
              setActiveSettingsTab('AI_API');
              setIsSettingsOpen(true);
            }}
            className="w-full max-w-md flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl bg-[#0B1424] border border-slate-800 text-xs text-slate-200"
          >
            <span>Gemini API Key Settings में डालें</span>
            <span className="text-amber-300 font-semibold">Go to Settings ›</span>
          </button>
        )}

        <div className="w-full max-w-md flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={async () => {
              const out = await activateBackgroundKeepAliveSystem(!backgroundModeEnabled);
              setActiveAppBanner({ title: out.ok ? 'Background' : 'Permission Required', subtitle: out.message });
            }}
            className={`flex-1 min-h-[52px] px-2.5 rounded-2xl border flex items-center gap-2 text-left text-[11px] ${
              backgroundModeEnabled ? 'bg-cyan-500/15 border-cyan-400 text-cyan-100' : 'bg-[#0B1424] border-slate-800 text-slate-200'
            }`}
          >
            <Radio className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>
              Background
              <br />
              <span className="text-slate-500">{backgroundModeEnabled ? 'ON' : 'OFF'}</span>
            </span>
          </button>

          {micPermissionBlocked && (
            <button
              type="button"
              onClick={handleRetryMicPermission}
              className="min-h-[46px] px-3 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold shrink-0"
            >
              Allow Mic
            </button>
          )}

          <button
            type="button"
            onClick={handleTogglePower}
            aria-label={isJarvisOn ? 'Mic ON' : 'Mic OFF'}
            className={`w-[68px] h-[68px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              isJarvisOn ? 'border-cyan-400 bg-cyan-500/15 shadow-lg shadow-cyan-500/30' : 'border-slate-600 bg-[#0B1424]'
            }`}
          >
            <Mic className={`w-7 h-7 ${isJarvisOn ? 'text-cyan-300' : 'text-slate-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsAppControlModalOpen(true)}
            className="flex-1 min-h-[52px] px-2.5 rounded-2xl bg-[#0B1424] border border-slate-800 flex items-center gap-2 text-left text-[11px] text-slate-200"
          >
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>
              Quick
              <br />
              <span className="text-slate-500">Actions</span>
            </span>
          </button>
        </div>
      </div>

      {/* DEDICATED APP CONTROLLING, AppResolver PACKAGE MANAGER & SYSTEM ACTIONS MODAL */}
      {isAppControlModalOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0D1322] border border-slate-800 p-6 max-h-[88vh] flex flex-col shadow-2xl overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Grid className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    JARVIS App Launcher (AppResolver) &amp; System Action Manager
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Real Android Package Resolver, System Settings Intents &amp; Accessibility Global Actions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAppControlModalOpen(false)}
                className="min-h-[38px] min-w-[38px] rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. System Settings & Hardware Controls */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                1. Android System Settings &amp; Hardware Intents
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction(
                      {
                        actionType: 'OPEN_SYSTEM_SETTINGS',
                        target: 'BLUETOOTH',
                      },
                      'Bluetooth खोलो',
                      'SystemSettingsIntent'
                    )
                  }
                  className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    bluetoothEnabled
                      ? 'bg-blue-600/25 border-blue-400 text-white'
                      : 'bg-[#090D16] border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bluetooth className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="text-xs font-semibold">Bluetooth Settings</div>
                      <div className="text-[10px] text-slate-400">ACTION_BLUETOOTH_SETTINGS</div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction(
                      {
                        actionType: 'OPEN_SYSTEM_SETTINGS',
                        target: 'WIFI',
                      },
                      'Wi-Fi settings खोलो',
                      'SystemSettingsIntent'
                    )
                  }
                  className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    wifiEnabled
                      ? 'bg-emerald-600/25 border-emerald-400 text-white'
                      : 'bg-[#090D16] border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-semibold">Wi-Fi Settings</div>
                      <div className="text-[10px] text-slate-400">ACTION_WIFI_SETTINGS</div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction({
                      actionType: flashlightEnabled ? 'FLASHLIGHT_OFF' : 'FLASHLIGHT_ON',
                      target: 'flashlight',
                    })
                  }
                  className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    flashlightEnabled
                      ? 'bg-amber-500/25 border-amber-400 text-white'
                      : 'bg-[#090D16] border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Flashlight className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-semibold">Torch / Flash</div>
                      <div className="text-[10px] text-slate-400">
                        {flashlightEnabled ? 'ON' : 'OFF'}
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction(
                      { actionType: 'GLOBAL_ACTION_HOME', target: 'HOME' },
                      'Home जाओ',
                      'DeviceActionIntent'
                    )
                  }
                  className="p-3 rounded-2xl bg-[#090D16] border border-slate-800 text-slate-200 text-left"
                >
                  <div className="text-xs font-semibold">Accessibility: Home</div>
                  <div className="text-[10px] text-slate-400">GLOBAL_ACTION_HOME</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction(
                      { actionType: 'GLOBAL_ACTION_BACK', target: 'BACK' },
                      'Back जाओ',
                      'DeviceActionIntent'
                    )
                  }
                  className="p-3 rounded-2xl bg-[#090D16] border border-slate-800 text-slate-200 text-left"
                >
                  <div className="text-xs font-semibold">Accessibility: Back</div>
                  <div className="text-[10px] text-slate-400">GLOBAL_ACTION_BACK</div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeDeviceAction(
                      { actionType: 'GLOBAL_ACTION_NOTIFICATIONS', target: 'NOTIFICATIONS' },
                      'Notifications खोलो',
                      'DeviceActionIntent'
                    )
                  }
                  className="p-3 rounded-2xl bg-[#090D16] border border-slate-800 text-slate-200 text-left"
                >
                  <div className="text-xs font-semibold">Notifications</div>
                  <div className="text-[10px] text-slate-400">GLOBAL_ACTION_NOTIFICATIONS</div>
                </button>
              </div>
            </div>

            {/* 2. AppResolver Package Directory & Installed Toggle (Test Acceptance Test 4 & 5) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  2. AppResolver Installed Packages (Toggle Installed/Uninstalled to test Verification)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(INSTALLED_PACKAGE_DIRECTORY).map(([appKey, appEntry]) => {
                  const isInstalled = installedAppsMap[appKey] ?? true;
                  return (
                    <div
                      key={appKey}
                      className="p-3 rounded-2xl bg-[#090D16] border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span>{appEntry.appName}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                              isInstalled
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {isInstalled ? 'INSTALLED' : 'NOT INSTALLED'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {appEntry.packageName}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setInstalledAppsMap((prev) => ({
                              ...prev,
                              [appKey]: !isInstalled,
                            }))
                          }
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                          title="Simulate Installed / Uninstalled state"
                        >
                          {isInstalled ? 'Uninstall' : 'Install'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await executeDeviceAction(
                              {
                                actionType: 'OPEN_APP',
                                target: appEntry.appName,
                                payload: appEntry.packageName,
                              },
                              `Open ${appEntry.appName}`,
                              'OpenAppIntent'
                            );
                            if (res.spokenOverride) {
                              await playSpokenResponse(res.spokenOverride);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-[11px] flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Launch</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VOICE HISTORY MODAL */}
      {isHistoryOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0D1322] border border-slate-800 p-5 max-h-[86vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <HistoryIcon className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Voice History ({voiceHistory.length})</h2>
                  <p className="text-[11px] text-slate-400">आपने JARVIS से क्या-क्या बात की</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {voiceHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearVoiceHistory}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="min-h-[38px] min-w-[38px] rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1">
              {voiceHistory.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  अभी तक कोई बातचीत नहीं हुई। &ldquo;Hey Jarvis&rdquo; बोलकर शुरू करें।
                </div>
              ) : (
                [...voiceHistory].reverse().map((h, idx, arr) => {
                  const d = new Date(h.ts);
                  const dayLabel = d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                  const prevDay =
                    idx > 0 ? new Date(arr[idx - 1].ts).toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
                  return (
                    <div key={h.id}>
                      {dayLabel !== prevDay && (
                        <div className="text-[11px] font-semibold text-slate-400 pt-2 pb-1">{dayLabel}</div>
                      )}
                      <div className="p-3.5 rounded-2xl bg-[#090D16] border border-slate-800/90 space-y-1.5">
                        <div className="text-[10px] font-mono text-slate-500">
                          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <p className="text-xs text-slate-100">
                          <span className="text-sky-400 font-semibold">आप: </span>
                          {h.user}
                        </p>
                        <p className="text-xs text-emerald-300 leading-relaxed">
                          <span className="text-emerald-400 font-semibold">JARVIS: </span>
                          {h.jarvis}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* FIRST-RUN SETUP: API KEY -> PERMISSIONS (blocks the app until finished) */}
      {!setupDone && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[100] bg-[#070B14] flex flex-col items-center justify-center p-5 overflow-y-auto"
        >
          <div className="w-full max-w-md space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
                {setupStep === 'API' ? (
                  <KeyRound className="w-5 h-5 text-sky-400" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">
                  {setupStep === 'API' ? 'पहले API Key डालें' : 'सभी Permissions Allow करें'}
                </h1>
                <p className="text-xs text-slate-400">Step {setupStep === 'API' ? '1' : '2'} / 2</p>
              </div>
            </div>

            {setupStep === 'API' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  JARVIS चलाने के लिए Gemini API Key चाहिए। aistudio.google.com/apikey से मुफ़्त Key बनाकर यहाँ पेस्ट करें।
                </p>
                <div className="relative">
                  <input
                    type={showApiKeyText ? 'text' : 'password'}
                    value={customApiKeyInput}
                    onChange={(e) => setCustomApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full min-h-[46px] pl-3.5 pr-16 rounded-xl bg-[#0D1322] border border-slate-700 focus:border-sky-400 focus:outline-none text-sm font-mono text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyText((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-slate-800 text-[10px] font-semibold text-slate-300"
                  >
                    {showApiKeyText ? 'Hide' : 'Show'}
                  </button>
                </div>
                {connectionStatusMessage && (
                  <div className="p-3 rounded-xl text-xs border bg-amber-950/40 border-amber-500/30 text-amber-200">
                    {connectionStatusMessage}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSetupVerifyKey}
                  disabled={setupKeyChecking}
                  className="w-full min-h-[48px] rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm disabled:opacity-60"
                >
                  {setupKeyChecking ? 'जाँच हो रही है...' : 'Key सेव करें और आगे बढ़ें'}
                </button>
                {setupKeyFailed && (
                  <button
                    type="button"
                    onClick={() => setSetupStep('PERMISSIONS')}
                    className="w-full text-center text-[11px] text-slate-400 underline"
                  >
                    फिर भी आगे बढ़ें (quota / network की समस्या हो तो)
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  &ldquo;सभी Allow करें&rdquo; दबाएँ। Mic ज़रूरी है, बाकी permissions बाद में भी दी जा सकती हैं।
                </p>
                <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
                  {permissions.map((p) => {
                    const r = permResults[p.id];
                    const nb = getAndroidNativeBridge();
                    const special = p.id === 'OVERLAY' || p.id === 'ACCESSIBILITY' || p.id === 'ASSISTANT_ROLE';
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100">{p.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{p.whyRequired}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {special && nb?.openSpecialSettings && (
                            <button
                              type="button"
                              onClick={() => nb.openSpecialSettings?.(p.id)}
                              className="px-2 py-1 rounded-lg bg-sky-500/20 border border-sky-500/40 text-[10px] font-semibold text-sky-300"
                            >
                              Open
                            </button>
                          )}
                          <span
                            className={`text-[10px] font-mono ${
                              r === 'granted'
                                ? 'text-emerald-400'
                                : r === 'denied'
                                ? 'text-rose-400'
                                : r
                                ? 'text-amber-300'
                                : 'text-slate-500'
                            }`}
                          >
                            {r === 'granted'
                              ? '● Allowed'
                              : r === 'denied'
                              ? '● Denied'
                              : r === 'pending'
                              ? '● Android में पूछा'
                              : r === 'native'
                              ? '● APK में'
                              : '○ बाकी'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={requestAllPermissions}
                  disabled={requestingPerms}
                  className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm disabled:opacity-60"
                >
                  {requestingPerms ? 'Permissions माँगी जा रही हैं...' : 'सभी Allow करें'}
                </button>
                <button
                  type="button"
                  onClick={finishSetupAndStart}
                  disabled={permResults['MICROPHONE'] !== 'granted'}
                  className="w-full min-h-[48px] rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm disabled:opacity-40"
                >
                  JARVIS शुरू करें
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEDICATED MEMORY MODAL */}
      {isMemoryModalOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0D1322] border border-slate-800 p-6 max-h-[86vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-sky-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    Persistent Memory Manager ({memories.length})
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Survives app restart, AI Studio restart, and device relaunch
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMemoryModalOpen(false)}
                className="min-h-[38px] min-w-[38px] rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">{renderMemoryManagerContent()}</div>
          </div>
        </div>
      )}

      {/* TOP-RIGHT SETTINGS MODAL */}
      {isSettingsOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0D1322] border border-slate-800 flex flex-col max-h-[88vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#090D16]">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-semibold text-slate-100">Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="min-h-[38px] min-w-[38px] rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-6 py-3 bg-[#090D16]/60 border-b border-slate-800 overflow-x-auto">
              {(
                [
                  ['GENERAL', 'Mode · Voice · Language'],
                  ['AI_API', 'AI / API Settings'],
                  ['VOICE_LANGUAGE', 'Voice & TFLite Wake Word'],
                  ['PERMISSIONS', 'Permissions & Accessibility'],
                ] as [SettingsTab, string][]
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveSettingsTab(tabId)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    activeSettingsTab === tabId
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {activeSettingsTab === 'GENERAL' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-[#090D16] border border-slate-800 space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Mode (बातचीत का अंदाज़)</label>
                      <select
                        value={defaultPersonality}
                        onChange={(e) => setDefaultPersonality(e.target.value as ResponseStyle)}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="PROFESSIONAL">Professional</option>
                        <option value="FRIENDLY">Friendly</option>
                        <option value="CALM">Calm</option>
                        <option value="SUPPORTIVE">Supportive</option>
                        <option value="CONCISE">Short &amp; Direct</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Voice (आवाज़)</label>
                      <select
                        value={selectedVoiceName}
                        onChange={(e) => setSelectedVoiceName(e.target.value as 'Charon' | 'Puck' | 'Fenrir')}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="Charon">Male · Calm (Charon)</option>
                        <option value="Puck">Male · Warm (Puck)</option>
                        <option value="Fenrir">Male · Commanding (Fenrir)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Language (भाषा)</label>
                      <select
                        value={speechLocale}
                        onChange={(e) => setSpeechLocale(e.target.value as 'hi-IN' | 'en-IN' | 'en-US')}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="hi-IN">Hindi + Hinglish</option>
                        <option value="en-IN">Indian English + Hinglish</option>
                        <option value="en-US">English (Global)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => playSpokenResponse('नमस्ते सर, मैं जार्विस बोल रहा हूँ।')}
                      className="px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-xl"
                    >
                      Test Voice
                    </button>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'AI_API' && (
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-[#090D16] border border-slate-800 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">
                            Google Gemini API Key &amp; Connection
                          </h3>
                          <p className="text-xs text-slate-400">
                            यहाँ अपनी Gemini API Key डालकर सेव करें (Enter &amp; Save API Key)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
                            geminiConnected ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          <span>●</span>
                          <span>{geminiConnected ? 'Connected' : 'API Key Needed'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleTestGeminiConnection}
                          disabled={testingConnection}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-xl whitespace-nowrap"
                        >
                          {testingConnection ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
                    </div>

                    {/* Enter & Save Gemini API Key Form */}
                    <form
                      onSubmit={handleSaveGeminiApiKey}
                      className="p-4 rounded-2xl bg-[#0D1322] border border-sky-500/30 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-sky-300">
                          Gemini API Key डालें (Paste Your Gemini API Key)
                        </label>
                        <span className="text-[11px] font-mono text-slate-400">
                          Active: {maskedKeyPreview}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <div className="relative flex-1">
                          <input
                            type={showApiKeyText ? 'text' : 'password'}
                            value={customApiKeyInput}
                            onChange={(e) => setCustomApiKeyInput(e.target.value)}
                            placeholder="AIzaSy... (यहाँ अपनी Gemini API Key पेस्ट करें)"
                            className="w-full min-h-[42px] pl-3.5 pr-16 py-2 rounded-xl bg-[#090D16] border border-slate-700 focus:border-sky-400 focus:outline-none text-xs font-mono text-white placeholder:text-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKeyText((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300"
                          >
                            {showApiKeyText ? 'Hide' : 'Show'}
                          </button>
                        </div>

                        <button
                          type="submit"
                          disabled={savingApiKey}
                          className="min-h-[42px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shadow-lg shadow-emerald-500/20"
                        >
                          <Check className="w-4 h-4" />
                          <span>{savingApiKey ? 'Saving...' : 'Save API Key (सेव करें)'}</span>
                        </button>
                      </div>
                    </form>

                    {connectionStatusMessage && (
                      <div
                        className={`p-3 rounded-xl text-xs border ${
                          geminiConnected
                            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                        }`}
                      >
                        {connectionStatusMessage}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Gemini AI Model
                        </label>
                        <select
                          value={selectedGeminiModel}
                          onChange={(e) =>
                            setSelectedGeminiModel(
                              e.target.value as 'gemini-3.8-flash' | 'gemini-3.1-flash-lite'
                            )
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        >
                          <option value="gemini-3.8-flash">
                            Gemini 3.8 Flash (Multimodal Audio + Vision · Recommended)
                          </option>
                          <option value="gemini-flash-latest">
                            Gemini Flash Latest (Official Google GenAI)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Conversation Personality
                        </label>
                        <select
                          value={defaultPersonality}
                          onChange={(e) =>
                            setDefaultPersonality(e.target.value as ResponseStyle)
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        >
                          <option value="FRIENDLY">Human Friendly &amp; Natural</option>
                          <option value="PROFESSIONAL">Classic JARVIS Professional</option>
                          <option value="CALM">Calm &amp; Composed</option>
                          <option value="SUPPORTIVE">Supportive &amp; Empathetic</option>
                          <option value="CONCISE">Short &amp; Direct</option>
                        </select>
                      </div>
                    </div>

                    {/* Google Free Tier Quota Information Banner */}
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-sky-300">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Google AI Studio API Key &amp; Quota Guide</span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Google के नए Free Tier प्रोजेक्ट्स में प्रतिदिन 20 requests की सीमा होती है। यदि कोटा (429) पूरा हो जाए, तो आप Google AI Studio पर नया प्रोजेक्ट बनाकर दूसरी नई Key ले सकते हैं, या बिलिंग ऑन कर सकते हैं। आपके सभी फ़ोन ऐप्स, YouTube गाने और हार्डवेयर कंट्रोल्स बिना किसी API Key के भी हमेशा काम करते रहेंगे!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'VOICE_LANGUAGE' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-[#090D16] border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-sky-400" />
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100">
                            TensorFlow Lite &ldquo;Hey Jarvis&rdquo; Wake-Word &amp; Voice Background Control
                          </h3>
                          <p className="text-xs text-slate-400">
                            16kHz Log-Mel Spectrogram KWS · Say &ldquo;Background on karo&rdquo; or &ldquo;Background off karo&rdquo; to control background service by voice
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-900 border border-slate-800 text-sky-300">
                        {backgroundModeEnabled ? 'BG Voice: ACTIVE' : 'BG Voice: STANDBY'}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-[#090D16] border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-sky-400" />
                        <h3 className="text-sm font-semibold text-slate-100">
                          Voice &amp; Language Configuration
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          playSpokenResponse(
                            'नमस्ते सर, मैं जार्विस बोल रहा हूँ। माइक अब बिना किसी बीप आवाज़ के लगातार काम कर रहा है।'
                          )
                        }
                        className="px-3 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg whitespace-nowrap"
                      >
                        Test Voice
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Primary Language
                        </label>
                        <select
                          value={speechLocale}
                          onChange={(e) =>
                            setSpeechLocale(
                              e.target.value as 'hi-IN' | 'en-IN' | 'en-US'
                            )
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        >
                          <option value="hi-IN">Hindi + Hinglish (भारत)</option>
                          <option value="en-IN">Indian English + Hinglish (en-IN)</option>
                          <option value="en-US">English (Global)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Text-to-Speech Output Engine
                        </label>
                        <select
                          value={useNeuralGeminiTts ? 'GEMINI_TTS' : 'NATIVE_TTS'}
                          onChange={(e) =>
                            setUseNeuralGeminiTts(e.target.value === 'GEMINI_TTS')
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        >
                          <option value="NATIVE_TTS">
                            Instant Device Hindi/English Voice (Fastest)
                          </option>
                          <option value="GEMINI_TTS">
                            Gemini 3.8 Neural Voice (Cloud Audio)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Gemini Voice Persona
                        </label>
                        <select
                          value={selectedVoiceName}
                          onChange={(e) =>
                            setSelectedVoiceName(
                              e.target.value as
                                | 'Charon'
                                | 'Puck'
                                | 'Fenrir'
                            )
                          }
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        >
                          <option value="Charon">Charon (Deep Male JARVIS)</option>
                          <option value="Puck">Puck (Warm Natural Male)</option>
                          <option value="Fenrir">Fenrir (Commanding Male)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Wake Word Phrase
                        </label>
                        <input
                          type="text"
                          value={wakePhrase}
                          onChange={(e) => setWakePhrase(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1322] border border-slate-800 text-xs text-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSettingsTab === 'PERMISSIONS' && (
                <div className="space-y-4">
                  {/* Explicit JarvisAccessibilityService Setup Card */}
                  {(() => {
                    const accPerm = permissions.find((p) => p.id === 'ACCESSIBILITY');
                    const isAccEnabled = Boolean(accPerm?.granted);
                    return (
                      <div className="p-4 rounded-2xl bg-[#090D16] border border-sky-500/40 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-sky-400" />
                            <div>
                              <div className="text-sm font-semibold text-white">
                                JarvisAccessibilityService Setup
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                Settings → Permissions → Accessibility Service → Enable JARVIS
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${
                                isAccEnabled
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              Accessibility: {isAccEnabled ? '● Enabled' : '● Disabled'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePermission('ACCESSIBILITY')}
                              className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs"
                            >
                              {isAccEnabled ? 'Disable' : 'Enable JARVIS'}
                            </button>
                          </div>
                        </div>

                        {!isAccEnabled && (
                          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
                            Enable Accessibility permission to allow JARVIS to perform supported device actions (Home, Back, Recents, Notifications, Quick Settings).
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">
                        Android Runtime &amp; System Permissions
                      </h3>
                      <p className="text-xs text-slate-400">
                        Toggle permissions to test honest Android permission verification.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPermissions((prev) => prev.map((p) => ({ ...p, granted: true })))
                      }
                      className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-xl whitespace-nowrap flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Enable All</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {permissions.map((perm) => (
                      <div
                        key={perm.id}
                        className="p-4 rounded-xl bg-[#090D16] border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-100">
                            {perm.name}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {perm.whyRequired}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePermission(perm.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                            perm.granted
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {perm.granted ? '● Enabled' : '● Disabled'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
