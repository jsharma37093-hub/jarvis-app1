import React from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  Monitor,
  MonitorOff,
  Phone,
  Play,
  RefreshCw,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Youtube,
} from 'lucide-react';
import {
  AndroidScreenContext,
  AndroidScreenId,
  CameraMode,
} from '../types/jarvis';
import { ANDROID_SCREENS } from '../data/androidInitialState';

interface AndroidViewportSimulatorProps {
  currentScreenId: AndroidScreenId;
  screenState: AndroidScreenContext;
  onSelectScreen: (id: AndroidScreenId) => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
  onStartBrowserDisplayCapture: () => void;
  isBrowserDisplayStreamActive: boolean;
  cameraMode: CameraMode;
  onSwitchCameraMode: (mode: CameraMode) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  screenVideoRef: React.RefObject<HTMLVideoElement | null>;
  highlightedNodeId: string | null;
  onAskVisionQuestion: (question: string) => void;
  onTriggerNodeAction: (actionId: string, nodeText: string) => void;
  deviceTelemetry: {
    flashlightOn: boolean;
    bluetoothOn: boolean;
    wifiOn: boolean;
    mediaVolume: number;
  };
}

export const AndroidViewportSimulator: React.FC<AndroidViewportSimulatorProps> = ({
  currentScreenId,
  screenState,
  onSelectScreen,
  isScreenSharing,
  onToggleScreenShare,
  onStartBrowserDisplayCapture,
  isBrowserDisplayStreamActive,
  cameraMode,
  onSwitchCameraMode,
  videoRef,
  screenVideoRef,
  highlightedNodeId,
  onAskVisionQuestion,
  onTriggerNodeAction,
  deviceTelemetry,
}) => {
  const screenTabs: { id: AndroidScreenId; label: string }[] = [
    { id: 'HOME', label: 'Home' },
    { id: 'YOUTUBE', label: 'YouTube' },
    { id: 'WHATSAPP', label: 'WhatsApp' },
    { id: 'PHONE_DIALER', label: 'Dialer' },
    { id: 'SETTINGS', label: 'Settings' },
    { id: 'ERROR_DIALOG', label: 'Error Screen' },
    { id: 'STUDY_FORM', label: 'Exam Form' },
  ];

  return (
    <div className="flex flex-col border border-slate-800 rounded-2xl bg-[#0D1322] p-5">
      {/* Header & Mode Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Vision &amp; Android Screen Intelligence
          </h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            <span>Package: {screenState.packageName}</span>
            <span aria-hidden="true">·</span>
            <span>Nodes: {screenState.accessibilityNodes.length}</span>
          </div>
        </div>

        {/* Camera & Screen Share Explicit Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${
              isScreenSharing
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isScreenSharing ? <Monitor className="w-3.5 h-3.5" /> : <MonitorOff className="w-3.5 h-3.5" />}
            <span>{isScreenSharing ? 'Screen Shared' : 'Share Screen with JARVIS'}</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => onSwitchCameraMode('FRONT')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                cameraMode === 'FRONT'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Front Cam
            </button>
            <button
              type="button"
              onClick={() => onSwitchCameraMode('BACK')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                cameraMode === 'BACK'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Back Cam
            </button>
            {cameraMode !== 'OFF' && (
              <button
                type="button"
                onClick={() => onSwitchCameraMode('OFF')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-rose-600 text-white hover:bg-rose-500 transition-colors whitespace-nowrap flex items-center gap-1"
              >
                <CameraOff className="w-3 h-3" />
                <span>Off</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Camera Vision Mode Banner & Feed */}
      {cameraMode !== 'OFF' && (
        <div className="mt-4 border border-amber-500/40 rounded-xl bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
              <Camera className="w-4 h-4" />
              <span>
                {cameraMode === 'FRONT' ? 'FrontCameraVision Active' : 'BackCameraVision Active'} · Explicit User Consent
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSwitchCameraMode('OFF')}
              className="px-3 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-lg whitespace-nowrap"
            >
              Stop Camera Immediately
            </button>
          </div>

          <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAskVisionQuestion('Jarvis, camera mein kya dikh raha hai?')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
            >
              &ldquo;Camera mein kya dikh raha hai?&rdquo;
            </button>
            <button
              type="button"
              onClick={() =>
                onAskVisionQuestion(
                  cameraMode === 'FRONT'
                    ? 'Jarvis, main kya pehna hua hoon?'
                    : 'Jarvis, is object ko identify karo aur text read karo.'
                )
              }
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
            >
              {cameraMode === 'FRONT'
                ? '“Main kya pehna hua hoon?”'
                : '“Is object ko identify karo”'}
            </button>
            <button
              type="button"
              onClick={() => onAskVisionQuestion('Jarvis, is document ya board par kya likha hai?')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
            >
              &ldquo;Is board/document ko read karo&rdquo;
            </button>
          </div>
        </div>
      )}

      {/* Live Browser Display Media Capture Stream (if started) */}
      {isBrowserDisplayStreamActive && (
        <div className="mt-4 border border-sky-500/40 rounded-xl bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-sky-300">
              Live MediaProjection Stream Active
            </span>
            <button
              type="button"
              onClick={() => onAskVisionQuestion('Jarvis, screen par kya hai? Is page ko samjhao.')}
              className="px-3 py-1.5 text-xs font-medium bg-sky-500 text-slate-950 rounded-lg whitespace-nowrap"
            >
              Analyze Shared Screen Now
            </button>
          </div>
          <div className="rounded-lg overflow-hidden bg-slate-900 aspect-video border border-slate-800">
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Interactive Android Screen Selector Tabs */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-800/70">
        {screenTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectScreen(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              currentScreenId === tab.id
                ? 'bg-slate-100 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onStartBrowserDisplayCapture}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-sky-300 hover:text-sky-200 bg-sky-950/50 border border-sky-800/50 rounded-lg whitespace-nowrap shrink-0"
          title="Capture real desktop/browser window via getDisplayMedia"
        >
          Capture Real Window
        </button>
      </div>

      {/* Simulated Android 15 Viewport & Semantic UI Content */}
      <div className="mt-4 border border-slate-800 rounded-xl bg-[#090D16] p-4">
        {/* Android Status Bar */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span>21:42</span>
            <span>·</span>
            <span>{screenState.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Wi-Fi: {deviceTelemetry.wifiOn ? 'ON' : 'OFF'}</span>
            <span>·</span>
            <span>BT: {deviceTelemetry.bluetoothOn ? 'ON' : 'OFF'}</span>
            <span>·</span>
            <span>Torch: {deviceTelemetry.flashlightOn ? 'ON' : 'OFF'}</span>
            <span>·</span>
            <span>Vol: {deviceTelemetry.mediaVolume}%</span>
          </div>
        </div>

        {/* Active Screen Visual Representation */}
        <div className="py-4">
          <p className="text-xs text-slate-300 leading-relaxed">{screenState.summaryText}</p>
          {screenState.activeQuery && (
            <div className="mt-2 flex items-center gap-2 text-xs font-mono text-sky-300">
              <span>Active Target: {screenState.activeQuery}</span>
              {screenState.activeSubState && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">{screenState.activeSubState}</span>
                </>
              )}
            </div>
          )}

          {/* Semantic AccessibilityNodeInfo Interactive Elements */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                Visible Semantic UI Elements (AccessibilityNodeInfo Tree)
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                No coordinate guessing · Semantic match
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {screenState.accessibilityNodes.map((node) => {
                const isHighlighted = highlightedNodeId === node.nodeId;
                return (
                  <button
                    key={node.nodeId}
                    type="button"
                    onClick={() => onTriggerNodeAction(node.actionId, node.text)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      isHighlighted
                        ? 'border-emerald-400 bg-emerald-950/30'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {node.text}
                      </span>
                      <span className="text-[11px] font-mono text-sky-400 shrink-0">
                        ACTION_CLICK
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 truncate">
                      {node.contentDescription}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono text-slate-500">
                      <span>{node.className.split('.').pop()}</span>
                      <span aria-hidden="true">·</span>
                      <span>{node.bounds}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Screen Intelligence Actions */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAskVisionQuestion('Jarvis, screen par kya hai? Is page ko samjhao.')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
          >
            &ldquo;Screen par kya hai?&rdquo;
          </button>
          <button
            type="button"
            onClick={() =>
              onAskVisionQuestion('Jarvis, is screen par Settings wala option kholo.')
            }
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap"
          >
            &ldquo;Settings wala option kholo&rdquo;
          </button>
          {currentScreenId === 'ERROR_DIALOG' && (
            <button
              type="button"
              onClick={() =>
                onAskVisionQuestion('Jarvis, screen par jo error aa raha hai uska matlab kya hai?')
              }
              className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-lg whitespace-nowrap"
            >
              &ldquo;Is error ka matlab kya hai?&rdquo;
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
