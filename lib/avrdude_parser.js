var avrdudeParser = function(callback) {
  that = {};

  var cumulativeData = '';

  var hasBegunWriting = false;
  var percentComplete = 0;

  var WRITING_REGEX = /Writing \|(.*)/;
  var HASHES_REGEX = /(#+)(.*)/;

  var parse = function(data) {
    // avrdude first reports progress reading something,
    // Then it reports 'Writing | #####'... with up to 50 '#' characters.
    // (We usually see the hashes one at a time, separate from the initial 'Writing |' tag.)
    // Each '#' character represents progress writing 2% of the bytes.
    // Reading is much faster than writing so we shouldn't smush them together.

    // on Windows, output is broken unpredictably into multiple messages
    cumulativeData += data;

    var matches = cumulativeData.match(WRITING_REGEX);
    if (matches) {
      hasBegunWriting = true;
      cumulativeData = matches[1];
    }

    if (hasBegunWriting) {
      matches = cumulativeData.match(HASHES_REGEX);
      if (matches) {
        percentComplete += 2 * matches[1].length;
        cumulativeData = matches[2];
        callback(percentComplete);
      }
    }
  };

  callback(0);

  that.parse = parse;

  return that;
};

module.exports = avrdudeParser;
