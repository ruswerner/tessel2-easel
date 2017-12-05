var Machine = require('./machine')
  , SerialPortController = require('./serial_port_controller')
  , Debugger = require('./debugger');
  //, firmwareUploader = require('./firmware_uploader');

var WebsocketController = function(sockets, version, abilities) {
  var that = {};
  var logger = Debugger.logger("Websocket Controller");
  var connectedClients = 0;
  var serialPortController = new SerialPortController();
  var machine = Machine(serialPortController);
  var minimumTimeBetweenUpdates = 500;
  var lastUpdateTime = Date.now();
  var config = null;
  var projectName = "Unknown";
  var echoEnabled = false;

  var setUpSerialPortListeners = function() {
    var echo = function(params) {
      if (echoEnabled) {
        sockets.emit('echo', params);
      }
    };

    serialPortController.addEventListener('write', function(data) {
      echo({ action: 'write', data: data });
    });

    serialPortController.addEventListener('read', function(data) {
      echo({ action: 'read', data: data });
    });

    serialPortController.addEventListener('portOpened', function() {
      echo({ action: 'portOpened' });
    });

    serialPortController.addEventListener('close', function() {
      echo({ action: 'close' });
    });

    serialPortController.addEventListener('port-error', function(portError) {
      echo({ action: "port-error", data: portError.message });
    });
  };

  var onError = function(obj) {
    sockets.emit('error', obj);
  };

  var setUpMachineListeners = function() {
    machine.addEventListener('connected', function() {
      reportConnectionStatus();
    });

    machine.addEventListener('ready', function() {
      sockets.emit('ready');
    });

    machine.addEventListener('overrides-changed', function() {
      reportOverrides();
    });

    machine.addEventListener('resumed', function(percentComplete) {
      sockets.emit('running', projectName, percentComplete);
    });

    machine.addEventListener('progress', function(percentComplete) {
      if (Date.now() - lastUpdateTime > minimumTimeBetweenUpdates || percentComplete === 100) {
        lastUpdateTime = Date.now();
        sockets.emit('running', projectName, percentComplete);
      }
    });

    machine.addEventListener('paused', function(percentComplete) {
      sockets.emit('paused', projectName, percentComplete);
    });

    machine.addEventListener('unknown', function(data) {
      sockets.emit('unknown', data);
    });

    machine.addEventListener('error', onError);

    machine.addEventListener('port_lost', function(data) {
      sockets.emit('port_lost', data);
    });

    machine.addEventListener('position', function(position) {
      sockets.emit('position', position);
    });

    machine.addEventListener('probe-status', function(probeStatus) {
      sockets.emit('probe-status', probeStatus);
    });

    machine.addEventListener('probe-result', function(probeResult) {
      sockets.emit('probe-result', probeResult);
    });

    machine.addEventListener('spindle-current', function(spindleCurrent) {
      sockets.emit('spindle-current', spindleCurrent);
    });

    machine.addEventListener('grbl-state', function(state, substate) {
      sockets.emit('state', state, substate);
    });

    machine.addEventListener('run-state', function(state) {
      sockets.emit('run-state', state);
    });

    machine.addEventListener('settings', function(settings) {
      sockets.emit('machine-settings', settings);
    });

    machine.addEventListener('machine-build-info', function(machineBuildInfo) {
      sockets.emit('machine-build-info', machineBuildInfo);
    });

    machine.addEventListener('run-time', function(runTime) {
      sockets.emit('run-time', runTime);
    });

    machine.addEventListener('release', function(timestamp) {
      sockets.emit('release', timestamp);
    });

    machine.addEventListener('stopping', function() {
      sockets.emit('stopping');
    });

    machine.addEventListener('grbl-error', function(message) {
      sockets.emit('grbl-error', message);
    });

    machine.addEventListener('grbl-alarm', function(message) {
      sockets.emit('grbl-alarm', message);
    });

    machine.addEventListener('grbl-over-current', function(message) {
      sockets.emit('grbl-over-current', message);
    });

    machine.addEventListener('uploading-firmware', function() {
      reportFirmwareUploadProgress();
    });
  };

  setUpSerialPortListeners();
  setUpMachineListeners();

  var reportJobStatus = function() {
    machine.reportJobStatus();
    reportOverrides();
  };

  var reportConnectionStatus = function() {
    connectionStatus = machine.getMachineIdentification();
    sockets.emit('connection_status', connectionStatus);
  };

  var reportMachineBuildInfo = function() {
    machine.reportBuildInfo();
  };

  var reportOverrides = function() {
    sockets.emit('overrides', machine.getCurrentOverrides());
  };

  var onGcode = function(job) {
    var gcode = job.gcode;
    var lines = gcode.split('\n');
    projectName = job.name;
    if (!machine) {
      console.error("Machine not initialized");
    } else {
      logger.log('got ' + lines.length + ' lines of gcode');
      machine.streamGcodeLines(lines);
    }
  };

  var onRequestMachineSettings = function() {
    machine.requestSettings();
  };

  var onGetPorts = function() {
    serialPortController.listPorts(function (ports) {
      sockets.emit('ports', ports);
    });
  };

  var onConsole = function(line) {
    machine.enqueueCommand(line);
  };

  var onSetConfig = function(_config) {
    config = _config;
    logger.log('Setting config: ' + config.name);
    machine.disconnect();
    machine.setConfig(config);
  };

  var onDisconnect = function() {
    connectedClients -= 1;
    if (connectedClients === 0) {
      machine.stop();
      setTimeout(function() {
        if (connectedClients === 0) {
          machine.disconnect();
        }
      }, 10000);
    }
  };

  var onPause = function() {
    machine.pause();
  };

  var onResume = function() {
    machine.resume();
  };

  var onAcquire = function(timestamp) {
    machine.acquire(timestamp);
  };

  var onStop = function(params) {
    machine.stop(params);
  };

  var onExecute = function(instructions) {
    machine.execute(instructions);
  };

  var onInitPort = function(comName) {
    if (config === null) {
      logger.log('ERROR: trying to connect without setting a configuration!');
      return;
    }

    logger.log("Opening port: " + comName);
    serialPortController.initPortWithConfigs(comName, config);
  };

  var onSetEcho = function(enabled) {
    echoEnabled = enabled;
  };

  var firmwareUploadProgress = 0;

  var reportFirmwareUploadProgress = function() {
    sockets.emit('firmware-upload-progress', firmwareUploadProgress);
  };

  var onFirmwareUpload = function(hex) {
    return;
    logger.log("Received request to upload firmware");
    if (config.firmwareUpload) {
      if (serialPortController.connected()) {
        var comName = serialPortController.comName();

        var performUpload = function() {
          sockets.emit('firmware-upload-start');
          firmwareUploadProgress = 0;
          reportFirmwareUploadProgress();
          var uploader = firmwareUploader(comName, hex, config.firmwareUpload);
          uploader.upload({
            update: function(data) {
              firmwareUploadProgress = data;
              reportFirmwareUploadProgress();
            },
            done: function(data) {
              sockets.emit('firmware-upload-done', data);
              machine.endFirmwareUpload();
            }
          });
        };

        if (machine.beginFirmwareUpload(performUpload, config.firmwareUpload)) {
          logger.log("Beginning firmware upload");
        } else {
          onError({ sender_note: "Cannot upload firmware in machine's current state" });
        }
      } else {
        onError({ sender_note: "Cannot upload firmware without a connected machine" });
      }
    } else {
      onError({ sender_note: "Cannot upload firmware with unsupported machine config" });
    }
  };

  sockets.on('connection', function(socket) {
    socket.emit('version', version);
    socket.emit('abilities', abilities);
    socket.on('get_connection', reportConnectionStatus);
    socket.on('get_machine_build_info', reportMachineBuildInfo);
    socket.on('get_job_status', reportJobStatus);
    socket.on('gcode', onGcode);
    socket.on('get_ports', onGetPorts);
    socket.on('console', onConsole);
    socket.on('execute', onExecute);
    socket.on('set_config', onSetConfig);
    socket.on('disconnect', onDisconnect);
    socket.on('init_port', onInitPort);
    socket.on('pause', onPause);
    socket.on('acquire', onAcquire);
    socket.on('resume', onResume);
    socket.on('stop', onStop);
    socket.on('echo', onSetEcho);
    socket.on('update-firmware', onFirmwareUpload);
    socket.on('machine-settings', onRequestMachineSettings);
    socket.on('sent_feedback', function() { socket.broadcast.emit("sent_feedback"); });

    connectedClients += 1;
  });

  return that;
};

module.exports = WebsocketController;
