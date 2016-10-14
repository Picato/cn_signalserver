/*
 * createdAt Oct 13
 */

//TODO add unique NODE-ID to key if use multiple signal nodes
// e.g. var key = NODE-ID:VISITOR:VISITOR-ID

var redis = require('redis'),
  client = redis.createClient(),
  _ = require('lodash');

//key
var VISITOR = 'visitor:',
    VISITOR_PAGE = 'visitorpage:',
    VISITOR_INFO = 'visitorinfo:',
    OPERATOR = 'operator:';

function RedisUtil() {}

//add
RedisUtil.prototype.addVisitor = function(cid, message) {
  //cid --> vid
  var key = VISITOR + cid;
  var vid = message.vid;
  client.lpush(key, vid);

  //vid --> page
  key = VISITOR_PAGE + vid;
  var page = message.page;
  client.lpush(key, vid);

  //vid --> {visitor information}
  key = VISITOR_INFO + vid;
  delete message.page;
  delete message.cid;
  delete message.vid;

  if (!_.isEmpty(message))
    client.hmset(key, message);
}

RedisUtil.prototype.addVisitorPage = function(vid, page) {
  var key = VISITOR_PAGE + vid;
  client.lpush(key, page);
}

RedisUtil.prototype.delVisitor = function(cid, vid) {
  //del vid in cid list
  var key = VISITOR + cid;
  client.del(key);

  //del vid page
  key = VISITOR_PAGE + vid;
  client.del(key);

  //del visitor's information
  key = VISITOR_INFO + vid;
  client.del(key);
}

/*
 * return number of online operator
 */
RedisUtil.prototype.getNumberOperator = function(cid, cb) {
  var key = OPERATOR + cid;
  client.llen(key, function(err, result) {
    if (err)
      return cb(err);
    return cb(null, result);
  });
}

/*
 * get all visitor with visited pages
 */
RedisUtil.prototype.getVisitors = function(cid) {
  var key = VISITOR + cid;
  var ret = client.get(key);

  return ret ? ret : null;
}

/*
 * add an operator with socket
 */
RedisUtil.prototype.addOperator = function(cid, oid, socket) {
  var key = OPERATOR + cid;
  client.lpush(key, oid);
}

module.exports = RedisUtil;
