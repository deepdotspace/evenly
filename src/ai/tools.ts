/**
 * AI Tool Definitions — converts DeepSpace BUILT_IN_TOOLS to Vercel AI SDK tools.
 *
 * READ-ONLY assistant. The chat route runs tool calls under the CALLER's RBAC
 * (it sends `X-User-Id` WITHOUT `X-App-Action`, so it is correctly NOT a bypass),
 * and Evenly's group collections are now write-locked at the schema layer — so the
 * assistant could not corrupt the ledger even if it tried. We still remove the
 * write tools (`records.create` / `update` / `delete`) from the allowlist entirely
 * so a prompt-injected assistant has no write surface at all: it can answer
 * questions about the user's data, nothing more. All mutations go through the
 * validated server actions, never the assistant. Do NOT re-add the write tools.
 */

import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import { BUILT_IN_TOOLS } from 'deepspace/worker'
import type { ToolSchema, CollectionSchema } from 'deepspace/worker'

type ToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>

const ALLOWED_TOOL_NAMES = [
  'schema.list',
  'schema.describe',
  'records.query',
  'records.get',
  'user.current',
]

// ============================================================================
// System prompt
// ============================================================================

type Interpretation = CollectionSchema['columns'][number]['interpretation']

/**
 * Interpretation is `string | Record<string, unknown>`. When it's an object
 * the convention across the SDK's built-in schemas is `{ kind: string, ... }`
 * (see `server/schemas/directory.ts`). Narrow safely to a human-readable name.
 */
function interpretationLabel(interpretation: Interpretation): string {
  if (typeof interpretation === 'string') return interpretation
  const kind = interpretation.kind
  return typeof kind === 'string' ? kind : 'object'
}

export function buildSystemPrompt(appName: string, schemas: CollectionSchema[]): string {
  const schemaSummary = schemas
    .map((s) => {
      const cols = (s.columns ?? [])
        .map((c) => `${c.name}:${interpretationLabel(c.interpretation)}${c.required ? '!' : ''}`)
        .join(', ')
      return `- ${s.name}${cols ? ` (${cols})` : ''}`
    })
    .join('\n')

  return [
    `You are the read-only assistant for the "${appName}" app on DeepSpace.`,
    'You can READ the user\'s data via the available tools to answer questions,',
    'summarize spending, and explain balances. You CANNOT create, edit, or delete',
    'anything — those happen through the app\'s own buttons and forms, not you.',
    '',
    'If the user asks you to add an expense, settle up, add a member, or change',
    'anything, explain that you can\'t make changes and point them to the relevant',
    'screen (e.g. "use Add expense on the group page").',
    '',
    'Use tools to look up facts before answering. Do not invent data.',
    'If data is missing, say so plainly. Keep answers concise.',
    '',
    'Available collections:',
    schemaSummary || '(none)',
  ].join('\n')
}

// ============================================================================
// Tool definitions
// ============================================================================

export function buildTools(executor: ToolExecutor): ToolSet {
  const tools: ToolSet = {}

  for (const def of BUILT_IN_TOOLS) {
    if (!ALLOWED_TOOL_NAMES.includes(def.name)) continue
    const safeName = def.name.replace('.', '_')
    tools[safeName] = tool({
      description: def.description,
      inputSchema: buildZodSchema(def),
      execute: async (params: Record<string, unknown>) => executor(def.name, params),
    })
  }

  return tools
}

// ============================================================================
// Convert ToolSchema params → Zod object schema
// ============================================================================

function buildZodSchema(def: ToolSchema) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [name, param] of Object.entries(def.params)) {
    let s: z.ZodTypeAny
    switch (param.type) {
      case 'string':  s = z.string(); break
      case 'number':  s = z.number(); break
      case 'boolean': s = z.boolean(); break
      case 'object':  s = z.record(z.unknown()); break
      case 'array':   s = z.array(z.unknown()); break
      default:        s = z.unknown(); break
    }
    if (param.description) s = s.describe(param.description)
    if (!param.required) s = s.optional()
    shape[name] = s
  }

  return z.object(shape)
}
