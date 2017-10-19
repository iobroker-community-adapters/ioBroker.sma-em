
# SMA Energy Meter Adapter documentation

## General information

The SMA Energy Meter Adapter receives the multicast of the energy meter. This sends a data packet to the network every second.

## Administration / Admin page
! [Adapter_admin_config] (img/adminpage.png)

Multicast IP: The default setting is SMA and the IP address is 239.12.255.254.
Multicast Port: The default setting for the UDP port is 9522.

Advanced Mode: Provides more detailed information such as reactive power, apparent power, cosphi, voltages, THD (total harmonic distortion) This setting is disabled by default.
ATTENTION: The extended mode requires considerably more computing power.

Details L1 - L3: These selection points can be used to display details of each phase.

## Folder structure / objects
! [Adapter_overview] (img/overview.png)

After installing and starting the adapter, the following folder structure is created as shown in the figure. The total data of the energy meter are in the root directory. In the subfolders L1-L3 the individual phases.

## Explanation of object names
The letters P, Q and S are derived from electrical engineering and represent:
* P - Active power
* Q - reactive power
* S - apparent power

The word "regard" comes from English and means "net". (Current I from the network operator)
The word "surplus" means surplus. (Current which goes to the network operator)
The word "counter" means counters.

From this, the object names are put together, e.g.

pregard - real network cover
psurplus - real power supply (surplus)
qregard - reactive power grid cover
pregardcounter - counter of the net supply
...

thd - harmonic distortion
v voltage
