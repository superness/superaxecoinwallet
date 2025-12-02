const http = require('http');

class RpcClient {
  constructor(config) {
    this.config = {
      host: config.host || '127.0.0.1',
      port: config.port || 9998,
      user: config.user || 'superaxecoinrpc',
      pass: config.pass || ''
    };
    this.wallet = null;
  }

  setWallet(walletName) {
    this.wallet = walletName;
  }

  getWallet() {
    return this.wallet;
  }

  call(method, params = []) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        jsonrpc: '1.0',
        id: Date.now(),
        method: method,
        params: params
      });

      const auth = Buffer.from(`${this.config.user}:${this.config.pass}`).toString('base64');

      // Use wallet-specific endpoint if wallet is set
      // Non-wallet RPC calls (like getblockchaininfo, getnetworkinfo) work on /
      // Wallet-specific calls need /wallet/<walletname>
      let path = '/';
      if (this.wallet && this.isWalletMethod(method)) {
        path = `/wallet/${encodeURIComponent(this.wallet)}`;
      }

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Basic ${auth}`
        }
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(response.error.message || 'RPC Error'));
            } else {
              resolve(response.result);
            }
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Connection failed: ${e.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  // Check if this RPC method requires wallet context
  isWalletMethod(method) {
    const walletMethods = [
      'getwalletinfo',
      'getbalance',
      'getnewaddress',
      'listaddressgroupings',
      'getaddressinfo',
      'listreceivedbyaddress',
      'listtransactions',
      'gettransaction',
      'sendtoaddress',
      'signmessage',
      'verifymessage',
      'encryptwallet',
      'walletpassphrase',
      'walletlock',
      'walletpassphrasechange',
      'backupwallet',
      'listunspent',
      'createrawtransaction',
      'fundrawtransaction',
      'signrawtransactionwithwallet',
      'settxfee',
      'getaddressesbylabel',
      'listlabels',
      'setlabel',
      'importaddress',
      'importprivkey',
      'dumpprivkey',
      'dumpwallet',
      'importwallet',
      'keypoolrefill',
      'getrawchangeaddress',
      'abandontransaction',
      'abortrescan',
      'addmultisigaddress',
      'bumpfee',
      'createwallet',
      'loadwallet',
      'unloadwallet',
      'listwallets',
      'listwalletdir',
      'getaddressesbylabel',
      'listreceivedbylabel',
      'lockunspent',
      'listlockunspent',
      'rescanblockchain',
      'sethdseed',
      'walletcreatefundedpsbt',
      'walletprocesspsbt'
    ];
    return walletMethods.includes(method);
  }
}

module.exports = RpcClient;
