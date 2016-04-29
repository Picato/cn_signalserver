/**
 * Created by tuan on 30/03/2016.
 */
var _ = require('lodash'),
  logger = require('winston');

/**
 * @constructor manage all users
 *              will be upgrade to db/redis base
 */
function UserManager() {
  this.operators = [];
  this.visitors = [];
}

UserManager.prototype.addVisitor = function(socket, data, cb) {
  var self = this;
  var user = {
    id: data.id,         //socket id
    customer: data.customer,
    socket: socket,
    peers: [],
    call: {/*socket, peer*/}
  };
  logger.info('visitor', user);
  this.visitors.push(user);

  //find all operators
  var opers = _.filter(self.operators, function(o) {
    return o.customer == data.customer;
  });

  var operSockets = [];
  _.each(opers, function(o) {
    operSockets.push(o.socket);
  });

  return cb(null, operSockets);
};

UserManager.prototype.addOperator = function(socket, data, cb) {
  var self = this;
  var user = {
    id: data.id,         //socket id
    socket: socket,
    customer: data.customer,
    peers: [],
    call: {}
  };
  logger.info('operator', user);
  this.operators.push(user);

  //count number of visitor
  var visitors = _.filter(self.visitors, function(v) {
    return v.customer == data.customer;
  });
  return cb(null, visitors.length);
};

UserManager.prototype.getOperSocketId = function(operid) {
  var self = this;
  var ret = _.find(self.operators, function(user) {
    return user.id == operid;
  });

  return ret ? ret.socket : null;
};

UserManager.prototype.removeUser = function(socket, type) {
  var self = this;
  console.log('operators: ', self.operators);
  console.log('visitor: ',self.visitors)
  if (type == 'visitor')
    _.remove(self.visitors, function(user) {
      return user.socket == socket;
    });
  else
    _.remove(self.operators, function(user) {
      return user.socket == socket;
    });

  //testing
  console.log('operators: ', self.operators);
  console.log('visitor: ',self.visitors)
};

//visitor & operator
UserManager.prototype.addPeerChat = function(peer1, peer2, from) {
  var self = this;
  var opr, vis;
  if (from == 'operator') {
    opr = peer1; vis = peer2;
  } else {
    opr = peer2; vis = peer1;
  }
  //search operator
  var oper = _.find(self.operators, function(o) {
    return o.socket == opr;
  });
  if (opr)
    oper.peers.push(vis);

  //search visitor
  var v = _.find(self.visitors, function(v) {
    return v.socket == vis;
  });
  if (v)
    v.peers.push(opr);
}

/**
 * add Peer if caller & callee are not peers
 * add call session peer
 * @param caller
 * @param callee
 */
UserManager.prototype.addPeerCall = function(caller, callee) {
  var self = this;
  logger.info('all operator', self.operators);
  logger.info('all visitor', self.visitors);
  logger.info('caller-callee', caller, callee);

  //support only visitor --> operator
  //visitor = caller, operator = callee
  var opr = _.find(self.operators, function(op) {
    return op.id == callee.id;
  });
  if (!opr) return;

  var visitor = _.find(self.visitors, function(v) {
    return v.id == caller.id;
  });
  if (!visitor) return;

  //add peer
  if (opr.peers.indexOf(visitor.socket) == -1)  //add peer
    opr.peers.push(visitor.socket);
  if (visitor.peers.indexOf(opr.socket) == -1)
    visitor.peers.push(opr.socket);

  //add call peer
  caller.socket = visitor.socket;
  opr.call = caller;

  callee.socket = opr.socket;
  visitor.call = callee;

  logger.info('after add - all operator', self.operators);
  logger.info('after add - all visitor', self.visitors);
}

UserManager.prototype.removePeerCall = function(user, type) {
  var self = this;
  var peerId = user.call.id, peer;

  if (type == 'operator-call') {
    peer = _.find(self.visitors, function(v) {
      return v.id == peerId;
    });
  } else {  //type == 'visitor-call'
    peer = _.find(self.operators, function(o) {
      return o.id == peerId;
    });
  }
  if (peer)
    peer.call = {};
  user.call = {};

  logger.info('operators', self.operators);
  logger.info('visitor', self.visitors);
}
UserManager.prototype.getPeers = function(id, cb) {
  var self = this;
  var type;

  var user = _.find(self.operators, function(u) {
    if (u.socket == id) { type = 'operator'; return true; }
    if (u.call && u.call.talks == id) { type = 'operator-call'; return true; }
    //TODO should check call socket to faster search
    return false;
  });
  if (user)
    return cb(null, type, user);

  user = _.find(self.visitors, function(u) {
    if (u.socket == id) { type = 'visitor'; return true; }
    if (u.call && u.call.talks == id) { type = 'visitor-call'; return true; }
    return false;
  });

  if (user)
    return cb(null, type, user);

  return cb({error: 'not found'});
};

UserManager.prototype.getOperatorsByCustomer = function(id, cb) {
  var self = this;
  var operators = _.filter(self.operators, function(operator) {
    return operator.customer == id;
  });

  return cb(null, operators);
};

UserManager.prototype.updateId = function(sid, newid) {
  var self = this;

  //find visitor
  var visitor = _.find(this.users, function(user) {
    return user.id == sid;
  });

  if (visitor) visitor.userid = newid;

  console.log(self.users);
}

module.exports = UserManager;
