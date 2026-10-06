import { apiUrl } from '../lib/api';
import { MemoryCategory, MemoryRecord } from '../types/jarvis';

const LOCAL_STORAGE_KEY = 'jarvis_persistent_memories_v3';
const LEGACY_STORAGE_KEY = 'jarvis_saved_memories';
const IDB_NAME = 'jarvis_room_persistent_db';
const IDB_STORE = 'memories_table';
const IDB_VERSION = 1;

export const VALID_MEMORY_CATEGORIES: MemoryCategory[] = [
  'personal_preference',
  'user_information',
  'important_instruction',
  'routine',
  'relationship',
  'work',
  'reminder',
  'assistant_preference',
  'custom',
];

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal_preference: 'Personal Preference',
  user_information: 'User Information',
  important_instruction: 'Important Instruction',
  routine: 'Routine',
  relationship: 'Relationship',
  work: 'Work',
  reminder: 'Reminder',
  assistant_preference: 'Assistant Preference',
  custom: 'Custom',
};

function formatNowTimestamp(): string {
  return new Date().toISOString();
}

export function formatReadableDate(isoOrText: string): string {
  try {
    const d = new Date(isoOrText);
    if (Number.isNaN(d.getTime())) return isoOrText;
    return d.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoOrText;
  }
}

export function inferMemoryCategory(text: string): MemoryCategory {
  const lower = text.toLowerCase();
  if (
    lower.includes('पसंदीदा') ||
    lower.includes('पसंद') ||
    lower.includes('favorite') ||
    lower.includes('favourite') ||
    lower.includes('pasand') ||
    lower.includes('color') ||
    lower.includes('रंग') ||
    lower.includes('food')
  ) {
    return 'personal_preference';
  }
  if (
    lower.includes('उठना') ||
    lower.includes('सुबह') ||
    lower.includes('कल') ||
    lower.includes('alarm') ||
    lower.includes('remind') ||
    lower.includes('याद दिलाना') ||
    lower.includes('meeting') ||
    lower.includes('जाना है')
  ) {
    return 'reminder';
  }
  if (
    lower.includes('रोज़') ||
    lower.includes('daily') ||
    lower.includes('routine') ||
    lower.includes('gym') ||
    lower.includes('workout') ||
    lower.includes('schedule')
  ) {
    return 'routine';
  }
  if (
    lower.includes('माँ') ||
    lower.includes('पापा') ||
    lower.includes('भाई') ||
    lower.includes('दोस्त') ||
    lower.includes('mummy') ||
    lower.includes('papa') ||
    lower.includes('friend') ||
    lower.includes('wife') ||
    lower.includes('mother') ||
    lower.includes('father')
  ) {
    return 'relationship';
  }
  if (
    lower.includes('office') ||
    lower.includes('project') ||
    lower.includes('client') ||
    lower.includes('कंपनी') ||
    lower.includes('काम') ||
    lower.includes('work')
  ) {
    return 'work';
  }
  if (
    lower.includes('hindi mein') ||
    lower.includes('english mein') ||
    lower.includes('हिंदी में') ||
    lower.includes('आवाज़') ||
    lower.includes('बोलना') ||
    lower.includes('response')
  ) {
    return 'assistant_preference';
  }
  if (
    lower.includes('नाम') ||
    lower.includes('name') ||
    lower.includes('birthday') ||
    lower.includes('जन्मदिन') ||
    lower.includes('शहर') ||
    lower.includes('city') ||
    lower.includes('रहता हूँ')
  ) {
    return 'user_information';
  }
  return 'important_instruction';
}

export function inferMemoryKey(value: string, category: MemoryCategory): string {
  const clean = value.trim();
  const lower = clean.toLowerCase();
  if (lower.includes('पसंदीदा रंग') || lower.includes('favorite color') || lower.includes('pasandida rang')) {
    return 'favorite_color';
  }
  if (lower.includes('मेरा नाम') || lower.includes('my name') || lower.includes('mera naam')) {
    return 'user_name';
  }
  if (lower.includes('जन्मदिन') || lower.includes('birthday')) {
    return 'user_birthday';
  }
  if (lower.includes('उठना') || lower.includes('wake up') || lower.includes('subah')) {
    return 'morning_wake_reminder';
  }
  const words = clean
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4);
  if (words.length > 0) {
    return `${category}_${words.join('_').toLowerCase()}`;
  }
  return `${category}_note`;
}

// IndexedDB helper for Android Room-equivalent browser persistence
function openMemoryIndexedDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readAllFromIndexedDB(): Promise<MemoryRecord[]> {
  const db = await openMemoryIndexedDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? (req.result as MemoryRecord[]) : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function writeAllToIndexedDB(memories: MemoryRecord[]): Promise<void> {
  const db = await openMemoryIndexedDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const mem of memories) {
        store.put(mem);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function readFromLocalStorage(): MemoryRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (m) => m && typeof m.id === 'string' && typeof m.value === 'string'
        );
      }
    }
    // Migrate legacy v1 memories if present
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (Array.isArray(legacyParsed)) {
        const migrated: MemoryRecord[] = legacyParsed
          .filter(
            (m) =>
              m &&
              typeof m.text === 'string' &&
              m.id !== 'mem_creator' &&
              !m.text.includes('Krishna Sharma Sir')
          )
          .map((m) => {
            const cat = inferMemoryCategory(m.text);
            const nowIso = formatNowTimestamp();
            return {
              id: m.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              key: inferMemoryKey(m.text, cat),
              value: m.text,
              category: cat,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
          });
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {}
  return [];
}

function writeToLocalStorage(memories: MemoryRecord[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(memories));
  } catch {}
}

function mergeMemoryLists(a: MemoryRecord[], b: MemoryRecord[]): MemoryRecord[] {
  const map = new Map<string, MemoryRecord>();
  for (const item of [...a, ...b]) {
    if (!item || !item.id || !item.value) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const timeNew = new Date(item.updatedAt || item.createdAt || 0).getTime();
      const timeOld = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (timeNew >= timeOld) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values()).sort(
    (x, y) =>
      new Date(y.updatedAt || y.createdAt).getTime() -
      new Date(x.updatedAt || x.createdAt).getTime()
  );
}

// Semantic & multilingual Hindi/Hinglish/English concept groups for intelligent retrieval
const CONCEPT_SYNONYMS: string[][] = [
  ['रंग', 'कलर', 'color', 'colour', 'rang', 'नीला', 'लाल', 'हरा', 'काला', 'पीला', 'blue', 'red', 'green', 'black'],
  ['पसंदीदा', 'पसंद', 'favorite', 'favourite', 'pasand', 'pasandida', 'like', 'love'],
  ['नाम', 'name', 'naam', 'कौन', 'who'],
  ['उठना', 'सुबह', 'जागना', 'wake', 'morning', 'subah', 'uthna', 'alarm', 'जल्दी'],
  ['कल', 'आज', 'tomorrow', 'today', 'kal', 'aaj', 'schedule', 'plan'],
  ['माँ', 'मम्मी', 'पापा', 'पिता', 'mother', 'mom', 'mummy', 'father', 'papa', 'family'],
  ['जन्मदिन', 'बर्थडे', 'birthday', 'dob', 'date of birth', 'janamdin'],
  ['शहर', 'दिल्ली', 'मुंबई', 'घर', 'city', 'location', 'live', 'address', 'rehta'],
  ['काम', 'ऑफिस', 'प्रोजेक्ट', 'work', 'office', 'job', 'project', 'study', 'पढ़ाई'],
  ['भाषा', 'हिंदी', 'इंग्लिश', 'language', 'hindi', 'english', 'hinglish', 'बोलना'],
];

function tokenizeForSearch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

class JarvisMemoryManager {
  private cache: MemoryRecord[] = [];
  private initialized = false;

  async initializeAndSync(): Promise<MemoryRecord[]> {
    const localMem = readFromLocalStorage();
    const idbMem = await readAllFromIndexedDB();
    let merged = mergeMemoryLists(localMem, idbMem);

    try {
      const res = await fetch(apiUrl('/api/jarvis/memories'));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.memories)) {
          merged = mergeMemoryLists(merged, data.memories);
        }
      }
    } catch {}

    this.cache = merged;
    this.initialized = true;
    writeToLocalStorage(this.cache);
    await writeAllToIndexedDB(this.cache);

    // Push merged state back to server persistent store so server & client stay identical
    try {
      await fetch(apiUrl('/api/jarvis/memories/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: this.cache }),
      });
    } catch {}

    return this.cache;
  }

  private async persistAll(memories: MemoryRecord[]): Promise<void> {
    this.cache = memories;
    writeToLocalStorage(memories);
    await writeAllToIndexedDB(memories);
    try {
      await fetch(apiUrl('/api/jarvis/memories/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories }),
      });
    } catch {}
  }

  async listMemories(): Promise<MemoryRecord[]> {
    if (!this.initialized) {
      return this.initializeAndSync();
    }
    return [...this.cache];
  }

  async saveMemory(params: {
    key?: string;
    value: string;
    category?: MemoryCategory;
  }): Promise<MemoryRecord> {
    if (!this.initialized) {
      await this.initializeAndSync();
    }

    const cleanValue = params.value.trim();
    const category: MemoryCategory =
      params.category && VALID_MEMORY_CATEGORIES.includes(params.category)
        ? params.category
        : inferMemoryCategory(cleanValue);
    const key =
      params.key && params.key.trim()
        ? params.key.trim().toLowerCase().replace(/\s+/g, '_')
        : inferMemoryKey(cleanValue, category);

    const now = formatNowTimestamp();

    // Check if an existing memory has the exact same value or same semantic key
    const existingIndex = this.cache.findIndex(
      (m) =>
        m.value.toLowerCase() === cleanValue.toLowerCase() ||
        (key !== 'important_instruction_note' &&
          key !== 'custom_note' &&
          m.key === key &&
          key.startsWith('favorite_'))
    );

    if (existingIndex >= 0) {
      const updated: MemoryRecord = {
        ...this.cache[existingIndex],
        key,
        value: cleanValue,
        category,
        updatedAt: now,
      };
      const next = [...this.cache];
      next.splice(existingIndex, 1);
      const reordered = [updated, ...next];
      await this.persistAll(reordered);
      return updated;
    }

    const record: MemoryRecord = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      key,
      value: cleanValue,
      category,
      createdAt: now,
      updatedAt: now,
    };

    const next = [record, ...this.cache];
    await this.persistAll(next);
    return record;
  }

  async updateMemory(
    id: string,
    updates: Partial<Pick<MemoryRecord, 'key' | 'value' | 'category'>>
  ): Promise<MemoryRecord | null> {
    if (!this.initialized) {
      await this.initializeAndSync();
    }
    const idx = this.cache.findIndex((m) => m.id === id);
    if (idx === -1) return null;

    const current = this.cache[idx];
    const nextValue = updates.value !== undefined ? updates.value.trim() : current.value;
    const nextCategory =
      updates.category && VALID_MEMORY_CATEGORIES.includes(updates.category)
        ? updates.category
        : current.category;
    const nextKey =
      updates.key !== undefined && updates.key.trim()
        ? updates.key.trim()
        : inferMemoryKey(nextValue, nextCategory);

    const updated: MemoryRecord = {
      ...current,
      key: nextKey,
      value: nextValue,
      category: nextCategory,
      updatedAt: formatNowTimestamp(),
    };

    const next = [...this.cache];
    next[idx] = updated;
    await this.persistAll(next);
    return updated;
  }

  async deleteMemory(idOrQuery: string): Promise<MemoryRecord | null> {
    if (!this.initialized) {
      await this.initializeAndSync();
    }
    if (this.cache.length === 0) return null;

    const q = idOrQuery.trim();
    const lower = q.toLowerCase();

    // 1. Direct ID match
    const exactIdIdx = this.cache.findIndex((m) => m.id === q);
    if (exactIdIdx >= 0) {
      const [removed] = this.cache.splice(exactIdIdx, 1);
      await this.persistAll([...this.cache]);
      return removed;
    }

    // 2. "Forget what I just told you" / "जो मैंने अभी बताया था उसे भूल जाओ"
    if (
      lower === 'last' ||
      lower === 'recent' ||
      lower.includes('अभी बताया') ||
      lower.includes('abhi bataya') ||
      lower.includes('just told') ||
      lower.includes('last memory') ||
      lower.includes('आखिरी') ||
      lower.includes('इसे भूल जाओ') ||
      lower.includes('forget this') ||
      lower.includes('forget that')
    ) {
      const [removed] = this.cache.splice(0, 1);
      await this.persistAll([...this.cache]);
      return removed;
    }

    // 3. Semantic / substring match
    const relevant = await this.retrieveMemories(q, 1);
    if (relevant.length > 0) {
      const targetId = relevant[0].id;
      const idx = this.cache.findIndex((m) => m.id === targetId);
      if (idx >= 0) {
        const [removed] = this.cache.splice(idx, 1);
        await this.persistAll([...this.cache]);
        return removed;
      }
    }

    return null;
  }

  async clearAllMemories(confirmed: boolean): Promise<boolean> {
    if (!confirmed) {
      return false;
    }
    await this.persistAll([]);
    return true;
  }

  /**
   * Relevance-based Memory Retrieval:
   * Does NOT send the entire database blindly when many memories exist.
   * Scores memories by semantic keyword overlap, synonym expansion, category relevance, and assistant preferences.
   */
  async retrieveMemories(userQuery: string, maxResults: number = 6): Promise<MemoryRecord[]> {
    if (!this.initialized) {
      await this.initializeAndSync();
    }
    if (this.cache.length === 0) return [];

    const lowerQuery = userQuery.toLowerCase();

    // If user explicitly asks "What do you remember about me?" / "मेरे बारे में तुम्हें क्या याद है?" / "मेरी memory दिखाओ"
    const isGeneralMemoryListingQuery =
      lowerQuery.includes('क्या याद है') ||
      lowerQuery.includes('kya yaad hai') ||
      lowerQuery.includes('what do you remember') ||
      lowerQuery.includes('saved memories') ||
      lowerQuery.includes('मेरी मेमोरी') ||
      lowerQuery.includes('मेरी memory') ||
      lowerQuery.includes('meri memory') ||
      lowerQuery.includes('मेरे बारे में');

    if (isGeneralMemoryListingQuery) {
      return this.cache.slice(0, Math.max(maxResults, 10));
    }

    const queryTokens = tokenizeForSearch(userQuery);

    // Expand query tokens with multilingual concept synonyms
    const expandedTokens = new Set<string>(queryTokens);
    for (const token of queryTokens) {
      for (const group of CONCEPT_SYNONYMS) {
        if (group.some((term) => term === token || token.includes(term))) {
          for (const syn of group) expandedTokens.add(syn);
        }
      }
    }

    const scored = this.cache.map((mem) => {
      let score = 0;
      const memText = `${mem.key} ${mem.value} ${mem.category}`.toLowerCase();
      const memTokens = tokenizeForSearch(memText);

      // Always keep assistant_preference and important_instruction slightly boosted
      if (mem.category === 'assistant_preference') score += 2.5;
      if (mem.category === 'important_instruction') score += 1.5;

      for (const qTok of expandedTokens) {
        if (memText.includes(qTok)) {
          score += 3;
        } else if (memTokens.some((mTok) => mTok.includes(qTok) || qTok.includes(mTok))) {
          score += 2;
        }
      }

      return { mem, score };
    });

    const matched = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((item) => item.mem);

    // If no specific keyword match, provide top 3 most recent user preferences/instructions for general context
    if (matched.length === 0) {
      return this.cache.slice(0, Math.min(3, maxResults));
    }

    return matched;
  }
}

export const memoryManager = new JarvisMemoryManager();
