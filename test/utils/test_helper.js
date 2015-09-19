import React from 'react/addons';
import chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';


let { assert, expect } = chai,
    { TestUtils } = React.addons;

chai.should();
chai.use(sinonChai);

export {
  React,
  chai,
  sinon,
  sinonChai,
  assert,
  expect,
  TestUtils
}
