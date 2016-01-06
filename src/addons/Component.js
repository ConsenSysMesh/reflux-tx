import _ from 'lodash';
import React  from 'react';
import Reflux from 'reflux';
import ReactMixin from 'react-mixin';
import assign from 'object-assign';

import TXStore from '../Store';
import utils from '../utils';

// getInitialState
var baseState = {
  pending: [],
  received: [],
  dropped: [],
  failed: [],
  confirmed: [],

  timestamp: 0,
  blockNumber: 0,
  blockHash: ''
};

class TXComponent extends React.Component {
  constructor(props, context) {
      super(props, context);
      this.state = _.cloneDeep(baseState);
  }

  // State is the txstore state, props are the nextProps or current props
  parseStore(state, props) {
    if (typeof props === 'undefined')
      props = this.props;

    var filter = _.get(this.props, 'filter', {});

    // Updated state
    var filteredState = _.cloneDeep(baseState);

    var accounts = _.get(this.props, 'account', []);
    var types = _.get(this.props, 'keys', []);

    accounts = utils.toArr(accounts);

    if (!accounts.length)
      accounts = Object.keys(_.get(state, 'accounts', {}));

    accounts.filter(function(account) {
      return account !== 'children';
    }).forEach(function(account) {
      types.forEach(function(type) {
        var typeStates = _.get(state.accounts, [account, type], {
          nonces: []
        });

        var filteredTypeStates = _.filter(typeStates.nonces.reduce(function(a, nonce) {
          return a.concat(utils.toArr(typeStates[nonce]));
        }, []).map(function(hash) {
          return state.info[hash];
        }), filter).map(function(info) {
          return {
            info: info,
            data: state.objects[info.hash],
            receipt: _.get(state.receipts, info.hash, null)
          };
        });

        filteredState[type] = filteredState[type].concat(filteredTypeStates);
      });
    });

    ['blockNumber', 'blockHash', 'timestamp'].forEach(function(key) {
      filteredState[key] = state[key];
    });


    this.setState(filteredState);
  }

  componentDidMount() {
    this.listenTo(TXStore, this.parseStore);
    this.parseStore(TXStore.state, this.props);
  }

  // Ensure the whole state is parsed if component is mounted after state loaded or when props change
  componentDidUpdate(oldProps, oldState) {
    this.parseStore(TXStore.state, this.props);
  }

  // Don't rerender children without change in props or state
  shouldComponentUpdate(nextProps, nextState) {
    return (!_.isEqual(this.props, nextProps) ||
            !_.isEqual(this.state, nextState));
  }

  // Pass on state as requested from this.props.keys
  passState(child) {
    var state = this.state;
    var keys = this.props.keys.concat(['blockNumber', 'timestamp']);

    let statePass = keys.reduce(function(o, key) {
      o[key] = state[key];
      return o;
    }, {});

    return React.cloneElement(
        child,
        assign(statePass)
        );
  }
  render() {
    const {children} = this.props;
    if (!children) return null;
    if (children.constructor !== Array) {
      const child = children;
      return this.passState(child)
    } else {
      return (
          <span>
            {React.Children.map(children, this.passState)}
          </span>
          );
    }
  }
}

TXComponent.defaultProps = { filter: {}, keys: ['pending', 'received', 'dropped', 'failed', 'confirmed']} ;
ReactMixin(TXComponent.prototype, Reflux.ListenerMixin);
export default TXComponent;
