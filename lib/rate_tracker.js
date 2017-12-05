module.exports = function(config) {
  const minimumOverride = config.minimumOverride; // percentage, e.g. 10
  const maximumOverride = config.maximumOverride; // percentage, e.g. 200
  const overrideIncrement = config.overrideIncrement; // percentage, e.g. 10

  var currentPercentage = 100;
  var currentBaseRate;
  var currentUnit;

  return {
    reset: function() {
      currentPercentage = 100;
      currentBaseRate = undefined;
    },

    setBaseRate: function(rate, unit) {
      if (currentBaseRate !== rate || currentUnit !== unit) {
        currentBaseRate = rate;
        currentUnit = unit;
        return true;
      }
      return false;
    },

    increaseRate: function() {
      currentPercentage = Math.min(maximumOverride, currentPercentage + overrideIncrement);
    },

    decreaseRate: function() {
      currentPercentage = Math.max(minimumOverride, currentPercentage - overrideIncrement);
    },

    getCurrentPercentage: function() {
      return currentPercentage;
    },

    getCurrentRate: function() {
      if (typeof(currentBaseRate) === 'number') {
        return currentBaseRate * (currentPercentage / 100);
      }
    },

    getCurrentRateUnit: function() {
      return currentUnit;
    }
  };
};
