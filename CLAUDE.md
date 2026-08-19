# Control Center — Instructions for Claude

Read and follow:
- [CONTROL-CENTER-CONTEXT.md](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/docs/CONTROL-CENTER-CONTEXT.md) for architecture, schema, state machine, and agent pipelines.
- [AGENT-PROTOCOL.md](file:///c:/Users/rodri/Desktop/AI/Projects/control-center/docs/AGENT-PROTOCOL.md) for the MCP contract and tool usage.

## Development & Test Commands
- Dev Server: `npm run dev` (Runs on `http://localhost:3100`)
- MCP Server: `npx tsx src/mcp/server.ts --agent <AgentName>`
- Integration Test: `npm run test:integration`
- Agent Test: `npm run test:agents`
- E2E Test: `npm run test:e2e`
