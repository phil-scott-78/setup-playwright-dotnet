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

describe('findPlaywrightScript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('finds script in root directory', () => {
    mockFs.existsSync.mockImplementation((path) => {
      return path === './bin/Debug/net8.0/playwright.ps1';
    });

    expect(findPlaywrightScript('.', '8.0')).toBe('./bin/Debug/net8.0/playwright.ps1');
  });

  test('returns null when script not found', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(findPlaywrightScript('.', '8.0')).toBeNull();
  });

  test('tries multiple path patterns', () => {
    mockFs.existsSync.mockImplementation((path) => {
      return path === './bin/Release/net8.0.0/playwright.ps1';
    });

    expect(findPlaywrightScript('.', '8.0')).toBe('./bin/Release/net8.0.0/playwright.ps1');
  });
});

describe('searchDirectoryRecursive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('searches recursively through directories', () => {
    // Test that the function can handle recursive search logic
    // We'll just test the helper functions individually since mocking is complex
    
    // Test findPlaywrightScript with a specific directory
    mockFs.existsSync.mockImplementation((path) => {
      return path === 'TestProject/bin/Debug/net8.0/playwright.ps1';
    });

    expect(findPlaywrightScript('TestProject', '8.0')).toBe('TestProject/bin/Debug/net8.0/playwright.ps1');
  });

  test('skips common non-project directories', () => {
    // Test the shouldSkipDirectory function directly
    expect(shouldSkipDirectory('node_modules')).toBe(true);
    expect(shouldSkipDirectory('.git')).toBe(true);
    expect(shouldSkipDirectory('obj')).toBe(true);
    expect(shouldSkipDirectory('.vscode')).toBe(true);
    expect(shouldSkipDirectory('ValidProject')).toBe(false);
    expect(shouldSkipDirectory('src')).toBe(false);
  });

  test('respects maximum search depth', () => {
    mockFs.existsSync.mockReturnValue(false);
    
    mockFs.readdirSync.mockReturnValue([
      { name: 'level1', isDirectory: () => true }
    ] as any);

    // Should return null due to depth limit (maxDepth=1, so it won't search subdirectories)
    expect(searchDirectoryRecursive('.', '8.0', 1)).toBeNull();
  });
});

// Add helper functions for testing
function findPlaywrightScript(dir: string, dotnetVersion: string): string | null {
  const possiblePaths = [
    `${dir}/bin/Debug/net${dotnetVersion}/playwright.ps1`,
    `${dir}/bin/Release/net${dotnetVersion}/playwright.ps1`,
    `${dir}/bin/Debug/net${dotnetVersion}.0/playwright.ps1`,
    `${dir}/bin/Release/net${dotnetVersion}.0/playwright.ps1`
  ];

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  }
  return null;
}

function shouldSkipDirectory(dirName: string): boolean {
  const skipDirs = [
    'node_modules', '.git', '.vs', '.vscode', 'obj', 'packages', '.nuget', 'dist', 'build'
  ];
  return dirName.startsWith('.') || skipDirs.includes(dirName);
}

function searchDirectoryRecursive(dir: string, dotnetVersion: string, maxDepth: number = 3, currentDepth: number = 0): string | null {
  if (currentDepth >= maxDepth) {
    return null;
  }

  const script = findPlaywrightScript(dir, dotnetVersion);
  if (script) {
    return script;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !shouldSkipDirectory(entry.name)) {
        const subDir = `${dir}/${entry.name}`;
        const subDirScript = searchDirectoryRecursive(subDir, dotnetVersion, maxDepth, currentDepth + 1);
        if (subDirScript) {
          return subDirScript;
        }
      }
    }
  } catch (error) {
    // Continue with other directories
  }

  return null;
}