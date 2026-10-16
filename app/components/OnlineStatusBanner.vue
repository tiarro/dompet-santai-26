<script setup lang="ts">
const { online, error, loading, refresh } = useCloudFinance()
</script>

<template>
  <p v-if="!online" class="offline-banner" role="status">
    <span class="material-symbols-outlined" aria-hidden="true">cloud_off</span>
    Offline · Catatan baru menunggu sinkronisasi.
  </p>
  <p v-else-if="error" class="offline-banner" role="alert">{{ error }} <button type="button" :disabled="loading" @click="refresh">Muat ulang data</button></p>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  z-index: 100;
  top: 0;
  left: 50%;
  display: flex;
  align-items: center;
  gap: .45rem;
  width: max-content;
  max-width: calc(100% - 1rem);
  margin: 0;
  padding: .55rem .8rem;
  border: 1px solid #f3c46b;
  border-top: 0;
  border-radius: 0 0 .7rem .7rem;
  color: #754c00;
  background: #fff4d6;
  box-shadow: 0 4px 20px #00000014;
  font-size: .75rem;
  font-weight: 800;
  transform: translateX(-50%);
}
.offline-banner .material-symbols-outlined { font-size: 1rem; }
</style>

