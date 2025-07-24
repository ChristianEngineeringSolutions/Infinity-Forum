'use strict';

const crypto = require('crypto');

/**
 * Generate separate device and browser fingerprints from request headers
 * This helps detect browser switching on the same device
 */
function generateServerSideFingerprints(req) {
    const deviceComponents = [];
    const browserComponents = [];
    
    // Parse user agent for device/browser info
    const userAgent = req.headers['user-agent'] || '';
    
    // Extract device info (OS, platform)
    const osMatch = userAgent.match(/(Windows|Mac|Linux|Android|iOS)[^;)]*[;)]/i);
    if (osMatch) {
        deviceComponents.push(osMatch[0]);
    }
    
    // Extract browser info
    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)[\/\s](\d+)/i);
    if (browserMatch) {
        browserComponents.push(browserMatch[0]);
    }
    
    // Accept headers (browser-specific)
    if (req.headers['accept']) {
        browserComponents.push(req.headers['accept']);
    }
    
    if (req.headers['accept-language']) {
        // Language is often device-specific
        deviceComponents.push(req.headers['accept-language']);
    }
    
    if (req.headers['accept-encoding']) {
        browserComponents.push(req.headers['accept-encoding']);
    }
    
    // DNT header (browser setting)
    if (req.headers['dnt']) {
        browserComponents.push(req.headers['dnt']);
    }
    
    // Create hashes
    const deviceFingerprint = crypto.createHash('sha256').update(deviceComponents.join('|')).digest('hex');
    const browserFingerprint = crypto.createHash('sha256').update(browserComponents.join('|')).digest('hex');
    
    return {
        deviceFingerprint,
        browserFingerprint,
        combinedFingerprint: crypto.createHash('sha256').update(deviceFingerprint + browserFingerprint).digest('hex')
    };
}

/**
 * Client-side fingerprinting script to be included in pages
 * This generates a more comprehensive fingerprint using browser APIs
 */
const clientSideFingerprintScript = `
<script>
(function() {
    async function generateFingerprints() {
        const deviceComponents = [];
        const browserComponents = [];
        
        // DEVICE-SPECIFIC COMPONENTS
        // Screen properties (device-specific)
        deviceComponents.push(screen.width + 'x' + screen.height);
        deviceComponents.push(screen.colorDepth);
        deviceComponents.push(screen.pixelDepth);
        
        // Hardware concurrency (CPU cores - device-specific)
        deviceComponents.push(navigator.hardwareConcurrency || 'unknown');
        
        // Device memory (device-specific)
        deviceComponents.push(navigator.deviceMemory || 'unknown');
        
        // Platform (device-specific)
        deviceComponents.push(navigator.platform);
        
        // Timezone (device-specific, usually)
        deviceComponents.push(new Date().getTimezoneOffset());
        
        // BROWSER-SPECIFIC COMPONENTS
        // Language (browser setting)
        browserComponents.push(navigator.language || navigator.userLanguage);
        
        // User agent (browser-specific)
        browserComponents.push(navigator.userAgent);
        
        // Canvas fingerprinting (browser rendering)
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Browser fingerprint', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('Browser fingerprint', 4, 17);
            browserComponents.push(canvas.toDataURL());
        } catch (e) {
            browserComponents.push('canvas-blocked');
        }
        
        // WebGL fingerprinting (GPU info - device-specific but accessed through browser)
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    deviceComponents.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                    deviceComponents.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                }
            }
        } catch (e) {
            deviceComponents.push('webgl-blocked');
        }
        
        // Audio fingerprinting (browser-specific implementation)
        try {
            const audioContext = window.AudioContext || window.webkitAudioContext;
            if (audioContext) {
                const context = new audioContext();
                const oscillator = context.createOscillator();
                const analyser = context.createAnalyser();
                const gainNode = context.createGain();
                const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
                
                gainNode.gain.value = 0;
                oscillator.type = 'triangle';
                oscillator.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(gainNode);
                gainNode.connect(context.destination);
                
                oscillator.start(0);
                const audioFingerprint = analyser.frequencyBinCount;
                browserComponents.push(audioFingerprint);
                
                oscillator.stop();
                context.close();
            }
        } catch (e) {
            browserComponents.push('audio-blocked');
        }
        
        // Hash the components separately
        const deviceString = deviceComponents.join('|');
        const browserString = browserComponents.join('|');
        
        const deviceHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceString));
        const browserHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(browserString));
        
        const deviceHashArray = Array.from(new Uint8Array(deviceHash));
        const browserHashArray = Array.from(new Uint8Array(browserHash));
        
        const deviceFingerprint = deviceHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const browserFingerprint = browserHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return {
            deviceFingerprint,
            browserFingerprint,
            combinedFingerprint: await crypto.subtle.digest('SHA-256', 
                new TextEncoder().encode(deviceFingerprint + browserFingerprint))
                .then(hash => Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, '0')).join(''))
        };
    }
    
    // Store fingerprints globally
    window.__fingerprints = null;
    window.getFingerprints = async function() {
        if (!window.__fingerprints) {
            window.__fingerprints = await generateFingerprints();
        }
        return window.__fingerprints;
    };
    
    // Generate fingerprints on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            window.__fingerprints = await generateFingerprints();
        });
    } else {
        window.__fingerprints = await generateFingerprints();
    }
})();
</script>
`;

/**
 * Validate fingerprint format
 */
function isValidFingerprint(fingerprint) {
    // Should be a 64-character hex string (SHA-256)
    return /^[a-f0-9]{64}$/i.test(fingerprint);
}

/**
 * Combine server and client fingerprints for extra uniqueness
 */
function combineFingerprints(serverFingerprint, clientFingerprint) {
    if (!clientFingerprint || !isValidFingerprint(clientFingerprint)) {
        return serverFingerprint;
    }
    
    const combined = serverFingerprint + clientFingerprint;
    return crypto.createHash('sha256').update(combined).digest('hex');
}

module.exports = {
    generateServerSideFingerprints,
    clientSideFingerprintScript,
    isValidFingerprint,
    combineFingerprints
};