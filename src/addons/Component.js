import _ from 'lodash';
import React  from 'react/addons';
import { Component }  from 'react/addons';
import TXStore from '../Store';
import Reflux from 'reflux';
import ReactMixin from 'react-mixin';
import shallowEqual from 'react-pure-render/shallowEqual';
import assign from 'object-assign';

// Keys that transform into 
var keyFields = {'txs': ['objects', 'info', 'receipts'], 'pending': ['objects', 'info'], 'unconfirmed': ['objects', 'info', 'receipts']};
var mapOverride = {
  'objects': 'data',
  'receipts': 'receipt',
  'info': 'info'
};

class TXComponent extends Component {
  constructor(props, context) {
      super(props, context);
      this.state = {
        pending: [],
        unconfirmed: [],
        txs: [],
        blockNumber: 0
      };
  }

  // Filter out the store's state to only what the child components care about
  parseStore(state, props) {
    if (typeof props === 'undefined')
      props = this.props;

    var filter = this.props.filter || {};
    var filteredState = {};
    var didUpdate = false;

    props.keys.forEach(function(key) {
      if (!keyFields.hasOwnProperty(key)) {
        filteredState[key] = state[key];
        return;
      }

      var fields = keyFields[key];

      var vals = state[key][state.genesis] || [];

      // Match component's filter
      filteredState[key] = _.filter(vals.map(function(hash) {
        return state.info[hash];
      }), filter).map(function(info) { return info.hash; }).filter(function(hash) {
        // If all required fields exist
        return fields.reduce(function(truth, field) {
          return truth && (state[field].hasOwnProperty(hash));
        }, true);
      }).map(function(hash) {
        // return the fields
        return fields.reduce(function(obj, field) {
          obj[mapOverride[field]] = state[field][hash];
          return obj;
        }, {});
      });
      didUpdate = didUpdate || filteredState[key].length > 0;
    });

    if (didUpdate && state.hasOwnProperty('blockNumber'))
      filteredState.blockNumber = state.blockNumber;

    this.setState(filteredState);
  }
  componentDidMount() {
    var cb = this.parseStore;
    this.listenTo(TXStore, cb, cb);
  }
  // Don't rerender children without change in props or state
  shouldComponentUpdate(nextProps, nextState) {
    var statesEqual = true;
    for (var key in nextState) {
      statesEqual = statesEqual && shallowEqual(nextState[key], this.state[key]);
    }
    return !shallowEqual(this.props, nextProps) || !statesEqual;
  }
  componentWillReceiveProps(nextProps) {
    this.parseStore(TXStore.state, nextProps);
  }
  // Pass on state as requested from this.props.keys
  passTXs(child) {
    var state = this.state;
    var keys = this.props.keys.concat(['blockNumber']);

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
      return this.passTXs(child)
    } else {
      return (
          <span>
            {React.Children.map(children, this.passTXs)}
          </span>
          );
    }
  }
}

TXComponent.defaultProps = { filter: {}, keys: ['pending', 'unconfirmed'] };
ReactMixin(TXComponent.prototype, Reflux.ListenerMixin);
export default TXComponent;
