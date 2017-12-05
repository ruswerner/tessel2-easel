var io       = require('socket.io')
  , http     = require('http')
  , WebsocketController  = require('./lib/websocket_controller')
  , fs = require('fs')
  , path = require('path')
  , Debugger = require('./lib/debugger');

var WEBSOCKET_PORT = parseInt(process.argv[2] || 1338);
var WEBSOCKET_SECURE_PORT = WEBSOCKET_PORT + 100;

var logger = Debugger.logger('iris.js');

var json = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
var version = json.version;
var iris = json.iris;

// TODO: Remove port 80 after SSL is enforced in production
var origins = process.argv[3] || "easel.inventables.com:80 easel.inventables.com:443 easelstaging.inventables.com:80 easelstaging.inventables.com:443 easel.invinternal.com:443 easel-secure.inventables.com:443 easel-insecure.inventables.com:80";

function startApp(http, port, options) {
  var app = http.createServer(options);
  var appIo = io.listen(app);

  appIo.origins(origins);

  logger.log("Listening on port " + port + " for connections from " + origins);

  app.listen(port, "0.0.0.0");

  return new WebsocketController(appIo.sockets, version, iris.abilities);
}

logger.log("Starting Easel Local " + version);

var app = startApp(http, WEBSOCKET_PORT);
