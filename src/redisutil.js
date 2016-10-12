var redis = require("redis"),
  client = redis.createClient();

function RedisUtil() {}

//add
RedisUtil.prototype.addVisitor = function(cid, vid) {
  client.set(cid, vid);
}

RedisUtil.prototype.addVisitorPage = function(vid, page) {

}

RedisUtil.prototype.delVisitor = function(cid, vid) {
  //del vid in cid list

  //del vid page
}

module.exports = RedisUtil;
