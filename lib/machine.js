var Debugger = require('./debugger')
  , interval = require('./interval')
  , gcodeParser = require('./gcode_parser')()
  , rateTracker = require('./rate_tracker')
  , eventDispatcher = require('./event_dispatcher');


var Machine = function(port) {
  var that = {};

  var MAX_BYTES = 127;

  var logger  = Debugger.logger("Machine");

  var queuedGcodeCommands;   // Commands from gcode waiting to go to the machine
  var queuedConsoleCommands; // Commands from sendInstruction waiting to go to the machine
  var bufferedCommands;      // Commands in the machine's buffer
  var lastRunCommand;        // Last command completed by the machine
  var completedCommandCount;
  var isUploadingFirmware = false;
  var isRunning = false;
  var isStopping = false;
  var isMachineConnected = false;
  var machineIdentification = null;
  var currentPosition = null;
  var currentWorkCoordinateOffset = null;
  var startRunTime = null;
  var feedRateTracker = rateTracker({ minimumOverride: 10, maximumOverride: 200, overrideIncrement: 10 });
  var gcodeUnit = 'mm';

  var config = null;

  var runState = 'RUNNING';

  var heartbeat = interval(function() {
    sendInstruction('status');
  });

  var startHeartbeat = function() {
    heartbeat.start(500);
  };

  var stopHeartbeat = function() {
    heartbeat.stop();
  };

  var reportBuildInfo = function() {
    sendInstruction('readSerialNumber');
  };

  var gcodeFor = function(instruction) {
    if (!config) {
      logger.log("Cannot get a gcode instruction (" + instruction + ") before a config is received");
      return null;
    }
    var gcode = config.gcode[instruction];
    if (gcode && gcode.indexOf('\\u') !== -1) {
      gcode = String.fromCharCode(gcode.replace('\\u', ''));
    }
    return gcode;
  };

  var byteCount = function(s) {
    return encodeURI(s).split(/%..|./).length - 1;
  };

  var init = function() {
    port.addEventListener('portOpened', onPortOpened);
    port.parser().addEventListener('ok', onProcessCommand);
    port.parser().addEventListener('ready', onMachineConnected);
    port.parser().addEventListener('grbl-state', onGrblState);
    port.parser().addEventListener('position', onPosition);
    port.parser().addEventListener('probe-status', onReceiveProbeStatus);
    port.parser().addEventListener('probe-result', onReceiveProbeResult);
    port.parser().addEventListener('spindle-current', onReceiveSpindleCurrent);
    port.parser().addEventListener('settings', onSettings);
    port.parser().addEventListener('grbl-alarm', onGrblAlarm);
    port.parser().addEventListener('grbl-error', onGrblError);
    port.parser().addEventListener('grbl-over-current', onGrblOverCurrent);
    port.parser().addEventListener('machine-build-info', onReceiveMachineBuildInfo);
    port.parser().addEventListener('unknown', onUnknownMessage);

    port.addEventListener("port-error", onPortError);
    port.addEventListener("close", portClosed);
  };

  var onGrblAlarm = function (message) {
    that.dispatchEvent('grbl-alarm', message);
  };

  var onGrblError = function (message) {
    that.dispatchEvent('grbl-error', message);
  };

  var onGrblOverCurrent = function(message) {
    that.dispatchEvent('grbl-over-current', message);
  }

  var onReceiveProbeStatus = function(probeStatus) {
    that.dispatchEvent('probe-status', probeStatus);
  };

  var onReceiveProbeResult = function(probeResult) {
    that.dispatchEvent('probe-result', probeResult);
  };

  var onReceiveSpindleCurrent = function(spindleCurrent) {
    that.dispatchEvent('spindle-current', spindleCurrent);
  };

  var onReceiveMachineBuildInfo = function(machineBuildInfo) {
    that.dispatchEvent('machine-build-info', machineBuildInfo);
  };

  var onUnknownMessage = function(message) {
    that.dispatchEvent('unknown', message);
  };

  var getMachineIdentification = function() {
    if (isMachineConnected) {
      return machineIdentification;
    } else {
      return null;
    }
  };

  var onPortOpened = function() {
    isUploadingFirmware = false;
    sendInstruction('flush');
  };

  var onMachineConnected = function(identification) {
    machineIdentification = identification;
    isMachineConnected = true;
    startHeartbeat();
    that.dispatchEvent('connected');
  };

  var statusTransitions = {
    'PAUSING': {
      'hold': 'PAUSED',
      'door': 'PAUSED_DOOR_OPEN'
    },
    'PAUSED': {
      'run': 'RUNNING',
      'door': 'PAUSED_DOOR_OPEN'
    },
    'PAUSED_DOOR_OPEN': {
      'hold': 'PAUSED',
      'run': 'RUNNING'
    },
    'RESUMING': {
      'run': 'RUNNING',
      'door': 'PAUSED_DOOR_OPEN'
    },
    'RUNNING': {
      'hold': 'PAUSED',
      'door': 'PAUSED_DOOR_OPEN'
    }
  };

  var actionTransitions = {
    'PAUSED': {
      'resume': 'RESUMING'
    },
    'RUNNING': {
      'pause': 'PAUSING'
    },
    'PAUSING': {
      'resume': 'RESUMING'
    },
    'PAUSED_DOOR_OPEN': {},
    'RESUMING': {
      'pause': 'PAUSING'
    }
  };

  var runStateEnteredCallbacks = function() {
    return {
      'PAUSING': paused,
      'PAUSED_DOOR_OPEN': paused,
      'PAUSED': paused,
      'RESUMING': resumed,
      'RUNNING': resumed
    }
  };

  var onGrblState = function(state, substate) {
    if (isRunning) {
      transitionRunState(state, statusTransitions);
    }

    that.dispatchEvent('grbl-state', state, substate);
  };

  var onPosition = function(position) {

    if (position.workCoordinateOffset) {
      currentWorkCoordinateOffset = position.workCoordinateOffset;
    }

    if (position.machine && position.work) {
      currentPosition = {machine: position.machine,
                         work: position.work};
    } else if (position.machine && currentWorkCoordinateOffset) {

      currentPosition = { machine: position.machine,
                          work: {
                            x: position.machine.x - currentWorkCoordinateOffset.x,
                            y: position.machine.y - currentWorkCoordinateOffset.y,
                            z: position.machine.z - currentWorkCoordinateOffset.z
                          }};
    } else if (position.work && currentWorkCoordinateOffset) {
      currentPosition = { work: position.work,
                          machine: {
                            x: position.work.x + currentWorkCoordinateOffset.x,
                            y: position.work.y + currentWorkCoordinateOffset.y,
                            z: position.work.z + currentWorkCoordinateOffset.z}};
    }

    that.dispatchEvent('position', currentPosition);
  };

  var ready = function() {
    that.dispatchEvent('ready');
  };

  var requestSettings = function() {
    sendInstruction('settings');
  };

  var onSettings = function(data) {
    that.dispatchEvent('settings', data);
  };

  var streamGcodeLines = function(lines) {
    queuedGcodeCommands = lines;
    isRunning = true;
    runState = 'RUNNING'; // TODO bring this under the easelAction umbrella
    completedCommandCount = 0;
    startRunTime = Date.now();
    reportJobStatus();
    fillCommandBuffer();
  };

  var nextCommand = function() {
    if (queuedConsoleCommands.length > 0) {
      return queuedConsoleCommands[0];
    } else if (isRunning && runState === 'RUNNING' && queuedGcodeCommands.length > 0) {
      return queuedGcodeCommands[0];
    } else {
      return null;
    }
  };

  var dequeueNextCommand = function() {
    if (queuedConsoleCommands.length > 0) {
      return queuedConsoleCommands.shift();
    } else if (queuedGcodeCommands.length > 0) {
      return queuedGcodeCommands.shift();
    }
  };

  var roomInBufferForNextCommand = function() {
    var potentialBufferedCommands = bufferedCommands.concat([nextCommand()]);
    var bytes = byteCount(potentialBufferedCommands.join('\n') + '\n');

    return bytes <= MAX_BYTES;
  };

  var parseGcodeLine = function(line) {
    var result = gcodeParser.parseLine(line);
    if (result.type === 'in') {
      gcodeUnit = 'in/min';
    } else if (result.type === 'mm') {
      gcodeUnit = 'mm/min';
    } else if (result.type === 'feed') {
      if (result.f && (typeof result.z === 'undefined')) {
        if (feedRateTracker.setBaseRate(result.f, gcodeUnit)) {
          reportOverrideUpdate();
        }
      }
    }
  };

  var sendLine = function(line) {
    if (isUploadingFirmware) {
      logger.log('Tried to send line "' + line + '" during firmware upload!');
      logger.log((new Error()).stack);
      return;
    }
    parseGcodeLine(line);
    port.write(line + '\n');
  };

  var fillCommandBuffer = function() {
    while (nextCommand() && roomInBufferForNextCommand()) {
      var line = dequeueNextCommand();
      bufferedCommands.push(line);
      sendLine(line);
    }
  };

  var unprocessedCommandCount = function() {
    return bufferedCommands.length + queuedConsoleCommands.length + queuedGcodeCommands.length;
  };

  var percentComplete = function() {
    return completedCommandCount / (completedCommandCount + unprocessedCommandCount()) * 100;
  };

  var getCurrentOverrides = function() {
    return {
      feedRate: {
        percentage: feedRateTracker.getCurrentPercentage(),
        value: feedRateTracker.getCurrentRate(),
        unit: feedRateTracker.getCurrentRateUnit()
      }
    };
  };

  var onProcessCommand = function() {
    lastRunCommand = bufferedCommands.shift();
    completedCommandCount++;
    fillCommandBuffer();

    if (isRunning && runState === 'RUNNING') {
      reportJobStatus();
      if (unprocessedCommandCount() === 0) {
        isRunning = false;
        reportRunTime();
      }
    }
  };

  var portClosed = function() {
    stopHeartbeat();
    isMachineConnected = false;
    reportRunTime();
    that.dispatchEvent('port_lost', error("Machine disconnected"));
    reset();
  };

  var onPortError = function(portError) {
    that.dispatchEvent("port-error", portError);
  };

  // Socket connection to Easel lost
  var disconnect = function() {
    stopHeartbeat();
    port.close();
    isMachineConnected = false;
    reset();
  };

  var error = function(message) {
    return {
      last_instruction: lastRunCommand,
      active_buffer: bufferedCommands,
      sender_note: message
    }
  };

  var senderNote = function(message) {
    return { sender_note: message };
  };

  var reset = function() {
    logger.log("Resetting");
    isRunning = false;
    runState = 'RUNNING';
    resetQueue();
    completedCommandCount = 0;
    feedRateTracker.reset();
  };

  var resetQueue = function() {
    queuedGcodeCommands = [];
    queuedConsoleCommands = [];
    bufferedCommands = [];
  };

  var running = function() {
    that.dispatchEvent("progress", percentComplete(), getCurrentOverrides());
  };

  var reportJobStatus = function() {
    if (isRunning) {
      // Unified run-state reporting
      reportRunState();

      // For API compatibility, collapse intermediate pausing / resuming states
      switch (runState) {
        case 'RUNNING':
        case 'RESUMING':
          running();
          break;
        case 'PAUSED':
        case 'PAUSING':
        case 'PAUSING_DOOR_OPEN':
          paused();
          break;
      }
    } else if (isStopping) {
      stopping();
    } else if (isUploadingFirmware) {
      uploadingFirmware();
    } else if (isMachineConnected) {
      ready();
    }
  };

  var reportRunState = function() {
    that.dispatchEvent("run-state", runState);
  };

  var reportOverrideUpdate = function() {
    that.dispatchEvent('overrides-changed');
  };

  var uploadingFirmware = function() {
    that.dispatchEvent('uploading-firmware');
  };

  var reportRunTime = function() {
    if (startRunTime !== null) {
      that.dispatchEvent('run-time', {start: startRunTime, end: Date.now()});
      startRunTime = null;
    }
  };

  var pause = function() {
    sendInstruction('pause');
    easelAction('pause');
  };

  var paused = function() {
    that.dispatchEvent("paused", percentComplete());
  };

  var resume = function() {
    sendInstruction('resume');
    easelAction('resume');
  };

  var resumed = function() {
    fillCommandBuffer();
    that.dispatchEvent("resumed", percentComplete());
  };

  var enteredRunState = function(state) {
    if (runStateEnteredCallbacks()[state]) {
      runStateEnteredCallbacks()[state]();
    }
  };

  var transitionRunState = function(action, transitions) {
    var nextState = transitions[runState][action];

    if (nextState) {
      if (isRunning && runState === 'RUNNING') {
        reportRunTime();
      } else if (isRunning && nextState === 'RUNNING') {
        startRunTime = Date.now();
      }
      runState = nextState;
      enteredRunState(runState);
    }
  };

  var easelAction = function(action) {
    transitionRunState(action, actionTransitions);
  };

  var sendInstruction = function(instruction) {
    if (isUploadingFirmware) {
      logger.log('Tried to send instruction during firmware upload!');
      logger.log((new Error()).stack);
      return;
    }
    if (instruction === 'flush') {
      resetQueue();
      feedRateTracker.reset();
    } else if (instruction === 'resetFeedRate') {
      feedRateTracker.reset();
      reportOverrideUpdate();
    } else if (instruction === 'increaseFeedRate') {
      feedRateTracker.increaseRate();
      reportOverrideUpdate();
    } else if (instruction === 'decreaseFeedRate') {
      feedRateTracker.decreaseRate();
      reportOverrideUpdate();
    }
    var gcode = gcodeFor(instruction);
    if (gcode) {
      if (config.realTimeCommands &&
          config.realTimeCommands.indexOf(instruction) >= 0) {
        port.write(gcode);
      } else {
        enqueueCommand(gcode);
      }
    } else {
      logger.log("No command currently defined for instruction " + instruction);
    }
  };

  var enqueueCommand = function(line) {
    queuedConsoleCommands.push(line);
    fillCommandBuffer();
  };

  var stop = function(params) {
    if (isRunning) {
      isStopping = true;
      stopping();
      reset();
      sendInstruction('pause');
      setTimeout(function() {
        sendInstruction('flush');
        setTimeout(function() {
          sendInstruction('resume');
          setTimeout(function() {
            sendInstruction('liftToSafeHeight');
            sendInstruction('spindleOff');
            sendInstruction('park');
            isStopping = false;
            reportJobStatus();
          }, 1000);
        }, 1000);
      }, 1000);
    }
  };

  var execute = function(instructions) {
    instructions.forEach(function(instruction) {
      sendInstruction(instruction);
    });
  };

  var stopping = function() {
    that.dispatchEvent("stopping");
  };

  var acquire = function(timestamp) {
    if (!isRunning) {
      that.dispatchEvent("release", timestamp);
    };
  };

  var setConfig = function(_config) {
    config = _config;
  };

  // Asynchrounously put the machine into a state (bootloader mode) where it can start the firmware upload process.
  // Use the onPortClosed callback to actually perform the firmware update.
  //
  // To begin the firmware upload process, the machine must be in an appropriate state (connected, not currently uploading firmware)
  // If it is not, this function will return false. If it is, this function will return true.
  var beginFirmwareUpload = function(onPortClosed, firmwareUploadConfig) {

    // From Brian R:
    // "Do note that after the $K, some serial data needs to be sent immediately
    // in order to let the bootloader know it should stay in control and not
    // transfer execution over to the application.  You may have to wait a
    // little bit of time for the micro to reboot before sending those
    // characters as well. "
    //
    // This function performs that wait and sends serial data (carriage returns) while waiting.
    var delayCloser = function(delayInMillis) {
      if (delayInMillis > 0) {
        setTimeout(function() {
          port.write('\r\n');
          delayCloser(delayInMillis - firmwareUploadConfig.resetKeepAliveInterval);
        }, firmwareUploadConfig.resetKeepAliveInterval);
      } else {
        port.close(onPortClosed);
      }
    };


    if (isMachineConnected && !isRunning && !isUploadingFirmware) {
      stopHeartbeat();
      reset();
      if (firmwareUploadConfig.preReset) {
        sendLine('$K'); // TODO: this probably should be enqueued
      }
      delayCloser(firmwareUploadConfig.resetDelay || 0);
      isUploadingFirmware = true;
      return true;
    } else {
      return false;
    }
  };

  var endFirmwareUpload = function() {
    isMachineConnected = false;
    that.dispatchEvent('port_lost', senderNote("Firmware upload complete?")); // TODO: check if it was successful or not
    reset();
  };

  that.getMachineIdentification = getMachineIdentification;
  that.getCurrentOverrides = getCurrentOverrides;
  that.requestSettings = requestSettings;
  that.streamGcodeLines = streamGcodeLines;
  that.enqueueCommand = enqueueCommand;
  that.disconnect = disconnect;
  that.reportJobStatus = reportJobStatus;
  that.pause = pause;
  that.resume = resume;
  that.stop = stop;
  that.acquire = acquire;
  that.setConfig = setConfig;
  that.execute = execute;
  that.beginFirmwareUpload = beginFirmwareUpload;
  that.endFirmwareUpload = endFirmwareUpload;
  that.reportBuildInfo = reportBuildInfo;

  init();
  reset();
  eventDispatcher(that);

  return that;
};

module.exports = Machine;
