// Karma configuration file

// Async because puppeteer 25 made executablePath() return a promise; Karma
// awaits an async config function, so CHROME_BIN is still set before it
// launches the browser.
module.exports = async (config) => {
  process.env.CHROME_BIN = await require("puppeteer").executablePath()

  config.set({
    basePath: "",
    frameworks: ["jasmine"],
    plugins: [
      require("karma-jasmine"),
      require("karma-chrome-launcher"),
      require("karma-jasmine-html-reporter"),
      require("karma-coverage"),
    ],
    client: {
      jasmine: {
        // you can add configuration options for Jasmine here
      },
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true, // removes the duplicated traces
    },
    coverageReporter: {
      dir: require("node:path").join(__dirname, "./coverage/bible-app"),
      subdir: ".",
      reporters: [{ type: "html" }, { type: "text" }],
    },
    reporters: ["progress", "kjhtml"],
    browsers: ["ChromeHeadlessNoSandbox"],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: "ChromeHeadless",
        flags: ["--no-sandbox"],
      },
    },
    restartOnFileChange: true,
  })
}
