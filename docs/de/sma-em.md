# SMA Energy Meter Adapter Dokumentation

## Allgemeine Informationen

Der SMA Energy Meter Adapter empfängt den Multicast des Energy-Meters. Dieser sendet etwa jede Sekunde ein Datenpaket ins Netzwerk.

## Administration / Admin-Seite
(Picture)[img/adminpage.png]

Multicast IP: Standardmäßig eingestellt und von SMA vorgegeben ist die IP-Adresse 239.12.255.254.
Multicast Port: Standardmäßig eingestellt und von SMA vorgegeben ist der UDP Port: 9522. 

Erweiterter Modus: Bietet detailiertere Information wie Blindleistung, Scheinleistung, cosphi, Spannungen, THD (Gesamte harmonische Verzerrung) Diese Einstellung ist standardmäßig deaktiviert. 
ACHTUNG: Der erweiterte Modus verlangt deutlich mehr Rechenleistung.

Details L1 - L3: Über diese Auswahlpunkte können Details zu jeder einzelnen Phase angezeigt werden.

## Ordnerstruktur / Objekte
(Picture)[img/overview.png]

Nach Installation und Start des Adapters wird wie auf dem Bild angezeigt folgende Ordnerstruktur angelegt. Im Stammverzeichnis befinden sich die Gesamtdaten des Energy Meters. In den Unterordnern L1-L3 jeweils die einzelnen Phasen.

## Erklärung der Objektnamen
Die Buchstaben P, Q und S stammen aus der Elektrotechnik und stehen für:
* P - Wirkleistung
* Q - Blindleistung
* S - Scheinleistung

Das Wort "regard" kommt aus dem englischen und bedeutet soviel wie Netzbezug. (Strom den ich vom Netzbetreiber beziehe)
Das Wort "surplus" bedeutet Überschuss. (Strom der zum Netzbetreiber geht)
Das Wort "counter" bedeutet Zähler.

Daraus setzen sich die Objektnamen zusammen z.B.

pregard - Wirkleistung Netzbezug
psurplus - Wirkleistung Einspeisung (Überschuss)
qregard - Blindleistung Netzbezug
pregardcounter - Zähler der Wirkleistung Netzbezug
...

thd - harmonische Verzerrung
v - Spannung
