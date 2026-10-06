# JARVIS APK बनाने के स्टेप

## पहले से चाहिए (PC पर)
- Node.js 20+  
- Android Studio (इसी के साथ JDK 17 और Android SDK आ जाता है)

## 1. Server होस्ट करें (APK को API चाहिए)
APK के अंदर Express server नहीं चलता। इसलिए `server.ts` को कहीं होस्ट करें (Render / Railway / Google Cloud Run)।
- Build command: `npm install && npm run build`
- Start command: `NODE_ENV=production npm start`
- होस्ट होने के बाद आपको एक https URL मिलेगा।

## 2. URL सेट करें
`.env.production.example` को `.env.production` नाम से कॉपी करें और `VITE_API_BASE` में वही URL डालें।

## 3. Web build
```
npm install
npm run build
```

## 4. Android प्रोजेक्ट बनाएँ
```
npm run cap:add
npm run cap:native
npm run cap:sync
```
(`cap:native` हमारी Java फाइलें, permissions और background/RGB services जोड़ता है।)

## 5. APK बनाएँ
**Android Studio से:** `npx cap open android` → Build → Build Bundle(s)/APK(s) → Build APK(s)  
**या command से:**
```
cd android
./gradlew assembleDebug        (Windows: gradlew.bat assembleDebug)
```
APK यहाँ मिलेगा: `android/app/build/outputs/apk/debug/app-debug.apk`

## 6. फोन में इंस्टॉल
APK फोन में भेजकर इंस्टॉल करें (Unknown sources allow करना होगा)।  
पहली बार खोलने पर: API Key → सभी Permissions। फिर Settings में जाकर **"Display over other apps"** और **Accessibility** के लिए "Open" दबाकर allow करें।

## ध्यान दें
- `data/character.mp4` फाइलें इस ज़िप में 0 byte की हैं। अपनी असली वीडियो server के `data/` फोल्डर में रखें।
- Background में mic WebView से चलना कुछ फोन (Xiaomi, Vivo, Oppo) में battery-saver की वजह से रुक सकता है। उसके लिए फोन में JARVIS को "Battery: No restrictions" दें।
- Home/Back जैसे Accessibility actions के लिए अलग AccessibilityService चाहिए, यह इस Capacitor APK में शामिल नहीं है।
