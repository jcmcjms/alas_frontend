import { delay, http } from "msw"
import { db, pushNotification, userName } from "../db"
import { noStoreJson, problem, resolveActor, hasPerm } from "../handler-utils"
import {
  consumeStaleConfig,
  getMockScenario,
  rearmStaleConfig,
} from "../scenarios"
import type { WorkflowConfigurationDto } from "@/features/loans/types/loan-contracts"

function configView(): WorkflowConfigurationDto {
  const config = db().workflowConfig
  return {
    requireRecommendation: config.requireRecommendation,
    initialStatus: config.requireRecommendation
      ? "ForRecommendation"
      : "ForChecking",
    stages: config.requireRecommendation
      ? ["ForRecommendation", "ForChecking", "ForApproval", "Approved"]
      : ["ForChecking", "ForApproval", "Approved"],
    source: config.source,
    updatedAt: config.updatedAt,
    updatedByName: config.updatedByName,
    version: config.version,
  }
}

export const workflowConfigHandlers = [
  http.get("*/api/workflow/configuration", async ({ request }) => {
    await delay(180)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    return noStoreJson(configView())
  }),

  /**
   * Update the recommendation setting. Concurrency is enforced with the config
   * version token: a stale save fails with 409 and the authoritative current
   * config, so the UI can never show a setting the backend did not persist.
   * Changing this NEVER reroutes applications already in progress — only the
   * initial status of newly submitted ones.
   */
  http.put("*/api/workflow/configuration", async ({ request }) => {
    const scenario = getMockScenario()
    await delay(scenario === "slow" ? 2500 : 350)
    const actor = resolveActor(request)
    if (!actor) return problem(401, "Unauthorized", "Sign in first.")
    if (!hasPerm(actor, "workflow.manage")) {
      return problem(
        403,
        "Forbidden",
        "Only administrators can change workflow settings."
      )
    }
    if (scenario === "mutation-failure") {
      return problem(
        500,
        "Save failed",
        "The workflow service could not persist the change. The previous setting is still active."
      )
    }

    const body = (await request.json().catch(() => null)) as {
      requireRecommendation?: boolean
      expectedVersion?: number
    } | null
    if (typeof body?.requireRecommendation !== "boolean") {
      return problem(
        400,
        "Validation failed",
        "requireRecommendation must be true or false."
      )
    }

    const config = db().workflowConfig
    if (scenario === "workflow-stale" && consumeStaleConfig()) {
      return problem(
        409,
        "Stale configuration",
        "Another administrator changed this setting moments ago. Review the current value and save again.",
        {
          current: configView(),
        }
      )
    }
    rearmStaleConfig()
    if (
      typeof body.expectedVersion === "number" &&
      body.expectedVersion !== config.version
    ) {
      return problem(
        409,
        "Stale configuration",
        "Another administrator changed this setting moments ago. Review the current value and save again.",
        {
          current: configView(),
        }
      )
    }

    config.requireRecommendation = body.requireRecommendation
    config.source = "Database"
    config.updatedAt = new Date().toISOString()
    config.updatedByName = userName(actor)
    config.version += 1

    // Audit trail: admins are notified of the change (backend audit log in production).
    for (const admin of db().users.filter(
      (user) => user.permissions === "*" && user.id !== actor.id
    )) {
      pushNotification(
        db(),
        admin.id,
        "Workflow setting changed",
        `${userName(actor)} ${body.requireRecommendation ? "enabled" : "disabled"} the recommendation step for new applications.`,
        "system",
        "/admin/workflow"
      )
    }

    return noStoreJson(configView())
  }),
]
