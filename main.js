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

var connected = false;
var points = {
    'SMASerial': 	            {offset: 20,  length: 4, factor: 1},
    'pregard':	                {offset: 32,  length: 4, factor: 1 / 10},
    'pregardcounter':           {offset: 40,  length: 8, factor: 1 / 3600000},
    'psurplus':                 {offset: 52,  length: 4, factor: 1 / 10},
    'psurpluscounter':          {offset: 60,  length: 8, factor: 1 / 3600000}
};

function readData() {
    var client = dgram.createSocket('udp4');

    client.on('listening', function () {
        client.setBroadcast(true);
    });

    client.on('message', function (message, rinfo) {
        var ser = message.readUIntBE(points['SMASerial'].offset, points['SMASerial'].length) * points['SMASerial'].factor;
		 adapter.setObjectNotExists(ser, {
       		 type: 'channel',
     		 common: {
         	 name: ser,
        	 type: 'channel'
       		 },
        native: {}
    });
	    
	if (!connected) {
            connected = true;
            adapter.setState('info.connection', true, true);
        }

        for (var point in points) {
            if (points.hasOwnProperty(point)) {
                var val = message.readUIntBE(points[point].offset, points[point].length) * points[point].factor;
                if (points[point].val === undefined || points[point].val !== val) {
                    points[point].val = val;
                    adapter.setObjectNotExists (adapter.namespace + '.' + ser + '.' + point, {
					type: 'state',
					role: 'value',
					common: {
						name: point,
						type: 'state',
						role: 'value'
						},
					native: {}
			});
			adapter.setState (ser + '.' + point, val,true);
                }
            }
        }
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
    if (adapter.config.ext && adapter.config.ext === true) {   
	points['qregard'] =                  {offset: 72,  length: 4, factor: 1 / 10};
    points['qregardcounter'] =       	 {offset: 80,  length: 8, factor: 1 / 3600000};
	points['qsurplus'] =                 {offset: 92,  length: 4, factor: 1 / 10};
	points['qsurpluscounter'] =          {offset: 100, length: 8, factor: 1 / 3600000};
    points['sregard'] =                  {offset: 112, length: 4, factor: 1 / 10};
    points['sregardcounter'] =           {offset: 120, length: 8, factor: 1 / 3600000};
    points['ssurplus'] =                 {offset: 132, length: 4, factor: 1 / 10};
    points['ssurpluscounter'] =          {offset: 140, length: 8, factor: 1 / 3600000};
    points['cosphi'] =                   {offset: 152, length: 4, factor: 1/ 1000};
};

 if (adapter.config.L1 && adapter.config.L1 === true) {   
	points['L1.p1regard'] =              {offset: 160, length: 4, factor: 1/ 10};
    points['L1.p1regardcounter'] =	    {offset: 168, length: 8, factor: 1/ 3600000};
    points['L1.p1surplus'] =             {offset: 180, length: 4, factor: 1/ 10};
    points['L1.p1surpluscounter'] =      {offset: 188, length: 8, factor: 1/ 3600000};
 if (adapter.config.ext && adapter.config.ext === true) { 
    points['L1.q1regard'] =              {offset: 200, length: 4, factor: 1/ 10};
    points['L1.q1regardcounter'] =       {offset: 208, length: 8, factor: 1/ 3600000};
    points['L1.q1surplus'] =             {offset: 220, length: 4, factor: 1/ 10};
    points['L1.q1surpluscounter'] =      {offset: 228, length: 8, factor: 1/ 3600000};
    points['L1.s1regard'] =              {offset: 240, length: 4, factor: 1/ 10};
    points['L1.s1regardcounter'] =       {offset: 248, length: 8, factor: 1/ 3600000};
    points['L1.s1surplus'] =             {offset: 260, length: 4, factor: 1/ 10};
    points['L1.s1surpluscounter'] =      {offset: 268, length: 8, factor: 1/ 3600000};
    points['L1.cosphi1'] =               {offset: 296, length: 4, factor: 1/ 1000};
    points['L1.thd1'] =                  {offset: 280, length: 4, factor: 1/ 1000};
    points['L1.v1'] =			        {offset: 288, length: 4, factor: 1/ 1000};
 };
 };
 
 if (adapter.config.L2 && adapter.config.L2 === true) {
    points['L2.p2regard'] =          	{offset: 304, length: 4, factor: 1/ 10};
    points['L2.p2regardcounter'] =   	{offset: 312, length: 8, factor: 1/ 3600000};
    points['L2.p2surplus'] =         	{offset: 324, length: 4, factor: 1/ 10};
    points['L2.p2surpluscounter'] =  	{offset: 332, length: 8, factor: 1/ 3600000};
if (adapter.config.ext && adapter.config.ext === true) { 
	points['L2.q2regard'] =          	{offset: 344, length: 4, factor: 1/ 10};
    points['L2.q2regardcounter'] =   	{offset: 352, length: 8, factor: 1/ 3600000};
    points['L2.q2surplus'] =         	{offset: 364, length: 4, factor: 1/ 10};
    points['L2.q2surpluscounter'] =  	{offset: 372, length: 8, factor: 1/ 3600000};
    points['L2.s2regard'] =          	{offset: 384, length: 4, factor: 1/ 10};
    points['L2.s2regardcounter'] =   	{offset: 392, length: 8, factor: 1/ 3600000};
    points['L2.s2surplus'] =         	{offset: 404, length: 4, factor: 1/ 10};
    points['L2.s2surpluscounter'] =  	{offset: 412, length: 8, factor: 1/ 3600000};
    points['L2.cosphi2'] =           	{offset: 440, length: 4, factor: 1/ 1000};
    points['L2.thd2'] =           	    {offset: 424, length: 4, factor: 1/ 1000};
    points['L2.v2'] =           	        {offset: 432, length: 4, factor: 1/ 1000};
 };
 };
 if (adapter.config.L3 && adapter.config.L3 === true) {
    points['L3.p3regard'] =              {offset: 448, length: 4, factor: 1/ 10};
    points['L3.p3regardcounter'] =       {offset: 456, length: 8, factor: 1/ 3600000};
    points['L3.p3surplus'] =             {offset: 468, length: 4, factor: 1/ 10};
    points['L3.p3surpluscounter'] =      {offset: 476, length: 8, factor: 1/ 3600000};
if (adapter.config.ext && adapter.config.ext === true) {   
    points['L3.q3regard'] =              {offset: 488, length: 4, factor: 1/ 10};
    points['L3.q3regardcounter'] =       {offset: 496, length: 8, factor: 1/ 3600000};
    points['L3.q3surplus'] =             {offset: 508, length: 4, factor: 1/ 10};
    points['L3.q3surpluscounter'] =      {offset: 516, length: 8, factor: 1/ 3600000};
    points['L3.s3regard'] =              {offset: 528, length: 4, factor: 1/ 10};
    points['L3.s3regardcounter'] =       {offset: 536, length: 8, factor: 1/ 3600000};
    points['L3.s3surplus'] =             {offset: 548, length: 4, factor: 1/ 10};
    points['L3.s3surpluscounter'] =      {offset: 556, length: 8, factor: 1/ 3600000};
    points['L3.cosphi3'] =               {offset: 584, length: 4, factor: 1/ 1000};
    points['L3.thd3'] =           	    {offset: 568, length: 4, factor: 1/ 1000};
    points['L3.v3'] =           	        {offset: 576, length: 4, factor: 1/ 1000};
 };
 };
    adapter.setState('info.connection', false, true);
    readData();
}
