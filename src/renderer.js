// ============================================================================
// State Management
// ============================================================================

let daemonReady = false;
let allTransactions = [];
let selectedUtxos = [];
let consoleHistory = [];
let consoleHistoryIndex = -1;
let unlockEndTime = null;

// ============================================================================
// Daemon Status Handling
// ============================================================================

window.api.onDaemonStatus((data) => {
  console.log('Daemon status:', data);
  updateDaemonStatus(data.status, data.error);
});

window.api.onDaemonStarted((config) => {
  console.log('Daemon started with config:', config);
  daemonReady = true;
  setTimeout(() => {
    refreshDashboard();
  }, 3000);
});

window.api.onDaemonLog((message) => {
  console.log('Daemon:', message);
});

// Wallet event handlers
window.api.onWalletLoaded((data) => {
  console.log('Wallet loaded:', data);
  if (data.isNew) {
    console.log('New wallet created - first time setup');
  }
  daemonReady = true;
  refreshDashboard();
  loadWalletList();
  checkEncryptionStatus();
});

window.api.onWalletError((data) => {
  console.error('Wallet error:', data.error);
  const statusEl = document.getElementById('connectionStatus');
  const text = statusEl.querySelector('span:last-child');
  text.textContent = `Wallet Error`;
});

function updateDaemonStatus(status, error = null) {
  const statusEl = document.getElementById('connectionStatus');
  const dot = statusEl.querySelector('.status-dot');
  const text = statusEl.querySelector('span:last-child');

  dot.className = 'status-dot';

  switch (status) {
    case 'starting':
      dot.classList.add('syncing');
      text.textContent = 'Starting daemon...';
      break;
    case 'running':
      dot.classList.add('syncing');
      text.textContent = 'Daemon running...';
      break;
    case 'stopping':
      dot.classList.add('syncing');
      text.textContent = 'Stopping daemon...';
      break;
    case 'stopped':
      dot.classList.add('disconnected');
      text.textContent = 'Daemon stopped';
      break;
    case 'error':
      dot.classList.add('disconnected');
      text.textContent = error ? `Error: ${error.substring(0, 30)}...` : 'Error';
      break;
    default:
      dot.classList.add('disconnected');
      text.textContent = 'Unknown';
  }
}

// ============================================================================
// Navigation
// ============================================================================

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const pageName = item.dataset.page;

    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    pages.forEach(page => page.classList.remove('active'));
    document.getElementById(`page-${pageName}`).classList.add('active');

    // Refresh data when switching pages
    if (pageName === 'dashboard') refreshDashboard();
    if (pageName === 'transactions') loadTransactions();
    if (pageName === 'receive') loadAddresses();
    if (pageName === 'send') { updateAvailableBalance(); loadFeeEstimates(); }
    if (pageName === 'network') loadNetworkData();
    if (pageName === 'contacts') loadContacts();
    if (pageName === 'settings') checkEncryptionStatus();
  });
});

// ============================================================================
// Dashboard
// ============================================================================

async function refreshDashboard() {
  if (!daemonReady) {
    console.log('Daemon not ready yet, skipping refresh');
    return;
  }

  try {
    const [balance, blockchainInfo, networkInfo] = await Promise.all([
      window.api.getBalance(),
      window.api.getBlockchainInfo(),
      window.api.getNetworkInfo()
    ]);

    if (!balance.error) {
      document.getElementById('balance').textContent = `${parseFloat(balance).toFixed(8)} AXE`;
    }

    if (!blockchainInfo.error) {
      document.getElementById('blockHeight').textContent = blockchainInfo.blocks.toLocaleString();
      const progress = blockchainInfo.verificationprogress * 100;
      document.getElementById('syncStatus').textContent = progress >= 99.9 ? 'Synced' : `${progress.toFixed(1)}%`;

      updateConnectionStatus(true, progress < 99.9);
    } else {
      updateConnectionStatus(false);
    }

    if (!networkInfo.error) {
      document.getElementById('connections').textContent = networkInfo.connections;
    }

    loadRecentTransactions();
  } catch (error) {
    console.error('Dashboard refresh error:', error);
    updateConnectionStatus(false);
  }
}

async function loadRecentTransactions() {
  const txList = document.getElementById('recentTxList');
  try {
    const transactions = await window.api.listTransactions(5);

    if (transactions.error) {
      txList.innerHTML = `<p class="empty-state">${transactions.error}</p>`;
      return;
    }

    if (transactions.length === 0) {
      txList.innerHTML = '<p class="empty-state">No transactions yet</p>';
      return;
    }

    txList.innerHTML = transactions.reverse().map(tx => `
      <div class="tx-item" data-txid="${tx.txid}">
        <div class="tx-info">
          <div class="tx-address">${tx.address || 'Unknown'}</div>
          <div class="tx-date">${new Date(tx.time * 1000).toLocaleString()}</div>
        </div>
        <div class="tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}">
          ${tx.amount >= 0 ? '+' : ''}${parseFloat(tx.amount).toFixed(8)} AXE
        </div>
      </div>
    `).join('');

    // Add click handlers for transaction details
    txList.querySelectorAll('.tx-item').forEach(item => {
      item.addEventListener('click', () => showTransactionDetails(item.dataset.txid));
    });
  } catch (error) {
    txList.innerHTML = `<p class="empty-state">Error loading transactions</p>`;
  }
}

// ============================================================================
// Send Page
// ============================================================================

const sendForm = document.getElementById('sendForm');
const sendAddress = document.getElementById('sendAddress');
const addressValidation = document.getElementById('addressValidation');
const sendResult = document.getElementById('sendResult');

sendAddress.addEventListener('input', async () => {
  const address = sendAddress.value.trim();
  if (address.length < 20) {
    addressValidation.textContent = '';
    addressValidation.className = 'validation-msg';
    return;
  }

  const result = await window.api.validateAddress(address);
  if (result.isvalid) {
    addressValidation.textContent = 'Valid address';
    addressValidation.className = 'validation-msg valid';
  } else {
    addressValidation.textContent = 'Invalid address';
    addressValidation.className = 'validation-msg invalid';
  }
});

sendForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const address = sendAddress.value.trim();
  const amount = parseFloat(document.getElementById('sendAmount').value);

  if (!address || !amount) {
    showResult(sendResult, 'Please fill in all fields', 'error');
    return;
  }

  const validation = await window.api.validateAddress(address);
  if (!validation.isvalid) {
    showResult(sendResult, 'Invalid recipient address', 'error');
    return;
  }

  // Check if wallet is locked
  const walletInfo = await window.api.getWalletInfo();
  if (walletInfo.unlocked_until === 0) {
    showPassphraseModal('unlock', async () => {
      await sendTransaction(address, amount);
    });
    return;
  }

  await sendTransaction(address, amount);
});

async function sendTransaction(address, amount) {
  if (!confirm(`Send ${amount} AXE to ${address}?`)) return;

  // Apply the selected fee rate before sending
  const feeRate = getSelectedFeeRate();
  const setFeeResult = await window.api.setTxFee(feeRate);
  if (setFeeResult && setFeeResult.error) {
    console.warn('Could not set fee rate:', setFeeResult.error);
  }

  // Check if using coin control
  if (selectedUtxos.length > 0) {
    await sendWithCoinControl(address, amount);
  } else {
    const result = await window.api.sendToAddress(address, amount);

    if (result.error) {
      showResult(sendResult, `Error: ${result.error}`, 'error');
    } else {
      showResult(sendResult, `Transaction sent! TXID: ${result}`, 'success');
      sendForm.reset();
      addressValidation.textContent = '';
      selectedUtxos = [];
      refreshDashboard();
    }
  }
}

async function sendWithCoinControl(address, amount) {
  try {
    // Create outputs
    const outputs = {};
    outputs[address] = amount;

    // Create inputs from selected UTXOs
    const inputs = selectedUtxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout
    }));

    // Create raw transaction
    const rawTx = await window.api.createRawTransaction(inputs, outputs);
    if (rawTx.error) throw new Error(rawTx.error);

    // Fund the transaction (adds change output)
    const fundedTx = await window.api.fundRawTransaction(rawTx, { changePosition: 1 });
    if (fundedTx.error) throw new Error(fundedTx.error);

    // Sign the transaction
    const signedTx = await window.api.signRawTransactionWithWallet(fundedTx.hex);
    if (signedTx.error) throw new Error(signedTx.error);
    if (!signedTx.complete) throw new Error('Transaction signing incomplete');

    // Broadcast
    const txid = await window.api.sendRawTransaction(signedTx.hex);
    if (txid.error) throw new Error(txid.error);

    showResult(sendResult, `Transaction sent! TXID: ${txid}`, 'success');
    sendForm.reset();
    addressValidation.textContent = '';
    selectedUtxos = [];
    updateCoinControlSummary();
    refreshDashboard();
  } catch (error) {
    showResult(sendResult, `Error: ${error.message}`, 'error');
  }
}

async function updateAvailableBalance() {
  const balance = await window.api.getBalance();
  if (!balance.error) {
    document.getElementById('availableBalance').textContent = `${parseFloat(balance).toFixed(8)} AXE`;
  }
}

// Contact picker for send page
document.getElementById('pickContactBtn').addEventListener('click', () => {
  showContactPicker((contact) => {
    document.getElementById('sendAddress').value = contact.address;
    document.getElementById('sendAddress').dispatchEvent(new Event('input'));
  });
});

// ============================================================================
// Fee Estimation (Phase 4.1)
// ============================================================================

// Store fee rates for use when sending
let feeRates = {
  economy: 0.00001,
  normal: 0.00005,
  priority: 0.0001
};

async function loadFeeEstimates() {
  try {
    const [economy, normal, priority] = await Promise.all([
      window.api.estimateSmartFee(20),
      window.api.estimateSmartFee(6),
      window.api.estimateSmartFee(2)
    ]);

    if (!economy.error && economy.feerate) {
      feeRates.economy = economy.feerate;
      document.getElementById('feeEconomy').textContent = `~${economy.feerate.toFixed(8)} AXE/kB`;
    }
    if (!normal.error && normal.feerate) {
      feeRates.normal = normal.feerate;
      document.getElementById('feeNormal').textContent = `~${normal.feerate.toFixed(8)} AXE/kB`;
    }
    if (!priority.error && priority.feerate) {
      feeRates.priority = priority.feerate;
      document.getElementById('feePriority').textContent = `~${priority.feerate.toFixed(8)} AXE/kB`;
    }
  } catch (error) {
    console.error('Failed to load fee estimates:', error);
  }
}

// Get the selected fee rate based on radio button selection
function getSelectedFeeRate() {
  const selected = document.querySelector('input[name="feeOption"]:checked');
  if (!selected) return feeRates.normal;

  const option = selected.value;
  if (option === 'custom') {
    const customFee = parseFloat(document.getElementById('customFee').value);
    // Convert sat/vB to AXE/kB (1 kB = 1000 vB, 1 AXE = 100,000,000 satoshi)
    return customFee ? (customFee * 1000) / 100000000 : feeRates.normal;
  }
  return feeRates[option] || feeRates.normal;
}

// ============================================================================
// Coin Control (Phase 4.2)
// ============================================================================

document.getElementById('refreshUtxos').addEventListener('click', loadUtxos);

async function loadUtxos() {
  const utxoList = document.getElementById('utxoList');
  try {
    const utxos = await window.api.listUnspent();

    if (utxos.error) {
      utxoList.innerHTML = `<p class="empty-state">${utxos.error}</p>`;
      return;
    }

    if (utxos.length === 0) {
      utxoList.innerHTML = '<p class="empty-state">No unspent outputs available</p>';
      return;
    }

    utxoList.innerHTML = utxos.map((utxo, index) => `
      <div class="utxo-item">
        <input type="checkbox" data-index="${index}" class="utxo-checkbox">
        <span class="utxo-address">${utxo.address.substring(0, 20)}...</span>
        <span class="utxo-amount">${parseFloat(utxo.amount).toFixed(8)} AXE</span>
        <span class="utxo-conf">${utxo.confirmations} conf</span>
      </div>
    `).join('');

    // Store UTXOs for later use
    window.utxoData = utxos;

    // Add checkbox handlers
    utxoList.querySelectorAll('.utxo-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          selectedUtxos.push(window.utxoData[index]);
        } else {
          selectedUtxos = selectedUtxos.filter(u =>
            !(u.txid === window.utxoData[index].txid && u.vout === window.utxoData[index].vout)
          );
        }
        updateCoinControlSummary();
      });
    });
  } catch (error) {
    utxoList.innerHTML = `<p class="empty-state">Error loading UTXOs</p>`;
  }
}

function updateCoinControlSummary() {
  const totalAmount = selectedUtxos.reduce((sum, utxo) => sum + utxo.amount, 0);
  document.getElementById('selectedAmount').textContent = totalAmount.toFixed(8);
  document.getElementById('selectedCount').textContent = selectedUtxos.length;
}

// ============================================================================
// Receive Page
// ============================================================================

const generateBtn = document.getElementById('generateAddress');
const addressDisplay = document.getElementById('currentAddress');
const copyBtn = document.getElementById('copyAddress');
const qrCodeDiv = document.getElementById('qrCode');

generateBtn.addEventListener('click', async () => {
  const label = document.getElementById('addressLabel').value.trim();
  const amount = document.getElementById('receiveAmount').value;
  const address = await window.api.getNewAddress(label);

  if (address.error) {
    addressDisplay.textContent = `Error: ${address.error}`;
    copyBtn.style.display = 'none';
    qrCodeDiv.innerHTML = '';
  } else {
    addressDisplay.textContent = address;
    copyBtn.style.display = 'block';
    generateQRCode(address, amount);
    loadAddresses();
  }
});

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(addressDisplay.textContent);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => copyBtn.textContent = 'Copy', 2000);
});

// QR Code Generation (Phase 5.2)
async function generateQRCode(address, amount) {
  // Build BIP-21 URI
  let uri = `superaxecoin:${address}`;
  if (amount && parseFloat(amount) > 0) {
    uri += `?amount=${amount}`;
  }

  // Generate QR code using the API (which runs in main process with node access)
  qrCodeDiv.innerHTML = '';

  try {
    const dataUrl = await window.api.generateQRCode(uri);
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.width = 140;
      img.height = 140;
      img.style.borderRadius = '4px';
      qrCodeDiv.appendChild(img);
    } else {
      throw new Error('No QR code generated');
    }
  } catch (error) {
    console.error('QR code generation error:', error);
    // Fallback to text display
    const canvas = document.createElement('canvas');
    qrCodeDiv.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = 140;
    canvas.height = 140;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 140, 140);
    ctx.fillStyle = '#000';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR Error', 70, 70);
  }
}

async function loadAddresses() {
  const addressesList = document.getElementById('addressesList');
  try {
    const addresses = await window.api.listAddresses();

    if (addresses.error) {
      addressesList.innerHTML = `<p class="empty-state">${addresses.error}</p>`;
      return;
    }

    if (addresses.length === 0) {
      addressesList.innerHTML = '<p class="empty-state">No addresses yet. Generate one above.</p>';
      return;
    }

    addressesList.innerHTML = addresses.map(addr => `
      <div class="address-item">
        <div class="address-item-info">
          ${addr.label ? `<span class="address-item-label">${addr.label}</span>` : ''}
          <span class="address-item-text">${addr.address}</span>
        </div>
        <span class="address-item-balance">${parseFloat(addr.amount).toFixed(8)} AXE</span>
      </div>
    `).join('');
  } catch (error) {
    addressesList.innerHTML = `<p class="empty-state">Error loading addresses</p>`;
  }
}

// ============================================================================
// Transactions Page (Phase 2.1 & 2.2)
// ============================================================================

async function loadTransactions() {
  const txList = document.getElementById('txFullList');
  try {
    const transactions = await window.api.listTransactions(100);

    if (transactions.error) {
      txList.innerHTML = `<p class="empty-state">${transactions.error}</p>`;
      return;
    }

    allTransactions = transactions.reverse();
    applyTransactionFilters();
  } catch (error) {
    txList.innerHTML = `<p class="empty-state">Error loading transactions</p>`;
  }
}

function applyTransactionFilters() {
  const txList = document.getElementById('txFullList');
  const typeFilter = document.getElementById('txFilterType').value;
  const fromDate = document.getElementById('txFilterFrom').value;
  const toDate = document.getElementById('txFilterTo').value;
  const search = document.getElementById('txFilterSearch').value.toLowerCase();

  let filtered = allTransactions;

  // Filter by type
  if (typeFilter === 'receive') {
    filtered = filtered.filter(tx => tx.amount >= 0);
  } else if (typeFilter === 'send') {
    filtered = filtered.filter(tx => tx.amount < 0);
  }

  // Filter by date
  if (fromDate) {
    const from = new Date(fromDate).getTime() / 1000;
    filtered = filtered.filter(tx => tx.time >= from);
  }
  if (toDate) {
    const to = new Date(toDate).getTime() / 1000 + 86400; // End of day
    filtered = filtered.filter(tx => tx.time <= to);
  }

  // Filter by search
  if (search) {
    filtered = filtered.filter(tx =>
      (tx.address && tx.address.toLowerCase().includes(search)) ||
      (tx.txid && tx.txid.toLowerCase().includes(search))
    );
  }

  if (filtered.length === 0) {
    txList.innerHTML = '<p class="empty-state">No transactions match your filters</p>';
    return;
  }

  txList.innerHTML = filtered.map(tx => `
    <div class="tx-item" data-txid="${tx.txid}">
      <div class="tx-info">
        <div class="tx-address">${tx.address || tx.txid?.substring(0, 32) + '...' || 'Unknown'}</div>
        <div class="tx-date">${new Date(tx.time * 1000).toLocaleString()} - ${tx.category} (${tx.confirmations} confirmations)</div>
      </div>
      <div class="tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}">
        ${tx.amount >= 0 ? '+' : ''}${parseFloat(tx.amount).toFixed(8)} AXE
      </div>
    </div>
  `).join('');

  // Add click handlers
  txList.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', () => showTransactionDetails(item.dataset.txid));
  });
}

// Transaction filter event listeners
['txFilterType', 'txFilterFrom', 'txFilterTo', 'txFilterSearch'].forEach(id => {
  document.getElementById(id).addEventListener('change', applyTransactionFilters);
  document.getElementById(id).addEventListener('input', applyTransactionFilters);
});

document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('txFilterType').value = 'all';
  document.getElementById('txFilterFrom').value = '';
  document.getElementById('txFilterTo').value = '';
  document.getElementById('txFilterSearch').value = '';
  applyTransactionFilters();
});

// Transaction Details Modal (Phase 2.1)
async function showTransactionDetails(txid) {
  const modal = document.getElementById('txModalOverlay');
  const body = document.getElementById('txModalBody');

  body.innerHTML = '<p class="empty-state">Loading...</p>';
  modal.classList.add('active');

  try {
    const tx = await window.api.getTransaction(txid);

    if (tx.error) {
      body.innerHTML = `<p class="empty-state">Error: ${tx.error}</p>`;
      return;
    }

    const confirmStatus = tx.confirmations > 0
      ? `<span class="success">Confirmed (${tx.confirmations} confirmations)</span>`
      : '<span style="color: var(--warning)">Unconfirmed</span>';

    body.innerHTML = `
      <div class="tx-detail-row">
        <span class="tx-detail-label">TXID:</span>
        <span class="tx-detail-value">${tx.txid}</span>
        <button class="btn btn-small" onclick="navigator.clipboard.writeText('${tx.txid}')">Copy</button>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Status:</span>
        <span class="tx-detail-value">${confirmStatus}</span>
      </div>
      <div class="tx-detail-row">
        <span class="tx-detail-label">Date:</span>
        <span class="tx-detail-value">${new Date(tx.time * 1000).toLocaleString()}</span>
      </div>
      ${tx.blockhash ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Block:</span>
        <span class="tx-detail-value">${tx.blockhash.substring(0, 32)}...</span>
      </div>
      ` : ''}
      <div class="tx-detail-row">
        <span class="tx-detail-label">Amount:</span>
        <span class="tx-detail-value ${tx.amount >= 0 ? 'success' : ''}">${tx.amount >= 0 ? '+' : ''}${tx.amount.toFixed(8)} AXE</span>
      </div>
      ${tx.fee ? `
      <div class="tx-detail-row">
        <span class="tx-detail-label">Fee:</span>
        <span class="tx-detail-value">${Math.abs(tx.fee).toFixed(8)} AXE</span>
      </div>
      ` : ''}
      <div class="tx-detail-row">
        <span class="tx-detail-label">Details:</span>
        <span class="tx-detail-value">${tx.details.map(d => `${d.category}: ${d.amount} to ${d.address || 'unknown'}`).join('<br>')}</span>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<p class="empty-state">Error loading transaction</p>`;
  }
}

document.getElementById('closeTxModal').addEventListener('click', () => {
  document.getElementById('txModalOverlay').classList.remove('active');
});

document.getElementById('txModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('active');
  }
});

// ============================================================================
// Network Page (Phase 1.1)
// ============================================================================

document.getElementById('refreshPeers').addEventListener('click', loadNetworkData);

async function loadNetworkData() {
  try {
    const [networkInfo, peerInfo, bannedList] = await Promise.all([
      window.api.getNetworkInfo(),
      window.api.getPeerInfo(),
      window.api.listBanned()
    ]);

    // Network stats
    if (!networkInfo.error) {
      document.getElementById('networkConnections').textContent = networkInfo.connections;
      document.getElementById('networkVersion').textContent = networkInfo.subversion || networkInfo.version;

      // Calculate total bytes
      let totalRecv = 0, totalSent = 0;
      if (!peerInfo.error && Array.isArray(peerInfo)) {
        peerInfo.forEach(peer => {
          totalRecv += peer.bytesrecv || 0;
          totalSent += peer.bytessent || 0;
        });
      }
      document.getElementById('networkRecv').textContent = formatBytes(totalRecv);
      document.getElementById('networkSent').textContent = formatBytes(totalSent);
    }

    // Peers table
    const peersBody = document.getElementById('peersTableBody');
    if (peerInfo.error || !Array.isArray(peerInfo) || peerInfo.length === 0) {
      peersBody.innerHTML = '<tr><td colspan="6" class="empty-state">No connected peers</td></tr>';
    } else {
      peersBody.innerHTML = peerInfo.map(peer => `
        <tr>
          <td>${peer.addr}</td>
          <td>${peer.subver || peer.version}</td>
          <td>${peer.pingtime ? (peer.pingtime * 1000).toFixed(0) + 'ms' : '--'}</td>
          <td>${formatBytes(peer.bytesrecv)}</td>
          <td>${formatBytes(peer.bytessent)}</td>
          <td>
            <button class="btn btn-small btn-danger" onclick="banPeer('${peer.addr.split(':')[0]}')">Ban</button>
          </td>
        </tr>
      `).join('');
    }

    // Banned list
    const bannedDiv = document.getElementById('bannedList');
    if (bannedList.error || !Array.isArray(bannedList) || bannedList.length === 0) {
      bannedDiv.innerHTML = '<p class="empty-state">No banned peers</p>';
    } else {
      bannedDiv.innerHTML = bannedList.map(ban => `
        <div class="banned-item">
          <span>${ban.address} - Banned until ${new Date(ban.banned_until * 1000).toLocaleString()}</span>
          <button class="btn btn-small" onclick="unbanPeer('${ban.address}')">Unban</button>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load network data:', error);
  }
}

async function banPeer(ip) {
  if (!confirm(`Ban peer ${ip}?`)) return;
  const result = await window.api.setBan(ip, 'add', 86400);
  if (result && result.error) {
    alert('Failed to ban peer: ' + result.error);
  } else {
    loadNetworkData();
  }
}

async function unbanPeer(address) {
  const result = await window.api.setBan(address, 'remove');
  if (result && result.error) {
    alert('Failed to unban peer: ' + result.error);
  } else {
    loadNetworkData();
  }
}

// Make functions global for onclick handlers
window.banPeer = banPeer;
window.unbanPeer = unbanPeer;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// Debug Console (Phase 1.2)
// ============================================================================

const consoleInput = document.getElementById('consoleInput');
const consoleOutput = document.getElementById('consoleOutput');

document.getElementById('executeCmd').addEventListener('click', executeConsoleCommand);
document.getElementById('clearConsole').addEventListener('click', () => {
  consoleOutput.innerHTML = `
    <p class="console-welcome">Welcome to the SuperAxeCoin Debug Console.</p>
    <p class="console-welcome">Type "help" to list available commands.</p>
  `;
});

consoleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    executeConsoleCommand();
  } else if (e.key === 'ArrowUp') {
    if (consoleHistoryIndex < consoleHistory.length - 1) {
      consoleHistoryIndex++;
      consoleInput.value = consoleHistory[consoleHistory.length - 1 - consoleHistoryIndex];
    }
  } else if (e.key === 'ArrowDown') {
    if (consoleHistoryIndex > 0) {
      consoleHistoryIndex--;
      consoleInput.value = consoleHistory[consoleHistory.length - 1 - consoleHistoryIndex];
    } else {
      consoleHistoryIndex = -1;
      consoleInput.value = '';
    }
  }
});

async function executeConsoleCommand() {
  const input = consoleInput.value.trim();
  if (!input) return;

  // Add to history
  consoleHistory.push(input);
  consoleHistoryIndex = -1;
  consoleInput.value = '';

  // Parse command and arguments
  const parts = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const method = parts[0];
  const params = parts.slice(1).map(p => {
    // Remove quotes
    if (p.startsWith('"') && p.endsWith('"')) {
      return p.slice(1, -1);
    }
    // Try to parse as number or boolean
    if (p === 'true') return true;
    if (p === 'false') return false;
    if (!isNaN(p) && p !== '') return parseFloat(p);
    return p;
  });

  // Display command
  const cmdDiv = document.createElement('p');
  cmdDiv.className = 'console-command';
  cmdDiv.textContent = `> ${input}`;
  consoleOutput.appendChild(cmdDiv);

  try {
    let result;
    if (method === 'help') {
      result = await window.api.rpcHelp(params[0] || '');
    } else {
      result = await window.api.rpcExecute(method, params);
    }

    const resultDiv = document.createElement('pre');
    resultDiv.className = result.error ? 'console-result console-error' : 'console-result';
    resultDiv.textContent = result.error
      ? `Error: ${result.error}`
      : (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    consoleOutput.appendChild(resultDiv);
  } catch (error) {
    const errorDiv = document.createElement('pre');
    errorDiv.className = 'console-result console-error';
    errorDiv.textContent = `Error: ${error.message}`;
    consoleOutput.appendChild(errorDiv);
  }

  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ============================================================================
// Contacts (Phase 5.1)
// ============================================================================

document.getElementById('addContactBtn').addEventListener('click', () => {
  showContactModal();
});

document.getElementById('importContactsBtn').addEventListener('click', async () => {
  const result = await window.api.importContacts();
  if (result.success) {
    alert(`Imported ${result.count} contacts`);
    loadContacts();
  } else if (result.error) {
    alert(result.error);
  }
});

document.getElementById('exportContactsBtn').addEventListener('click', async () => {
  const result = await window.api.exportContacts();
  if (result.success) {
    alert(`Contacts exported to ${result.path}`);
  } else if (result.error) {
    alert(result.error);
  }
});

async function loadContacts() {
  const contactsList = document.getElementById('contactsList');
  try {
    const contacts = await window.api.listContacts();

    if (contacts.length === 0) {
      contactsList.innerHTML = '<p class="empty-state">No contacts yet. Add one above.</p>';
      return;
    }

    contactsList.innerHTML = contacts.map(c => `
      <div class="contact-item">
        <div class="contact-info">
          <div class="contact-label">${c.label}</div>
          <div class="contact-address">${c.address}</div>
          ${c.notes ? `<div class="contact-notes">${c.notes}</div>` : ''}
        </div>
        <div class="contact-actions">
          <button class="btn btn-small" onclick="editContact('${c.id}')">Edit</button>
          <button class="btn btn-small btn-danger" onclick="deleteContact('${c.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    contactsList.innerHTML = '<p class="empty-state">Error loading contacts</p>';
  }
}

function showContactModal(contact = null) {
  const modal = document.getElementById('contactModalOverlay');
  document.getElementById('contactModalTitle').textContent = contact ? 'Edit Contact' : 'Add Contact';
  document.getElementById('contactId').value = contact ? contact.id : '';
  document.getElementById('contactLabel').value = contact ? contact.label : '';
  document.getElementById('contactAddress').value = contact ? contact.address : '';
  document.getElementById('contactNotes').value = contact ? contact.notes || '' : '';
  modal.classList.add('active');
}

document.getElementById('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('contactId').value;
  const contact = {
    label: document.getElementById('contactLabel').value,
    address: document.getElementById('contactAddress').value,
    notes: document.getElementById('contactNotes').value
  };

  let result;
  if (id) {
    result = await window.api.updateContact(id, contact);
  } else {
    result = await window.api.addContact(contact);
  }

  if (result.success) {
    document.getElementById('contactModalOverlay').classList.remove('active');
    loadContacts();
  } else {
    alert(result.error || 'Failed to save contact');
  }
});

document.getElementById('closeContactModal').addEventListener('click', () => {
  document.getElementById('contactModalOverlay').classList.remove('active');
});

async function editContact(id) {
  const contacts = await window.api.listContacts();
  const contact = contacts.find(c => c.id === id);
  if (contact) {
    showContactModal(contact);
  }
}

async function deleteContact(id) {
  if (!confirm('Delete this contact?')) return;
  const result = await window.api.deleteContact(id);
  if (result.success) {
    loadContacts();
  } else {
    alert(result.error || 'Failed to delete contact');
  }
}

window.editContact = editContact;
window.deleteContact = deleteContact;

// Contact Picker
function showContactPicker(callback) {
  const modal = document.getElementById('contactPickerOverlay');
  const list = document.getElementById('contactPickerList');

  window.api.listContacts().then(contacts => {
    if (contacts.length === 0) {
      list.innerHTML = '<p class="empty-state">No contacts available</p>';
    } else {
      list.innerHTML = contacts.map(c => `
        <div class="picker-item" data-address="${c.address}">
          <div class="contact-label">${c.label}</div>
          <div class="contact-address">${c.address}</div>
        </div>
      `).join('');

      list.querySelectorAll('.picker-item').forEach(item => {
        item.addEventListener('click', () => {
          const contact = contacts.find(c => c.address === item.dataset.address);
          callback(contact);
          modal.classList.remove('active');
        });
      });
    }
  });

  modal.classList.add('active');
}

document.getElementById('closeContactPicker').addEventListener('click', () => {
  document.getElementById('contactPickerOverlay').classList.remove('active');
});

// ============================================================================
// Wallet Security (Phase 3.1)
// ============================================================================

async function checkEncryptionStatus() {
  const status = document.getElementById('encryptionStatus');
  const encryptBtn = document.getElementById('encryptWalletBtn');
  const changeBtn = document.getElementById('changePassphraseBtn');
  const unlockBtn = document.getElementById('unlockWalletBtn');
  const lockBtn = document.getElementById('lockWalletBtn');
  const timer = document.getElementById('unlockTimer');

  try {
    const walletInfo = await window.api.getWalletInfo();

    if (walletInfo.error) {
      status.textContent = 'Unable to check status';
      status.className = 'security-status';
      return;
    }

    if (walletInfo.unlocked_until === undefined) {
      // Unencrypted
      status.textContent = 'Wallet is NOT encrypted';
      status.className = 'security-status unencrypted';
      encryptBtn.style.display = 'inline-block';
      changeBtn.style.display = 'none';
      unlockBtn.style.display = 'none';
      lockBtn.style.display = 'none';
      timer.style.display = 'none';
    } else if (walletInfo.unlocked_until === 0) {
      // Encrypted and locked
      status.textContent = 'Wallet is encrypted and LOCKED';
      status.className = 'security-status encrypted';
      encryptBtn.style.display = 'none';
      changeBtn.style.display = 'inline-block';
      unlockBtn.style.display = 'inline-block';
      lockBtn.style.display = 'none';
      timer.style.display = 'none';
    } else {
      // Encrypted and unlocked
      const unlockTime = new Date(walletInfo.unlocked_until * 1000);
      const remaining = Math.max(0, Math.floor((unlockTime - Date.now()) / 1000));
      status.textContent = 'Wallet is encrypted and UNLOCKED';
      status.className = 'security-status encrypted';
      encryptBtn.style.display = 'none';
      changeBtn.style.display = 'inline-block';
      unlockBtn.style.display = 'none';
      lockBtn.style.display = 'inline-block';
      timer.textContent = `Unlocked for ${remaining} more seconds`;
      timer.style.display = 'block';
      unlockEndTime = unlockTime;
    }
  } catch (error) {
    status.textContent = 'Error checking status';
    status.className = 'security-status';
  }
}

document.getElementById('encryptWalletBtn').addEventListener('click', () => {
  showPassphraseModal('encrypt');
});

document.getElementById('changePassphraseBtn').addEventListener('click', () => {
  showPassphraseModal('change');
});

document.getElementById('unlockWalletBtn').addEventListener('click', () => {
  showPassphraseModal('unlock');
});

document.getElementById('lockWalletBtn').addEventListener('click', async () => {
  const result = await window.api.walletLock();
  if (result && result.error) {
    alert('Failed to lock wallet: ' + result.error);
  } else {
    checkEncryptionStatus();
  }
});

function showPassphraseModal(action, callback = null) {
  const modal = document.getElementById('passphraseModalOverlay');
  const title = document.getElementById('passphraseModalTitle');
  const oldGroup = document.getElementById('oldPassGroup');
  const confirmGroup = document.getElementById('confirmPassGroup');
  const timeGroup = document.getElementById('unlockTimeGroup');
  const warning = document.getElementById('passphraseWarning');
  const submitBtn = document.getElementById('passphraseSubmitBtn');

  document.getElementById('passphraseAction').value = action;
  document.getElementById('passphrase').value = '';
  document.getElementById('oldPassphrase').value = '';
  document.getElementById('confirmPassphrase').value = '';

  window.passphraseCallback = callback;

  switch (action) {
    case 'encrypt':
      title.textContent = 'Encrypt Wallet';
      oldGroup.style.display = 'none';
      confirmGroup.style.display = 'block';
      timeGroup.style.display = 'none';
      warning.style.display = 'block';
      submitBtn.textContent = 'Encrypt Wallet';
      break;
    case 'change':
      title.textContent = 'Change Passphrase';
      oldGroup.style.display = 'block';
      confirmGroup.style.display = 'block';
      timeGroup.style.display = 'none';
      warning.style.display = 'none';
      submitBtn.textContent = 'Change Passphrase';
      break;
    case 'unlock':
      title.textContent = 'Unlock Wallet';
      oldGroup.style.display = 'none';
      confirmGroup.style.display = 'none';
      timeGroup.style.display = 'block';
      warning.style.display = 'none';
      submitBtn.textContent = 'Unlock';
      break;
  }

  modal.classList.add('active');

  // Focus the appropriate input field after modal opens
  setTimeout(() => {
    if (action === 'change') {
      document.getElementById('oldPassphrase').focus();
    } else {
      document.getElementById('passphrase').focus();
    }
  }, 100);
}

document.getElementById('passphraseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const action = document.getElementById('passphraseAction').value;
  const passphrase = document.getElementById('passphrase').value;
  const oldPass = document.getElementById('oldPassphrase').value;
  const confirmPass = document.getElementById('confirmPassphrase').value;
  const unlockTime = parseInt(document.getElementById('unlockTime').value);

  let result;

  switch (action) {
    case 'encrypt':
      if (passphrase !== confirmPass) {
        alert('Passphrases do not match');
        return;
      }
      if (!confirm('Are you sure you want to encrypt your wallet? You will need to restart the application.')) {
        return;
      }
      result = await window.api.encryptWallet(passphrase);
      if (result && !result.error) {
        alert('Wallet encrypted successfully. The application will now close. Please restart.');
        window.close();
      }
      break;

    case 'change':
      if (passphrase !== confirmPass) {
        alert('New passphrases do not match');
        return;
      }
      result = await window.api.walletPassphraseChange(oldPass, passphrase);
      break;

    case 'unlock':
      result = await window.api.walletPassphrase(passphrase, unlockTime);
      break;
  }

  if (result && result.error) {
    alert('Error: ' + result.error);
  } else {
    document.getElementById('passphraseModalOverlay').classList.remove('active');
    checkEncryptionStatus();
    if (window.passphraseCallback) {
      window.passphraseCallback();
      window.passphraseCallback = null;
    }
  }
});

document.getElementById('closePassphraseModal').addEventListener('click', () => {
  document.getElementById('passphraseModalOverlay').classList.remove('active');
});

// ============================================================================
// Wallet Backup (Phase 3.2)
// ============================================================================

document.getElementById('backupWalletBtn').addEventListener('click', async () => {
  const result = await window.api.showSaveDialog({
    title: 'Export Wallet',
    defaultPath: 'wallet_backup.dat'
  });

  if (!result.canceled && result.filePath) {
    const backup = await window.api.backupWallet(result.filePath);
    const backupResult = document.getElementById('backupResult');
    if (backup && backup.error) {
      showResult(backupResult, `Export failed: ${backup.error}`, 'error');
    } else {
      showResult(backupResult, `Wallet exported to: ${result.filePath}`, 'success');
    }
  }
});

document.getElementById('importWalletBtn').addEventListener('click', async () => {
  const backupResult = document.getElementById('backupResult');

  if (!confirm('Import a wallet file? This will add a new wallet from a .dat file. The wallet must not already be loaded.')) {
    return;
  }

  showResult(backupResult, 'Importing wallet...', 'success');

  const result = await window.api.importWallet();

  if (result.canceled) {
    backupResult.className = 'result-box';
    backupResult.textContent = '';
    return;
  }

  if (result.error) {
    showResult(backupResult, `Import failed: ${result.error}`, 'error');
  } else if (result.success) {
    showResult(backupResult, result.message, 'success');
    // Refresh the wallet list
    loadWalletList();
    // Refresh dashboard to show new wallet
    refreshDashboard();
  }
});

// ============================================================================
// Multi-Wallet Support (Phase 6.1) - Immersive Wallet Transition
// ============================================================================

const walletSelect = document.getElementById('currentWallet');
let walletTransitionInProgress = false;

// Wallet Transition Controller
const WalletTransition = {
  overlay: null,
  steps: [],
  progressBar: null,
  currentStep: 0,
  targetWallet: null,
  retryCallback: null,

  init() {
    this.overlay = document.getElementById('walletTransitionOverlay');
    this.steps = [
      document.getElementById('walletStep1'),
      document.getElementById('walletStep2'),
      document.getElementById('walletStep3'),
      document.getElementById('walletStep4')
    ];
    this.progressBar = document.getElementById('walletTransitionBarFill');

    // Bind retry/dismiss buttons
    document.getElementById('walletTransitionRetry').addEventListener('click', () => {
      if (this.retryCallback) {
        this.hideError();
        this.retryCallback();
      }
    });

    document.getElementById('walletTransitionDismiss').addEventListener('click', () => {
      this.close();
    });
  },

  show(walletName, isCreate = false) {
    walletTransitionInProgress = true;
    this.targetWallet = walletName;
    this.currentStep = 0;

    // Update title and subtitle
    const title = document.getElementById('walletTransitionTitle');
    const subtitle = document.getElementById('walletTransitionSubtitle');

    if (isCreate) {
      title.textContent = 'Creating Wallet';
      subtitle.textContent = 'Setting up your new wallet';
      this.steps[0].querySelector('.wallet-step-label').textContent = 'Initializing wallet';
    } else {
      title.textContent = 'Switching Wallet';
      subtitle.textContent = 'Please wait while we prepare your wallet';
      this.steps[0].querySelector('.wallet-step-label').textContent = 'Unloading current wallet';
    }

    // Update wallet name display
    document.getElementById('walletTransitionName').textContent = walletName;

    // Reset all steps
    this.steps.forEach(step => {
      step.classList.remove('active', 'completed');
      step.querySelector('.wallet-step-status').textContent = '';
    });

    // Reset progress bar
    this.progressBar.style.width = '0%';

    // Hide error state
    this.hideError();

    // Remove exiting/success classes
    this.overlay.classList.remove('exiting', 'success');

    // Show overlay
    this.overlay.classList.add('active');

    // Start first step after animation
    setTimeout(() => {
      this.setStep(0, 'active');
    }, 400);
  },

  setStep(index, state, status = '') {
    if (index < 0 || index >= this.steps.length) return;

    const step = this.steps[index];

    if (state === 'active') {
      step.classList.add('active');
      step.classList.remove('completed');
      step.querySelector('.wallet-step-status').textContent = status || 'Processing...';
    } else if (state === 'completed') {
      step.classList.remove('active');
      step.classList.add('completed');
      step.querySelector('.wallet-step-status').textContent = status || 'Done';
    }

    // Update progress bar (4 steps = 25% each)
    const completedSteps = this.steps.filter(s => s.classList.contains('completed')).length;
    const activeSteps = this.steps.filter(s => s.classList.contains('active')).length;
    const progress = (completedSteps * 25) + (activeSteps * 12.5);
    this.progressBar.style.width = `${progress}%`;

    this.currentStep = index;
  },

  completeStep(index, status = '') {
    this.setStep(index, 'completed', status);
  },

  startStep(index, status = '') {
    this.setStep(index, 'active', status);
  },

  showError(message) {
    const errorSection = document.getElementById('walletTransitionError');
    document.getElementById('walletTransitionErrorMsg').textContent = message;
    errorSection.style.display = 'block';

    // Hide progress section
    document.querySelector('.wallet-transition-progress').style.opacity = '0.3';
  },

  hideError() {
    document.getElementById('walletTransitionError').style.display = 'none';
    document.querySelector('.wallet-transition-progress').style.opacity = '1';
  },

  complete() {
    // Mark final step as completed
    this.completeStep(3, 'Wallet ready');
    this.progressBar.style.width = '100%';

    // Add success class for animation
    this.overlay.classList.add('success');

    // Close after success animation
    setTimeout(() => {
      this.close();
    }, 800);
  },

  close() {
    // Add exiting class for slide-out animation
    this.overlay.classList.add('exiting');

    // Remove active after animation completes
    setTimeout(() => {
      this.overlay.classList.remove('active', 'exiting', 'success');
      walletTransitionInProgress = false;
    }, 400);
  },

  setRetryCallback(callback) {
    this.retryCallback = callback;
  }
};

// Initialize wallet transition on DOM ready
WalletTransition.init();

document.getElementById('createWalletBtn').addEventListener('click', () => {
  document.getElementById('walletModalOverlay').classList.add('active');
  document.getElementById('newWalletName').value = '';
  document.getElementById('walletResult').className = 'result-box';
});

document.getElementById('closeWalletModal').addEventListener('click', () => {
  document.getElementById('walletModalOverlay').classList.remove('active');
});

document.getElementById('walletForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('newWalletName').value.trim();

  // Close the create dialog
  document.getElementById('walletModalOverlay').classList.remove('active');

  // Show immersive transition for wallet creation
  WalletTransition.show(name, true);

  const performCreate = async () => {
    try {
      // Step 1: Initializing
      WalletTransition.startStep(0, 'Creating wallet structure...');
      await sleep(300);

      const result = await window.api.createWallet(name);

      if (result.error) {
        throw new Error(result.error);
      }

      WalletTransition.completeStep(0, 'Wallet created');

      // Step 2: Loading wallet data
      WalletTransition.startStep(1, 'Initializing wallet...');
      await sleep(400);
      WalletTransition.completeStep(1, 'Wallet loaded');

      // Step 3: Fetching balance
      WalletTransition.startStep(2, 'Reading wallet data...');
      await refreshDashboard();
      await loadWalletList();
      WalletTransition.completeStep(2, 'Data synchronized');

      // Step 4: Ready
      WalletTransition.startStep(3, 'Finalizing...');
      await checkEncryptionStatus();
      await sleep(300);

      WalletTransition.complete();

    } catch (error) {
      WalletTransition.showError(error.message || 'Failed to create wallet');
      WalletTransition.setRetryCallback(performCreate);
    }
  };

  await performCreate();
});

walletSelect.addEventListener('change', async () => {
  const walletName = walletSelect.value;

  // Show immersive wallet transition
  WalletTransition.show(walletName);

  const performSwitch = async () => {
    try {
      // Step 1: Unload current wallets
      WalletTransition.startStep(0, 'Closing current wallet...');

      const loadedWallets = await window.api.listWallets();

      if (!loadedWallets.error) {
        for (const w of loadedWallets) {
          if (w !== walletName) {
            await window.api.unloadWallet(w);
          }
        }
      }

      await sleep(300); // Small delay for visual feedback
      WalletTransition.completeStep(0, 'Wallet closed');

      // Step 2: Load new wallet
      WalletTransition.startStep(1, `Loading ${walletName}...`);

      if (!loadedWallets.error && !loadedWallets.includes(walletName)) {
        const result = await window.api.loadWallet(walletName);
        if (result.error) {
          throw new Error(result.error);
        }
      } else {
        // Wallet is already loaded, but we need to set it as the active context
        // for RPC calls (fixes issue where balance shows wrong wallet)
        await window.api.setActiveWallet(walletName);
      }

      await sleep(400);
      WalletTransition.completeStep(1, 'Wallet loaded');

      // Step 3: Fetch balance and data
      WalletTransition.startStep(2, 'Syncing wallet data...');
      await refreshDashboard();
      WalletTransition.completeStep(2, 'Data synchronized');

      // Step 4: Final setup
      WalletTransition.startStep(3, 'Preparing interface...');
      await checkEncryptionStatus();
      await sleep(300);

      WalletTransition.complete();

    } catch (error) {
      WalletTransition.showError(error.message || 'Failed to switch wallet');
      WalletTransition.setRetryCallback(performSwitch);
      // Reset wallet select to previous value on error
      loadWalletList();
    }
  };

  await performSwitch();
});

async function loadWalletList() {
  try {
    const walletDir = await window.api.listWalletDir();
    const loadedWallets = await window.api.listWallets();

    if (walletDir.error || !walletDir.wallets) return;

    const currentLoaded = loadedWallets.error ? [] : loadedWallets;

    walletSelect.innerHTML = walletDir.wallets.map(w => `
      <option value="${w.name}" ${currentLoaded.includes(w.name) ? 'selected' : ''}>${w.name}</option>
    `).join('');
  } catch (error) {
    console.error('Failed to load wallet list:', error);
  }
}

// Helper function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Message Signing (Phase 7.1)
// ============================================================================

document.getElementById('pickSignAddress').addEventListener('click', () => {
  showAddressPicker((address) => {
    document.getElementById('signAddress').value = address;
  });
});

document.getElementById('signMessageBtn').addEventListener('click', async () => {
  const address = document.getElementById('signAddress').value.trim();
  const message = document.getElementById('signMessageText').value;

  if (!address || !message) {
    alert('Please enter an address and message');
    return;
  }

  // Check if wallet is locked
  const walletInfo = await window.api.getWalletInfo();
  if (walletInfo.unlocked_until === 0) {
    showPassphraseModal('unlock', async () => {
      await signMessage(address, message);
    });
    return;
  }

  await signMessage(address, message);
});

async function signMessage(address, message) {
  const result = await window.api.signMessage(address, message);

  if (result.error) {
    alert('Error: ' + result.error);
  } else {
    document.getElementById('signatureResult').textContent = result;
    document.getElementById('signatureOutput').style.display = 'block';
  }
}

document.getElementById('copySignature').addEventListener('click', () => {
  const sig = document.getElementById('signatureResult').textContent;
  navigator.clipboard.writeText(sig);
  document.getElementById('copySignature').textContent = 'Copied!';
  setTimeout(() => document.getElementById('copySignature').textContent = 'Copy', 2000);
});

document.getElementById('verifyMessageBtn').addEventListener('click', async () => {
  const address = document.getElementById('verifyAddress').value.trim();
  const message = document.getElementById('verifyMessage').value;
  const signature = document.getElementById('verifySignature').value.trim();
  const verifyResult = document.getElementById('verifyResult');

  if (!address || !message || !signature) {
    showResult(verifyResult, 'Please fill in all fields', 'error');
    return;
  }

  const result = await window.api.verifyMessage(address, signature, message);

  if (result.error) {
    showResult(verifyResult, `Error: ${result.error}`, 'error');
  } else if (result === true) {
    showResult(verifyResult, 'Message verified successfully', 'success');
  } else {
    showResult(verifyResult, 'Invalid signature', 'error');
  }
});

function showAddressPicker(callback) {
  const modal = document.getElementById('addressPickerOverlay');
  const list = document.getElementById('addressPickerList');

  window.api.listAddresses().then(addresses => {
    if (addresses.error || addresses.length === 0) {
      list.innerHTML = '<p class="empty-state">No addresses available</p>';
    } else {
      list.innerHTML = addresses.map(a => `
        <div class="picker-item" data-address="${a.address}">
          ${a.label ? `<div class="contact-label">${a.label}</div>` : ''}
          <div class="contact-address">${a.address}</div>
        </div>
      `).join('');

      list.querySelectorAll('.picker-item').forEach(item => {
        item.addEventListener('click', () => {
          callback(item.dataset.address);
          modal.classList.remove('active');
        });
      });
    }
  });

  modal.classList.add('active');
}

document.getElementById('closeAddressPicker').addEventListener('click', () => {
  document.getElementById('addressPickerOverlay').classList.remove('active');
});

// ============================================================================
// Settings
// ============================================================================

const settingsForm = document.getElementById('settingsForm');
const settingsResult = document.getElementById('settingsResult');

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const config = {
    host: document.getElementById('rpcHost').value,
    port: parseInt(document.getElementById('rpcPort').value),
    user: document.getElementById('rpcUser').value,
    pass: document.getElementById('rpcPass').value
  };

  const result = await window.api.setConfig(config);

  if (result.success) {
    showResult(settingsResult, 'Settings saved! Testing connection...', 'success');
    setTimeout(async () => {
      const test = await window.api.getBlockchainInfo();
      if (test.error) {
        showResult(settingsResult, `Connection failed: ${test.error}`, 'error');
        updateConnectionStatus(false);
      } else {
        showResult(settingsResult, 'Connected successfully!', 'success');
        daemonReady = true;
        refreshDashboard();
      }
    }, 500);
  }
});

// Load saved config
(async () => {
  const config = await window.api.getConfig();
  if (config) {
    document.getElementById('rpcHost').value = config.host || '127.0.0.1';
    document.getElementById('rpcPort').value = config.port || 9998;
    document.getElementById('rpcUser').value = config.user || 'superaxecoinrpc';
  }
})();

// ============================================================================
// Helpers
// ============================================================================

function showResult(element, message, type) {
  element.textContent = message;
  element.className = `result-box ${type}`;
}

function updateConnectionStatus(connected, syncing = false) {
  const status = document.getElementById('connectionStatus');
  const dot = status.querySelector('.status-dot');
  const text = status.querySelector('span:last-child');

  dot.className = 'status-dot';
  if (connected) {
    if (syncing) {
      dot.classList.add('syncing');
      text.textContent = 'Syncing...';
    } else {
      dot.classList.add('connected');
      text.textContent = 'Connected';
    }
  } else {
    dot.classList.add('disconnected');
    text.textContent = 'Disconnected';
  }
}

// ============================================================================
// Global Keyboard Shortcuts
// ============================================================================

// ESC key to close any open modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // List of all modal overlays
    const modals = [
      'txModalOverlay',
      'contactModalOverlay',
      'contactPickerOverlay',
      'passphraseModalOverlay',
      'walletModalOverlay',
      'addressPickerOverlay'
    ];

    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }
});

// ============================================================================
// Auto-refresh and Initialization
// ============================================================================

// Auto-refresh (only when daemon is ready)
setInterval(() => {
  if (daemonReady) {
    refreshDashboard();
  }
}, 30000);

// Update unlock timer
setInterval(() => {
  if (unlockEndTime) {
    const remaining = Math.max(0, Math.floor((unlockEndTime - Date.now()) / 1000));
    const timer = document.getElementById('unlockTimer');
    if (remaining > 0) {
      timer.textContent = `Unlocked for ${remaining} more seconds`;
    } else {
      unlockEndTime = null;
      checkEncryptionStatus();
    }
  }
}, 1000);

// Log file handling
document.getElementById('openLogBtn').addEventListener('click', async () => {
  await window.api.openLogFile();
});

(async () => {
  const logPath = await window.api.getLogPath();
  document.getElementById('logPath').textContent = logPath;
})();

// Initial status
updateDaemonStatus('starting');

// ============================================================================
// Tech Brutal Particle System - Minimal Ember Effect
// ============================================================================

class TechBrutalParticleSystem {
  constructor() {
    this.container = document.getElementById('particles-container');
    this.particles = [];
    this.maxParticles = 15; // Much fewer particles
    this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.isReducedMotion && this.container) {
      this.init();
    }
  }

  init() {
    // Create minimal ambient particles only
    this.createEmbers();
    this.createDarkOrbs();

    // Slower particle generation
    this.startParticleLoop();

    // No mouse interaction - cleaner experience
  }

  createParticle(type, options = {}) {
    if (this.particles.length >= this.maxParticles) return null;

    const particle = document.createElement('div');
    particle.className = `particle particle--${type}`;

    const size = options.size || this.randomRange(2, 4);
    const left = options.left || this.randomRange(0, 100);
    const duration = options.duration || this.randomRange(25, 45);
    const delay = options.delay || this.randomRange(0, 15);

    particle.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      animation-duration: ${duration}s;
      animation-delay: -${delay}s;
    `;

    this.container.appendChild(particle);
    this.particles.push(particle);

    // Auto-remove after animation
    setTimeout(() => {
      this.removeParticle(particle);
    }, (duration + delay) * 1000);

    return particle;
  }

  createEmbers() {
    // Very few ember particles
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.createParticle('star', {
          size: this.randomRange(2, 3),
          duration: this.randomRange(30, 50)
        });
      }, i * 1500);
    }
  }

  createDarkOrbs() {
    // Just 2-3 subtle orbs
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        const orb = this.createParticle('orb', {
          size: this.randomRange(20, 35),
          duration: this.randomRange(40, 60)
        });
        if (orb) {
          orb.style.top = `${this.randomRange(20, 80)}%`;
          orb.style.animationName = 'orbFloat';
        }
      }, i * 5000);
    }
  }

  startParticleLoop() {
    // Very slow particle spawning
    setInterval(() => {
      if (this.particles.length < this.maxParticles) {
        // Only create dust or star, no sparkles
        const type = ['star', 'dust'][Math.floor(Math.random() * 2)];
        this.createParticle(type);
      }
    }, 5000); // Much slower - every 5 seconds
  }

  removeParticle(particle) {
    const index = this.particles.indexOf(particle);
    if (index > -1) {
      this.particles.splice(index, 1);
    }
    if (particle.parentNode) {
      particle.parentNode.removeChild(particle);
    }
  }

  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
}

// Initialize tech brutal particle system
const techBrutalParticles = new TechBrutalParticleSystem();

// ============================================================================
// Tech Brutal Micro-Animations - Minimal and Sharp
// ============================================================================

// Simple subtle feedback on button click - no ripple effect
// The CSS handles hover states, keeping JS minimal

// Simple stagger animation for stat cards on page load
function animateStatCards() {
  const cards = document.querySelectorAll('.stat-card');
  cards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';

    setTimeout(() => {
      card.style.transition = 'all 0.3s ease-out';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 50 + index * 50); // Faster stagger
  });
}

// Run card animation on initial load
setTimeout(animateStatCards, 300);

// Re-animate cards when switching to dashboard
const dashboardObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.id === 'page-dashboard' && mutation.target.classList.contains('active')) {
      animateStatCards();
    }
  });
});

const dashboardPage = document.getElementById('page-dashboard');
if (dashboardPage) {
  dashboardObserver.observe(dashboardPage, { attributes: true, attributeFilter: ['class'] });
}

console.log('Tech brutal particle system initialized');
