/**
 * Created by tuan on 30/03/2016.
 */
"use strict";

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
  if (customer == null || customer == undefined) {
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
      user.pages.push(data.exInfo.currentPage);
      customer.visitors.push(user);
    } else {
      user.coneks = [];    //operator has multiple coneks
      customer.operators.push(user);
    }

    logger.info('add a customer', customer);
    self.list.push(customer);

    return cb(null, {
      type: 'newcustomer'
    });
  }

  var coneks = [];

  //if found visitor/operator => return conek
  if (type == 'visitor') {
    user = _.find(customer.visitors, function(v) {
      return v.id == data.id;
    });

    if (user != null && user != undefined) { //this case happenned when visitor changing the page
      logger.info('find conek', user);
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
  } else {  //operator
    user = _.find(customer.operators, function(o) {
      return o.id == data.id;
    });

    if (user != null && user != undefined) {
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
      type: 'newoperator',
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

  logger.info('updateUser successfully', visitor);
};

UserManager.prototype.saveUser = function(visitor) {
  logger.info('handle saving user to db, visitor=', visitor);
  var self = this;

  //if visitor join and doing nothing & operator doing nothing (no note changes)
  if (!visitor.hasChange) {
    return;
  }

  //save to server, whether visitor start chatting or not
  self.conekLogger.saveUser(visitor);
};

UserManager.prototype.findOperators = function(cid, cb) {
  var self = this;
  var customer = _.find(self.list, function(c) {
    return c.id == cid;
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
}

/**
 * handle client disconnect
 * @param sid socket id
 * @param cb inform visitor/operator offline
 */

 UserManager.prototype.clientDisconnect = function(type, sid, id, cid, action, cb) {
   var self = this, user = null, sIndex = -1;

   var customer = _.find(self.list, function(l) {
     return l.id == cid;
   });

   if (!customer)
    return cb({error: 'not found'});

   if (type == 'operator') {
     user = _.find(customer.operators, function (l) {
       return l.id == id;
     });
   } else {
     user = _.find(customer.visitors, function(l) {
       return l.id == id;
     });
   }

   //check operator
   if (!user)
    return cb({error: 'not found'});

   if (action == 'call') {
     var callId = user.call.uuid;
     //reset callId
     user.call.uuid = null;
     //TODO: need to check and delete user.call.socket?
     return cb(null, {action: 'call', type: 'operator', uuid: callId, socket: user.call.socket});
   }

   _.find(user.sockets, function(socket, index) {
     sIndex = index;
     return socket == sid;
   });

   //remove socket
   user.sockets.splice(sIndex, 1);

   if (user.sockets.length == 0) {
     setTimeout(function() {
       checkOffline(type, customer, user.id, function(found) {
         if (found) {
           return cb(null, found);
         }
       });
     } , 3000); //3 seconds
   }
 }

/**
 * set call obj for operator, visitor
 * @param cid customer id
 * @param oid/vid operator/visitor id
 * @param osid/vsid socket id
 * @param uuid uniqe id to specify call
 */
UserManager.prototype.setCallPeer = function(cid, oid, vid, osid, vsid, uuid) {
  //find customer
  var self = this;
  var customer = _.find(self.list, function(l) {
    return l.id == cid;
  });

  if (!customer) {
    logger.info('setcallpeer - no customer');
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
    logger.info('setcallpeer - no operator');
  var visitor = _.find(customer.visitors, function(v) {
    return v.id == vid;
  });

  if (visitor)
    visitor.call = {
      socket: vsid,
      uuid: uuid
    };
  else
    logger.info('setcallpeer - no visitor');
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
  var ret = {
    cid: customer.id,
    uid: uid
  }

  if (type == 'operator') {
    user = _.find(customer.operators, function (o, i) {
      index = i;
      return o.id == uid;
    });
    if (user && user.sockets.length == 0) {
      //save coneks to inform visitor
      ret.coneks = user.coneks;

      customer.operators.splice(index, 1);

      //remove conek of visitor connected to this operator
      removeVisitor(customer.visitors, user.coneks, function() {
        //
      });

      return cb(ret);
    }
  } else {  //visitor
    user = _.find(customer.visitors, function (v, i) {
      index = i;
      return v.id == uid;
    });
    if (user && user.sockets.length == 0) {
      customer.visitors.splice(index, 1);
      return cb(ret);
    }
  }

  //TODO check customer & remove
  return cb(null);
}

function removeVisitor(visitors, coneks, cb) {
  //console.log('remove visitor conek, visitor, ', visitors, ' coneks', coneks);
  if (!visitors || !coneks) {
    return cb();
  }
  visitors.forEach(function(v) {
    if (v.conek) {
      if (coneks.indexOf(v.conek) >= 0) {
        v.conek = null;
        //console.log('got it ;');
      }
    }
  });
  //console.log('after removing conek, visitor=', visitors);
  return cb();
}

module.exports = UserManager;
