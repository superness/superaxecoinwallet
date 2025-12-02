const fs = require('fs');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = this.getLogDir();
    this.logFile = path.join(this.logDir, 'wallet.log');
    this.maxSize = 10 * 1024 * 1024; // 10MB max log size
    this.ensureLogDir();
  }

  getLogDir() {
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(process.env.APPDATA, 'SuperAxeCoin', 'logs');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'SuperAxeCoin', 'logs');
    } else {
      return path.join(os.homedir(), '.superaxecoin', 'logs');
    }
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  rotateIfNeeded() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxSize) {
          const rotatedFile = this.logFile.replace('.log', `.${Date.now()}.log`);
          fs.renameSync(this.logFile, rotatedFile);

          // Keep only last 5 rotated logs
          const files = fs.readdirSync(this.logDir)
            .filter(f => f.startsWith('wallet.') && f.endsWith('.log') && f !== 'wallet.log')
            .sort()
            .reverse();

          files.slice(5).forEach(f => {
            fs.unlinkSync(path.join(this.logDir, f));
          });
        }
      }
    } catch (err) {
      console.error('Log rotation error:', err);
    }
  }

  formatMessage(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;

    if (data !== null) {
      if (typeof data === 'object') {
        try {
          logLine += ` | ${JSON.stringify(data)}`;
        } catch (e) {
          logLine += ` | [Object]`;
        }
      } else {
        logLine += ` | ${data}`;
      }
    }

    return logLine;
  }

  write(level, category, message, data = null) {
    const logLine = this.formatMessage(level, category, message, data);

    // Console output
    console.log(logLine);

    // File output
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFile, logLine + '\n');
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  info(category, message, data = null) {
    this.write('info', category, message, data);
  }

  warn(category, message, data = null) {
    this.write('warn', category, message, data);
  }

  error(category, message, data = null) {
    this.write('error', category, message, data);
  }

  debug(category, message, data = null) {
    this.write('debug', category, message, data);
  }

  // Log app lifecycle events
  appStart() {
    this.info('APP', '='.repeat(60));
    this.info('APP', 'SuperAxeCoin Wallet Starting');
    this.info('APP', `Version: ${require('../package.json').version}`);
    this.info('APP', `Platform: ${process.platform}`);
    this.info('APP', `Arch: ${process.arch}`);
    this.info('APP', `Node: ${process.version}`);
    this.info('APP', `Electron: ${process.versions.electron}`);
    this.info('APP', `Log file: ${this.logFile}`);
    this.info('APP', '='.repeat(60));
  }

  appQuit() {
    this.info('APP', 'SuperAxeCoin Wallet Shutting Down');
    this.info('APP', '='.repeat(60));
  }

  // Log daemon events
  daemonStart(daemonPath, dataDir) {
    this.info('DAEMON', 'Starting daemon', { path: daemonPath, dataDir });
  }

  daemonStarted(pid) {
    this.info('DAEMON', `Daemon started with PID: ${pid}`);
  }

  daemonStopping() {
    this.info('DAEMON', 'Stopping daemon...');
  }

  daemonStopped(code, signal) {
    this.info('DAEMON', `Daemon stopped`, { exitCode: code, signal });
  }

  daemonError(error) {
    this.error('DAEMON', 'Daemon error', { error: error.message || error });
  }

  daemonOutput(output) {
    this.debug('DAEMON', output.trim());
  }

  // Log RPC events
  rpcCall(method, params = []) {
    this.debug('RPC', `Calling ${method}`, { params });
  }

  rpcResponse(method, success, data = null) {
    if (success) {
      this.debug('RPC', `${method} succeeded`);
    } else {
      this.warn('RPC', `${method} failed`, data);
    }
  }

  rpcError(method, error) {
    this.error('RPC', `${method} error`, { error: error.message || error });
  }

  // Log config events
  configLoaded(config) {
    // Don't log password
    const safeConfig = { ...config, pass: config.pass ? '***' : '' };
    this.info('CONFIG', 'Configuration loaded', safeConfig);
  }

  configCreated(configPath) {
    this.info('CONFIG', `Created new config file: ${configPath}`);
  }

  // Log wallet events
  walletAction(action, details = null) {
    this.info('WALLET', action, details);
  }

  // Get log file path for display
  getLogPath() {
    return this.logFile;
  }
}

// Singleton
module.exports = new Logger();
