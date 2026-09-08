# JoinSplit – Anonymous Access Identity for M1

## Status and Purpose

JS-007 ist für den M1 Walking Skeleton freigegeben.

M1 benötigt eine anonyme Access Identity, die ohne Netzwerkzugriff entstehen
kann und später von Laravel verifiziert wird, wenn lokal erstellte Groups
synchronisiert werden.

Dieses Dokument beschreibt den begrenzten M1-Mechanismus. Es ist nicht die
abschließende Umsetzung eines dauerhaften anonymen Zugriffs für den vollständigen
Offline-First-MVP. Laravel und PostgreSQL bleiben nach der Synchronisation
autoritativ.

## Identity and Credential

Der Client erzeugt vor jeder erforderlichen Netzwerkverbindung einmalig:

- eine Access Identity ID als UUID v4,
- ein unabhängiges Credential aus 32 kryptografisch zufälligen Bytes.

Die Access Identity ID ist öffentlich und gewährt allein keinen Zugriff.
Das Credential ist der Nachweis der Kontrolle über diese Identität.

Für UUID- und Zufallserzeugung werden vorhandene kryptografische
Plattformfähigkeiten verwendet. Dafür wird keine Identifier- oder
Kryptografie-Dependency eingeführt.

## Client State in M1

Access Identity ID und Credential leben in M1 ausschließlich im Arbeitsspeicher.
Sie bleiben für die Lebensdauer der laufenden Anwendung stabil, einschließlich
lokaler Group-Erstellung und Netzwerk-Retries.

Reload, Tab-Verlust oder Browser-Neustart können diese Daten verlieren.
Diese Einschränkung ist für M1 ausdrücklich akzeptiert. Ohne das Credential
kann der Client den Zugriff auf bereits synchronisierte Groups nicht mehr
nachweisen; die öffentliche ID ersetzt diesen Nachweis nicht.

Dies genügt nicht für den vollständigen Offline-First-MVP. Dieser benötigt
dauerhafte lokale Persistenz, deren Technologie hier nicht entschieden wird.

## Credential Separation

Authentifizierungszustand und fachliche Daten bzw. Pending Mutations bleiben
getrennt. Konzeptionell enthält der Client:

| State | Fields |
| --- | --- |
| Access Identity State | `accessIdentityId`, `credential` |
| CreateGroup Pending Mutation | `groupId`, `name`, `actorId` |

`actorId` referenziert die lokale Access Identity. Es ist kein Zugriffsnachweis
und keine serverseitig vertrauenswürdige Ownership-Angabe.

Das Credential wird weder in Domain-Entitäten noch in Pending-Mutation-Payloads
eingebettet. Die Synchronisationsschicht bezieht es beim authentifizierten
Request aus dem getrennten Identity State.

Damit werden Authentifizierungsgeheimnisse nicht als gewöhnliche
serialisierbare Domain- oder Mutationsdaten behandelt.

## Server Representation

Laravel speichert:

- die eindeutige Access Identity ID,
- einen kryptografischen Digest des Credentials.

Das Klartext-Credential wird nicht persistiert. Aufgrund der 256 Bit
kryptografischen Zufälligkeit genügt ein direkter kryptografischer Digest;
Passwort-Hashing-Semantik für menschlich merkbare Passwörter ist nicht nötig.

Die Credential-Prüfung muss timingabhängige Klartextvergleiche vermeiden.
Der gespeicherte Digest ist kein vom Client verwendbares Ersatz-Credential.

## Registration Semantics

Die erste Registrierung ist idempotent und gegen konkurrierende Requests
abgesichert:

| Registration request | Result |
| --- | --- |
| Unbekannte Access Identity ID und gültiges Credential | Identität mit Credential-Digest erstellen |
| Bekannte Access Identity ID und passendes Credential | Als dieselbe Identität behandeln und erfolgreich bestätigen |
| Bekannte Access Identity ID und nicht passendes Credential | Ablehnen |

Ein Registrierungs-Retry darf das Credential einer bestehenden Access Identity
niemals ersetzen oder rotieren.

Datenbank-Eindeutigkeit und serverseitige Behandlung konkurrierender Requests
müssen diese Semantik erhalten. Ein konkurrierender Insert darf insbesondere
nicht zum Überschreiben des vorhandenen Credential-Digests führen.

Geht eine Registrierungsantwort verloren, wiederholt der Client die Anfrage
mit derselben Access Identity ID und demselben Credential. Eine bereits
erfolgreiche Registrierung wird dadurch sicher wiedererkannt.

## Authentication and Ownership

Nach erfolgreicher Verifikation löst Laravel die Access Identity als aktuellen
Actor auf. Group-Ownership wird ausschließlich aus diesem verifizierten Actor
abgeleitet.

Ein requestseitiges `owner_id` darf niemals Ownership gewähren oder ändern.
Auch eine öffentliche `actorId` allein autorisiert keinen Zugriff.

Participant und Access Identity bleiben unterschiedliche Konzepte.
Für den Owner wird kein Participant automatisch erstellt.

## First Synchronization and Group Retry

Der Ablauf ist:

1. Access Identity und Credential offline im Arbeitsspeicher erzeugen.
2. Group lokal mit clientseitiger UUID v4 erstellen und die ausstehende
   CreateGroup-Mutation ohne Credential halten.
3. Bei verfügbarer Verbindung die Access Identity registrieren bzw. anhand
   desselben Credentials verifizieren.
4. Die Group authentifiziert synchronisieren; die Synchronisationsschicht
   bezieht das Credential aus dem Identity State.
5. Laravel validiert die Group-Daten und leitet Ownership aus dem
   verifizierten Actor ab.

Die clientseitig erzeugte Group-ID wird serverseitig unverändert verwendet.
Der Name wird getrimmt und muss 1–100 Zeichen umfassen; die Group startet aktiv.

Für Create Group gelten auch nach einer verlorenen Antwort diese Regeln:

| Server state | Result |
| --- | --- |
| Group-ID fehlt | Mit authentifizierter Access Identity als Owner erstellen |
| Group existiert mit demselben Owner und denselben normalisierten Erstellungsdaten | Bestehende Group erfolgreich zurückgeben |
| Group existiert mit demselben Owner, aber abweichenden Erstellungsdaten | Konflikt ablehnen, ohne zu überschreiben |
| Group existiert für einen anderen Owner | Ablehnen, ohne fremde Group-Daten offenzulegen |

Der Client behält für Retries dieselbe Identität, dasselbe Credential, dieselbe
Group-ID und dieselben Erstellungsdaten. Server-Eindeutigkeit und Behandlung
konkurrierender Requests müssen doppelte Groups verhindern und die genannten
Prüfungen erhalten.

Für diesen M1-Create-Group-Slice ist kein allgemeines Idempotency-Framework
erforderlich.

## Security Boundaries

Jeder reale Netzwerktransport des Credentials muss außerhalb geeigneter lokaler
Entwicklungsumgebungen HTTPS verwenden.

Das Credential darf nicht erscheinen in:

- URLs,
- Logs,
- Fehlermeldungen,
- UI,
- Domain-Entitäten,
- serialisierten Mutations-Payloads.

Der Besitz des Bearer-Credentials ermöglicht Impersonation. M1 verhindert keine
Wiederverwendung nach Credential-Diebstahl. Idempotente Group-Erstellung schützt
vor doppelter Erstellung bei Retries, nicht vor Zugriff durch einen anderen
Actor mit demselben Credential.

Eine gezielte Belegung vor der legitimen Erstregistrierung würde praktisch
Kenntnis der zufälligen Access Identity ID voraussetzen. Wird diese ID vor der
Registrierung offengelegt, könnte ein anderes Credential ihre erste
Registrierung blockieren. M1 bietet dafür keinen Recovery-Mechanismus.

## Explicit M1 Non-Goals and Dependencies

Für M1 werden nicht eingeführt:

- Accounts,
- Participant-Authentifizierung,
- Laravel Sanctum,
- Laravel Passport,
- OAuth,
- Social Login,
- externe Identity Provider,
- Credential-Recovery,
- Credential-Rotation,
- Multi-Device-Identitätssynchronisation,
- dauerhafte Browser-Persistenz,
- Public-/Private-Key-Authentifizierung.

Für M1 ist kein zusätzliches Auth-/Security-Paket erforderlich.
Framework- und Plattformmittel genügen für diesen begrenzten Mechanismus.

## Future Account Compatibility

Ein zukünftiger Account kann mit der bestehenden Access Identity verknüpft
werden. Bestehende Group-Ownership und zukünftige Participant-Verknüpfungen
bleiben an derselben Access Identity erhalten, statt beim Account-Upgrade
dupliziert zu werden.

Der konkrete Account-Upgrade-Workflow bleibt zurückgestellt.
