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
    call: {}
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

UserManager.prototype.removeUser = function(id) {
  _.remove(this.users, function(user) {
    return user.id == id;
  });
};

//visitor & operator
UserManager.prototype.addPeerChat = function(peer1, peer2, from) {
  var self = this;
  if (from == 'operator') {
    //search operator
    var opr = _.find(self.operators, function(o) {
      return o.socket == peer1;
    });
    if (opr)
      opr.peers.push(peer2);

    //search visitor
    var v = _.find(self.visitors, function(v) {
      return v.socket == peer2;
    });
    if (v)
      v.peers.push(peer2);
  }
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
  //check caller & callee are peer
  var addedCaller = _.find(self.users, function(user) {
    return user.userid == caller.caller;
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

UserManager.prototype.getPeers = function(id) {
  var ret = _.find(this.users, function(user) {
    return user.id == id;
  });

  return ret ? ret.peers : null;
}

UserManager.prototype.getCallPeers = function(id, cb) {
  var self = this;
  var type;

  var user = _.find(self.users, function(u) {
    if (u.id == id) { type = 'user'; return true; }
    if (u.call.id == id) { type = 'call'; return true;}
    return false;
  });

  console.log(user, type);
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
