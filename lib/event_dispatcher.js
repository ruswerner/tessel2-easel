module.exports = function(that) {
  var listeners = {};

  var dispatchEvent = function(event) {
    var data = [].slice.call(arguments, 1);
    (listeners[event] || []).forEach(function(listener) {
      listener.apply(null, data);
    });
  };

  var addEventListener = function(event, func) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(func);
  };

  var removeEventListener = function(event, func) {
    var i = listeners.indexOf(func);
    listeners = listeners.slice(i, i);
  };

  that.dispatchEvent = dispatchEvent;
  that.addEventListener = addEventListener;
  that.removeEventListener = removeEventListener;

  return that;
}
