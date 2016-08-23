# Tessel 2 Easel Driver
A Tessel 2 server for controlling a ShapeOko/XCarve from a remote machine using [Easel](http://easel.inventables.com).

## Setting up the Tessel 2
Please see the [Tessel 2 Start Page](http://tessel.github.io/t2-start/) to provision your Tessel 2 before continuing.

## Attach the Arduino (GRBL)
Plug your Arduino (with GRBL flashed to it), to the Tessel 2 using a USB cable. The Arduino presents itself as a serial
device at `/dev/ttyACM0`. This is hard-coded in `lib/serial_port_controller.js` if you need to chage it to a different value.

## Rename the Tessel
The Tessel needs to have the hostname set to `xcarve.local`, so rename it using the CLI tools:

    $ t2 rename xcarve

## Download this repo
Download or clone this repo into a directory. Then `cd` into this directory and run:

    $ npm install

## Configure the serial port
There is a bug with the `serialport` package when it tries to enumerate the available serial devices on
the Tessel 2; so for now you need to manually list them in the config file: `config.json`. This file should have
been created for you in the previous step; if not, just copy the `example-config.json` file and edit as needed.
The device in the example file is from an Arduino UNO connected via USB to the Tessel 2. You might have to 
access the Tessel using `t2 root` and run `ls /dev/tty*` to find the correct device.

## Push the Easel Driver to Tessel
This only needs to be done once and then everytime you power on the Tessel, it will start up the server and listen
for connections from Easel.

    $ t2 push iris.js
    
Alternatively, if you want to see the console output while it is running, you can do this:

    $ t2 run iris.js
    
## Installing `xcarve-proxy`
In order for Easel to find and communicate with the Tessel, you need to install the proxy server on the computer on which
you are using Easel. Please follow the instructions here: [https://github.com/adafruit/xcarve-proxy](https://github.com/adafruit/xcarve-proxy). This proxy will foward websocket traffic from the browser to the Tessel.

## License

Some of the code included was extracted from [v0.2.7 of the Easel local OS X installer][1].

All other code is Copyright (c) 2016 Russel Werner <rus.werner@gmail.com>. Licensed under the MIT license.

[1]: http://s3.amazonaws.com/easel-prod/paperclip/sender_version_mac_installers/17/original/EaselDriver-0.2.7.pkg?1471370593
