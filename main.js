/* eslint-disable no-else-return */
'use strict';

/*
 * Created with @iobroker/create-adapter v1.17.0
 */

const utils = require('@iobroker/adapter-core');
const dgram = require('node:dgram');
const { StatePublisher } = require('./lib/state-publisher');

// global variables
let stopped = true;
let language = 'en';

// Map to handle the update cache
const updCache = new Map();

// Map to handle different devices
const serNumsActive = new Map();

const client = dgram.createSocket({ type: 'udp4', reuseAddr: true });

const IP_FORMAT =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Define flags for given parameter to determine the parameters of interest.
let cfg_ext_active = false;
let cfg_L1_active = false;
let cfg_L1_ext_active = false;
let cfg_L2_active = false;
let cfg_L2_ext_active = false;
let cfg_L3_active = false;
let cfg_L3_ext_active = false;
let cfg_rtP = 1;
let cfg_nrtP = 30;
let cfg_rtMavg = 'mean';
let cfg_rtMmed = 'median';

class SmaEm extends utils.Adapter {
    /**
     * Create the adapter instance.
     *
     * @param {Partial<ioBroker.AdapterOptions>} [options] Adapter configuration options.
     */
    constructor(options) {
        // @ts-expect-error because otherwise it does not work
        super({
            ...options,
            name: 'sma-em',
        });
        this.statePublisher = new StatePublisher({
            writeState: (id, state) => this.setState(id, state),
            onWarning: message => this.log.warn(message),
            onError: message => this.log.error(message),
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
        await this.setState('info.connection', false, true);

        if (!this.config.OIP) {
            this.log.error(`Own IP is empty - please check instance configuration of ${this.namespace}`);
            return;
        } else if (!this.config.OIP.match(IP_FORMAT)) {
            this.log.error(`Own IP ${this.config.OIP} format not valid. Should be e.g. 192.168.123.123`);
            return;
        }

        if (!this.config.EMIP) {
            this.log.error(`Energy Meter IP is empty - please check instance configuration of ${this.namespace}`);
            return;
        } else if (!this.config.EMIP.match(IP_FORMAT)) {
            this.log.error(`Energy Meter IP ${this.config.EMIP} format not valid. Should be e.g. 192.168.123.123`);
            return;
        }

        // Get system language and set it for this adapter
        await this.getForeignObjectAsync('system.config').then(sysConf => {
            if (sysConf && sysConf.common.language === 'de') {
                // switch language to a language supported or default to english
                language = sysConf.common.language;
            }
        });
        //this.log.debug('Language: ' + language);
        // Set active flags for the data points depending on the parameters.
        if (this.config.ext && this.config.ext === true) {
            cfg_ext_active = true;
        }
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

        // set update periods
        if (this.config.rtP && this.config.rtP >= 1 && this.config.rtP <= 60) {
            cfg_rtP = this.config.rtP;
        } else {
            cfg_rtP = 1;
        }
        if (this.config.nrtP && this.config.nrtP >= 30 && this.config.nrtP <= 3600) {
            cfg_nrtP = this.config.nrtP;
        } else {
            cfg_nrtP = 30;
        }

        // set averaging methods
        if (this.config.rtP && this.config.rtP > 0) {
            cfg_rtMavg = 'mean';
            cfg_rtMmed = 'median';
        } else {
            cfg_rtMavg = 'each';
            cfg_rtMmed = 'each';
        }

        const protocol_points = {
            SMASusyID: {
                name: { en: 'SMA Susy-ID', de: 'SMA Susy-ID' },
                update: false,
                addr: 18,
                length: 2,
                type: 'number',
                role: 'info.hardware',
                unit: '',
            },
            SMASerial: {
                name: { en: 'SMA Serial Number', de: 'SMA Seriennummer' },
                update: false,
                addr: 20,
                length: 4,
                type: 'number',
                role: 'info.serial',
                unit: '',
            },
            TimeTick: {
                name: { en: 'SMA Time Ticker', de: 'SMA Time Ticker' },
                update: true,
                addr: 24,
                length: 4,
                type: 'number',
                role: 'value',
                unit: 'ms',
            },
        };

        // - Software version as human readable number
        const derived_points = {
            sw_version: {
                name: { en: 'Software version', de: 'Softwareversion' },
                type: 'string',
                role: 'info.firmware',
                unit: '',
            },
        };

        // Define SMA OBIS messages as object the raw obis number is the used as key.
        // Example: 1:1.4.0 => 00 01 04 00
        // Some points are active by default, others depending on the options of the adapter.
        const obis_points = {
            0x00010400: {
                id: 'pregard',
                name: { en: 'P-active power +', de: 'Wirkleistung +' },
                active: true,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x00010800: {
                id: 'pregardcounter',
                name: { en: 'Meter P-active work +', de: 'Zähler Wirkarbeit +' },
                active: true,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },
            0x00020400: {
                id: 'psurplus',
                name: { en: 'P-active power -', de: 'Wirkleistung -' },
                active: true,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x00020800: {
                id: 'psurpluscounter',
                name: { en: 'Meter P-active work -', de: 'Zähler Wirkarbeit -' },
                active: true,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },

            0x00030400: {
                id: 'qregard',
                name: { en: 'Q-reactive power +', de: 'Blindleistung +' },
                active: cfg_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x00030800: {
                id: 'qregardcounter',
                name: { en: 'Meter Q-reactive work +', de: 'Zähler Blindarbeit +' },
                active: cfg_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00040400: {
                id: 'qsurplus',
                name: { en: 'Q-reactive power -', de: 'Blindleistung -' },
                active: cfg_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x00040800: {
                id: 'qsurpluscounter',
                name: { en: 'Meter Q-reactive work -', de: 'Zähler Blindarbeit -' },
                active: cfg_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00090400: {
                id: 'sregard',
                name: { en: 'S-apparent power +', de: 'Scheinleistung +' },
                active: cfg_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x00090800: {
                id: 'sregardcounter',
                name: { en: 'Meter S-apparent work +', de: 'Zähler Scheinarbeit +' },
                active: cfg_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x000a0400: {
                id: 'ssurplus',
                name: { en: 'S-apparent power -', de: 'Scheinleistung -' },
                active: cfg_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x000a0800: {
                id: 'ssurpluscounter',
                name: { en: 'Meter S-apparent work -', de: 'Zähler Scheinarbeit -' },
                active: cfg_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x000d0400: {
                id: 'cosphi',
                name: { en: 'Power factor', de: 'Leistungsfaktor' },
                active: cfg_ext_active,
                updateType: cfg_rtMmed,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.phase',
                unit: 'Φ',
            },
            0x000e0400: {
                id: 'frequency',
                name: { en: 'Grid frequency', de: 'Netzfrequenz' },
                active: cfg_ext_active,
                updateType: cfg_rtMmed,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.frequency',
                unit: 'Hz',
            },

            0x00150400: {
                id: 'L1.pregard',
                name: { en: 'L1 P-active power +', de: 'L1 Wirkleistung +' },
                active: cfg_L1_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x00150800: {
                id: 'L1.pregardcounter',
                name: { en: 'L1 Meter P-active work +', de: 'L1 Zähler Wirkarbeit +' },
                active: cfg_L1_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },
            0x00160400: {
                id: 'L1.psurplus',
                name: { en: 'L1 P-active power -', de: 'L1 Wirkleistung -' },
                active: cfg_L1_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x00160800: {
                id: 'L1.psurpluscounter',
                name: { en: 'L1 Meter P-active work -', de: 'L1 Zähler Wirkarbeit -' },
                active: cfg_L1_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },

            0x00170400: {
                id: 'L1.qregard',
                name: { en: 'L1 Q-reactive power +', de: 'L1 Blindleistung +' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x00170800: {
                id: 'L1.qregardcounter',
                name: { en: 'L1 Meter Q-reactive work +', de: 'L1 Zähler Blindarbeit +' },
                active: cfg_L1_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00180400: {
                id: 'L1.qsurplus',
                name: { en: 'L1 Q-reactive power -', de: 'L1 Blindleistung -' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x00180800: {
                id: 'L1.qsurpluscounter',
                name: { en: 'L1 Meter Q-reactive work -', de: 'L1 Zähler Blindarbeit -' },
                active: cfg_L1_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x001d0400: {
                id: 'L1.sregard',
                name: { en: 'L1 S-apparent power +', de: 'L1 Scheinleistung +' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x001d0800: {
                id: 'L1.sregardcounter',
                name: { en: 'L1 Meter S-apparent work +', de: 'L1 Zähler Scheinarbeit +' },
                active: cfg_L1_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x001e0400: {
                id: 'L1.ssurplus',
                name: { en: 'L1 S-apparent power -', de: 'L1 Scheinleistung -' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x001e0800: {
                id: 'L1.ssurpluscounter',
                name: { en: 'L1 Meter S-apparent work -', de: 'L1 Zähler Scheinarbeit -' },
                active: cfg_L1_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x001f0400: {
                id: 'L1.amperage',
                name: { en: 'L1 Amperage', de: 'L1 Stromstärke' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.current',
                unit: 'A',
            },
            0x00200400: {
                id: 'L1.voltage',
                name: { en: 'L1 Voltage', de: 'L1 Spannung' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.voltage',
                unit: 'V',
            },
            0x00210400: {
                id: 'L1.cosphi',
                name: { en: 'L1 Power factor', de: 'L1 Leistungsfaktor' },
                active: cfg_L1_ext_active,
                updateType: cfg_rtMmed,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.phase',
                unit: 'Φ',
            },

            0x00290400: {
                id: 'L2.pregard',
                name: { en: 'L2 P-active power +', de: 'L2 Wirkleistung +' },
                active: cfg_L2_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x00290800: {
                id: 'L2.pregardcounter',
                name: { en: 'L2 Meter P-active work +', de: 'L2 Zähler Wirkarbeit +' },
                active: cfg_L2_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },
            0x002a0400: {
                id: 'L2.psurplus',
                name: { en: 'L2 P-active power -', de: 'L2 Wirkleistung -' },
                active: cfg_L2_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x002a0800: {
                id: 'L2.psurpluscounter',
                name: { en: 'L2 Meter P-active work -', de: 'L2 Zähler Wirkarbeit -' },
                active: cfg_L2_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },

            0x002b0400: {
                id: 'L2.qregard',
                name: { en: 'L2 Q-reactive power +', de: 'L2 Blindleistung +' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x002b0800: {
                id: 'L2.qregardcounter',
                name: { en: 'L2 Meter Q-reactive work +', de: 'L2 Zähler Blindarbeit +' },
                active: cfg_L2_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x002c0400: {
                id: 'L2.qsurplus',
                name: { en: 'L2 Q-reactive power -', de: 'L2 Blindleistung -' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x002c0800: {
                id: 'L2.qsurpluscounter',
                name: { en: 'L2 Meter Q-reactive work -', de: 'L2 Zähler Blindarbeit -' },
                active: cfg_L2_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00310400: {
                id: 'L2.sregard',
                name: { en: 'L2 S-apparent power +', de: 'L2 Scheinleistung +' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x00310800: {
                id: 'L2.sregardcounter',
                name: { en: 'L2 Meter S-apparent work +', de: 'L2 Zähler Scheinarbeit +' },
                active: cfg_L2_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x00320400: {
                id: 'L2.ssurplus',
                name: { en: 'L2 S-apparent power -', de: 'L2 Scheinleistung -' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x00320800: {
                id: 'L2.ssurpluscounter',
                name: { en: 'L2 Meter S-apparent work -', de: 'L2 Zähler Scheinarbeit -' },
                active: cfg_L2_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x00330400: {
                id: 'L2.amperage',
                name: { en: 'L2 Amperage', de: 'L2 Stromstärke' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.current',
                unit: 'A',
            },
            0x00340400: {
                id: 'L2.voltage',
                name: { en: 'L2 Voltage', de: 'L2 Spannung' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.voltage',
                unit: 'V',
            },
            0x00350400: {
                id: 'L2.cosphi',
                name: { en: 'L2 Power factor', de: 'L2 Leistungsfaktor' },
                active: cfg_L2_ext_active,
                updateType: cfg_rtMmed,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.phase',
                unit: 'Φ',
            },

            0x003d0400: {
                id: 'L3.pregard',
                name: { en: 'L3 P-active power +', de: 'L3 Wirkleistung +' },
                active: cfg_L3_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x003d0800: {
                id: 'L3.pregardcounter',
                name: { en: 'L3 Meter P-active work +', de: 'L3 Zähler Wirkarbeit +' },
                active: cfg_L3_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },
            0x003e0400: {
                id: 'L3.psurplus',
                name: { en: 'L3 P-active power-', de: 'L3 Wirkleistung -' },
                active: cfg_L3_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'W',
            },
            0x003e0800: {
                id: 'L3.psurpluscounter',
                name: { en: 'L3 Meter P-active work -', de: 'L3 Zähler Wirkarbeit -' },
                active: cfg_L3_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'kWh',
            },

            0x003f0400: {
                id: 'L3.qregard',
                name: { en: 'L3 Q-reactive power +', de: 'L3 Blindleistung +' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x003f0800: {
                id: 'L3.qregardcounter',
                name: { en: 'L3 Meter Q-reactive work +', de: 'L3 Zähler Blindarbeit +' },
                active: cfg_L3_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00400400: {
                id: 'L3.qsurplus',
                name: { en: 'L3 Q-reactive power -', de: 'L3 Blindleistung -' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'var',
            },
            0x00400800: {
                id: 'L3.qsurpluscounter',
                name: { en: 'L3 Meter Q-reactive work -', de: 'L3 Zähler Blindarbeit -' },
                active: cfg_L3_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'varh',
            },
            0x00450400: {
                id: 'L3.sregard',
                name: { en: 'L3 S-apparent power +', de: 'L3 Scheinleistung +' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x00450800: {
                id: 'L3.sregardcounter',
                name: { en: 'L3 Meter S-apparent work +', de: 'L3 Zähler Scheinarbeit +' },
                active: cfg_L3_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x00460400: {
                id: 'L3.ssurplus',
                name: { en: 'L3 S-apparent power -', de: 'L3 Scheinleistung -' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 10,
                type: 'number',
                role: 'value.power',
                unit: 'VA',
            },
            0x00460800: {
                id: 'L3.ssurpluscounter',
                name: { en: 'L3 Meter S-apparent work -', de: 'L3 Zähler Scheinarbeit -' },
                active: cfg_L3_ext_active,
                updateType: 'last',
                updatePeriod: cfg_nrtP,
                length: 8,
                factor: 1 / 3600000,
                type: 'number',
                role: 'value.energy',
                unit: 'VAh',
            },
            0x00470400: {
                id: 'L3.amperage',
                name: { en: 'L3 Amperage', de: 'L3 Stromstärke' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.current',
                unit: 'A',
            },
            0x00480400: {
                id: 'L3.voltage',
                name: { en: 'L3 Voltage', de: 'L3 Spannung' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMavg,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.voltage',
                unit: 'V',
            },
            0x00490400: {
                id: 'L3.cosphi',
                name: { en: 'L3 Power factor', de: 'L3 Leistungsfaktor' },
                active: cfg_L3_ext_active,
                updateType: cfg_rtMmed,
                updatePeriod: cfg_rtP,
                length: 4,
                factor: 1 / 1000,
                type: 'number',
                role: 'value.phase',
                unit: 'Φ',
            },

            0x90000000: {
                id: 'sw_version_raw',
                name: { en: 'Software version raw', de: 'Softwareversion kodiert' },
                active: true,
                updateType: 'once',
                updatePeriod: 0,
                length: 4,
                factor: 1,
                type: 'number',
                role: 'info.firmware',
                unit: '',
            },
        };

        stopped = false;
        serNumsActive.clear();

        // Bind socket to the multicast addresses on all devices found except localhost
        client.bind(this.config.BPO, () => {
            const networkInterfaces = this.findIPv4IPs(this.config.OIP);
            if (networkInterfaces.length !== 0) {
                this.log.info(
                    `Options selected: Details L1: ${this.config.L1} Details L2: ${this.config.L2} Details L3: ${
                        this.config.L3
                    } Extended Mode: ${this.config.ext} RealTime Interval: ${cfg_rtP} non-Realtime Interval: ${
                        cfg_nrtP
                    } Language: ${language}`,
                );
                for (const dev of networkInterfaces) {
                    try {
                        client.addMembership(this.config.BIP, dev.ipaddr);
                        this.log.info(
                            `Listen via UDP on Network Interface ${dev.name} with IP ${dev.ipaddr} on Port ${this.config.BPO} for Multicast IP ${this.config.BIP}`,
                        );
                    } catch (error) {
                        // @ts-expect-error because otherwise it won't work
                        this.log.debug(error);
                        this.log.info(`Skip Network Interface ${dev.name} with IP ${dev.ipaddr}`);
                    }
                }
            } else {
                this.log.error(
                    `Invalid own IP address ${this.config.OIP}, please try another one from the Multicast Settings configuration panel`,
                );
                client.close;
                //return;
            }
        });

        // Event handler in case of UDP packet was received.
        client.on('message', async (message, rinfo) => {
            // This is adapter receipt time, not the meter's measurement time.
            // Capture it before any asynchronous operation can delay processing.
            const receivedAt = Date.now();
            // Check if packet is an SMA energy meter packet or if adapter stopped
            if (this.check_message_type(message, rinfo) === false || stopped) {
                return;
            } // discard message

            try {
                // Extract serial number as integer of the device in the received message
                const ser = message.readUIntBE(protocol_points['SMASerial'].addr, protocol_points['SMASerial'].length);
                const ser_str = ser.toString();
                // Extract Time Ticker from current message
                const tTick = message.readUIntBE(protocol_points['TimeTick'].addr, protocol_points['TimeTick'].length);

                // Check if points must be created and determine message rate
                if (!serNumsActive.has(ser_str)) {
                    // determine device type
                    const susy = message.readUIntBE(protocol_points['SMASusyID'].addr, protocol_points['SMASusyID'].length);
                    let dev_descr = `Unkown SMA device S/N: ${ser_str}`;
                    if (susy == 372 || susy == 501) {
                        dev_descr = `Sunny Home Manager 2.0 S/N: ${ser_str}`;
                    } else if (susy == 349 || susy == 502) {
                        dev_descr = `SMA Energy Meter 2.0 S/N: ${ser_str}`;
                    } else if (susy == 270) {
                        dev_descr = `SMA Energy Meter 1.0 S/N: ${ser_str}`;
                    }
                    // Add the newly discovered device to the map of active SMA EMs
                    // with serial number as key and details describing the device
                    serNumsActive.set(ser_str, {
                        serNum: ser,
                        suSy: susy,
                        devDescr: dev_descr,
                        devIp: rinfo.address,
                        devPort: rinfo.port,
                        tTickOld: tTick,
                        throttleFactor: 1,
                        checkRate: true,
                        initializing: false,
                        initializationSkipped: 0,
                        lastPacketAt: receivedAt,
                        lastGapWarningAt: 0,
                    });
                    return;
                } else {
                    const device = serNumsActive.get(ser_str);
                    const gapMs = receivedAt - device.lastPacketAt;
                    device.lastPacketAt = receivedAt;
                    if (gapMs > 10000 && receivedAt - device.lastGapWarningAt >= 30000) {
                        device.lastGapWarningAt = receivedAt;
                        this.log.warn(
                            `SMA ${ser_str}: UDP receipt gap ${gapMs} ms; receivedAt=${receivedAt}. ` +
                                'This measures adapter receipt, not state publication delay.',
                        );
                    }
                    if (device.initializing) {
                        device.initializationSkipped += 1;
                        return;
                    }
                    if (serNumsActive.get(ser_str).checkRate === true) {
                        //this.log.debug('checkRate: ' + serNumsActive.get(ser_str).checkRate);
                        const tTOld = serNumsActive.get(ser_str).tTickOld;
                        const tTTemp = tTOld + 950;
                        if (tTick < tTOld || tTTemp < tTOld) {
                            // check for Ticker overflow if so, restart
                            serNumsActive.set(ser_str, { ...serNumsActive.get(ser_str), throttleFactor: 1 });
                            serNumsActive.set(ser_str, { ...serNumsActive.get(ser_str), tTickOld: tTick });
                            this.log.debug(`Overflow happened - restart: ${serNumsActive.get(ser_str).throttleFactor}`);
                            return;
                        }
                        //this.log.debug('ThrottleF: ' + serNumsActive.get(ser_str).throttleFactor);
                        const tF = serNumsActive.get(ser_str).throttleFactor;
                        //this.log.debug('ThrottleF: tF=' + tF + ' tTickOld ' + serNumsActive.get(ser_str).tTickOld + ' tTick ' + tTick + ' tTTemp ' + tTTemp);

                        if (tTick < tTTemp) {
                            serNumsActive.set(ser_str, { ...serNumsActive.get(ser_str), throttleFactor: tF + 1 });
                            //serNumsActive.set(ser_str, {...serNumsActive.get(ser_str), tTickOld: tTick});
                            //this.log.debug('ThrottleF after inc: ' + serNumsActive.get(ser_str).throttleFactor );
                            return; //drop message
                        } else {
                            // Do not expose an unfinished update cache to another packet.
                            device.initializing = true;
                            this.log.info(
                                `New device discovered: ${serNumsActive.get(ser_str).devDescr} with IP/port: ${
                                    serNumsActive.get(ser_str).devIp
                                }/${serNumsActive.get(ser_str).devPort} message rate: ${
                                    serNumsActive.get(ser_str).throttleFactor
                                }/sec`,
                            );
                            // Create the states tree for the device depending on its serial number and wait for finish
                            try {
                                await this.createPoints(message, ser_str, obis_points, protocol_points, derived_points);
                                if (stopped) {
                                    return;
                                }
                                device.checkRate = false;
                                // Fixed protocol values are published once after discovery.
                                const updates = [
                                    { id: 'info.connection', state: { val: true, ack: true, ts: receivedAt } },
                                ];
                                for (const p in protocol_points) {
                                    if (protocol_points[p].update === false) {
                                        updates.push({
                                            id: `${ser_str}.${p}`,
                                            state: {
                                                val: message.readUIntBE(protocol_points[p].addr, protocol_points[p].length),
                                                ack: true,
                                                ts: receivedAt,
                                            },
                                        });
                                    }
                                }
                                this.statePublisher.enqueue(updates);
                            } finally {
                                device.initializing = false;
                                if (device.initializationSkipped > 0) {
                                    this.log.warn(
                                        `SMA ${ser_str}: skipped ${device.initializationSkipped} UDP packets during object initialization; ` +
                                            'no measurement values were published for these packets.',
                                    );
                                    device.initializationSkipped = 0;
                                }
                            }
                            return;
                        }
                    }

                    // Parse and aggregate the entire packet before the first write await.
                    await this.updatePoints(ser_str, message, obis_points, receivedAt, [
                        { id: 'info.connection', state: { val: true, ack: true, ts: receivedAt } },
                    ]);
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.log.error(`SMA UDP packet processing failed: ${reason}; receivedAt=${receivedAt}`);
            }
        });

        client.on('close', () => {
            this.log.info('UDP Socket closed ...');
            this.setState('info.connection', false, true);
        });

        client.on('error', err => {
            this.log.error(`UDP Socket error: ${err}`);
            this.setState('info.connection', false, true);
            client.close();
        });
    }

    check_message_type(message, rinfo) {
        if (message.length < 28) {
            return false;
        }
        if (this.config.EMIP === rinfo.address || this.config.EMIP === '0.0.0.0') {
            // Check SMA ident string at the first 3 bytes of the message
            if (message.toString('ascii', 0, 3) != 'SMA') {
                return false;
            }

            // Check protocol id
            if (message.readUInt16BE(16) != 0x6069) {
                return false;
            }

            return true;
        } else {
            return false;
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback Called after the adapter has cleaned up resources and must be invoked.
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            // disable udp message reception
            stopped = true;
            this.statePublisher.close();
            client.close();
            callback();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            callback();
        }
    }

    // Create or delete iobroker data points and set the fixed data points
    async createPoints(message, ser_str, points, proto, derived) {
        const proms = [];

        // Create id tree structure ("adapterid.serialnumber.points")
        const dstr = serNumsActive.get(ser_str).devDescr;
        //this.log.debug('Device description: ' + serNumsActive.get(ser_str).devDescr );

        let prom = this.setObjectNotExistsAsync(ser_str, {
            type: 'device',
            common: { name: dstr },
            native: {},
        });
        proms.push(prom);

        // Create full path prefix
        const path_pre = `${ser_str}.`;

        // Create data points for the protocol objects.
        for (const p in proto) {
            if (proto[p].update === false) {
                prom = this.setObjectNotExistsAsync(path_pre + p, {
                    type: 'state',
                    common: {
                        name: proto[p].name[language],
                        type: proto[p].type,
                        role: proto[p].role,
                        unit: proto[p].unit,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                proms.push(prom);
            }
        }

        // Create OBIS data points
        for (const p in points) {
            // Create only points which are configured as active
            if (points[p].active === true) {
                prom = this.setObjectNotExistsAsync(path_pre + points[p].id, {
                    type: 'state',
                    common: {
                        name: points[p].name[language],
                        type: points[p].type,
                        role: points[p].role,
                        unit: points[p].unit,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                const updP = points[p].updatePeriod * serNumsActive.get(ser_str).throttleFactor;
                //this.log.debug('Update period: ' + updP );

                updCache.set(path_pre + points[p].id, {
                    updPeriod: updP,
                    updCounter: updP,
                    updValue: [],
                });
                //this.log.debug('updCAche: ' + updCache);
                proms.push(prom);
                // eslint-disable-next-line brace-style
            }
            // Delete point if it is not active
            else {
                this.delObject(path_pre + points[p].id);
                updCache.delete(path_pre + points[p].id);
            }
        }

        // Create or delete optional details channels for L1-L3
        if (cfg_L1_active) {
            this.getObject(`${path_pre}L1`, err => {
                !err &&
                    this.extendObject(`${path_pre}L1`, {
                        type: 'channel',
                        common: { name: { en: 'Values of phase 1', de: 'Messwerte Phase 1' }[language] },
                    });
            });
        } else {
            this.delObject(`${path_pre}L1`);
        }
        if (cfg_L2_active) {
            this.getObject(`${path_pre}L2`, err => {
                !err &&
                    this.extendObject(`${path_pre}L2`, {
                        type: 'channel',
                        common: { name: { en: 'Values of phase 2', de: 'Messwerte Phase 2' }[language] },
                    });
            });
        } else {
            this.delObject(`${path_pre}L2`);
        }
        if (cfg_L3_active) {
            this.getObject(`${path_pre}L3`, err => {
                !err &&
                    this.extendObject(`${path_pre}L3`, {
                        type: 'channel',
                        common: { name: { en: 'Values of phase 3', de: 'Messwerte Phase 3' }[language] },
                    });
            });
        } else {
            this.delObject(`${path_pre}L3`);
        }

        // Create additional derived states
        for (const p in derived) {
            prom = this.setObjectNotExistsAsync(path_pre + p, {
                type: 'state',
                common: {
                    name: derived[p].name[language],
                    type: derived[p].type,
                    role: derived[p].role,
                    unit: derived[p].unit,
                    read: true,
                    write: false,
                },
                native: {},
            });
            proms.push(prom);
        }

        // Wait for all object creation processes
        await Promise.all(proms);
    }

    // Aggregate each received sample synchronously; publication may await the database.
    async updatePoints(id_path, message, points, receivedAt = Date.now(), additionalUpdates = []) {
        // Decode/bounds-check all available fields before mutating aggregation caches.
        // A truncated OBIS field must not publish a plausible partial snapshot.
        const samples = [];
        let pos = 28;
        while (pos < message.length) {
            if (pos + 4 > message.length) {
                throw new Error(`Truncated OBIS header at byte ${pos}`);
            }
            const obis_num = message.readUInt32BE(pos);
            if (obis_num === 0 && pos === message.length - 4) {
                break;
            }
            if (!(obis_num in points)) {
                this.log.warn(`Unknown OBIS value ${obis_num} found in UDP packet; skipping it.`);
                const offset = message.readUInt8(pos + 2);
                const length = offset === 4 || offset === 8 ? offset : 4;
                if (pos + 4 + length > message.length) {
                    throw new Error(`Truncated unknown OBIS value at byte ${pos}`);
                }
                pos += 4 + length;
                continue;
            }
            const point = points[obis_num];
            const length = point.length;
            if (length !== 4 && length !== 8) {
                throw new Error(`Only OBIS message lengths 4 or 8 are supported; got ${length}`);
            }
            pos += 4;
            if (pos + length > message.length) {
                throw new Error(`Truncated OBIS value ${obis_num} at byte ${pos}`);
            }
            if (point.active !== false) {
                const raw = length === 4 ? message.readUInt32BE(pos) : message.readBigUInt64BE(pos);
                const id = `${id_path}.${point.id}`;
                const cache = updCache.get(id);
                if (!cache) {
                    throw new Error(`Update cache not ready for ${id}`);
                }
                samples.push({ point, cache, id, val: Number(raw) * point.factor });
            }
            pos += length;
        }

        const updates = [...additionalUpdates];
        const publish = (id, val) => updates.push({ id, state: { val, ack: true, ts: receivedAt } });
        for (const { point, cache, id, val } of samples) {
            switch (point.updateType) {
                case 'last':
                    if (cache.updCounter >= 1) {
                        cache.updValue[0] = val;
                        cache.updCounter -= 1;
                    }
                    if (cache.updCounter === 0) {
                        const value = cache.updValue[0];
                        cache.updCounter = cache.updPeriod;
                        cache.updValue = [];
                        publish(id, value);
                    }
                    break;
                case 'median':
                    if (cache.updCounter >= 1) {
                        cache.updValue.push(val);
                        cache.updCounter -= 1;
                    }
                    if (cache.updCounter === 0) {
                        const values = [...cache.updValue].sort((a, b) => a - b);
                        const mid = Math.floor(values.length / 2);
                        const value = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
                        cache.updCounter = cache.updPeriod;
                        cache.updValue = [];
                        publish(id, value);
                    }
                    break;
                case 'mean':
                    if (cache.updCounter >= 1) {
                        if (cache.updValue.length === 0) {
                            cache.updValue[0] = val;
                        } else {
                            cache.updValue[0] += val;
                        }
                        cache.updCounter -= 1;
                    }
                    if (cache.updCounter === 0) {
                        const value = cache.updValue[0] / cache.updPeriod;
                        cache.updCounter = cache.updPeriod;
                        cache.updValue = [];
                        publish(id, value);
                    }
                    break;
                case 'once':
                    if (cache.updCounter === 0 && (cache.updValue.length === 0 || cache.updValue[0] !== val)) {
                        // Keep the last value for change detection, but never read it after an await.
                        cache.updValue[0] = val;
                        publish(id, val);
                        if (point.id === 'sw_version_raw') {
                            const version = [
                                (val >> 24) & 0xff,
                                (val >> 16) & 0xff,
                                (val >> 8) & 0xff,
                                String.fromCharCode(val & 0xff),
                            ].join('.');
                            publish(`${id_path}.sw_version`, version);
                        }
                    }
                    break;
                case 'each':
                    publish(id, val);
                    break;
                default:
                    this.log.error(`Unknown update type ${point.updateType} for ${id}`);
                    break;
            }
        }
        // The publisher owns immutable snapshots and bounds its waiting state map.
        // Every telegram was aggregated, even if a pending publication is superseded.
        // Do not attach a waiter per packet to a drain that can stay busy forever.
        // The publisher owns/logs asynchronous failures; idle() is available for tests.
        this.statePublisher.enqueue(updates);
    }

    findIPv4IPs(ownIP) {
        // Get all network devices
        const ifaces = require('node:os').networkInterfaces();
        const net_devs = [];

        if (ownIP === '0.0.0.0') {
            // look up all IPs
            for (const dev in ifaces) {
                if (dev in ifaces) {
                    // Read IPv4 address properties of each device by filtering for the IPv4 external interfaces
                    // @ts-expect-error because otherwise it won't work
                    ifaces[dev].forEach(details => {
                        // @ts-expect-error because details.family can be either string or number
                        if (!details.internal && (details.family === 'IPv4' || details.family === 4)) {
                            net_devs.push({ name: dev, ipaddr: details.address });
                        }
                    });
                }
            }
        } else {
            // find selected own IP
            for (const dev in ifaces) {
                if (dev in ifaces) {
                    // Search address properties of each device for selected own IP

                    // @ts-expect-error because otherwise it won't work
                    ifaces[dev].forEach(details => {
                        if (
                            details.address === ownIP &&
                            !details.internal &&
                            // @ts-expect-error because details.family can be either string or number
                            (details.family === 'IPv4' || details.family === 4)
                        ) {
                            net_devs.push({ name: dev, ipaddr: details.address });
                        }
                    });
                }
            }
        }
        return net_devs;
    }
}
// @ts-expect-error because parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options] Adapter options passed to the constructor.
     */
    module.exports = options => new SmaEm(options);
} else {
    // otherwise start the instance directly
    new SmaEm();
}
