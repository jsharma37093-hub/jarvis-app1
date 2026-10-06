package com.krishnasharma.jarvis;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/** Keeps the process (and microphone access) alive while the app is in background. */
public class JarvisForegroundService extends Service {
    private static final String CH = "jarvis_voice";

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(new NotificationChannel(CH, "JARVIS Voice", NotificationManager.IMPORTANCE_LOW));
        Notification n = new NotificationCompat.Builder(this, CH)
                .setContentTitle("JARVIS सुन रहा है")
                .setContentText("\"Hey Jarvis\" बोलें")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(1001, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(1001, n);
        return START_STICKY;
    }
}
