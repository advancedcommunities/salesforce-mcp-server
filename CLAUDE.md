# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Build the TypeScript project
npm run build

# Run development mode with MCP inspector for debugging
npm run dev

# Build Desktop Extension (.dxt) for distribution
npm run build:dxt

# Install dependencies
npm install
```

## Architecture Overview

This is a Model Context Protocol (MCP) server that enables AI assistants to interact with Salesforce orgs through the Salesforce CLI. The codebase follows a modular architecture with clear separation of concerns.

### Core Components

1. **Tool Registration Pattern**: Each tool category has its own file in `src/tools/` that exports a registration function. Tools are registered in `src/index.ts` using functions like `registerApexTools(server)`.

2. **Permission System**: All tools check permissions via `src/config/permissions.ts` which enforces:
    - `READ_ONLY` mode: Prevents Apex execution when enabled
    - `ALLOWED_ORGS`: Restricts access to specific org aliases

3. **Salesforce Integration**: Two approaches are used:
    - Native API calls via `@salesforce/apex-node` for Apex operations
    - CLI commands via `src/utils/sfCommand.ts` for most other operations

4. **Connection Management**: `src/shared/connection.ts` handles Salesforce authentication by reusing existing Salesforce CLI auth tokens.

### Tool Implementation Pattern

When implementing new tools, follow this pattern:

```typescript
// 1. Define Zod schema for input validation
const MyToolSchema = z.object({
    targetOrg: z.string(),
    // other parameters
});

// 2. Check permissions
if (!permissions.canAccessOrg(targetOrg)) {
    return { error: "Access denied" };
}

// 3. Execute operation (via CLI or native API)
const result = await executeSfCommand(["command", "args"], targetOrg);

// 4. Return structured response
return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
```

### Tool Categories

The MCP server provides tools organized by functionality:

- **Apex Tools** (`src/tools/apex.ts`): Execute anonymous Apex, run tests, get coverage, manage logs, generate classes/triggers
- **Query Tools** (`src/tools/query.ts`): Query records with SOQL, export to files
- **SObject Tools** (`src/tools/sobjects.ts`): List and describe Salesforce objects
- **Org Tools** (`src/tools/orgs.ts`): List connected orgs, login, logout, open org in browser
- **Admin Tools** (`src/tools/admin.ts`): Manage permissions, users, metadata
- **Schema Tools** (`src/tools/schema.ts`): Generate custom objects, fields, and tabs
- **Package Tools** (`src/tools/package.ts`): Install and uninstall packages
- **Code Analysis Tools** (`src/tools/code-analyzer.ts`, `src/tools/scanner.ts`): Static code analysis and security scanning
- **Record Tools** (`src/tools/records.ts`): Open records in browser

### Adding New Tools

1. Create or update the appropriate file in `src/tools/`
2. Define the tool with Zod schema validation
3. Implement permission checks if needed
4. Register the tool in the export function
5. Update `manifest.json` to include the new tool in the tools array
6. Rebuild the project with `npm run build`
7. Build the Desktop Extension with `npm run build:dxt`

### Error Handling

- Always return structured JSON responses instead of throwing errors
- Use the pattern: `{ error: "message" }` for error responses
- Include helpful context in error messages

### Key Files to Understand

- `src/index.ts` - Server initialization and tool registration
- `src/config/permissions.ts` - Permission enforcement logic
- `src/utils/sfCommand.ts` - Salesforce CLI integration
- `src/shared/connection.ts` - Salesforce authentication handling
- `manifest.json` - Desktop Extension configuration and tool metadata

### TypeScript Configuration

- Target: ES2022
- Module: Node16
- Output: `./build` directory
- Type: ES modules (`"type": "module"` in package.json)

### Distribution

The project supports Desktop Extension (.dxt) packaging for one-click installation. The `manifest.json` file defines the extension metadata, tools, and user configuration options.

## Important Implementation Notes

- All Salesforce CLI commands should use `executeSfCommand()` from `src/utils/sfCommand.ts`
- Native Apex operations should use the `@salesforce/apex-node` library when possible for better performance
- Always validate inputs with Zod schemas before processing
- Check org access permissions before executing any Salesforce operations
- Use `--json` flag for CLI commands to ensure consistent JSON output
- The server version is maintained in both `package.json` and `src/index.ts`

## Recent Features Added

- **Apex Debug Logs**: Fetch and view Apex debug logs from the org
- **Apex Code Generation**: Generate Apex classes and triggers with metadata
- **Record Navigation**: Open Salesforce records directly in browser
- **Enhanced Error Handling**: Improved error messages with more context
- **Prettier Integration**: Automatic code formatting with `.prettierrc` configuration

## Development Memories

- Don't add indentation to the JSON results
- Run prettier on files after making changes
- Update the documentation after making changes
- Build package and dxt file after making changes
- Check that new tools are registered in both the tool file and manifest.json
- Verify permission checks are implemented for destructive operations
