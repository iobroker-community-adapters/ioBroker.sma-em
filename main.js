'use strict';

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const dgram = require('dgram');
const os = require('os');
const util = require('util');
// global variables
let stopped = true;
const client = dgram.createSocket('udp4');

class SmaEm extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		// @ts-ignore
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
		await this.setStateAsync('info.connection', false, true);

		let protocol_points = {
			'SMASusyID': {name: 'SMA Device SUSy-ID'                     , update: false, addr: 18, length: 2, type: 'number', unit: ''},
			'SMASerial': {name: 'SMA Device Serial Number'               , update: false, addr: 20, length: 4, type: 'number', unit: ''},
			'TimeTick':  {name: 'SMA Time Tick Counter (32-bit overflow)', update: true , addr: 24, length: 4, type: 'number', units: 'ms'}
		}

		// - Software version as human readable number
		// - Active flag
		// - Time stamp of last message received
		let derived_points = {
			'sw_version': {name: 'Software Version', type: 'string', unit: ''},
			'last_message': {name: 'Time Stamp of the Last Message Received', type: 'number', unit: 'ms'}
		}

		// Define flags for given parameter to determine the parameters of interest.
		let cfg_ext_active = false;
		let cfg_L1_active = false;
		let cfg_L1_ext_active = false;
		let cfg_L2_active = false;
		let cfg_L2_ext_active = false;
		let cfg_L3_active = false;
		let cfg_L3_ext_active = false;

		// Set active flags for the data points depending on the parameters.
		if (this.config.ext && this.config.ext === true) {   
			cfg_ext_active = true;
		};

		if (this.config.L1 && this.config.L1 === true) {   
			cfg_L1_active = true;
		
			if (cfg_ext_active === true) { 
				cfg_L1_ext_active = true;
			}
		}

		if (this.config.L2 && this.config.L2 === true) {   
			cfg_L2_active = true;
		
			if (cfg_ext_active === true) { 
				cfg_L2_ext_active = true;
			}
		}
		if (this.config.L3 && this.config.L3 === true) {   
			cfg_L3_active = true;
		
			if (cfg_ext_active === true) { 
				cfg_L3_ext_active = true;
			}
		}


		// Define SMA OBIS messages as object the raw obis number is the used as key.
		// Example: 1:1.4.0 => 00 01 04 00

		// Same points are active by default, other depending on the parameter of the adapter.
		const obis_points = {
			0x00010400: {id: 'pregard',         name: 'P-active power / Wirkleistung +',                active: true, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x00010800: {id: 'pregardcounter',  name: 'counter P-active power / Zähler Wirkleistung +', active: true, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},
			0x00020400: {id: 'psurplus',        name: 'P-active power / Wirkleistung -',                active: true, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x00020800: {id: 'psurpluscounter', name: 'counter P-active power / Zähler Wirkleistung -', active: true, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},

			0x00030400: {id: 'qregard',         name: 'Q-reactive power / Blindleistung +',                  active: cfg_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x00030800: {id: 'qregardcounter',  name: 'counter Q-reactive power / Zähler Blindleistung +',   active: cfg_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00040400: {id: 'qsurplus',        name: 'Q-reactive power / Blindleistung -',                  active: cfg_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x00040800: {id: 'qsurpluscounter', name: 'counter Q-reactive power / Zähler Blindleistung -',   active: cfg_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00090400: {id: 'sregard',         name: 'S-apparent power  / Scheinleistung +',                active: cfg_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x00090800: {id: 'sregardcounter',  name: 'counter S-apparent power  / Zähler Scheinleistung +', active: cfg_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x000A0400: {id: 'ssurplus',        name: 'S-apparent power / Scheinleistung -',                 active: cfg_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x000A0800: {id: 'ssurpluscounter', name: 'counter S-apparent power / Zähler Scheinleistung -',  active: cfg_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x000D0400: {id: 'cosphi',          name: 'power factor / Leistungsfaktor',                      active: cfg_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'Φ'},
			0x000E0400: {id: 'frequency',       name: 'frequency / Netzfrequenz',                            active: cfg_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'Hz'},

			0x00150400: {id: 'L1.pregard',         name: 'L1 P-active power / Wirkleistung +',                active: cfg_L1_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x00150800: {id: 'L1.pregardcounter',  name: 'L1 counter P-active power / Zähler Wirkleistung +', active: cfg_L1_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},
			0x00160400: {id: 'L1.psurplus',        name: 'L1 P-active power / Wirkleistung -',                active: cfg_L1_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x00160800: {id: 'L1.psurpluscounter', name: 'L1 counter P-active power / Zähler Wirkleistung -', active: cfg_L1_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},

			0x00170400: {id: 'L1.qregard',         name: 'L1 Q-reactive power / Blindleistung +',                  active: cfg_L1_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x00170800: {id: 'L1.qregardcounter',  name: 'L1 counter Q-reactive power / Zähler Blindleistung +',   active: cfg_L1_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00180400: {id: 'L1.qsurplus',        name: 'L1 Q-reactive power / Blindleistung -',                  active: cfg_L1_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x00180800: {id: 'L1.qsurpluscounter', name: 'L1 counter Q-reactive power / Zähler Blindleistung -',   active: cfg_L1_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x001D0400: {id: 'L1.sregard',         name: 'L1 S-apparent power  / Scheinleistung +',                active: cfg_L1_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x001D0800: {id: 'L1.sregardcounter',  name: 'L1 counter S-apparent power  / Zähler Scheinleistung +', active: cfg_L1_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x001E0400: {id: 'L1.ssurplus',        name: 'L1 S-apparent power / Scheinleistung -',                 active: cfg_L1_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x001E0800: {id: 'L1.ssurpluscounter', name: 'L1 counter S-apparent power / Zähler Scheinleistung -',  active: cfg_L1_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x001F0400: {id: 'L1.amperage',        name: 'L1 amperage / Stromstärke',                              active: cfg_L1_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'A'},
			0x00200400: {id: 'L1.voltage',         name: 'L1 voltage / Spannung',                                  active: cfg_L1_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'V'},
			0x00210400: {id: 'L1.cosphi',          name: 'L1 power factor / Leistungsfaktor',                      active: cfg_L1_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'Φ'},

			0x00290400: {id: 'L2.pregard',         name: 'L2 P-active power / Wirkleistung +',                active: cfg_L2_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x00290800: {id: 'L2.pregardcounter',  name: 'L2 counter P-active power / Zähler Wirkleistung +', active: cfg_L2_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},
			0x002a0400: {id: 'L2.psurplus',        name: 'L2 P-active power / Wirkleistung -',                active: cfg_L2_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x002a0800: {id: 'L2.psurpluscounter', name: 'L2 counter P-active power / Zähler Wirkleistung -', active: cfg_L2_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},

			0x002b0400: {id: 'L2.qregard',         name: 'L2 Q-reactive power / Blindleistung +',                  active: cfg_L2_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x002b0800: {id: 'L2.qregardcounter',  name: 'L2 counter Q-reactive power / Zähler Blindleistung +',   active: cfg_L2_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x002c0400: {id: 'L2.qsurplus',        name: 'L2 Q-reactive power / Blindleistung -',                  active: cfg_L2_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x002c0800: {id: 'L2.qsurpluscounter', name: 'L2 counter Q-reactive power / Zähler Blindleistung -',   active: cfg_L2_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00310400: {id: 'L2.sregard',         name: 'L2 S-apparent power  / Scheinleistung +',                active: cfg_L2_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x00310800: {id: 'L2.sregardcounter',  name: 'L2 counter S-apparent power  / Zähler Scheinleistung +', active: cfg_L2_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x00320400: {id: 'L2.ssurplus',        name: 'L2 S-apparent power / Scheinleistung -',                 active: cfg_L2_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x00320800: {id: 'L2.ssurpluscounter', name: 'L2 counter S-apparent power / Zähler Scheinleistung -',  active: cfg_L2_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x00330400: {id: 'L2.amperage',        name: 'L2 amperage / Stromstärke',                              active: cfg_L2_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'A'},
			0x00340400: {id: 'L2.voltage',         name: 'L2 voltage / Spannung',                                  active: cfg_L2_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'V'},
			0x00350400: {id: 'L2.cosphi',          name: 'L2 power factor / Leistungsfaktor',                      active: cfg_L2_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'Φ'},

			0x003D0400: {id: 'L3.pregard',         name: 'L3 P-active power / Wirkleistung +',                active: cfg_L3_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x003D0800: {id: 'L3.pregardcounter',  name: 'L3 counter P-active power / Zähler Wirkleistung +', active: cfg_L3_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},
			0x003E0400: {id: 'L3.psurplus',        name: 'L3 P-active power / Wirkleistung -',                active: cfg_L3_active, length: 4, factor: 1 / 10, type: 'number', unit: 'W'},
			0x003E0800: {id: 'L3.psurpluscounter', name: 'L3 counter P-active power / Zähler Wirkleistung -', active: cfg_L3_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'kWh'},

			0x003F0400: {id: 'L3.qregard',         name: 'L3 Q-reactive power / Blindleistung +',                  active: cfg_L3_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x003F0800: {id: 'L3.qregardcounter',  name: 'L3 counter Q-reactive power / Zähler Blindleistung +',   active: cfg_L3_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00400400: {id: 'L3.qsurplus',        name: 'L3 Q-reactive power / Blindleistung -',                  active: cfg_L3_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'var'},
			0x00400800: {id: 'L3.qsurpluscounter', name: 'L3 counter Q-reactive power / Zähler Blindleistung -',   active: cfg_L3_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'varh'},
			0x00450400: {id: 'L3.sregard',         name: 'L3 S-apparent power  / Scheinleistung +',                active: cfg_L3_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x00450800: {id: 'L3.sregardcounter',  name: 'L3 counter S-apparent power  / Zähler Scheinleistung +', active: cfg_L3_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x00460400: {id: 'L3.ssurplus',        name: 'L3 S-apparent power / Scheinleistung -',                 active: cfg_L3_ext_active, length: 4, factor: 1 / 10,      type: 'number', unit: 'VA'},
			0x00460800: {id: 'L3.ssurpluscounter', name: 'L3 counter S-apparent power / Zähler Scheinleistung -',  active: cfg_L3_ext_active, length: 8, factor: 1 / 3600000, type: 'number', unit: 'VAh'},
			0x00470400: {id: 'L3.amperage',        name: 'L3 amperage / Stromstärke',                              active: cfg_L3_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'A'},
			0x00480400: {id: 'L3.voltage',         name: 'L3 voltage / Spannung',                                  active: cfg_L3_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'V'},
			0x00490400: {id: 'L3.cosphi',          name: 'L3 power factor / Leistungsfaktor',                      active: cfg_L3_ext_active, length: 4, factor: 1 / 1000,    type: 'number', unit: 'Φ'},

			0x90000000: {id: 'sw_version_raw',     name: 'Software Version Raw',                                   active: true,              length: 4, factor: 1 ,          type: 'number', unit: ''},
		};

		// Member variable to store the path to write the value of the current instance.
		let id_path;
		let ser_nums_active = [];

		// Map to handle different devices and to track if all state have been created.
		let ser_state_num = new Map();
		stopped = false;
		// Open UDPv4 socket to receive SMA multicast packets.
		//const client = dgram.createSocket('udp4');
	
		// Bind socket to the multicast address on all devices except localhost
		client.bind(this.config.BPO, () => {
			this.log.info('Details L1 ' + this.config.L1 + ' Details L2 ' + this.config.L2 + ' Details L3 ' + this.config.L3 + ' Extended info ' + this.config.ext);

			for (const dev of this.findIPv4IPs()) {
				this.log.info(`Listen via UDP on Device ${dev.name} with IP ${dev.ipaddr} on Port ${this.config.BPO} for Multicast IP ${this.config.BIP}`);
				client.addMembership(this.config.BIP, dev.ipaddr);
			}
		});

		// Event handler in case of UDP packet was received.
		client.on('message', async (message, rinfo) => { 

			// Check if packet is an SMA energy meter packet or adapter stopped
			if(this.check_message_type(message) === false || stopped)
				return;

			// Extract serial number as integer of the device in the received messag
			const ser = message.readUIntBE(protocol_points['SMASerial'].addr, protocol_points['SMASerial'].length);
			const ser_str = ser.toString();
			
			// Check if points must be created and extract id path
			if (ser_nums_active.includes(ser) === false) {
				let susy = message.readUIntBE(protocol_points['SMASusyID'].addr, protocol_points['SMASusyID'].length);
				let dev_descr = 'Unkown SMA device S/N: ' + ser_str;
				
				if (susy == 372) {
					dev_descr = 'Sunny Home Manager 2.0 S/N: ' + ser_str;
				} else if (susy == 349) {
					dev_descr = 'SMA Energy Meter S/N: ' + ser_str;
				}

				// Add object in the list with serial number and elements to store the number of elements created / requested
				ser_state_num.set(ser_str, {states_req: 0, states_created: 0, states_diff: 0});

				// Create the states tree for the device depending on its serial number and wait for finish
				await this.createPoints(message, ser_str, dev_descr, obis_points, protocol_points, derived_points);

				// Update connection state.
				this.setState('info.connection', true, true);

				// Add the serial number to the list of active SMA EMs
				ser_nums_active.push(ser);
				
				// Write all protocol values only once
				for (const p in protocol_points) {
					let val = message.readUIntBE(protocol_points[p].addr, protocol_points[p].length);
					this.setState(ser_str + '.' + p, val, true);
				}

			}

			// Update values by evaluating UDP packet content.
			this.updatePoints(ser_str, message, obis_points);

			// Update software version as human readable
			// Major.Minor.Build.Revision(as character)
			this.getState(ser_str + '.sw_version_raw',  (err, state) => {
				if (!err && state != null) {
					let sw = ((state.val >> 24) & 0xFF).toString();
					sw += '.' + ((state.val >> 16) & 0xFF).toString();
					sw += '.' + ((state.val >> 8) & 0xFF).toString();
					sw += '.' + String.fromCharCode(state.val & 0xFF);

					this.setState(ser_str + '.sw_version', sw, true);
				}
			});

			// Write current time stamp
			this.setState(ser_str + '.last_message', Date.now(), true);

			// Update fixed protocol data
			for (const p in protocol_points) {
				if(protocol_points[p].update === true) {
					let val = message.readUIntBE(protocol_points[p].addr, protocol_points[p].length);
					this.setState(ser_str + '.' + p, val, true);			
				}
			}

    	});

		client.on('close', () => {
			this.log.info('UDP Socket closed ...');
			this.setState('info.connection', false, true);
		});

		client.on('error', (err) => {
			this.log.error('UDP Socket error: ' + err);
			this.setState('info.connection', false, true);
			client.close();
		});
	}

	check_message_type(message) {
		// Check SMA ident string at the first 0 bytes
		if(message.toString('ascii', 0, 3) !=  'SMA')
			return false;

		// Check protocol type
		if(message.readUInt16BE(16) != 0x6069)
			return false;

		return true;
	}
	
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			// disable udp message reception
			stopped = true;
			client.close();
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

	// Create or delete iobroker data points and set the fixed data points
	async createPoints(message, ser_str, dev_str, points, proto, derived) {
		
		//const setObjectNotExitsPromise = util.promisify(this.setObjectNotExists)
		let proms = [];

		// Create id tree structure ("adapterid.serialnumber.points")
		let prom = this.setObjectNotExistsAsync(ser_str, {
			type: 'device',
			common: {name: dev_str},
			native: {}
		});
		proms.push(prom);

		// Create full path prefix
		let path_pre = ser_str + '.';

		// Create other information data points for the protocol objects.
		for(const p in proto) {
			prom = this.setObjectNotExistsAsync (path_pre + p, {
				type: 'state',
				common: {
					name: proto[p].name,
					type: proto[p].type,
					role: 'value',
					unit: proto[p].unit,
					read: true,
					write: true
				},
				native: {}
			});
			proms.push(prom);
		} 

		// Create OBIS data points which are active
		for(const p in points) {

			// Create only points which are configured as active
			if (points[p].active === true) {
				prom = this.setObjectNotExistsAsync(path_pre + points[p].id, {
					type: 'state',
					common: {
						name: points[p].name,
						type: points[p].type,
						role: 'value',
						unit: points[p].unit,
						read: true,
						write: true
					},
					native: {}
				});
				proms.push(prom);
			}
			// Delete point if it is not active
			else {
				this.delObject(path_pre + points[p].id);
			}
		}

		this.getObject(path_pre + 'L1',  (err, obj ) => { 
			!err && this.extendObject(path_pre + 'L1', {type: 'channel', common: {name: 'Values of phase 1'}});	
		});

		this.getObject(path_pre + 'L2',  (err, obj ) => { 
			!err && this.extendObject(path_pre + 'L2', {type: 'channel', common: {name: 'Values of phase 2'}});	
		});

		this.getObject(path_pre + 'L3',  (err, obj ) => { 
			!err && this.extendObject(path_pre + 'L3', {type: 'channel', common: {name: 'Values of phase 3'}});	
		});

		// Create additional derived states
		for (const p in derived) {
			prom = this.setObjectNotExistsAsync(path_pre + p, {
				type: 'state',
				common: {
					name: derived[p].name,
					type: derived[p].type,
					role: 'value',
					unit: derived[p].unit,
					read: true,
					write: true
				},
				native: {}
			});
			proms.push(prom);
		}
		
		// Wait for all object creation processes.
		await Promise.all(proms);
	}

	// Update the values of active points
	updatePoints(id_path, message, points) {

		// Start with the first obis entry
		let pos = 28;

		// Extract obis number
		while (pos < message.length) {

			// Get obis value as 32 bit number
			let obis_num = message.readUInt32BE(pos);

			// Check if obis number is known
			if (!points.hasOwnProperty(obis_num)) {

				// OBIS = 0x0 at the end of the message indicates end of message
				if (obis_num === 0 && pos === message.length - 4) {
					break;
				}

				this.log.warn(`Unkown OBIS value ${obis_num} found in UDP packet. Skip it and going to the next OBIS value.`);
				
				// Extract length from obis number, second byte is the length
				let offset = message.readUInt8(pos+2);

				// Only 4 or 8 is allowed for offset since all know OBIS values have the length 4 or 8
				// Add 4 for the OBIS value itself.
				if (offset === 4 || offset === 8) {
					pos += offset + 4;
				} else {
					pos += 4 + 4;
				}
				continue;
			}

			// Get expected message length of current obis value and set read address to message start.
			let length = points[obis_num].length;
			pos += 4;

			// If point is marked as inactive skip it and go to the next point.
			if (points[obis_num].active === false) {
				pos += length;
				continue;
			}

			// Read obis message value as 32 or 64 bit unsigned int value.
			let val = 0;
			if (length === 4) {
				val = message.readUInt32BE(pos);
			} else if (length === 8) {
				val = message.readBigUInt64BE(pos);
			} else {
				this.log.error(`Only OBIS message length of 4 or 8 is support, current length is ${length}`);
			}

			// Convert raw value to final value
			val = Number(val) * points[obis_num].factor;
			
			// Write value to data point
			this.setState(id_path + '.' + points[obis_num].id, val, true);

			// Set read address to next obis value
			pos += length;
		}
	}

	findIPv4IPs() {
		// Get all network devices
		const ifaces = require('os').networkInterfaces();
		var net_devs = [];

		for (var dev in ifaces) {
			if (ifaces.hasOwnProperty(dev)) {
				
				// Read IPv4 address properties of each device by filtering for the IPv4 external interfaces
				ifaces[dev].forEach(details => {
					if (!details.internal && details.family === 'IPv4') {
						net_devs.push({name: dev, ipaddr: details.address});
					}
				});
			}
		}
		return net_devs;
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


