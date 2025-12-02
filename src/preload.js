const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Daemon management
  startDaemon: () => ipcRenderer.invoke('daemon:start'),
  stopDaemon: () => ipcRenderer.invoke('daemon:stop'),
  getDaemonStatus: () => ipcRenderer.invoke('daemon:status'),

  // Daemon events
  onDaemonStatus: (callback) => {
    ipcRenderer.on('daemon:status', (event, data) => callback(data));
  },
  onDaemonLog: (callback) => {
    ipcRenderer.on('daemon:log', (event, message) => callback(message));
  },
  onDaemonStarted: (callback) => {
    ipcRenderer.on('daemon:started', (event, config) => callback(config));
  },

  // Wallet events
  onWalletLoaded: (callback) => {
    ipcRenderer.on('wallet:loaded', (event, data) => callback(data));
  },
  onWalletError: (callback) => {
    ipcRenderer.on('wallet:error', (event, data) => callback(data));
  },

  // Blockchain
  getBlockchainInfo: () => ipcRenderer.invoke('rpc:getblockchaininfo'),

  // Wallet
  getWalletInfo: () => ipcRenderer.invoke('rpc:getwalletinfo'),
  getBalance: () => ipcRenderer.invoke('rpc:getbalance'),

  // Addresses
  getNewAddress: (label) => ipcRenderer.invoke('rpc:getnewaddress', label),
  listAddresses: () => ipcRenderer.invoke('rpc:listaddresses'),
  validateAddress: (address) => ipcRenderer.invoke('rpc:validateaddress', address),
  getAddressInfo: (address) => ipcRenderer.invoke('rpc:getaddressinfo', address),

  // Transactions
  listTransactions: (count) => ipcRenderer.invoke('rpc:listtransactions', count),
  sendToAddress: (address, amount) => ipcRenderer.invoke('rpc:sendtoaddress', address, amount),

  // Network
  getPeerInfo: () => ipcRenderer.invoke('rpc:getpeerinfo'),
  getNetworkInfo: () => ipcRenderer.invoke('rpc:getnetworkinfo'),

  // Config
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  getConfig: () => ipcRenderer.invoke('config:get'),

  // Logging
  openLogFile: () => ipcRenderer.invoke('app:openLogFile'),
  getLogPath: () => ipcRenderer.invoke('app:getLogPath'),

  // ============================================================================
  // Phase 1.1: Network/Peers Page
  // ============================================================================
  listBanned: () => ipcRenderer.invoke('rpc:listbanned'),
  setBan: (ip, action, bantime) => ipcRenderer.invoke('rpc:setban', ip, action, bantime),
  disconnectNode: (ip) => ipcRenderer.invoke('rpc:disconnectnode', ip),

  // ============================================================================
  // Phase 1.2: Debug Console
  // ============================================================================
  rpcExecute: (method, params) => ipcRenderer.invoke('rpc:execute', method, params),
  rpcHelp: (command) => ipcRenderer.invoke('rpc:help', command),

  // ============================================================================
  // Phase 2.1: Transaction Details
  // ============================================================================
  getTransaction: (txid) => ipcRenderer.invoke('rpc:gettransaction', txid),
  getRawTransaction: (txid) => ipcRenderer.invoke('rpc:getrawtransaction', txid),
  decodeRawTransaction: (hex) => ipcRenderer.invoke('rpc:decoderawtransaction', hex),

  // ============================================================================
  // Phase 3.1: Wallet Encryption
  // ============================================================================
  encryptWallet: (passphrase) => ipcRenderer.invoke('rpc:encryptwallet', passphrase),
  walletPassphrase: (passphrase, timeout) => ipcRenderer.invoke('rpc:walletpassphrase', passphrase, timeout),
  walletLock: () => ipcRenderer.invoke('rpc:walletlock'),
  walletPassphraseChange: (oldPass, newPass) => ipcRenderer.invoke('rpc:walletpassphrasechange', oldPass, newPass),

  // ============================================================================
  // Phase 3.2: Wallet Backup
  // ============================================================================
  backupWallet: (destination) => ipcRenderer.invoke('rpc:backupwallet', destination),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),

  // ============================================================================
  // Phase 4.1: Fee Estimation
  // ============================================================================
  estimateSmartFee: (confTarget) => ipcRenderer.invoke('rpc:estimatesmartfee', confTarget),
  setTxFee: (amount) => ipcRenderer.invoke('rpc:settxfee', amount),

  // ============================================================================
  // Phase 4.2: Coin Control
  // ============================================================================
  listUnspent: (minconf, maxconf) => ipcRenderer.invoke('rpc:listunspent', minconf, maxconf),
  createRawTransaction: (inputs, outputs) => ipcRenderer.invoke('rpc:createrawtransaction', inputs, outputs),
  fundRawTransaction: (hexstring, options) => ipcRenderer.invoke('rpc:fundrawtransaction', hexstring, options),
  signRawTransactionWithWallet: (hexstring) => ipcRenderer.invoke('rpc:signrawtransactionwithwallet', hexstring),
  sendRawTransaction: (hexstring) => ipcRenderer.invoke('rpc:sendrawtransaction', hexstring),

  // ============================================================================
  // Phase 5.1: Address Book (Contacts)
  // ============================================================================
  listContacts: () => ipcRenderer.invoke('contacts:list'),
  addContact: (contact) => ipcRenderer.invoke('contacts:add', contact),
  updateContact: (id, updates) => ipcRenderer.invoke('contacts:update', id, updates),
  deleteContact: (id) => ipcRenderer.invoke('contacts:delete', id),
  exportContacts: () => ipcRenderer.invoke('contacts:export'),
  importContacts: () => ipcRenderer.invoke('contacts:import'),

  // ============================================================================
  // Phase 6.1: Multi-Wallet Support
  // ============================================================================
  listWalletDir: () => ipcRenderer.invoke('rpc:listwalletdir'),
  listWallets: () => ipcRenderer.invoke('rpc:listwallets'),
  loadWallet: (walletName) => ipcRenderer.invoke('rpc:loadwallet', walletName),
  unloadWallet: (walletName) => ipcRenderer.invoke('rpc:unloadwallet', walletName),
  createWallet: (walletName) => ipcRenderer.invoke('rpc:createwallet', walletName),

  // ============================================================================
  // Phase 7.1: Message Signing
  // ============================================================================
  signMessage: (address, message) => ipcRenderer.invoke('rpc:signmessage', address, message),
  verifyMessage: (address, signature, message) => ipcRenderer.invoke('rpc:verifymessage', address, signature, message),

  // ============================================================================
  // QR Code Generation
  // ============================================================================
  generateQRCode: (text) => ipcRenderer.invoke('qrcode:generate', text),

  // ============================================================================
  // Wallet File Import
  // ============================================================================
  importWallet: () => ipcRenderer.invoke('wallet:import')
});
