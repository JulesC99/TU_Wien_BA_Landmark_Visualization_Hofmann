// webpack.config.js
const path = require('path');

module.exports = {
  entry: './src/main.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'public', 'dist'),
    publicPath: '/dist/'                  // webpack bundles under /dist/
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  devServer: {
    static: [
      // 1) Serve quadtree JSON from public/data at /data/
      {
        directory: path.resolve(__dirname, 'public', 'data'),
        publicPath: '/data'
      },
      // 2) Serve other static assets (index.html, CSS) from public/
      {
        directory: path.resolve(__dirname, 'public'),
        publicPath: '/'
      }
    ],
    devMiddleware: {
      publicPath: '/dist/'                   // serve webpack bundles from memory at /dist/
    },
    // SPA fallback: requests without file extensions go to index.html
    historyApiFallback: {
      disableDotRule: true
    },
    port: 3000,
    open: true,
    hot: true
  },
  mode: 'development',
  devtool: 'source-map'
};
