"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var _ = _interopRequire(require("lodash"));

var React = _interopRequire(require("react"));

var Reflux = _interopRequire(require("reflux"));

var ReactMixin = _interopRequire(require("react-mixin"));

var assign = _interopRequire(require("object-assign"));

var TXStore = _interopRequire(require("../Store"));

var utils = _interopRequire(require("../utils"));

// getInitialState
var baseState = {
  pending: [],
  received: [],
  dropped: [],
  failed: [],
  confirmed: [],

  timestamp: 0,
  blockNumber: 0,
  blockHash: ""
};

var TXComponent = (function (_React$Component) {
  function TXComponent(props, context) {
    _classCallCheck(this, TXComponent);

    _get(Object.getPrototypeOf(TXComponent.prototype), "constructor", this).call(this, props, context);
    this.state = _.cloneDeep(baseState);
  }

  _inherits(TXComponent, _React$Component);

  _createClass(TXComponent, {
    parseStore: {

      // State is the txstore state, props are the nextProps or current props

      value: function parseStore(state, props) {
        if (typeof props === "undefined") props = this.props;

        var filter = _.get(this.props, "filter", {});

        // Updated state
        var filteredState = _.cloneDeep(baseState);

        var accounts = _.get(this.props, "account", []);
        var types = _.get(this.props, "keys", []);

        accounts = utils.toArr(accounts);

        if (!accounts.length) accounts = Object.keys(_.get(state, "accounts", {}));

        accounts.filter(function (account) {
          return account !== "children";
        }).forEach(function (account) {
          types.forEach(function (type) {
            var typeStates = _.get(state.accounts, [account, type], {
              nonces: []
            });

            var filteredTypeStates = _.filter(typeStates.nonces.reduce(function (a, nonce) {
              return a.concat(utils.toArr(typeStates[nonce]));
            }, []).map(function (hash) {
              return state.info[hash];
            }), filter).map(function (info) {
              return {
                info: info,
                data: state.objects[info.hash],
                receipt: _.get(state.receipts, info.hash, null)
              };
            });

            filteredState[type] = filteredState[type].concat(filteredTypeStates);
          });
        });

        ["blockNumber", "blockHash", "timestamp"].forEach(function (key) {
          filteredState[key] = state[key];
        });

        this.setState(filteredState);
      }
    },
    componentDidMount: {
      value: function componentDidMount() {
        this.listenTo(TXStore, this.parseStore);
        this.parseStore(TXStore.state, this.props);
      }
    },
    componentDidUpdate: {

      // Ensure the whole state is parsed if component is mounted after state loaded or when props change

      value: function componentDidUpdate(oldProps, oldState) {
        this.parseStore(TXStore.state, this.props);
      }
    },
    shouldComponentUpdate: {

      // Don't rerender children without change in props or state

      value: function shouldComponentUpdate(nextProps, nextState) {
        return !_.isEqual(this.props, nextProps) || !_.isEqual(this.state, nextState);
      }
    },
    passState: {

      // Pass on state as requested from this.props.keys

      value: function passState(child) {
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
          return this.passState(child);
        } else {
          return React.createElement(
            "span",
            null,
            React.Children.map(children, this.passState)
          );
        }
      }
    }
  });

  return TXComponent;
})(React.Component);

TXComponent.defaultProps = { filter: {}, keys: ["pending", "received", "dropped", "failed", "confirmed"] };
ReactMixin(TXComponent.prototype, Reflux.ListenerMixin);
module.exports = TXComponent;