# CONTROL CENTER — Core Context for AI Agents & Claude

## 1. System Overview & Tech Stack
Control Center is a multi-agent orchestration engine and real-time dashboard.
- **Stack**: Next.js 15 (App Router, Tailwind), SQLite via Prisma (`src/generated/prisma`), TypeScript.
- **Dashboard**: `npm run dev` (runs on `http://localhost:3100`).
- **Database**: SQLite (`control-center.db`). Schema in `prisma/schema.prisma`.
- **MCP Server**: `src/mcp/server.ts` exposes 12 MCP tools over stdio for any agent (`npx tsx src/mcp/server.ts --agent <Identity>`).
- **Core Principle**: Agents do the work in `repoPath`; Control Center coordinates state and messages; the database is the source of truth.

---

## 2. Key Architecture Files
| File | Responsibility |
|---|---|
| [`src/lib/transition.ts`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/src/lib/transition.ts) | State transitions (`BACKLOG` → `RUNNING` → `DONE` / `FAILED` / `REVIEW`). Validates legal moves & calls `processHandoffs()`. |
| [`src/lib/handoff.ts`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/src/lib/handoff.ts) | Auto-handoff router. On `DONE` + `nextAgent` → dispatches `HANDOFF` message. On `FAILED` + `onFailureAgent` (< 3 retries) → creates `[FIX]` task + `FIX_REQUEST`. Marks `Goal` `COMPLETED` when done. |
| [`src/mcp/server.ts`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/src/mcp/server.ts) | Enforces agent ownership: `claim_task`, `get_task_context`, `complete_task`, `fail_task`, `read_messages`, `send_message`, `heartbeat`. |
| [`scripts/agent-loop.ts`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/scripts/agent-loop.ts) | Reference agent loop driver implementing the MCP contract. |
| [`scripts/agent-sdk.ts`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/scripts/agent-sdk.ts) | CLI wrapper to interact with state without launching full MCP. |
| [`docs/AGENT-PROTOCOL.md`](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/docs/AGENT-PROTOCOL.md) | Official agent contract & lifecycle guide. |

---

## 3. Database Schema Entities
- **`Project`**: Has `slug`, `repoPath` (physical folder on disk where work is produced), `goals`, `tasks`.
- **`Goal`**: High-level objective. Statuses: `ACTIVE` → `COMPLETED` / `FAILED` / `PAUSED`.
- **`Task`**: Unit of work. States: `BACKLOG` → `RUNNING` → `DONE` | `FAILED` | `REVIEW` | `BLOCKED` | `PAUSED`.
  - Fields: `agent` (owner), `nextAgent`, `onFailureAgent`, `retryCount`, `result`, `requiresApproval`, `handedOff`.
- **`AgentMessage`**: Inter-agent communication bus. Types: `REQUEST`, `HANDOFF`, `FIX_REQUEST`, `QUESTION`, `RESPONSE`, `REVIEW`, `INFO`, `ERROR`, `CONTROL`, `ACK`. Status: `UNREAD` → `READ` → `RESOLVED`.
- **`WorkerStatus`**: Agent heartbeats (`ONLINE`, `BUSY`, `OFFLINE`).
- **`Approval`**: Human-in-the-loop gates (e.g. max retries exceeded or critical action).

---

## 4. Multi-Agent Pipeline & Specialized Roles
A goal is executed sequentially via discrete disk artifacts in `repoPath`:

```text
[Goal Created]
      ↓
1. Antigravity (Planner/Researcher)
   └─ Reads Goal Description → runs `plan_goal`
   └─ Scaffolds directory structure & writes `research.md`
   └─ Calls `complete_task`
      ↓ (Engine sends HANDOFF)
2. OpenDesign (Design Spec Engine)
   └─ Reads `research.md` from disk
   └─ Writes `landing/design-system.md` (colors, typography, layout)
   └─ Calls `complete_task`
      ↓ (Engine sends HANDOFF)
3. OpenCode / Aider (Implementation Coder)
   └─ Reads `research.md` + `design-system.md` from disk
   └─ Writes codebase files (`index.html`, CSS, TS/JS components)
   └─ Commits changes & calls `complete_task`
      ↓ (Engine sends HANDOFF)
4. Antigravity (QA & Verifier)
   └─ Reads code on disk, runs linter/test assertions (checks DOM, semantic tags, footer, etc.)
   └─ IF VALID: calls `complete_task` → Goal status becomes `COMPLETED`
   └─ IF INVALID: calls `fail_task(error)` → Engine creates `[FIX]` task with `FIX_REQUEST` back to OpenCode (up to 3 retries)
```

---

## 5. Root Cause Analysis: Why Previous Runs Felt "Simulated"
1. **Mocked Hooks**: In `scripts/agent-loop.ts`, agent hooks used hardcoded string writes (`fs.writeFile(...)`) instead of invoking real LLM harnesses.
2. **Monolithic Provider Trap**: In `test-agents.ts`, 3 `opencode` processes ran on the same free tier (`deepseek-v4-flash-free`), causing identical output patterns and rate limit freeze.
3. **Silent Headless Failures**: Headless agent CLIs without explicit permission bypass silently ignore tool executions and exit code `0` with zero file diff.
4. **Missing Disk Assertions**: Hand-offs should verify that expected files (`research.md`, `design-system.md`, `index.html`) exist and `git diff` is non-empty before allowing `complete_task`.

---

## 6. How Real CLI Adapters Connect
- **OpenCode**: `opencode run "<instruction>" --agent <role.md> --auto --format json`
- **Aider**: `aider --yes-always --message "<instruction>" --auto-lint --auto-test <repoPath>`
- **Claude Code**: `claude -p "<instruction>"`
- **Context Injection Rule**: Never inject large chat transcripts. The agent reconstructs its entire context by calling `get_task_context` and reading disk files left by the predecessor.
