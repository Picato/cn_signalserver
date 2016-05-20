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
    return c.id == data.cid;
  });

  //new customer
  if (!customer) {
    customer = {
      id: data.cid,
      operators: [],
      visitors: []
    }

    //create new user
    user = {
      id: data.id,   //db id
      sockets: [],
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
    logger.info('add customer', customer);
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

  //create new operator/visitor
  user = {
    id: data.id,         //socket id
    sockets: [],
    call: {/*socket, peer*/},
    join: new Date()
  };
  user.sockets.push(socket);

  if (type == 'visitor') {
    customer.visitors.push(user);
  } else {
    customer.operators.push(user);
  }
  logger.info('add user', user, customer);

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
  logger.info('1', cid, oid);
  if (!customer)
    return null;
  logger.info('2', customer);
  var ret = _.find(customer.operators, function(user) {
    return user.id == oid;
  });
  logger.info('3');
  return ret ? ret.sockets : null;
};

/**
 * @param cid customer id
 * @param vid visitor id
 * @returns sockets of a visitor
 */
UserManager.prototype.getVisitorSockets = function(cid, vid) {
  var self = this;

  //find customer
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });

  if (!customer)
    return null;

  var ret = _.find(customer.visitors, function(user) {
    return user.id == vid;
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

module.exports = UserManager;
