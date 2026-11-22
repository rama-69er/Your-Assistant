package com.shimi.assistant.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import com.shimi.assistant.data.AssistantConfig
import com.shimi.assistant.data.RobotState

/**
 * Lightweight, battery-friendly native floating Shimi view drawn on Android Canvas.
 * Reflects the shared AssistantConfig (themeId, robotStyle, accessory) and reacts
 * immediately to all RobotState changes (IDLE, LISTENING, THINKING, SPEAKING, SUCCESS, CONFUSED, SORRY, SLEEPING).
 */
class FloatingAssistantView(context: Context) : View(context) {

    private var robotState: RobotState = RobotState.IDLE
    private var themeId: String = "ceramic-cobalt"
    private var robotStyle: String = "pod"
    private var accessory: String = "none"

    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 4f
    }
    private val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val visorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val eyePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

    init {
        applyPalette()
    }

    fun applyConfig(config: AssistantConfig, state: RobotState) {
        themeId = config.themeId
        robotStyle = config.robotStyle
        accessory = config.accessory
        robotState = state
        applyPalette()
        invalidate()
    }

    fun setState(state: RobotState) {
        robotState = state
        applyPalette()
        invalidate()
    }

    private fun applyPalette() {
        val (shell, border, accent, visor, eyeDefault) = when (themeId) {
            "sage-emerald" -> Palette("#F4F9F6", "#A7F3D0", "#059669", "#13241F", "#34D399")
            "sand-coral" -> Palette("#FFFBF7", "#FED7AA", "#EA580C", "#231A17", "#FB923C")
            "slate-amber" -> Palette("#334155", "#64748B", "#F59E0B", "#0B1120", "#FBBF24")
            "mist-indigo" -> Palette("#F7F6FF", "#C7D2FE", "#4F46E5", "#171530", "#818CF8")
            else -> Palette("#FFFFFF", "#CBD5E1", "#2563EB", "#141E30", "#60A5FA")
        }

        bodyPaint.color = Color.parseColor(shell)
        borderPaint.color = if (robotState == RobotState.LISTENING) Color.parseColor(accent) else Color.parseColor(border)
        accentPaint.color = Color.parseColor(accent)
        visorPaint.color = Color.parseColor(visor)

        eyePaint.color = when (robotState) {
            RobotState.LISTENING -> Color.parseColor(accent)
            RobotState.THINKING -> Color.parseColor("#818CF8")
            RobotState.SPEAKING -> Color.parseColor("#38BDF8")
            RobotState.SUCCESS -> Color.parseColor("#10B981")
            RobotState.CONFUSED, RobotState.SORRY -> Color.parseColor("#F59E0B")
            RobotState.SLEEPING -> Color.parseColor("#94A3B8")
            else -> Color.parseColor(eyeDefault)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        val pad = w * 0.10f

        // Style-specific shell radius (matches PWA Pod / Aero / Deskbot silhouettes)
        val bodyRect = RectF(pad, pad + w * 0.04f, w - pad, h - pad)
        val cornerRadius = when (robotStyle) {
            "aero" -> w * 0.42f
            "deskbot" -> w * 0.20f
            else -> w * 0.34f
        }

        // Headphones accessory ear cups
        if (accessory == "headphones") {
            canvas.drawRoundRect(RectF(w * 0.02f, h * 0.36f, w * 0.14f, h * 0.64f), 8f, 8f, accentPaint)
            canvas.drawRoundRect(RectF(w * 0.86f, h * 0.36f, w * 0.98f, h * 0.64f), 8f, 8f, accentPaint)
        }

        canvas.drawRoundRect(bodyRect, cornerRadius, cornerRadius, bodyPaint)
        canvas.drawRoundRect(bodyRect, cornerRadius, cornerRadius, borderPaint)

        // Top accessories
        when (accessory) {
            "halo" -> {
                val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = accentPaint.color
                    style = Paint.Style.STROKE
                    strokeWidth = 3.5f
                }
                canvas.drawOval(RectF(w * 0.28f, h * 0.04f, w * 0.72f, h * 0.14f), haloPaint)
            }
            "beanie" -> {
                canvas.drawArc(RectF(w * 0.18f, h * 0.05f, w * 0.82f, h * 0.34f), 180f, 180f, true, accentPaint)
            }
            "star" -> {
                canvas.drawCircle(w * 0.50f, h * 0.11f, w * 0.055f, accentPaint)
            }
        }

        // Face visor
        val visorRect = RectF(w * 0.20f, h * 0.28f, w * 0.80f, h * 0.74f)
        canvas.drawRoundRect(visorRect, w * 0.16f, w * 0.16f, visorPaint)

        // Expressive eyes
        val eyeY = h * 0.50f
        val eyeRadius = when (robotState) {
            RobotState.LISTENING -> w * 0.082f
            RobotState.SPEAKING -> w * 0.072f
            else -> w * 0.062f
        }

        if (robotState == RobotState.SLEEPING) {
            eyePaint.strokeWidth = 4.5f
            canvas.drawLine(w * 0.31f, eyeY, w * 0.44f, eyeY, eyePaint)
            canvas.drawLine(w * 0.56f, eyeY, w * 0.69f, eyeY, eyePaint)
        } else if (robotState == RobotState.SUCCESS) {
            val arcPaint = Paint(eyePaint).apply {
                style = Paint.Style.STROKE
                strokeWidth = 5f
                strokeCap = Paint.Cap.ROUND
            }
            canvas.drawArc(RectF(w * 0.30f, eyeY - 10f, w * 0.45f, eyeY + 10f), 180f, 180f, false, arcPaint)
            canvas.drawArc(RectF(w * 0.55f, eyeY - 10f, w * 0.70f, eyeY + 10f), 180f, 180f, false, arcPaint)
        } else {
            canvas.drawCircle(w * 0.38f, eyeY, eyeRadius, eyePaint)
            canvas.drawCircle(w * 0.62f, eyeY, eyeRadius, eyePaint)
        }

        // Glasses accessory overlay
        if (accessory == "glasses") {
            val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = accentPaint.color
                style = Paint.Style.STROKE
                strokeWidth = 3f
            }
            canvas.drawCircle(w * 0.38f, eyeY, w * 0.105f, rim)
            canvas.drawCircle(w * 0.62f, eyeY, w * 0.105f, rim)
            canvas.drawLine(w * 0.485f, eyeY, w * 0.515f, eyeY, rim)
        }
    }

    private data class Palette(
        val shell: String,
        val border: String,
        val accent: String,
        val visor: String,
        val eye: String
    )
}
