import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';

/**
 * Flat config for the whole workspace.
 *
 * The rules that matter most here are the import bans further down: they are
 * what actually enforce the architecture, rather than relying on discipline.
 *  - @sc/shared and the API must never import react-native (shared is consumed
 *    by both surfaces; a stray RN import breaks the API build).
 *  - Raw Text/Pressable outside @sc/ui would bypass the design token system.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,

  // Type-aware linting for the packages and the API, where the stricter preset
  // is worth the slower runs.
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx', 'apps/api/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // The mobile app gets the lighter type-aware preset — strictTypeChecked
  // against React Native's own types produces a lot of noise for little gain.
  {
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // @sc/shared is imported by the NestJS API as well as the app, so it must stay
  // platform-agnostic. Same for the API itself.
  {
    files: ['packages/shared/**/*.ts', 'apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              message:
                'packages/shared and apps/api must stay platform-agnostic — react-native cannot be imported here.',
            },
            {
              name: 'react',
              message: 'packages/shared and apps/api must not depend on React.',
            },
          ],
          patterns: [
            {
              group: ['@sc/ui', '@sc/ui/*'],
              message: '@sc/ui is React Native only and must not be imported by shared or the API.',
            },
          ],
        },
      ],
    },
  },

  // react-native/no-inline-styles + no-color-literals are what actually
  // enforce the token system in @sc/ui and the screens that consume it — a
  // raw hex or an inline style object bypasses @sc/tokens entirely, and
  // without this pair nothing catches that at review time.
  {
    files: ['apps/mobile/**/*.tsx', 'packages/ui/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-native': reactNative,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-native/no-inline-styles': 'error',
      'react-native/no-color-literals': 'error',
      'react-native/no-unused-styles': 'warn',
    },
  },

  // Everything outside the component library must go through @sc/ui, so the
  // design tokens are the only source of typography and colour.
  {
    files: ['apps/mobile/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'Pressable', 'TouchableOpacity', 'TouchableHighlight'],
              message:
                'Use Text / Pressable from @sc/ui — they carry the type scale, pressed states and a11y defaults.',
            },
          ],
          patterns: [
            {
              group: ['@sc/ui/src/*', '@sc/tokens/src/*'],
              message:
                'Import from the package root (@sc/ui, @sc/tokens), not into its source tree.',
            },
          ],
        },
      ],
      // Slot times, expiry and "5 minutes" must never render from a device
      // clock or a locale guess — everything goes through formatInHarare().
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^toLocale(String|DateString|TimeString)$/]',
          message: 'Use formatInHarare() from @sc/shared — never the device locale.',
        },
      ],
    },
  },

  // NestJS's `@Module({...}) export class FooModule {}` — an empty class
  // whose only job is to carry the decorator's metadata — is the framework's
  // standard, correct pattern, not the anti-pattern no-extraneous-class
  // exists to catch (a class used only as a namespace for statics). Scoped
  // to *.module.ts specifically so the rule still catches an accidentally
  // empty class anywhere else in the API.
  {
    files: ['apps/api/**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  prettier,
);
