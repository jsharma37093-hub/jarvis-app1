/**
 * ============================================================================
 * Character Video Storage Manager
 * - JARVIS is 100% a single male character. Default video: /character.mp4
 * ============================================================================
 */
import { apiUrl } from './lib/api';
export const CHARACTER_VIDEO_SRC = apiUrl('/character.mp4');

const VIDEO_IDB_NAME = 'jarvis_character_video_store_v2';
const VIDEO_IDB_STORE = 'videos';
const MALE_VIDEO_KEY = 'active_character_video_male';
const FEMALE_VIDEO_KEY = 'active_character_video_female';

export async function saveCharacterVideoFile(
  file: File,
  gender: 'MALE' | 'FEMALE' = 'MALE'
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const key = gender === 'FEMALE' ? FEMALE_VIDEO_KEY : MALE_VIDEO_KEY;

  // 1. Save to Server Disk (/data/character.mp4 or /data/female_character.mp4)
  fetch(apiUrl(`/api/jarvis/save-character-video?gender=${gender}`), {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'video/mp4' },
    body: buffer,
  }).catch(() => {});

  // 2. Save to Browser IndexedDB for instant offline/reload playback
  return new Promise((resolve) => {
    const blob = new Blob([buffer], { type: file.type || 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const req = indexedDB.open(VIDEO_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_IDB_STORE)) {
          db.createObjectStore(VIDEO_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(VIDEO_IDB_STORE, 'readwrite');
        tx.objectStore(VIDEO_IDB_STORE).put(
          { buffer, mimeType: file.type || 'video/mp4' },
          key
        );
        tx.oncomplete = () => resolve(blobUrl);
        tx.onerror = () => resolve(blobUrl);
      };
      req.onerror = () => resolve(blobUrl);
    } catch {
      resolve(blobUrl);
    }
  });
}

export async function loadSavedCharacterVideoUrl(
  gender: 'MALE' | 'FEMALE' = 'MALE'
): Promise<string | null> {
  const key = gender === 'FEMALE' ? FEMALE_VIDEO_KEY : MALE_VIDEO_KEY;
  const idbResult = await new Promise<string | null>((resolve) => {
    try {
      const req = indexedDB.open(VIDEO_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_IDB_STORE)) {
          db.createObjectStore(VIDEO_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(VIDEO_IDB_STORE, 'readonly');
        const getReq = tx.objectStore(VIDEO_IDB_STORE).get(key);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (rec && rec.buffer) {
            const mimeType = rec.mimeType || 'video/mp4';
            const blob = new Blob([rec.buffer], { type: mimeType });
            // Ensure server disk copy is also synced so the video stays permanently attached
            fetch(`/api/jarvis/save-character-video?gender=${gender}`, {
              method: 'POST',
              headers: { 'Content-Type': mimeType },
              body: rec.buffer,
            }).catch(() => {});
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  if (idbResult) {
    return idbResult;
  }

  // Fallback: check if server already has the saved character video on disk
  try {
    const res = await fetch(`/api/jarvis/has-character-video?gender=${gender}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.exists && typeof data.url === 'string') {
        return data.url;
      }
    }
  } catch {}

  return null;
}
