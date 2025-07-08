# Setup Playwright.NET Action

A GitHub Action that automatically installs Playwright browsers and dependencies for .NET projects.

## Features

- Installs Playwright browsers and system dependencies
- Automatically detects .NET version from `global.json`
- Configurable browser selection
- Automatically installs PowerShell if not available

## Usage

### Basic Usage

```yaml
- name: Install Playwright.NET
  uses: your-username/setup-playwright-dotnet@v1
  with:
    dotnet-version: 9.0.x
```

### With global.json

```yaml
- name: Install Playwright.NET
  uses: your-username/setup-playwright-dotnet@v1
  with:
    global-json-file: global.json
```

### Advanced Usage

```yaml
```yaml
- name: Install Playwright.NET
  uses: your-username/setup-playwright-dotnet@v1
  with:
    dotnet-version: 9.0.x
    with-deps: true
    browsers: 'chromium firefox'
    install-powershell: true
```
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `global-json-file` | Path to global.json file to determine .NET version | No | `global.json` |
| `dotnet-version` | .NET version to use (e.g., "8.0.x", "9.0.x"). Takes precedence over global.json | No | - |
| `with-deps` | Install system dependencies along with browsers | No | `true` |
| `browsers` | Browsers to install (e.g., "chromium firefox webkit" or "all") | No | `all` |
| `install-powershell` | Automatically install PowerShell if not found | No | `true` |

## Complete Workflow Example

```yaml
name: Playwright Tests
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup dotnet
      uses: actions/setup-dotnet@v4
      with:
        dotnet-version: 8.0.x
    
    - name: Build & Install
      run: dotnet build
    
    - name: Install Playwright.NET
      uses: your-username/setup-playwright-dotnet@v1
      with:
        global-json-file: global.json
    
    - name: Run Playwright tests
      run: dotnet test
```

## How It Works

1. **Checks PowerShell**: Verifies if PowerShell is available and installs it if needed
2. **Reads global.json**: The action parses your `global.json` file to determine the .NET version
3. **Locates playwright.ps1**: Based on the .NET version, it constructs the path to the Playwright PowerShell script
4. **Installs browsers**: Executes the script to install the specified browsers and dependencies

## Supported .NET Versions

This action supports all .NET versions that Playwright.NET supports. The action will look for the playwright.ps1 script in these locations:

- `bin/Debug/net{version}/playwright.ps1`
- `bin/Release/net{version}/playwright.ps1`
- `bin/Debug/net{version}.0/playwright.ps1`
- `bin/Release/net{version}.0/playwright.ps1`

## Prerequisites

- Your project must be built (`dotnet build`) before using this action
- Your project must have Playwright.NET installed as a dependency
- A `global.json` file must exist in your repository root (or specified path)

## Error Handling

The action provides clear error messages for common issues:

- Missing `global.json` file
- Unable to determine .NET version
- Playwright script not found (usually means project wasn't built)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to compile TypeScript and bundle the action
5. Commit the changes including the `dist/` directory
6. Create a pull request

## Development

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## License

MIT License - see LICENSE file for details