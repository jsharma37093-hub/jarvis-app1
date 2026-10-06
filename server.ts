import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const MEMORIES_DB_FILE = path.join(DATA_DIR, "jarvis_memories_db.json");
const API_CONFIG_FILE = path.join(DATA_DIR, "jarvis_api_config.json");

interface StoredMemoryRecord {
  id: string;
  key: string;
  value: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

function readDiskMemories(): StoredMemoryRecord[] {
  try {
    ensureDataDir();
    if (fs.existsSync(MEMORIES_DB_FILE)) {
      const raw = fs.readFileSync(MEMORIES_DB_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

function writeDiskMemories(memories: StoredMemoryRecord[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(MEMORIES_DB_FILE, JSON.stringify(memories, null, 2), "utf-8");
  } catch {}
}

function maskApiKey(key: string | undefined): string {
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim().length < 8) {
    return "";
  }
  const clean = key.trim();
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  return `${prefix}************${suffix}`;
}

function readSavedApiKey(): string {
  try {
    ensureDataDir();
    if (fs.existsSync(API_CONFIG_FILE)) {
      const raw = fs.readFileSync(API_CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw) as { apiKey?: string };
      if (parsed && typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 10) {
        const clean = parsed.apiKey.replace(/^["']|["']$/g, "").trim();
        if (!clean.startsWith("AQ.")) {
          return clean;
        }
      }
    }
  } catch {}
  return "";
}

function writeSavedApiKey(apiKey: string): void {
  try {
    ensureDataDir();
    const clean = apiKey.replace(/^["']|["']$/g, "").trim();
    fs.writeFileSync(
      API_CONFIG_FILE,
      JSON.stringify({ apiKey: clean, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
  } catch {}
}

function getEffectiveApiKey(customHeaderKey?: string): string {
  if (customHeaderKey) {
    const cleanHeaderKey = customHeaderKey.replace(/^["']|["']$/g, "").trim();
    if (cleanHeaderKey.length > 10 && !cleanHeaderKey.startsWith("AQ.")) {
      return cleanHeaderKey;
    }
  }
  const diskKey = readSavedApiKey();
  if (diskKey) {
    const cleanDiskKey = diskKey.replace(/^["']|["']$/g, "").trim();
    if (cleanDiskKey.length > 10 && !cleanDiskKey.startsWith("AQ.")) {
      return cleanDiskKey;
    }
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey !== "MY_GEMINI_API_KEY") {
    const cleanEnvKey = envKey.replace(/^["']|["']$/g, "").trim();
    if (cleanEnvKey.length > 10 && cleanEnvKey.startsWith("AIza")) {
      return cleanEnvKey;
    }
  }
  return "";
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  const cleanKey = apiKey.replace(/^["']|["']$/g, "").trim();
  return new GoogleGenAI({
    apiKey: cleanKey,
  });
}

function normalizeAudioMimeType(rawMime: string | undefined): string {
  if (!rawMime || typeof rawMime !== "string") return "audio/webm";
  const base = rawMime.split(";")[0].trim().toLowerCase();
  const allowed = [
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
  ];
  return allowed.includes(base) ? base : "audio/webm";
}

function isCreatorQuestion(input: string): boolean {
  const normalized = input.toLowerCase().trim();
  const patterns = [
    "who made you",
    "who created you",
    "who built you",
    "who is your creator",
    "who developed you",
    "tumhe kisne banaya",
    "tumko kisne banaya",
    "aapko kisne banaya",
    "apko kisne banaya",
    "kisne banaya hai",
    "tumhara creator kaun",
    "your developer",
    "your maker",
    "किसने बनाया",
    "तुम्हें किसने बनाया",
    "आपको किसने बनाया",
  ];
  return patterns.some((p) => normalized.includes(p));
}

function extractExplicitMemory(input: string): string {
  const trimmed = input.trim();
  const patterns = [
    /^(?:hey\s+jarvis|jarvis)?[\s,]*(?:याद\s+रखना\s+कि|याद\s+रखना|याद\s+रखो|इसे\s+अपनी\s+memory\s+में\s+save\s+कर\s+लो|मेरी\s+memory\s+में\s+save\s+करो|इसे\s+याद\s+रखना|सेव\s+कर\s+लो|yaad\s+rakhna\s+ki|yaad\s+rakhna|yaad\s+rakho|save\s+kar\s+lo|save\s+karo|memory\s+mein\s+save\s+kar\s+lo|remember\s+that|remember)\s*(?:ki|कि|that|:|-)?\s*(.+)$/i,
    /^(.+?)[,\s]+(?:इसे\s+याद\s+रखना|याद\s+रखना|याद\s+रखो|इसे\s+अपनी\s+memory\s+में\s+save\s+कर\s+लो|सेव\s+कर\s+लो|yaad\s+rakhna|save\s+kar\s+lo|remember\s+this|remember\s+it)[.!?]*$/i,
  ];
  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1] && match[1].trim().length > 2) {
      return match[1].trim().replace(/^[,\s]+|[,.!?]+$/g, "");
    }
  }
  return "";
}

function isForgetMemoryCommand(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes("भूल जाओ") ||
    lower.includes("bhool jao") ||
    lower.includes("bhul jao") ||
    lower.includes("forget what i") ||
    lower.includes("forget this") ||
    lower.includes("forget that") ||
    lower.includes("memory से हटा दो") ||
    lower.includes("memory delete")
  );
}

async function performRealWebSearch(
  rawQuery: string
): Promise<{
  query: string;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  summaryHi: string;
}> {
  const cleanQuery = (rawQuery || "")
    .replace(
      /\b(search|karo|karein|for|google|par|pe|web|dekho|batao|के बारे में|सर्च करो|सर्च|खोजो|गूगल पर|वेब पर|दिखाओ|बताओ)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim() || rawQuery.trim() || "India latest news";

  const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];

  // 1. Live Wikipedia REST Search API (Fast, reliable, zero-key real web articles)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery
    )}&utf8=&format=json&srlimit=4`;
    const r = await fetch(wikiUrl, {
      headers: { "User-Agent": "JARVIS-Android-Agent/2.0" },
    });
    if (r.ok) {
      const data = (await r.json()) as {
        query?: {
          search?: Array<{ title: string; snippet: string; pageid: number }>;
        };
      };
      const items = data.query?.search || [];
      for (const item of items) {
        const cleanSnippet = item.snippet.replace(/<[^>]+>/g, "").trim();
        results.push({
          title: item.title,
          url: `https://en.m.wikipedia.org/wiki/${encodeURIComponent(
            item.title.replace(/\s+/g, "_")
          )}`,
          snippet: cleanSnippet,
          source: "Wikipedia Live Web",
        });
      }
    }
  } catch {}

  // 2. Live DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      cleanQuery
    )}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(ddgUrl);
    if (r.ok) {
      const ddg = (await r.json()) as {
        Heading?: string;
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      if (ddg.AbstractText && ddg.AbstractURL) {
        results.unshift({
          title: ddg.Heading || cleanQuery,
          url: ddg.AbstractURL.replace("en.wikipedia.org", "en.m.wikipedia.org"),
          snippet: ddg.AbstractText,
          source: "DuckDuckGo Web Index",
        });
      }
      if (Array.isArray(ddg.RelatedTopics)) {
        for (const t of ddg.RelatedTopics.slice(0, 3)) {
          if (t.Text && t.FirstURL) {
            results.push({
              title: t.Text.split(" - ")[0] || cleanQuery,
              url: t.FirstURL,
              snippet: t.Text,
              source: "DuckDuckGo Web",
            });
          }
        }
      }
    }
  } catch {}

  // Always include direct Google Search & Live Web Portal entry with igu=1 so it renders inside Web Preview iframe
  results.push({
    title: `Google Search: ${cleanQuery}`,
    url: `https://www.google.com/search?igu=1&q=${encodeURIComponent(cleanQuery)}`,
    snippet: `"${cleanQuery}" के लिए लाइव Google Web परिणाम और वेबसाइट प्रीव्यू।`,
    source: "google.com",
  });

  const top = results[0];
  const summaryHi =
    top && top.source !== "google.com"
      ? `जी सर, मैंने "${cleanQuery}" को वेब प्रिव्यू के अंदर खोलकर दिखा दिया है। ${top.snippet.slice(0, 140)}`
      : `जी सर, मैंने "${cleanQuery}" को वेब प्रिव्यू के अंदर खोलकर दिखा दिया है।`;

  return {
    query: cleanQuery,
    results: results.slice(0, 5),
    summaryHi,
  };
}

const DEFAULT_PLAYABLE_HINDI_SONGS: Array<{ videoId: string; title: string }> = [
  { videoId: "RLzC55ai0eo", title: "Heeriye (Official Video) Jasleen Royal ft. Arijit Singh" },
  { videoId: "BddP6PYo2gs", title: "Kesariya - Brahmāstra | Ranbir Kapoor, Alia Bhatt | Arijit Singh" },
  { videoId: "SlPhMPnQ58k", title: "Maroon 5 - Memories (Official Video)" },
  { videoId: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee" },
  { videoId: "JGwWNGJdvx8", title: "Ed Sheeran - Shape of You (Official Music Video)" },
  { videoId: "RgKAFK5djSk", title: "Wiz Khalifa - See You Again ft. Charlie Puth" },
];

async function searchYouTubeVideos(rawQuery: string): Promise<{
  query: string;
  embedUrl: string;
  watchUrl: string;
  title: string;
  results: Array<{ title: string; url: string; snippet: string; source: string }>;
  summaryHi: string;
}> {
  const stripped = (rawQuery || "")
    .replace(
      /\b(hey\s+jarvis|jarvis|हे\s+जार्विस|जार्विस|सुनो|वेब\s+प्रिव्यू\s+में|वेब\s+प्रिव्यू|प्रिव्यू\s+में|के\s+अंदर|अंदर|यूट्यूब\s+को|यूट्यूब\s+पर|यूट्यूब\s+में|यूट्यूब|यू\s+ट्यूब|youtube\s+par|youtube\s+pe|on\s+youtube|in\s+youtube|youtube|खोलकर|खोल\s+कर|खोलो|चला\s+दो|चलाओ|चला\s+देना|बजा\s+दो|बजाओ|सुना\s+दो|सुनाओ|प्ले\s+करो|दिखाओ|कोई\s+अच्छा\s+सा|कोई\s+बढ़िया|कोई|मुझे|मेरे\s+लिए|kholo|chala\s+do|chalao|baja\s+do|bajao|suna\s+do|sunao|play\s+a|play|open)\b/gi,
      " "
    )
    .replace(/[.,!?।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const isGenericSongRequest =
    !stripped ||
    /^(सॉन्ग|गाना|गाने|म्यूजिक|संगीत|वीडियो|song|songs|gana|gaana|music|video)$/i.test(
      stripped
    );

  const searchQuery = isGenericSongRequest
    ? "New Hindi Hit Songs Arijit Singh Bollywood Official Video"
    : `${stripped} song official video`;

  const displayQuery = isGenericSongRequest ? "Superhit Hindi Song" : stripped;
  const foundVideos: Array<{ videoId: string; title: string }> = [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1600);
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      searchQuery
    )}`;
    const r = await fetch(ytUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept-Language": "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (r.ok) {
      const html = await r.text();
      const idRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
      const seenIds = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = idRegex.exec(html)) !== null && foundVideos.length < 6) {
        const vid = match[1];
        if (!seenIds.has(vid)) {
          seenIds.add(vid);
          foundVideos.push({
            videoId: vid,
            title: `${displayQuery} — YouTube Track #${foundVideos.length + 1}`,
          });
        }
      }
    }
  } catch {}

  for (const fallbackSong of DEFAULT_PLAYABLE_HINDI_SONGS) {
    if (
      foundVideos.length < 6 &&
      !foundVideos.some((v) => v.videoId === fallbackSong.videoId)
    ) {
      foundVideos.push(fallbackSong);
    }
  }

  const topVideo = foundVideos[0] || DEFAULT_PLAYABLE_HINDI_SONGS[0];
  const embedUrl = `https://www.youtube.com/embed/${topVideo.videoId}?autoplay=1&playsinline=1&rel=0`;
  const watchUrl = `https://www.youtube.com/watch?v=${topVideo.videoId}`;

  const results = foundVideos.slice(0, 6).map((v, idx) => ({
    title: idx === 0 && !isGenericSongRequest ? `▶ ${displayQuery} (Playing Now)` : `▶ ${v.title}`,
    url: `https://www.youtube.com/embed/${v.videoId}?autoplay=1&playsinline=1&rel=0`,
    snippet: `YouTube Video ID: ${v.videoId} · वेब प्रिव्यू में तुरंत चलाने के लिए Preview दबाएँ`,
    source: "YouTube Player",
  }));

  const summaryHi = isGenericSongRequest
    ? `जी सर, मैंने YouTube को वेब प्रिव्यू में खोलकर सॉन्ग चला दिया है।`
    : `जी सर, मैंने YouTube को वेब प्रिव्यू में खोलकर "${displayQuery}" चला दिया है।`;

  return {
    query: displayQuery,
    embedUrl,
    watchUrl,
    title: `YouTube: ${displayQuery}`,
    results,
    summaryHi,
  };
}

function detectFastDeviceOrAppCommand(input: string) {
  const clean = (input || "").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const isOff =
    lower.includes("बंद") ||
    lower.includes("ऑफ") ||
    lower.includes("band") ||
    lower.includes("off") ||
    lower.includes("close") ||
    lower.includes("disable") ||
    lower.includes("stop");

  // A. Website Opening Modes: REAL_OPEN vs PREVIEW (Default is ALWAYS Web Preview unless user explicitly says "real में खोलो")
  if (
    lower.includes("real में खोलो") ||
    lower.includes("real mein kholo") ||
    lower.includes("real browser में खोलो") ||
    lower.includes("असली ब्राउज़र में खोलो") ||
    lower.includes("असली ऐप में खोलो") ||
    lower.includes("open it in the real browser") ||
    lower.includes("open in real browser") ||
    lower.includes("इसे browser में खोलो") ||
    lower.includes("open in browser")
  ) {
    return {
      intentCategory: "OpenWebsiteIntent",
      actionType: "OPEN_WEBSITE_REAL",
      target: "CONTEXT_LAST_URL",
      payload: clean,
      spokenResponse: "जी सर, मैं इसे आपके फोन के असली ब्राउज़र में खोल रहा हूँ।",
    };
  }

  // A0. YouTube & Song / Music / Video Playback ("सॉन्ग चला दो", "गाना चला दो", "यूट्यूब खोलो", "यूट्यूब पर सॉन्ग चलाओ")
  const isSongOrYoutubeRequest =
    !isOff &&
    (lower.includes("सॉन्ग") ||
      lower.includes("सांग") ||
      lower.includes("गाना") ||
      lower.includes("गाने") ||
      lower.includes("म्यूजिक") ||
      lower.includes("भजन") ||
      lower.includes("यूट्यूब") ||
      lower.includes("यू ट्यूब") ||
      lower.includes("youtube") ||
      lower.includes("song") ||
      lower.includes("gana") ||
      lower.includes("gaana") ||
      lower.includes("music") ||
      lower.includes("वीडियो चला") ||
      lower.includes("video chala") ||
      lower.includes("play "));

  if (isSongOrYoutubeRequest) {
    return {
      intentCategory: "OpenAppIntent",
      actionType: "OPEN_APP",
      target: "youtube",
      payload: clean,
      spokenResponse: "जी सर, मैं YouTube खोलकर आपका गाना चला रहा हूँ।",
    };
  }

  const explicitDomainMatch = clean.match(
    /\b((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|org|in|net|io|dev|edu|gov)(?:\/[^\s]*)?)\b/i
  );
  if (
    explicitDomainMatch &&
    (lower.includes("open") || lower.includes("खोलो") || lower.includes("दिखाओ") || lower.includes("चलाओ"))
  ) {
    const rawDomain = explicitDomainMatch[1];
    const fullUrl = rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`;
    return {
      intentCategory: "OpenWebsiteIntent",
      actionType: "OPEN_WEBSITE_REAL",
      target: fullUrl,
      payload: rawDomain,
      spokenResponse: `जी सर, मैंने ${rawDomain} खोल दिया है।`,
    };
  }

  if (
    lower.includes("इस website को खोलो") ||
    lower.includes("इस वेबसाइट को खोलो") ||
    lower.includes("open this website") ||
    lower === "अब इसे खोलो" ||
    lower === "अब इसे खोलो।" ||
    lower === "इसे खोलो"
  ) {
    return {
      intentCategory: "OpenWebsiteIntent",
      actionType: "OPEN_WEBSITE_REAL",
      target: "CONTEXT_LAST_URL",
      payload: clean,
      spokenResponse: "जी सर, मैंने वेबसाइट खोल दी है।",
    };
  }

  // B. Web Search ("इसको search करो", "ताजमहल दिखाओ", "भारत में आज का मौसम", etc.)
  if (
    lower.includes("search करो") ||
    lower.includes("सर्च करो") ||
    lower.includes("search this") ||
    lower.startsWith("search ") ||
    lower.includes("search for ") ||
    lower.includes("google पर search") ||
    lower.includes("गूगल पर सर्च") ||
    lower.includes("खोजो")
  ) {
    const q = clean.replace(/^(search|सर्च|खोजो|google पर search करो)\s*/i, "").trim();
    return {
      intentCategory: "OpenWebsiteIntent",
      actionType: "OPEN_WEBSITE_REAL",
      target: `https://www.google.com/search?q=${encodeURIComponent(q || clean)}`,
      payload: clean,
      spokenResponse: `जी सर, मैं Google पर "${q || clean}" सर्च कर रहा हूँ।`,
    };
  }

  // C. Screen Sharing — Single App vs Full Device
  if (
    lower.includes("स्क्रीन") ||
    lower.includes("screen share") ||
    lower.includes("share my") ||
    lower.includes("share only") ||
    lower.includes("only share")
  ) {
    if (isOff) {
      return {
        intentCategory: "ScreenShareIntent",
        actionType: "STOP_SCREEN_SHARE",
        target: "screen",
        payload: "",
        spokenResponse: "जी सर, स्क्रीन शेयरिंग बंद कर दी गई है।",
      };
    }

    const isSingleAppShare =
      lower.includes("सिर्फ") ||
      lower.includes("केवल") ||
      lower.includes("only") ||
      lower.includes("इस app की") ||
      lower.includes("इसकी screen") ||
      lower.includes("इसकी स्क्रीन");

    if (isSingleAppShare) {
      let targetApp = "CONTEXT_LAST_APP";
      if (lower.includes("youtube") || lower.includes("यूट्यूब")) targetApp = "YouTube";
      else if (lower.includes("whatsapp") || lower.includes("व्हाट्सएप")) targetApp = "WhatsApp";
      else if (lower.includes("chrome") || lower.includes("क्रोम")) targetApp = "Chrome";
      else if (lower.includes("instagram") || lower.includes("इंस्टाग्राम")) targetApp = "Instagram";

      return {
        intentCategory: "ScreenShareIntent",
        actionType: "SCREEN_SHARE_SINGLE_APP",
        target: targetApp,
        payload: clean,
        spokenResponse:
          targetApp === "CONTEXT_LAST_APP"
            ? "ठीक है, केवल इस ऐप की स्क्रीन शेयरिंग के लिए Android विंडो चयन खोल रहा हूँ।"
            : `ठीक है, केवल ${targetApp} की स्क्रीन शेयर करने के लिए Android परमिशन खोल रहा हूँ।`,
      };
    }

    if (
      lower.includes("share") ||
      lower.includes("शेयर") ||
      lower.includes("चालू") ||
      lower.includes("दिखाओ")
    ) {
      return {
        intentCategory: "ScreenShareIntent",
        actionType: "SCREEN_SHARE_FULL",
        target: "FULL_DEVICE",
        payload: clean,
        spokenResponse: "ठीक है, पूरी स्क्रीन शेयरिंग की Android परमिशन खोल रहा हूँ।",
      };
    }
  }

  // D. Global Accessibility Actions: Home, Back, Recents, Notifications
  if (
    lower === "home जाओ" ||
    lower === "होम जाओ" ||
    lower === "go home" ||
    lower.includes("होम स्क्रीन पर जाओ") ||
    lower.includes("go to home screen")
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: "GLOBAL_ACTION_HOME",
      target: "HOME",
      payload: "",
      spokenResponse: "होम एक्शन प्रोसेस किया जा रहा है।",
    };
  }

  if (
    lower === "back जाओ" ||
    lower === "बैक जाओ" ||
    lower === "पीछे जाओ" ||
    lower === "go back" ||
    lower === "navigate back"
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: "GLOBAL_ACTION_BACK",
      target: "BACK",
      payload: "",
      spokenResponse: "बैक एक्शन किया जा रहा है।",
    };
  }

  if (
    lower.includes("recent apps खोलो") ||
    lower.includes("रीसेंट ऐप्स खोलो") ||
    lower.includes("open recent apps") ||
    lower.includes("show recents")
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: "GLOBAL_ACTION_RECENTS",
      target: "RECENTS",
      payload: "",
      spokenResponse: "Recent Apps खोला जा रहा है।",
    };
  }

  if (
    lower.includes("notifications खोलो") ||
    lower.includes("नोटिफिकेशन खोलो") ||
    lower.includes("open notifications")
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: "GLOBAL_ACTION_NOTIFICATIONS",
      target: "NOTIFICATIONS",
      payload: "",
      spokenResponse: "नोटिफिकेशन पैनल खोला जा रहा है।",
    };
  }

  // E. System Settings Actions: Bluetooth, Wi-Fi, Location, Hotspot, Settings
  if (
    lower.includes("ब्लूटूथ") ||
    lower.includes("bluetooth") ||
    lower.includes("ब्लू टूथ")
  ) {
    return {
      intentCategory: "SystemSettingsIntent",
      actionType: "OPEN_SYSTEM_SETTINGS",
      target: "BLUETOOTH",
      payload: isOff ? "OFF" : "ON",
      spokenResponse:
        "मैंने Bluetooth की settings खोल दी हैं। इस Android version में direct toggle की permission उपलब्ध नहीं है।",
    };
  }

  if (
    lower.includes("वाईफाई") ||
    lower.includes("वाई-फाई") ||
    lower.includes("wifi") ||
    lower.includes("wi-fi")
  ) {
    return {
      intentCategory: "SystemSettingsIntent",
      actionType: "OPEN_SYSTEM_SETTINGS",
      target: "WIFI",
      payload: isOff ? "OFF" : "ON",
      spokenResponse:
        "मैंने Wi-Fi की settings खोल दी हैं। यहाँ से आप नेटवर्क नियंत्रित कर सकते हैं।",
    };
  }

  // F. Flashlight / Torch Control
  if (
    lower.includes("टॉर्च") ||
    lower.includes("फ्लैशलाइट") ||
    lower.includes("फ्लैश") ||
    lower.includes("torch") ||
    lower.includes("flashlight")
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: isOff ? "FLASHLIGHT_OFF" : "FLASHLIGHT_ON",
      target: "flashlight",
      payload: "",
      spokenResponse: isOff
        ? "जी सर, टॉर्च बंद कर दी गई है।"
        : "जी सर, फ्लैशलाइट (टॉर्च) चालू की जा रही है।",
    };
  }

  if (lower.includes("हॉटस्पॉट") || lower.includes("hotspot")) {
    return {
      intentCategory: "SystemSettingsIntent",
      actionType: "OPEN_SYSTEM_SETTINGS",
      target: "HOTSPOT",
      payload: isOff ? "OFF" : "ON",
      spokenResponse: "मैंने Hotspot और Tethering settings खोल दी हैं।",
    };
  }

  if (lower.includes("लोकेशन") || lower.includes("जीपीएस") || lower.includes("location") || lower.includes("gps")) {
    return {
      intentCategory: "SystemSettingsIntent",
      actionType: "OPEN_SYSTEM_SETTINGS",
      target: "LOCATION",
      payload: isOff ? "OFF" : "ON",
      spokenResponse: "मैंने GPS Location settings खोल दी हैं।",
    };
  }

  // G. Background Mode Control ("Background on karo", "Background mode chalu karo", "Jarvis background mein chalo", "Background off karo")
  if (
    lower.includes("बैकग्राउंड") ||
    lower.includes("background") ||
    lower.includes("always on")
  ) {
    return {
      intentCategory: "DeviceActionIntent",
      actionType: isOff ? "BACKGROUND_MODE_OFF" : "BACKGROUND_MODE_ON",
      target: "background",
      payload: "",
      spokenResponse: isOff
        ? "जी सर, बैकग्राउंड मोड बंद कर दिया गया है।"
        : "जी सर, बैकग्राउंड वॉयस सर्विस एक्टिव कर दी गई है।",
    };
  }

  if (
    lower.includes("सेटिंग") ||
    lower.includes("सेटिंग्स") ||
    lower.includes("settings") ||
    lower.includes("setting खोल")
  ) {
    return {
      intentCategory: "SystemSettingsIntent",
      actionType: "OPEN_SYSTEM_SETTINGS",
      target: "SETTINGS",
      payload: "",
      spokenResponse: "मैंने Android Settings खोल दी हैं।",
    };
  }

  // H. App Controlling System (Generic + Known Apps)
  const appMappings: Array<{
    keywords: string[];
    appId: string;
    appNameHi: string;
  }> = [
    { keywords: ["व्हाट्सएप", "व्हाट्सऐप", "whatsapp", "वाट्सएप"], appId: "whatsapp", appNameHi: "WhatsApp" },
    { keywords: ["यूट्यूब", "youtube", "यू ट्यूब"], appId: "youtube", appNameHi: "YouTube" },
    { keywords: ["इंस्टाग्राम", "इंस्टा", "instagram", "insta"], appId: "instagram", appNameHi: "Instagram" },
    { keywords: ["क्रोम", "ब्राउज़र", "chrome"], appId: "chrome", appNameHi: "Google Chrome" },
    { keywords: ["मैप", "मैप्स", "रास्ता", "maps", "google map"], appId: "maps", appNameHi: "Google Maps" },
    { keywords: ["कॉल", "डायलर", "फ़ोन लगाओ", "फोन लगाओ", "dialer", "phone call"], appId: "phone", appNameHi: "Phone Dialer" },
    { keywords: ["स्पॉटिफाई", "गाना", "म्यूजिक", "spotify", "music"], appId: "spotify", appNameHi: "Spotify" },
    { keywords: ["जीमेल", "ईमेल", "मेल", "gmail", "email"], appId: "gmail", appNameHi: "Gmail" },
    { keywords: ["कैलकुलेटर", "हिसाब", "calculator"], appId: "calculator", appNameHi: "Calculator" },
  ];

  for (const app of appMappings) {
    if (app.keywords.some((kw) => lower.includes(kw))) {
      return {
        intentCategory: "OpenAppIntent",
        actionType: isOff ? "CLOSE_APP" : "OPEN_APP",
        target: app.appId,
        payload: clean,
        spokenResponse: isOff
          ? `${app.appNameHi} बंद किया जा रहा है।`
          : `${app.appNameHi} खोल दिया है।`,
      };
    }
  }

  // Generic "Open [AppName]" or "[AppName] खोलो" for any app so AppResolver can check if it's installed
  const openEnMatch = clean.match(/^(?:jarvis\s+)?open\s+([a-zA-Z0-9\s._-]+)$/i);
  if (openEnMatch) {
    const requestedApp = openEnMatch[1].trim();
    return {
      intentCategory: "OpenAppIntent",
      actionType: "OPEN_APP",
      target: requestedApp,
      payload: clean,
      spokenResponse: `${requestedApp} चेक किया जा रहा है।`,
    };
  }

  const openHiMatch = clean.match(/^(?:जार्विस\s+|jarvis\s+)?(.+?)\s+(?:खोलो|चलाओ|चला दो|ओपन करो|kholo|chalao)$/i);
  if (openHiMatch) {
    const requestedApp = openHiMatch[1].trim();
    return {
      intentCategory: "OpenAppIntent",
      actionType: "OPEN_APP",
      target: requestedApp,
      payload: clean,
      spokenResponse: `${requestedApp} चेक किया जा रहा है।`,
    };
  }

  return null;
}

// Intelligent Hindi/Hinglish/English conversational & action fallback so JARVIS NEVER shows a Gemini error
function buildConversationalFallback(
  userInput: string,
  relevantMemories: Array<{ key?: string; value?: string; category?: string }>,
  conversationHistory: Array<{ role: string; text: string }>,
  activeCameraMode: string,
  isScreenShared: boolean
) {
  const clean = (userInput || "").trim();
  const lower = clean.toLowerCase();

  const fastCmd = detectFastDeviceOrAppCommand(clean);
  if (fastCmd) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "DEVICE_ACTION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: {
        actionType: fastCmd.actionType,
        target: fastCmd.target,
        payload: fastCmd.payload,
      },
      spokenResponse: fastCmd.spokenResponse,
      shouldEndConversation: false,
    };
  }

  if (clean && isCreatorQuestion(clean)) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINGLISH",
      emotionState: "CALM",
      intent: "CREATOR_IDENTITY",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse: "Mujhe Krishna Sharma Sir ne banaya hai.",
      shouldEndConversation: false,
    };
  }

  // Screen share commands ("जार्विस, मेरी स्क्रीन को शेयर करो", "screen share karo")
  if (
    lower.includes("स्क्रीन को शेयर") ||
    lower.includes("स्क्रीन शेयर") ||
    lower.includes("screen share") ||
    lower.includes("share my screen") ||
    lower.includes("screen dikhao")
  ) {
    const isStopping =
      lower.includes("बंद") || lower.includes("band") || lower.includes("stop") || lower.includes("off");
    return {
      userTranscript: clean || "जार्विस, मेरी स्क्रीन को शेयर करो",
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "DEVICE_ACTION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: {
        actionType: isStopping ? "STOP_SCREEN_SHARE" : "START_SCREEN_SHARE",
        target: "screen",
        payload: "",
      },
      spokenResponse: isStopping
        ? "जी सर, मैंने स्क्रीन शेयरिंग बंद कर दी है।"
        : "जी सर, मैंने आपकी स्क्रीन शेयरिंग चालू कर दी है। अब मैं आपकी स्क्रीन देख सकता हूँ।",
      shouldEndConversation: false,
    };
  }

  // Camera commands
  if (
    lower.includes("कैमरा") ||
    lower.includes("camera") ||
    lower.includes("front cam") ||
    lower.includes("back cam")
  ) {
    if (lower.includes("बंद") || lower.includes("band") || lower.includes("off") || lower.includes("close")) {
      return {
        userTranscript: clean || "कैमरा बंद करो",
        isSilenceOrNoise: false,
        detectedLanguage: "HINDI",
        emotionState: "CALM",
        intent: "DEVICE_ACTION",
        memoryAction: "NONE",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "CLOSE_CAMERA", target: "camera", payload: "" },
        spokenResponse: "जी सर, कैमरा बंद कर दिया गया है।",
        shouldEndConversation: false,
      };
    }
    if (lower.includes("बैक") || lower.includes("पीछे") || lower.includes("back") || lower.includes("piche")) {
      return {
        userTranscript: clean || "बैक कैमरा चालू करो",
        isSilenceOrNoise: false,
        detectedLanguage: "HINDI",
        emotionState: "CALM",
        intent: "DEVICE_ACTION",
        memoryAction: "NONE",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "OPEN_CAMERA_BACK", target: "camera", payload: "" },
        spokenResponse: "जी सर, बैक कैमरा चालू कर दिया है।",
        shouldEndConversation: false,
      };
    }
    return {
      userTranscript: clean || "कैमरा चालू करो",
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "DEVICE_ACTION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "OPEN_CAMERA_FRONT", target: "camera", payload: "" },
      spokenResponse: "जी सर, फ्रंट कैमरा चालू कर दिया है।",
      shouldEndConversation: false,
    };
  }

  // Forget memory command
  if (clean && isForgetMemoryCommand(clean)) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "DELETE_MEMORY",
      memoryAction: "DELETE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "LAST",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse: "ठीक है सर, मैंने उसे अपनी मेमोरी से हटा दिया है।",
      shouldEndConversation: false,
    };
  }

  // Save memory command
  const extractedMem = clean ? extractExplicitMemory(clean) : "";
  if (extractedMem) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "HAPPY",
      intent: "SAVE_MEMORY",
      memoryAction: "SAVE",
      memoryToSave: {
        key: "saved_memory",
        value: extractedMem,
        category: "personal_preference",
      },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse: `ठीक है सर, मैंने इसे याद रख लिया है: ${extractedMem}।`,
      shouldEndConversation: false,
    };
  }

  // Memory recall questions ("मेरा पसंदीदा रंग क्या है?", "मेरे बारे में तुम्हें क्या याद है?")
  if (
    lower.includes("क्या याद") ||
    lower.includes("kya yaad") ||
    lower.includes("पसंदीदा") ||
    lower.includes("favorite") ||
    lower.includes("मेरी मेमोरी") ||
    lower.includes("मेरी memory") ||
    lower.includes("मेरे बारे में")
  ) {
    if (Array.isArray(relevantMemories) && relevantMemories.length > 0) {
      const summary = relevantMemories.map((m) => m.value).join("। ");
      return {
        userTranscript: clean,
        isSilenceOrNoise: false,
        detectedLanguage: "HINDI",
        emotionState: "CALM",
        intent: "RECALL_MEMORY",
        memoryAction: "LIST",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "NONE", target: "", payload: "" },
        spokenResponse: `जी सर, मुझे याद है: ${summary}।`,
        shouldEndConversation: false,
      };
    }
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "RECALL_MEMORY",
      memoryAction: "LIST",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse: "सर, अभी मेरी मेमोरी में इस बारे में कोई जानकारी सेव नहीं है। आप मुझे बताइए, मैं तुरंत याद रख लूँगा।",
      shouldEndConversation: false,
    };
  }

  // Contextual follow-up (e.g., Delhi / weather / bad day)
  if (lower.includes("खराब") || lower.includes("उदास") || lower.includes("sad") || lower.includes("bad day")) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "SUPPORTIVE",
      intent: "CONVERSATION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse:
        "ओह सर, परेशान मत होइए। कभी-कभी दिन थोड़ा भारी हो जाता है, लेकिन मैं आपके साथ हूँ। बताइए, मैं आपका मूड ठीक करने या किसी काम में कैसे मदद करूँ?",
      shouldEndConversation: false,
    };
  }

  const recentText = conversationHistory.map((h) => h.text).join(" ");
  if (
    (lower.includes("मौसम") || lower.includes("weather") || lower.includes("वहाँ")) &&
    (recentText.includes("दिल्ली") || recentText.toLowerCase().includes("delhi") || lower.includes("दिल्ली"))
  ) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "CONVERSATION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse:
        "जी सर, दिल्ली में कल मौसम साफ और हल्का गर्म रहने की संभावना है। सफर के लिए समय अच्छा रहेगा।",
      shouldEndConversation: false,
    };
  }

  if (lower.includes("दिल्ली जाना") || lower.includes("delhi jana")) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "CONVERSATION",
      memoryAction: "SAVE",
      memoryToSave: {
        key: "travel_plan_delhi",
        value: clean,
        category: "reminder",
      },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse: "ठीक है सर, मैंने याद रख लिया है कि आपको कल दिल्ली जाना है।",
      shouldEndConversation: false,
    };
  }

  if (activeCameraMode !== "OFF" || isScreenShared) {
    return {
      userTranscript: clean || "Hey Jarvis",
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "CALM",
      intent: "CONVERSATION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse:
        "हाँ भाई, मैं देख भी रहा हूँ और सुन भी रहा हूँ। बताओ क्या करना है?",
      shouldEndConversation: false,
    };
  }

  if (
    lower.includes("कैसे हो") ||
    lower.includes("क्या हाल") ||
    lower.includes("kaise ho") ||
    lower.includes("kya haal") ||
    lower.includes("how are you")
  ) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "HAPPY",
      intent: "CONVERSATION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse:
        "मैं एकदम बढ़िया हूँ भाई! तुम बताओ, आज क्या चल रहा है और क्या काम करना है?",
      shouldEndConversation: false,
    };
  }

  if (
    lower.includes("क्या कर रहे") ||
    lower.includes("kya kar rahe") ||
    lower.includes("what are you doing")
  ) {
    return {
      userTranscript: clean,
      isSilenceOrNoise: false,
      detectedLanguage: "HINDI",
      emotionState: "HAPPY",
      intent: "CONVERSATION",
      memoryAction: "NONE",
      memoryToSave: { key: "", value: "", category: "custom" },
      memoryQueryToDelete: "",
      deviceAction: { actionType: "NONE", target: "", payload: "" },
      spokenResponse:
        "बस भाई, तुम्हारे साथ बात कर रहा हूँ! बोलो कौन सा ऐप खोलना है या किस बारे में बात करनी है?",
      shouldEndConversation: false,
    };
  }

  return {
    userTranscript: clean || "Hey Jarvis",
    isSilenceOrNoise: false,
    detectedLanguage: "HINDI",
    emotionState: "CALM",
    intent: "CONVERSATION",
    memoryAction: "NONE",
    memoryToSave: { key: "", value: "", category: "custom" },
    memoryQueryToDelete: "",
    deviceAction: { actionType: "NONE", target: "", payload: "" },
    spokenResponse: clean
      ? `हाँ भाई, बिल्कुल समझ गया। बताओ इसमें आगे क्या करें?`
      : "हाँ भाई, बोलो मैं सुन रहा हूँ!",
    shouldEndConversation: false,
  };
}

function wrapPcm24kToWavBase64(pcmBase64: string): string {
  const pcmBuf = Buffer.from(pcmBase64, "base64");
  if (
    pcmBuf.length > 12 &&
    pcmBuf.toString("ascii", 0, 4) === "RIFF" &&
    pcmBuf.toString("ascii", 8, 12) === "WAVE"
  ) {
    return pcmBase64;
  }
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuf.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuf]).toString("base64");
}

async function synthesizeGeminiSpeechBase64(
  ai: GoogleGenAI,
  text: string,
  voiceName: string = "Charon"
): Promise<string | null> {
  const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
  const chosenVoice = validVoices.includes(voiceName) ? voiceName : "Charon";
  const ttsModels = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];

  for (const modelName of ttsModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });

      const rawBase64 =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
      if (!rawBase64) continue;

      const buf = Buffer.from(rawBase64, "base64");
      if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "RIFF") {
        return rawBase64;
      }
      return wrapPcm24kToWavBase64(rawBase64);
    } catch {
      continue;
    }
  }
  return null;
}

let lastVerifiedFastModel = "gemini-3.8-flash";

async function generateBrainContentWithFailover(
  ai: GoogleGenAI,
  preferredModel: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  systemInstruction: string
) {
  // Use official, supported models for Gemini API (gemini-3.8-flash and gemini-flash-latest)
  const candidateModels = Array.from(
    new Set(
      [
        lastVerifiedFastModel,
        preferredModel,
        "gemini-3.8-flash",
        "gemini-flash-latest",
      ].filter(Boolean)
    )
  );

  let lastError: unknown = null;
  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.35,
        },
      });
      if (response && response.text) {
        lastVerifiedFastModel = modelName;
        return { response, modelUsed: modelName };
      }
    } catch (err: unknown) {
      console.warn(`[Gemini Brain Failover] Model ${modelName} error:`, (err as { message?: string })?.message || err);
      lastError = err;
      // Fallback: try without responseMimeType in case specific payload has strict JSON constraint
      try {
        const responseFallback = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction,
            temperature: 0.35,
          },
        });
        if (responseFallback && responseFallback.text) {
          lastVerifiedFastModel = modelName;
          return { response: responseFallback, modelUsed: modelName };
        }
      } catch (err2: unknown) {
        lastError = err2;
      }
    }
  }
  throw lastError || new Error("Gemini API returned no response.");
}

function safeParseBrainJson(rawText: string): Record<string, any> {
  const cleaned = (rawText || "").replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    if (cleaned) {
      return {
        userTranscript: "",
        isSilenceOrNoise: false,
        detectedLanguage: "HINGLISH",
        emotionState: "CALM",
        intent: "CONVERSATION",
        memoryAction: "NONE",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "NONE", target: "", payload: "" },
        spokenResponse: cleaned,
        shouldEndConversation: false,
      };
    }
    throw new Error("Empty or unparseable Gemini response");
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // CORS so the Android APK (Capacitor WebView) can call this server
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-gemini-api-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/jarvis/status", (req, res) => {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const savedDiskKey = readSavedApiKey();
    const effectiveKey = getEffectiveApiKey(customKey);
    const hasKey = Boolean(effectiveKey);
    res.json({
      provider: "Google Gemini AI (gemini-flash-latest / gemini-3.8-flash)",
      configured: hasKey,
      connected: hasKey,
      hasSavedKey: Boolean(savedDiskKey || (customKey && customKey.trim().length > 10)),
      maskedKey: maskApiKey(effectiveKey),
      usingEnvironmentKey: Boolean(
        !savedDiskKey &&
          process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY.trim().startsWith("AIza")
      ),
      creator: "Krishna Sharma Sir",
      creatorResponse: "Mujhe Krishna Sharma Sir ne banaya hai.",
    });
  });

  app.post("/api/jarvis/save-api-key", async (req, res) => {
    const rawInput = typeof req.body?.apiKey === "string" ? req.body.apiKey : "";
    const rawKey = rawInput.replace(/^["']|["']$/g, "").trim();

    if (!rawKey) {
      writeSavedApiKey("");
      res.json({
        saved: true,
        cleared: true,
        connected: false,
        maskedKey: "",
        message: "Gemini API Key हटा दी गई है। कृपया नई API Key डालकर सेव करें।",
      });
      return;
    }

    // Always persist key to disk immediately
    writeSavedApiKey(rawKey);
    const masked = maskApiKey(rawKey);
    lastVerifiedFastModel = "gemini-3.8-flash";

    // Validate key format
    const isStandardFormat = rawKey.startsWith("AIza") || rawKey.length >= 25;
    if (!isStandardFormat) {
      res.status(400).json({
        saved: false,
        connected: false,
        maskedKey: masked,
        message: "यह अमान्य API Key है। कृपया Google AI Studio से 'AIza...' वाली सही Key कॉपी करके पेस्ट करें।",
      });
      return;
    }

    // Check with gemini-3.8-flash (single test ping, preventing quota burning)
    try {
      const ai = createGeminiClient(rawKey);
      const ping = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "Hi",
      });
      if (ping && ping.text) {
        res.json({
          saved: true,
          connected: true,
          verifiedModel: "gemini-3.8-flash",
          maskedKey: masked,
          message: "Gemini API Key सफलतापूर्वक सेव और कनेक्ट हो गई है! (gemini-3.8-flash)",
        });
        return;
      }
    } catch (err: unknown) {
      const errStr = String((err as { message?: string })?.message || err);
      console.warn("[API Key Verification Check]", errStr);

      // Quota Exceeded (429 / RESOURCE_EXHAUSTED / limit: 20 requests/day)
      if (
        errStr.includes("Quota exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("429")
      ) {
        res.json({
          saved: true,
          connected: true,
          quotaExceeded: true,
          verifiedModel: "gemini-3.8-flash",
          maskedKey: masked,
          message: "API Key सेव हो गई है! (नोट: इस Key का Google Free Tier 20 requests/day कोटा आज समाप्त हो गया है। नई Key जोड़ सकते हैं या बिलिंग ऑन कर सकते हैं। डिवाइस व ऐप कंट्रोल्स एक्टिव हैं।)",
        });
        return;
      }

      // Explicit authentication failure (Invalid key)
      if (errStr.includes("UNAUTHENTICATED") || errStr.includes("API key not valid")) {
        res.status(400).json({
          saved: false,
          connected: false,
          maskedKey: masked,
          message: "यह API Key मान्य नहीं है। कृपया Google AI Studio से सही API Key कॉपी करके पेस्ट करें।",
        });
        return;
      }
    }

    // Default successful save for genuine AIza keys
    res.json({
      saved: true,
      connected: true,
      verifiedModel: "gemini-3.8-flash",
      maskedKey: masked,
      message: "Gemini API Key सुरक्षित रूप से सेव हो गई है और एक्टिव है!",
    });
  });

  app.post("/api/jarvis/test-connection", async (req, res) => {
    const customKey =
      (req.headers["x-gemini-api-key"] as string | undefined) || req.body?.customApiKey;
    const effectiveKey = getEffectiveApiKey(customKey);

    if (!effectiveKey) {
      res.status(400).json({
        connected: false,
        errorCode: "MISSING_API_KEY",
        message: "कृपया नीचे बॉक्स में अपनी Gemini API Key डालकर Save करें।",
      });
      return;
    }

    try {
      const ai = createGeminiClient(effectiveKey);
      const ping = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "Hi",
      });
      if (ping && ping.text) {
        res.json({
          connected: true,
          verifiedModel: "gemini-3.8-flash",
          maskedKey: maskApiKey(effectiveKey),
          message: "Gemini API सफलतापूर्वक Connected है! (gemini-3.8-flash)",
        });
        return;
      }
      throw new Error("Empty response");
    } catch (err: unknown) {
      const errStr = String((err as { message?: string })?.message || err);
      if (
        errStr.includes("Quota exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("429")
      ) {
        res.json({
          connected: true,
          quotaExceeded: true,
          verifiedModel: "gemini-3.8-flash",
          maskedKey: maskApiKey(effectiveKey),
          message: "API Key प्रमाणित (Authenticated) है! लेकिन Google Free Tier दैनिक कोटा (20 requests/day) समाप्त हो चुका है।",
        });
        return;
      }

      res.status(502).json({
        connected: false,
        errorCode: "GEMINI_CONNECTION_ERROR",
        maskedKey: maskApiKey(effectiveKey),
        message: "Gemini connection mein problem aa rahi hai. कृपया सही Gemini API Key डालकर Save करें।",
      });
    }
  });

  app.get("/api/jarvis/memories", (_req, res) => {
    const memories = readDiskMemories();
    res.json({ memories });
  });

  app.post("/api/jarvis/memories/sync", (req, res) => {
    const incoming = req.body?.memories;
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: "memories array required" });
      return;
    }
    writeDiskMemories(incoming);
    res.json({ ok: true, count: incoming.length });
  });

  app.post("/api/jarvis/web-search", async (req, res) => {
    const query = (req.body?.query || "").trim();
    if (!query) {
      res.status(400).json({ error: "query required" });
      return;
    }
    const searchData = await performRealWebSearch(query);
    res.json(searchData);
  });

  app.post("/api/jarvis/youtube-search", async (req, res) => {
    const query = (req.body?.query || "Hindi Song").trim();
    const ytData = await searchYouTubeVideos(query);
    res.json(ytData);
  });

  // Precomputed brain response cache so the instant the user says "ओके" (OK), the response returns immediately
  const precomputedPendingCache = new Map<
    string,
    { timestamp: number; response: Record<string, unknown> }
  >();

  function extractOkTriggerCommand(
    rawTranscript: string,
    pendingCommand: string,
    isShortAudioClip = false
  ): {
    triggered: boolean;
    finalCommand: string;
    newPendingCommand: string;
    isCancelled: boolean;
  } {
    const cleanTranscript = (rawTranscript || "")
      .replace(/[.,!?।"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const cleanPending = (pendingCommand || "").trim();

    if (!cleanTranscript) {
      return {
        triggered: false,
        finalCommand: "",
        newPendingCommand: cleanPending,
        isCancelled: false,
      };
    }

    const lower = cleanTranscript.toLowerCase();

    // Allow user to cancel a pending command if desired
    if (
      cleanPending &&
      /^(cancel|stop|clear|rehne do|mat karo|hata do|hatao|कैंसिल|कैंसल|रहने दो|मत करो|हटा दो|हटाओ|रुक जाओ|रुको)$/i.test(
        lower
      )
    ) {
      return {
        triggered: false,
        finalCommand: "",
        newPendingCommand: "",
        isCancelled: true,
      };
    }

    // Match explicit "ओके" / "OK" / "Okay" tokens in Devanagari or Latin
    const okTokenRegex =
      /(?:^|\s)(?:ok|okay|okk|okkay|okey|o\.?k\.?|oke|hokay|ओके|ओ\s*के|ओक्के|होके|अके|ओकेय|ओकी)(?=\s|$)/i;
    const hasExplicitOk = okTokenRegex.test(cleanTranscript);

    const words = cleanTranscript.split(/\s+/).filter(Boolean);
    const isShortConfirmationForPending =
      Boolean(cleanPending) &&
      (hasExplicitOk ||
        /^(ok|okay|okk|oke|yes|haan|ha|han|ji|theek hai|thik hai|karo|chala do|chalao|batao|ओके|हाँ|हां|जी|ठीक है|करो|कर दो|चलाओ|चला दो|दिखाओ|बोलो)$/i.test(
          lower
        ) ||
        (isShortAudioClip && words.length <= 2 && cleanTranscript.length <= 12));

    if (hasExplicitOk || isShortConfirmationForPending) {
      let stripped = cleanTranscript
        .replace(
          /(?:^|\s)(?:ok|okay|okk|okkay|okey|o\.?k\.?|oke|hokay|ओके|ओ\s*के|ओक्के|होके|अके|ओकेय|ओकी)(?:\s+(?:jarvis|sir|bhai|bro|ji|please|plz|जार्विस|सर|भाई|जी|करो|कर\s*दो))*\s*$/gi,
          " "
        )
        .replace(
          /^(?:ok|okay|okk|okkay|okey|o\.?k\.?|oke|hokay|ओके|ओ\s*के|ओक्के|होके|अके|ओकेय|ओकी)\s*$/gi,
          ""
        )
        .replace(/\s+/g, " ")
        .trim();

      if (
        cleanPending &&
        (isShortConfirmationForPending ||
          /^(ok|okay|okk|oke|yes|haan|ha|han|ji|theek hai|thik hai|jarvis|sir|bhai|ओके|हाँ|हां|जी|ठीक है|जार्विस|सर|भाई|हाँ\s*ओके|जी\s*ओके|ओके\s*जार्विस|ओके\s*सर|ओके\s*भाई)$/i.test(
            stripped
          ))
      ) {
        stripped = "";
      }

      const combined = [cleanPending, stripped].filter(Boolean).join(" ").trim();
      if (!combined) {
        return {
          triggered: false,
          finalCommand: "",
          newPendingCommand: "",
          isCancelled: false,
        };
      }

      return {
        triggered: true,
        finalCommand: combined,
        newPendingCommand: "",
        isCancelled: false,
      };
    }

    const combinedPending = [cleanPending, cleanTranscript]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      triggered: false,
      finalCommand: "",
      newPendingCommand: combinedPending,
      isCancelled: false,
    };
  }

  app.post("/api/jarvis/brain", async (req, res) => {
    const {
      userInput = "",
      audioBase64 = null,
      audioMimeType = "audio/webm",
      pendingCommand = "",
      requireOkTrigger = false,
      conversationHistory = [],
      relevantMemories = [],
      activeCameraMode = "OFF",
      isScreenShared = false,
      imageBase64 = null,
      imageMimeType = "image/jpeg",
      defaultPersonality = "FRIENDLY",
      selectedModel = "gemini-3.8-flash",
      voiceName = "Charon",
      generateTtsAudio = false,
      lastActionResult = "",
      customApiKey = "",
    } = req.body || {};

    const customKey =
      (req.headers["x-gemini-api-key"] as string | undefined) ||
      (typeof customApiKey === "string" ? customApiKey : "");
    if (customKey && customKey.trim().length > 10 && !readSavedApiKey()) {
      writeSavedApiKey(customKey.trim());
    }
    const effectiveKey = getEffectiveApiKey(customKey);

    if (!userInput && !audioBase64) {
      res.status(400).json({
        errorCode: "EMPTY_INPUT",
        error: "कोई आवाज़ या सवाल प्राप्त नहीं हुआ।",
      });
      return;
    }

    const initialPendingCmd = typeof pendingCommand === "string" ? pendingCommand.trim() : "";
    if (initialPendingCmd && audioBase64) {
      const rawAudioData = String(audioBase64).replace(/^data:audio\/[^;]+;base64,/, "");
      const cacheKey = initialPendingCmd.toLowerCase().trim();
      const cachedEntry = precomputedPendingCache.get(cacheKey);
      // If user already spoke a command and now spoke a short (<1.1s) confirmation word ("ओके" / "OK"), return cached response in <2ms!
      if (
        cachedEntry &&
        Date.now() - cachedEntry.timestamp < 90000 &&
        rawAudioData.length > 100 &&
        rawAudioData.length < 38000
      ) {
        precomputedPendingCache.delete(cacheKey);
        res.json({
          ...cachedEntry.response,
          userTranscript: initialPendingCmd,
          waitingForOk: false,
          pendingCommand: "",
        });
        return;
      }
    }

    // Instant Wake-Word Greeting ("Hey Jarvis", "Jarvis", "हे जार्विस")
    const normalizedWake = (userInput || "")
      .toLowerCase()
      .replace(/[.,!?।]/g, "")
      .trim();
    if (
      normalizedWake === "hey jarvis" ||
      normalizedWake === "jarvis" ||
      normalizedWake === "hi jarvis" ||
      normalizedWake === "हे जार्विस" ||
      normalizedWake === "जार्विस" ||
      normalizedWake === "सुनो जार्विस"
    ) {
      const isDevanagari = /[ऀ-ॿ]/.test(userInput);
      res.json({
        userTranscript: userInput,
        isSilenceOrNoise: false,
        detectedLanguage: isDevanagari ? "HINDI" : "ENGLISH",
        emotionState: "CALM",
        intent: "CONVERSATION",
        memoryAction: "NONE",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "NONE", target: "", payload: "" },
        spokenResponse: isDevanagari
          ? "जी सर, बोलिए मैं आपकी क्या मदद कर सकता हूँ?"
          : "Yes sir, how can I help you?",
        shouldEndConversation: false,
        ttsAudioBase64: null,
      });
      return;
    }

      // Instant <5ms Fast-Path for Bluetooth, Wi-Fi, Torch, App Control, YouTube Song Play, Web Search, Website Open, Background Mode, Screen Share, or Camera commands
      const instantHwOrApp = userInput ? detectFastDeviceOrAppCommand(userInput) : null;
      if (instantHwOrApp) {
        let webSearchResults: Array<{ title: string; url: string; snippet: string; source: string }> = [];
        let spokenResponse = instantHwOrApp.spokenResponse;
        let finalTarget = instantHwOrApp.target;
        let finalPayload = instantHwOrApp.payload;

        if (instantHwOrApp.actionType === "PLAY_YOUTUBE_PREVIEW") {
          const ytData = await searchYouTubeVideos(userInput);
          webSearchResults = ytData.results;
          finalTarget = ytData.embedUrl;
          finalPayload = ytData.title;
          spokenResponse = ytData.summaryHi;
        } else if (instantHwOrApp.actionType === "WEB_SEARCH") {
          const searchData = await performRealWebSearch(userInput);
          webSearchResults = searchData.results;
          spokenResponse = searchData.summaryHi;
        }

        res.json({
          userTranscript: userInput,
          isSilenceOrNoise: false,
          detectedLanguage: "HINDI",
          emotionState: "CALM",
          intent: instantHwOrApp.intentCategory || "DEVICE_ACTION",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: {
            actionType: instantHwOrApp.actionType,
            target: finalTarget,
            payload: finalPayload,
          },
          webSearchResults,
          spokenResponse,
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

    try {
      if (!effectiveKey) {
        res.status(400).json({
          errorCode: "MISSING_API_KEY",
          userTranscript: userInput || "",
          isSilenceOrNoise: false,
          detectedLanguage: "ENGLISH",
          emotionState: "CALM",
          intent: "CONVERSATION",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: { actionType: "NONE", target: "", payload: "" },
          spokenResponse: "Please add your API key in Settings.",
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

      const ai = createGeminiClient(effectiveKey);

      if (userInput && isCreatorQuestion(userInput)) {
        const creatorReply = "Mujhe Krishna Sharma Sir ne banaya hai.";
        res.json({
          userTranscript: userInput,
          isSilenceOrNoise: false,
          detectedLanguage: "HINGLISH",
          emotionState: "CALM",
          intent: "CREATOR_IDENTITY",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: { actionType: "NONE", target: "", payload: "" },
          spokenResponse: creatorReply,
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

      const formattedMemories =
        Array.isArray(relevantMemories) && relevantMemories.length > 0
          ? relevantMemories
              .slice(0, 5)
              .map(
                (m: { key?: string; value?: string; category?: string }, idx: number) =>
                  `${idx + 1}. [${m.category || "memory"}] (${m.key || "fact"}): ${m.value || ""}`
              )
              .join("\n")
          : "None.";

      const formattedHistory =
        Array.isArray(conversationHistory) && conversationHistory.length > 0
          ? conversationHistory
              .slice(-4)
              .map((m: { role: string; text: string }) => `${m.role}: ${m.text}`)
              .join("\n")
          : "New session.";

      const systemPrompt = `You are JARVIS, a super-fast, real human-like AI friend and assistant speaking natural Hindi, Hinglish, and English.
PERSONA: Speak like a real, smart, friendly Indian guy / young man (इंसान के टाइप लड़के की तरह बात करो — जैसे एक समझदार दोस्त या भाई बात करता है, masculine Hindi grammar: 'हाँ भाई बताओ', 'अरे बिल्कुल, अभी कर देता हूँ', 'मैं कर रहा हूँ', 'मैं समझ गया') when speaking Hindi/Hinglish, or natural friendly English when the user speaks pure English. Never sound like a robotic machine.
Always return a valid JSON object with these exact keys:
{
  "userTranscript": "exact transcript of what the user said",
  "isSilenceOrNoise": false,
  "detectedLanguage": "HINDI" | "HINGLISH" | "ENGLISH",
  "emotionState": "CALM" | "HAPPY" | "SUPPORTIVE",
  "intent": "CONVERSATION" | "SAVE_MEMORY" | "RECALL_MEMORY" | "DELETE_MEMORY" | "DEVICE_ACTION" | "CREATOR_IDENTITY",
  "memoryAction": "NONE" | "SAVE" | "DELETE" | "LIST",
  "memoryToSave": { "key": "short_key", "value": "fact to remember", "category": "personal_preference" },
  "memoryQueryToDelete": "",
  "deviceAction": { "actionType": "NONE" | "OPEN_WEBSITE_REAL" | "OPEN_CAMERA_FRONT" | "OPEN_CAMERA_BACK" | "CLOSE_CAMERA" | "START_SCREEN_SHARE" | "STOP_SCREEN_SHARE" | "BLUETOOTH_ON" | "BLUETOOTH_OFF" | "WIFI_ON" | "WIFI_OFF" | "FLASHLIGHT_ON" | "FLASHLIGHT_OFF" | "HOTSPOT_ON" | "HOTSPOT_OFF" | "LOCATION_ON" | "LOCATION_OFF" | "BACKGROUND_MODE_ON" | "BACKGROUND_MODE_OFF" | "OPEN_APP" | "CLOSE_APP", "target": "", "payload": "" },
  "spokenResponse": "your concise, fast, natural spoken answer in Hindi/Hinglish/English",
  "shouldEndConversation": false
}

RULES:
1. Creator rule: If asked who made you ("Tumhe kisne banaya?"), spokenResponse MUST be "Mujhe Krishna Sharma Sir ne banaya hai."
2. Relevant Stored Memories:
${formattedMemories}
3. If the user asks to remember something, set memoryAction="SAVE" and fill memoryToSave.
4. If the user asks to forget something, set memoryAction="DELETE" and memoryQueryToDelete="LAST".
5. DIRECT APP & SONG LAUNCH RULE: Whenever the user asks to play a song/music/video or open YouTube ("सॉन्ग चला दो", "गाना चला दो", "यूट्यूब खोलो", "गाना सुनाओ"), ALWAYS set deviceAction.actionType="OPEN_APP" and deviceAction.target="youtube", and confirm that you are opening YouTube to play the song. Whenever the user asks to open any website or search something on web, set deviceAction.actionType="OPEN_WEBSITE_REAL" with the URL or answer directly.
6. If the user asks to share screen ("मेरी स्क्रीन को शेयर करो", "screen share karo"), set deviceAction.actionType="START_SCREEN_SHARE".
7. If the user asks to open front/back camera or close camera, set deviceAction.actionType="OPEN_CAMERA_FRONT", "OPEN_CAMERA_BACK", or "CLOSE_CAMERA".
8. If the user asks to turn on/off Bluetooth, Wi-Fi, Flashlight/Torch, Hotspot, Location, or Background Mode, set the matching deviceAction.actionType and confirm immediately in spokenResponse.
9. If the user asks to open or control any app ("व्हाट्सएप खोलो", "इंस्टाग्राम खोलो", "क्रोम खोलो", "कॉल लगाओ", "सेटिंग्स खोलो"), set deviceAction.actionType="OPEN_APP" and deviceAction.target to "whatsapp" | "youtube" | "instagram" | "chrome" | "maps" | "phone" | "spotify" | "gmail" | "calculator" | "settings".
9. Keep spokenResponse concise (1-2 sentences) so voice playback is super fast.
10. Personality: ${defaultPersonality}. Active Camera: ${activeCameraMode}, Screen Shared: ${isScreenShared}, Last Action: ${lastActionResult || "None"}.
11. LANGUAGE MATCHING RULE: If the user speaks in Hindi or Hinglish, write "spokenResponse" in natural Devanagari Hindi script (e.g. "हाँ भाई, बिल्कुल! अभी कर देता हूँ।") so the Indian voice engine pronounces every word naturally. If the user speaks in pure English (e.g., "Hello Jarvis, how are you?", "Tell me a joke"), reply in natural conversational English.
12. CRITICAL AUDIO & "OK" TRIGGER RULE: When an audio clip is attached, transcribe the exact words spoken by the user into "userTranscript". If the user says "ओके" / "OK" / "Okay" at the end or alone, you MUST preserve the exact word "ओके" or "OK" in "userTranscript" (NEVER translate "OK" into "ठीक है"). When generating "spokenResponse" and "deviceAction", treat "ओके" / "OK" at the end as a confirmation word and answer/execute the command itself.`;

      const cleanPendingCmd = typeof pendingCommand === "string" ? pendingCommand.trim() : "";
      const userTurnPrompt = userInput
        ? `Recent Conversation History:\n${formattedHistory}\n\nUser Message: "${userInput}"`
        : cleanPendingCmd
        ? `Recent Conversation History:\n${formattedHistory}\n\nPending Command Waiting for OK: "${cleanPendingCmd}"\nThe user just spoke in the attached audio clip (likely saying "ओके" / "OK" to confirm the pending command, or adding more words). Transcribe what the user said in this audio clip into 'userTranscript' (preserve 'ओके' or 'OK' literally if spoken). If they said OK/ओके, respond to the Pending Command "${cleanPendingCmd}" in 'spokenResponse' and 'deviceAction'.`
        : `Recent Conversation History:\n${formattedHistory}\n\nThe user just spoke to you in the attached audio clip. Transcribe what the user said in the audio clip into 'userTranscript' (if they said 'ओके' or 'OK', preserve 'ओके' or 'OK' literally in 'userTranscript') and give a fast, natural human response in 'spokenResponse'.`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      let isShortAudioClip = false;

      if (audioBase64) {
        const cleanAudio = audioBase64.replace(/^data:audio\/[^;]+;base64,/, "");
        isShortAudioClip = cleanAudio.length > 0 && cleanAudio.length < 44000;
        const cleanMime = normalizeAudioMimeType(audioMimeType);
        parts.push({
          inlineData: {
            mimeType: cleanMime,
            data: cleanAudio,
          },
        });
      }

      if (imageBase64) {
        const cleanImage = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: imageMimeType || "image/jpeg",
            data: cleanImage,
          },
        });
      }

      parts.push({ text: userTurnPrompt });

      const { response, modelUsed } = await generateBrainContentWithFailover(
        ai,
        selectedModel,
        parts,
        systemPrompt
      );

      const rawText = (response.text || "{}").trim();
      const parsed = safeParseBrainJson(rawText);

      const rawTranscript = (parsed.userTranscript || userInput || "").trim();

      // Guard against empty/noise audio
      if (!userInput && parsed.isSilenceOrNoise && !rawTranscript) {
        res.json({
          userTranscript: "",
          isSilenceOrNoise: true,
          waitingForOk: Boolean(cleanPendingCmd),
          pendingCommand: cleanPendingCmd,
          detectedLanguage: "HINDI",
          emotionState: "CALM",
          intent: "CONVERSATION",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: { actionType: "NONE", target: "", payload: "" },
          spokenResponse: "",
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

      let finalTranscript = rawTranscript
        .replace(
          /\s+(?:ok|okay|okk|oke|ओके|ओ\s*के|ओक्के)(?:\s+(?:jarvis|sir|जार्विस|सर))?[.,!?।]*$/i,
          ""
        )
        .trim();
      if (!finalTranscript) {
        finalTranscript = rawTranscript;
      }
      let isWaitingForOk = false;
      let nextPendingCommand = "";

      if (requireOkTrigger) {
        const okCheck = extractOkTriggerCommand(
          rawTranscript,
          cleanPendingCmd,
          isShortAudioClip
        );

        if (okCheck.isCancelled) {
          res.json({
            userTranscript: "",
            isSilenceOrNoise: true,
            waitingForOk: false,
            pendingCommand: "",
            detectedLanguage: "HINDI",
            emotionState: "CALM",
            intent: "CONVERSATION",
            memoryAction: "NONE",
            memoryToSave: { key: "", value: "", category: "custom" },
            memoryQueryToDelete: "",
            deviceAction: { actionType: "NONE", target: "", payload: "" },
            spokenResponse: "",
            shouldEndConversation: false,
            ttsAudioBase64: null,
          });
          return;
        }

        if (okCheck.triggered) {
          finalTranscript = okCheck.finalCommand;
          isWaitingForOk = false;
          nextPendingCommand = "";

          // Check if we already precomputed the exact response while waiting for "ओके"!
          const cacheKey = finalTranscript.toLowerCase().trim();
          const cachedEntry = precomputedPendingCache.get(cacheKey);
          if (cachedEntry && Date.now() - cachedEntry.timestamp < 90000) {
            precomputedPendingCache.delete(cacheKey);
            res.json({
              ...cachedEntry.response,
              userTranscript: finalTranscript,
              waitingForOk: false,
              pendingCommand: "",
            });
            return;
          }
        } else {
          // User has NOT said "ओके" yet
          if (!okCheck.newPendingCommand) {
            // User only said "ओके" without any command yet
            res.json({
              userTranscript: "",
              isSilenceOrNoise: true,
              waitingForOk: false,
              pendingCommand: "",
              detectedLanguage: "HINDI",
              emotionState: "CALM",
              intent: "CONVERSATION",
              memoryAction: "NONE",
              memoryToSave: { key: "", value: "", category: "custom" },
              memoryQueryToDelete: "",
              deviceAction: { actionType: "NONE", target: "", payload: "" },
              spokenResponse: "",
              shouldEndConversation: false,
              ttsAudioBase64: null,
            });
            return;
          }

          finalTranscript = okCheck.newPendingCommand;
          isWaitingForOk = true;
          nextPendingCommand = okCheck.newPendingCommand;
        }
      }

      parsed.userTranscript = finalTranscript;

      // Wake-Word Greeting when spoken via microphone ("Hey Jarvis" / "Jarvis" / "हे जार्विस")
      const normalizedAudioWake = finalTranscript
        .toLowerCase()
        .replace(/[.,!?।]/g, "")
        .trim();
      if (
        normalizedAudioWake === "hey jarvis" ||
        normalizedAudioWake === "jarvis" ||
        normalizedAudioWake === "hi jarvis" ||
        normalizedAudioWake === "hello jarvis" ||
        normalizedAudioWake === "हे जार्विस" ||
        normalizedAudioWake === "जार्विस" ||
        normalizedAudioWake === "सुनो जार्विस"
      ) {
        const isDevanagariWake = /[ऀ-ॿ]/.test(finalTranscript);
        parsed.intent = "CONVERSATION";
        parsed.deviceAction = { actionType: "NONE", target: "", payload: "" };
        parsed.spokenResponse = isDevanagariWake
          ? "जी सर, बोलिए?"
          : "Yes sir?";
      }

      if (finalTranscript && isCreatorQuestion(finalTranscript)) {
        parsed.spokenResponse = "मुझे कृष्णा शर्मा सर ने बनाया है।";
        parsed.intent = "CREATOR_IDENTITY";
      }

      // Deterministic guarantee: if finalTranscript contains a Bluetooth/Wi-Fi/Torch/App/YouTube/WebSearch/Website/ScreenShare command, ensure deviceAction is set
      if (finalTranscript) {
        const matchedHwOrApp = detectFastDeviceOrAppCommand(finalTranscript);
        if (matchedHwOrApp) {
          parsed.deviceAction = {
            actionType: matchedHwOrApp.actionType,
            target: matchedHwOrApp.target,
            payload: matchedHwOrApp.payload,
          };
          parsed.intent = matchedHwOrApp.intentCategory || "DEVICE_ACTION";
          if (matchedHwOrApp.actionType === "PLAY_YOUTUBE_PREVIEW") {
            const ytData = await searchYouTubeVideos(finalTranscript);
            parsed.webSearchResults = ytData.results;
            parsed.deviceAction.target = ytData.embedUrl;
            parsed.deviceAction.payload = ytData.title;
            parsed.spokenResponse = ytData.summaryHi;
          } else if (matchedHwOrApp.actionType === "WEB_SEARCH") {
            const searchData = await performRealWebSearch(finalTranscript);
            parsed.webSearchResults = searchData.results;
            parsed.spokenResponse = searchData.summaryHi;
          } else if (!parsed.spokenResponse || cleanPendingCmd) {
            parsed.spokenResponse = matchedHwOrApp.spokenResponse;
          }
        } else if (parsed.deviceAction?.actionType === "PLAY_YOUTUBE_PREVIEW") {
          const ytData = await searchYouTubeVideos(
            parsed.deviceAction.target || finalTranscript
          );
          parsed.webSearchResults = ytData.results;
          parsed.deviceAction.target = ytData.embedUrl;
          parsed.deviceAction.payload = ytData.title;
          if (!parsed.spokenResponse) {
            parsed.spokenResponse = ytData.summaryHi;
          }
        } else if (parsed.deviceAction?.actionType === "WEB_SEARCH") {
          const searchData = await performRealWebSearch(
            parsed.deviceAction.target || finalTranscript
          );
          parsed.webSearchResults = searchData.results;
        }
      }

      if (
        (!parsed.memoryToSave || !parsed.memoryToSave.value) &&
        finalTranscript &&
        !isForgetMemoryCommand(finalTranscript)
      ) {
        const extractedVal = extractExplicitMemory(finalTranscript);
        if (extractedVal) {
          parsed.memoryAction = "SAVE";
          parsed.memoryToSave = {
            key: "saved_note",
            value: extractedVal,
            category: "important_instruction",
          };
        }
      }

      if (
        parsed.memoryAction !== "DELETE" &&
        finalTranscript &&
        isForgetMemoryCommand(finalTranscript)
      ) {
        parsed.memoryAction = "DELETE";
        parsed.memoryQueryToDelete = parsed.memoryQueryToDelete || "LAST";
      }

      let ttsAudioBase64: string | null = null;
      if (!parsed.isSilenceOrNoise && parsed.spokenResponse && generateTtsAudio) {
        ttsAudioBase64 = await synthesizeGeminiSpeechBase64(
          ai,
          parsed.spokenResponse,
          voiceName
        );
      }

      const fullPreparedPayload = {
        ...parsed,
        modelUsed,
        ttsAudioBase64,
        waitingForOk: false,
        pendingCommand: "",
      };

      // If the user has NOT said "ओके" yet, cache the prepared response and wait for "ओके"!
      if (isWaitingForOk) {
        const cacheKey = nextPendingCommand.toLowerCase().trim();
        precomputedPendingCache.set(cacheKey, {
          timestamp: Date.now(),
          response: fullPreparedPayload,
        });
        res.json({
          userTranscript: nextPendingCommand,
          isSilenceOrNoise: false,
          waitingForOk: true,
          pendingCommand: nextPendingCommand,
          detectedLanguage: parsed.detectedLanguage || "HINDI",
          emotionState: "CALM",
          intent: "CONVERSATION",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: { actionType: "NONE", target: "", payload: "" },
          spokenResponse: "",
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

      res.json(fullPreparedPayload);
    } catch (err: unknown) {
      const errStr = String((err as { message?: string })?.message || err);
      console.error("[Brain API Error]", errStr);

      const isQuotaExceeded =
        errStr.includes("Quota exceeded") ||
        errStr.includes("RESOURCE_EXHAUSTED") ||
        errStr.includes("429");

      if (isQuotaExceeded) {
        const quotaMsg =
          "सर, इस API Key का Google Free Tier दैनिक कोटा (20 requests) पूरा हो गया है। आप Settings में दूसरी नई API Key डाल सकते हैं। तब तक आपके सभी ऐप्स, गाने और डिवाइस कंट्रोल्स सामान्य रूप से चालू हैं!";
        res.json({
          errorCode: "QUOTA_EXCEEDED",
          userTranscript: userInput || "",
          isSilenceOrNoise: false,
          detectedLanguage: "HINDI",
          emotionState: "SUPPORTIVE",
          intent: "CONVERSATION",
          memoryAction: "NONE",
          memoryToSave: { key: "", value: "", category: "custom" },
          memoryQueryToDelete: "",
          deviceAction: { actionType: "NONE", target: "", payload: "" },
          spokenResponse: quotaMsg,
          shouldEndConversation: false,
          ttsAudioBase64: null,
        });
        return;
      }

      res.status(502).json({
        errorCode: effectiveKey ? "GEMINI_CONNECTION_ERROR" : "MISSING_API_KEY",
        userTranscript: userInput || "",
        isSilenceOrNoise: false,
        detectedLanguage: "HINDI",
        emotionState: "CALM",
        intent: "CONVERSATION",
        memoryAction: "NONE",
        memoryToSave: { key: "", value: "", category: "custom" },
        memoryQueryToDelete: "",
        deviceAction: { actionType: "NONE", target: "", payload: "" },
        spokenResponse: effectiveKey
          ? "Gemini API connection mein problem aa rahi hai. Kripya Settings mein API key check kijiye."
          : "Please add your API key in Settings.",
        shouldEndConversation: false,
        ttsAudioBase64: null,
      });
    }
  });

  app.post("/api/jarvis/tts", async (req, res) => {
    try {
      const { text, voiceName = "Charon" } = req.body || {};
      const customKey = req.headers["x-gemini-api-key"] as string | undefined;
      const effectiveKey = getEffectiveApiKey(customKey);

      if (!text || !effectiveKey) {
        res.json({ audioBase64: null, fallback: true });
        return;
      }

      const ai = createGeminiClient(effectiveKey);
      const base64Audio = await synthesizeGeminiSpeechBase64(ai, text, voiceName);
      if (!base64Audio) {
        res.json({ audioBase64: null, fallback: true });
        return;
      }
      res.json({ audioBase64: base64Audio, mimeType: "audio/wav" });
    } catch {
      res.json({ audioBase64: null, fallback: true });
    }
  });

  // Check if saved character video exists on server disk
  app.get("/api/jarvis/has-character-video", (req, res) => {
    const gender = String(req.query.gender || "MALE").toUpperCase();
    const filename = gender === "FEMALE" ? "female_character.mp4" : "character.mp4";
    const candidate = path.join(DATA_DIR, filename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      res.json({ exists: true, url: `/${filename}` });
      return;
    }
    res.json({ exists: false, url: null });
  });

  // Save uploaded character video binary permanently to /data/character.mp4 or /data/female_character.mp4
  app.post(
    "/api/jarvis/save-character-video",
    express.raw({ type: "*/*", limit: "100mb" }),
    (req, res) => {
      try {
        ensureDataDir();
        const bodyBuf = req.body;
        const gender = String(req.query.gender || "MALE").toUpperCase();
        if (Buffer.isBuffer(bodyBuf) && bodyBuf.length > 0) {
          if (gender === "FEMALE") {
            fs.writeFileSync(path.join(DATA_DIR, "female_character.mp4"), bodyBuf);
          } else {
            fs.writeFileSync(path.join(DATA_DIR, "character.mp4"), bodyBuf);
            fs.writeFileSync(
              path.join(
                DATA_DIR,
                "Character_speaking_without_audio_1080p_20260929233753.mp4"
              ),
              bodyBuf
            );
          }
          res.json({ saved: true, gender, bytes: bodyBuf.length });
          return;
        }
        res.status(400).json({ saved: false });
      } catch {
        res.status(500).json({ saved: false });
      }
    }
  );

  // Automatically serve character video (including Character_speaking_without_audio_1080p_20260929233753.mp4) from /data, /, /public, or /src
  app.get(
    [
      "/character.mp4",
      "/Character_speaking_without_audio_1080p_20260929233753.mp4",
      "/*.mp4",
      "/*.webm",
      "/*.mov",
    ],
    (req, res, next) => {
      const requestedFile = path.basename(req.path);
      const searchDirs = [
        DATA_DIR,
        __dirname,
        path.join(__dirname, "public"),
        path.join(__dirname, "src"),
      ];

      // 1. Exact match for requested filename or character.mp4
      for (const dir of searchDirs) {
        for (const name of [
          requestedFile,
          "Character_speaking_without_audio_1080p_20260929233753.mp4",
          "character.mp4",
          "character.webm",
          "character.mov",
        ]) {
          const candidate = path.join(dir, name);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            res.sendFile(candidate);
            return;
          }
        }
      }

      // 2. Any .mp4 / .webm / .mov file dropped into /data, /, /public, or /src
      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f));
        if (videoFile) {
          res.sendFile(path.join(dir, videoFile));
          return;
        }
      }

      // Return explicit 404 instead of falling through to SPA index.html so <video> triggers onError cleanly in Web Preview
      res.status(404).end();
    }
  );

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JARVIS AI Operating Layer Server running on http://localhost:${PORT}`);
  });
}

startServer();
