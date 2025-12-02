/**
 * CLI Parser for SuperAxeCoin Wallet
 * Handles command line arguments for both wallet GUI and daemon pass-through
 */

class CliParser {
  constructor() {
    // Wallet-specific arguments
    this.walletArgs = {
      dev: false,
      help: false
    };

    // Network selection
    this.network = 'mainnet';
    this.dataDir = null;

    // Arguments to pass through to daemon
    this.daemonArgs = [];

    // RPC configuration overrides
    this.rpcConfig = {
      port: null,
      user: null,
      pass: null
    };

    this.parse();
  }

  parse() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Wallet-only arguments
      if (arg === '--dev') {
        this.walletArgs.dev = true;
        continue;
      }

      if (arg === '--help' || arg === '-h' || arg === '-?') {
        this.walletArgs.help = true;
        continue;
      }

      // Network selection (affects both wallet and daemon)
      if (arg === '--testnet') {
        this.network = 'testnet';
        this.daemonArgs.push('--testnet');
        continue;
      }

      if (arg === '--regtest') {
        this.network = 'regtest';
        this.daemonArgs.push('--regtest');
        continue;
      }

      // Data directory (affects both wallet and daemon)
      if (arg.startsWith('--datadir=')) {
        this.dataDir = arg.split('=')[1];
        this.daemonArgs.push(arg);
        continue;
      }

      // RPC configuration (capture for wallet, pass to daemon)
      if (arg.startsWith('--rpcport=')) {
        this.rpcConfig.port = parseInt(arg.split('=')[1]);
        this.daemonArgs.push(arg);
        continue;
      }

      if (arg.startsWith('--rpcuser=')) {
        this.rpcConfig.user = arg.split('=')[1];
        this.daemonArgs.push(arg);
        continue;
      }

      if (arg.startsWith('--rpcpassword=')) {
        this.rpcConfig.pass = arg.split('=')[1];
        this.daemonArgs.push(arg);
        continue;
      }

      // Connection arguments (pass to daemon)
      if (arg.startsWith('--connect=') ||
          arg.startsWith('--addnode=') ||
          arg.startsWith('--seednode=') ||
          arg.startsWith('--maxconnections=') ||
          arg.startsWith('--proxy=') ||
          arg.startsWith('--onion=') ||
          arg === '--listen' ||
          arg.startsWith('--bind=') ||
          arg.startsWith('--port=')) {
        this.daemonArgs.push(arg);
        continue;
      }

      // RPC arguments (pass to daemon)
      if (arg.startsWith('--rpcbind=') ||
          arg.startsWith('--rpcallowip=')) {
        this.daemonArgs.push(arg);
        continue;
      }

      // Wallet arguments (pass to daemon)
      if (arg.startsWith('--wallet=') ||
          arg === '--disablewallet' ||
          arg.startsWith('--walletdir=')) {
        this.daemonArgs.push(arg);
        continue;
      }

      // Performance arguments (pass to daemon)
      if (arg.startsWith('--dbcache=') ||
          arg.startsWith('--maxmempool=') ||
          arg.startsWith('--prune=') ||
          arg === '--txindex' ||
          arg === '--reindex' ||
          arg === '--reindex-chainstate') {
        this.daemonArgs.push(arg);
        continue;
      }

      // Debug arguments (pass to daemon)
      if (arg.startsWith('--debug=') ||
          arg.startsWith('--debugexclude=') ||
          arg === '--printtoconsole' ||
          arg === '--shrinkdebugfile') {
        this.daemonArgs.push(arg);
        continue;
      }

      // ZeroMQ arguments (pass to daemon)
      if (arg.startsWith('--zmqpubhashtx=') ||
          arg.startsWith('--zmqpubhashblock=') ||
          arg.startsWith('--zmqpubrawblock=') ||
          arg.startsWith('--zmqpubrawtx=')) {
        this.daemonArgs.push(arg);
        continue;
      }

      // Any other --arg is passed to daemon
      if (arg.startsWith('--') || arg.startsWith('-')) {
        this.daemonArgs.push(arg);
      }
    }
  }

  /**
   * Get network type: 'mainnet' | 'testnet' | 'regtest'
   */
  getNetwork() {
    return this.network;
  }

  /**
   * Get custom data directory or null for default
   */
  getDataDir() {
    return this.dataDir;
  }

  /**
   * Get arguments to pass to daemon
   */
  getDaemonArgs() {
    return this.daemonArgs;
  }

  /**
   * Check if help was requested
   */
  shouldShowHelp() {
    return this.walletArgs.help;
  }

  /**
   * Check if dev mode is enabled
   */
  isDevMode() {
    return this.walletArgs.dev;
  }

  /**
   * Get default RPC port for current network
   */
  getDefaultRpcPort() {
    if (this.rpcConfig.port) {
      return this.rpcConfig.port;
    }
    switch (this.network) {
      case 'testnet': return 19998;
      case 'regtest': return 19443;
      default: return 9998;
    }
  }

  /**
   * Get RPC configuration overrides
   */
  getRpcOverrides() {
    return {
      port: this.rpcConfig.port || this.getDefaultRpcPort(),
      user: this.rpcConfig.user,
      pass: this.rpcConfig.pass
    };
  }

  /**
   * Get help message text
   */
  getHelpMessage() {
    return `SuperAxeCoin Wallet v1.0.0

Usage: superaxecoin-wallet [options]

Wallet Options:
  --dev                     Open developer tools on startup
  --help, -h, -?            Show this help message

Network Selection:
  --testnet                 Use the test network
  --regtest                 Enter regression test mode
  --datadir=<dir>           Specify custom data directory

Connection Options (passed to daemon):
  --connect=<ip>            Connect only to specified node
  --addnode=<ip>            Add a node to connect to
  --seednode=<ip>           Connect to node for peer addresses, then disconnect
  --maxconnections=<n>      Maximum number of connections (default: 125)
  --proxy=<ip:port>         Connect through SOCKS5 proxy
  --onion=<ip:port>         Use separate proxy for Tor hidden services
  --listen                  Accept connections from outside (default: 1)
  --bind=<addr>             Bind to given address
  --port=<port>             Listen for connections on <port>

RPC Options:
  --rpcport=<port>          Listen for RPC connections on <port>
  --rpcbind=<addr>          Bind RPC to given address
  --rpcuser=<user>          Username for RPC connections
  --rpcpassword=<pw>        Password for RPC connections
  --rpcallowip=<ip>         Allow RPC from specified IP

Wallet Options (passed to daemon):
  --wallet=<name>           Load specific wallet on startup
  --disablewallet           Do not load any wallet
  --walletdir=<dir>         Specify wallet directory

Performance Options (passed to daemon):
  --dbcache=<n>             Database cache size in MB (default: 450)
  --maxmempool=<n>          Max mempool size in MB (default: 300)
  --prune=<n>               Reduce storage by pruning old blocks (MB)
  --txindex                 Maintain full transaction index
  --reindex                 Rebuild chain state and block index
  --reindex-chainstate      Rebuild chain state from existing block index

Debug Options (passed to daemon):
  --debug=<category>        Output debug info (net, tor, mempool, http, etc.)
  --debugexclude=<cat>      Exclude category from debug output
  --printtoconsole          Send trace/debug to console
  --shrinkdebugfile         Shrink debug.log on startup

ZeroMQ Options (passed to daemon):
  --zmqpubhashtx=<addr>     Enable publish hash transaction
  --zmqpubhashblock=<addr>  Enable publish hash block
  --zmqpubrawblock=<addr>   Enable publish raw block
  --zmqpubrawtx=<addr>      Enable publish raw transaction
`;
  }
}

module.exports = CliParser;
