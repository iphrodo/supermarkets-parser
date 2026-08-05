<template>
  <div>
    <NuxtRouteAnnouncer />
    <nav class="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div class="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm font-medium">
        <NuxtLink
          to="/"
          class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          active-class="text-blue-600 dark:text-blue-400"
        >
          Compare prices
        </NuxtLink>
        <NuxtLink
          to="/deals"
          class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          active-class="text-blue-600 dark:text-blue-400"
        >
          All offers
        </NuxtLink>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>
