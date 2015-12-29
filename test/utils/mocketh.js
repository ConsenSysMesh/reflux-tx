var web3 = require('web3');
var chains = require('../chain');
var utils = require('../../src/utils.js');

var mocketh = function(chainName, blockTime) {
	this.chainId = 0;
	this.blockNumber = 0;

	try {
		this.chain = chains[chainName];
	} catch (e) {
		throw new Error('Could not find chain ' + chainName + ' in chain.json spec file');
	}

	this.chainHash = web3.sha3(JSON.stringify(this.chain));
	this.blockTime = blockTime;
	if (!blockTime) this.blockTime = 500;

	this.running = true;
	this.block = this.Block(this.chainId, this.blockNumber);
	this.blockHashMap = {};
	this.blockCallbacks = [];
	this.blocks = {};
	this.blocks[this.block.hash] = this.block;
	this.filterCallback = null;

	this.getTransactionReceipt.request = this.request('getTransactionReceipt');
	this.getTransaction.request = this.request('getTransaction');

	// Fake the chain here
	this.blockInterval = setInterval(this.incChain.bind(this), this.blockTime);
}

mocketh.prototype.request = function(type) {
	return function() {
		var args = Array.prototype.slice.call(arguments);
		return {
			call: type,
			callback: args.pop(),
			args: args
		};
	}
}

mocketh.prototype.incChain = function() {
	if (this.blockNumber++ >= this.chain.length - 1) {
		clearInterval(this.blockInterval);
		this.running = false;
	}

	// update chainId
	if (this.chain.hasOwnProperty('forks') && this.blockNumber in this.chain.forks)
		this.chainId = this.chain.forks[this.blockNumber];

	this.block = this.Block(this.chainId, this.blockNumber);
	this.blocks[this.block.hash] = this.block;

	var hash = this.blockHash(this.chainId, this.blockNumber);
	this.blockHashMap[hash] = this.blockNumber;

	if (typeof this.filterCallback === 'function')
		this.filterCallback(null, hash);

	if (this.blockNumber in this.blockCallbacks)
		this.blockCallbacks[this.blockNumber].forEach(function(cb) {
			cb(hash);
		});
}

mocketh.prototype.Block = function (chainId, number) {
	return {
		number: number,
		timestamp: Math.floor(new Date().getTime() / 1000),
		hash: this.blockHash(chainId, number),
		parentHash: this.blockHash(chainId, number - 1)
	};
}

mocketh.prototype.TransactionReceipt = function(spec) {
	return {
		transactionHash: web3.sha3(JSON.stringify(spec)),
		blockNumber: spec.reception[this.chainId]
	};
}

mocketh.prototype.Transaction = function(spec) {
	return {
		hash: web3.sha3(JSON.stringify(spec)),
		nonce: spec.nonce,
		from: this.getAddress(spec.from || 0)
	};
}

mocketh.prototype.blockHash = function (chainId, number) {
	return web3.sha3(this.chainHash + ':' + chainId + ':' +  number);
}

mocketh.prototype.getAddress = function(index) {
	var hash = web3.sha3(index.toString());
	if (hash.slice(0, 2) === '0x')
		return hash.slice(0, 42);
	else
		return hash.slice(0, 40);
}


mocketh.prototype.getTransaction = function (hash, cb) {
	var tx = this.chain.txs.filter(function(tx) {
		return (
				web3.sha3(JSON.stringify(tx)) === hash
			);
	}).slice(-1).pop();
	if (tx)
		cb(null, this.Transaction(tx));
	else cb(null, null);
}

mocketh.prototype.getTransactionReceipt = function (hash, cb) {
	var tx = this.chain.txs.filter(function(tx) {
		return (
				tx.hasOwnProperty('reception') &&
				this.chainId in tx.reception &&
				tx.reception[this.chainId] <= this.blockNumber &&
				web3.sha3(JSON.stringify(tx)) === hash
			);
	}.bind(this)).slice(-1).pop();

	if (tx)
		return cb(null, this.TransactionReceipt(tx));
	return cb(null, null);
}

mocketh.prototype.getBlockNumber = function (cb) {
	if (cb && typeof cb === 'function')
		cb(null, this.blockNumber);
	else return this.blockNumber;
}

mocketh.prototype.getBlock = function (hashOrNumber, cb) {
	var hash = utils.formatHex(hashOrNumber);

	if (typeof hashOrNumber === 'number')
		hash = this.blockHash(this.chainId, hashOrNumber);

	cb(null, this.blocks[hash]);
}

mocketh.prototype.filter = function (type) {
	return {
		watch: function(cb) {
			this.filterCallback = cb;
		}.bind(this),
		stopWatching: function() {
			this.filterCallback = null;
		}.bind(this)
	};
}

mocketh.prototype.stop = function(number, cb) {
	clearInterval(this.blockInterval);
}

mocketh.prototype.onBlock = function (number, cb) {
	if (!(number in this.blockCallbacks))
		this.blockCallbacks[number] = [];

	this.blockCallbacks[number].push(cb);
}

var createBatch = function() {
	this.fns = [];

	return {
		execute: function() {
			this.fns.forEach(function(fn) {
				this[fn.call].apply(this, fn.args.concat([fn.callback]));
			}.bind(this));
		}.bind(this),
		add: function(func) {
			this.fns.push(func);
		}.bind(this)
	};
}

module.exports = {
	chain: mocketh,
	createBatch: createBatch
};
