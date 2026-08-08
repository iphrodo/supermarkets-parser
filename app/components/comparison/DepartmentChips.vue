<script setup lang="ts">
import { computed } from 'vue'
import {
  CATCH_ALL_DEPARTMENT,
  DEPARTMENT_ICONS,
  DEPARTMENT_LABELS_BG,
  DEPARTMENT_ORDER,
  type DepartmentId,
} from '#shared/types/department'

const props = defineProps<{
  /** Counts over the *search-filtered* set, so a chip never advertises a number the current search would reduce to zero. */
  counts: Partial<Record<DepartmentId, number>>
  total: number
  selected: DepartmentId | null
}>()

const emit = defineEmits<{ select: [DepartmentId | null] }>()

const chips = computed(() =>
  DEPARTMENT_ORDER.map((id) => ({
    id,
    label: DEPARTMENT_LABELS_BG[id],
    icon: DEPARTMENT_ICONS[id],
    count: props.counts[id] ?? 0,
  })).filter((chip) => chip.count > 0),
)

/**
 * With no departments in the data every group is coerced to the catch-all, and
 * a bar holding one "Други" chip is not navigation. So the bar appears only
 * once at least one *named* department is represented — which is also how the
 * page degrades cleanly before `add-product-departments` is deployed.
 */
const visible = computed(() => chips.value.some((chip) => chip.id !== CATCH_ALL_DEPARTMENT))
</script>

<template>
  <div v-if="visible" class="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <div class="flex snap-x gap-2 pb-1">
      <button
        type="button"
        class="snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition"
        :class="
          selected === null
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
        "
        :aria-pressed="selected === null"
        @click="emit('select', null)"
      >
        Всички ({{ total }})
      </button>

      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition"
        :class="
          selected === chip.id
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
        "
        :aria-pressed="selected === chip.id"
        @click="emit('select', chip.id)"
      >
        <span aria-hidden="true">{{ chip.icon }}</span>
        {{ chip.label }} ({{ chip.count }})
      </button>
    </div>
  </div>
</template>
