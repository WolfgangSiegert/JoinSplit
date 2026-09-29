<script setup lang="ts">
const { t } = useAppI18n()
</script>

<template>
  <aside class="card border-amber-300 bg-amber-50 p-5" aria-labelledby="public-demo-notice-title">
    <h2 id="public-demo-notice-title" class="text-lg font-semibold text-amber-950">
      {{ t('demo.notice.title') }}
    </h2>
    <p class="mt-2 text-amber-950">
      {{ t('demo.notice.copy') }}
    </p>
    <NuxtLink to="/demo" class="secondary-link mt-3 -ml-4">
      <AppIcon name="info" />
      {{ t('demo.notice.link') }}
    </NuxtLink>
  </aside>
</template>
