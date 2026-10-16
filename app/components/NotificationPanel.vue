<script setup lang="ts">
import CardPagination from './CardPagination.vue'
import type { FinanceNotification } from '~/utils/notifications'

const props = defineProps<{ items: FinanceNotification[]; read: string[]; owner: string; loading: boolean; warning: string; storageWarning: string }>()
const emit = defineEmits<{ select: [item: FinanceNotification]; markAll: []; settings: []; refresh: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const filter = ref<'all' | 'unread'>('all')
const openSequence = ref(0)
const unread = computed(() => props.items.filter(item => !props.read.includes(item.readKey)))
const visible = computed(() => filter.value === 'unread' ? unread.value : props.items)
let previousOverflow: string | undefined
let opener: HTMLElement | null = null
function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement as HTMLElement
  filter.value = 'all'
  openSequence.value++
  previousOverflow = document.body.style.overflow
  dialog.value.showModal()
  document.body.style.overflow = 'hidden'
  nextTick(() => dialog.value?.querySelector('.notification-content')?.scrollTo(0, 0))
}
function close() {
  dialog.value?.close()
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow
    previousOverflow = undefined
    opener?.focus({ preventScroll: true })
  }
}
function select(item: FinanceNotification) { close(); emit('select', item) }
function settings() { close(); emit('settings') }
function dateLabel(value: string) { return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(value + 'T12:00:00')) }
watch(() => props.owner, close)
watch(filter, () => dialog.value?.querySelector('.notification-content')?.scrollTo(0, 0))
onBeforeUnmount(close)
defineExpose({ open, close })
</script>

<template>
  <dialog ref="dialog" class="notification-panel" aria-labelledby="notification-title" @cancel.prevent="close" @close="close" @click="event => { if (event.target === dialog) close() }">
    <header class="notification-header">
      <div class="notification-heading"><span class="notification-emblem material-symbols-outlined" aria-hidden="true">notifications_active</span><div><p class="eyebrow">RUANG PENGINGATMU</p><h2 id="notification-title">Notifikasi <span class="heading-count">{{ items.length }}</span></h2></div><button class="close-button" type="button" aria-label="Tutup notifikasi" autofocus @click="close"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div>
      <p class="notification-subtitle">Hal kecil hari ini, keuangan lebih tenang esok.</p>
      <div class="notification-toolbar"><div class="notification-tabs" role="group" aria-label="Filter notifikasi"><button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">Semua</button><button type="button" :aria-pressed="filter === 'unread'" @click="filter = 'unread'">Belum dibaca <span>{{ unread.length }}</span></button></div><button class="mark-all" type="button" :disabled="!unread.length" @click="emit('markAll')"><span class="material-symbols-outlined" aria-hidden="true">done_all</span>Tandai semua dibaca</button></div>
    </header>
    <div class="notification-content">
      <p v-if="loading" class="panel-status" role="status">Memperbarui pengingat…</p>
      <div v-if="warning" class="panel-warning" role="alert"><span class="material-symbols-outlined" aria-hidden="true">cloud_off</span><div><p>{{ warning }}</p><button type="button" :disabled="loading" @click="emit('refresh')">Coba lagi</button></div></div>
      <p v-if="storageWarning" class="panel-status" role="status">{{ storageWarning }}</p>
      <CardPagination :items="visible" label="Notifikasi" :reset-key="owner + filter + openSequence" v-slot="{ items: entries }">
        <ol v-if="entries.length" class="notification-list">
          <li v-for="item in entries" :key="item.id">
            <button type="button" class="notification-item" :class="[item.tone, { unread: !read.includes(item.readKey) }]" @click="select(item)">
              <span class="notification-icon material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
              <span class="notification-copy"><span class="notification-meta"><span class="notification-label">{{ item.label }}</span><time :datetime="item.date">{{ dateLabel(item.date) }}</time></span><strong>{{ item.title }}<span v-if="!read.includes(item.readKey)" class="unread-dot" role="img" aria-label="Belum dibaca"></span></strong><span class="notification-description">{{ item.description }}</span><span class="notification-action">{{ item.action }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span></span>
            </button>
          </li>
        </ol>
        <div v-else-if="!loading && !warning" class="notification-empty"><span class="empty-orbit"><span class="material-symbols-outlined" aria-hidden="true">{{ filter === 'unread' ? 'done_all' : 'notifications_none' }}</span></span><h3>{{ filter === 'unread' ? 'Semua sudah terbaca' : 'Belum ada pengingat aktif' }}</h3><p>{{ filter === 'unread' ? 'Kamu sudah melihat semua pengingat. Tetap lanjutkan langkah kecilmu.' : 'Pengingat tagihan, anggaran, dan targetmu akan muncul di sini saat waktunya tiba.' }}</p></div>
      </CardPagination>
    </div>
    <footer class="notification-footer"><span><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>Pengingat saat aplikasi dibuka</span><button type="button" @click="settings"><span class="material-symbols-outlined" aria-hidden="true">tune</span>Pengaturan pengingat</button></footer>
  </dialog>
</template>

<style scoped>
.notification-panel { --accent: var(--teal); width: min(35rem, calc(100vw - 2rem)); max-height: min(48rem, 88dvh); margin: auto; padding: 0; overflow: hidden; box-sizing: border-box; border: 1px solid var(--line); border-radius: 1.5rem; background: var(--surface); color: var(--ink); box-shadow: 0 28px 90px rgb(0 0 0 / 28%); }
.notification-panel[open] { display: flex; flex-direction: column; animation: notification-enter .18s ease-out; }
:global(html.theme-dark) .notification-panel { --accent: #74d9cb; }
.notification-panel::backdrop { background: rgb(9 22 19 / 55%); backdrop-filter: blur(5px); }
.notification-panel button { font: inherit; cursor: pointer; color: inherit; }
.notification-panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.notification-panel button:disabled { opacity: .45; cursor: default; }
.notification-header { flex: none; padding: 1.5rem 1.5rem 1rem; border-bottom: 1px solid var(--line); background: radial-gradient(ellipse at 95% 0%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%); }
.notification-heading { display: flex; gap: .85rem; align-items: center; }
.notification-emblem { display: grid; place-items: center; width: 3rem; height: 3rem; flex: none; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); border-radius: 1rem; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); font-size: 1.6rem; transform: rotate(-8deg); }
.eyebrow { margin: 0 0 .3rem; font-size: .6rem; font-weight: 700; letter-spacing: .14em; color: var(--accent); }
h2 { display: flex; align-items: center; gap: .6rem; margin: 0; font-size: 1.35rem; }
.heading-count { padding: .15rem .45rem; border-radius: .5rem; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); color: var(--accent); font-size: .75rem; }
.close-button { display: grid; place-items: center; min-width: 2.75rem; min-height: 2.75rem; margin-left: auto; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); }
.notification-subtitle { margin: 1rem 0; color: var(--muted); font-size: .8rem; line-height: 1.6; }
.notification-toolbar { display: flex; justify-content: space-between; gap: .6rem; align-items: center; flex-wrap: wrap; }
.notification-tabs { display: flex; padding: .2rem; gap: .2rem; border: 1px solid var(--line); border-radius: .8rem; }
.notification-tabs button { min-height: 2.5rem; padding: .4rem .65rem; border: 0; border-radius: .6rem; background: transparent; font-size: .75rem; }
.notification-tabs button[aria-pressed=true] { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent); font-weight: 700; }
.notification-tabs span { margin-left: .25rem; font-size: .7rem; }
.mark-all { display: flex; align-items: center; gap: .25rem; padding: .3rem 0; min-height: 2.75rem; border: 0; background: transparent; font-size: .7rem !important; color: var(--accent) !important; }
.mark-all .material-symbols-outlined { font-size: 1rem; }
.notification-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 1rem; scrollbar-gutter: stable; }
.notification-list { display: grid; gap: .6rem; padding: 0; margin: 0; list-style: none; }
.notification-item { --item-color: var(--accent); display: flex; align-items: flex-start; gap: .8rem; width: 100%; padding: 1rem; text-align: left; border: 1px solid var(--line); border-radius: 1rem; background: var(--surface); transition: border-color .15s, background .15s; }
.notification-item.danger { --item-color: var(--danger, #c54b4b); }
.notification-item.warning { --item-color: var(--warning, #b87821); }
.notification-item.unread { background: color-mix(in srgb, var(--item-color) 5%, var(--surface)); border-color: color-mix(in srgb, var(--item-color) 24%, var(--line)); }
.notification-item:hover { border-color: var(--item-color); background: color-mix(in srgb, var(--item-color) 9%, var(--surface)); }
.notification-icon { display: grid; place-items: center; flex: none; width: 2.6rem; height: 2.6rem; border-radius: .85rem; background: color-mix(in srgb, var(--item-color) 12%, var(--surface)); color: var(--item-color); font-size: 1.3rem; }
.notification-copy { display: grid; gap: .5rem; min-width: 0; flex: 1; }
.notification-meta { display: flex; align-items: center; justify-content: space-between; gap: .4rem; flex-wrap: wrap; font-size: .65rem; }
.notification-label { color: var(--item-color); font-weight: 700; }
time { color: var(--muted); }
.notification-copy strong { font-size: .87rem; line-height: 1.5; overflow-wrap: anywhere; }
.unread-dot { display: inline-block; width: .4rem; height: .4rem; margin: 0 0 .15rem .5rem; border-radius: 50%; background: var(--accent); }
.notification-description { font-size: .76rem; color: var(--muted); line-height: 1.65; overflow-wrap: anywhere; }
.notification-action { display: flex; gap: .25rem; align-items: center; font-size: .72rem; font-weight: 700; color: var(--accent); }
.notification-action .material-symbols-outlined { font-size: .95rem; }
.notification-footer { flex: none; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .5rem; border-top: 1px solid var(--line); padding: .75rem 1.5rem; }
.notification-footer > span, .notification-footer button { display: flex; align-items: center; gap: .35rem; font-size: .65rem; }
.notification-footer > span { color: var(--muted); }
.notification-footer .material-symbols-outlined { font-size: 1rem; }
.notification-footer button { min-height: 2.75rem; background: transparent; border: 0; padding: 0; color: var(--accent); font-weight: 700; }
.notification-empty { text-align: center; padding: 2rem 1rem; }
.empty-orbit { display: grid; place-items: center; width: 5rem; height: 5rem; margin: 0 auto 1.25rem; border-radius: 50%; border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--line)); background: color-mix(in srgb, var(--accent) 7%, var(--surface)); color: var(--accent); }
.empty-orbit .material-symbols-outlined { font-size: 2rem; }
.notification-empty h3 { font-size: 1rem; margin: 0 0 .6rem; }
.notification-empty p { max-width: 18rem; margin: auto; color: var(--muted); font-size: .8rem; line-height: 1.7; }
.panel-status { margin: .5rem; color: var(--muted); font-size: .75rem; }
.panel-warning { display: flex; gap: .6rem; padding: .9rem; margin-bottom: .8rem; border: 1px solid var(--line); border-radius: .75rem; font-size: .8rem; }
.panel-warning p { margin: 0 0 .5rem; line-height: 1.5; }
.panel-warning button { border: 0; background: transparent; color: var(--accent); padding: .5rem 0; min-height: 2.75rem; }
@keyframes notification-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 600px) { .notification-panel { width: 100%; max-width: 100%; max-height: 94dvh; margin: auto 0 0; border-bottom: 0; border-radius: 1.5rem 1.5rem 0 0; } .notification-header { padding: 1.2rem 1rem .75rem; } .notification-content { padding: .75rem; } .notification-footer { padding: .5rem 1rem max(.5rem, env(safe-area-inset-bottom)); } .notification-item { padding: .85rem; gap: .65rem; } }
@media (prefers-reduced-motion: reduce) { .notification-panel[open] { animation: none; } .notification-item { transition: none; } }
</style>
