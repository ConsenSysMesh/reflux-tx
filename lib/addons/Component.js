"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var _ = _interopRequire(require("lodash"));

var _reactAddons = require("react/addons");

var React = _interopRequire(_reactAddons);

var Component = _reactAddons.Component;

var TXStore = _interopRequire(require("../Store"));

var Reflux = _interopRequire(require("reflux"));

var ReactMixin = _interopRequire(require("react-mixin"));

var shallowEqual = _interopRequire(require("react-pure-render/shallowEqual"));

var assign = _interopRequire(require("object-assign"));

// Keys that transform into
var keyFields = { txs: ["objects", "info", "receipts"], pending: ["objects", "info"], unconfirmed: ["objects", "info", "receipts"] };
var mapOverride = {
  objects: "data",
  receipts: "receipt",
  info: "info"
};

var TXComponent = (function (_Component) {
  function TXComponent(props, context) {
    _classCallCheck(this, TXComponent);

    _get(Object.getPrototypeOf(TXComponent.prototype), "constructor", this).call(this, props, context);
    this.state = {
      pending: [],
      unconfirmed: [],
      txs: [],
      timestamp: 0,
      blockNumber: 0
    };
  }

  _inherits(TXComponent, _Component);

  _createClass(TXComponent, {
    parseStore: {

      // Filter out the store's state to only what the child components care about

      value: function parseStore(state, props) {
        if (typeof props === "undefined") props = this.props;

        var filter = this.props.filter || {};
        var filteredState = {};
        var didUpdate = false;

        props.keys.forEach(function (key) {
          if (!keyFields.hasOwnProperty(key)) {
            filteredState[key] = state[key];
            return;
          }

          var fields = keyFields[key];

          var vals = state[key][state.genesis] || [];

          // Match component's filter
          filteredState[key] = _.filter(vals.map(function (hash) {
            return state.info[hash];
          }), filter).map(function (info) {
            return info.hash;
          }).filter(function (hash) {
            // If all required fields exist
            return fields.reduce(function (truth, field) {
              return truth && state[field].hasOwnProperty(hash);
            }, true);
          }).map(function (hash) {
            // return the fields
            return fields.reduce(function (obj, field) {
              obj[mapOverride[field]] = state[field][hash];
              return obj;
            }, {});
          });
          didUpdate = didUpdate || filteredState[key].length > 0;
        });

        if (didUpdate && state.hasOwnProperty("blockNumber")) filteredState.blockNumber = state.blockNumber;

        if (didUpdate && state.hasOwnProperty("timestamp")) filteredState.timestamp = state.timestamp;

        this.setState(filteredState);
      }
    },
    componentDidMount: {
      value: function componentDidMount() {
        var cb = this.parseStore;
        this.listenTo(TXStore, cb, cb);
      }
    },
    shouldComponentUpdate: {
      // Don't rerender children without change in props or state

      value: function shouldComponentUpdate(nextProps, nextState) {
        var statesEqual = true;
        for (var key in nextState) {
          statesEqual = statesEqual && shallowEqual(nextState[key], this.state[key]);
        }
        return !shallowEqual(this.props, nextProps) || !statesEqual;
      }
    },
    componentWillReceiveProps: {
      value: function componentWillReceiveProps(nextProps) {
        this.parseStore(TXStore.state, nextProps);
      }
    },
    passTXs: {
      // Pass on state as requested from this.props.keys

      value: function passTXs(child) {
        var state = this.state;
        var keys = this.props.keys.concat(["blockNumber", "timestamp"]);

        var statePass = keys.reduce(function (o, key) {
          o[key] = state[key];
          return o;
        }, {});

        return React.cloneElement(child, assign(statePass));
      }
    },
    render: {
      value: function render() {
        var children = this.props.children;

        if (!children) {
          return null;
        }if (children.constructor !== Array) {
          var child = children;
          return this.passTXs(child);
        } else {
          return React.createElement(
            "span",
            null,
            React.Children.map(children, this.passTXs)
          );
        }
      }
    }
  });

  return TXComponent;
})(Component);

TXComponent.defaultProps = { filter: {}, keys: ["pending", "unconfirmed"] };
ReactMixin(TXComponent.prototype, Reflux.ListenerMixin);
module.exports = TXComponent;