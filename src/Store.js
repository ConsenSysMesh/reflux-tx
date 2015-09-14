//var localforage = require('localforage');
import localforage from 'localforage';
import React   from 'react/addons';
import Reflux  from 'reflux';
import TXActions from './Actions';
import StateMixinFactory from 'reflux-state-mixin';
import _ from 'lodash';
import web3 from 'web3';


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
    return {
      error: null,
      // Genesis identifier (getBlock(0).hash)
      genesis: '',
      // Current blockNumber (while pending.length && unconfirmed.length)
      blockNumber: 0,
      timestamp: 0, 

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
      lastFork: 0
    };
  },

  // Load transactions and pending hashes
  loadStorage(cb) {
    var storedKeys = ['txs', 'info'];
    var promises = storedKeys.map(function(k) { return localforage.getItem(k); });
    var defaults = storedKeys.map(function(k) { return this.getInitialState()[k]; }.bind(this));

    Promise.all(promises).then(function(res) {
      var newState = {};
      res.forEach(function(v, i) {
        newState[storedKeys[i]] = v ? JSON.parse(v) : defaults[i];
      });

      this.setState(newState);
      cb();
    }.bind(this));
  },

  // Load the tx info for an array of transactions (defaults to this.txs)
  // Save any unclaimed transactions into pending
  loadTxData(payload, callback = null) {
    var txs;
    var _genesis = this.state.genesis;
    txs = this.toArr(payload);
    if (!txs.length)
      txs = _.get(this.state.txs, _genesis, []);
    if (!txs.length) return;

    var blockNumber = web3.eth.blockNumber;
    this.recordBlock(blockNumber);
    var batch = web3.createBatch();

    var _pending = this.state.pending;
    var pending = _pending[_genesis] || [];
    var dataCount = 0;
    var errors = [];

    // If no receipt, hash is pending, else move from pending to unconfirmed
    function handleReceipt(hash, err, recpt) {
      if (err) {
        this.setState({error: err});
        return;
      }

      // No receipt for hash, it's still pending
      if (!recpt || !recpt.transactionHash) {
        if (pending.indexOf(hash) === -1) {
          pending.push(hash);
          this.setState({pending: _.set(_pending, _genesis, pending)});
          this.startWatching();
        }
        return;
      }

      var _unconfirmed = this.state.unconfirmed;
      var _receipts = this.state.receipts;

      var unconfirmed = _unconfirmed[_genesis] || [];

      // Tx received, remove from pending
      var pendex = pending.indexOf(hash);
      if (pendex !== -1) {
        pending.splice(pendex, 1);
      }

      var unconfdex = unconfirmed.indexOf(hash);

      // If unconfirmed
      if (!(recpt.blockNumber + this.confirmCount <= blockNumber)) {
        if (unconfdex === -1) {
          unconfirmed.push(hash);
          this.startWatching();
        }
      } else
        unconfirmed.splice(unconfdex, 1);

      _.set(_pending, this.state.genesis, pending);
      _.set(_unconfirmed, this.state.genesis, unconfirmed);
      _.set(_receipts, recpt.transactionHash, recpt);

      this.setState({receipts: _receipts, pending: _pending, unconfirmed: _unconfirmed});
    }

    // Always update the tx object
    function handleData(hash, err, data) {
      // Assume this must be a connection error, not positive though (TODO)
      if (err)
        this.setState({error: err});
      else if (!data || !data.hash)
        errors.push(hash);
      else
        this.setState({objects: _.set(this.state.objects, data.hash, data)});

      if (++dataCount == txs.length && typeof callback === 'function')
        callback(data.length ? data : null);
    }

    // Batch the transaction data requests
    txs.forEach(function(hash) {
      batch.add(web3.eth.getTransaction.request(hash, handleData.bind(this, hash)));
      batch.add(web3.eth.getTransactionReceipt.request(hash, handleReceipt.bind(this, hash)));
    }.bind(this));

    batch.execute();
  },

  toArr(s) {
    try {
      return s.constructor === Array ? s : [s];
    } catch (e) {
      return [];
    }
  },

  //// Helpers

  // Clear out buffer if too big
  removeExcessiveTXs() {
    var _txs = this.state.txs;
    var _info = this.state.info;
    var _genesis = this.state.genesis;

    var txs = _.get(_txs, _genesis, []);
    var unconfirmed = _.get(this.state.confirmed, _genesis, []);
    var pending = _.get(this.state.pending, _genesis, []);

    var nonconfirmedObject = pending.concat(unconfirmed).reduce(function(o, v, i) {
      o[v] = true;
      return o;
    }, {});

    //var confirmed = new Set(_.difference(txs, unconfirmed.concat(pending)));
    var confirmed = txs.filter(function(hash) {
      return !(hash in nonconfirmedObject);
    });

    var confirmedObject = confirmed.reduce(function(o, v, i) {
      o[v] = true;
      return o;
    }, {});

    // Start with earliest-added tx
    var txIndex = 0;
    while (confirmed.length > this.bufferSize && txIndex < txs.length) {
      var tx = txs[txIndex];
      if (tx in confirmedObject) {
        confirmed.pop();
        txs.splice(txIndex, 1);
        delete _info[tx];
      }
      txIndex++;
    }

    if (txIndex)
      this.setState({info: _info, txs: _.set(_txs, _genesis, txs)});
  },

  // Get block zero hash
  setGenesis(cb) {
    web3.eth.getBlock(0, function(err, block) {
      if (err) return cb(err);
      this.setState({genesis: block.hash});
      cb();
    }.bind(this));
  },

  // On each block, loadtxdata for pending, otherwise if there's a fork reload pending & unconfirmed
  // TODO: add a timeout for unreceived pending?
  newBlock(err, hash) {
    web3.eth.getBlock(hash, function(err, block) {
      if (err) {
        this.setState({error: err});
        return;
      }
      var blockNumber = block.number;
      var pending = _.get(this.state.pending, this.state.genesis, []);
      var unconfirmed = _.get(this.state.unconfirmed, this.state.genesis, []);

      var reloadTxs = pending;

      // If a fork happens, send trigger event and re-load unconfirmed and pending
      if (this.prevBlock && this.prevBlock.hash !== block.parentHash) {
        reloadTxs = reloadTxs.concat(unconfirmed);
        //reloadTxs = new Set([...pending, ...unconfirmed]);
        this.setState({lastFork: blockNumber, blockNumber: blockNumber, timestamp: block.timestamp});
      } else this.setState({blockNumber: blockNumber, timestamp: block.timestamp});

      this.prevBlock = block;

      // Stop watching when no unconfirmed or pending txs left
      if (!pending.length && !unconfirmed.length) this.stopWatching();
      else this.loadTxData(reloadTxs);
    }.bind(this));
  },

  stopWatching() {
    this.filter.stopWatching();
    this.filter = null;
  },

  // sets the eth filter to watch latest blocks
  startWatching() {
    if (this.filter) return;
    this.filter = web3.eth.filter('latest');
    this.filter.watch(this.newBlock);
  },

  // Return array version of payload if not already one
  save(key, val) {
    localforage.setItem(key, JSON.stringify(val), function(err, v) {
      if (err) throw err;
    });
  },

  //// Action handlers

  // Remove everything
  onClearAll() {
    this.setState({
        txs: {},
        info: {},
        pending: {},
        unconfirmed: {}
    });
    this.save('txs', {});
    this.save('info', {});
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

    this.setState({txs: _txs, info: _info, pending: _pending, unconfirmed: _unconfirmed});
    this.save('txs', _txs);
    this.save('info', _info);
  },

  // For each txInfo, check if the hash exists in txInfo already, if it does, overwrite txInfo but don't append to tx array
  onAdd(payload, cb) {
    // Turn params into array if not already, filter out any not including hash property
    payload = this.toArr(payload).filter(function(el) { return el.hasOwnProperty('hash'); });

    // Hashes of txs that haven't been seen yet
    var newHashes = payload.filter(function(el) {
      return !(el.hash in this.state.info);
    }.bind(this)).map(function(el) {
      return el.hash;
    });

    // Overwrite already seen txhashes
    var newInfo = payload.map(function(p) {
      var obj = {};
      obj[p.hash] = p;
      return obj;
    });

    // Remove oldest, confirmed txs from state.txs when it exceeds bufferSize (synchronous)
    this.removeExcessiveTXs();
    var _info = this.state.info;
    var _txs = this.state.txs;
    var _genesis = this.state.genesis;

    _info = _.assign.apply(this, [_info].concat(newInfo));
    _txs[_genesis] = _txs[_genesis].concat(newHashes);

    this.setState({txs: _txs, info: _info});
    this.save('txs', _txs);
    this.save('info', _info);

    // Request new transaction objects and receipts from web3
    this.loadTxData(newHashes, cb);
  },

  recordBlock(blockNum) {
    function getBlock(cb) {
      if (blockNum) return cb(null, blockNum);
      else web3.eth.getBlockNumber(cb);
    }

    getBlock(function(err, blockNumber) {
      if (err) {
        this.setState({error: err});
        return;
      }

      web3.eth.getBlock(blockNumber, function(err, block) {
        if (err) {
          this.setState({error: err});
          return;
        }
        this.setState({blockNumber: blockNumber, timestamp: block.timestamp});
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
  onConnect(opts) {
    if (_.has(opts, 'provider')) web3.setProvider(new web3.providers.HttpProvider(opts.provider));
    if (_.has(opts, 'confirmCount')) this.confirmCount = opts.confirmCount;
    if (_.has(opts, 'bufferSize')) this.bufferSize = opts.bufferSize;

    this.setGenesis(function(err) {
      if (err) {
        this.setState({error: err});
        return;
      }

      this.loadStorage(function() {
        this.loadTxData();
        this.recordBlock();
      }.bind(this));
    }.bind(this));
  }
});
