var webpack = require("webpack");
var	path = require("path");

module.exports = {
	entry: path.resolve(__dirname, "src/index.jsx"),
	output: {
		library: "Web3TX",
		libraryTarget: "umd",

		path: path.resolve(__dirname, "dist"),
		filename: "reflux-txs.js"
	},
	module: {
		noParse: [
			/localforage\/dist\/localforage.js/
		],
		loaders: [
			{test: /.jsx$/, loader: 'babel-loader'},
			{test: /.js$/, loader: 'babel-loader'},
			{test: /localforage\/dist\/localforage.js/, loader: 'exports?localforage'}
		]
	},
	resolve: {
		extensions: ['', '.webpack.js', '.web.js', '.js', '.jsx'],
		alias: {
			'localforage': 'localforage/dist/localforage.js'
		}
	},
	externals: {
		react: 'React',
		reflux: 'Reflux',
		web3: true
	},
	devtool: 'eval'
};
