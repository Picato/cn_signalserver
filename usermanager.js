/**
 * Created by tuan on 30/03/2016.
 */
var _ = require('lodash'),
  logger = require('winston'),
  ConekLogger = require('./coneklogger');
/**
 * @constructor manage all users
 *              will be upgrade to db/redis base
 */
function UserManager(config) {
  this.list = [];
  this.conekLogger = new ConekLogger(config.logapi);
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
      user.exInfo = data.exInfo;
      user.pages = [];
      user.push(data.exInfo.currentPage);
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

  //if found visitor/operator => return conek
  if (type == 'visitor') {
    user = _.find(customer.visitors, function(v) {
      return v.id == data.id;
    });

    if (user) { //this case happenned when visitor changing the page
      console.log('find conek', user);
      user.sockets.push(socket);
      if (user.conek)
        coneks.push(user.conek);
      else
        coneks = null;

      if (user.pages.indexOf(data.exInfo.currentPage) < 0) {
        user.pages.push(data.exInfo.currentPage);
      }
      return cb(null, { coneks: coneks, operators: customer.operators, pages: user.pages });
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
    user.exInfo = data.exInfo;
    user.pages = [];
    user.pages.push(data.exInfo.currentPage);
    customer.visitors.push(user);

    //return all operators off customer
    return cb(null, {
      type: 'new',
      operators: customer.operators,
      visitor: user
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

UserManager.prototype.updateUser = function(data) {
  var self = this;
  //find customer
  var customer = _.find(self.list, function(c) {
    return c.id == data.customer;
  });

  if (!customer)
    return;

  visitor = _.find(customer.visitors, function(v) {
    return v.id == data.id;
  });
  if (!visitor)
    return;

  if (data.tag == null || data.tag == undefined) {
    visitor.name = data.name;
    visitor.phone = data.phone;
    visitor.email = data.email;
    visitor.note = data.note;
    visitor.hasChange = true;
    visitor.operator = data.operator;
  } else  {
    visitor.tag = data.tag;
    visitor.hasChange = true;
    visitor.operator = data.operator;
  }
  // } else if (type == 'page') {
  //   if (visitor.pages == null || visitor.pages == undefined) {
  //     visitor.pages = [];
  //     visitor.pages.push(data.currentPage);
  //   } else {
  //     if (visitor.pages.indexOf(data.currentPage) <= 0) {
  //       visitor.pages.push(data.currentPage);
  //     }
  //   }
  // }

  logger.info('updateUser successfully', visitor);
};

UserManager.prototype.saveUser = function(visitor) {
  logger.info('handle saving user to db, visitor=', visitor);
  var self = this;

  //if visitor join and doing nothing & operator doing nothing (no note changes)
  if (!visitor.hasChange) {
    return;
  }

  //save to server, wheather visitor start chatting or not
  self.conekLogger.saveUser(visitor);
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
UserManager.prototype.clientDisconnect = function(id, vid, cid, action, cb) {
  var self = this, operator = null, visitor = null, sIndex = -1;
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });
  if (customer) {
    operator = _.find(customer.operators, function(l) {
      sIndex = l.sockets.indexOf(id);
      return action == 'call'? l.call.socket == id: sIndex >= 0;
    });

    //check operator
    if (operator) {
      if (action == 'call') {
        return cb(null, {action: 'call', type: 'operator', uuid: operator.call.uuid, socket: operator.call.socket});
      }
      operator.sockets.splice(sIndex, 1);
      if (operator.sockets.length == 0) {
        //cus.operators.splice(oIndex, 1);
        var uid = operator.id;

        setTimeout(function() {
          checkOffline('operator', customer, uid, function(found) {
            if (found) {
              return cb(null, found);
            }
          });
        } , 3000); //3 seconds
      }
      return true;
    }

    //check visitor
    visitor = _.find(customer.visitors, function(l) {
      sIndex = l.sockets.indexOf(id);
      return action == 'call'? l.call.socket == id : sIndex >= 0;
    });
    if (visitor) {
      if (action == 'call') {
        return cb(null, {action: 'call', type: 'visitor', uuid: visitor.call.uuid, socket: visitor.call.socket});
      }

      //TODO delete some redundant info before saving
      visitor.customer = cid;
      self.saveUser(visitor);

      visitor.sockets.splice(sIndex, 1);
      if (visitor.sockets.length == 0) {
        //cus.visitors.splice(oIndex, 1);
        var uid = visitor.id;

        setTimeout(function() {
          checkOffline('visitor', customer, uid, function(found) {
            if (found) {
              return cb(null, found);
            }
          });

        }, 3000); //3 seconds
      }
      return true;
    }
  }

  var type = null, ret;
  if (operator) { type = 'operator'; }
  if (visitor) { type = 'visitor'; }
  if (!type)
    return cb({error: 'not found'});
}

/**
 * set call obj for operator, visitor
 * @param cid customer id
 * @param oid/vid operator/visitor id
 * @param osid/vsid socket id
 * @param uuid uniqe id to specify call
 */
UserManager.prototype.setCallPeer = function(cid, oid, vid, osid, vsid, uuid) {
  console.log('setcallpeer cid=', cid, ' oid=', oid, ' vid=', vid);
  //find customer
  var self = this;
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });

  if (!customer) {
    console.log('setcallpeer - no customer');
    return;
  }

  var operator = _.find(customer.operators, function(opr) {
    return opr.id == oid;
  });
  if (operator)
    operator.call = {
      socket: osid,
      uuid: uuid
    };
  else
    console.log('setcallpeer - no operator');
  var visitor = _.find(customer.visitors, function(v) {
    return v.id == vid;
  });

  if (visitor)
    visitor.call = {
      socket: vsid,
      uuid: uuid
    };
  else
    console.log('setcallpeer - no visitor');
}

/**
 * check an user offline
 * @param type
 * @param customer
 * @param uid
 */
function checkOffline(type, customer, uid, cb) {
  //find user
  var user = null, index = null, uuid = null;
  var isOl = false;

  if (type == 'operator') {
    user = _.find(customer.operators, function (o, i) {
      index = i;
      return o.id == uid;
    });
    if (user && user.sockets.length == 0) {
      uuid = user.uuid;
      customer.operators.splice(index, 1);
      isOl = true;
    }
  } else {  //visitor
    user = _.find(customer.visitors, function (v, i) {
      index = i;
      return v.id == uid;
    });
    if (user && user.sockets.length == 0) {
      uuid = user.uuid;
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
      uid: uid,
      uuid: uuid
    });
  }

  return cb(null);
}

module.exports = UserManager;
