const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration[]} */
module.exports = [
  // UI (React)
  {
    name: 'ui',
    entry: {
      ui: path.resolve(__dirname, 'src/ui/ui.tsx'),
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@ui': path.resolve(__dirname, 'src/ui'),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webpack.json',
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'manifest.json'),
            to: path.resolve(__dirname, 'dist/manifest.json'),
          },
        ],
      }),
    ],
    optimization: {
      minimize: false,
    },
  },

  // Plugin sandbox (no DOM)
  {
    name: 'plugin',
    dependencies: ['ui'],
    entry: {
      code: path.resolve(__dirname, 'src/plugin/code.ts'),
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@plugin': path.resolve(__dirname, 'src/plugin'),
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.webpack.json',
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.html$/,
          type: 'asset/source',
        },
      ],
    },
    optimization: {
      minimize: false,
    },
  },
];
