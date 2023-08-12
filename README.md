# ioBroker.sma-em

![Logo](admin/sma-em.png)

## ioBroker Adapter for SMA Energy Meter

![Number of Installations](http://iobroker.live/badges/sma-em-installed.svg)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sma-em.svg)](https://www.npmjs.com/package/iobroker.sma-em)
![Stable version](http://iobroker.live/badges/sma-em-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.sma-em.svg)](https://www.npmjs.com/package/iobroker.sma-em)
**Tests:** ![Test and Release](https://github.com/iobroker-community-adapters/iobroker.sma-em/workflows/Test%20and%20Release/badge.svg)  

[![NPM](https://nodei.co/npm/iobroker.sma-em.png?downloads=true)](https://nodei.co/npm/iobroker.sma-em/)

### Info

This adapter reads information from SMA Energy Meter (EMETER-20) and Sunny Home Manager 2 (HM-20).
It supports the SMA-EMETER-protocol-2. Thus also compatible energy meters from other manufacturers will work.

SMA Energy Meter and Sunny Home Manager 2 multicast datagrams with their energy measurement data to the network once or more times per second.
The SMA Energy Meter Adapter receives these multicast messages and stores them as iobroker states.
A single instance of the SMA Energy Meter Adapter detects all SMA Energy Meters and Sunny Home Managers in all connected networks.

![States](docs/en/img/overview-en.png)

### States in non-extended mode

- Instantaneous values of total active power consumption (pregard) and active power feed-in (psurplus)
- Energy meter values of total active power consumption (pregardcounter) and active power feed-in (psurpluscounter)
- Serial Number, SUSyID, Software Version of SMA Energy Meter and Sunny Home Manager
- Detailed values for each of the individual phases L1 / L2 / L3 (optional):
  - Instantaneous values of active power consumption (pregard) and active power feed-in (psurplus) per phase
  - Energy meter values of active power consumption (pregardcounter) and active power feed-in (psurpluscounter) per phase
  
### States in extended mode

In addition to the states in non-extended mode, the following values are available in extended mode

- Instantaneous values of total reactive power consumption (qregard) and reactive power feed-in (qsurplus)
- Energy meter values of total reactive power consumption (qregardcounter) and reactive power feed-in (qsurpluscounter)
- Instantaneous values of total apparent power consumption (sregard) and apparent power feed-in (ssurplus)
- Energy meter values of total apparent power consumption (sregardcounter) and apparent power feed-in (ssurpluscounter)
- cosphi (power factor)
- grid frequency (only available with Sunny Home Manager 2, SMA Energy Meter currently does not provide the grid frequency value)
- Detailed for each of the individual phases L1 / L2 / L3 (optional):
  - Instantaneous values of reactive and apparent power consumption/feed-in per phase
  - Energy meter values of reactive and apparent power consumption/feed-in per phase
  - Voltage and current per phase

### Configuration Options

![Settings](docs/en/img/adminpage1-en.png)

- Multicast IP: The default setting is 239.12.255.254.
- Multicast Port: The default setting for the UDP port is 9522.
  (Both should not be changed, as SMA devices always use this IP address and port)
- Own Network Interface IPs: Select box for all available Network Interface IPv4s on ioBroker Server.
- Selected Network Interface IP: Currently selected Network Interface IP listening for Multicast messages. IP 0.0.0.0 means that the adapter listens on all available Network Interfaces.

![Settings](docs/en/img/adminpage2-en.png)

- Details L1 - L3: These selection options can be set to display details of each phase.
- Extended Mode: Provides more detailed information such as reactive power, apparent power, cosphi, grid frequency, voltage, current.
- Realtime Update Interval: Update Interval for realtime data like instantaneous values of power consumption (pregard) and power feed-in (psurplus). This setting throttles the update rate of the data points to any value between 1 second up to 30 seconds. The default value is 1 second.
- Non Realtime Update Interval: Update Interval for non-realtime data like instantaneous values of power consumption (pregardcounter) and power feed-in (psurpluscounter). This setting throttles the update rate of the data points to any value between 30 seconds up to 1 hour (3600 seconds). The default value is 30 seconds.

<!--
    Placeholder for the next version (at the beginning of the line):
    ### __WORK IN PROGRESS__
-->

## Changelog

### __WORK IN PROGRESS__

- (pdbjjens) Breaking Change: Configurable Energy Meter (single or all) to handle within one adapter instance
- (pdbjjens) Breaking Change: Selectable own network device IP to listen for multicast messages
- (ticaki) Fix: Catch interface errors
- (pdbjjens) New: Detect SMA-EM1.0 SUSy270

### 0.7.0 (2023-03-14)

- (pdbjjens) New: Configurable data point update intervals to reduce system load
- (pdbjjens) New: Use JSON config

### 0.6.6 (2023-02-28)  2023 maintenance release

- (pdbjjens) Updated dependencies
- (pdbjjens) New: Use adapter-dev instead of gulp translate

### 0.6.5 (2022-02-19)

- Updated dependencies
- Compatibility check for js-controller 4.0
- Prevent onUnload warnings

### 0.6.4 (2021-08-19)

- (TGuybrush) Bug fixes
- Prevent warnings regarding non-existent objects upon adapter instance creation and start-up under js-controller 3.2.x
- Improved check of SMA Energy Meter multicast messages to prevent ghost devices and warnings regarding unknown OBIS values.

### 0.6.3 (2021-03-04)

- (TGuybrush) The adapter binds now to all external IPv4 addresses.

## Legal Notices

SMA and Sunny Home Manager are registered trademarks of SMA Solar Technology AG <https://www.sma.de/en.html>

All other trademarks are the property of their respective owners.

The authors are in no way endorsed by or affiliated with SMA Solar Technology AG, or any associated subsidiaries, logos or trademarks.

## License

The MIT License (MIT)

Copyright (c) 2023 IoBroker-Community

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
