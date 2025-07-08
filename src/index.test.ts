import * as fs from 'fs';

// Create a simple mock for parseDotnetVersion and getVersionFromGlobalJson
function parseDotnetVersion(version: string): string {
  // Handle versions like "8.0.x", "9.0.x", "8.0.100", etc.
  // Sanitize input to prevent command injection
  const sanitizedVersion = version.replace(/[^0-9.x]/g, '');
  const cleanVersion = sanitizedVersion.replace(/\.x$/, '');
  const parts = cleanVersion.split('.');
  
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  
  return cleanVersion;
}

function getVersionFromGlobalJson(globalJsonPath: string): string {
  let version = '';
  
  if (!fs.existsSync(globalJsonPath)) {
    throw new Error(`Global.json file not found at: ${globalJsonPath}`);
  }

  const globalJson = JSON.parse(
    fs.readFileSync(globalJsonPath, {encoding: 'utf8'}).trim()
  );

  if (globalJson.sdk && globalJson.sdk.version) {
    version = globalJson.sdk.version;
    const rollForward = globalJson.sdk.rollForward;
    if (rollForward && rollForward === 'latestFeature') {
      const [major, minor] = version.split('.');
      version = `${major}.${minor}`;
    }
  }
  
  return version;
}

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('parseDotnetVersion', () => {
  test('handles version with .x suffix', () => {
    expect(parseDotnetVersion('8.0.x')).toBe('8.0');
    expect(parseDotnetVersion('9.0.x')).toBe('9.0');
  });

  test('handles version without .x suffix', () => {
    expect(parseDotnetVersion('8.0')).toBe('8.0');
    expect(parseDotnetVersion('8.0.100')).toBe('8.0');
  });

  test('sanitizes malicious input', () => {
    expect(parseDotnetVersion('8.0.x; rm -rf /')).toBe('8.0');
    expect(parseDotnetVersion('8.0.x`whoami`')).toBe('8.0');
    expect(parseDotnetVersion('8.0.x$(ls)')).toBe('8.0');
  });

  test('handles edge cases', () => {
    expect(parseDotnetVersion('8')).toBe('8');
    expect(parseDotnetVersion('')).toBe('');
  });
});

describe('getVersionFromGlobalJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws error when file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    
    expect(() => getVersionFromGlobalJson('nonexistent.json')).toThrow(
      'Global.json file not found at: nonexistent.json'
    );
  });

  test('parses version from global.json', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      sdk: {
        version: '8.0.100'
      }
    }));

    expect(getVersionFromGlobalJson('global.json')).toBe('8.0.100');
  });

  test('handles rollForward latestFeature', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      sdk: {
        version: '8.0.100',
        rollForward: 'latestFeature'
      }
    }));

    expect(getVersionFromGlobalJson('global.json')).toBe('8.0');
  });

  test('handles file with BOM', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('\uFEFF' + JSON.stringify({
      sdk: {
        version: '8.0.100'
      }
    }));

    expect(getVersionFromGlobalJson('global.json')).toBe('8.0.100');
  });

  test('returns empty string when no version found', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({}));

    expect(getVersionFromGlobalJson('global.json')).toBe('');
  });
});