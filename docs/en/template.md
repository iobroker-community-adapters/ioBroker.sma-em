
# SMA Energy Meter Adapter documentation

## General information

The SMA Energy Meter Adapter receives the multicast of the energy meter. This sends a data packet to the network every second.

## Administration / Admin page
![Adapter_admin_config](img/adminpage.png)

Multicast IP: The default setting is SMA and the IP address is 239.12.255.254.
Multicast Port: The default setting for the UDP port is 9522.

Advanced Mode: Provides more detailed information such as reactive power, apparent power, cosphi, voltages, etc. This setting is disabled by default.
ATTENTION: The extended mode requires considerably more computing power.

Details L1 - L3: These selection points can be used to display details of each phase.

## Folder structure / objects
![Adapter_overview](img/overview.png)

After installing and starting the adapter, the following folder structure is created as shown in the figure. The total data of the energy meter are in the root directory. In the subfolders L1-L3 the individual phases.

## Explanation of object names
The letters P, Q and S are derived from electrical engineering and represent:
* P - Active power
* Q - reactive power
* S - apparent power

The word "regard" here means "consumption". (power received from the grid)
The word "surplus" here means "feed-in". (power fed into the grid)
The word "counter" here means "energy meter".

From this, the object names are put together, e.g.

pregard - active power received from the grid
psurplus - active power fed into the grid
pregardcounter - energy meter for the active power received from the grid
qregard - reactive power received from the grid
...
