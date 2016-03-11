var socketIO = require('socket.io'),
  CM = require('./CallManager');

module.exports = function (server, config) {
  var io = socketIO.listen(server);

  //authenticate
  require('socketio-auth')(io, {
    authenticate: authenticate,
    postAuthenticate: postAuthenticate,
    timeout: 1000
  });

  //config log
  if (config.logLevel) {
    io.set('log level', config.logLevel);
  }

  //init CallManager
  var cm = new CM(io, config);

  io.sockets.on('connection', function (client) {
    cm.handleClient(client);
  });

  //authenticate function
  function authenticate(socket, data, callback) {
    console.log(socket.id);
    //get credentials sent by the client
    var token = data.token;
    console.log('received token', token);

    //check token
    if (true)
      callback(null, true);
    else
      return callback(new Error("failed"));
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
      cm.invOperator(socket.id, operId, msgType);
    }
  }
};


