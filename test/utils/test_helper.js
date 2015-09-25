import React from 'react/addons';
import chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import web3 from 'web3';

let { assert, expect } = chai,
    { TestUtils } = React.addons;

chai.should();
chai.use(sinonChai);

function validateTx(err, txObj, tx) {
    assert.isNull(err);
    assert.isObject(txObj);
    assert.isNumber(txObj.nonce);
    assert.isString(txObj.from);
    if (tx) {
        assert.equal(txObj.nonce, tx.nonce);
        assert.equal(txObj.from, web3.eth.getAddress(tx.from));
    }
}

function validateTxReceipt(err, receipt, tx) {
    assert.isNull(err);
    assert.equal(receipt.transactionHash, web3.sha3(JSON.stringify(tx)));
    assert.equal(receipt.blockNumber, tx.reception[web3.eth.chainId]);
}

function getHash(tx) {
  return web3.sha3(JSON.stringify(tx));
}

export {
  React,
  chai,
  sinon,
  sinonChai,
  assert,
  expect,
  TestUtils,
  validateTx,
  validateTxReceipt,
  getHash
}
