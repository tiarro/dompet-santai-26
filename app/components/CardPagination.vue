<script setup lang="ts" generic="T">
const props = defineProps<{ items: readonly T[]; label: string; resetKey?: string }>()
const page = ref(1)
const pageSize = 5
const pages = computed(() => Math.max(1, Math.ceil(props.items.length / pageSize)))
const currentPage = computed(() => Math.min(page.value, pages.value))
const start = computed(() => (currentPage.value - 1) * pageSize)
const visible = computed(() => props.items.slice(start.value, start.value + pageSize))
watch(pages, count => { page.value = Math.min(page.value, count) })
watch(() => props.resetKey, () => { page.value = 1 })
</script>

<template>
  <div class="paginated-card">
    <slot :items="visible" />
    <nav v-if="items.length > pageSize" class="card-pagination" :aria-label="`Halaman ${label}`">
      <span role="status">{{ start + 1 }}–{{ Math.min(start + pageSize, items.length) }} dari {{ items.length }}</span>
      <div class="page-buttons">
        <button type="button" :disabled="currentPage === 1" :aria-label="`Halaman sebelumnya ${label}`" @click="page = currentPage - 1">Sebelumnya</button>
        <span>{{ currentPage }} / {{ pages }}</span>
        <button type="button" :disabled="currentPage === pages" :aria-label="`Halaman berikutnya ${label}`" @click="page = currentPage + 1">Berikutnya</button>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.paginated-card { min-width: 0; }
.card-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; margin-top: var(--home-space, 1rem); padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .75rem; }
.page-buttons { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
button { min-height: 2.75rem; padding: .5rem .65rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
</style>
