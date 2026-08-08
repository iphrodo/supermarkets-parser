import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  "stories": [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": "@storybook/vue3-vite",
  async viteFinal(config) {
    config.plugins = config.plugins ?? [];
    config.plugins.push(vue());
    // Nuxt keeps `shared/` out of the app bundle and exposes it as `#shared`,
    // so components reaching it at runtime import through that alias. Storybook
    // runs its own Vite config and knows nothing about Nuxt's aliases.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '#shared': fileURLToPath(new URL('../shared', import.meta.url)),
    };
    return config;
  },
};
export default config;