const path = require("path");

module.exports = {
    entry: "./src/index.ts",
    output: {
        filename: "bundle.js",
        path: path.resolve(__dirname, "res"),
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    mode: "development",
    devServer: {
        static: path.resolve(__dirname, "res"), // Serve files from 'res'
        port: 3000, // Change the port if needed
        open: false, // Open browser automatically
        hot: true, // Enable Hot Module Replacement
        compress: true, // Enable gzip compression
    },    
};
