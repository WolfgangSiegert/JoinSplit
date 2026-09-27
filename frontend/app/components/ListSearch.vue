<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const expanded = ref(false)
const input = ref<HTMLInputElement | null>(null)
const inputId = useId()

async function openSearch(): Promise<void> {
  expanded.value = true
  await nextTick()
  input.value?.focus()
}

function closeSearch(): void {
  emit('update:modelValue', '')
  expanded.value = false
}

function updateSearch(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="list-search" :class="{ 'list-search--expanded': expanded }">
    <button
      v-if="!expanded"
      type="button"
      class="icon-button list-search__trigger"
      :aria-label="label"
      :title="label"
      @click="openSearch"
    >
      <AppIcon name="search" />
    </button>
    <div v-else class="list-search__field">
      <AppIcon name="search" />
      <label :for="inputId" class="sr-only">{{ label }}</label>
      <input
        :id="inputId"
        ref="input"
        type="search"
        :value="props.modelValue"
        :placeholder="label"
        autocomplete="off"
        @input="updateSearch"
        @keydown.esc="closeSearch"
      >
      <button type="button" class="list-search__close" :aria-label="`${label} schließen`" @click="closeSearch">
        <AppIcon name="x" />
      </button>
    </div>
  </div>
</template>
