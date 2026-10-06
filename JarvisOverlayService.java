package com.krishnasharma.jarvis;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.FrameLayout;

/** Draws a colour-cycling RGB border around the whole screen (over other apps). */
public class JarvisOverlayService extends Service {
    private WindowManager wm;
    private FrameLayout view;
    private ValueAnimator anim;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "HIDE".equals(intent.getAction())) hide(); else show();
        return START_NOT_STICKY;
    }

    private void show() {
        if (view != null) return;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        final int px = (int) (getResources().getDisplayMetrics().density * 5);
        final GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.RECTANGLE);
        g.setStroke(px, Color.CYAN);
        view = new FrameLayout(this);
        view.setForeground(g);
        wm.addView(view, lp);
        anim = ValueAnimator.ofObject(new ArgbEvaluator(), Color.parseColor("#00F0FF"), Color.parseColor("#FF00FF"),
                Color.parseColor("#FFD700"), Color.parseColor("#00F0FF"));
        anim.setDuration(3200);
        anim.setRepeatCount(ValueAnimator.INFINITE);
        anim.addUpdateListener(a -> g.setStroke(px, (Integer) a.getAnimatedValue()));
        anim.start();
    }

    private void hide() {
        if (anim != null) { anim.cancel(); anim = null; }
        if (view != null && wm != null) { try { wm.removeView(view); } catch (Exception ignored) {} view = null; }
        stopSelf();
    }

    @Override public void onDestroy() { hide(); super.onDestroy(); }
}
