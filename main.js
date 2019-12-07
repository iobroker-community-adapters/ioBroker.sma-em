'use strict';

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const dgram = require('dgram');
let connected = false;
// Load your modules here, e.g.:
// const fs = require("fs");

class SmaEm extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sma-em',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		connected = false;
		let points = {
			'SMASerial': 	        {offset: 20,  length: 4, factor: 1, unit: ''},
			'pregard':	                {offset: 32,  length: 4, factor: 1 / 10, unit: 'Watt'},
			'pregardcounter':           {offset: 40,  length: 8, factor: 1 / 3600000, unit: 'kWh'},
			'psurplus':                 {offset: 52,  length: 4, factor: 1 / 10, unit: 'Watt'},
			'psurpluscounter':          {offset: 60,  length: 8, factor: 1 / 3600000, unit: 'kWh'}
		};

		
		if (this.config.ext && this.config.ext === true) {   
			points['qregard'] =                  {offset: 72,  length: 4, factor: 1 / 10, unit: 'var'};
			points['qregardcounter'] =       	 {offset: 80,  length: 8, factor: 1 / 3600000, unit: 'varh'};
			points['qsurplus'] =                 {offset: 92,  length: 4, factor: 1 / 10, unit: 'var'};
			points['qsurpluscounter'] =          {offset: 100, length: 8, factor: 1 / 3600000, unit: 'varh'};
			points['sregard'] =                  {offset: 112, length: 4, factor: 1 / 10, unit: 'VA'};
			points['sregardcounter'] =           {offset: 120, length: 8, factor: 1 / 3600000, unit: 'VAh'};
			points['ssurplus'] =                 {offset: 132, length: 4, factor: 1 / 10, unit: 'VA'};
			points['ssurpluscounter'] =          {offset: 140, length: 8, factor: 1 / 3600000, unit: 'VAh'};
			points['cosphi'] =                   {offset: 152, length: 4, factor: 1/ 1000, unit: 'Φ'};
		};
		
		 if (this.config.L1 && this.config.L1 === true) {   
			points['L1.p1regard'] =              {offset: 160, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L1.p1regardcounter'] =	 {offset: 168, length: 8, factor: 1/ 3600000, unit: 'kWh'};
			points['L1.p1surplus'] =             {offset: 180, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L1.p1surpluscounter'] =      {offset: 188, length: 8, factor: 1/ 3600000, unit: 'kWh'};
		
			if (this.config.ext && this.config.ext === true) { 
				points['L1.q1regard'] =              {offset: 200, length: 4, factor: 1/ 10, unit: 'var'};
				points['L1.q1regardcounter'] =       {offset: 208, length: 8, factor: 1/ 3600000, unit: 'var'};
				points['L1.q1surplus'] =             {offset: 220, length: 4, factor: 1/ 10, unit: 'var'};
				points['L1.q1surpluscounter'] =      {offset: 228, length: 8, factor: 1/ 3600000, unit: 'var'};
				points['L1.s1regard'] =              {offset: 240, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L1.s1regardcounter'] =       {offset: 248, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L1.s1surplus'] =             {offset: 260, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L1.s1surpluscounter'] =      {offset: 268, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L1.cosphi1'] =               {offset: 296, length: 4, factor: 1/ 1000, unit: 'Φ'};
				points['L1.amperage'] =                  {offset: 280, length: 4, factor: 1/ 1000, unit: 'A'};
				points['L1.v1'] =			 {offset: 288, length: 4, factor: 1/ 1000, unit: 'V'};
			};
		 };
		 
		 if (this.config.L2 && this.config.L2 === true) {
			points['L2.p2regard'] =          	{offset: 304, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L2.p2regardcounter'] =   	{offset: 312, length: 8, factor: 1/ 3600000, unit: 'kWh'};
			points['L2.p2surplus'] =         	{offset: 324, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L2.p2surpluscounter'] =  	{offset: 332, length: 8, factor: 1/ 3600000, unit: 'kWh'};
			
			if (this.config.ext && this.config.ext === true) { 
				points['L2.q2regard'] =          	{offset: 344, length: 4, factor: 1/ 10, unit: 'var'};
				points['L2.q2regardcounter'] =   	{offset: 352, length: 8, factor: 1/ 3600000, unit: 'varh'};
				points['L2.q2surplus'] =         	{offset: 364, length: 4, factor: 1/ 10, unit: 'var'};
				points['L2.q2surpluscounter'] =  	{offset: 372, length: 8, factor: 1/ 3600000, unit: 'varh'};
				points['L2.s2regard'] =          	{offset: 384, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L2.s2regardcounter'] =   	{offset: 392, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L2.s2surplus'] =         	{offset: 404, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L2.s2surpluscounter'] =  	{offset: 412, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L2.cosphi2'] =           	{offset: 440, length: 4, factor: 1/ 1000, unit: 'Φ'};
				points['L2.amperage'] =           	{offset: 424, length: 4, factor: 1/ 1000, unit: 'A'};
				points['L2.v2'] =           	{offset: 432, length: 4, factor: 1/ 1000, unit: 'V'};
			};
		 };

		 if (this.config.L3 && this.config.L3 === true) {
			points['L3.p3regard'] =              {offset: 448, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L3.p3regardcounter'] =       {offset: 456, length: 8, factor: 1/ 3600000, unit: 'kWh'};
			points['L3.p3surplus'] =             {offset: 468, length: 4, factor: 1/ 10, unit: 'Watt'};
			points['L3.p3surpluscounter'] =      {offset: 476, length: 8, factor: 1/ 3600000, unit: 'kWh'};
			
			if (this.config.ext && this.config.ext === true) {   
				points['L3.q3regard'] =              {offset: 488, length: 4, factor: 1/ 10, unit: 'var'};
				points['L3.q3regardcounter'] =       {offset: 496, length: 8, factor: 1/ 3600000, unit: 'varh'};
				points['L3.q3surplus'] =             {offset: 508, length: 4, factor: 1/ 10, unit: 'var'};
				points['L3.q3surpluscounter'] =      {offset: 516, length: 8, factor: 1/ 3600000, unit: 'varh'};
				points['L3.s3regard'] =              {offset: 528, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L3.s3regardcounter'] =       {offset: 536, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L3.s3surplus'] =             {offset: 548, length: 4, factor: 1/ 10, unit: 'VA'};
				points['L3.s3surpluscounter'] =      {offset: 556, length: 8, factor: 1/ 3600000, unit: 'VAh'};
				points['L3.cosphi3'] =               {offset: 584, length: 4, factor: 1/ 1000, unit: 'Φ'};
				points['L3.amperage'] =           	 {offset: 568, length: 4, factor: 1/ 1000, unit: 'A'};
				points['L3.v3'] =           	 {offset: 576, length: 4, factor: 1/ 1000, unit: 'V'};
			};
		 };

		var client = dgram.createSocket('udp4');
		client.on('listening', function () {
			client.setBroadcast(true);
		});
	
		client.on('message', (message, rinfo) =>{
			if (!connected) {
				connected = true;
				this.setState('info.connection', true, true);
			}

			this.setState('info.connection', true, true);
			const ser = message.readUIntBE(points['SMASerial'].offset, points['SMASerial'].length) * points['SMASerial'].factor;
			 this.setObjectNotExists(ser, {
					type: 'channel',
				  common: {
				  name: ser,
				 type: 'channel'
					},
			native: {}
		});

        const NodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);
        for (const point in points) {
            if (points.hasOwnProperty(point)) {
                if((points[point].length === 8) && NodeMajorVersion >= 12){
                    var val = Number(message.readBigInt64BE(points[point].offset)) * points[point].factor;
                }
                
                else if((points[point].length === 8) && NodeMajorVersion == 10){
                        const lowbyte = BigInt(message.readUInt32BE(points[point].offset +4));
                        const highbyte = BigInt(message.readUInt32BE(points[point].offset));
                        //var val = Number(((highbyte << 32n) + lowbyte));
                        var val = Number(((highbyte * Math.pow(2, 32)) + lowbyte));
                        val = val * points[point].factor;
                }

                else{
                    var val = message.readUIntBE(points[point].offset, points[point].length) * points[point].factor;
                }
                
		const unit = points[point].unit;
                if (points[point].val === undefined || points[point].val !== val) {
                    points[point].val = val;
                    this.setObjectNotExists (this.namespace + '.' + ser + '.' + point, {
					type: 'state',
					common: {
						name: point,
						type: 'state',
						role: 'value',
						unit: unit
						},
					native: {}
			});
			this.setState (ser + '.' + point, val,true);
                }
            }
        }
    });

    client.bind(this.config.BPO, () => {
        this.log.info('Listen via UDP on Port ' + this.config.BPO + ' for Multicast IP ' + this.config.BIP);
        this.log.info('Details L1 ' + this.config.L1 + ' Details L2 ' + this.config.L2 + ' Details L3 ' + this.config.L3);
        client.addMembership(this.config.BIP);
    });

    client.on('close', () => {
        this.log.info('UDP Socket closed ...');
        this.setState('info.connection', false, true);
    });

    client.on('error', (err) => {
        this.log.error('UDP Socket error: ' + err);
        this.setState('info.connection', false, true);
    });


	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SmaEm(options);
} else {
	// otherwise start the instance directly
	new SmaEm();
}