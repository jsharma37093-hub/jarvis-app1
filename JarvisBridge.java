package com.krishnasharma.jarvis;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;

/** Exposed to the web app as window.JarvisAndroid */
public class JarvisBridge {
    private final Activity act;
    public JarvisBridge(Activity a) { act = a; }

    @JavascriptInterface
    public void requestAllPermissions() {
        act.runOnUiThread(() -> {
            ArrayList<String> p = new ArrayList<>();
            p.add(Manifest.permission.RECORD_AUDIO);
            p.add(Manifest.permission.CAMERA);
            p.add(Manifest.permission.ACCESS_FINE_LOCATION);
            p.add(Manifest.permission.READ_CONTACTS);
            p.add(Manifest.permission.CALL_PHONE);
            p.add(Manifest.permission.SEND_SMS);
            if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS);
            if (Build.VERSION.SDK_INT >= 31) p.add(Manifest.permission.BLUETOOTH_CONNECT);
            ArrayList<String> need = new ArrayList<>();
            for (String s : p)
                if (ContextCompat.checkSelfPermission(act, s) != android.content.pm.PackageManager.PERMISSION_GRANTED) need.add(s);
            if (!need.isEmpty()) ActivityCompat.requestPermissions(act, need.toArray(new String[0]), 77);
        });
    }

    @JavascriptInterface
    public void openSpecialSettings(String id) {
        Intent i;
        if ("OVERLAY".equals(id)) i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + act.getPackageName()));
        else if ("ACCESSIBILITY".equals(id)) i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        else i = new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS);
        act.startActivity(i);
    }

    @JavascriptInterface
    public boolean startVoiceForegroundService() {
        Intent i = new Intent(act, JarvisForegroundService.class);
        ContextCompat.startForegroundService(act, i);
        return true;
    }

    @JavascriptInterface
    public boolean stopVoiceForegroundService() {
        act.stopService(new Intent(act, JarvisForegroundService.class));
        return true;
    }

    @JavascriptInterface
    public void moveAppToBackground() {
        act.runOnUiThread(() -> act.moveTaskToBack(true));
    }

    @JavascriptInterface
    public void showRgbOverlay() {
        if (!Settings.canDrawOverlays(act)) return;
        Intent i = new Intent(act, JarvisOverlayService.class).setAction("SHOW");
        act.startService(i);
    }

    @JavascriptInterface
    public void hideRgbOverlay() {
        act.startService(new Intent(act, JarvisOverlayService.class).setAction("HIDE"));
    }
}
