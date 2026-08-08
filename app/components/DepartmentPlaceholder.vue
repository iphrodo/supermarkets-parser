<script setup lang="ts">
/**
 * Stands in wherever an offer has no usable product image, so the image area is
 * never an empty gap or a broken-image icon. It is sized entirely by its
 * container and carries no text, so it cannot overflow a narrow card.
 *
 * Takes a department (and with it a per-department tint and icon) once
 * `add-product-departments` lands; until then every tile is the neutral one.
 */
</script>

<template>
  <div
    class="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
    aria-hidden="true"
  >
    <svg class="h-1/3 max-h-10 w-1/3 max-w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path
        d="M4.5 7.5h15l-1.2 11a2 2 0 0 1-2 1.8H7.7a2 2 0 0 1-2-1.8l-1.2-11Z"
        stroke-linejoin="round"
      />
      <path d="M9 7.5a3 3 0 0 1 6 0" stroke-linecap="round" />
    </svg>
  </div>
</template>
