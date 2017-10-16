/**
 *
 * sma-em adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils = require(__dirname + '/lib/utils'); // Get common adapter utils
var dgram = require('dgram');

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.sma-em.0
var adapter = utils.adapter('sma-em');

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
// only needed when you want to do special things on object change
/*
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});
*/

// is called if a subscribed state changes
// only needed when you allow that someone changes states, not needed here
/*
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});
*/

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
/*
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});
*/

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function readData() {
    var client = dgram.createSocket('udp4');

    client.on('listening', function () {
        client.setBroadcast(true);
    });

    client.on('message', function (message, rinfo) {
        adapter.setStateChanged('SMASerial', message.readUIntBE(40, 8), true);
        adapter.setStateChanged('pregard', message.readUIntBE(64, 8) / 10, true);
        adapter.setStateChanged('pregardcounter', message.readUIntBE(80, 16)/ 3600000, true);
        adapter.setStateChanged('psurplus', message.readUIntBE(104, 8) / 10, true);
        adapter.setStateChanged('psurpluscounter', message.readUIntBE(120, 16)/ 3600000, true);
        adapter.setStateChanged('qregard', message.readUIntBE(144, 8)/ 10, true);
        adapter.setStateChanged('qregardcounter', message.readUIntBE(160, 16)/ 3600000, true);
        adapter.setStateChanged('qsurplus', message.readUIntBE(184, 8)/ 10, true);
        adapter.setStateChanged('qsurpluscounter', message.readUIntBE(200, 16)/ 3600000, true);
        adapter.setStateChanged('sregard', message.readUIntBE(224, 8)/ 10, true);
        adapter.setStateChanged('sregardcounter', message.readUIntBE(240, 16)/ 3600000, true);
        adapter.setStateChanged('ssurplus', message.readUIntBE(264, 8)/ 10, true);
        adapter.setStateChanged('ssurpluscounter', message.readUIntBE(280, 16)/ 3600000, true);
        adapter.setStateChanged('cosphi', message.readUIntBE(304, 8)/ 1000);

        //L1
        adapter.setStateChanged('L1.p1regard', message.readUIntBE(320, 8)/ 10, true);
        adapter.setStateChanged('L1.p1regardcounter', message.readUIntBE(336, 16)/ 3600000, true);
        adapter.setStateChanged('L1.p1surplus', message.readUIntBE(360, 8)/ 10, true);
        adapter.setStateChanged('L1.p1surpluscounter', message.readUIntBE(376, 16)/ 3600000, true);
        adapter.setStateChanged('L1.q1regard', message.readUIntBE(400, 8)/ 10, true);
        adapter.setStateChanged('L1.q1regardcounter', message.readUIntBE(416, 16)/ 3600000, true);
        adapter.setStateChanged('L1.q1surplus', message.readUIntBE(440, 8)/ 10, true);
        adapter.setStateChanged('L1.q1surpluscounter', message.readUIntBE(456, 16)/ 3600000, true);
        adapter.setStateChanged('L1.s1regard', message.readUIntBE(480, 8)/ 10, true);
        adapter.setStateChanged('L1.s1regardcounter', message.readUIntBE(496, 16)/ 3600000, true);
        adapter.setStateChanged('L1.s1surplus', message.readUIntBE(520, 8)/ 10, true);
        adapter.setStateChanged('L1.s1surpluscounter', message.readUIntBE(536, 16)/ 3600000, true);
        adapter.setStateChanged('L1.cosphi1', message.readUIntBE(592, 8)/ 1000, true);
        adapter.setStateChanged('L1.thd1', message.readUIntBE(560, 8)/ 1000, true);
        adapter.setStateChanged('L1.v1', message.readUIntBE(576, 8)/ 1000, true);
        //L2
        adapter.setStateChanged('L2.p2regard', message.readUIntBE(608, 8)/ 10, true);
        adapter.setStateChanged('L2.p2regardcounter', message.readUIntBE(624, 16)/ 3600000, true);
        adapter.setStateChanged('L2.p2surplus', message.readUIntBE(648, 8)/ 10, true);
        adapter.setStateChanged('L2.p2surpluscounter', message.readUIntBE(664, 16)/ 3600000, true);
        adapter.setStateChanged('L2.q2regard', message.readUIntBE(688, 8)/ 10, true);
        adapter.setStateChanged('L2.q2regardcounter', message.readUIntBE(704, 16)/ 3600000, true);
        adapter.setStateChanged('L2.q2surplus', message.readUIntBE(728, 8)/ 10, true);
        adapter.setStateChanged('L2.q2surpluscounter', message.readUIntBE(744, 16)/ 3600000, true);
        adapter.setStateChanged('L2.s2regard', message.readUIntBE(768, 8)/ 10, true);
        adapter.setStateChanged('L2.s2regardcounter', message.readUIntBE(784, 16)/ 3600000, true);
        adapter.setStateChanged('L2.s2surplus', message.readUIntBE(808, 8)/ 10, true);
        adapter.setStateChanged('L2.s2surpluscounter', message.readUIntBE(824, 16)/ 3600000, true);
        adapter.setStateChanged('L2.cosphi2', message.readUIntBE(880, 8)/ 1000);
        adapter.setStateChanged('L2.thd2', message.readUIntBE(848, 8)/ 1000);
        adapter.setStateChanged('L2.v2', message.readUIntBE(864, 8)/ 1000);

        //L3
        adapter.setStateChanged('L3.p3regard', message.readUIntBE(896, 8)/ 10, true);
        adapter.setStateChanged('L3.p3regardcounter', message.readUIntBE(912, 16)/ 3600000, true);
        adapter.setStateChanged('L3.p3surplus', message.readUIntBE(936, 8)/ 10, true);
        adapter.setStateChanged('L3.p3surpluscounter', message.readUIntBE(952, 16)/ 3600000, true);
        adapter.setStateChanged('L3.q3regard', message.readUIntBE(976, 8)/ 10, true);
        adapter.setStateChanged('L3.q3regardcounter', message.readUIntBE(992, 16)/ 3600000, true);
        adapter.setStateChanged('L3.q3surplus', message.readUIntBE(1016, 8)/ 10, true);
        adapter.setStateChanged('L3.q3surpluscounter', message.readUIntBE(1032, 16)/ 3600000, true);
        adapter.setStateChanged('L3.s3regard', message.readUIntBE(1056, 8)/ 10, true);
        adapter.setStateChanged('L3.s3regardcounter', message.readUIntBE(1072, 16)/ 3600000, true);
        adapter.setStateChanged('L3.s3surplus', message.readUIntBE(1096, 8)/ 10, true);
        adapter.setStateChanged('L3.s3surpluscounter', message.readUIntBE(1112, 16)/ 3600000, true);
        adapter.setStateChanged('L3.cosphi3', message.readUIntBE(1168, 8)/ 1000, true);
        adapter.setStateChanged('L3.thd3', message.readUIntBE(1136, 8)/ 1000, true);
        adapter.setStateChanged('L3.v3', message.readUIntBE(1152, 8)/ 1000, true);

    });
    client.bind("9522", function () {
        adapter.log.info('Listen via UDP on Port ' + adapter.config.BPO + ' for Multicast IP ' + adapter.config.BIP);
        adapter.log.info('Details L1 ' + adapter.config.L1 + ' Details L2 ' + adapter.config.L2 + ' Details L3 ' + adapter.config.L3);
        client.addMembership("239.12.255.254");
    });
    client.on('close', function () {
        adapter.log.info('UDP Socket closed ...');
        setTimeout(readData, 2000);
    });
    client.on('error', function (err) {
        adapter.log.info('UDP Socket error: ' + err);
        setTimeout(readData, 2000);
    });
}

function main() {
    
    // in this sma-em all states changes inside the adapters namespace are subscribed
    /*
    adapter.subscribeStates('*');
    */
    readData();
}
