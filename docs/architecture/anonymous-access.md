# JoinSplit – Anonymous Access Identity for M1

## Status and Purpose

JS-007 ist für den M1 Walking Skeleton freigegeben.
Der am 2026-09-14 freigegebene [Create-Group-Vertrag](create-group-alignment.md)
ergänzt den Vorgang um einen optionalen separaten initialen Participant.

M1 benötigt eine anonyme Access Identity, die ohne Netzwerkzugriff entstehen
kann und später von Laravel verifiziert wird, wenn lokal erstellte Groups
synchronisiert werden.

Dieses Dokument beschreibt den begrenzten M1-Mechanismus. Es ist nicht die
abschließende Umsetzung eines dauerhaften anonymen Zugriffs für den vollständigen
Offline-First-MVP. Laravel und PostgreSQL bleiben nach der Synchronisation
autoritativ.

## Current Post-M1 Status

Dieses Dokument bleibt die historische Architekturgrundlage für die anonyme
Access Identity. Seit M2 werden Access Identity und Credential gemäß
[`local-persistence.md`](local-persistence.md) dauerhaft in IndexedDB
gespeichert. Es gibt weiterhin weder Credential-Recovery noch Multi-Device-
Zugriff. Öffentlich wird dies als Nutzung „ohne Account“ bezeichnet; Namen und
Finanzdaten werden dadurch nicht anonym.

Der [M4-Portfolio-Demo-Vertrag](../product/portfolio-demo.md) ergänzt eine
zeitlich begrenzte Serverkopie. Ein lokaler Reset entfernt Browserdaten und
Credential, aber keine synchronisierte Serverkopie; für diese bleibt die
automatische Aufbewahrungsgrenze maßgeblich.

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
| CreateGroup Pending Mutation | `groupId`, `name`, `currency`, `actorId`, `initialParticipant` |

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

Die Registrierung ist eine ausdrückliche Operation über
`POST /api/access-identities`. Gewöhnliche Group-, Participant-, Expense-,
Settlement- und Lifecycle-Mutationen authentifizieren ausschließlich eine
bestehende Access Identity und legen niemals implizit eine neue an. Eine
syntaktisch gültige, aber unbekannte Identity erhält auf diesen Mutationsrouten
die stabile generische Antwort `410 Gone`. Fehlende oder ungültige Credentials
und Credential-Konflikte bleiben `401 Unauthorized`.

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

Authentifizierte API-Requests verwenden folgenden festen Transportvertrag:

```http
X-Access-Identity-ID: <public Access Identity UUID>
Authorization: Bearer <credential>
```

Die Access Identity UUID ist öffentlich; das Bearer-Credential bleibt geheim.
Das Credential erscheint weder in URLs, Domain-Payloads, Logs oder der UI noch
als persistierter Klartext.

Ein requestseitiges `owner_id` darf niemals Ownership gewähren oder ändern.
Auch eine öffentliche `actorId` allein autorisiert keinen Zugriff.

Participant und Access Identity bleiben unterschiedliche Konzepte.
Ownership allein erzeugt keinen Participant. Die sichtbare Create-Group-
Checkbox kann ausdrücklich einen separaten Participant derselben Group
anlegen; ihr globaler Default ist true und pro Erstellung überschreibbar.
Der Participant erhält weder das Credential noch automatisch eigenen Zugriff.

## First Synchronization and Group Retry

1. Access Identity und Credential bei Bedarf offline im Arbeitsspeicher erzeugen.
2. Group mit clientseitiger UUID v4, optionalen aktiven initialen Participant
   mit unabhängiger UUID v4 und eine CreateGroup Pending Mutation gemeinsam
   lokal übernehmen. Erst danach lokalen Erfolg melden und navigieren.
3. Bei verfügbarer Verbindung dieselbe Access Identity registrieren/verifizieren.
4. Den vollständigen unveränderten Erstellungsstand authentifiziert versenden;
   das Credential stammt aus dem getrennten Identity State.
5. Laravel validiert und erstellt Group plus optionalen Participant gemeinsam
   in einer Datenbanktransaktion. Ownership stammt aus dem verifizierten Actor.

Der Payload enthält `groupId`, normalisierten `name`, `currency = EUR`, lokale
`actorId` und `initialParticipant`: null oder `{ participantId, name }`.
Group und Participant starten aktiv; der initiale Participant steht als erster
in der stabilen Participant-Reihenfolge. Client-IDs bleiben serverseitig erhalten.
Beide Namen umfassen nach der im [Vertrag](create-group-alignment.md)
definierten Trimming-Regel 1–100 Unicode-Codepoints. Bei null wird ein eventuell
im Formular verbliebener Participant-Name nicht übernommen.

Lokaler Domain-State und Pending Entry dürfen nicht teilweise übernommen werden.
Bei lokalem Fehler bleiben Eingaben erhalten, ohne Erfolgsnavigation.
Identity, Domain-State, Settings und Pending Entries bleiben in M1 im
Arbeitsspeicher; der globale Settings-Default verändert keine bestehende Mutation.

| Server state | Result |
| --- | --- |
| Group fehlt; vollständiger Payload gültig und IDs frei | Group und optionalen Participant gemeinsam mit verifiziertem Owner erstellen |
| Group existiert beim selben Owner mit identischem ursprünglichem Erstellungsstand | Erfolg bestätigen, nichts erneut erstellen oder zurücksetzen |
| Derselbe Owner, abweichende ursprüngliche Erstellungsdaten einschließlich Participant-Auswahl, ID oder Name | Konflikt ohne Überschreibung oder nachträgliche Ergänzung |
| Anderer Owner | Ablehnen, keine fremden Group-Daten offenlegen |
| ID-Kollision oder inkonsistenter bestehender Zustand | Ablehnen; keine fremden Participants übernehmen oder stille Reparatur |

Retries behalten Identity, Credential, Group-ID, optionalen Participant-ID und
normalisierten Payload bei. Datenbank-Eindeutigkeit und konkurrierende Requests
müssen doppelte Groups/Participants verhindern. Ein Participant-Insert-Fehler
rollt auch den Group-Insert zurück; eine separat registrierte Identity darf bleiben.
Bestätigung erfolgt erst nach Commit. Bei verlorener Antwort wird derselbe
Vorgang wiederholt; abweichende Daten werden nicht mit neuen IDs automatisch
erneut erstellt. Ein allgemeines Idempotency-Framework ist für M1 nicht nötig.

Der Vergleich betrifft den ursprünglichen Erstellungsstand. Bevor spätere
Bearbeitung eingeführt wird, muss dessen Wiedererkennbarkeit erhalten oder eine
Nachfolgeregel beschlossen werden; aktuelle Anzeigenamen allein genügen dann
nicht. Details, Zustandsverantwortung und Delivery-Prüfungen stehen im Vertrag.

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
