<script setup lang="ts">
const props = defineProps<{ id: string; disabled?: boolean; required?: boolean }>()
const model = defineModel<string>({ required: true })
const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
function changeMonth(event: Event) {
  model.value = `${model.value.slice(0, 4)}-${(event.target as HTMLSelectElement).value}`
}
function changeYear(event: Event) {
  const input = event.target as HTMLInputElement
  const year = Number(input.value)
  if (Number.isInteger(year) && year >= 1900 && year <= 9999) model.value = `${year}-${model.value.slice(5, 7)}`
  else input.value = model.value.slice(0, 4)
}
</script>

<template>
  <span class="budget-month-input">
    <select :id="props.id" :value="model.slice(5, 7)" :disabled="disabled" :required="required" @change="changeMonth">
      <option v-for="(name, index) in months" :key="name" :value="String(index + 1).padStart(2, '0')">{{ name }}</option>
    </select>
    <input :id="`${props.id}-year`" aria-label="Tahun anggaran" type="number" min="1900" max="9999" step="1" :value="model.slice(0, 4)" :disabled="disabled" :required="required" @change="changeYear">
  </span>
</template>

<style scoped>
.budget-month-input { display: inline-flex; align-items: center; gap: .5rem; max-width: 100%; }
select, input { min-height: 2.75rem; padding: .65rem; border: 1px solid var(--line); border-radius: .6rem; background: var(--surface); color: var(--ink); font: inherit; }
select { min-width: 0; flex: 1; }
input { width: 6rem; }
</style>
