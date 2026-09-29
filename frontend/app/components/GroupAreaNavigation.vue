<script setup lang="ts">
import { GROUP_AREA_PRESENTATION, type GroupArea } from '../domain/group-area'

const props = defineProps<{ groupId: string }>()
const emit = defineEmits<{ areaActivated: [area: GroupArea] }>()
const route = useRoute()
const settingsStore = useSettingsStore()
const { t } = useAppI18n()

const areas = computed(() => settingsStore.groupAreaOrder.map((area) => {
  const presentation = GROUP_AREA_PRESENTATION[area]
  const label = t(`nav.area.${area}`)
  if (area === 'expenses') return { area, ...presentation, label, to: `/groups/${props.groupId}`, current: route.path === `/groups/${props.groupId}` }
  if (area === 'settlement') return { area, ...presentation, label, to: `/groups/${props.groupId}/balances`, current: route.path.startsWith(`/groups/${props.groupId}/balances`) || route.path.startsWith(`/groups/${props.groupId}/settlements`) }
  return { area, ...presentation, label, to: `/groups/${props.groupId}/participants`, current: route.path === `/groups/${props.groupId}/participants` }
}))
</script>

<template>
  <nav class="group-area-navigation mt-6 rounded-2xl bg-white/65 p-1" :aria-label="t('nav.groupAreas')">
    <ul class="grid grid-cols-3 gap-1">
      <li v-for="area in areas" :key="area.to">
        <NuxtLink
          :to="area.to"
          class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-2 text-center text-sm font-bold text-ink-700 transition-colors"
          :class="area.current ? 'bg-brand-50 text-brand-700 shadow-sm' : 'hover:bg-white hover:text-ink-900'"
          :aria-current="area.current ? 'page' : undefined"
          @click="emit('areaActivated', area.area)"
        >
          <AppIcon :name="area.icon" />
          <span>{{ area.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
