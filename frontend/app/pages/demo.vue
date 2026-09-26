<script setup lang="ts">
const config = useRuntimeConfig()
const operatorName = computed(() => config.public.operatorName.trim())
const privacyContactUrl = computed(() => config.public.privacyContactUrl.trim())
const contactIsConfigured = computed(() => operatorName.value !== '' && privacyContactUrl.value !== '')
</script>

<template>
  <main class="page-shell">
    <div class="page-content">
      <NuxtLink to="/" class="secondary-link -ml-4 mb-3">← Gruppen</NuxtLink>

      <header>
        <p class="text-sm font-semibold tracking-wide text-brand-700">Öffentliche Portfolio-Demo</p>
        <h1 class="mt-2 text-3xl font-semibold text-brand-900">Demo- und Datenhinweise</h1>
        <p class="mt-3 text-gray-600">
          Diese Grenzen gelten für die öffentliche JoinSplit-Demo.
        </p>
      </header>

      <PublicDemoNotice class="mt-7" />

      <section class="card mt-5 p-5" aria-labelledby="usage-boundary-title">
        <h2 id="usage-boundary-title" class="text-xl font-semibold">Nutzung und Zugriff</h2>
        <p class="mt-3">
          Eine Person verwaltet die gesamte Gruppe in einer Browser-Installation. Teilnehmer sind
          Einträge in der Berechnung und erhalten keinen eigenen Zugriff. Es gibt keine Einladungen,
          Konten oder gemeinsame Live-Bearbeitung.
        </p>
        <p class="mt-3">
          Ohne Konto bedeutet nicht anonym: Namen, Beschreibungen und Beträge können trotzdem
          personenbezogene Daten sein.
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="storage-boundary-title">
        <h2 id="storage-boundary-title" class="text-xl font-semibold">Lokale und synchronisierte Daten</h2>
        <p class="mt-3">
          Browser-Identität, Zugangsschlüssel, Gruppen, Personen, Ausgaben, Zahlungen, Einstellungen
          und ausstehende Änderungen werden lokal in diesem Browser gespeichert.
        </p>
        <p class="mt-3">
          Bei einer Verbindung werden ausstehende Änderungen verschlüsselt an den Server übertragen.
          Die Serverkopie ist kein Backup und ermöglicht keine Wiederherstellung auf einem anderen
          Browser oder Gerät.
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="retention-boundary-title">
        <h2 id="retention-boundary-title" class="text-xl font-semibold">Aufbewahrung auf dem Server</h2>
        <p class="mt-3">
          Der normale Serverzugriff endet 30 Tage nach der letzten erfolgreich angenommenen Änderung.
          Die automatische Bereinigung läuft beim Start des kostenlosen Dienstes und täglich, solange
          er aktiv ist. Da Render einen inaktiven kostenlosen Dienst pausiert, gibt es für die
          physische Löschung keine feste Frist.
        </p>
        <p class="mt-3">
          Neons kurze Wiederherstellungshistorie ist eine Best-Effort-Funktion des Providers. Sie ist
          kein Nutzer-Backup und begründet keine zugesagte technische Löschfrist.
        </p>
        <p class="mt-3">
          Lokale Daten verschwinden dadurch nicht automatisch. Nach dem Ende der Serveraufbewahrung
          können sie in diesem Browser nur noch lokal verfügbar sein.
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="recovery-boundary-title">
        <h2 id="recovery-boundary-title" class="text-xl font-semibold">Wiederherstellung und Offline-Nutzung</h2>
        <p class="mt-3">
          Es gibt keine Wiederherstellung von Zugangsdaten und keinen geräteübergreifenden Abruf.
          Gelöschter Browserspeicher oder ein verlorenes Gerät können den Zugriff dauerhaft beenden.
        </p>
        <p class="mt-3">
          Der bereits geladene Kernablauf kann ohne API-Verbindung weiterarbeiten und Änderungen
          vormerken. Ein erster Aufruf, Neustart oder Reload ohne Netzwerk ist nicht garantiert.
        </p>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="reset-boundary-title">
        <h2 id="reset-boundary-title" class="text-xl font-semibold">Lokale Daten zurücksetzen</h2>
        <p class="mt-3">
          Der lokale Reset entfernt Daten und Zugangsschlüssel nur aus diesem Browser. Bereits
          synchronisierte Serverkopien werden nicht sofort gelöscht und bleiben an die automatische
          Aufbewahrung gebunden. Ohne den alten Zugangsschlüssel sind sie nicht wiederherstellbar.
        </p>
        <NuxtLink to="/settings#local-reset" class="secondary-link mt-3 -ml-4">
          Zu den Reset-Einstellungen
        </NuxtLink>
      </section>

      <section class="card mt-5 p-5" aria-labelledby="contact-title">
        <h2 id="contact-title" class="text-xl font-semibold">Betreiber und Datenschutzkontakt</h2>
        <p v-if="contactIsConfigured" class="mt-3">
          Verantwortlich: {{ operatorName }}
        </p>
        <a
          v-if="contactIsConfigured"
          :href="privacyContactUrl"
          class="secondary-link mt-3 -ml-4"
        >
          Kontakt aufnehmen
        </a>
        <p v-else class="mt-3 text-gray-600">
          Betreiber- und Datenschutzkontakt werden vor der öffentlichen Veröffentlichung ergänzt.
        </p>
      </section>
    </div>
  </main>
</template>
