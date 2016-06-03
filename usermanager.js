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

/**
 * add customer/operator/visitor to list,
 * return operator, visitor
 * @param type
 * @param socket
 * @param data
 * @param cb
 * @returns {*}
 */
UserManager.prototype.addUser = function(type, socket, data, cb) {
  var self = this, user;

  //find customer
  var customer = _.find(self.list, function(c) {
    return c.id == data.cid;
  });

  //new customer
  if (!customer) {
    customer = { id: data.cid, operators: [], visitors: [] };

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
      user.conek = null;    //visitor has only one coneks
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

    if (user) {
      user.sockets.push(socket);
      if (user.conek)
        coneks.push(user.conek);
      else
        coneks = null;

      return cb(null, { coneks: coneks });
    }
  } else {
    user = _.find(customer.operators, function(o) {
      return o.id == data.id;
    });

    if (user) {
      user.sockets.push(socket);
      if (user.coneks.length > 0)
        coneks.concat(user.coneks);   //multiple coneks
      else
        coneks = null;

      return cb(null, {
        visitors: customer.visitors,
        coneks: coneks
      });
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
    return cb(null, {
      type: 'new',
      operators: customer.operators
    });
  } else {
    user.coneks = [];
    customer.operators.push(user);

    return cb(null, {
      type: 'new',
      visitors: customer.visitors
    });
  }
  logger.info('add user', user, customer);
};

UserManager.prototype.findOperators = function(cid, cb) {
  var self = this;
  var customer = _.find(self.list, function(c) {
    return c.id = cid;
  });
  var ret = customer ? customer.operators : null;
  return cb(null, ret);
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
        var uid = operator.id;

        setTimeout(function() {
          checkOffline('operator', cus, uid, function(found) {
            if (found) {
              return cb(null, found);
            }
          });
        } , 3000); //3 seconds

        operator.coneks = [];
      }
      return true;
    }
    var visitors = customer.visitors;
    console.log('visitors  for closing', visitors);
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
        var uid = visitor.id;

        setTimeout(function() {
          checkOffline('visitor', cus, uid, function(found) {
            if (found) {
              return cb(null, found);
            }
          });

        }, 3000); //3 seconds

        visitor.conek = null;
      }
      return true;
    }
  });

  var type = null, ret;
  if (operator) { type = 'operator'; }
  if (visitor) { type = 'visitor'; }
  if (!type)
    return cb({error: 'not found'});
}

/**
 * check an user offline
 * @param type
 * @param customer
 * @param uid
 */
function checkOffline(type, customer, uid, cb) {
  //find user
  var user = null, index = null;
  var isOl = false;

  if (type == 'operator') {
    user = _.find(customer.operators, function (o, i) {
      index = i;
      return o.id == uid;
    });
    if (user && user.sockets.length == 0) {
      customer.operators.splice(index, 1);
      isOl = true;
    }
  } else {  //visitor
    user = _.find(customer.visitors, function (v, i) {
      index = i;
      return v.id == uid;
    });
    if (user && user.sockets.length == 0) {
      customer.visitors.splice(index, 1);
      isOl = true;
    }
  }

  //TODO check customer & remove
  //cid = customer.id

  if (isOl) {
    return cb({
      type: type,
      cid: customer.id,
      uid: uid
    });
  }

  return cb(null);
}

module.exports = UserManager;
