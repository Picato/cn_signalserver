/*
 * createdAt Oct 13
 */

//TODO add unique NODE-ID to key if use multiple signal nodes
// e.g. var key = NODE-ID:VISITOR:VISITOR-ID

var redis = require("redis"),
  client = redis.createClient();

function RedisUtil() {}

//add
RedisUtil.prototype.addVisitor = function(cid, vid) {
  var key = 'VISITOR' + cid;
  client.set(key, vid);
}

RedisUtil.prototype.addVisitorPage = function(vid, page) {

}

RedisUtil.prototype.delVisitor = function(cid, vid) {
  var key = 'VISITOR' + cid;
  //del vid in cid list
  client.del(key, vid);

  //del vid page
  key = 'VISITOR-PAGE' + vid;
  client.del(key, vid);
}

/*
 * return number of online operator
 */
RedisUtil.prototype.getOnlineOperator = function(cid) {
  var key = 'OPERATOR' + cid;
  var operators = client.get(key);
  return operopers ? operators.length : 0;
}

RedisUtil.prototype.isFirstOperator = function(cid) {
  return true;
}

/*
 * get all visitor with visited pages
 */
RedisUtil.prototype.getVisitors = function(cid) {
  var key = 'VISITOR' + cid;
  var ret = client.get(key);

  return ret ? ret : null;
}

/*
 * add an operator with socket
 */
RedisUtil.prototype.addOperator = function(cid, oid, socket) {

}

module.exports = RedisUtil;
