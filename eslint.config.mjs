import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/test-output',
      '**/.next',
      '**/node_modules',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // apps compose everything
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['*'] },

            // a feature lib may use shared UI / utilities / data / auth,
            // but NEVER another feature lib — features compose only in apps/web
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:util',
                'type:data',
                'type:auth',
                'type:config',
              ],
            },

            {
              sourceTag: 'type:auth',
              onlyDependOnLibsWithTags: [
                'type:data',
                'type:util',
                'type:config',
              ],
            },
            {
              sourceTag: 'type:data',
              onlyDependOnLibsWithTags: ['type:util', 'type:config'],
            },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:util'] },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util', 'type:config'],
            },
            { sourceTag: 'type:config', onlyDependOnLibsWithTags: [] },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
