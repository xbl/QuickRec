module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2021: true,
        node: true,
    },
    extends: 'airbnb-base',
    overrides: [
        {
            env: {
                node: true,
            },
            files: [
                '.eslintrc.{js,cjs}',
            ],
            parserOptions: {
                sourceType: 'script',
            },
        },
    ],
    parserOptions: {
        ecmaVersion: 'latest',
    },
    rules: {
        'no-console': 'off',
        indent: ['error', 4],
        semi: ['error', 'always'],
        'indent-legacy': 'off',
    },
};
