import path from "path";
import webpack from "webpack";
import process from "process";
import HtmlWebpackPlugin from "html-webpack-plugin";

const config = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(process.cwd(), "dist"),
    publicPath: "/",
  },
  mode: "development",
  devServer: {
    static: {
      directory: path.join(process.cwd()),
    },
    compress: true,
    port: 9000,
    open: true,
    historyApiFallback: true,
    hot: false,
  },
  resolve: {
    fallback: {
      stream: path.resolve(process.cwd(), "node_modules/stream-browserify"),
      crypto: path.resolve(process.cwd(), "node_modules/crypto-browserify"),
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
};

export default config;
