export interface VoiceHistoryEntry {
  id: string;
  ts: string; // ISO time
  user: string;
  jarvis: string;
}

const KEY = 'jarvis_voice_history_v1';
const MAX = 500;

export function loadVoiceHistory(): VoiceHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVoiceHistory(list: VoiceHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
}

export function clearVoiceHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
