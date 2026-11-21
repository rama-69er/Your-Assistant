package com.shimi.assistant.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import com.shimi.assistant.data.RobotState

/**
 * Lightweight, battery-friendly native floating Shimi face view drawn on Canvas
 * when SYSTEM_ALERT_WINDOW is granted. Visual style matches the PWA's rounded Shimi character.
 */
class FloatingAssistantView(context: Context) : View(context) {

    private var robotState: RobotState = RobotState.IDLE

    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#FFFFFF")
        style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#CBD5E1")
        style = Paint.Style.STROKE
        strokeWidth = 4f
    }
    private val visorPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#0F172A")
        style = Paint.Style.FILL
    }
    private val eyePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#38BDF8")
        style = Paint.Style.FILL
    }

    fun setState(state: RobotState) {
        robotState = state
        eyePaint.color = when (state) {
            RobotState.LISTENING -> Color.parseColor("#2563EB")
            RobotState.THINKING -> Color.parseColor("#818CF8")
            RobotState.SUCCESS -> Color.parseColor("#10B981")
            RobotState.SORRY, RobotState.CONFUSED -> Color.parseColor("#F59E0B")
            RobotState.SLEEPING -> Color.parseColor("#94A3B8")
            else -> Color.parseColor("#38BDF8")
        }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        val pad = 6f
        val bodyRect = RectF(pad, pad, w - pad, h - pad)
        val radius = w * 0.34f
        canvas.drawRoundRect(bodyRect, radius, radius, bodyPaint)
        canvas.drawRoundRect(bodyRect, radius, radius, borderPaint)

        val visorRect = RectF(w * 0.18f, h * 0.25f, w * 0.82f, h * 0.72f)
        canvas.drawRoundRect(visorRect, w * 0.18f, w * 0.18f, visorPaint)

        val eyeY = h * 0.48f
        val eyeRadius = if (robotState == RobotState.LISTENING) w * 0.085f else w * 0.068f
        if (robotState == RobotState.SLEEPING) {
            eyePaint.strokeWidth = 5f
            canvas.drawLine(w * 0.30f, eyeY, w * 0.44f, eyeY, eyePaint)
            canvas.drawLine(w * 0.56f, eyeY, w * 0.70f, eyeY, eyePaint)
        } else {
            canvas.drawCircle(w * 0.37f, eyeY, eyeRadius, eyePaint)
            canvas.drawCircle(w * 0.63f, eyeY, eyeRadius, eyePaint)
        }
    }
}
