reflux-tx
============

Reflux store & higher order component for monitoring Ethereum transactions in real-time

#### Features

* Serverless (excluding eth client)
* Persistent - uses localstorage, retains state over page refreshes
* Associate arbitrary data with any transaction
* Detect chain reorgs and failed transactions
* States filterable by extra properties you can associate w txs
* Multiple chain support


### Possible TX States


  ![states](https://raw.githubusercontent.com/ConsenSys/reflux-tx/enhance/docs/tx_states.png)

<dl>
  <dt><h4>pending</h4></dt>
  <dd>TX has been accepted as valid, is waiting for receipt into a valid block</dd>
  <dt><h4>received</h4></dt>
  <dd>TX has been received into a block, is waiting for sufficient confirmation</dd>
  <dt><h4>dropped</h4></dt>
  <dd>TX is dropped when a tx with equal or higher nonce has been received</dd>
  <dt><h4>confirmed</h4></dt>
  <dd>Enough blocks have passed since receipt to consider the TX confirmed & a reversion is sufficiently unlikely </dd>
  <dt><h4>failed</h4></dt>
  <dd>TX is failed when a tx with equal or higher nonce is confirmed</dd>
</dl>


## Installation

`npm install reflux-tx`

Also, webpack requires these config additions to use localforage:

```
	module: {
		noParse: [ /localforage\/dist\/localforage.js/ ],
		loaders: [ {test: /localforage\/dist\/localforage.js/, loader: 'exports?localforage'} ]
	},
	resolve: {
		alias: { 'localforage': 'localforage/dist/localforage.js' }
	}
	
```

Usage
--------------

#### initialization
Before connecting to the store, you must first initialize it in a toplevel component with `TXActions.connect()`. This loads the genesis identifier required for storing any transaction data.

Available options

Field Name  | Description | Default
------------- | ------------- | ------------
provider  | web3 http provider | assumes already set
confirmCount  | Number of blocks before a tx is sufficiently confirmed | 12
bufferSize  | Max number of sufficiently confirmed transactions to keep in storage | 100

Example:

`TXActions.connect({provider: 'http://localhost:8545', confirmCount: 10, bufferSize: 5})`

#### create a transaction
Add transaction to TXStore with `TXActions.add(txInfo)` where `txInfo` is an object or array of objects containing at least a `{hash: '0x..'}` property referencing a transaction hash. Any additional properties will be saved and can be used to filter out transactions by arbitrary data.

Example:

```
TXActions.add({
	hash: '0x30f42ba1f7d816d850fd172e128ffbacee7564e0cb41cc27c1e9af743aace6bc',
	type: 'deposit',
	parent: '0x26ac60acb581516b175010730a2bcee041bb0099'
});
```

#### view transactions
React components can use the TXComponent wrapper to inherit the latest `blockNumber`, `timestamp` (block.timesamp), and `blockHash` along with array representations of each transaction state as its properties.

Transaction state objects have 3 possible fields

Field Name  | Value | In tx states
------------- | ------------- | ------------
info  | txInfo added via TXActions.add() | *
data  | object returned from `web3.eth.getTransaction` | *
receipt | object returned from `web3.eth.getTransactionReceipt` | pending, received, confirmed



Example:

```
	render() {
		<TXComponent filter={{txType: 'deposit'}} >
			<MyComponent />
		</TXComponent>
	}
```
Would be represented in MyComponent as 

```
console.log(this.props.received)
[{info: {...}, receipt: {...}, data: {...}}, ...]

console.log(this.props.confirmed)
[{info: {...}, receipt: {...}, data: {...}}, ...]

console.log(this.props.pending)
[{info: {...}, data: {...}}, ...]

console.log(this.props.dropped)
[{info: {...}, data: {...}}, ...]

console.log(this.props.failed)
[{info: {...}, data: {...}}, ...]

console.log(this.props.blockNumber)
30000
```

### Notes

reflux-tx will only subscribe to new block info when it's needed for tx confirmations. For that reason, a component's block properties (blockNumber, timestamp, blockHash) will update only while you have pending or received transactions matching the wrapping TXComponent's `filter` and `keys`.
