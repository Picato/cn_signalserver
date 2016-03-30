/**
 * Created by tuan on 30/03/2016.
 */


var _ = require('lodash');
  //logger = require('winston');

/**
 * @constructor manage all users
 *              will be upgrade to db/redis base
 */
function UserManager() {
  this.users = [];
}

UserManager.prototype.addUser = function(id, operid){
  if (operid) {
    this.users.push({
      id: id,
      operid: operid,
      peers: []
    });
  }
  else {
    this.users.push({
      id: id,
      peers: []
    });
  }
}

UserManager.prototype.getOperSocketId = function(operid) {
  var self = this;
  var ret = _.find(self.users, function(user) {
    return user.operid && (user.operid == operid);
  });

  return ret ? ret.id : null;
}

UserManager.prototype.addPeer = function(peer1, peer2) {
  var peers = this.getPeers(peer1);
  if (peers)
    peers.push(peer2);

  peers = this.getPeers(peer2);
  if (peers)
    peers.push(peer1);
}

UserManager.prototype.getPeers = function(id) {
  var ret = _.find(this.users, function(user) {
    return user.id == id;
  });

  return ret ? ret.peers : null;
}

module.exports = UserManager;
