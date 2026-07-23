// Tiny prefixed logger so extension logs are easy to spot and grep.
import { APP_NAME } from "./constants.js";

const prefix = `[${APP_NAME}]`;

export const log = (...args) => console.log(prefix, ...args);
export const warn = (...args) => console.warn(prefix, ...args);
export const error = (...args) => console.error(prefix, ...args);
