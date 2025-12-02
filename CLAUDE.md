# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperAxeCoin Wallet is an Electron-based cross-platform GUI wallet that interfaces with a bundled superaxecoind daemon via JSON-RPC. The wallet manages the daemon lifecycle automatically and communicates through a secure IPC/RPC bridge.

## Common Commands

```bash
# Development
npm start           # Run the wallet (starts Electron)
npm run dev         # Run with DevTools open

# Building
npm run build       # Build for current platform
npm run build:win   # Build for Windows (nsis + portable)
npm run build:mac   # Build for macOS (dmg + zip)
npm run build:linux # Build for Linux (AppImage + deb)
npm run build:all   # Build for all platforms

# Install dependencies
npm install
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ DaemonMgr   │  │  RpcClient  │  │      Logger         │  │
│  │ (daemon.js) │  │  (rpc.js)   │  │    (logger.js)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                         │                                    │
│                   ┌─────┴─────┐                              │
│                   │  main.js  │ (IPC Handlers)               │
│                   └─────┬─────┘                              │
└─────────────────────────┼───────────────────────────────────┘
                          │ IPC (contextBridge)
┌─────────────────────────┼───────────────────────────────────┐
│                   ┌─────┴─────┐                              │
│                   │preload.js │ (API exposure)               │
│                   └─────┬─────┘                              │
│                         │                                    │
│  ┌──────────────────────┴──────────────────────────────┐    │
│  │                   renderer.js                        │    │
│  │   Dashboard │ Send │ Receive │ TX │ Network │ etc   │    │
│  └─────────────────────────────────────────────────────┘    │
│                    Electron Renderer Process                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

- **src/main.js** - Main process entry point, IPC handlers, window management
- **src/preload.js** - Exposes `window.api` to renderer via contextBridge
- **src/renderer.js** - All UI logic, page navigation, state management
- **src/daemon.js** - DaemonManager class: spawns/stops superaxecoind, manages config
- **src/rpc.js** - RpcClient class: JSON-RPC 1.0 calls to daemon
- **src/logger.js** - File-based logging with rotation
- **src/cli.js** - Command line argument parsing

### Communication Flow

1. **Renderer** calls `window.api.someMethod()` (defined in preload.js)
2. **Preload** invokes IPC: `ipcRenderer.invoke('channel', args)`
3. **Main** handles via `ipcMain.handle('channel', handler)`
4. **RpcClient** makes HTTP POST to daemon's JSON-RPC endpoint
5. Response flows back through the same chain

### Adding New RPC Functionality

```javascript
// 1. main.js - Add IPC handler
ipcMain.handle('rpc:newmethod', async (event, param1, param2) => {
  logger.rpcCall('newmethod', [param1, param2]);
  try {
    const result = await rpcClient.call('newmethod', [param1, param2]);
    logger.rpcResponse('newmethod', true);
    return result;
  } catch (error) {
    logger.rpcError('newmethod', error);
    return { error: error.message };
  }
});

// 2. preload.js - Expose to renderer
newMethod: (param1, param2) => ipcRenderer.invoke('rpc:newmethod', param1, param2),

// 3. renderer.js - Use in UI
const result = await window.api.newMethod(param1, param2);
```

### Adding New Pages

```html
<!-- index.html - Add nav item -->
<li class="nav-item" data-page="newpage">
  <span class="icon">&#9733;</span> New Page
</li>

<!-- index.html - Add page content -->
<div class="page" id="page-newpage">
  <h2>New Page</h2>
  <!-- content -->
</div>
```

```javascript
// renderer.js - Add page-specific refresh logic in nav handler
if (pageName === 'newpage') loadNewPageData();
```

## Daemon Integration

- The wallet bundles `superaxecoind.exe` in `daemon/` folder
- On startup, DaemonManager auto-creates `superaxecoin.conf` if missing
- Config file located at platform-specific data directory:
  - Windows: `%APPDATA%\SuperAxeCoin\superaxecoin.conf`
  - macOS: `~/Library/Application Support/SuperAxeCoin/superaxecoin.conf`
  - Linux: `~/.superaxecoin/superaxecoin.conf`
- Default RPC port: 9998 (mainnet), 19998 (testnet), 19443 (regtest)

## RPC Client Notes

- `rpc.js` maintains a list of wallet-specific RPC methods in `isWalletMethod()`
- Wallet methods route to `/wallet/<walletname>` endpoint
- Non-wallet methods (blockchain, network) route to `/`

## Contacts Storage

- Contacts are stored locally in JSON at `app.getPath('userData')/contacts.json`
- Not stored on blockchain - purely local address book

## Logging

- Log files at platform data dir under `logs/wallet.log`
- 10MB max size with automatic rotation (keeps last 5)
- Passphrases are never logged (masked as `***`)

## Ongoing Issues

- Issue 9 is still running long
