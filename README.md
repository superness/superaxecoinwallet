# SuperAxeCoin Wallet

A cross-platform GUI wallet for SuperAxeCoin built with Electron.

## Download

Download the latest release for your platform:

- **Windows**: `SuperAxeCoin Wallet Setup 1.0.0.exe` (installer) or `SuperAxeCoin Wallet 1.0.0.exe` (portable)
- **Linux**: `SuperAxeCoin Wallet-1.0.0.AppImage` or `superaxecoin-wallet_1.0.0_amd64.deb`

See [Releases](https://github.com/superness/superaxecoinwallet/releases) for downloads.

## Features

- Dashboard with balance, block height, and sync status
- Send and receive SAXE
- Transaction history with filtering
- Network/peers monitoring
- Debug console for RPC commands
- Wallet encryption and backup
- Multi-wallet support
- Contact address book
- Message signing and verification

## Updating the Daemon

The wallet comes bundled with `superaxecoind` and `superaxecoin-cli`. If you need to update to a newer version of the daemon (e.g., for network upgrades or bug fixes), follow these steps:

### Installed Version (Windows Installer / Linux .deb)

1. **Find the daemon folder**:
   - **Windows**: `C:\Users\<YourUser>\AppData\Local\Programs\superaxecoin-wallet\resources\daemon\`
   - **Linux (.deb)**: `/opt/SuperAxeCoin Wallet/resources/daemon/`

2. **Download new binaries** from [SuperAxeCoin Releases](https://github.com/superness/superaxecoin/releases)

3. **Close the wallet** completely

4. **Replace the files**:
   - Windows: Replace `superaxecoind.exe` and `superaxecoin-cli.exe`
   - Linux: Replace `superaxecoind` and `superaxecoin-cli`

5. **Restart the wallet**

### Portable Version (Windows .exe / Linux AppImage)

For portable versions, the daemon is embedded and cannot be easily updated. Download the latest wallet release which includes updated daemon binaries.

### Verifying the Update

After updating, you can verify the daemon version:
1. Open the wallet
2. Go to **Tools** > **Debug Console**
3. Type `getnetworkinfo` and press Enter
4. Check the `version` and `subversion` fields

## Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Daemon binaries

The daemon binaries are organized by platform:

```
daemon/
├── win/
│   ├── superaxecoind.exe
│   └── superaxecoin-cli.exe
└── linux/
    ├── superaxecoind
    └── superaxecoin-cli
```

Download from [SuperAxeCoin Releases](https://github.com/superness/superaxecoin/releases) or build from source.

### 3. Run in development

```bash
npm start        # Normal mode
npm run dev      # With DevTools open
```

## Building

```bash
npm run build:win    # Windows (nsis + portable)
npm run build:linux  # Linux (AppImage + deb)
npm run build:mac    # macOS (dmg + zip)
```

Output goes to `dist/` with platform-specific daemon binaries bundled.

## License

MIT
