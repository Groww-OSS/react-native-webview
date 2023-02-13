import { windowsAppDriverCapabilities } from 'selenium-appium'

const { platform } = require('./jest.setup.windows');

switch (platform) {
    default:
        throw "Unknown platform: " + platform;
}
