var webpack = require("webpack");
var	path = require("path");

module.exports = {
	entry: path.resolve(__dirname, "src/index.jsx"),
	output: {
		library: "RefluxTX",
		libraryTarget: "umd",

		path: path.resolve(__dirname, "dist"),
		filename: "reflux-tx.js"
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
		localforage: 'lf',
		localforage: 'localforage',
		lodash: '_',
		react: 'React',
		'react-mixin': 'ReactMixin',
		reflux: 'Reflux',
		'reflux-state-mixin': 'StateMixinFactory',
		web3: true
	},
	devtool: 'eval'
};
