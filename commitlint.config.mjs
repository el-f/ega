export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'chore',
        'refactor',
        'test',
        'types',
        'perf',
        'ci',
        'build',
        'style',
        'revert',
        'audit',
      ],
    ],
    // 100 leaves room for `feat(scope): subject` plus a short verb phrase.
    'header-max-length': [2, 'always', 100],
  },
};
