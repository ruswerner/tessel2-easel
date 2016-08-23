### Updating Easel Driver
These are the manual steps required to updated the Easel Driver when a new version is released.

Download the latest OSX Installer package

    $ pkgutil --expand EaselDriver-0.2.7.pkg EaselDriver-0.2.7
    $ cd EaselDriver-0.2.7/IrisLib-0.2.7.pkg
    $ cat Payload | gunzip -dc |cpio -i
    
Copy files into place: 

* `iris.js`
* `lib/`

Check `package.json` for updated/new dependencies and additional config.

Patch `serial_port_controller.js` to return the USB devices from `config.json`:

    , config = require('../config.json');

    ...
    
    var listPorts = function (callback) {
      callback(config.serialPorts);
    };
