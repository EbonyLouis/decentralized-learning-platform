import path from "path";
import webpack from "webpack";
import process from "process";
import HtmlWebpackPlugin from "html-webpack-plugin";

const config = {
  entry: "./src/index.js", // Your main JS file
  output: {
    filename: "bundle.js", // The output bundle
    path: path.resolve(process.cwd(), "dist"), // Output directory
    publicPath: "/", // Needed for webpack-dev-server
  },
  mode: "development", // Use 'production' for production builds
  devServer: {
    static: {
      directory: path.join(process.cwd()),
    },
    compress: true,
    port: 9000, // You can choose any port
    open: true, // Opens the browser after server had been started
    historyApiFallback: true, // For single-page applications
    hot: false,
  },
  resolve: {
    fallback: {
      stream: path.resolve(process.cwd(), "node_modules/stream-browserify"),
      crypto: path.resolve(process.cwd(), "node_modules/crypto-browserify"),
      // Add other polyfills as needed
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser.js",
    }),
    new webpack.NormalModuleReplacementPlugin(/node:crypto/, (resource) => {
      resource.request = resource.request.replace(/^node:/, "");
    }),
    new HtmlWebpackPlugin({
      template: "index.html",
    }),
  ],
  // Add other configurations like loaders here
};

export default config;
