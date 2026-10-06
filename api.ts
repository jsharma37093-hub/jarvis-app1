// In the browser / AI Studio the API is same-origin. In the Android APK (Capacitor)
// set VITE_API_BASE=https://your-server-url before `npm run build`.
const BASE: string = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE || '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return BASE ? `${BASE}${path}` : path;
}
