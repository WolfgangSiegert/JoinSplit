<script setup lang="ts">
const props = defineProps<{ groupId: string }>()
const route = useRoute()

const areas = computed(() => [
  { label: 'Ausgaben', to: `/groups/${props.groupId}`, current: route.path === `/groups/${props.groupId}` },
  { label: 'Salden', to: `/groups/${props.groupId}/balances`, current: route.path.startsWith(`/groups/${props.groupId}/balances`) },
  { label: 'Teilnehmer verwalten', to: `/groups/${props.groupId}/participants`, current: route.path === `/groups/${props.groupId}/participants` },
])
</script>

<template>
  <nav class="mt-6" aria-label="Gruppenbereiche">
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <li v-for="area in areas" :key="area.to">
        <NuxtLink
          :to="area.to"
          class="secondary-button h-full w-full text-center"
          :class="area.current ? 'bg-brand-50' : ''"
          :aria-current="area.current ? 'page' : undefined"
        >
          {{ area.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
