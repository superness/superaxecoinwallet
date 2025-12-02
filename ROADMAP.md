# SuperAxeCoin Wallet - Technical Roadmap

## Overview

This document outlines the feature roadmap for the SuperAxeCoin Wallet, an Electron-based cross-platform GUI wallet that interfaces with superaxecoind via JSON-RPC.

## Current State (v1.0.0)

### Implemented Features
- **Dashboard**: Balance display, block height, connection count, sync status, recent transactions
- **Send**: Address validation, amount input, transaction confirmation
- **Receive**: Address generation with labels, address list with balances
- **Transactions**: Full transaction history with confirmations
- **Settings**: RPC configuration, log file access
- **Daemon Management**: Auto-start/stop bundled superaxecoind, status indicators
- **Wallet Management**: Auto-create/load default wallet on startup
- **Logging**: Comprehensive file logging for debugging

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ DaemonMgr   │  │  RpcClient  │  │      Logger         │  │
│  │ (daemon.js) │  │  (rpc.js)   │  │    (logger.js)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │               │                    │               │
│         └───────────────┼────────────────────┘               │
│                         │                                    │
│                   ┌─────┴─────┐                              │
│                   │  main.js  │ (IPC Handlers)               │
│                   └─────┬─────┘                              │
└─────────────────────────┼───────────────────────────────────┘
                          │ IPC (contextBridge)
┌─────────────────────────┼───────────────────────────────────┐
│                   ┌─────┴─────┐                              │
│                   │preload.js │                              │
│                   └─────┬─────┘                              │
│                         │                                    │
│  ┌──────────────────────┴──────────────────────────────┐    │
│  │                   renderer.js                        │    │
│  │  ┌──────────┐ ┌──────┐ ┌───────┐ ┌────┐ ┌────────┐  │    │
│  │  │Dashboard │ │ Send │ │Receive│ │ TX │ │Settings│  │    │
│  │  └──────────┘ └──────┘ └───────┘ └────┘ └────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                    Electron Renderer Process                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Command Line Arguments

**Priority: High** | **Complexity: Low**

Standard wallet applications accept command line arguments for network selection, data directory, and daemon configuration. These are passed through to the bundled daemon.

### 0.1 Supported Arguments

**Wallet-specific arguments:**
```
--dev                     Open developer tools on startup
--help, -h, -?            Show help message
```

**Network selection (affects both wallet and daemon):**
```
--testnet                 Use the test network
--regtest                 Enter regression test mode
--datadir=<dir>           Specify custom data directory
```

**Connection arguments (passed to daemon):**
```
--connect=<ip>            Connect only to specified node
--addnode=<ip>            Add a node to connect to
--seednode=<ip>           Connect to node for peer addresses, then disconnect
--maxconnections=<n>      Maximum number of connections (default: 125)
--proxy=<ip:port>         Connect through SOCKS5 proxy
--onion=<ip:port>         Use separate proxy for Tor hidden services
--listen                  Accept connections from outside (default: 1)
--bind=<addr>             Bind to given address
--port=<port>             Listen for connections on <port>
```

**RPC arguments (passed to daemon, usually auto-configured):**
```
--rpcport=<port>          Listen for RPC connections on <port>
--rpcbind=<addr>          Bind RPC to given address
--rpcuser=<user>          Username for RPC connections
--rpcpassword=<pw>        Password for RPC connections
--rpcallowip=<ip>         Allow RPC from specified IP
```

**Wallet arguments (passed to daemon):**
```
--wallet=<name>           Load specific wallet on startup
--disablewallet           Do not load any wallet
--walletdir=<dir>         Specify wallet directory
```

**Performance arguments (passed to daemon):**
```
--dbcache=<n>             Database cache size in MB (default: 450)
--maxmempool=<n>          Max mempool size in MB (default: 300)
--prune=<n>               Reduce storage by pruning old blocks (MB)
--txindex                 Maintain full transaction index
--reindex                 Rebuild chain state and block index
--reindex-chainstate      Rebuild chain state from existing block index
```

**Debug arguments (passed to daemon):**
```
--debug=<category>        Output debug info (net, tor, mempool, http, etc.)
--debugexclude=<cat>      Exclude category from debug output
--printtoconsole          Send trace/debug to console
--shrinkdebugfile         Shrink debug.log on startup
```

**ZeroMQ arguments (passed to daemon):**
```
--zmqpubhashtx=<addr>     Enable publish hash transaction
--zmqpubhashblock=<addr>  Enable publish hash block
--zmqpubrawblock=<addr>   Enable publish raw block
--zmqpubrawtx=<addr>      Enable publish raw transaction
```

### 0.2 Implementation

**New file: `src/cli.js`**
```javascript
class CliParser {
  constructor() {
    this.walletArgs = {};    // Args for wallet GUI
    this.daemonArgs = [];    // Args to pass to daemon
    this.parse();
  }

  parse() {
    // Parse process.argv
    // Separate wallet-only args from daemon pass-through args
  }

  getNetwork() { /* 'mainnet' | 'testnet' | 'regtest' */ }
  getDataDir() { /* custom datadir or null */ }
  getDaemonArgs() { /* array of args to pass to daemon */ }
  shouldShowHelp() { /* boolean */ }
  isDevMode() { /* boolean */ }
}
```

**Modifications required:**
1. `main.js` - Import cli.js, check for --help, pass dev mode to window
2. `daemon.js` - Accept extra args array in constructor, append to spawn args
3. `daemon.js` - Use custom datadir if provided via CLI

**RPC port handling:**
- If `--testnet`, default RPC port changes (9998 → 19998)
- If `--regtest`, default RPC port changes (9998 → 19443)
- CLI can override with `--rpcport`

---

## Phase 1: Network & Debug Tools

**Priority: High** | **Complexity: Medium**

Essential for troubleshooting network connectivity and blockchain sync issues.

### 1.1 Network/Peers Page

**New navigation item**: "Network" between Transactions and Settings

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Network                                                      │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Network Stats                                           │ │
│ │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐│ │
│ │ │Connections│ │ Total Recv│ │ Total Sent│ │  Version  ││ │
│ │ │     8     │ │  125.4 MB │ │  45.2 MB  │ │  70100    ││ │
│ │ └───────────┘ └───────────┘ └───────────┘ └───────────┘│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Connected Peers                                    [Refresh] │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ IP Address       │Version │Ping │ Recv   │ Sent  │     │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ 192.168.1.100    │70100   │45ms │ 12.3MB │ 4.1MB │[Ban]│ │
│ │ 10.0.0.50        │70100   │120ms│ 8.7MB  │ 2.3MB │[Ban]│ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Banned Peers                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 45.33.22.11 - Banned until 2024-12-15          [Unban]  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `getpeerinfo` - Already implemented
- `getnetworkinfo` - Already implemented
- `listbanned` - New
- `setban <ip> add/remove` - New
- `disconnectnode <ip>` - New

**Implementation Tasks**:
1. Add `rpc:listbanned`, `rpc:setban`, `rpc:disconnectnode` IPC handlers in `main.js`
2. Add corresponding API methods in `preload.js`
3. Add Network page HTML structure in `index.html`
4. Add Network page styles in `styles.css`
5. Add Network page logic in `renderer.js`
6. Add nav item and page switching logic

**Files to modify**: `main.js`, `preload.js`, `index.html`, `styles.css`, `renderer.js`

---

### 1.2 Debug Console

**Location**: Settings page or separate "Console" page

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Debug Console                                                │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ > getblockcount                                         │ │
│ │ 847523                                                  │ │
│ │                                                         │ │
│ │ > getblockhash 1000                                     │ │
│ │ 00000000c937983704a73af28acdec37b049d...                │ │
│ │                                                         │ │
│ │ > help                                                  │ │
│ │ == Blockchain ==                                        │ │
│ │ getbestblockhash                                        │ │
│ │ getblock "blockhash" ( verbosity )                      │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ > _                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [Execute]  [Clear]                                          │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- Generic `rpc:call` handler that accepts any method and params
- `help` - List available commands

**Implementation Tasks**:
1. Add generic `rpc:execute` IPC handler that accepts method + params array
2. Add console UI with command history (up/down arrows)
3. JSON syntax highlighting for responses
4. Auto-complete for common commands (optional)

**Security Note**: Console should only be accessible locally; consider adding a toggle to enable/disable.

---

## Phase 2: Transaction Details & History

**Priority: High** | **Complexity: Medium**

### 2.1 Transaction Details Modal

**Triggered by**: Clicking any transaction in the list

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Transaction Details                                    [X]   │
├─────────────────────────────────────────────────────────────┤
│ TXID: 3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f...      [Copy]  │
│                                                              │
│ Status: Confirmed (125 confirmations)                        │
│ Date: 2024-12-01 14:32:15                                   │
│ Block: 847,523                                              │
│                                                              │
│ ┌─────────────────────┐    ┌─────────────────────┐         │
│ │ Inputs              │    │ Outputs             │         │
│ │ ┌─────────────────┐ │    │ ┌─────────────────┐ │         │
│ │ │ SXabc...def     │ │ -> │ │ SXxyz...789     │ │         │
│ │ │ 10.5 SAXE       │ │    │ │ 5.0 SAXE        │ │         │
│ │ └─────────────────┘ │    │ └─────────────────┘ │         │
│ │                     │    │ ┌─────────────────┐ │         │
│ │                     │    │ │ SXabc...def     │ │         │
│ │                     │    │ │ 5.4999 SAXE     │ │         │
│ │                     │    │ │ (change)        │ │         │
│ │                     │    │ └─────────────────┘ │         │
│ └─────────────────────┘    └─────────────────────┘         │
│                                                              │
│ Fee: 0.0001 SAXE (1 sat/vB)                                 │
│ Size: 225 vBytes                                            │
│                                                              │
│ [View Raw TX]  [View on Explorer]                           │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `gettransaction <txid>` - Get wallet transaction details
- `getrawtransaction <txid> true` - Get decoded raw transaction
- `decoderawtransaction <hex>` - Decode raw transaction hex

**Implementation Tasks**:
1. Add `rpc:gettransaction` and `rpc:getrawtransaction` IPC handlers
2. Create modal component with overlay
3. Parse and display inputs/outputs
4. Calculate and display fee
5. Add copy buttons for TXID, addresses

---

### 2.2 Transaction Filtering

**Location**: Transactions page header

**Filters**:
- Date range (from/to date pickers)
- Type: All / Received / Sent
- Amount: Min / Max
- Search by address or TXID

**Implementation Tasks**:
1. Add filter UI above transaction list
2. Client-side filtering of loaded transactions
3. Optionally use `listtransactions` with label filter for server-side filtering

---

## Phase 3: Wallet Security

**Priority: High** | **Complexity: High**

### 3.1 Wallet Encryption

**Location**: Settings page, new "Security" section

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Security                                                     │
├─────────────────────────────────────────────────────────────┤
│ Wallet Status: [Encrypted/Unencrypted]                      │
│                                                              │
│ [Encrypt Wallet]  (if unencrypted)                          │
│ [Change Passphrase]  (if encrypted)                         │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Wallet Lock Status: Locked / Unlocked (5:00 remaining)  │ │
│ │ [Unlock Wallet]  [Lock Wallet]                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `encryptwallet <passphrase>` - First-time encryption (requires restart)
- `walletpassphrase <passphrase> <timeout>` - Unlock wallet
- `walletlock` - Lock wallet
- `walletpassphrasechange <old> <new>` - Change passphrase
- `getwalletinfo` - Check encryption status

**Implementation Tasks**:
1. Add encryption status display on Settings page
2. Create secure passphrase input dialogs (show/hide toggle)
3. Add unlock timer display
4. Modify send flow to prompt for passphrase if wallet is locked
5. Handle daemon restart after initial encryption

**Security Considerations**:
- Never log passphrases
- Clear passphrase from memory after use
- Show warnings about passphrase recovery being impossible

---

### 3.2 Wallet Backup/Restore

**Location**: Settings page

**Features**:
- Backup wallet file to chosen location
- Restore wallet from backup file

**RPC Commands Required**:
- `backupwallet <destination>` - Backup wallet.dat
- File dialog for save/open location

**Implementation Tasks**:
1. Add Backup/Restore section to Settings
2. Use Electron's `dialog.showSaveDialog` / `dialog.showOpenDialog`
3. Copy wallet file with error handling
4. Warn about closing wallet before restore

---

## Phase 4: Advanced Send Features

**Priority: Medium** | **Complexity: High**

### 4.1 Fee Estimation

**Location**: Send page, below amount input

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Transaction Fee                                              │
├─────────────────────────────────────────────────────────────┤
│ ○ Economy (20+ blocks)     ~0.00001 SAXE                    │
│ ● Normal (6 blocks)        ~0.00005 SAXE                    │
│ ○ Priority (2 blocks)      ~0.0001 SAXE                     │
│ ○ Custom: [________] sat/vB                                 │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `estimatesmartfee <conf_target>` - Estimate fee for confirmation target
- `settxfee <amount>` - Set transaction fee (per kB)

**Implementation Tasks**:
1. Call `estimatesmartfee` for different confirmation targets
2. Display fee options with radio buttons
3. Allow custom fee input
4. Show estimated total (amount + fee) before sending

---

### 4.2 Coin Control

**Location**: Send page, expandable advanced section

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Coin Control (Advanced)                                   │
├─────────────────────────────────────────────────────────────┤
│ Select inputs to spend:                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [✓] SXabc...def  │ 5.0 SAXE   │ 125 conf │ 2024-11-30 │ │
│ │ [✓] SXxyz...789  │ 2.5 SAXE   │ 50 conf  │ 2024-12-01 │ │
│ │ [ ] SXqrs...456  │ 10.0 SAXE  │ 10 conf  │ 2024-12-01 │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Selected: 7.5 SAXE from 2 inputs                            │
│ Fee: 0.0001 SAXE | Change: 2.4999 SAXE                      │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `listunspent` - List unspent transaction outputs
- `createrawtransaction` - Create raw transaction with specific inputs
- `fundrawtransaction` - Add inputs/change to raw transaction
- `signrawtransactionwithwallet` - Sign the transaction
- `sendrawtransaction` - Broadcast

**Implementation Tasks**:
1. Add collapsible "Advanced" section to Send page
2. Fetch and display UTXOs with `listunspent`
3. Allow checkbox selection of inputs
4. Calculate change and fee based on selection
5. Build transaction using raw transaction APIs instead of `sendtoaddress`

---

## Phase 5: Address Management

**Priority: Medium** | **Complexity: Low**

### 5.1 Address Book

**Location**: New "Contacts" page or section in Send page

**Features**:
- Save addresses with labels
- Quick-select when sending
- Edit/delete entries
- Import/export address book (JSON)

**Storage**: Local JSON file in app data directory (not on blockchain)

**Implementation Tasks**:
1. Create contacts storage in Electron main process
2. Add Contacts page with add/edit/delete UI
3. Add address book dropdown/autocomplete in Send page
4. Import/export functionality

---

### 5.2 QR Code Generation

**Location**: Receive page, next to generated address

**Dependencies**: `qrcode` npm package

**Implementation Tasks**:
1. Add `qrcode` dependency
2. Generate QR code when address is created
3. Display as canvas or image
4. Include amount in QR if specified (BIP-21 URI: `superaxecoin:SXabc...?amount=1.5`)

---

## Phase 6: Multi-Wallet Support

**Priority: Low** | **Complexity: High**

### 6.1 Wallet Selector

**Location**: Sidebar, below logo

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ SuperAxeCoin                                                 │
│ Wallet v1.0.0                                               │
├─────────────────────────────────────────────────────────────┤
│ Current Wallet: [default_wallet ▼]                          │
│   ├─ default_wallet                                         │
│   ├─ savings                                                │
│   ├─ trading                                                │
│   └─ [+ Create New Wallet]                                  │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `listwalletdir` - List available wallets
- `listwallets` - List loaded wallets
- `loadwallet <name>` - Load a wallet
- `unloadwallet <name>` - Unload a wallet
- `createwallet <name>` - Create new wallet

**Implementation Tasks**:
1. Add wallet selector dropdown to sidebar
2. Track currently active wallet
3. Reload dashboard data when switching wallets
4. Add create wallet dialog
5. Handle wallet-specific RPC context

---

## Phase 7: Message Signing

**Priority: Low** | **Complexity: Low**

### 7.1 Sign/Verify Messages

**Location**: New "Tools" page or section in Settings

**UI Components**:
```
┌─────────────────────────────────────────────────────────────┐
│ Sign Message                                                 │
├─────────────────────────────────────────────────────────────┤
│ Address: [SXabc123...                              ] [Pick] │
│ Message: [                                               ]  │
│          [                                               ]  │
│ [Sign Message]                                              │
│                                                              │
│ Signature: H8K3jd8f...                              [Copy]  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Verify Message                                               │
├─────────────────────────────────────────────────────────────┤
│ Address:   [                                             ]  │
│ Message:   [                                             ]  │
│ Signature: [                                             ]  │
│ [Verify Message]                                            │
│                                                              │
│ Result: ✓ Message verified / ✗ Invalid signature            │
└─────────────────────────────────────────────────────────────┘
```

**RPC Commands Required**:
- `signmessage <address> <message>` - Sign with private key
- `verifymessage <address> <signature> <message>` - Verify signature

**Implementation Tasks**:
1. Add Tools page with Sign/Verify sections
2. Implement address picker (from wallet addresses)
3. Handle wallet unlock if encrypted

---

## Implementation Priority Matrix

| Phase | Feature | Priority | Complexity | Dependencies |
|-------|---------|----------|------------|--------------|
| 0.1 | Command Line Arguments | High | Low | None |
| 1.1 | Network/Peers Page | High | Medium | None |
| 1.2 | Debug Console | High | Medium | None |
| 2.1 | Transaction Details | High | Medium | None |
| 2.2 | Transaction Filtering | Medium | Low | None |
| 3.1 | Wallet Encryption | High | High | None |
| 3.2 | Wallet Backup | High | Low | None |
| 4.1 | Fee Estimation | Medium | Medium | None |
| 4.2 | Coin Control | Medium | High | 4.1 |
| 5.1 | Address Book | Medium | Low | None |
| 5.2 | QR Codes | Low | Low | npm package |
| 6.1 | Multi-Wallet | Low | High | None |
| 7.1 | Message Signing | Low | Low | 3.1 (for locked wallets) |

---

## Suggested Implementation Order

### Sprint 0: Foundation
1. Command Line Arguments (0.1)

### Sprint 1: Debug & Network
2. Network/Peers Page (1.1)
3. Debug Console (1.2)

### Sprint 2: Transaction UX
4. Transaction Details Modal (2.1)
5. Transaction Filtering (2.2)

### Sprint 3: Security
6. Wallet Backup/Restore (3.2)
7. Wallet Encryption (3.1)

### Sprint 4: Send Improvements
8. Fee Estimation (4.1)
9. Address Book (5.1)

### Sprint 5: Advanced Features
10. QR Codes (5.2)
11. Coin Control (4.2)

### Sprint 6: Power User Features
12. Multi-Wallet Support (6.1)
13. Message Signing (7.1)

---

## Technical Notes

### Adding New RPC Handlers Pattern

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

### Adding New Pages Pattern

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
// renderer.js - Navigation already handles page switching automatically
// Just add page-specific refresh logic:
if (pageName === 'newpage') loadNewPageData();
```

---

## Version Targets

- **v1.0.1**: Command Line Arguments
- **v1.1.0**: Network Page + Debug Console
- **v1.2.0**: Transaction Details + Filtering
- **v1.3.0**: Wallet Security (Encryption + Backup)
- **v1.4.0**: Fee Estimation + Address Book
- **v1.5.0**: QR Codes + Coin Control
- **v2.0.0**: Multi-Wallet + Message Signing

---

## Dependencies to Add

```json
{
  "dependencies": {
    "qrcode": "^1.5.3"
  }
}
```

---

## Testing Checklist

For each new feature:
- [ ] Manual testing on Windows
- [ ] Manual testing on macOS (if building)
- [ ] Manual testing on Linux (if building)
- [ ] Error handling for RPC failures
- [ ] Error handling for daemon not running
- [ ] Logging for debugging
- [ ] UI responsiveness
- [ ] Dark theme consistency
