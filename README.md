reflux-tx
============

Reflux store for connecting transactions and related info to your React components

###Modules


* TXActions
  * connect()
  * add()
  * clear()
* TXStore
* TXComponent

###Installation

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

####initialization
Before connecting to the store, you must first initialize it in a toplevel component with `TXActions.connect()`. This loads the genesis identifier required for storing any transaction data.

Available options

Field Name  | Description | Default
------------- | ------------- | ------------
provider  | web3 http provider | assumes already set
confirmCount  | Number of blocks before a tx is sufficiently confirmed | 12
bufferSize  | Max number of sufficiently confirmed transactions to keep in storage | 100

Example:

`TXActions.connect({provider: 'http://localhost:8545', confirmCount: 10, bufferSize: 5})`

####create a transaction
Add transaction to TXStore with `TXActions.add(txInfo)` where `txInfo` is an object or array of objects containing at least a `{hash: '0x..'}` property referencing a transaction hash. Any additional properties will be saved and can be used to filter out transactions by arbitrary data.

Example:

```
TXActions.add({
	hash: '0x30f42ba1f7d816d850fd172e128ffbacee7564e0cb41cc27c1e9af743aace6bc',
	type: 'deposit',
	parent: '0x26ac60acb581516b175010730a2bcee041bb0099'
});
```

####view transactions
React components can use the TXComponent wrapper to inherit the latest `blockNumber` as well as `pending` or `unconfirmed` transactions as its properties.

Transaction objects have 3 possible fields

Field Name  | Value | Found in props
------------- | ------------- | ------------
info  | txInfo added via TXActions.add() | confirmed, pending
receipt | object returned from `web3.eth.getTransactionReceipt` | confirmed
data  | object returned from `web3.eth.getTransaction` | confirmed, pending


Example:

```
	render() {
		<TXComponent filter={{type: 'deposit'}} keys=['pending', 'unconfirmed'] >
			<MyComponent />
		</TXComponent>
	}
```
Would be represented in MyComponent as 

```
console.log(this.props.unconfirmed)
[{info: {...}, receipt: {...}, data: {...}}, ...]

console.log(this.props.pending)
[{info: {...}, data: {...}}, ...]

console.log(this.props.blockNumber)
30000
```

###Notes

A component's blockNumber property will only update while you have transactions matching the wrapping TXComponent's `filter` and `keys`