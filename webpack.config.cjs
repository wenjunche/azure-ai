const path = require("path");
const webpack = require('webpack');
const dotenv = require('dotenv').config(); 
    
module.exports = {
    entry: {
        index: "./src/index.ts",
        inference: "./src/inference.ts",
        // aiprojects: "./src/aiprojects.ts",
        openai: "./src/openai.ts",
        vercel: "./src/vercel.ts"
    },
    output: {
        filename: "[name].bundle.js",
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
    plugins: [
        new webpack.DefinePlugin({
            apiKey: JSON.stringify(process.env.apiKey),
            endpoint: JSON.stringify(process.env.endpoint),
            apiKeyWest: JSON.stringify(process.env.apiKeyWest),
            endpointWest: JSON.stringify(process.env.endpointWest),
            openaiApiKey: JSON.stringify(process.env.openaiApiKey),
            imageBase64: JSON.stringify(process.env.imageBase64),
            longText: JSON.stringify(process.env.longText),
            zendeskDomain: JSON.stringify(process.env.zendeskDomain),
            zendeskEmail: JSON.stringify(process.env.zendeskEmail),
            zendeskAPIKey: JSON.stringify(process.env.zendeskAPIKey),
        })
    ],
    mode: "development",
    devtool: "source-map",
    devServer: {
        static: path.resolve(__dirname, "res"), // Serve files from 'res'
        port: 3000, // Change the port if needed
        open: false, // Open browser automatically
        hot: true, // Enable Hot Module Replacement
        compress: false, // Enable gzip compression
    },    
};
