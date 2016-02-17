import localforage from 'localforage';
import Reflux  from 'reflux';
import StateMixinFactory from 'reflux-state-mixin';
import _ from 'lodash';

import TXActions from './Actions';
import utils from './utils';

let web3;

var baseState = {
    nonce: 0,
    error: null,
    // Genesis identifier (getBlock(0).hash)
    genesis: '',
    // Current blockNumber (while pending.length && unconfirmed.length)
    blockNumber: 0,
    timestamp: 0, 
    blockHash: '',

    // Arrays of tx hashes (chronological) mapped by genesis id
    txs: {},      // (persists)
    unconfirmed: {},
    pending: {},

    // arbitrary info mapped to tx hash
    info: {},     // (persists)

    // result of getTransaction(hash)
    objects: {},

    // result of getTransactionReceipt(hash)
    receipts: {},

    // blockNumber of most recent fork
    lastFork: 0,

    // Keep track of tx states by account
    accounts: {}
};

export default Reflux.createStore({
  mixins: [StateMixinFactory(Reflux)],
  listenables: [TXActions],

  prevBlock: null,
  // How many blocks to wait until txs aren't checked
  confirmCount: 12,
  // Maximum number of confirmed transactions to keep in storage
  bufferSize: 100,
  // Web3 filter ID
  filter: null,

  init() {
    // setup localforage driver
    localforage.config({
        driver      : localforage.WEBSQL, // Force WebSQL; same as using setDriver()
        name        : 'web3Store',
        version     : 1.0,
        size        : 4980736, // Size of database, in bytes. WebSQL-only for now.
        storeName   : 'transactionStore', // Should be alphanumeric, with underscores.
        description : 'keep track of ethereum transaction hashes and related info'
    });
  },

  getInitialState() {
    return _.cloneDeep(baseState);
  },

  forceUpdate() {
    this.setState({
      nonce: this.state.nonce + 1
    });
  },

  // Load transactions and pending hashes
  loadStorage(cb) {
    localforage.getItem(this.state.genesis).then(function(storage) {
      this.setState(_.assign(_.cloneDeep(baseState), JSON.parse(storage), {genesis: this.state.genesis}));
      cb();
    }.bind(this));
  },

  // Check confirmations of unconfirmed/dropped transactions, move to confirmed/failed as needed
  // Called by handleReceipt, assumes that there's already nonce findable via stat.objects 
  checkConfirms(blockNumber = null) {
    var txStore = this;
    function getBlockNumber (number, cb) {
      if (number) cb(number);
      else txStore.recordBlock(null, function(err, block) {
        if (err) {
          txStore.setState({error: err});
        } else
          cb(block.number);
      });
    }

    getBlockNumber(blockNumber, function(number) {
      // Update received or dropped to confirmed, failed
      Object.keys(this.state.accounts).forEach(function(account) {

        // Arrays of stateObjs sorted by nonce?
        var pending = this.getTxStates(['pending'], account);
        var received = this.getTxStates(['received'], account);
        var dropped = this.getTxStates(['dropped'], account);

        var latestConfirmed = this.getHighestNonce(account, 'confirmed');
        var latestReceived;

        // Move received into confirmed if ready
        received.forEach(function(stateObj) {
          var receipt = this.state.receipts[stateObj.hash];

          if (number - receipt.blockNumber > this.confirmCount) {
            this.updateState(stateObj, 'confirmed', false);
            if (!latestConfirmed || stateObj.nonce > latestConfirmed)
              latestConfirmed = stateObj.nonce;
          } else {
            if (!latestReceived || stateObj.nonce > latestReceived)
              latestReceived = stateObj.nonce;
          }
        }.bind(this));

        // Move very dropped to failed
        var newFailed = [];
        var newDropped = [];

        if (latestConfirmed >= 0) {
          newFailed = dropped.filter(function(stateObj) {
            return stateObj.nonce <= latestConfirmed;
          });
          newFailed = newFailed.concat(pending.filter(function(stateObj) {
            return stateObj.nonce <= latestConfirmed;
          }));
        }

        if (latestReceived >= 0)
          newDropped = pending.filter(function(stateObj) {
            return stateObj.nonce <= latestReceived;
          });

        newDropped.forEach(function(stateObj) {
          this.updateState(stateObj, 'dropped', false);
        }.bind(this));

        newFailed.forEach(function(stateObj) {
          this.updateState(stateObj, 'failed', false);
        }.bind(this));

      }.bind(this));

      this.garbageCollect();

    }.bind(this));
  },

  // Validate stateObj has required fields
  isValidStateObj(stateObj, extras=[]) {
    return ['hash', 'account', 'nonce', 'type'].concat(extras).every(function(prop) { return stateObj.hasOwnProperty(prop); });
  },

  // Add stateObj to state.accounts[state.genesis][stateObj.type]
  addTxState(accounts, stateObj, save = true) {
    // Ensure correct properties available
    if (!this.isValidStateObj(stateObj)) throw new Error('invalid stateObject ' + JSON.stringify(stateObj));

    var account = _.get(accounts, stateObj.account, {});
    var accountType = _.get(account, stateObj.type, {});
    var typeState = _.get(accountType, stateObj.nonce, null);
    var nonces = _.get(accountType, 'nonces', []);

    // update typestate (what gets saved under the nonce, it's an array only for pending type)
    if (!typeState && stateObj.type === 'pending')
      typeState = [stateObj.hash];
    else if (!typeState)
      typeState = stateObj.hash;
    else if (stateObj.type === 'pending')
      typeState.push(stateObj.hash);
    else
      throw new Error('A hash ' + typeState + ' already exists for type ' + stateObj.type + ' and account ' + stateObj.account + '. Adding hash ' + stateObj.hash + ' failed');

    var i = nonces.length;
    var nonce;

    do {
      i--;
      if (i < nonces.length)
        nonce = nonces[i];
    } while (i > 0 && nonce > stateObj.nonce)

    if (nonce === stateObj.nonce && stateObj.type !== 'pending')
      throw new Error(stateObj.type + ' state at nonce ' + nonce + ' not cleaned up correctly for account ' + stateObj.account);

    if (nonce !== stateObj.nonce)
      nonces.splice(i + 1, 0, stateObj.nonce);

    _.set(accounts, [stateObj.account, stateObj.type, 'nonces'], nonces);
    _.set(accounts, [stateObj.account, stateObj.type, stateObj.nonce.toString()], typeState);

    if (save) {
      this.setState({accounts: accounts});
      this.saveStorage();
    }

    return accounts;
  },

  // Remove stateObj from state.accounts[state.genesis][stateObj.type]
  delTxState(accounts, stateObj, save = true) {
    // Ensure correct properties available
    if (!this.isValidStateObj(stateObj)) throw new Error('invalid stateObject ' + JSON.stringify(stateObj));

    var account = _.get(accounts, stateObj.account, {});
    var accountType = _.get(account, stateObj.type, {});
    var typeState = _.get(accountType, stateObj.nonce, null);
    var nonces = _.get(accountType, 'nonces', []);

    if (!typeState)
      return accounts;

    // splice && delete if !length
    if (typeState.constructor === Array) {
      var stateIndex = typeState.indexOf(stateObj.hash);
      if (stateIndex >= 0)
        typeState.splice(stateIndex, 1);
    } else if (typeState === stateObj.hash) // or delete if typeState === stateObj.hash
      typeState = null;

    if (!typeState || !typeState.length) {
      nonces.splice(nonces.indexOf(stateObj.nonce), 1);
      accounts[stateObj.account][stateObj.type].nonces = nonces;
      delete accounts[stateObj.account][stateObj.type][stateObj.nonce];
    } else accounts[stateObj.account][stateObj.type][stateObj.nonce] = typeState;

    if (save) {
      this.setState({accounts: state.accounts});
      this.saveStorage();
    }

    return accounts;
  },

  // Transition tx state object to a new stateType (e.g. pending => received)
  updateState(stateObj, newStateType, save = true) {
    if (!this.isValidStateObj(stateObj)) throw new Error('Invalid state object: ' + stateObj);

    // When updating to pending, check if there are confirmed w a higher nonce
    // Don't care about received nonces, because the only time that this will happen is when current received txs are unreliable


    if (stateObj.type === newStateType) return;

    if (stateObj.type === 'confirmed' || stateObj.type === 'failed')
      throw new Error('Transaction is already in state ' + stateObj.type + '. Cannot change state');

    var newAccountStates = this.delTxState(this.state.accounts, stateObj, save);
    newAccountStates = this.addTxState(newAccountStates, _.set(stateObj, 'type', newStateType), save);

    this.setState({accounts: newAccountStates, nonce: this.state.nonce + 1});
  },

  getHighestNonce(account, type) {
    var hash;
    var nonces = _.get(this.state.accounts, [account, type, 'nonces'], []);

    return nonces.slice(-1).pop();
  },

  // get 1 tx state where hash is known & txdata is available
  getTxState(hash) {
    if (!(hash in this.state.objects)) throw new Error(hash + ' not available in transaction data. Cannot retreive current state');
    var txData = this.state.objects[hash];

    var baseState = {
      account: txData.from,
      nonce: txData.nonce,
      hash: hash
    };

    var account = _.get(this.state.accounts, baseState.account, {});
    var found = false;
    var states = ['pending', 'received', 'dropped', 'confirmed', 'failed'];

    for (var stateIndex = 0; stateIndex < states.length; stateIndex++) {
      var state = states[stateIndex];
      var nonces = _.get(account, state, {});

      if (!(baseState.nonce in nonces))
        continue;

      var hashes = utils.toArr(account[state][baseState.nonce]);
      if (hashes.indexOf(baseState.hash) >= 0) {
        baseState.type = state;
        break;
      }
    }

    if (!baseState.hasOwnProperty('type')) throw new Error('Transaction ' + hash + ' not found in any of accounts states');

    return baseState;
  },

  // Load chrono arr of tx state from state.accounts[state.genesis] by type
  // defaults to pending & received & dropped assuming getReceipt will be called
  getTxStates(types = ['pending'], accounts = null) {
    var _accounts = this.state.accounts;

    var results = [];

    accounts = utils.toArr(accounts);
    if (!accounts.length)
      accounts = Object.keys(_accounts);
    types = utils.toArr(types);

    accounts.filter(function(account) {
      return account !== 'children';
    }).forEach(function(account) {

      var accountTypes = _.get(_accounts, account, {});

      types.forEach(function(type) {
        var stateObj = _.get(accountTypes, type, {});
        var stateNonces = _.get(stateObj, 'nonces', []);

        stateNonces.forEach(function(nonce) {
          var hashes = _.get(stateObj, nonce, []);
          hashes = utils.toArr(hashes);
          var states = hashes.map(function(hash) {
            return {
              account: account,
              type: type,
              nonce: nonce,
              hash: hash
            }
          });
          results = results.concat(states);
        });

      });
    });

    return results;
  },

  // Load the tx info for an array of transactions (defaults to this.txs)
  // Save any unclaimed transactions into pending
  loadTxData(payload, methods = ['receipt', 'object'], callback = null) {
    let blockTimestamps = {};

    var txs = utils.toArr(payload);

    // If no txs requested, default to all pending & received & dropped for all accounts
    if (!txs.length)
      txs = this.getTxStates();


    var batch = web3.createBatch();

    var dataCount = 0;
    var errors = [];

    function getTimestamp(blockHash, cb) {
      if (blockHash in blockTimestamps)
        cb(null, blockTimestamps[blockHash]);
      else
        web3.eth.getBlock(blockHash, cb);
    }

    // If no receipt, hash is pending, else move from pending to unconfirmed
    function handleReceipt(stateObj, err, recpt) {
      var hash = stateObj.hash;

      // If error recorded, trigger update w that info (assumes web3 connection error)
      if (err) {
        this.setState({error: err});

      // else if no data received from receipt, tx is not yet received in block, do nothing?
      } else if (!recpt || !recpt.transactionHash) {

        // If previous receipt exists, delete it
        if (stateObj.hash in this.state.receipts)
          this.setState({receipts: _.omit(this.state.receipts, stateObj.hash)});

        // Can we assume that dropped transactions will not go back to pending state if still no receipt
            // If there was a fork...
            // => We can check if there was a fork by recording the last known block
            // If the last known block doesn't exist, then it's free-for-all

        // will save if stateObj not already pending (wouldn't have a receipt anyway)
        this.updateState(stateObj, 'pending', false);

      // else, data was received
      } else {
        getTimestamp(recpt.blockHash || recpt.blockNumber, function(err, block) {
          recpt.timestamp = block.timestamp;
          this.setState({receipts: _.set(this.state.receipts, hash, recpt)});
          this.updateState(stateObj, 'received', false); // implicitly saves the state of the receipt
        }.bind(this));
      }

      // No erros need to be recorded in handleReceipt?
      if (++dataCount == txs.length * methods.length && typeof callback === 'function')
        callback(errors.length ? errors: null);
    }

    // Always update the tx object
    function handleData(stateObj, err, data) {
      var hash = stateObj.hash;

      // Assume this must be a connection error, not positive that's only case though (TODO)
      if (err)
        this.setState({error: err});

      // else if no data received from getTransaction, if the txObj exists remove tx from its current state and callback the txObj that failed
      else if (!data || !data.hash) {

        // if txinfo exists for this, yet it failed
        if (hash in this.state.info) {
          // stateObj.type _could_ be overwritten here by state.info[hash].type...
          if (stateObj.hasOwnProperty('type'))
            this.setState({accounts: this.delTxState(this.state.accounts, stateObj, false)});   // saved to ls after loadTxData completes
          errors.push(_.merge(stateObj, this.state.info[hash]));
          delete this.state.info[hash];
          this.setState({info: this.state.info});

        } else errors.push(stateObj);   // if txinfo doesn't exist, why are we looking at this?

      // else data was received
      } else {

        // If unseen by objects (first tx data found for hash), add tx state to pending
        data.hash = utils.formatHex(data.hash);
        if (!(data.hash in this.state.objects)) {
          this.setState({accounts: this.addTxState(this.state.accounts, {
            hash: data.hash,
            account: data.from,
            type: 'pending',
            nonce: data.nonce
          }, false)});
        }

        this.setState({objects: _.set(this.state.objects, data.hash, data)});
      }

      if (++dataCount == txs.length * methods.length && typeof callback === 'function')
        callback(errors.length ? errors: null);
    }

    if (!txs.length && typeof callback === 'function')
      return callback(null);

    var methodTest = ['receipt', 'object'].reduce(function(o, v) {
      o[v] = methods.indexOf(v) >= 0;
      return o;
    }, {});

    // Batch the transaction data requests (txs could be array of hashes or txobjs)
    txs.forEach(function(stateObj) {
      var hash = stateObj;

      if (typeof stateObj === 'object')
        hash = stateObj.hash;
      else
        stateObj = {
          hash: hash
        };

      hash = utils.formatHex(hash, true);

      if (methodTest.object)
        batch.add(web3.eth.getTransaction.request(hash, handleData.bind(this, stateObj)));

      if (methodTest.receipt)
        batch.add(web3.eth.getTransactionReceipt.request(hash, handleReceipt.bind(this, stateObj)));

    }.bind(this));

    batch.execute();
  },

  //// Helpers

  toArr(s) {
    try {
      return s.constructor === Array ? s : [s];
    } catch (e) {
      return [];
    }
  },

  // Garbage collect the earliest stored confirmed & failed txs over quota
  garbageCollect() {
    var accountState = this.state.accounts;

    // Run GC for each stored account
    Object.keys(this.state.accounts).forEach(function(account) {
      var confirmed = this.getTxStates(['confirmed'], account);
      var failed = this.getTxStates(['failed'], account);
      while (confirmed.length + failed.length > this.bufferSize) {
        var lastConfirmed = _.get(confirmed[0], 'nonce', -1);
        var lastFailed = _.get(failed[0], 'nonce', -1);

        var removeFromArray = confirmed;
        if (lastFailed >= 0 && lastFailed < lastConfirmed)
          removeFromArray = failed;

        var elToRemove = removeFromArray.shift();
        accountState = this.delTxState(accountState, elToRemove, false);
      }
    }.bind(this));
    this.setState({accounts: accountState, nonce: this.state.nonce + 1});
    this.saveStorage();
  },

  // Get block zero hash
  setGenesis(cb) {
    web3.eth.getBlock(0, function(err, block) {
      if (err) return cb(err);
      this.setState({genesis: block.hash});
      cb(null, block);
    }.bind(this));
  },

  // On each block, loadtxdata for pending, if there's a fork reload pending, received, & dropped
  // TODO: add a timeout for unreceived pending?
  newBlock(err, hash) {

    this.recordBlock(utils.formatHex(hash, true), function(err, block) {
      if (err) {
        this.setState({error: err});
        return;
      }

      // On new block, 
      var pending = this.getTxStates(['pending']);
      var confirming = this.getTxStates(['received', 'dropped']);

      var reloadTxs = pending;

      // If a fork happens, send trigger event for anyone subscribed and re-load tx objects & receipts pending, dropped, and received
      if (this.prevBlock && this.prevBlock.hash !== block.parentHash) {
        reloadTxs = reloadTxs.concat(confirming);
        this.setState({lastFork: block.number});
      }

      this.prevBlock = block;

      // Stop watching when no confirming or pending txs left
      if (!pending.length && !confirming.length) this.stopWatching();
      else this.loadTxData(reloadTxs, ['receipt'], function(err) {
        this.checkConfirms(block.number);
      }.bind(this));
    }.bind(this));
  },

  stopWatching() {
    if (this.filter) {
      this.filter.stopWatching();
      this.filter = null;
    }
  },

  // sets the eth filter to watch latest blocks
  // called in onAdd & onConnect (when any pending or unconfirmed)
  startWatching() {
    if (this.filter) return;
    this.filter = web3.eth.filter('latest');
    this.filter.watch(this.newBlock);
  },

  saveStorage() {
    var saveState = ['accounts', 'info', 'objects', 'receipts'].reduce(function(o, v) {
      o[v] = this.state[v];
      return o;
    }.bind(this), {});

    localforage.setItem(this.state.genesis, JSON.stringify(saveState), function(err, v) {
      if (err) throw err;
    });
  },

  //// Action handlers

  // Remove everything
  onClearAll() {
    //this.stopWatching();
    if (this.filter) {
      this.filter.stopWatching();
      this.filter = null;
    }
    this.setState(_.cloneDeep(baseState));
    localforage.clear();
  },

  // Remove pending for current genesis
  onClearPending() {
    var _pending = this.state.pending[this.state.genesis];
    var _txs = this.state.txs[this.state.genesis];
    var _info = this.state.info;

    _pending.forEach(function(p) {
      var txIndex = _txs.indexOf(p);
      if (txIndex > -1) {
        _txs.splice(txIndex, 1);
        delete _info[p];
      }
    });

    delete this.state.pending[this.state.genesis];

    this.setState({pending: _pending, txs: _txs, info: _info});
    this.save('txs', _txs);
    this.save('info', _info);
  },

  // Remove less-permanent state and storage
  onClear() {
    var _txs = this.state.txs;
    var _info = this.state.info;
    var _pending = this.state.pending;
    var _unconfirmed = this.state.unconfirmed;
    var _genesis = this.state.genesis;

    _txs[_genesis].forEach(function(hash) {
      delete _info[hash];
    });

    delete _txs[_genesis];
    delete _pending[_genesis];
    delete _unconfirmed[_genesis];

    this.setState({txs: _txs, info: _info, pending: _pending, unconfirmed: _unconfirmed, nonce: this.nonce + 1});
    this.save('txs', _txs);
    this.save('info', _info);
  },

  // For each txInfo, check if the hash exists in txInfo already, if it does, overwrite txInfo but don't append to tx array
  onAdd(payload, cb) {
    // Turn params into array if not already, filter out any not including hash property
    payload = utils.toArr(payload).filter(function(el) { return el.hasOwnProperty('hash'); }).map(function(p) {
      p.hash = utils.formatHex(p.hash);
      return p;
    });

    // Hashes of txs that don't have objects recorded yet
    var newHashes = payload.filter(function(el) {
      return !(el.hash in this.state.objects);
    }.bind(this)).map(function(el) {
      return el.hash;
    });

    // Can update info for any tx, if it's already been seen it won't ask for it's tx data again though
    var newInfo = payload.reduce(function(o, p) {
      o[p.hash] = p;
      return o;
    }, {});

    // Remove oldest, confirmed txs from state.txs when it exceeds bufferSize (synchronous)
    this.setState({info: _.assign(this.state.info, newInfo)});

    // Get new transaction objects from web3, then load receipts (if the hashes are new...otherwise don't waste time)
    if (newHashes.length)
      this.loadTxData(newHashes, ['object'], function(err) {
        if (err) {
          this.setState({error: err});
          if (typeof cb == 'function') cb(err);
          else console.error('Error in loadTxData', err);
        } else {  // if no cb error, then we can safeuly assume newHashes have txObjects in state
          // Must load receipts using whole stateObjects so the new states can be updated correctly
          this.loadTxData(newHashes.map(function(hash) {
            return this.getTxState(hash);
          }.bind(this)), ['receipt'], function(err) {
            this.checkConfirms(); // Also records latest block
            this.forceUpdate();
            this.startWatching();
            if (cb && typeof cb === 'function')
              cb();
          }.bind(this));
        }
      }.bind(this));
    else this.saveStorage();
  },

  // Records blockNum or latest blockNumber & it's timestamp & hash as latest known block
  recordBlock(blockId, callback) {

    function getBlockNumber(cb) {
      if (blockId) return cb(null, blockId);
      else web3.eth.getBlockNumber(cb);
    }

    getBlockNumber(function(err, number) {
      if (err) {
        this.setState({error: err});

        if (typeof callback === 'function')
          return callback(err);
        return;
      }

      web3.eth.getBlock(number, function(err, block) {
        if (err)
          this.setState({error: err});
        else
          this.setState({blockNumber: block.number, timestamp: block.timestamp, blockHash: block.hash});

        if (typeof callback === 'function')
          callback(err, block);

      }.bind(this));
    }.bind(this));
  },

  /*
   available options:
  {
    provider: '',       //  web3 provider
    confirmCount: 20,    //  # of blocks until a tx is sufficiently confirmed
    bufferSize: 50      //  Max # of confirmed transactions to keep in storage
  }
  */
  onConnect(localWeb3, opts) {
    if (_.has(opts, 'confirmCount')) this.confirmCount = opts.confirmCount;
    if (_.has(opts, 'bufferSize')) this.bufferSize = opts.bufferSize;
    web3 = localWeb3;

    var txStore = this;

    function didFork(blockHash, callback) {
      if (!blockHash) callback(false);

      web3.eth.getBlock(blockHash, function(err, res) {
        if (err) txStore.setState({error: err});
        if (res) {
          txStore.recordBlock(res.number)
          callback(false);
        } else callback(true);
      });
    }

    txStore.setGenesis(function(err, block) {
      if (err) {
        txStore.setState({error: err});
        return;
      }

      // Load storage from genesis identifier
      txStore.loadStorage(function() {

        // if there's a prevblock in storage that's not recognized by eth.getBlock
        //      reset unconfirmed received/failed txs
        didFork(txStore.state.blockHash, function(forked) {
          var txsNeeded;

          var unconfirmed = txStore.getTxStates(['pending', 'received', 'dropped']);
          var watchNeeded = unconfirmed.length > 0;

          if (forked)
            txsNeeded = unconfirmed;
          // else defaults to just ['pending']

          // Load receipts for all pending or pending, dropped, and received txs for current genesis
          txStore.loadTxData(txsNeeded, ['receipt'], function(err) {

            // Err shouldn't happen when just getting receipt because null responses are expected
            if (err) throw new Error('Problem retreiving transaction info for ' + err);

            if (watchNeeded) txStore.startWatching();
            // Check confirm counts for received->confirmed, dropped->failed (also saves storage if there are any accounts)
            txStore.checkConfirms(block.number);
          });

        });
      });
    });
  }
});
