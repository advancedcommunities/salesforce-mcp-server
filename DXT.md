# Desktop Extension (DXT) Documentation

## What is a Desktop Extension?

Desktop Extensions (DXT) are a packaging format that allows MCP servers to be distributed and installed with a single click. They provide:

- **One-click installation**: Users can install by double-clicking the `.dxt` file
- **Automatic dependency management**: All Node.js dependencies are bundled
- **Security sandboxing**: Extensions run with explicit permissions
- **Cross-platform support**: Works on Windows, macOS, and Linux
- **Easy updates**: Simple version management and updates

## Building the DXT File

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- The project dependencies installed (`npm install`)

### Build Process

1. **Build the TypeScript project first:**
   ```bash
   npm run build
   ```

2. **Create the DXT package:**
   ```bash
   npm run build:dxt
   ```

   This command will:
   - Compile the TypeScript code
   - Package all necessary files
   - Create `dist/salesforce-mcp-server.dxt`

### Manual DXT Commands

If you need more control over the DXT build process:

```bash
# Initialize DXT configuration (already done)
npx dxt init

# Pack the extension with custom output
npx dxt pack -o custom-name.dxt

# Validate the manifest
npx dxt validate
```

## DXT Configuration

The `manifest.json` file configures the Desktop Extension:

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

1. Download the `.dxt` file
2. Double-click to install
3. The extension is automatically configured in supported AI clients

### For Developers

1. Build the DXT: `npm run build:dxt`
2. The file is created in `dist/salesforce-mcp-server.dxt`
3. Upload to GitHub releases or distribute directly
4. Users can install without any technical setup

## Security Model

Desktop Extensions run in a sandboxed environment with explicit permissions:

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

**"dxt: command not found"**
- Run `npm install` to ensure @anthropic-ai/dxt is installed

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

The DXT runtime provides these environment variables:
- `DXT_EXTENSION_DIR`: Directory where the extension is installed
- `DXT_DATA_DIR`: Persistent data directory for the extension
- `DXT_TEMP_DIR`: Temporary directory for extension use

## Contributing

When contributing to the DXT packaging:

1. Test the build process: `npm run build:dxt`
2. Validate the manifest: `npx dxt validate`
3. Test installation on different platforms
4. Update version in both `package.json` and `manifest.json`

## Additional Resources

- [Desktop Extensions Documentation](https://www.desktopextensions.com/#developers)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Salesforce CLI Documentation](https://developer.salesforce.com/tools/salesforcecli)