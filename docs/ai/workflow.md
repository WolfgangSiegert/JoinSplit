# JoinSplit – AI Development Workflow

## Purpose

Dieses Dokument beschreibt den operativen Einsatz von Human, ChatGPT und Codex
bei der Entwicklung von JoinSplit.

Es ergänzt die Engineering Principles um konkrete Regeln für Delegation,
Kontextübergabe, Review und Integration.

## Roles

### Human

Der Mensch verantwortet:

- Produktentscheidungen,
- Freigaben,
- Architekturentscheidungen,
- Lernverständnis,
- Freigaben für Integration, Commits und Veröffentlichung.

### ChatGPT

ChatGPT unterstützt insbesondere bei:

- Product Ownership,
- Architektur,
- Task-Zerlegung,
- Priorisierung,
- Lernunterstützung,
- Agent-Briefing,
- Review,
- Integration.

### Codex

Codex übernimmt klar abgegrenzte Ausführungsaufgaben, insbesondere:

- Dateien untersuchen,
- Code implementieren,
- CLI-Aufgaben ausführen,
- Tests und Checks ausführen,
- strukturierte Abschlussberichte liefern.

Codex ist nicht Product Owner und erweitert Scope oder Architektur nicht
selbstständig.

## When to Use Codex

Codex wird eingesetzt, wenn ein Task ausreichend klar abgegrenzt ist und
mindestens folgende Punkte feststehen:

- Goal,
- Scope,
- Non-Goals,
- Acceptance Criteria,
- relevante Constraints.

Produktentscheidungen werden nicht aus Bequemlichkeit an Codex delegiert.

## Context Setup

Codex erhält nur task-relevanten Kontext.

Bevorzugtes Muster:

Read:
- AGENTS.md
- relevante kanonische Dokumente
- konkrete Task-Spezifikation

Then execute the bounded task.

Die vollständige Projekthistorie wird nicht in jeden Prompt kopiert.

Legacy-Dokumentation außerhalb des kanonischen Repositories wird nur gelesen,
wenn dies ausdrücklich Teil des Tasks ist.

## Canonical Repository

Das kanonische Repository ist:

/Users/Wolfgang/developer/projects/JoinSplit/source

Vor schreibenden Tasks werden mindestens geprüft:

- pwd
- git rev-parse --show-toplevel
- git status
- git remote -v

Bei abweichendem Repository-Pfad wird der Task abgebrochen.

## Execution

Codex:

- arbeitet nur im freigegebenen Scope,
- bewahrt bestehende Änderungen,
- erweitert Scope nicht stillschweigend,
- fügt keine Dependencies ohne Freigabe hinzu,
- dokumentiert Annahmen, Abweichungen, Risiken und Checks.

## Parallelization

Nur tatsächlich unabhängige Arbeit wird parallelisiert.

Abhängige Arbeit sollte erst parallelisiert werden, wenn relevante:

- Grenzen,
- Verträge,
- Datenformen,
- Tests

ausreichend stabil sind.

Mehrere Agenten sollen nicht gleichzeitig dieselben:

- Core-Dateien,
- Domain-Regeln,
- API-Verträge

verändern.

Parallelisierung dient Durchsatz, nicht zusätzlicher Prozesskomplexität.

## Learning Safeguard

Agentenausführung darf zentrale Lernschritte nicht verdecken.

Insbesondere bei den ersten Laravel-Konzepten soll der Mensch das relevante
Konzept zunächst verstehen, bevor wesentliche Implementierungsarbeit delegiert
wird.

Dies betrifft insbesondere:

- Migrationen,
- Eloquent Models und Beziehungen,
- Controller,
- Form Requests und Validation,
- Policies und Authorization,
- Feature Tests.

Das bedeutet nicht, dass jede Codezeile manuell geschrieben werden muss.

## Handoffs

Codex-Handoffs bleiben kompakt und enthalten typischerweise:

- Outcome,
- Files changed,
- Checks,
- Decisions,
- Assumptions oder Risks,
- Next action, wenn relevant.

## Review and Integration

Codex-Ergebnisse werden vor Integration menschlich geprüft.

Bei relevanten Änderungen wird insbesondere geprüft:

- entspricht der Output dem freigegebenen Scope,
- wurden keine Architekturentscheidungen stillschweigend getroffen,
- wurden keine Dependencies unerlaubt ergänzt,
- sind Tests und Checks nachvollziehbar,
- wurde bestehendes Verhalten unbeabsichtigt verändert.

Der Mensch verantwortet die Freigabe von Commit und Integration. Nach einer
ausdrücklichen Freigabe darf Codex den benannten Integrationsschritt ausführen
und muss dessen Ergebnis anschließend überprüfbar berichten.

## Git and Publishing

Das öffentliche Source-Repository existiert unter:

https://github.com/WolfgangSiegert/JoinSplit

Der bestehende `origin`-Remote darf für ausdrücklich freigegebene
Integrationsschritte verwendet werden. Für jeden materiellen Schritt gilt eine
eigene menschliche Freigabeschranke:

- Änderungen implementieren bedeutet nicht automatisch committen.
- Commit-Freigabe bedeutet nicht automatisch in `main` integrieren.
- Integrationsfreigabe bedeutet nicht automatisch pushen.
- Push-Freigabe bedeutet nicht automatisch einen Pull Request erstellen.

Ohne passende Freigabe bleiben die Änderungen im aktuellen lokalen Arbeitsstand.
Kein Force-Push, History Rewrite, Remote-Wechsel oder neues Repository ohne eine
ausdrückliche Freigabe genau dieser Operation.

GitHub Project bleibt die zentrale Aufgabenübersicht und darf nur im jeweils
freigegebenen Task-Scope verändert werden.

## Durable Decisions

Chats und Agent-Handoffs sind Arbeitsräume, keine dauerhafte
Projektdokumentation.

Dauerhafte Entscheidungen gehören in fokussierte, versionierte Dokumente unter:

- docs/product/
- docs/engineering/
- docs/architecture/
- docs/ai/

AGENTS.md bleibt eine kurze Navigationskarte und verweist auf diese Dokumente.
