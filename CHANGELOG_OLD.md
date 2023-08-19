# Older changes
## 0.6.3 (2021-03-04)

- (TGuybrush) The adapter binds now to all external IPv4 addresses.

## 0.6.1-beta.0 (2021-01-18)

- (TGuybrush) Bug fixes
  - Software Version string, last part is the revision as character (e.g. R = release)
  - Potential Warning during the first start
  - Revised units to follow the SI standardization (DIN 1301)
- (TGuybrush) Top level hierarchy object description indicates if the device is a SMA Energy Meter or a SMA Home Manager 2.
- (DutchmanNL) Released to the latest repo, fixed some typo's + news and translations

## 0.6.0

- (TGuybrush) Fixed wrong status information
  - Complete adapter core rewritten to extract the status values by their OBIS value instead of the absolute position in the received UDP message according to the SMA documentation.
  - Improved compatibility to future new OBIS values
- (TGuybrush) Add additional status information
  - Power grid frequency
  - Time tick counter
  - SMA SUSy ID
  - Software Version

- Add a timestamp for each received status information

## 0.5.7

- (DutchmanNL) Solved incorrect stated ID type for JS-controller 3.x

## 0.5.4

- (Andiling) Adapter compatibility extended for Node 10 and higher

## 0.5.3

- (Marcolotti) Fix units

## 0.5.2

- (Marcolotti) support of more than one energy meter

## 0.5.1

- (Marcolotti) Add Option for extended Mode
- (Marcolotti) Remove Option for Poll
- (Marcolotti) several fixes

## 0.5.0

- (Bluefox) Optimize Performance

## 0.0.2

- (Marcolotti) Add options for detailed View of L1, L2, L3
- (Marcolotti) Bugfixes
- (Bluefox) Optimize Performance
- (Apollon77) Clean Template

## 0.0.1

- (Marcolotti) initial release
