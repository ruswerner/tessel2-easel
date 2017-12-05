var path = require('path'),
  os = require('os'),
  spawn = require('child_process').spawn,
  SP = require('serialport'),
  Debugger = require('./debugger'),
  avrdudeParser = require('./avrdude_parser');

var firmwareUploader = function(comName, hex, config) {
  that = {};

  var logger = Debugger.logger("Firmware Uploader");

  var PLATFORMS = {
    'Darwin': {
      root: path.join(__dirname, '../arduino-flash-tools/tools_darwin/avrdude'),
      executable: 'bin/avrdude',
      config: 'etc/avrdude.conf'
    },
    'Windows_NT': {
      root: path.join(__dirname, '../arduino-flash-tools/tools_windows/avrdude'),
      executable: 'bin/avrdude.exe',
      config: 'etc/avrdude.conf'
    }
  };

  var spawnFlashProcess = function() {
    var currentPlatform = PLATFORMS[os.type()];
    if (!currentPlatform) {
      logger.log('ERROR: Firmware update not supported on current platform (' + os.type() + ')');
      return;
    }

    var executablePath = path.resolve(currentPlatform.root, currentPlatform.executable);
    var configPath = path.resolve(currentPlatform.root, currentPlatform.config);

    var args = [
      "-C", configPath,
      "-p", config.avrDevice,
      "-c", config.programmer,
      "-P", comName,
      "-b", config.baudRate,
      "-D",
      "-V",
      "-U", "flash:w:-:i"
    ];

    logger.log("Flash command: " + executablePath);
    logger.log(args.join(' '));

    return spawn(executablePath, args);
  };

  var upload = function(callbacks) {
    var parser = avrdudeParser(callbacks.update);

    var onProgress = function(data) {
      logger.log('Flash progress: ' + data);
      parser.parse(data.toString());
    };

    var onError = function(data) {
      console.log('ERROR: ' + JSON.stringify(data));
    };

    var onDone = function(code) {
      var data = {
        success: code === 0,
        code: code
      };
      callbacks.done(data);
      logger.log('Flash done: ' + JSON.stringify(data));
    };

    var flashProcess = spawnFlashProcess();
    if (flashProcess) {
      flashProcess.stdin.write(hex);
      flashProcess.stdin.on('error', onError);
      flashProcess.stdout.on('data', onProgress);
      flashProcess.stderr.on('data', onProgress);
      flashProcess.on('close', onDone);
      flashProcess.on('error', onError);
    }
  };

  that.upload = upload;
  return that;
};

module.exports = firmwareUploader;
