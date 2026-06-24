# MCP Enhanced Server v2.0.0

Enhanced MCP (Model Context Protocol) Server with full 2025-03-26 specification support:

- **Tools** - With annotations, outputSchema, structuredContent, resource_link
- **Resources** - URI-identified data with subscriptions and list change notifications
- **Prompts** - Templated messages and workflows with argument schemas
- **Elicitation** - Server-initiated user input requests
- **Tasks** - Async long-running operations with progress tracking
- **Streamable HTTP** - Production-ready HTTP transport with session management
- **Auth** - Bearer token authentication for remote deployments
- **Origin Validation** - DNS rebinding attack prevention

## Quick Start

```bash
npm install
npm run build
npm start
```

## Transport Modes

### Stdio (default)
```bash
npm start
```

### Streamable HTTP
```bash
MCP_TRANSPORT=http MCP_PORT=3000 npm start
```

### Streamable HTTP with Auth
```bash
MCP_TRANSPORT=http MCP_PORT=3000 MCP_AUTH_TOKEN=your-secret-token npm start
```

## Features

### Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Server Info | `mcp://server/info` | Server name, version, features |
| Config Info | `mcp://server/config` | Transport, auth, environment |
| Project Files | `file:///{path}` | Template-based file access |

### Prompts

| Prompt | Description | Arguments |
|--------|-------------|-----------|
| `code_review` | Review code quality | code, language |
| `explain_code` | Explain code behavior | code, detail_level |
| `generate_tests` | Generate unit tests | code, framework |
| `debug_error` | Debug code errors | code, error |

### Tools

| Tool | readOnly | destructive | idempotent | Description |
|------|----------|-------------|------------|-------------|
| `read_file` | ✓ | ✗ | ✓ | Read file contents |
| `write_file` | ✗ | ✓ | ✓ | Write file (overwrites) |
| `list_directory` | ✓ | ✗ | ✓ | List directory contents |
| `delete_file` | ✗ | ✓ | ✗ | Delete a file |
| `search_code` | ✓ | ✗ | ✓ | Regex search in code |
| `run_command` | ✗ | ✓ | ✗ | Execute shell command |
| `confirm_action` | ✓ | ✗ | ✓ | Request user confirmation |
| `request_input` | ✓ | ✗ | ✓ | Request user input |
| `task_status` | ✓ | ✗ | ✓ | Get async task status |
| `task_cancel` | ✗ | ✓ | ✓ | Cancel a running task |
| `task_list` | ✓ | ✗ | ✓ | List all tasks |
| `batch_process` | ✗ | ✗ | ✗ | Start batch processing |
| `get_weather` | ✓ | ✗ | ✓ | Weather data (structured output) |
| `system_info` | ✓ | ✗ | ✓ | System information (structured output) |
| `list_available_resources` | ✓ | ✗ | ✓ | List resources as resource links |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio` or `http` |
| `MCP_PORT` | `3000` | HTTP port |
| `MCP_HOST` | `127.0.0.1` | HTTP host |
| `MCP_AUTH_TOKEN` | - | Bearer token for auth (optional) |

## Cloudflare Workers Deployment

Live deployment: **https://mcp-enhanced-server.catnip-haze.workers.dev**

- Health: `GET /health`
- MCP endpoint: `POST /mcp` (JSON-RPC 2.0)
- MCP info: `GET /mcp`

See `cloudflare/` directory for Workers deployment with D1 database.

```bash
cd cloudflare
npm install
wrangler d1 create mcp-enhanced-tasks
# Update database_id in wrangler.toml
wrangler d1 execute mcp-enhanced-tasks --file=src/schema.sql
wrangler deploy
```

### Workers Environment Variables

Set via Cloudflare Dashboard or `wrangler secret put`:
- `MCP_AUTH_TOKEN` - Authentication token
- `MCP_ALLOWED_ORIGINS` - Comma-separated allowed origins

## Architecture

```
src/
├── index.ts              # Main entry, server setup, all features
├── tools/
│   ├── annotations.ts    # Tool Annotation type definitions
│   └── registry.ts       # Tool registry with Zod validation
├── resources/
│   ├── manager.ts        # Resource lifecycle manager
│   └── tools.ts          # Resource tools
├── prompts/
│   ├── manager.ts        # Prompt lifecycle manager
│   └── builtin.ts        # Built-in prompt templates
├── elicitation/
│   ├── manager.ts        # Elicitation request/response manager
│   └── tools.ts          # Elicitation tools
└── tasks/
    ├── manager.ts        # Async task lifecycle manager
    └── tools.ts          # Task tools
```

## Debug

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
