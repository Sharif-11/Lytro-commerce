// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Module boundaries (ENGINEERING-STANDARDS §1, PHASE-1-PLAN "packages and layers"). Each rule names the
// structure it protects, so a violation explains itself.
const otherModuleRepositories = (own) =>
  ['identity', 'tenancy', 'staff', 'messaging']
    .filter((module) => module !== own)
    .flatMap((module) => [`**/repositories/${module}/**`, `../${module}/**`]);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      '**/routeTree.gen.ts',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // A module's repositories never import another module's repositories. Cross-module work goes through services.
    files: ['packages/db/src/repositories/identity/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: otherModuleRepositories('identity'),
              message: "Use the other module's service, not its repository (ENGINEERING §1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/db/src/repositories/tenancy/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: otherModuleRepositories('tenancy'),
              message: "Use the other module's service, not its repository (ENGINEERING §1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/db/src/repositories/staff/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: otherModuleRepositories('staff'),
              message: "Use the other module's service, not its repository (ENGINEERING §1).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/db/src/repositories/messaging/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: otherModuleRepositories('messaging'),
              message: "Use the other module's service, not its repository (ENGINEERING §1).",
            },
          ],
        },
      ],
    },
  },
  {
    // Services hold business rules and depend on ports. They never touch Drizzle or the database package's values.
    files: ['apps/server/src/**/services/**/*.ts', 'apps/server/src/**/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['drizzle-orm', 'drizzle-orm/*'],
              message: 'Drizzle belongs in packages/db and database/adapters.',
            },
            {
              group: ['@lytronix/db'],
              allowTypeImports: true,
              message: 'Services use the database package only for types (ports and transactions).',
            },
            {
              group: ['**/database/adapters/**', '**/database/database.service'],
              message: 'Depend on the port, not the adapter (PHASE-1-PLAN §3).',
            },
          ],
        },
      ],
    },
  },
  {
    // Controllers stay thin: they never reach storage or messaging directly.
    files: ['apps/server/src/**/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/messaging/**'],
              message: 'Controllers call a service, which sends messages.',
            },
            { group: ['@lytronix/db'], message: 'Controllers never reach the database.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // CODING-CONVENTIONS.md §1: applications never import the database package except through the server.
    files: ['apps/admin/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@lytronix/db', '@lytronix/db/*'],
              message:
                'Applications never import the database package directly (CODING-CONVENTIONS §1).',
            },
          ],
        },
      ],
    },
  },
  {
    // TanStack Router's own documented pattern (`throw redirect(...)`, `throw notFound()`) throws a plain
    // object, not an Error — the library's control-flow mechanism, not a mistake to flag here.
    files: ['apps/admin/src/routes/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/only-throw-error': 'off',
    },
  },
);
