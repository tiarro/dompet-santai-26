<script setup lang="ts">
import { categoryIcons, type CategoryType, type CustomCategory, type SaveCategory } from '~/utils/categories'
const props = defineProps<{ type: CategoryType; save: SaveCategory; ready: boolean }>()
const emit = defineEmits<{ created: [category: CustomCategory]; dirty: [dirty: boolean]; editing: [editing: boolean] }>()
const expanded = ref(false)
const label = ref('')
const icon = ref('category')
const error = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const nameId = useId()
const iconId = useId()
const dirty = computed(() => expanded.value && (!!label.value || icon.value !== 'category'))
watch(dirty, value => emit('dirty', value), { flush: 'sync' })
watch(expanded, value => emit('editing', value), { flush: 'sync' })
function reset() { expanded.value = false; label.value = ''; icon.value = 'category'; error.value = '' }
function open() { reset(); expanded.value = true; nextTick(() => nameInput.value?.focus()) }
function cancel() { reset(); nextTick(() => trigger.value?.focus()) }
function submit() {
  if (!props.ready) return
  error.value = ''
  try {
    const category = props.save({ type: props.type, label: label.value, icon: icon.value })
    reset()
    emit('created', category)
    nextTick(() => trigger.value?.focus())
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Kategori belum tersimpan. Coba lagi.'
    nameInput.value?.focus()
  }
}
watch([label, icon], () => { error.value = '' }, { flush: 'sync' })
watch(() => props.type, reset)
defineExpose({ reset })
</script>

<template>
  <section class="category-creator">
    <button v-if="!expanded" ref="trigger" type="button" class="category-add" :disabled="!ready" @click="open"><span class="material-symbols-outlined" aria-hidden="true">add_circle</span>Tambah Kategori</button>
    <div v-else class="category-fields">
      <h3>Kategori {{ type === 'expense' ? 'pengeluaran' : 'pemasukan' }} baru</h3>
      <div class="category-field"><label :for="nameId">Nama kategori</label><input :id="nameId" ref="nameInput" v-model="label" type="text" maxlength="32" autocomplete="off" placeholder="Contoh: Pendidikan" :aria-invalid="!!error" :aria-describedby="error ? nameId + '-error' : undefined" @keydown.enter.prevent.stop="submit"></div>
      <div class="category-field"><label :for="iconId">Ikon kategori</label><div class="icon-select"><span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span><select :id="iconId" v-model="icon"><option v-for="item in categoryIcons" :key="item.id" :value="item.id">{{ item.label }}</option></select></div></div>
      <p v-if="error" :id="nameId + '-error'" class="category-error" role="alert">{{ error }}</p>
      <div class="category-actions"><button type="button" class="category-cancel" @click="cancel">Batal kategori</button><button type="button" class="category-save" :disabled="!ready" @click="submit">Simpan Kategori</button></div>
    </div>
  </section>
</template>

<style scoped>
.category-creator { margin-top: .8rem; font-size: .8rem; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
.category-add { display: inline-flex; align-items: center; gap: .4rem; min-height: 2.5rem; padding: .4rem .6rem; color: var(--teal); background: transparent; border: 1px dashed var(--line); border-radius: .6rem; font-weight: 800; }
.category-add .material-symbols-outlined { font-size: 1.1rem; }
.category-fields { padding: 1rem; border: 1px solid var(--line); border-radius: .8rem; background: var(--canvas); color: var(--ink); }
h3 { margin: 0 0 1rem; font-size: .85rem; }
.category-field { display: grid; gap: .45rem; margin-top: .8rem; }
label { font-weight: 700; }
input, select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 2.75rem; padding: .65rem .8rem; border: 1px solid var(--line); border-radius: .6rem; color: var(--ink); background: var(--surface); }
.icon-select { display: flex; align-items: center; gap: .65rem; }
.icon-select > span { color: var(--teal); }
.category-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
.category-actions button { min-height: 2.75rem; padding: .6rem .8rem; border-radius: .6rem; font-weight: 700; }
.category-save { background: #006a61; color: white; border: 1px solid #006a61; }
.category-cancel { color: var(--ink); background: var(--surface); border: 1px solid var(--line); }
.category-error { margin: .8rem 0 0; color: var(--danger); line-height: 1.5; }
html.theme-dark .category-add, html.theme-dark .icon-select > span { color: #74d9cb; }
html.theme-dark select { color-scheme: dark; }
</style>
