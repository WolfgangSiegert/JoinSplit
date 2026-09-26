<script setup lang="ts">
defineProps<{
  name:
    | 'archive'
    | 'arrow-left'
    | 'arrow-right'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'copy'
    | 'database'
    | 'download'
    | 'image'
    | 'info'
    | 'plus'
    | 'pencil'
    | 'receipt'
    | 'refresh'
    | 'rotate-ccw'
    | 'save'
    | 'scale'
    | 'settings'
    | 'share'
    | 'trash'
    | 'users'
    | 'user-minus'
    | 'wallet'
}>()
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="name === 'arrow-left' ? undefined : true"
    :aria-label="name === 'arrow-left' ? '←' : undefined"
    :role="name === 'arrow-left' ? 'img' : undefined"
    focusable="false"
  >
    <template v-if="name === 'archive'">
      <rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </template>
    <template v-else-if="name === 'arrow-left'">
      <path d="m15 18-6-6 6-6M9 12h10" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m6 9 6 6 6-6" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 18 6-6-6-6" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v7c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12v7c0 1.7 4 3 9 3s9-1.3 9-3v-7" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </template>
    <template v-else-if="name === 'image'">
      <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'pencil'">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </template>
    <template v-else-if="name === 'receipt'">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6M16 12h-6M13 16h-3" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M20 6v6h-6M4 18v-6h6M18.4 9A7 7 0 0 0 6.2 6.2L4 9m16 6-2.2 2.8A7 7 0 0 1 5.6 15" />
    </template>
    <template v-else-if="name === 'rotate-ccw'">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M15.2 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.8Z" /><path d="M17 21v-8H7v8M7 3v5h8" />
    </template>
    <template v-else-if="name === 'scale'">
      <path d="m16 16 3-8 3 8a5 5 0 0 1-6 0ZM2 16l3-8 3 8a5 5 0 0 1-6 0ZM7 21h10M12 3v18M3 7h18" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </template>
    <template v-else-if="name === 'share'">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" />
    </template>
    <template v-else-if="name === 'users'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </template>
    <template v-else-if="name === 'user-minus'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11h6" />
    </template>
    <template v-else-if="name === 'wallet'">
      <path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6" /><path d="M16 13h4" />
    </template>
  </svg>
</template>
