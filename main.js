/**
 *
 * sma-em adapter, Copyright CTJaeger 2017, MIT
 *
 */

/* jshint -W097 */
/* jshint strict:false */
/* jslint node: true */
'use strict';

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

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', main);

var connected = false
var points = {
	'SMASerial': 		{offset: 20, length 4, factor: 1},
	'pregard':    		{offset: 32, length 4, factor: 1 / 10},
	'pregardcounter':   {offset: 40, length 8, factor: 1 / 3600000},
	// ...
};

function readData() {
    var client = dgram.createSocket('udp4');

    client.on('listening', function () {
        client.setBroadcast(true);
    });

    client.on('message', function (message, rinfo) {
		if (!connected) {
			connected = true;
			adapter.setState('info.connection', true, true);
		}
		
		for (var point in points) {
			if (points.hasOwnProperty(point)) {
				var val = message.readUIntBE(points[point].offset, points[point].length) * points[point].factor;
				if (points[point].val === undefined || points[point].val !== val) {
					points[point].val = val;
					adapter.setState(point, val, true);
				}
			}
		}
		// adapter.setStateChanged('SMASerial',       message.readUIntBE(20, 4), true);
        // adapter.setStateChanged('pregard',         message.readUIntBE(32, 4) / 10, true);
        // adapter.setStateChanged('pregardcounter',  message.readUIntBE(40, 8) / 3600000, true);
        adapter.setStateChanged('psurplus',        message.readUIntBE(52, 4) / 10, true);
        adapter.setStateChanged('psurpluscounter', message.readUIntBE(60, 8) / 3600000, true);
        adapter.setStateChanged('qregard',         message.readUIntBE(72, 4) / 10, true);
        adapter.setStateChanged('qregardcounter',  message.readUIntBE(80, 8) / 3600000, true);
        adapter.setStateChanged('qsurplus',        message.readUIntBE(92, 4) / 10, true);
        adapter.setStateChanged('qsurpluscounter', message.readUIntBE(100, 8) / 3600000, true);
        adapter.setStateChanged('sregard',         message.readUIntBE(112, 4) / 10, true);
        adapter.setStateChanged('sregardcounter',  message.readUIntBE(120, 8) / 3600000, true);
        adapter.setStateChanged('ssurplus',        message.readUIntBE(132, 4) / 10, true);
        adapter.setStateChanged('ssurpluscounter', message.readUIntBE(140, 8) / 3600000, true);
        adapter.setStateChanged('cosphi',          message.readUIntBE(152, 4)/ 1000)
        
	    //L1
		if (adapter.config.L1 === true) {
			adapter.setStateChanged('L1.p1regard', message.readUIntBE(160, 4)/ 10, true);
			adapter.setStateChanged('L1.p1regardcounter', message.readUIntBE(168, 8)/ 3600000, true);
			adapter.setStateChanged('L1.p1surplus', message.readUIntBE(180, 4)/ 10, true);
			adapter.setStateChanged('L1.p1surpluscounter', message.readUIntBE(188, 8)/ 3600000, true);
			adapter.setStateChanged('L1.q1regard', message.readUIntBE(200, 4)/ 10, true);
			adapter.setStateChanged('L1.q1regardcounter', message.readUIntBE(208, 8)/ 3600000, true);
			adapter.setStateChanged('L1.q1surplus', message.readUIntBE(220, 4)/ 10, true);
			adapter.setStateChanged('L1.q1surpluscounter', message.readUIntBE(228, 8)/ 3600000, true);
			adapter.setStateChanged('L1.s1regard', message.readUIntBE(240, 4)/ 10, true);
			adapter.setStateChanged('L1.s1regardcounter', message.readUIntBE(248, 8)/ 3600000, true);
			adapter.setStateChanged('L1.s1surplus', message.readUIntBE(260, 4)/ 10, true);
			adapter.setStateChanged('L1.s1surpluscounter', message.readUIntBE(268, 8)/ 3600000, true);
			adapter.setStateChanged('L1.cosphi1', message.readUIntBE(296, 4)/ 1000, true);
			adapter.setStateChanged('L1.thd1', message.readUIntBE(280, 4)/ 1000, true);
			adapter.setStateChanged('L1.v1', message.readUIntBE(288, 4)/ 1000, true);
		}

		//L2
		if (adapter.config.L2 === true) {
			adapter.setStateChanged('L2.p2regard', message.readUIntBE(304, 4)/ 10, true);
			adapter.setStateChanged('L2.p2regardcounter', message.readUIntBE(312, 8)/ 3600000, true);
			adapter.setStateChanged('L2.p2surplus', message.readUIntBE(324, 4)/ 10, true);
			adapter.setStateChanged('L2.p2surpluscounter', message.readUIntBE(332, 8)/ 3600000, true);
			adapter.setStateChanged('L2.q2regard', message.readUIntBE(344, 4)/ 10, true);
			adapter.setStateChanged('L2.q2regardcounter', message.readUIntBE(352, 8)/ 3600000, true);
			adapter.setStateChanged('L2.q2surplus', message.readUIntBE(364, 4)/ 10, true);
			adapter.setStateChanged('L2.q2surpluscounter', message.readUIntBE(372, 8)/ 3600000, true);
			adapter.setStateChanged('L2.s2regard', message.readUIntBE(384, 4)/ 10, true);
			adapter.setStateChanged('L2.s2regardcounter', message.readUIntBE(392, 8)/ 3600000, true);
			adapter.setStateChanged('L2.s2surplus', message.readUIntBE(404, 4)/ 10, true);
			adapter.setStateChanged('L2.s2surpluscounter', message.readUIntBE(412, 8)/ 3600000, true);
			adapter.setStateChanged('L2.cosphi2', message.readUIntBE(440, 4)/ 1000);
			adapter.setStateChanged('L2.thd2', message.readUIntBE(424, 4)/ 1000);
			adapter.setStateChanged('L2.v2', message.readUIntBE(432, 4)/ 1000);
		}

			//L3
		if (adapter.config.L3 === true) {
			adapter.setStateChanged('L3.p3regard', message.readUIntBE(448, 4)/ 10, true);
			adapter.setStateChanged('L3.p3regardcounter', message.readUIntBE(456, 8)/ 3600000, true);
			adapter.setStateChanged('L3.p3surplus', message.readUIntBE(468, 4)/ 10, true);
			adapter.setStateChanged('L3.p3surpluscounter', message.readUIntBE(476, 8)/ 3600000, true);
			adapter.setStateChanged('L3.q3regard', message.readUIntBE(488, 4)/ 10, true);
			adapter.setStateChanged('L3.q3regardcounter', message.readUIntBE(496, 8)/ 3600000, true);
			adapter.setStateChanged('L3.q3surplus', message.readUIntBE(508, 4)/ 10, true);
			adapter.setStateChanged('L3.q3surpluscounter', message.readUIntBE(516, 8)/ 3600000, true);
			adapter.setStateChanged('L3.s3regard', message.readUIntBE(529, 4)/ 10, true);
			adapter.setStateChanged('L3.s3regardcounter', message.readUIntBE(536, 8)/ 3600000, true);
			adapter.setStateChanged('L3.s3surplus', message.readUIntBE(548, 4)/ 10, true);
			adapter.setStateChanged('L3.s3surpluscounter', message.readUIntBE(556, 8)/ 3600000, true);
			adapter.setStateChanged('L3.cosphi3', message.readUIntBE(584, 4)/ 1000, true);
			adapter.setStateChanged('L3.thd3', message.readUIntBE(568, 4)/ 1000, true);
			adapter.setStateChanged('L3.v3', message.readUIntBE(576, 4)/ 1000, true);
		};
    });
	
    client.bind(adapter.config.BPO, function () {
        adapter.log.info('Listen via UDP on Port ' + adapter.config.BPO + ' for Multicast IP ' + adapter.config.BIP);
        adapter.log.info('Details L1 ' + adapter.config.L1 + ' Details L2 ' + adapter.config.L2 + ' Details L3 ' + adapter.config.L3);
        client.addMembership(adapter.config.BIP);
    });
	
    client.on('close', function () {
        adapter.log.info('UDP Socket closed ...');
        setTimeout(readData, 2000);
		if (connected) {
			connected = false;
			adapter.setState('info.connection', false, true);
		}
    });
	
    client.on('error', function (err) {
        adapter.log.error('UDP Socket error: ' + err);
        setTimeout(readData, 2000);
		if (connected) {
			connected = false;
			adapter.setState('info.connection', false, true);
		}
    });
}

function main() {
	adapter.setState('info.connection', false, true);
    readData();
}
