module.exports = function() {
  const COMMANDS = {
    '0': 'seek', '00': 'seek',
    '1': 'feed', '01': 'feed',
    '20': 'in',
    '21': 'mm'
  };

  var parseLine = function(line) {
    var result = { type: undefined };
    var matches = line.match(/G(\d+)(.*)/);
    if (matches) {
      var command = COMMANDS[matches[1]], rest = matches[2];
      result.type = command;
      if (command === 'feed') {
        matches = rest.match(/\s*(?:X([+-]?(?:\d*\.\d+|\d+\.?)))?\s*(?:Y([+-]?(?:\d*\.\d+|\d+\.?)))?\s*(?:Z([+-]?(?:\d*\.\d+|\d+\.?)))?\s*(?:F([+-]?(?:\d*\.\d+|\d+\.?)))?/);
        if (matches) {
          result.x = matches[1] ? parseFloat(matches[1]) : undefined;
          result.y = matches[2] ? parseFloat(matches[2]) : undefined;
          result.z = matches[3] ? parseFloat(matches[3]) : undefined;
          result.f = matches[4] ? parseFloat(matches[4]) : undefined;
        }
      }
    }
    return result;
  };

  var that = {};
  that.parseLine = parseLine;
  return that;
};
