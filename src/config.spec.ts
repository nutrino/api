import 'jest';
import fs from 'fs';
import path from 'path';
import * as Config from './config';

describe('Config', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('get: should return cached config if force set to false', () => {
    const cachedConfigTest = {};
    const getCachedConfigMock = jest.spyOn(Config, 'getCachedConfig').mockReturnValue(cachedConfigTest);
    const getUserSettingsSpy = jest.spyOn(Config, 'getUserSettings');
    const config = Config.get(false);
    expect(getCachedConfigMock).toHaveBeenCalled();
    expect(config).toBe(cachedConfigTest);
    expect(getUserSettingsSpy).not.toHaveBeenCalled();
  });

  it('get: should return default settings values when no user settings provided', () => {
    jest.spyOn(Config, 'getUserSettings').mockImplementation(() => {
      return {};
    });
    const maxSyncs = Config.get(true).maxSyncs;
    expect(maxSyncs).toBe(5242);
  });

  it('get: should return user settings values when user settings provided', () => {
    const maxSyncsTestVal = 9999;
    jest.spyOn(Config, 'getUserSettings').mockReturnValue({
      maxSyncs: maxSyncsTestVal,
    });
    const maxSyncs = Config.get(true).maxSyncs;
    expect(maxSyncs).toStrictEqual(maxSyncsTestVal);
  });

  it('get: should return package version number', () => {
    const versionTestVal = '1.1.1';
    jest.spyOn(Config, 'getPackageVersion').mockReturnValue(versionTestVal);
    const version = Config.get(true).version;
    expect(version).toStrictEqual(versionTestVal);
  });

  it('get: ignores prototype keys at every level while retaining nested defaults', () => {
    jest
      .spyOn(Config, 'getUserSettings')
      .mockReturnValue(
        JSON.parse('{"__proto__":{"polluted":true},"server":{"__proto__":{"polluted":true},"port":9000}}')
      );
    const config: any = Config.get(true);
    expect(config.polluted).toBeUndefined();
    expect(config.server.polluted).toBeUndefined();
    expect(config.server.port).toBe(9000);
    expect(config.server.host).toBe('127.0.0.1');
    expect(({} as any).polluted).toBeUndefined();
  });

  it('get: does not mutate cached default settings when a returned config is modified', () => {
    jest.spyOn(Config, 'getUserSettings').mockReturnValue({});
    const config = Config.get(true);
    config.server.host = 'changed';
    config.allowedOrigins.push('https://example.test');
    const nextConfig = Config.get(true);
    expect(nextConfig.server.host).toBe('127.0.0.1');
    expect(nextConfig.allowedOrigins).toEqual([]);
  });

  it('getUserSettings: should return an empty object if no user settings exist', () => {
    jest.spyOn(path, 'join').mockReturnValue(null);
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const userSettings = Config.getUserSettings(null);
    expect(userSettings).toStrictEqual({});
  });
});
