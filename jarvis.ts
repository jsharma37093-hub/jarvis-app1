export type AssistantState =
  | 'IDLE'
  | 'STANDBY'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'BACKGROUND_LISTENING'
  | 'PROCESSING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'READY_FOR_NEXT_COMMAND'
  | 'WAITING'
  | 'ERROR';

export type EmotionState =
  | 'CALM'
  | 'HAPPY'
  | 'EXCITED'
  | 'CONFUSED'
  | 'FRUSTRATED'
  | 'SAD'
  | 'STRESSED'
  | 'URGENT'
  | 'NEUTRAL';

export type ConversationTone =
  | 'CALM'
  | 'FRIENDLY'
  | 'PROFESSIONAL'
  | 'SUPPORTIVE'
  | 'URGENT'
  | 'EXCITED'
  | 'CONCISE';

export type ResponseStyle =
  | 'CALM'
  | 'FRIENDLY'
  | 'PROFESSIONAL'
  | 'SUPPORTIVE'
  | 'URGENT'
  | 'EXCITED'
  | 'CONCISE';

export type CameraMode = 'OFF' | 'FRONT' | 'BACK';

export type PermissionId =
  | 'MICROPHONE'
  | 'CAMERA'
  | 'CONTACTS'
  | 'PHONE'
  | 'NOTIFICATIONS'
  | 'ACCESSIBILITY'
  | 'MEDIA_PROJECTION'
  | 'LOCATION'
  | 'BLUETOOTH'
  | 'FOREGROUND_SERVICE'
  | 'SMS'
  | 'OVERLAY'
  | 'ASSISTANT_ROLE';

export interface PermissionItem {
  id: PermissionId;
  name: string;
  androidConstant: string;
  granted: boolean;
  whyRequired: string;
  settingsIntent: string;
}

export type MemoryCategory =
  | 'personal_preference'
  | 'user_information'
  | 'important_instruction'
  | 'routine'
  | 'relationship'
  | 'work'
  | 'reminder'
  | 'assistant_preference'
  | 'custom';

export interface MemoryRecord {
  id: string;
  key: string;
  value: string;
  category: MemoryCategory;
  createdAt: string;
  updatedAt: string;
}

export type DiagnosticStage =
  | 'MIC_INIT'
  | 'MIC_PERMISSION'
  | 'STT_STARTED'
  | 'STT_RESULT'
  | 'STT_ERROR'
  | 'VOICE_STATE_CHANGED'
  | 'TTS_INIT'
  | 'TTS_STARTED'
  | 'TTS_COMPLETED'
  | 'TTS_ERROR'
  | 'VOICE_INPUT'
  | 'TRANSCRIPT'
  | 'MEMORY_RETRIEVED'
  | 'GEMINI_REQUEST'
  | 'GEMINI_RESPONSE'
  | 'MEMORY_SAVED'
  | 'ACTION_REQUEST'
  | 'TTS_START'
  | 'TTS_END'
  | 'ERROR';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  stage: DiagnosticStage;
  detail: string;
}

export interface DeviceActionRequest {
  actionType:
    | 'NONE'
    | 'OPEN_CAMERA_FRONT'
    | 'OPEN_CAMERA_BACK'
    | 'CLOSE_CAMERA'
    | 'START_SCREEN_SHARE'
    | 'STOP_SCREEN_SHARE'
    | 'CALL_CONTACT'
    | 'SEND_MESSAGE'
    | 'OPEN_APP';
  target?: string;
  payload?: string;
}

export type TaskStepStatus = 'PENDING' | 'RUNNING' | 'VERIFIED' | 'FAILED' | 'BLOCKED_PERMISSION';

export interface TaskPlanStep {
  stepNumber: number;
  actionType: string;
  target: string;
  description: string;
  requiredPermission: PermissionId | 'NONE';
  verificationCriteria: string;
  status: TaskStepStatus;
  timeoutMs: number;
  retryCount: number;
  requiresConfirmation: boolean;
  resultDetail?: string;
}

export interface PendingTaskContext {
  intent: string;
  extractedSlots: Record<string, string>;
  missingSlot: string;
  questionAsked: string;
  createdAt: string;
}

export interface ContactEntry {
  id: string;
  name: string;
  relationTag: string;
  phoneNumber: string;
  whatsappAvailable: boolean;
}

export interface AccessibilityNode {
  nodeId: string;
  className: string;
  text: string;
  contentDescription: string;
  clickable: boolean;
  bounds: string;
  actionId: string;
}

export type AndroidScreenId =
  | 'HOME'
  | 'YOUTUBE'
  | 'WHATSAPP'
  | 'PHONE_DIALER'
  | 'SETTINGS'
  | 'ERROR_DIALOG'
  | 'STUDY_FORM';

export interface AndroidScreenContext {
  screenId: AndroidScreenId;
  packageName: string;
  activityName: string;
  title: string;
  summaryText: string;
  activeQuery?: string;
  activeSubState?: string;
  accessibilityNodes: AccessibilityNode[];
}

export interface ConversationTurn {
  id: string;
  timestamp: string;
  speaker: 'USER' | 'JARVIS';
  text: string;
  language?: string;
  intent?: string;
  emotionState?: EmotionState;
  responseStyle?: ResponseStyle;
  verificationBadge?: string;
  taskSteps?: TaskPlanStep[];
}

export interface AndroidProjectFile {
  path: string;
  module: string;
  language: 'kotlin' | 'xml' | 'gradle' | 'markdown';
  description: string;
  code: string;
}
