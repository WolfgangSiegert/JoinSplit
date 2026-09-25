<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  index?: number
  size?: 'sm' | 'md' | 'lg'
}>(), {
  index: 0,
  size: 'md',
})

const initial = computed(() => Array.from(props.name.trim())[0]?.toLocaleUpperCase() ?? '?')
const tone = computed(() => String((Math.abs(props.index) % 4)))
</script>

<template>
  <span
    class="participant-avatar"
    :class="{ 'size-9 text-sm': size === 'sm', 'size-14 text-lg': size === 'lg' }"
    :data-tone="tone"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>
