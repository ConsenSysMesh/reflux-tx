import {
	assert,
	expect,
	validateTx,
	validateTxReceipt,
	getHash
} from './utils/test_helper';

import { chain, createBatch } from './utils/mocketh';
import web3 from 'web3';


describe('Mocketh', () => {
    describe('Basic Coverage', function() {
        var tx, txHash;

        before(function() {
            web3.eth = new chain('noFork');
            tx = web3.eth.chain.txs[0];
            txHash = getHash(tx);
        });

        it('filter', function(done) {
            var filter = web3.eth.filter('latest');

            filter.watch(function(err, hash) {
                assert.isNull(err);
                assert.isNotNull(hash);
                filter.stopWatching();
                done();
            });
        });


        it('getTransaction', function(done) {
            assert.isNotNull(txHash);

            web3.eth.getTransaction(txHash, function(err, txObj) {
                validateTx(err, txObj, tx);
                done();
            });
        });

        it('getTransactionReceipt', function(done) {
            web3.eth.onBlock(8, function() {
                web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
                    validateTxReceipt(err, receipt, tx);
                    done();
                });
            });
        });

        it('onBlock', function(done) {
            web3.eth.onBlock(15, function(blockHash) {
                assert.isNotNull(blockHash);
                done();
            });
        });

        it('getBlock', function(done) {
            web3.eth.getBlock(3, function(err, block) {
                assert.isNull(err);
                assert.isObject(block);
                assert.isNumber(block.timestamp);
                assert.isString(block.blockHash);
                assert.isString(block.parentHash);
                assert.notEqual(block.parentHash, block.blockHash);
                web3.eth.getBlock(block.blockHash, function(err, blockByHash) {
                    assert.isNull(err);
                    assert.deepEqual(blockByHash, block);
                    web3.eth.getBlock(2, function(err, parentBlock) {
                        assert.deepEqual(parentBlock.blockHash, block.parentHash);
                        done();
                    });
                })
            });
        });

        it('getBlockNumber', function(done) {
            web3.eth.onBlock(17, function() {
                web3.eth.getBlockNumber(function(err, number) {
                    assert.equal(number, 17);
                    done();
                });
            });
        });

        it('chain ends', function(done) {
            web3.eth.onBlock(web3.eth.chain.length, function() {
                assert.isFalse(web3.eth.running);
                done();
            });
        });
    });

    describe('Fork Test', function() {
        var tx, txHash;
        before(function() {
            web3.eth = new chain('forkToFail');
            web3.createBatch = createBatch.bind(web3.eth);
            tx = web3.eth.chain.txs[0];
            txHash = getHash(tx);
        });

        it('batch request', function(done) {
            var batch = web3.createBatch();
            var received = 0;

            function handleRequest(h, err, txObj) {
                assert.equal(h, txHash);
                validateTx(err, txObj, tx);

                if (++received == 2)
                    done();
            }

            batch.add(web3.eth.getTransaction.request(txHash, handleRequest.bind(this, txHash)));
            batch.add(web3.eth.getTransaction.request(txHash, handleRequest.bind(this, txHash)));

            batch.execute();
        });

        it('tx data exists', function(done) {
            web3.eth.getTransaction(txHash, function(err, txObj) {
                validateTx(err, txObj, tx);
                done();
            });
        });

        it('tx receipt exists', function(done) {
            web3.eth.onBlock(4, function(block) {
                web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
                    validateTxReceipt(err, receipt, tx);
                    done();
                });
            });
        });

        it('fork detected', function(done) {
            web3.eth.onBlock(5, function() {
                web3.eth.getBlock(5, function(err, blockFive) {
                    web3.eth.onBlock(6, function() {
                        web3.eth.getBlock(6, function(err, blockSix) {
                            assert.notEqual(blockSix.parentHash, blockFive.blockHash);
                            done();
                        });
                    })
                });
            });
        });

        it('tx receipt null', function(done) {
            web3.eth.onBlock(9, function(block) {
                web3.eth.getTransaction(txHash, function(err, txObj) {
                    validateTx(err, txObj, tx);
                    web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
                        assert.isNull(err);
                        assert.isNull(receipt);
                        done();
                    });
                });
            });
        });
    });
});
