<script setup lang="ts">
const props = defineProps<{ groupId: string }>()
const route = useRoute()

const areas = computed(() => [
  { label: 'Ausgaben', icon: 'receipt' as const, to: `/groups/${props.groupId}`, current: route.path === `/groups/${props.groupId}` },
  { label: 'Salden', icon: 'scale' as const, to: `/groups/${props.groupId}/balances`, current: route.path.startsWith(`/groups/${props.groupId}/balances`) || route.path.startsWith(`/groups/${props.groupId}/settlements`) },
  { label: 'Personen', icon: 'users' as const, to: `/groups/${props.groupId}/participants`, current: route.path === `/groups/${props.groupId}/participants` },
])
</script>

<template>
  <nav class="group-area-navigation mt-6 overflow-x-auto rounded-2xl bg-white/65 p-1" aria-label="Gruppenbereiche">
    <ul class="grid min-w-[20rem] grid-cols-3 gap-1">
      <li v-for="area in areas" :key="area.to">
        <NuxtLink
          :to="area.to"
          class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-2 text-center text-sm font-bold text-ink-700 transition-colors"
          :class="area.current ? 'bg-brand-50 text-brand-700 shadow-sm' : 'hover:bg-white hover:text-ink-900'"
          :aria-current="area.current ? 'page' : undefined"
        >
          <AppIcon :name="area.icon" />
          <span>{{ area.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
