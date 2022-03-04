const path = require('path');

module.exports = {
    parser: 'babel-eslint',
    extends: ['airbnb'],
    env: {
        node: true,
        browser: true,
        es6: true,
        jest: true,
        mocha: true
    },
    parserOptions: {
        ecmaFeatures: {
            experimentalObjectRestSpread: true
        }
    },
    plugins: ['jest', 'detox', 'mocha'],
    rules: {
        'arrow-body-style': ['warn', 'as-needed'],
        'import/no-cycle': ['warn'],
        camelcase: 'off',
        'class-methods-use-this': 'off',
        'consistent-return': 0,
        indent: ['error', 4, { SwitchCase: 1 }],
        'new-cap': ['error', { capIsNew: false }],
        'no-duplicate-imports': 'off',
        'no-param-reassign': [
            'error',
            { ignorePropertyModificationsFor: ['el', 'ref', 'event'] }
        ],
        'no-plusplus': 'off',
        'no-shadow': [
            'error',
            { builtinGlobals: false, hoist: 'functions', allow: ['describe'] }
        ],
        'no-use-before-define': 0,
        'no-unused-expressions': ['error', { allowShortCircuit: true }],
        'nonblock-statement-body-position': 0,
        'react/jsx-filename-extension': ['error', { extensions: ['.js'] }],
        'react/jsx-indent': ['error', 4],
        'react/jsx-indent-props': ['error', 4],
        'react/require-extension': 'off',
        'react/sort-comp': [
            'error',
            {
                order: [
                    'type-annotations',
                    'static-methods',
                    'lifecycle',
                    '/^on.+$/',
                    '/^(get|set)(?!(InitialState$|DefaultProps$|ChildContext$)).+$/',
                    'everything-else',
                    '/^render.+$/',
                    'render'
                ]
            }
        ],
        'object-curly-newline': [
            'error',
            {
                ObjectExpression: {
                    minProperties: 6,
                    multiline: true,
                    consistent: true
                },
                ObjectPattern: {
                    minProperties: 6,
                    multiline: true,
                    consistent: true
                }
            }
        ],
        'import/prefer-default-export': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-duplicates': 'error',
        'import/no-named-as-default': 'off',

        'jsx-a11y/no-static-element-interactions': 'off',
        'jsx-a11y/no-noninteractive-tabindex': 'off',
        'jsx-a11y/media-has-caption': 'off',
        'jsx-a11y/mouse-events-have-key-events': 'off',

        'comma-dangle': ['error', 'only-multiline'],
        'no-underscore-dangle': 'off',
        'mocha/no-exclusive-tests': 'error',
        'prefer-destructuring': ['error', { object: true, array: false }],
        'prefer-promise-reject-errors': 'off',
        'max-len': [
            'warn',
            { code: 120, ignoreComments: true, ignoreStrings: true }
        ],
        'linebreak-style': ['error', process.platform === 'win32' ? 'windows' : 'unix']
    }
};
