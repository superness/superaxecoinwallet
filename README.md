# SuperAxeCoin Wallet

An Electron-based GUI wallet for SuperAxeCoin.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get the daemon binaries

The wallet requires `superaxecoind` (and optionally `superaxecoin-cli`) to function. You have two options:

**Option A: Download from releases**

Download the latest release from [SuperAxeCoin GitHub Releases](https://github.com/parnurzeal/superaxecoin/releases) and extract the binaries.

**Option B: Build from source**

Clone and build the SuperAxeCoin core:

```bash
git clone https://github.com/parnurzeal/superaxecoin.git
cd superaxecoin
# Follow build instructions in the superaxecoin repo
```

### 3. Place binaries in daemon folder

Create a `daemon/` folder in this project and copy the binaries:

```
daemon/
  superaxecoind.exe      (required)
  superaxecoin-cli.exe   (optional)
```

On Linux/Mac, the files would be `superaxecoind` and `superaxecoin-cli` (no .exe extension).

## Development

```bash
npm start
```

## Build

```bash
npm run build
```

This creates a packaged application in `dist/` with the daemon binaries bundled in `resources/daemon/`.

## License

MIT
