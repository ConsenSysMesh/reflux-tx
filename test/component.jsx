import './utils/setupDom';
import {
	React,
	sinon,
	assert,
	expect,
	TestUtils,
	validateTx,
	validateTxReceipt,
	getHash
} from './utils/test_helper';

import web3 from 'web3';

import TXActions from '../src/Actions';
import TXComponent from '../src/addons/Component';
import { chain, createBatch } from './utils/mocketh';


var states = [
	'pending',
	'received',
	'confirmed',
	'dropped',
	'failed'
];

function validateState(component, expect) {
	states.forEach(function(txState) {
		var expCount = 0;
		if (txState in expect)
			if (typeof expect[txState] === 'number')
				expCount = expect[txState];
			else if (expect[txState] instanceof Array) {
				var hashes = component.state[txState].map(function(txObj) {
					return txObj.info.hash;
				});
				assert.equal(getHash(hashes.slice().sort()), getHash(expect[txState].slice().sort()), txState + ' invalid');
				return;
			} else expCount = 1;
		else if (expect instanceof Array && expect.indexOf(txState) >= 0)
			expCount = 1;

		var actualCount = 0;
		if (txState in component.state)
			actualCount = component.state[txState].length;

		assert.equal(actualCount, expCount, txState + ' invalid');
	});
}

var testComponent;

function setup(name) {
	web3.eth = new chain(name);
	web3.createBatch = createBatch.bind(web3.eth);
	testComponent = TestUtils.renderIntoDocument(<TXComponent />);
	TXActions.clearAll();

	TXActions.connect({confirmCount: 5});
	var txs = web3.eth.chain.txs.map(function(tx) {
		return {hash: getHash(tx)};
	});

	TXActions.add(txs);
}

describe('TXComponent', () => {
	describe('No fork', () => {
		before(() => {
			setup('noFork');
		});
		after(() => {
			web3.eth.stop();
		});

		it('tx pending', (done) => {
			web3.eth.onBlock(1, function() {
				setTimeout(function() {
					validateState(testComponent, ['pending']);
					done();
				}, 200)
			});
		});
		it('tx received', (done) => {
			web3.eth.onBlock(4, function() {
				validateState(testComponent, ['received']);
				done();
			});
		});

		it('tx confirmed', (done) => {
			web3.eth.onBlock(14, function() {
				validateState(testComponent, ['confirmed']);
				done();
			});
		});
	});

	describe('Simple fork', () => {
		var tx, txHash;

		before(() => {
			setup('forkToFail');
			tx = web3.eth.chain.txs[0];
			txHash = getHash(tx);
		});
		after(() => {
			web3.eth.stop();
		});

		it('tx pending', function(done) {
			web3.eth.getTransaction(txHash, function(err, txObj) {
				setTimeout(function() {
					validateTx(err, txObj, tx);
					validateState(testComponent, ['pending']);
					done();
				}, 200)
			});
		});

		it('tx received', function(done) {
			web3.eth.onBlock(4, function() {
				web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
					validateTxReceipt(err, receipt, tx);
					validateState(testComponent, ['received']);
					done();
				});
			});
		});

		it('tx reverts to pending', function(done) {
			web3.eth.onBlock(9, function() {
				web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
					assert.isNull(receipt);
					validateState(testComponent, ['pending']);
					done();
				});
			});
		});

		it('tx remains pending', function(done) {
			web3.eth.onBlock(web3.eth.chain.length, function() {
				web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
					assert.isNull(receipt);
					validateState(testComponent, ['pending']);
					done();
				});
			});
		});
	});

	describe('TX Overwrite', () => {
		var txs, txHashes;
		
		before(() => {
			setup('twotxs');
			txs = web3.eth.chain.txs;
			txHashes = [getHash(txs[0]), getHash(txs[1])];
		});
		after(() => {
			web3.eth.stop();
		});

		it('both txs pending', function(done) {
			setTimeout(function() {
				validateState(testComponent, {pending: txHashes});
				done();
			}, 100)
		});

		it('tx0 received, tx1 dropped', function(done) {
			web3.eth.onBlock(2, function() {
				validateState(testComponent, {
					received: [txHashes[0]],
					dropped: [txHashes[1]]
				});
				done();
			});
		});

		it('tx0 confirmed, tx1 failed', function(done) {
			web3.eth.onBlock(8, function() {
				validateState(testComponent, {
					confirmed: [txHashes[0]],
					failed: [txHashes[1]]
				});
				done();
			});
		});
	});
	describe('Garbage Collection', () => {
		var txs, txHashes;

		before(() => {
			setup('GC');
			txs = web3.eth.chain.txs;
			txHashes = txs.map(function(tx) {
				return getHash(tx);
			});
			TXActions.connect({confirmCount: 2, bufferSize: 2});
		});
		after(() => {
			web3.eth.stop();
		});

		it('txs pending', function(done) {
			validateState(testComponent, {
				pending: txHashes
			});
			done();
		});

		it('tx0 received, tx1 dropped', function(done) {
			web3.eth.onBlock(2, function() {
				validateState(testComponent, {
					received: [txHashes[0]],
					dropped: [txHashes[1]],
					pending: txHashes.slice(2)
				});
				done();
			});
		});

		it('tx2 received, tx3 dropped', function(done) {
			web3.eth.onBlock(3, function() {
				validateState(testComponent, {
					received: [txHashes[0], txHashes[2]],
					dropped: [txHashes[1], txHashes[3]],
					pending: txHashes.slice(4)
				});
				done();
			});
		});

		it('tx4 received, tx5 dropped', function(done) {
			web3.eth.onBlock(4, function() {
				validateState(testComponent, {
					received: [txHashes[0], txHashes[2], txHashes[4]],
					dropped: [txHashes[1], txHashes[3], txHashes[5]],
					pending: txHashes.slice(6)
				});
				done();
			});
		});

		it('tx6 received, tx7 dropped, tx0 confirmed, tx1 failed', function(done) {
			web3.eth.onBlock(5, function() {
				validateState(testComponent, {
					received: [txHashes[2], txHashes[4], txHashes[6]],
					dropped: [txHashes[3], txHashes[5], txHashes[7]],
					failed: [txHashes[1]],
					confirmed: [txHashes[0]]
				});
				done()
			});
		});

		it('tx 2 confirmed, tx3 failed, GC tx0 & tx1', function(done) {
			web3.eth.onBlock(6, function() {
				validateState(testComponent, {
					received: [txHashes[4], txHashes[6]],
					dropped: [txHashes[5], txHashes[7]],
					failed: [txHashes[3]],
					confirmed: [txHashes[2]]
				});
				done();
			});
		});

		it('tx 4 confirmed, tx5 failed, GC tx2 & tx3', function(done) {
			web3.eth.onBlock(7, function() {
				validateState(testComponent, {
					received: [txHashes[6]],
					dropped: [txHashes[7]],
					failed: [txHashes[5]],
					confirmed: [txHashes[4]]
				});
				done();
			});
		});
	});
});
