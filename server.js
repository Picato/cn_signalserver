var config = require('getconfig'),
  fs = require('fs'),
  sockets = require('./sockets'),
  port = parseInt(process.env.PORT || config.server.port, 10),
  logger = require('./log.js'),
  server = null;

/**
 * server handler function
 * end all requests
 */
var server_handler = function (req, res) {
  res.writeHead(404);
  res.end();
};

// Create an http(s) server instance to that socket.io can listen to
if (config.server.secure) {
  server = require('https').Server({
    key: fs.readFileSync(config.server.key),
    cert: fs.readFileSync(config.server.cert),
    passphrase: config.server.password
  }, server_handler);
} else {
  server = require('http').Server(server_handler);
}
server.listen(port);

//start socket server
sockets(server, config);

if (config.uid) process.setuid(config.uid);

var httpUrl;
if (config.server.secure) {
  httpUrl = "https://localhost:" + port;
} else {
  httpUrl = "http://localhost:" + port;
}

logger.info('SignalServer is running at: ' + httpUrl);
