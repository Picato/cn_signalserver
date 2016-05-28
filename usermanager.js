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
      user.name = data.name;
      user.conek = null;    //visitor has only one conek
      customer.visitors.push(user);
    } else {
      user.coneks = [];    //operator has multiple coneks
      customer.operators.push(user);
    }
    logger.info('add customer', customer);

    self.list.push(customer);
    return cb(null, null);
  }

  var coneks = [];
  if (type == 'visitor') {
    user = _.find(customer.visitors, function(v) {
      return v.id == data.id;
    });
    console.log('search id', data.id);
    console.log('search id', customer);
    if (user) {
      console.log('user', user);
      user.sockets.push(socket);
      if (user.conek)
        coneks.push(user.conek);
      else
        coneks = null;

      return cb(null, coneks);
    }
  } else {
    user = _.find(customer.operators, function(o) {
      return o.id == data.id;
    });
    if (user) {
      user.sockets.push(socket);
      if (user.coneks.length > 0)
        coneks.concat(user.coneks);   //multiple conek
      else
        coneks = null;
      return cb(null, coneks);
    }
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

    user.name = data.name;
    user.conek = null;
    customer.visitors.push(user);

    //return all operators off customer
    return cb(null, null, customer.operators);
  } else {
    user.coneks = [];
    customer.operators.push(user);

    return cb(null, null, customer.visitors);
  }
  logger.info('add user', user, customer);
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
 * set conek for visitor & operator
 * @param cid
 * @param oid
 * @param vid
 * @param conek
 */
UserManager.prototype.setConek = function(cid, oid, vid, conek) {
  var self = this;

  //find customer
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });
  if (!customer) return;

  //find operator
  var operator = _.find(customer.operators, function(o) {
    return o.id == oid;
  });
  if (operator) {
    if (operator.coneks.indexOf(conek) == -1) {
      operator.coneks.push(conek);
    }
  }

  //find visitor
  var visitor = _.find(customer.visitors, function(v) {
    return v.id == vid;
  });
  if (visitor)
    visitor.conek = conek;
  console.log('set Conek', customer);
}
/**
 * handle client disconnect
 * @param id
 * @param cb inform visitor/operator offline
 */
UserManager.prototype.clientDisconnect = function(id, cb) {
  var self = this, cus, operator, visitor, sIndex, oIndex;
  _.some(self.list, function(customer) {
    cus = customer;
    var operators = customer.operators;
    _.some(operators, function(o, index) {
      oIndex = index;
      sIndex = o.sockets.indexOf(id);
      if ( sIndex >= 0) {
        operator = o;
        return true;
      }
    });
    if (operator) {
      operator.sockets.splice(sIndex, 1);
      if (operator.sockets.length == 0) {
        //cus.operators.splice(oIndex, 1);
      }
      return true;
    }
    var visitors = customer.visitors;
    _.some(visitors, function(v, index) {
      oIndex = index;
      sIndex = v.sockets.indexOf(id);
      if (sIndex >= 0) {
        visitor = v;
        return true;
      }
    });
    if (visitor) {
      visitor.sockets.splice(sIndex, 1);
      if (visitor.sockets.length == 0) {
        //cus.visitors.splice(oIndex, 1);
      }
      return true;
    }
  });

  var type = null, ret;
  if (operator) { type = 'operator'; ret = operator; }
  if (visitor) { type = 'visitor'; ret = visitor; }
  if (!type)
    return cb({error: 'not found'});
  else
    return cb(null, {
      type: type,
      cid: cus.id,
      obj: ret
    });
}
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

UserManager.prototype.getOperatorsByCustomer = function(id, cb) {
  var self = this;
  var operators = _.filter(self.operators, function(operator) {
    return operator.customer == id;
  });

  return cb(null, operators);
};

module.exports = UserManager;
