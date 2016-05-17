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
  this.list = [];
}

UserManager.prototype.addUser = function(type, socket, data, cb) {
  var self = this, user;

  //find customer
  var customer = _.find(self.list, function(c) {
    return c.id == data.customer;
  });

  if (!customer) {
    customer = {
      id: data.customer,
      operators: [],
      visitors: []
    }
    //create new user
    user = {
      id: data.id,   //db id
      sockets: [],
      peers: [],
      call: {/*socket, peer*/},
      join: new Date()
    };
    user.sockets.push(socket);

    //check type
    if (type == 'visitor') {
      customer.visitors.push(user);
    } else {
      customer.operators.push(user);
    }
    self.list.push(customer);
    return cb(null, null);
  }

  //find visitor in visitor list
  if (type == 'visitor') {
    user = _.find(customer.visitors, function(v) {
      return v.id == data.id;
    });
  } else {
    user = _.find(customer.operators, function(o) {
      return o.id == data.id;
    });
  }

  if (user) {
    user.sockets.push(socket);

    //TODO if operator send back all visitor's information
    return cb(null);
  }

  //create new visitor
  user = {
    id: data.id,         //socket id
    sockets: [],
    peers: [],
    call: {/*socket, peer*/},
    join: new Date()
  };
  user.sockets.push(socket);

  if (type == 'visitor') {
    customer.visitors.push(user);
  } else {
    customer.operators.push(user);
  }
  logger.info('user', user, customer);

  //find all operators
  //var opers = _.filter(self.operators, function(o) {
  //  return o.customer == data.customer;
  //});
  //
  //var operSockets = [];
  //_.each(opers, function(o) {
  //  operSockets.push(o.socket);
  //});

  //return cb(null, operSockets);
  return cb(null, null);
};

/**
 * @param cid customer id
 * @param oid operator id
 * @returns sockets of a operator
 */
UserManager.prototype.getOperatorSockets = function(cid, oid) {
  var self = this;

  //find customer
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });

  if (!customer)
    return null;

  var ret = _.find(customer.operators, function(user) {
    return user.id == oid;
  });

  return ret ? ret.sockets : null;
};

/**
 * @param details cid, oid/vid
 * @returns sockets of visitor or operator
 */
UserManager.prototype.getSendSockets = function(details) {
  var self = this;
  var customer, user;

  //find customer
  customer = _.find(self.list, function(l) {
    return l.id == details.cid;
  });
  logger.info('customer', customer, details, details.from);
  if (!customer) return null;

  if (details.to == 'o') {
    logger.info('operator', details.oid);
    user = _.find(customer.operators, function(o) {
      return o.id == details.oid;
    });
  } else {
    logger.info('visitor', details.oid);
    user = _.find(customer.visitors, function(o) {
      return o.id == details.vid;
    });
  }
  logger.info('find user', user);
  return user ? user.sockets : null;
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
UserManager.prototype.addPeerChat = function(oid, vid) {
  var self = this;

  //search operator
  var oper = _.find(self.operators, function(o) {
    return o.id == oid;
  });
  if (oper)
    oper.peers.push(vid);

  //search visitor
  var v = _.find(self.visitors, function(v) {
    return v.id == vid;
  });
  if (v)
    v.peers.push(oid);
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
