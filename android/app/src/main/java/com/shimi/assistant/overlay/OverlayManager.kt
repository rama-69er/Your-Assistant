package com.shimi.assistant.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.FloatingSize
import com.shimi.assistant.data.RobotState
import kotlin.math.abs

/**
 * Manages the draggable native Android overlay bubble via WindowManager when
 * `SYSTEM_ALERT_WINDOW` is granted. Gracefully stays hidden if permission is denied
 * or when the user chooses notification-only mode.
 */
class OverlayManager(
    private val context: Context,
    private val onBubbleTapped: () -> Unit
) {
    private val windowManager = context.getSystemService(WindowManager::class.java)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var bubbleView: FloatingAssistantView? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    @Volatile
    var isVisible: Boolean = false
        private set

    @SuppressLint("ClickableViewAccessibility")
    fun show(config: AssistantConfig, state: RobotState) {
        if (!Settings.canDrawOverlays(context)) return
        if (config.floatingMode == "notification") {
            hide()
            return
        }
        mainHandler.post {
            if (bubbleView != null) {
                updateAppearance(config, state)
                return@post
            }
            val sizePx = dpToPx(FloatingSize.fromWire(config.floatingSize).sizeDp)
            val view = FloatingAssistantView(context).apply {
                alpha = config.floatingOpacity.coerceIn(0.45f, 1.0f)
                applyConfig(config, state)
            }

            val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            }

            val params = WindowManager.LayoutParams(
                sizePx,
                sizePx,
                windowType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = dpToPx(20)
                y = dpToPx(240)
            }

            var startX = 0
            var startY = 0
            var touchX = 0f
            var touchY = 0f
            var dragged = false

            view.setOnTouchListener { _, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        startX = params.x
                        startY = params.y
                        touchX = event.rawX
                        touchY = event.rawY
                        dragged = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - touchX).toInt()
                        val dy = (event.rawY - touchY).toInt()
                        if (abs(dx) > 8 || abs(dy) > 8) dragged = true
                        params.x = startX + dx
                        params.y = startY + dy
                        runCatching { windowManager?.updateViewLayout(view, params) }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!dragged) onBubbleTapped()
                        true
                    }
                    else -> false
                }
            }

            runCatching {
                windowManager?.addView(view, params)
                bubbleView = view
                layoutParams = params
                isVisible = true
            }
        }
    }

    fun updateAppearance(config: AssistantConfig, state: RobotState) {
        mainHandler.post {
            if (config.floatingMode == "notification") {
                hide()
                return@post
            }
            val view = bubbleView ?: return@post
            val params = layoutParams ?: return@post
            val sizePx = dpToPx(FloatingSize.fromWire(config.floatingSize).sizeDp)
            params.width = sizePx
            params.height = sizePx
            view.alpha = config.floatingOpacity.coerceIn(0.45f, 1.0f)
            view.applyConfig(config, state)
            runCatching { windowManager?.updateViewLayout(view, params) }
        }
    }

    fun updateState(state: RobotState) {
        mainHandler.post {
            bubbleView?.setState(state)
        }
    }

    fun hide() {
        mainHandler.post {
            bubbleView?.let { view ->
                runCatching { windowManager?.removeView(view) }
            }
            bubbleView = null
            layoutParams = null
            isVisible = false
        }
    }

    private fun dpToPx(dp: Int): Int =
        (dp * context.resources.displayMetrics.density).toInt()
}
