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

UserManager.prototype.addVisitor = function(socket, data) {
  var user = {
    id: data.id,         //socket id
    customer: data.customer,
    socket: socket,
    peers: [],
    call: {/*socket, peer*/}
  };
  logger.info('visitor', user);
  this.visitors.push(user);
};

UserManager.prototype.addOperator = function(socket, data) {
  var user = {
    id: data.id,         //socket id
    socket: socket,
    customer: data.customer,
    peers: [],
    call: {}
  };
  logger.info('operator', user);
  this.operators.push(user);
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
  logger.info('all user', self.users);
  logger.info('caller-callee', caller, callee);

  //support only visitor --> operator
  //visitor = caller, operator = callee
  var opr = _.find(self.operators, function(op) {
    return op.userid == caller.caller;
  });
  if (!addedCaller) return;

  var addedCallee = _.find(self.users, function(user) {
    return user.id == callee.id;
  });
  if (!addedCallee) return;

  var callerPeer = _.find(addedCaller.peers, function(peer) {
    return peer == callee.id;
  });

  if (!callerPeer) { //add peer
    addedCallee.peers.push(addedCaller.id);
    addedCaller.peers.push(addedCallee.id);
  }

  //add call peer
  addedCaller.call.id = caller.callid;
  addedCaller.call.peer = callee.callid;

  addedCallee.call.id = callee.callid;
  addedCallee.call.peer = caller.callid;

  logger.info('all user', self.users);
}

UserManager.prototype.getPeers = function(id, cb) {
  var self = this;
  var type;

  var user = _.find(self.operators, function(u) {
    if (u.socket == id) { type = 'operator'; return true; }
    if (u.call.socket == id) { type = 'call'; return true; }
    return false;
  });
  if (user)
    return cb(null, type, user);

  user = _.find(self.visitors, function(u) {
    if (u.socket == id) { type = 'visitor'; return true; }
    if (u.call.socket == id) { type = 'call'; return true; }
    return false;
  });

  if (user)
    return cb(null, type, user);

  return cb({error: 'not found'});
}

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
