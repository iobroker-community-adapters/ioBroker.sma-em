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
        var smainfoasci = message.toString('hex');

        adapter.setState('SMASerial', parseInt(smainfoasci.substr(40, 8), 16), true);
        adapter.setState('pregard', parseInt(smainfoasci.substr(64, 8), 16) / 10, true);
        adapter.setState('pregardcounter', parseInt(smainfoasci.substr(80, 16), 16) / 3600000, true);
        adapter.setState('psurplus', parseInt(smainfoasci.substr(104, 8), 16) / 10, true);
        adapter.setState('psurpluscounter', parseInt(smainfoasci.substr(120, 16), 16) / 3600000, true);
        adapter.setState('qregard', parseInt(smainfoasci.substr(144, 8), 16) / 10, true);
        adapter.setState('qregardcounter', parseInt(smainfoasci.substr(160, 16), 16) / 3600000, true);
        adapter.setState('qsurplus', parseInt(smainfoasci.substr(184, 8), 16) / 10, true);
        adapter.setState('qsurpluscounter', parseInt(smainfoasci.substr(200, 16), 16) / 3600000, true);
        adapter.setState('sregard', parseInt(smainfoasci.substr(224, 8), 16) / 10, true);
        adapter.setState('sregardcounter', parseInt(smainfoasci.substr(240, 16), 16) / 3600000, true);
        adapter.setState('ssurplus', parseInt(smainfoasci.substr(264, 8), 16) / 10, true);
        adapter.setState('ssurpluscounter', parseInt(smainfoasci.substr(280, 16), 16) / 3600000, true);
        adapter.setState('cosphi', parseInt(smainfoasci.substr(304, 8), 16) / 1000);

        //L1
        adapter.setState('L1.p1regard', parseInt(smainfoasci.substr(320, 8), 16) / 10, true);
        adapter.setState('L1.p1regardcounter', parseInt(smainfoasci.substr(336, 16), 16) / 3600000, true);
        adapter.setState('L1.p1surplus', parseInt(smainfoasci.substr(360, 8), 16) / 10, true);
        adapter.setState('L1.p1surpluscounter', parseInt(smainfoasci.substr(376, 16), 16) / 3600000, true);
        adapter.setState('L1.q1regard', parseInt(smainfoasci.substr(400, 8), 16) / 10, true);
        adapter.setState('L1.q1regardcounter', parseInt(smainfoasci.substr(416, 16), 16) / 3600000, true);
        adapter.setState('L1.q1surplus', parseInt(smainfoasci.substr(440, 8), 16) / 10, true);
        adapter.setState('L1.q1surpluscounter', parseInt(smainfoasci.substr(456, 16), 16) / 3600000, true);
        adapter.setState('L1.s1regard', parseInt(smainfoasci.substr(480, 8), 16) / 10, true);
        adapter.setState('L1.s1regardcounter', parseInt(smainfoasci.substr(496, 16), 16) / 3600000, true);
        adapter.setState('L1.s1surplus', parseInt(smainfoasci.substr(520, 8), 16) / 10, true);
        adapter.setState('L1.s1surpluscounter', parseInt(smainfoasci.substr(536, 16), 16) / 3600000, true);
        adapter.setState('L1.cosphi1', parseInt(smainfoasci.substr(592, 8), 16) / 1000, true);
        adapter.setState('L1.thd1', parseInt(smainfoasci.substr(560, 8), 16) / 1000, true);
        adapter.setState('L1.v1', parseInt(smainfoasci.substr(576, 8), 16) / 1000, true);
        //L2
        adapter.setState('L2.p2regard', parseInt(smainfoasci.substr(608, 8), 16) / 10, true);
        adapter.setState('L2.p2regardcounter', parseInt(smainfoasci.substr(624, 16), 16) / 3600000, true);
        adapter.setState('L2.p2surplus', parseInt(smainfoasci.substr(648, 8), 16) / 10, true);
        adapter.setState('L2.p2surpluscounter', parseInt(smainfoasci.substr(664, 16), 16) / 3600000, true);
        adapter.setState('L2.q2regard', parseInt(smainfoasci.substr(688, 8), 16) / 10, true);
        adapter.setState('L2.q2regardcounter', parseInt(smainfoasci.substr(704, 16), 16) / 3600000, true);
        adapter.setState('L2.q2surplus', parseInt(smainfoasci.substr(728, 8), 16) / 10, true);
        adapter.setState('L2.q2surpluscounter', parseInt(smainfoasci.substr(744, 16), 16) / 3600000, true);
        adapter.setState('L2.s2regard', parseInt(smainfoasci.substr(768, 8), 16) / 10, true);
        adapter.setState('L2.s2regardcounter', parseInt(smainfoasci.substr(784, 16), 16) / 3600000, true);
        adapter.setState('L2.s2surplus', parseInt(smainfoasci.substr(808, 8), 16) / 10, true);
        adapter.setState('L2.s2surpluscounter', parseInt(smainfoasci.substr(824, 16), 16) / 3600000, true);
        adapter.setState('L2.cosphi2', parseInt(smainfoasci.substr(880, 8), 16) / 1000);
        adapter.setState('L2.thd2', parseInt(smainfoasci.substr(848, 8), 16) / 1000);
        adapter.setState('L2.v2', parseInt(smainfoasci.substr(864, 8), 16) / 1000);

        //L3
        adapter.setState('L3.p3regard', parseInt(smainfoasci.substr(896, 8), 16) / 10, true);
        adapter.setState('L3.p3regardcounter', parseInt(smainfoasci.substr(912, 16), 16) / 3600000, true);
        adapter.setState('L3.p3surplus', parseInt(smainfoasci.substr(936, 8), 16) / 10, true);
        adapter.setState('L3.p3surpluscounter', parseInt(smainfoasci.substr(952, 16), 16) / 3600000, true);
        adapter.setState('L3.q3regard', parseInt(smainfoasci.substr(976, 8), 16) / 10, true);
        adapter.setState('L3.q3regardcounter', parseInt(smainfoasci.substr(992, 16), 16) / 3600000, true);
        adapter.setState('L3.q3surplus', parseInt(smainfoasci.substr(1016, 8), 16) / 10, true);
        adapter.setState('L3.q3surpluscounter', parseInt(smainfoasci.substr(1032, 16), 16) / 3600000, true);
        adapter.setState('L3.s3regard', parseInt(smainfoasci.substr(1056, 8), 16) / 10, true);
        adapter.setState('L3.s3regardcounter', parseInt(smainfoasci.substr(1072, 16), 16) / 3600000, true);
        adapter.setState('L3.s3surplus', parseInt(smainfoasci.substr(1096, 8), 16) / 10, true);
        adapter.setState('L3.s3surpluscounter', parseInt(smainfoasci.substr(1112, 16), 16) / 3600000, true);
        adapter.setState('L3.cosphi3', parseInt(smainfoasci.substr(1168, 8), 16) / 1000, true);
        adapter.setState('L3.thd3', parseInt(smainfoasci.substr(1136, 8), 16) / 1000, true);
        adapter.setState('L3.v3', parseInt(smainfoasci.substr(1152, 8), 16) / 1000, true);

    });
    client.bind("9522", function () {
        adapter.log.info('Listen via UDP on Port ' + adapter.config.BPO + ' for Multicast IP ' + adapter.config.BIP);
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
    adapter.setObjectNotExists('SMASerial', {
        type: 'state',
        common: {
            name: "SMASerial",
            type: 'number',
            def: '0',
            role: 'value'
        },
        native: {}
    });
    adapter.setObjectNotExists('pregard', {
        type: 'state',
        common: {
            name: "pregard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Bezugs-Wirkleistung gesamt',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('pregardcounter', {
        type: 'state',
        common: {
            name: "pregardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Bezug gesamt',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('psurplus', {
        type: 'state',
        common: {
            name: "psurplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Einspeise Wirkleistung gesamt',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('psurpluscounter', {
        type: 'state',
        common: {
            name: "psurpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Einspeisung gesamt',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('qregard', {
        type: 'state',
        common: {
            name: "qregard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Bezug gesamt',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('qregardcounter', {
        type: 'state',
        common: {
            name: "qregardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Bezug gesamt',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('qsurplus', {
        type: 'state',
        common: {
            name: "qsurplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Einspeisung gesamt',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('qsurpluscounter', {
        type: 'state',
        common: {
            name: "qsurpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Einspeisung gesamt',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('sregard', {
        type: 'state',
        common: {
            name: "sregard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Bezug gesamt',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('sregardcounter', {
        type: 'state',
        common: {
            name: "sregardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Bezug gesamt',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('ssurplus', {
        type: 'state',
        common: {
            name: "ssurplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Einspeisung gesamt',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('ssurpluscounter', {
        type: 'state',
        common: {
            name: "ssurpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Einspeisung gesamt',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('cosphi', {
        type: 'state',
        common: {
            name: "cosphi",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktueller Leistungsfaktor cos phi gesamt',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.p1regard', {
        type: 'state',
        common: {
            name: "p1regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung auf L1',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.p1regardcounter', {
        type: 'state',
        common: {
            name: "p1regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Bezug auf L1',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.p1surplus', {
        type: 'state',
        common: {
            name: "p1surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung Einspeisung L1',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.p1surpluscounter', {
        type: 'state',
        common: {
            name: "p1surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Einspeisung auf L1',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.q1regard', {
        type: 'state',
        common: {
            name: "q1regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Bezug auf L1',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.q1regardcounter', {
        type: 'state',
        common: {
            name: "q1regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Bezug auf L1',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.q1surplus', {
        type: 'state',
        common: {
            name: "q1surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Einspeisung auf L1',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.q1surpluscounter', {
        type: 'state',
        common: {
            name: "q1surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Einspeisung auf L1',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.s1regard', {
        type: 'state',
        common: {
            name: "s1regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Bezug auf L1',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.s1regardcounter', {
        type: 'state',
        common: {
            name: "sregardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Bezug auf L1',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.s1surplus', {
        type: 'state',
        common: {
            name: "s1surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Einspeisung auf L1',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.s1surpluscounter', {
        type: 'state',
        common: {
            name: "s1surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Einspeisung auf L1',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.thd1', {
        type: 'state',
        common: {
            name: "thd1",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'harmonische Verzerrung auf L1',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.v1', {
        type: 'state',
        common: {
            name: "v1",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktuelle Spannung auf L1',
            unit: 'V'
        },
        native: {}
    });
    adapter.setObjectNotExists('L1.cosphi1', {
        type: 'state',
        common: {
            name: "cosphi1",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktueller Leistungsfaktor cos phi auf L1',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.p2regard', {
        type: 'state',
        common: {
            name: "p2regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung auf L2',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.p2regardcounter', {
        type: 'state',
        common: {
            name: "p2regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Bezug auf L2',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.p2surplus', {
        type: 'state',
        common: {
            name: "p2surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung Einspeisung L2',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.p2surpluscounter', {
        type: 'state',
        common: {
            name: "p2surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Einspeisung auf L2',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.q2regard', {
        type: 'state',
        common: {
            name: "q2regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Bezug auf L2',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.q2regardcounter', {
        type: 'state',
        common: {
            name: "q2regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Bezug auf L2',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.q2surplus', {
        type: 'state',
        common: {
            name: "q2surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Einspeisung auf L2',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.q2surpluscounter', {
        type: 'state',
        common: {
            name: "q2surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Einspeisung auf L2',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.s2regard', {
        type: 'state',
        common: {
            name: "s2regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Bezug auf L2',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.s2regardcounter', {
        type: 'state',
        common: {
            name: "s2regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Bezug auf L2',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.s2surplus', {
        type: 'state',
        common: {
            name: "s2surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Einspeisung auf L2',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.s2surpluscounter', {
        type: 'state',
        common: {
            name: "s2surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Einspeisung auf L2',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.thd2', {
        type: 'state',
        common: {
            name: "thd2",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'harmonische Verzerrung auf L2',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.v2', {
        type: 'state',
        common: {
            name: "v2",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktuelle Spannung auf L2',
            unit: 'V'
        },
        native: {}
    });
    adapter.setObjectNotExists('L2.cosphi2', {
        type: 'state',
        common: {
            name: "cosphi2",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktueller Leistungsfaktor cos phi auf L2',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.p3regard', {
        type: 'state',
        common: {
            name: "p3regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung auf L3',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.p3regardcounter', {
        type: 'state',
        common: {
            name: "p3regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Bezug auf L3',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.p3surplus', {
        type: 'state',
        common: {
            name: "p3surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkleistung Einspeisung L3',
            unit: 'W'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.p3surpluscounter', {
        type: 'state',
        common: {
            name: "p3surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Wirkarbeit Einspeisung auf L3',
            unit: 'kWh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.q3regard', {
        type: 'state',
        common: {
            name: "q3regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Bezug auf L3',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.q3regardcounter', {
        type: 'state',
        common: {
            name: "q3regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Bezug auf L3',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.q3surplus', {
        type: 'state',
        common: {
            name: "q3surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindleistung Einspeisung auf L3',
            unit: 'var'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.q3surpluscounter', {
        type: 'state',
        common: {
            name: "q3surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Blindarbeit Einspeisung auf L3',
            unit: 'varh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.s3regard', {
        type: 'state',
        common: {
            name: "s3regard",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Bezug auf L3',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.s3regardcounter', {
        type: 'state',
        common: {
            name: "s3regardcounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Bezug auf L3',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.s3surplus', {
        type: 'state',
        common: {
            name: "s3surplus",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinleistung Einspeisung auf L3',
            unit: 'VA'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.s3surpluscounter', {
        type: 'state',
        common: {
            name: "s3surpluscounter",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'Scheinarbeit Einspeisung auf L3',
            unit: 'VAh'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.thd3', {
        type: 'state',
        common: {
            name: "thd3",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'harmonische Verzerrung auf L3',
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.v3', {
        type: 'state',
        common: {
            name: "v3",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktuelle Spannung auf L3',
            unit: 'V'
        },
        native: {}
    });
    adapter.setObjectNotExists('L3.cosphi3', {
        type: 'state',
        common: {
            name: "cosphi3",
            type: 'number',
            def: '0',
            role: 'value',
            desc: 'aktueller Leistungsfaktor cos phi auf L3',
            unit: ''
        },
        native: {}
    });

    // in this sma-em all states changes inside the adapters namespace are subscribed
    /*
    adapter.subscribeStates('*');
    */
    readData();
}
