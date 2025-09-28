# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**This is the SMA Energy Meter adapter** that integrates SMA energy monitoring devices including:
- SMA Energy Meter (SMA-EM 1.0 and newer)
- Sunny Home Manager (SHM 1.0 and 2.0) 
- SMA multicast UDP protocol handling for real-time energy data

## Adapter-Specific Context
- **Adapter Name**: ioBroker.sma-em
- **Primary Function**: Real-time energy monitoring via SMA Energy Meter and Sunny Home Manager through UDP multicast protocol
- **Key Technologies**: UDP multicast (239.12.255.254:9522), SMA EMETER protocol, energy data parsing
- **Target Devices**: SMA Energy Meter, Sunny Home Manager 1.0/2.0, SMA-EM 1.0 (SUSy 270, 501)
- **Data Types**: Active/reactive/apparent power, energy counters, voltage, current, frequency, phase data
- **Configuration**: Multicast settings, network interface selection, configurable update intervals, per-phase details

## SMA Energy Meter Integration Patterns

When working with this adapter, understand these SMA-specific patterns:

### UDP Multicast Protocol
```javascript
// SMA devices broadcast energy data via UDP multicast
const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

socket.bind(9522, () => {
    socket.addMembership('239.12.255.254', selectedNetworkInterface);
    socket.setBroadcast(true);
});

socket.on('message', (msg, rinfo) => {
    // Parse SMA EMETER protocol messages
    // Handle SUSy identification (270, 501, etc.)
});
```

### Energy Data Object Structure
```javascript
// SMA Energy Meter data points follow these patterns:
// - pregard: active power consumption (W)
// - psurplus: active power feed-in (W) 
// - qregard: reactive power consumption (var)
// - qsurplus: reactive power feed-in (var)
// - sregard: apparent power consumption (VA)
// - ssurplus: apparent power feed-in (VA)
// - pregardcounter: energy consumption counter (kWh)
// - psurpluscounter: energy feed-in counter (kWh)
// Phase-specific data available for L1, L2, L3
```

### Configuration Management
```javascript
// Handle configurable update intervals to reduce system load
const config = {
    rtP: 1,        // Real-time update interval (seconds)
    nrtP: 30,      // Non-real-time update interval (seconds)
    L1: true,      // Enable L1 phase details
    L2: true,      // Enable L2 phase details  
    L3: true,      // Enable L3 phase details
    ext: false,    // Extended mode (reactive/apparent power)
    EMIP: '0.0.0.0', // Energy meter IP filter (0.0.0.0 = all)
    OIP: '',       // Own network interface IP selection
};
```

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Check that data points were created
                        const states = await harness.getAllStatesAsync();
                        console.log(`📊 Found ${Object.keys(states).length} total states`);
                        
                        // Filter for adapter-specific states
                        const adapterStates = Object.keys(states)
                            .filter(id => id.startsWith('your-adapter.0.'))
                            .reduce((obj, key) => {
                                obj[key] = states[key];
                                return obj;
                            }, {});

                        console.log(`🎯 Found ${Object.keys(adapterStates).length} adapter states`);
                        
                        // Log some sample states for verification
                        const sampleStates = Object.keys(adapterStates).slice(0, 10);
                        sampleStates.forEach(stateId => {
                            const state = adapterStates[stateId];
                            console.log(`   ${stateId}: ${JSON.stringify(state.val)} (${state.ts})`);
                        });

                        // Basic validation
                        if (Object.keys(adapterStates).length === 0) {
                            return reject(new Error('No adapter states were created - check adapter logs'));
                        }

                        resolve();
                    } catch (error) {
                        console.error('❌ Test failed:', error);
                        reject(error);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

#### SMA Energy Meter Specific Testing
```javascript
// For SMA-EM adapter, test multicast data reception
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('SMA Energy Meter Integration Tests', (getHarness) => {
            it('should receive and parse SMA multicast data', async function () {
                const harness = getHarness();
                
                // Configure for SMA-EM testing
                await harness.changeAdapterConfig('sma-em', {
                    native: {
                        BIP: '239.12.255.254',  // SMA multicast IP
                        BPO: 9522,              // SMA multicast port
                        EMIP: '0.0.0.0',        // Accept all energy meters
                        ext: true,              // Extended mode
                        L1: true, L2: true, L3: true  // All phases
                    }
                });

                await harness.startAdapterAndWait();
                
                // Wait for multicast data reception
                await wait(30000);
                
                // Check for SMA-specific data points
                const connectionState = await harness.states.getStateAsync('sma-em.0.info.connection');
                expect(connectionState?.val).toBe(true);
                
                // Verify energy data points exist
                const pregardState = await harness.states.getStateAsync('sma-em.0.pregard');
                expect(pregardState).toBeDefined();
            }).timeout(60000);
        });
    }
});
```

## JSON Configuration Patterns

### JSON Config Schema
```javascript
// admin/jsonConfig.json structure for SMA-EM settings
{
    "type": "panel",
    "items": {
        "multicast": {
            "type": "panel", 
            "label": "Multicast Settings",
            "items": {
                "BIP": {
                    "type": "text",
                    "label": "Multicast IP",
                    "default": "239.12.255.254"
                },
                "BPO": {
                    "type": "number",
                    "label": "Multicast Port", 
                    "default": 9522
                }
            }
        }
    }
}
```

## Error Handling for Network Communication

### UDP Socket Error Handling
```javascript
// Robust error handling for SMA multicast reception
socket.on('error', (err) => {
    this.log.error(`UDP socket error: ${err.message}`);
    
    // Handle specific network errors
    if (err.code === 'EADDRINUSE') {
        this.log.error('Port already in use - check for other SMA-EM instances');
    } else if (err.code === 'EACCES') {
        this.log.error('Permission denied - check network interface permissions');
    }
    
    // Attempt to recover
    this.reconnectSocket();
});

// Network interface validation
const validateNetworkInterface = (interfaceIP) => {
    const networkInterfaces = require('os').networkInterfaces();
    // Validate selected interface exists and is available
    return Object.values(networkInterfaces)
        .flat()
        .some(iface => iface.address === interfaceIP);
};
```

## ioBroker Development Best Practices

### State Management
- Use `setState()` for all value updates
- Implement proper state acknowledgment handling
- Use appropriate data types (number, string, boolean)
- Set correct state roles (value.power, value.energy, etc.)

### Logging Guidelines
```javascript
// Use appropriate log levels
this.log.debug('Detailed debugging information');
this.log.info('General operational information');  
this.log.warn('Warning conditions');
this.log.error('Error conditions requiring attention');

// For SMA-EM: Log energy values at debug level to avoid spam
this.log.debug(`Energy data: P=${power}W, Q=${reactive}var`);
```

### Configuration Validation
```javascript
// Validate configuration on startup
onReady() {
    // Validate multicast settings
    if (!this.config.BIP || !this.config.BPO) {
        this.log.error('Invalid multicast configuration');
        return;
    }
    
    // Validate network interface if specified
    if (this.config.OIP && !this.validateNetworkInterface(this.config.OIP)) {
        this.log.warn(`Selected network interface ${this.config.OIP} not found`);
    }
}
```

### Resource Cleanup
```javascript
// Proper cleanup in unload()
async unload(callback) {
  try {
    // Close UDP socket
    if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.close();
        this.socket = null;
    }
    
    // Clear timers
    if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = undefined;
    }
    // Close connections, clean up resources
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```