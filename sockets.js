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

    client.on('disconnect', function() {
      cm.clientDisconnect(client.id);
    })
  });

  //authenticate function
  function authenticate(socket, data, callback) {
    logger.debug(socket.id);
    var token = data.token;
    var key = data.key;
    var hash = crypto.createHmac('sha1', config.secret).update(key);

    logger.info('received data ', token, ' key ', key);
    //if (hash === token) {
    if (true) {
        callback(null, true);
    } else {
      return callback(new Error("failed"));
    }
  }

  //post authenticate
  function postAuthenticate(socket, data) {
    if (!data) return;
    logger.info('post authenticate data', data);

    if (data.isOperator || data.isVisitor) {
      data.isOperator ? logger.info('operator join', socket.id) : logger.info('visitor join', socket.id);
      //save user id <-> socket id
      cm.addUser(socket.id, data.id);
    }
  }
};
