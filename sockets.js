var socketIO = require('socket.io'),
  CM = require('./callmanager'),
  crypto = require('crypto'),
  logger = require('winston');

module.exports = function (server, config) {

  var io = socketIO.listen(server);

  //authenticate
  require('socketio-auth')(io, {
    authenticate: authenticate,
    postAuthenticate: postAuthenticate,
    timeout: 1000
  });


  //init CallManager
  var cm = new CM(io, config);

  io.sockets.on('connection', function (client) {
    cm.handleClient(client);
  });

  //authenticate function
  function authenticate(socket, data, callback) {
    logger.debug(socket.id);
    var token = data.token;
    var key    = data.key;
    var hash     = crypto.createHmac('sha1', config.secret).update(key);

    logger.info('received token ', token, ' key ', key);
    if (hash === token) {
        callback(null, true);
    } else {
      return callback(new Error("failed"));
    }
  }

  //post authenticate
  function postAuthenticate(socket, data) {
    if (!data) return;

    var operId = data.operatorId;
    if (data.isOperator) {
      //add socket callmanager
      cm.addOperator(operId, socket.id);
    } else {
      //is visitor, send msg to operator
      var msgType = data.msgtype;
      cm.invOperator(socket, operId, msgType);
    }
  }

};
