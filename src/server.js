var config = require('getconfig'),
  port = parseInt(process.env.PORT || config.server.port, 10),
  logger = require('./log'),
  socketIO = require('socket.io'),
  ConCtr = require('./connectionctr'),
  crypto = require('crypto');

/**
 * server handler function
 * end all requests
 */
var server_handler = function (req, res) {
  res.writeHead(404);
  res.end();
};

/*
 * Create an http server instance
 * to that socket.io can listen to
 * Note: Nginx will handle https then fw http to SignalServer
 */
var server = require('http').Server(server_handler);
server.listen(port);

//start socket server
var io = socketIO.listen(server);

//authenticate
require('socketio-auth')(io, {
  authenticate: authenticate,
  timeout: 1000
});

//init Connection Controller
var cCtr = new ConCtr(io, config);
io.sockets.on('connection', function (client) {
  //handle all socket connection
  cCtr.handleClient(client);
});

//authenticate function
function authenticate(socket, data, callback) {
  //logger.debug('request authenticate', socket.id, data);
  //console.log('request authenticate', socket.id, data);
  var token = data.token;
  var key = data.key;
  //var hash = crypto.createHmac('sha1', config.secret).update(key);

  logger.info('authenticate: token ', token, ' key ', key);
  //if (hash === token) {
  if (true) {
      callback(null, true);
  } else {
    return callback(new Error("failed"));
  }
}

//print out
var httpUrl = "http://localhost:" + port;
logger.info('SignalServer is running at: ' + httpUrl);
