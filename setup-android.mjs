// Run AFTER `npx cap add android`:  node android-native/setup-android.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const javaDir = path.join(root, 'android/app/src/main/java/com/krishnasharma/jarvis');
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error('android/ folder not found. Run: npx cap add android');
  process.exit(1);
}
fs.mkdirSync(javaDir, { recursive: true });
for (const f of ['JarvisBridge.java', 'JarvisForegroundService.java', 'JarvisOverlayService.java', 'MainActivity.java']) {
  fs.copyFileSync(path.join(here, f), path.join(javaDir, f));
}

let m = fs.readFileSync(manifestPath, 'utf8');
if (!m.includes('JarvisForegroundService')) {
  const perms = [
    'INTERNET', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS',
    'CALL_PHONE', 'SEND_SMS', 'POST_NOTIFICATIONS', 'BLUETOOTH_CONNECT', 'FOREGROUND_SERVICE',
    'FOREGROUND_SERVICE_MICROPHONE', 'SYSTEM_ALERT_WINDOW', 'WAKE_LOCK', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  ].filter((p) => !m.includes(`android.permission.${p}"`))
   .map((p) => `    <uses-permission android:name="android.permission.${p}" />`).join('\n');
  const services =
    '        <service android:name=".JarvisForegroundService" android:exported="false" android:foregroundServiceType="microphone" />\n' +
    '        <service android:name=".JarvisOverlayService" android:exported="false" />\n';
  m = m.replace('</application>', services + '    </application>');
  m = m.replace('</manifest>', perms + '\n</manifest>');
  fs.writeFileSync(manifestPath, m);
}
console.log('JARVIS native files + manifest patched. Now: cd android && ./gradlew assembleDebug');
