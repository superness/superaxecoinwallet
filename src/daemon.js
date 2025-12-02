const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

class DaemonManager {
  constructor(customDataDir = null, extraArgs = []) {
    this.process = null;
    this.isRunning = false;
    this.customDataDir = customDataDir;
    this.dataDir = customDataDir || this.getDefaultDataDir();
    this.extraArgs = extraArgs;
    this.rpcPassword = null;
    this.onStatusChange = null;
    this.onLog = null;
  }

  getDefaultDataDir() {
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(process.env.APPDATA, 'SuperAxeCoin');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'SuperAxeCoin');
    } else {
      return path.join(os.homedir(), '.superaxecoin');
    }
  }

  getDataDir() {
    return this.dataDir;
  }

  getDaemonPath() {
    const platform = process.platform;
    const isDev = !process.resourcesPath || process.resourcesPath.includes('node_modules');

    let basePath;
    if (isDev) {
      // Development: look for daemon in parent directory's release folder
      basePath = path.join(__dirname, '..', '..', 'superaxecoin', 'release', 'windows-x64');
    } else {
      // Production: daemon bundled in resources
      basePath = path.join(process.resourcesPath, 'daemon');
    }

    const executable = platform === 'win32' ? 'superaxecoind.exe' : 'superaxecoind';
    return path.join(basePath, executable);
  }

  getConfigPath() {
    return path.join(this.dataDir, 'superaxecoin.conf');
  }

  generateRpcPassword() {
    return crypto.randomBytes(32).toString('hex');
  }

  ensureConfig() {
    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const configPath = this.getConfigPath();
    let config = {};

    // Read existing config if present
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      content.split('\n').forEach(line => {
        const [key, value] = line.split('=').map(s => s.trim());
        if (key && value) {
          config[key] = value;
        }
      });
    }

    // Ensure RPC is enabled
    let needsWrite = false;

    if (!config.server) {
      config.server = '1';
      needsWrite = true;
    }

    if (!config.rpcuser) {
      config.rpcuser = 'superaxecoinrpc';
      needsWrite = true;
    }

    if (!config.rpcpassword) {
      config.rpcpassword = this.generateRpcPassword();
      needsWrite = true;
    }

    if (!config.rpcport) {
      config.rpcport = '9998';
      needsWrite = true;
    }

    if (!config.rpcallowip) {
      config.rpcallowip = '127.0.0.1';
      needsWrite = true;
    }

    if (needsWrite) {
      const configContent = Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      fs.writeFileSync(configPath, configContent + '\n');
    }

    this.rpcPassword = config.rpcpassword;

    return {
      host: '127.0.0.1',
      port: parseInt(config.rpcport),
      user: config.rpcuser,
      pass: config.rpcpassword
    };
  }

  async start() {
    if (this.isRunning) {
      return { success: true, message: 'Daemon already running' };
    }

    const daemonPath = this.getDaemonPath();

    if (!fs.existsSync(daemonPath)) {
      return {
        success: false,
        error: `Daemon not found at: ${daemonPath}`
      };
    }

    const rpcConfig = this.ensureConfig();

    this.log(`Starting daemon: ${daemonPath}`);
    this.log(`Data directory: ${this.dataDir}`);

    return new Promise((resolve) => {
      try {
        // Build daemon arguments
        const daemonArgs = [
          `-datadir=${this.dataDir}`,
          '-printtoconsole=0',
          ...this.extraArgs
        ];

        this.log(`Daemon arguments: ${daemonArgs.join(' ')}`);

        this.process = spawn(daemonPath, daemonArgs, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        this.process.stdout.on('data', (data) => {
          this.log(`[daemon] ${data.toString().trim()}`);
        });

        this.process.stderr.on('data', (data) => {
          this.log(`[daemon error] ${data.toString().trim()}`);
        });

        this.process.on('error', (err) => {
          this.log(`Daemon error: ${err.message}`);
          this.isRunning = false;
          this.updateStatus('error', err.message);
        });

        this.process.on('exit', (code, signal) => {
          this.log(`Daemon exited with code ${code}, signal ${signal}`);
          this.isRunning = false;
          this.process = null;
          this.updateStatus('stopped');
        });

        // Give daemon time to start
        this.isRunning = true;
        this.updateStatus('starting');

        // Wait a bit then check if it's responding
        setTimeout(() => {
          if (this.isRunning) {
            this.updateStatus('running');
            resolve({ success: true, config: rpcConfig });
          }
        }, 2000);

      } catch (err) {
        this.log(`Failed to start daemon: ${err.message}`);
        resolve({ success: false, error: err.message });
      }
    });
  }

  async stop() {
    if (!this.isRunning || !this.process) {
      return { success: true, message: 'Daemon not running' };
    }

    this.log('Stopping daemon...');
    this.updateStatus('stopping');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.log('Force killing daemon...');
          this.process.kill('SIGKILL');
        }
        resolve({ success: true, message: 'Daemon force stopped' });
      }, 30000);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        this.isRunning = false;
        this.process = null;
        this.updateStatus('stopped');
        resolve({ success: true, message: 'Daemon stopped' });
      });

      // Send SIGTERM for graceful shutdown
      if (process.platform === 'win32') {
        this.process.kill();
      } else {
        this.process.kill('SIGTERM');
      }
    });
  }

  updateStatus(status, error = null) {
    if (this.onStatusChange) {
      this.onStatusChange(status, error);
    }
  }

  log(message) {
    console.log(message);
    if (this.onLog) {
      this.onLog(message);
    }
  }

  getRpcConfig() {
    return this.ensureConfig();
  }
}

module.exports = DaemonManager;
