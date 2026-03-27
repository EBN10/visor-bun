import { auth, clerkClient } from "@clerk/nextjs/server"
import { adminAuditLogs, type AuditLogChange, type AuditLogDetails } from "~/server/db/schema"
import { db } from "~/server/db"

type AuditWriter = Pick<typeof db, "insert">

export type AuditActor = {
  userId: string | null
  name: string | null
  email: string | null
}

export type AuditEntry = {
  action: string
  resourceType: string
  resourceId: string
  resourceLabel?: string | null
  summary: string
  details?: AuditLogDetails
  actor?: AuditActor | null
}

type DiffField<T extends Record<string, unknown>> = {
  key: keyof T & string
  label: string
  format?: (value: unknown) => string | null
}

export async function getAuditActor(): Promise<AuditActor | null> {
  const { userId } = await auth()

  if (!userId) {
    return null
  }

  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()

    return {
      userId,
      name: name || null,
      email: user.emailAddresses[0]?.emailAddress ?? null,
    }
  } catch (error) {
    console.error("Error resolving audit actor:", error)
    return { userId, name: null, email: null }
  }
}

export async function writeAuditLog(target: AuditWriter, entry: AuditEntry) {
  const actor = entry.actor ?? null

  await target.insert(adminAuditLogs).values({
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    resourceLabel: entry.resourceLabel ?? null,
    summary: entry.summary,
    actorUserId: actor?.userId ?? null,
    actorName: actor?.name ?? null,
    actorEmail: actor?.email ?? null,
    details: entry.details ?? {},
  })
}

export function buildAuditChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: DiffField<T>[]
): AuditLogChange[] {
  return fields.flatMap((field) => {
    const beforeValue = before[field.key]
    const afterValue = after[field.key]

    if (!valuesDiffer(beforeValue, afterValue)) {
      return []
    }

    const formatter = field.format ?? formatAuditValue

    return [
      {
        field: field.key,
        label: field.label,
        before: formatter(beforeValue),
        after: formatter(afterValue),
      },
    ]
  })
}

export function formatAuditValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No"
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatAuditValue(item) ?? "vacío").join(", ") : null
  }

  if (typeof value === "object") {
    return JSON.stringify(sortKeys(value))
  }

  return String(value)
}

export function valuesDiffer(left: unknown, right: unknown) {
  return stableStringify(left) !== stableStringify(right)
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }

  return value
}
