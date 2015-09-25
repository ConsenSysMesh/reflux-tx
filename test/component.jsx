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
				validateState(testComponent, ['pending']);
				done();
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
				validateTx(err, txObj, tx);
				validateState(testComponent, ['pending']);
				done();
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

		it('both txs pending', function() {
			validateState(testComponent, {pending: txHashes});
		});

		it('tx0 received, tx1 dropped', function(done) {
			web3.eth.onBlock(3, function() {
				validateState(testComponent, {
					received: [txHashes[0]],
					dropped: [txHashes[1]]
				});
				done();
			});
		});

		it('tx0 confirmed, tx1 failed', function(done) {
			web3.eth.onBlock(10, function() {
				validateState(testComponent, {
					confirmed: [txHashes[0]],
					failed: [txHashes[1]]
				});
				done();
			});
		});

	});
});
