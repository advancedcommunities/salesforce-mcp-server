# MCP Bundle (MCPB) Documentation

## What is an MCP Bundle?

MCP Bundles (MCPB) are a packaging format that allows MCP servers to be distributed and installed with a single click. They provide:

- **One-click installation**: Users can install by double-clicking the `.mcpb` file
- **Automatic dependency management**: All Node.js dependencies are bundled
- **Security sandboxing**: Extensions run with explicit permissions
- **Cross-platform support**: Works on Windows, macOS, and Linux
- **Easy updates**: Simple version management and updates

## Building the MCPB File

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- The project dependencies installed (`npm install`)

### Build Process

1. **Build the TypeScript project first:**

    ```bash
    npm run build
    ```

2. **Create the MCPB package:**

    ```bash
    npm run build:mcpb
    ```

    This command will:
    - Compile the TypeScript code
    - Package all necessary files
    - Create `dist/salesforce-mcp-server.mcpb`

### Manual MCPB Commands

If you need more control over the MCPB build process:

```bash
# Initialize MCPB configuration (already done)
npx mcpb init

# Pack the extension with custom output
npx mcpb pack -o custom-name.mcpb

# Validate the manifest
npx mcpb validate
```

## MCPB Configuration

The `manifest.json` file configures the MCP Bundle:

```json
{
    "name": "salesforce-mcp-server",
    "version": "1.1.0",
    "runtime": "node",
    "entrypoint": "./build/index.js",
    "permissions": {
        "filesystem": { "read": true, "write": true },
        "network": { "allowed_domains": ["*.salesforce.com", "*.force.com"] }
    }
}
```

### Key Configuration Options

- **runtime**: Specifies Node.js runtime (can also be "python" or "binary")
- **entrypoint**: The main file to execute (uses the compiled JavaScript)
- **permissions**: Explicit permissions required by the extension
    - `filesystem`: Read/write access for temp files and exports
    - `network`: Access to Salesforce domains for API calls

## Distribution

### For End Users

1. Download the `.mcpb` file
2. Double-click to install
3. The extension is automatically configured in supported AI clients

### For Developers

1. Build the MCPB: `npm run build:mcpb`
2. The file is created in `dist/salesforce-mcp-server.mcpb`
3. Upload to GitHub releases or distribute directly
4. Users can install without any technical setup

## Security Model

MCP Bundles run in a sandboxed environment with explicit permissions:

- **Filesystem Access**: Required for:
    - Creating temporary Apex files
    - Exporting query results to CSV/JSON
    - Reading authentication data from Salesforce CLI

- **Network Access**: Limited to Salesforce domains:
    - `*.salesforce.com`
    - `*.force.com`
    - `*.sandbox.salesforce.com`
    - Other Salesforce-related domains

## Troubleshooting

### Build Issues

**"mcpb: command not found"**

- Run `npm install` to ensure @anthropic-ai/mcpb is installed

**"Build failed"**

- Ensure TypeScript compilation succeeds first: `npm run build`
- Check that all files referenced in manifest.json exist

### Runtime Issues

**"Extension failed to start"**

- Verify Salesforce CLI is installed on the target system
- Check that Node.js 18+ is available
- Review extension logs for specific errors

**"Permission denied"**

- The extension only has access to permitted domains
- Filesystem access is sandboxed to specific operations

## Advanced Usage

### Custom Permissions

Modify `manifest.json` to adjust permissions:

```json
"permissions": {
  "filesystem": {
    "read": true,
    "write": true,
    "paths": ["/tmp", "~/Downloads"]  // Specific paths
  }
}
```

### Environment Variables

The MCPB runtime provides these environment variables:

- `MCPB_EXTENSION_DIR`: Directory where the extension is installed
- `MCPB_DATA_DIR`: Persistent data directory for the extension
- `MCPB_TEMP_DIR`: Temporary directory for extension use

## Contributing

When contributing to the MCPB packaging:

1. Test the build process: `npm run build:mcpb`
2. Validate the manifest: `npx mcpb validate`
3. Test installation on different platforms
4. Update version in both `package.json` and `manifest.json`

## Additional Resources

- [MCP Bundles Documentation](https://github.com/modelcontextprotocol/mcpb)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Salesforce CLI Documentation](https://developer.salesforce.com/tools/salesforcecli)
