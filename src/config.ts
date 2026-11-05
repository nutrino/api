import fs from 'fs';
import path from 'path';

export interface IConfigSettings {
  allowedOrigins?: string[];
  dailyNewSyncsLimit?: number;
  db?: {
    authSource?: string;
    connTimeout?: number;
    host?: string;
    name?: string;
    ssl?: boolean;
    useSRV?: boolean;
    username?: string;
    password?: string;
    port?: number;
  };
  location?: string;
  log?: {
    file?: {
      enabled?: boolean;
      level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      path?: string;
      rotatedFilesToKeep?: number;
      rotationPeriod?: string;
    };
    stdout?: {
      enabled?: boolean;
      level?: string;
    };
  };
  maxSyncs?: number;
  maxSyncSize?: number;
  server?: {
    behindProxy?: boolean;
    trustedProxies?: string | string[];
    host?: string;
    https?: {
      certPath?: string;
      enabled?: boolean;
      keyPath?: string;
    };
    port?: number;
    relativePath?: string;
  };
  status?: {
    allowNewSyncs?: boolean;
    message?: string;
    online?: boolean;
  };
  tests?: {
    db?: string;
    port?: number;
  };
  throttle?: {
    maxRequests?: number;
    timeWindow?: number;
  };
  version?: string;
}

let cachedConfig: IConfigSettings;

// JSON settings need a small recursive merge; prototype keys must never be assigned.
const mergeSettings = (defaults: any, overrides: any): any => {
  const result: any = {};
  [defaults, overrides].forEach((settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        return;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = mergeSettings(result[key] || {}, value);
      } else {
        result[key] = Array.isArray(value) ? [...value] : value;
      }
    });
  });
  return result;
};
export const getCachedConfig = (): IConfigSettings => {
  return cachedConfig;
};
export const setCachedConfig = (value: IConfigSettings): void => {
  cachedConfig = value;
};

// Returns combined default and user-specified config settings
export const get = (force?: boolean): IConfigSettings => {
  if (getCachedConfig() && !force) {
    return getCachedConfig();
  }

  // Get full path to config folder
  const pathToConfig = path.join(__dirname, '../config');

  // Get default settings values
  const defaultSettings = getDefaultSettings(pathToConfig);

  // Get user settings values if present
  const userSettings = getUserSettings(pathToConfig);

  // Merge default and user settings
  const settings: any = mergeSettings(defaultSettings, userSettings);

  // Get current version number
  const version = getPackageVersion();

  setCachedConfig({
    ...settings,
    version,
  });

  return getCachedConfig();
};

// Returns default config settings
const getDefaultSettings = (pathToConfig: string): IConfigSettings => {
  const pathToSettings = path.join(pathToConfig, 'settings.default.json');
  return require(pathToSettings);
};

// Returns version number from package.json
export const getPackageVersion = (): string => {
  const packageJson = require('../package.json');
  return packageJson.version;
};

// Returns user-specified config settings
export const getUserSettings = (pathToConfig: string): IConfigSettings => {
  const pathToUserSettings = path.join(pathToConfig, 'settings.json');
  let userSettings: IConfigSettings = {};
  if (fs.existsSync(pathToUserSettings)) {
    userSettings = require(pathToUserSettings);
  }
  return userSettings;
};
