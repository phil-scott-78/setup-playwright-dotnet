import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as JSON5 from 'json5';
import * as os from 'os';

interface GlobalJson {
  sdk?: {
    version?: string;
    rollForward?: string;
  };
}

export function parseDotnetVersion(version: string): string {
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

export function getVersionFromGlobalJson(globalJsonPath: string): string {
  let version = '';
  
  if (!fs.existsSync(globalJsonPath)) {
    throw new Error(`Global.json file not found at: ${globalJsonPath}`);
  }

  const globalJson: GlobalJson = JSON5.parse(
    // .trim() is necessary to strip BOM https://github.com/nodejs/node/issues/20649
    fs.readFileSync(globalJsonPath, {encoding: 'utf8'}).trim(),
    // is necessary as JSON5 supports wider variety of options for numbers: https://www.npmjs.com/package/json5#numbers
    (key, value) => {
      if (key === 'version' || key === 'rollForward') return String(value);
      return value;
    }
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

function getPlaywrightScriptPath(dotnetVersion: string): string {
  // Try common output directory patterns
  const possiblePaths = [
    `bin/Debug/net${dotnetVersion}/playwright.ps1`,
    `bin/Release/net${dotnetVersion}/playwright.ps1`,
    `bin/Debug/net${dotnetVersion}.0/playwright.ps1`,
    `bin/Release/net${dotnetVersion}.0/playwright.ps1`
  ];

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  }

  // If not found, return the most likely path and let it fail with a helpful error
  return `bin/Debug/net${dotnetVersion}/playwright.ps1`;
}

async function checkPowerShell(): Promise<boolean> {
  try {
    await exec.exec('pwsh', ['--version'], { silent: true });
    return true;
  } catch {
    return false;
  }
}

async function installPowerShell(): Promise<void> {
  const platform = os.platform();
  
  if (platform === 'linux') {
    core.info('Installing PowerShell on Linux...');
    
    // Update package list
    await exec.exec('sudo', ['apt-get', 'update']);
    
    // Install prerequisites
    await exec.exec('sudo', ['apt-get', 'install', '-y', 'wget', 'apt-transport-https', 'software-properties-common']);
    
    // Get Ubuntu version
    let versionId = '';
    try {
      const versionOutput = await exec.getExecOutput('lsb_release', ['-rs']);
      versionId = versionOutput.stdout.trim();
    } catch {
      // Fallback to reading /etc/os-release
      try {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        const versionMatch = osRelease.match(/VERSION_ID="([^"]+)"/);
        if (versionMatch) {
          versionId = versionMatch[1];
        }
      } catch {
        versionId = '20.04'; // Default fallback
      }
    }
    
    core.info(`Detected Ubuntu version: ${versionId}`);
    
    // Download and install Microsoft repository keys
    // Sanitize version ID to prevent command injection
    const sanitizedVersionId = versionId.replace(/[^0-9.]/g, '');
    const debUrl = `https://packages.microsoft.com/config/ubuntu/${sanitizedVersionId}/packages-microsoft-prod.deb`;
    await exec.exec('wget', ['-q', debUrl]);
    await exec.exec('sudo', ['dpkg', '-i', 'packages-microsoft-prod.deb']);
    await exec.exec('rm', ['packages-microsoft-prod.deb']);
    
    // Update package list again
    await exec.exec('sudo', ['apt-get', 'update']);
    
    // Install PowerShell
    await exec.exec('sudo', ['apt-get', 'install', '-y', 'powershell']);
    
    core.info('PowerShell installed successfully!');
  } else if (platform === 'win32') {
    core.info('PowerShell should be available on Windows runners');
  } else if (platform === 'darwin') {
    core.info('Installing PowerShell on macOS...');
    // For macOS, we'd typically use Homebrew
    await exec.exec('brew', ['install', '--cask', 'powershell']);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function run(): Promise<void> {
  try {
    const globalJsonFile = core.getInput('global-json-file') || 'global.json';
    const dotnetVersionInput = core.getInput('dotnet-version');
    const withDeps = core.getInput('with-deps') === 'true';
    const browsers = core.getInput('browsers') || 'all';
    const installPowerShellIfMissing = core.getInput('install-powershell') === 'true';

    // Check if PowerShell is available
    const isPowerShellAvailable = await checkPowerShell();
    
    if (!isPowerShellAvailable) {
      if (installPowerShellIfMissing) {
        core.info('PowerShell not found. Installing PowerShell...');
        await installPowerShell();
        
        // Verify installation
        const isNowAvailable = await checkPowerShell();
        if (!isNowAvailable) {
          throw new Error('Failed to install PowerShell');
        }
      } else {
        throw new Error('PowerShell is required but not found. Set install-powershell to true to auto-install.');
      }
    } else {
      core.info('PowerShell is already available');
    }

    // Determine .NET version - dotnet-version input takes precedence
    let dotnetVersion = '';
    if (dotnetVersionInput) {
      dotnetVersion = parseDotnetVersion(dotnetVersionInput);
      core.info(`Using .NET version from input: ${dotnetVersion}`);
    } else {
      core.info(`Reading .NET version from: ${globalJsonFile}`);
      dotnetVersion = getVersionFromGlobalJson(globalJsonFile);
      if (!dotnetVersion) {
        throw new Error('Unable to determine .NET version from global.json and no dotnet-version provided');
      }
      core.info(`Detected .NET version from global.json: ${dotnetVersion}`);
    }

    const playwrightScriptPath = getPlaywrightScriptPath(dotnetVersion);
    core.info(`Using Playwright script path: ${playwrightScriptPath}`);

    if (!fs.existsSync(playwrightScriptPath)) {
      throw new Error(
        `Playwright script not found at: ${playwrightScriptPath}\n` +
        `Make sure you have built your project first with 'dotnet build'`
      );
    }

    // Build the install command
    const installArgs = ['install'];
    
    if (browsers !== 'all') {
      // Sanitize browser names to prevent command injection
      const sanitizedBrowsers = browsers.replace(/[^a-zA-Z0-9 ]/g, '');
      installArgs.push(...sanitizedBrowsers.split(' ').filter(b => b.length > 0));
    }
    
    if (withDeps) {
      installArgs.push('--with-deps');
    }

    core.info(`Installing Playwright browsers...`);
    core.info(`Command: pwsh ${playwrightScriptPath} ${installArgs.join(' ')}`);

    await exec.exec('pwsh', [playwrightScriptPath, ...installArgs]);

    core.info('Playwright browsers installed successfully!');
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}

run();