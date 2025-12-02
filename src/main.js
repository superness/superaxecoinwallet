const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const RpcClient = require('./rpc');
const DaemonManager = require('./daemon');
const logger = require('./logger');
const CliParser = require('./cli');

// Parse CLI arguments
const cli = new CliParser();

// Show help and exit if requested
if (cli.shouldShowHelp()) {
  console.log(cli.getHelpMessage());
  process.exit(0);
}

let mainWindow;
let rpcClient;
let daemonManager;

// Contacts storage path
const contactsPath = path.join(app.getPath('userData'), 'contacts.json');

function createWindow() {
  logger.info('APP', 'Creating main window');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: process.platform === 'win32'
      ? path.join(__dirname, '../assets/icon.ico')
      : path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'default',
    backgroundColor: '#f8fafc'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open DevTools in development or if --dev flag is passed
  if (cli.isDevMode()) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    logger.info('APP', 'Main window closed');
    mainWindow = null;
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

async function ensureWalletLoaded() {
  const DEFAULT_WALLET = 'default_wallet';

  try {
    // Check if any wallet is loaded
    logger.info('WALLET', 'Checking for loaded wallets...');
    const wallets = await rpcClient.call('listwallets');

    if (wallets && wallets.length > 0) {
      logger.info('WALLET', `Wallet already loaded: ${wallets[0]}`);
      rpcClient.setWallet(wallets[0]);
      sendToRenderer('wallet:loaded', { name: wallets[0] });
      return;
    }

    // Try to load existing default wallet
    logger.info('WALLET', `Attempting to load wallet: ${DEFAULT_WALLET}`);
    try {
      await rpcClient.call('loadwallet', [DEFAULT_WALLET]);
      logger.info('WALLET', `Loaded existing wallet: ${DEFAULT_WALLET}`);
      rpcClient.setWallet(DEFAULT_WALLET);
      sendToRenderer('wallet:loaded', { name: DEFAULT_WALLET });
      return;
    } catch (loadErr) {
      // Wallet doesn't exist, create it
      logger.info('WALLET', `Wallet not found, creating: ${DEFAULT_WALLET}`);
    }

    // Create new wallet
    await rpcClient.call('createwallet', [DEFAULT_WALLET]);
    logger.info('WALLET', `Created new wallet: ${DEFAULT_WALLET}`);
    rpcClient.setWallet(DEFAULT_WALLET);
    sendToRenderer('wallet:loaded', { name: DEFAULT_WALLET, isNew: true });

  } catch (error) {
    logger.error('WALLET', 'Failed to ensure wallet loaded', { error: error.message });
    sendToRenderer('wallet:error', { error: error.message });
  }
}

app.whenReady().then(async () => {
  logger.appStart();
  logger.info('CLI', `Network: ${cli.getNetwork()}, DataDir: ${cli.getDataDir() || 'default'}`);
  logger.info('CLI', `Daemon args: ${cli.getDaemonArgs().join(' ') || '(none)'}`);

  // Initialize daemon manager with CLI options
  const customDataDir = cli.getDataDir();
  const daemonArgs = cli.getDaemonArgs();
  daemonManager = new DaemonManager(customDataDir, daemonArgs);

  daemonManager.onStatusChange = (status, error) => {
    logger.info('DAEMON', `Status changed: ${status}`, error ? { error } : null);
    sendToRenderer('daemon:status', { status, error });
  };

  daemonManager.onLog = (message) => {
    logger.daemonOutput(message);
    sendToRenderer('daemon:log', message);
  };

  // Get RPC config (creates config file if needed)
  const rpcConfig = daemonManager.getRpcConfig();

  // Apply CLI RPC overrides
  const rpcOverrides = cli.getRpcOverrides();
  if (rpcOverrides.port) rpcConfig.port = rpcOverrides.port;
  if (rpcOverrides.user) rpcConfig.user = rpcOverrides.user;
  if (rpcOverrides.pass) rpcConfig.pass = rpcOverrides.pass;

  logger.configLoaded(rpcConfig);
  rpcClient = new RpcClient(rpcConfig);

  createWindow();

  // Auto-start daemon after window is ready
  mainWindow.webContents.on('did-finish-load', async () => {
    logger.info('APP', 'Window loaded, starting daemon');
    sendToRenderer('daemon:status', { status: 'starting' });

    const result = await daemonManager.start();

    if (result.success) {
      logger.info('DAEMON', 'Daemon start successful');
      // Update RPC client with config from daemon manager
      rpcClient = new RpcClient(result.config);
      sendToRenderer('daemon:status', { status: 'running' });
      sendToRenderer('daemon:started', result.config);

      // Wait for daemon to be fully ready, then ensure wallet is loaded
      setTimeout(async () => {
        await ensureWalletLoaded();
      }, 3000);
    } else {
      logger.error('DAEMON', 'Daemon start failed', { error: result.error });
      sendToRenderer('daemon:status', { status: 'error', error: result.error });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async (event) => {
  if (daemonManager && daemonManager.isRunning) {
    event.preventDefault();
    logger.info('APP', 'Quit requested, stopping daemon first');
    sendToRenderer('daemon:status', { status: 'stopping' });
    await daemonManager.stop();
    logger.appQuit();
    app.quit();
  } else {
    logger.appQuit();
  }
});

app.on('window-all-closed', async () => {
  logger.info('APP', 'All windows closed');
  if (daemonManager && daemonManager.isRunning) {
    await daemonManager.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Daemon IPC Handlers
ipcMain.handle('daemon:start', async () => {
  logger.info('IPC', 'daemon:start requested');
  const result = await daemonManager.start();
  if (result.success && result.config) {
    rpcClient = new RpcClient(result.config);
  }
  return result;
});

ipcMain.handle('daemon:stop', async () => {
  logger.info('IPC', 'daemon:stop requested');
  return await daemonManager.stop();
});

ipcMain.handle('daemon:status', async () => {
  return {
    isRunning: daemonManager.isRunning,
    dataDir: daemonManager.dataDir
  };
});

ipcMain.handle('app:openLogFile', async () => {
  const logPath = logger.getLogPath();
  logger.info('APP', `Opening log file: ${logPath}`);
  shell.openPath(logPath);
  return logPath;
});

ipcMain.handle('app:getLogPath', async () => {
  return logger.getLogPath();
});

// RPC IPC Handlers with logging
ipcMain.handle('rpc:getblockchaininfo', async () => {
  logger.rpcCall('getblockchaininfo');
  try {
    const result = await rpcClient.call('getblockchaininfo');
    logger.rpcResponse('getblockchaininfo', true);
    return result;
  } catch (error) {
    logger.rpcError('getblockchaininfo', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getwalletinfo', async () => {
  logger.rpcCall('getwalletinfo');
  try {
    const result = await rpcClient.call('getwalletinfo');
    logger.rpcResponse('getwalletinfo', true);
    return result;
  } catch (error) {
    logger.rpcError('getwalletinfo', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getbalance', async () => {
  logger.rpcCall('getbalance');
  try {
    const result = await rpcClient.call('getbalance');
    logger.rpcResponse('getbalance', true);
    return result;
  } catch (error) {
    logger.rpcError('getbalance', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getnewaddress', async (event, label = '') => {
  logger.rpcCall('getnewaddress', [label]);
  try {
    const result = await rpcClient.call('getnewaddress', [label]);
    logger.rpcResponse('getnewaddress', true);
    logger.walletAction('Generated new address', { label });
    return result;
  } catch (error) {
    logger.rpcError('getnewaddress', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:listaddresses', async () => {
  logger.rpcCall('listreceivedbyaddress');
  try {
    const result = await rpcClient.call('listreceivedbyaddress', [0, true]);
    logger.rpcResponse('listreceivedbyaddress', true);
    return result;
  } catch (error) {
    logger.rpcError('listreceivedbyaddress', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:listtransactions', async (event, count = 10) => {
  logger.rpcCall('listtransactions', ['*', count]);
  try {
    const result = await rpcClient.call('listtransactions', ['*', count]);
    logger.rpcResponse('listtransactions', true);
    return result;
  } catch (error) {
    logger.rpcError('listtransactions', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:sendtoaddress', async (event, address, amount) => {
  logger.rpcCall('sendtoaddress', [address, amount]);
  logger.walletAction('Sending transaction', { to: address, amount });
  try {
    const result = await rpcClient.call('sendtoaddress', [address, amount]);
    logger.rpcResponse('sendtoaddress', true);
    logger.walletAction('Transaction sent', { txid: result, to: address, amount });
    return result;
  } catch (error) {
    logger.rpcError('sendtoaddress', error);
    logger.walletAction('Transaction failed', { to: address, amount, error: error.message });
    return { error: error.message };
  }
});

ipcMain.handle('rpc:validateaddress', async (event, address) => {
  logger.rpcCall('validateaddress', [address]);
  try {
    const result = await rpcClient.call('validateaddress', [address]);
    logger.rpcResponse('validateaddress', true);
    return result;
  } catch (error) {
    logger.rpcError('validateaddress', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getpeerinfo', async () => {
  logger.rpcCall('getpeerinfo');
  try {
    const result = await rpcClient.call('getpeerinfo');
    logger.rpcResponse('getpeerinfo', true);
    return result;
  } catch (error) {
    logger.rpcError('getpeerinfo', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getnetworkinfo', async () => {
  logger.rpcCall('getnetworkinfo');
  try {
    const result = await rpcClient.call('getnetworkinfo');
    logger.rpcResponse('getnetworkinfo', true);
    return result;
  } catch (error) {
    logger.rpcError('getnetworkinfo', error);
    return { error: error.message };
  }
});

ipcMain.handle('config:set', async (event, config) => {
  logger.info('CONFIG', 'Updating RPC configuration');
  rpcClient = new RpcClient(config);
  logger.configLoaded(config);
  return { success: true };
});

ipcMain.handle('config:get', async () => {
  return rpcClient.config;
});

// ============================================================================
// Phase 1.1: Network/Peers Page - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:listbanned', async () => {
  logger.rpcCall('listbanned');
  try {
    const result = await rpcClient.call('listbanned');
    logger.rpcResponse('listbanned', true);
    return result;
  } catch (error) {
    logger.rpcError('listbanned', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:setban', async (event, ip, action, bantime = 86400) => {
  logger.rpcCall('setban', [ip, action, bantime]);
  try {
    const result = await rpcClient.call('setban', [ip, action, bantime]);
    logger.rpcResponse('setban', true);
    return result;
  } catch (error) {
    logger.rpcError('setban', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:disconnectnode', async (event, ip) => {
  logger.rpcCall('disconnectnode', [ip]);
  try {
    const result = await rpcClient.call('disconnectnode', [ip]);
    logger.rpcResponse('disconnectnode', true);
    return result;
  } catch (error) {
    logger.rpcError('disconnectnode', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 1.2: Debug Console - IPC Handler
// ============================================================================

ipcMain.handle('rpc:execute', async (event, method, params = []) => {
  logger.rpcCall(method, params);
  try {
    const result = await rpcClient.call(method, params);
    logger.rpcResponse(method, true);
    return result;
  } catch (error) {
    logger.rpcError(method, error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:help', async (event, command = '') => {
  logger.rpcCall('help', [command]);
  try {
    const result = await rpcClient.call('help', command ? [command] : []);
    logger.rpcResponse('help', true);
    return result;
  } catch (error) {
    logger.rpcError('help', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 2.1: Transaction Details - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:gettransaction', async (event, txid) => {
  logger.rpcCall('gettransaction', [txid]);
  try {
    const result = await rpcClient.call('gettransaction', [txid, true]);
    logger.rpcResponse('gettransaction', true);
    return result;
  } catch (error) {
    logger.rpcError('gettransaction', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getrawtransaction', async (event, txid) => {
  logger.rpcCall('getrawtransaction', [txid, true]);
  try {
    const result = await rpcClient.call('getrawtransaction', [txid, true]);
    logger.rpcResponse('getrawtransaction', true);
    return result;
  } catch (error) {
    logger.rpcError('getrawtransaction', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:decoderawtransaction', async (event, hex) => {
  logger.rpcCall('decoderawtransaction', [hex]);
  try {
    const result = await rpcClient.call('decoderawtransaction', [hex]);
    logger.rpcResponse('decoderawtransaction', true);
    return result;
  } catch (error) {
    logger.rpcError('decoderawtransaction', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 3.1: Wallet Encryption - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:encryptwallet', async (event, passphrase) => {
  logger.rpcCall('encryptwallet', ['***']);
  logger.walletAction('Encrypting wallet');
  try {
    const result = await rpcClient.call('encryptwallet', [passphrase]);
    logger.rpcResponse('encryptwallet', true);
    logger.walletAction('Wallet encrypted - restart required');
    return result;
  } catch (error) {
    logger.rpcError('encryptwallet', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:walletpassphrase', async (event, passphrase, timeout) => {
  logger.rpcCall('walletpassphrase', ['***', timeout]);
  try {
    const result = await rpcClient.call('walletpassphrase', [passphrase, timeout]);
    logger.rpcResponse('walletpassphrase', true);
    logger.walletAction('Wallet unlocked', { timeout });
    return result;
  } catch (error) {
    logger.rpcError('walletpassphrase', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:walletlock', async () => {
  logger.rpcCall('walletlock');
  try {
    const result = await rpcClient.call('walletlock');
    logger.rpcResponse('walletlock', true);
    logger.walletAction('Wallet locked');
    return result;
  } catch (error) {
    logger.rpcError('walletlock', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:walletpassphrasechange', async (event, oldPass, newPass) => {
  logger.rpcCall('walletpassphrasechange', ['***', '***']);
  logger.walletAction('Changing wallet passphrase');
  try {
    const result = await rpcClient.call('walletpassphrasechange', [oldPass, newPass]);
    logger.rpcResponse('walletpassphrasechange', true);
    logger.walletAction('Wallet passphrase changed');
    return result;
  } catch (error) {
    logger.rpcError('walletpassphrasechange', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 3.2: Wallet Backup - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:backupwallet', async (event, destination) => {
  logger.rpcCall('backupwallet', [destination]);
  logger.walletAction('Backing up wallet', { destination });
  try {
    const result = await rpcClient.call('backupwallet', [destination]);
    logger.rpcResponse('backupwallet', true);
    logger.walletAction('Wallet backup complete', { destination });
    return result;
  } catch (error) {
    logger.rpcError('backupwallet', error);
    return { error: error.message };
  }
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  logger.info('DIALOG', 'Opening save file dialog');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || 'wallet_backup.dat',
    filters: options.filters || [{ name: 'Wallet Files', extensions: ['dat'] }]
  });
  return result;
});

ipcMain.handle('dialog:openFile', async (event, options) => {
  logger.info('DIALOG', 'Opening open file dialog');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || 'Open File',
    filters: options.filters || [{ name: 'Wallet Files', extensions: ['dat'] }],
    properties: ['openFile']
  });
  return result;
});

// ============================================================================
// Phase 4.1: Fee Estimation - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:estimatesmartfee', async (event, confTarget) => {
  logger.rpcCall('estimatesmartfee', [confTarget]);
  try {
    const result = await rpcClient.call('estimatesmartfee', [confTarget]);
    logger.rpcResponse('estimatesmartfee', true);
    return result;
  } catch (error) {
    logger.rpcError('estimatesmartfee', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:settxfee', async (event, amount) => {
  logger.rpcCall('settxfee', [amount]);
  try {
    const result = await rpcClient.call('settxfee', [amount]);
    logger.rpcResponse('settxfee', true);
    return result;
  } catch (error) {
    logger.rpcError('settxfee', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 4.2: Coin Control - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:listunspent', async (event, minconf = 1, maxconf = 9999999) => {
  logger.rpcCall('listunspent', [minconf, maxconf]);
  try {
    const result = await rpcClient.call('listunspent', [minconf, maxconf]);
    logger.rpcResponse('listunspent', true);
    return result;
  } catch (error) {
    logger.rpcError('listunspent', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:createrawtransaction', async (event, inputs, outputs) => {
  logger.rpcCall('createrawtransaction', [inputs, outputs]);
  try {
    const result = await rpcClient.call('createrawtransaction', [inputs, outputs]);
    logger.rpcResponse('createrawtransaction', true);
    return result;
  } catch (error) {
    logger.rpcError('createrawtransaction', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:fundrawtransaction', async (event, hexstring, options = {}) => {
  logger.rpcCall('fundrawtransaction', [hexstring, options]);
  try {
    const result = await rpcClient.call('fundrawtransaction', [hexstring, options]);
    logger.rpcResponse('fundrawtransaction', true);
    return result;
  } catch (error) {
    logger.rpcError('fundrawtransaction', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:signrawtransactionwithwallet', async (event, hexstring) => {
  logger.rpcCall('signrawtransactionwithwallet', [hexstring]);
  try {
    const result = await rpcClient.call('signrawtransactionwithwallet', [hexstring]);
    logger.rpcResponse('signrawtransactionwithwallet', true);
    return result;
  } catch (error) {
    logger.rpcError('signrawtransactionwithwallet', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:sendrawtransaction', async (event, hexstring) => {
  logger.rpcCall('sendrawtransaction', [hexstring]);
  logger.walletAction('Broadcasting raw transaction');
  try {
    const result = await rpcClient.call('sendrawtransaction', [hexstring]);
    logger.rpcResponse('sendrawtransaction', true);
    logger.walletAction('Raw transaction broadcast', { txid: result });
    return result;
  } catch (error) {
    logger.rpcError('sendrawtransaction', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 5.1: Address Book (Contacts) - IPC Handlers
// ============================================================================

function loadContacts() {
  try {
    if (fs.existsSync(contactsPath)) {
      return JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
    }
  } catch (error) {
    logger.error('CONTACTS', 'Failed to load contacts', { error: error.message });
  }
  return [];
}

function saveContacts(contacts) {
  try {
    fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
    return true;
  } catch (error) {
    logger.error('CONTACTS', 'Failed to save contacts', { error: error.message });
    return false;
  }
}

ipcMain.handle('contacts:list', async () => {
  logger.info('CONTACTS', 'Listing contacts');
  return loadContacts();
});

ipcMain.handle('contacts:add', async (event, contact) => {
  logger.info('CONTACTS', 'Adding contact', { label: contact.label });
  const contacts = loadContacts();
  contact.id = Date.now().toString();
  contacts.push(contact);
  if (saveContacts(contacts)) {
    return { success: true, contact };
  }
  return { error: 'Failed to save contact' };
});

ipcMain.handle('contacts:update', async (event, id, updates) => {
  logger.info('CONTACTS', 'Updating contact', { id });
  const contacts = loadContacts();
  const index = contacts.findIndex(c => c.id === id);
  if (index === -1) {
    return { error: 'Contact not found' };
  }
  contacts[index] = { ...contacts[index], ...updates };
  if (saveContacts(contacts)) {
    return { success: true, contact: contacts[index] };
  }
  return { error: 'Failed to save contact' };
});

ipcMain.handle('contacts:delete', async (event, id) => {
  logger.info('CONTACTS', 'Deleting contact', { id });
  const contacts = loadContacts();
  const filtered = contacts.filter(c => c.id !== id);
  if (saveContacts(filtered)) {
    return { success: true };
  }
  return { error: 'Failed to delete contact' };
});

ipcMain.handle('contacts:export', async () => {
  logger.info('CONTACTS', 'Exporting contacts');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Contacts',
    defaultPath: 'contacts.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  if (!result.canceled && result.filePath) {
    const contacts = loadContacts();
    fs.writeFileSync(result.filePath, JSON.stringify(contacts, null, 2));
    return { success: true, path: result.filePath };
  }
  return { canceled: true };
});

ipcMain.handle('contacts:import', async () => {
  logger.info('CONTACTS', 'Importing contacts');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Contacts',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const imported = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const existing = loadContacts();
      // Merge imported contacts, updating IDs to avoid conflicts
      const merged = [...existing];
      for (const contact of imported) {
        contact.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        merged.push(contact);
      }
      if (saveContacts(merged)) {
        return { success: true, count: imported.length };
      }
    } catch (error) {
      return { error: 'Failed to import contacts: ' + error.message };
    }
  }
  return { canceled: true };
});

// ============================================================================
// Phase 6.1: Multi-Wallet Support - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:listwalletdir', async () => {
  logger.rpcCall('listwalletdir');
  try {
    const result = await rpcClient.call('listwalletdir');
    logger.rpcResponse('listwalletdir', true);
    return result;
  } catch (error) {
    logger.rpcError('listwalletdir', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:listwallets', async () => {
  logger.rpcCall('listwallets');
  try {
    const result = await rpcClient.call('listwallets');
    logger.rpcResponse('listwallets', true);
    return result;
  } catch (error) {
    logger.rpcError('listwallets', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:loadwallet', async (event, walletName) => {
  logger.rpcCall('loadwallet', [walletName]);
  logger.walletAction('Loading wallet', { name: walletName });
  try {
    const result = await rpcClient.call('loadwallet', [walletName]);
    rpcClient.setWallet(walletName);
    logger.rpcResponse('loadwallet', true);
    logger.walletAction('Wallet loaded', { name: walletName });
    return result;
  } catch (error) {
    logger.rpcError('loadwallet', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:unloadwallet', async (event, walletName) => {
  logger.rpcCall('unloadwallet', [walletName]);
  logger.walletAction('Unloading wallet', { name: walletName });
  try {
    const result = await rpcClient.call('unloadwallet', [walletName]);
    logger.rpcResponse('unloadwallet', true);
    logger.walletAction('Wallet unloaded', { name: walletName });
    return result;
  } catch (error) {
    logger.rpcError('unloadwallet', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:createwallet', async (event, walletName) => {
  logger.rpcCall('createwallet', [walletName]);
  logger.walletAction('Creating wallet', { name: walletName });
  try {
    const result = await rpcClient.call('createwallet', [walletName]);
    rpcClient.setWallet(walletName);
    logger.rpcResponse('createwallet', true);
    logger.walletAction('Wallet created', { name: walletName });
    return result;
  } catch (error) {
    logger.rpcError('createwallet', error);
    return { error: error.message };
  }
});

// ============================================================================
// Phase 7.1: Message Signing - IPC Handlers
// ============================================================================

ipcMain.handle('rpc:signmessage', async (event, address, message) => {
  logger.rpcCall('signmessage', [address, message]);
  try {
    const result = await rpcClient.call('signmessage', [address, message]);
    logger.rpcResponse('signmessage', true);
    return result;
  } catch (error) {
    logger.rpcError('signmessage', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:verifymessage', async (event, address, signature, message) => {
  logger.rpcCall('verifymessage', [address, signature, message]);
  try {
    const result = await rpcClient.call('verifymessage', [address, signature, message]);
    logger.rpcResponse('verifymessage', true);
    return result;
  } catch (error) {
    logger.rpcError('verifymessage', error);
    return { error: error.message };
  }
});

ipcMain.handle('rpc:getaddressinfo', async (event, address) => {
  logger.rpcCall('getaddressinfo', [address]);
  try {
    const result = await rpcClient.call('getaddressinfo', [address]);
    logger.rpcResponse('getaddressinfo', true);
    return result;
  } catch (error) {
    logger.rpcError('getaddressinfo', error);
    return { error: error.message };
  }
});

// ============================================================================
// QR Code Generation
// ============================================================================

ipcMain.handle('qrcode:generate', async (event, text) => {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 140,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return dataUrl;
  } catch (error) {
    logger.error('QRCODE', 'Failed to generate QR code', { error: error.message });
    return null;
  }
});

// ============================================================================
// Wallet File Import
// ============================================================================

ipcMain.handle('wallet:import', async () => {
  logger.info('WALLET', 'Starting wallet import');

  // Show file picker dialog
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Wallet File',
    filters: [{ name: 'Wallet Files', extensions: ['dat'] }],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const sourcePath = result.filePaths[0];
  const fileName = path.basename(sourcePath, '.dat');

  // Generate a unique wallet name based on file name
  let walletName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (walletName === 'wallet') {
    walletName = 'imported_wallet';
  }

  try {
    // Get the wallet directory from daemon manager
    const walletsDir = path.join(daemonManager.dataDir, 'wallets');

    // Ensure wallets directory exists
    if (!fs.existsSync(walletsDir)) {
      fs.mkdirSync(walletsDir, { recursive: true });
    }

    // Create a new directory for this wallet
    let targetDir = path.join(walletsDir, walletName);
    let counter = 1;
    while (fs.existsSync(targetDir)) {
      walletName = `${fileName}_${counter}`;
      targetDir = path.join(walletsDir, walletName);
      counter++;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    // Copy the wallet.dat file
    const targetPath = path.join(targetDir, 'wallet.dat');
    fs.copyFileSync(sourcePath, targetPath);

    logger.info('WALLET', `Wallet file copied to ${targetPath}`);

    // Load the wallet via RPC
    const loadResult = await rpcClient.call('loadwallet', [walletName]);
    rpcClient.setWallet(walletName);

    logger.walletAction('Imported wallet', { name: walletName });

    return {
      success: true,
      walletName: walletName,
      message: `Wallet "${walletName}" imported and loaded successfully`
    };
  } catch (error) {
    logger.error('WALLET', 'Failed to import wallet', { error: error.message });
    return { error: error.message };
  }
});
