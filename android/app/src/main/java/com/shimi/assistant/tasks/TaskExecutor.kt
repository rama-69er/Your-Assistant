package com.shimi.assistant.tasks

import com.shimi.assistant.actions.AccessibilityActionExecutor
import com.shimi.assistant.actions.AppLauncher
import kotlinx.coroutines.delay

/**
 * Executes multi-step TaskPlans step-by-step using legitimate Android public APIs
 * and opt-in AccessibilityService. Pauses cleanly at CONFIRM steps and resumes
 * only after explicit user confirmation.
 */
class TaskExecutor(
    private val appLauncher: AppLauncher,
    private val onStepUpdate: (planId: String, step: TaskStep) -> Unit
) {
    private var pausedPlan: TaskPlan? = null
    private var pausedNextIndex: Int = 0
    private var pausedSteps: MutableList<TaskStep> = mutableListOf()

    suspend fun execute(plan: TaskPlan): TaskResult {
        pausedPlan = null
        val mutableSteps = plan.steps.toMutableList()
        return runFromIndex(plan, mutableSteps, 0)
    }

    suspend fun resumeAfterConfirmation(planId: String): TaskResult {
        val plan = pausedPlan
        if (plan == null || plan.id != planId) {
            return TaskResult(planId, TaskState.FAILED, "No pending confirmation found for this task.", emptyList())
        }
        val steps = pausedSteps
        val confirmIdx = pausedNextIndex - 1
        if (confirmIdx in steps.indices) {
            steps[confirmIdx] = steps[confirmIdx].copy(
                status = TaskStepStatus.COMPLETED,
                detail = "Confirmed by user"
            )
            onStepUpdate(plan.id, steps[confirmIdx])
        }
        pausedPlan = null
        return runFromIndex(plan, steps, pausedNextIndex)
    }

    fun cancelPending(planId: String): Boolean {
        if (pausedPlan?.id != planId) return false
        pausedPlan = null
        return true
    }

    private suspend fun runFromIndex(
        plan: TaskPlan,
        steps: MutableList<TaskStep>,
        startIndex: Int
    ): TaskResult {
        for (i in startIndex until steps.size) {
            val step = steps[i].copy(status = TaskStepStatus.RUNNING)
            steps[i] = step
            onStepUpdate(plan.id, step)

            when (step.type) {
                TaskStepType.OPEN_APP -> {
                    val res = appLauncher.launchByName(step.target.orEmpty())
                    if (!res.ok) {
                        steps[i] = step.copy(status = TaskStepStatus.FAILED, detail = res.message)
                        onStepUpdate(plan.id, steps[i])
                        return TaskResult(plan.id, TaskState.FAILED, res.message, steps)
                    }
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = res.message)
                    onStepUpdate(plan.id, steps[i])
                }

                TaskStepType.WAIT_FOR_APP -> {
                    delay(850)
                    val ready = AccessibilityActionExecutor.isWindowReady(step.target)
                    steps[i] = step.copy(
                        status = TaskStepStatus.COMPLETED,
                        detail = if (ready) "App window ready" else "Proceeding after launch delay"
                    )
                    onStepUpdate(plan.id, steps[i])
                }

                TaskStepType.FIND_UI -> {
                    val res = AccessibilityActionExecutor.findVisibleControl(step.target.orEmpty())
                    if (!res.ok) {
                        steps[i] = step.copy(status = TaskStepStatus.FAILED, detail = res.message)
                        onStepUpdate(plan.id, steps[i])
                        return TaskResult(plan.id, TaskState.FAILED, res.message, steps)
                    }
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = res.message)
                    onStepUpdate(plan.id, steps[i])
                }

                TaskStepType.CLICK -> {
                    val res = AccessibilityActionExecutor.clickByText(step.target.orEmpty())
                    if (!res.ok) {
                        steps[i] = step.copy(status = TaskStepStatus.FAILED, detail = res.message)
                        onStepUpdate(plan.id, steps[i])
                        return TaskResult(plan.id, TaskState.FAILED, res.message, steps)
                    }
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = res.message)
                    onStepUpdate(plan.id, steps[i])
                    delay(350)
                }

                TaskStepType.TYPE -> {
                    val res = AccessibilityActionExecutor.typeIntoSafeField(step.value.orEmpty(), step.target)
                    if (!res.ok) {
                        steps[i] = step.copy(status = TaskStepStatus.FAILED, detail = res.message)
                        onStepUpdate(plan.id, steps[i])
                        return TaskResult(plan.id, TaskState.FAILED, res.message, steps)
                    }
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = res.message)
                    onStepUpdate(plan.id, steps[i])
                }

                TaskStepType.SCROLL -> {
                    val res = AccessibilityActionExecutor.scroll(step.target ?: "down")
                    if (!res.ok) {
                        steps[i] = step.copy(status = TaskStepStatus.FAILED, detail = res.message)
                        onStepUpdate(plan.id, steps[i])
                        return TaskResult(plan.id, TaskState.FAILED, res.message, steps)
                    }
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = res.message)
                    onStepUpdate(plan.id, steps[i])
                }

                TaskStepType.CONFIRM -> {
                    steps[i] = step.copy(
                        status = TaskStepStatus.WAITING_CONFIRMATION,
                        detail = step.value ?: plan.confirmationPrompt ?: "Waiting for your confirmation"
                    )
                    onStepUpdate(plan.id, steps[i])
                    pausedPlan = plan
                    pausedSteps = steps
                    pausedNextIndex = i + 1
                    return TaskResult(
                        planId = plan.id,
                        state = TaskState.WAITING_CONFIRMATION,
                        summary = step.value ?: plan.confirmationPrompt ?: "Please confirm to continue.",
                        steps = steps,
                        confirmationId = plan.id
                    )
                }

                TaskStepType.VERIFY -> {
                    steps[i] = step.copy(status = TaskStepStatus.COMPLETED, detail = "Task steps completed")
                    onStepUpdate(plan.id, steps[i])
                }
            }
        }

        return TaskResult(
            planId = plan.id,
            state = TaskState.COMPLETED,
            summary = "Completed: ${plan.title}.",
            steps = steps
        )
    }
}
