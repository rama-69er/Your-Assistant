package com.shimi.assistant.tasks

import kotlinx.serialization.Serializable

enum class TaskStepType {
    OPEN_APP,
    WAIT_FOR_APP,
    FIND_UI,
    CLICK,
    TYPE,
    SCROLL,
    CONFIRM,
    VERIFY
}

enum class TaskStepStatus {
    PENDING,
    RUNNING,
    COMPLETED,
    WAITING_CONFIRMATION,
    SKIPPED,
    FAILED
}

enum class TaskState {
    IDLE,
    PLANNING,
    RUNNING,
    WAITING_CONFIRMATION,
    COMPLETED,
    CANCELLED,
    FAILED
}

@Serializable
data class TaskStep(
    val index: Int,
    val type: TaskStepType,
    val label: String,
    val target: String? = null,
    val value: String? = null,
    val status: TaskStepStatus = TaskStepStatus.PENDING,
    val detail: String = ""
)

@Serializable
data class TaskPlan(
    val id: String,
    val title: String,
    val originalUtterance: String,
    val targetPackageHint: String? = null,
    val requiresConfirmation: Boolean = false,
    val confirmationPrompt: String? = null,
    val steps: List<TaskStep>
)

@Serializable
data class TaskResult(
    val planId: String,
    val state: TaskState,
    val summary: String,
    val steps: List<TaskStep>,
    val confirmationId: String? = null
)
