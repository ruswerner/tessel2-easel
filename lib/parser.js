var Debugger = require('./debugger')

  , eventDispatcher = require('./event_dispatcher');

var Parser = function(){

  var that = {};
  eventDispatcher(that);

  var logger  = Debugger.logger("Parser");

  var stringContains = function(str, matcher) {
    return str.indexOf(matcher) !== -1;
  };

  var stringContainsAtLeastOne = function(str, matchers) {
    for (var n = 0; n < matchers.length; n++) {
      if (stringContains(str, matchers[n])) {
        return true;
      }
    }
    return false;
  };

  var isGrblReport = function (d) {
    return d.match(/^<.*>$/);
  };

  var isGrblBuildInfo = function(d) {
    return d.match(/^\[.+:[\d-]*(:[^:]+)*\]$/);
  };

  var isGrblSettings = function (d) {
    return d.match(/^\$\d+\s*=/);
  };

  var isGrblError = function (d) {
    return d.match(/error:(.*)/);
  };

  var isGrblAlarm = function (d) {
    return d.match(/ALARM:(.*)/);
  };

  var isGrblProbe = function (d) {
    return d.match(/\[PRB:.+/);
  };

  var isOverCurrent = function(d) {
    return d.match(/\[OverCurrent:(.+)\]/);
  }

  var parseData = function (d, config) {
    d = d.trim();
    if (stringContainsAtLeastOne(d, config.readyResponses)) {
      that.dispatchEvent('ready', d);
    } else if (stringContains(d, config.successResponse)) {
      that.dispatchEvent('ok', d);
    } else if (isGrblReport(d)) {
      onGrblReport(d);
    } else if (isGrblSettings(d)) {
      onGrblSettings(d);
    } else if (isGrblProbe(d)) {
      onGrblProbe(d);
    } else if (isGrblBuildInfo(d)) {
      onGrblBuildInfo(d);
    } else if (isGrblError(d)) {
      that.dispatchEvent('grbl-error', d);
    } else if (isGrblAlarm(d)) {
      that.dispatchEvent('grbl-alarm', d);
    } else if (isOverCurrent(d)){
      that.dispatchEvent('grbl-over-current', d);
    } else {
      that.dispatchEvent('unknown', d);
    }
  };

  var parseTriple = function(s) {
    if (s) {
      var parsed = s.split(',').map(parseFloat);
      return {
        x: parsed[0],
        y: parsed[1],
        z: parsed[2]
      };
    } else {
      return null;
    }
  };

  // format before Grbl 1.1 is <(status),MPos:(x),(y),(z),WPos:(x),(y),(z),Pin:|0|>
  // format starting with Grbl 1.1. is <(state)(:substate)?(|Key:Value)*>
  var onGrblReport = function (d) {
    try {
      var numberRe = /([-+]?[0-9]*\.?[0-9]+)/;
      var positionRe = new RegExp(numberRe.source + ',' + numberRe.source + ',' + numberRe.source);
      var stateRe = /(\w+)/;
      var probeRe = /(?:,Pin:(?:\d{3})?\|(\d)\|)?/;

      var matchPre11 = d.match(new RegExp(stateRe.source + ',MPos:' + positionRe.source + ',WPos:' + positionRe.source + probeRe.source));

      var match11 = d.match(/^<([\w:]+)(\|(\w+\:\S+))*>$/);

      if (matchPre11) {
        that.dispatchEvent('grbl-state', matchPre11[1].toLowerCase());
        that.dispatchEvent('position', {
          machine: {
            x : parseFloat(matchPre11[2]),
            y : parseFloat(matchPre11[3]),
            z : parseFloat(matchPre11[4])
          },
          work: {
            x : parseFloat(matchPre11[5]),
            y : parseFloat(matchPre11[6]),
            z : parseFloat(matchPre11[7])
          }
        });
        if (matchPre11[8]) {
          that.dispatchEvent('probe-status', parseInt(matchPre11[8]));
        }
      } else if (match11) {
        var state = match11[1].toLowerCase().split(':');
        that.dispatchEvent('grbl-state', state[0], state[1]);

        var attributes = {};
        if (match11[3]) {
          attributes = match11[3].split('|').reduce(function(m, i) {
            var kv = i.split(':');
            m[kv[0]] = kv[1];
            return m;
          }, {});
        }

        var machinePos = parseTriple(attributes.MPos);
        var workPos = parseTriple(attributes.WPos);
        var workCoordinateOffset = parseTriple(attributes.WCO);

        if (machinePos || workPos || workCoordinateOffset) {
          var position = {};
          if (machinePos) {
            position.machine = machinePos;
          }

          if (workPos) {
            position.work = workPos;
          }

          if (workCoordinateOffset) {
            position.workCoordinateOffset = workCoordinateOffset;
          }

          that.dispatchEvent('position', position);
        }

        if (attributes.Pn) {
          if (attributes.Pn.indexOf('P') > -1) {
            that.dispatchEvent('probe-status', 1);
          } else {
            that.dispatchEvent('probe-status', 0);
          }
        } else {
          that.dispatchEvent('probe-status', 0);
        }

        if (attributes.I) {
          that.dispatchEvent('spindle-current', attributes.I)
        }

      } else {
        logger.error("Unknown status format: " + d);
      }
    } catch (e) {
      logger.error("Failed parsing status message '" + d + "': " + e.toString());
    }
  };

  var onGrblBuildInfo = function(d) {
    that.dispatchEvent('machine-build-info', d);
  };

  var onGrblSettings = function(d) {
    that.dispatchEvent('settings', d);
  };

  var onGrblProbe = function(d) {  // sample string: [PRB:0.000,0.000,0.418:1]
    var match = d.match(/\[PRB:.+:(0|1)\]/);
    that.dispatchEvent('probe-result', match[1]);
  };

  that.parseData = parseData;

  return that;
};

module.exports = Parser;
