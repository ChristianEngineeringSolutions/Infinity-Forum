'use strict';

(function() {
    // View tracking module
    const ViewTracker = {
        // Generate separate device and browser fingerprints
        async generateFingerprints() {
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
                browserFingerprint
            };
        },

        // Page view tracking state
        pageViewState: {
            startTime: null,
            passageId: null,
            hasTracked: false,
            trackingTimer: null
        },

        // Initialize page view tracking
        initPageViewTracking(passageId) {
            this.pageViewState.startTime = Date.now();
            this.pageViewState.passageId = passageId;
            this.pageViewState.hasTracked = false;
            
            // Clear any existing timer
            if (this.pageViewState.trackingTimer) {
                clearTimeout(this.pageViewState.trackingTimer);
            }
            
            // Set timer to track after 5 seconds
            this.pageViewState.trackingTimer = setTimeout(() => {
                if (!this.pageViewState.hasTracked) {
                    this.trackPageView(passageId);
                }
            }, 5000);
            
            // Track before unload if user stayed for 5+ seconds
            window.addEventListener('beforeunload', () => {
                const timeOnPage = Date.now() - this.pageViewState.startTime;
                if (timeOnPage >= 5000 && !this.pageViewState.hasTracked) {
                    this.trackPageView(passageId);
                }
            });
        },

        // Track page view
        async trackPageView(passageId) {
            try {
                if (this.pageViewState.hasTracked) return;
                
                const timeOnPage = Date.now() - this.pageViewState.startTime;
                if (timeOnPage < 5000) return;
                
                this.pageViewState.hasTracked = true;
                const fingerprints = await this.generateFingerprints();
                
                const response = await fetch('/api/view/page', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        passageId: passageId,
                        deviceFingerprint: fingerprints.deviceFingerprint,
                        browserFingerprint: fingerprints.browserFingerprint,
                        timeOnPage: timeOnPage,
                        referrer: document.referrer,
                        timestamp: Date.now()
                    })
                });
                
                const result = await response.json();
                console.log('Page view tracked:', result);
                return result;
            } catch (error) {
                console.error('Error tracking page view:', error);
                return { success: false, error: error.message };
            }
        },

        // Video tracking state
        videoStates: {},

        // Initialize video tracking
        initVideoTracking(videoElement, passageId, videoIndex) {
            const videoId = `${passageId}-${videoIndex}`;
            
            // Initialize state
            this.videoStates[videoId] = {
                startTime: null,
                totalWatchTime: 0,
                lastUpdateTime: null,
                hasTracked: false,
                isPlaying: false
            };
            
            const state = this.videoStates[videoId];
            
            // Play event
            videoElement.addEventListener('play', () => {
                state.startTime = Date.now();
                state.lastUpdateTime = Date.now();
                state.isPlaying = true;
            });
            
            // Pause event
            videoElement.addEventListener('pause', () => {
                if (state.isPlaying && state.startTime) {
                    state.totalWatchTime += Date.now() - state.lastUpdateTime;
                    state.lastUpdateTime = Date.now();
                    state.isPlaying = false;
                    this.checkVideoViewEligibility(videoElement, passageId, videoIndex);
                }
            });
            
            // Ended event
            videoElement.addEventListener('ended', () => {
                if (state.isPlaying && state.startTime) {
                    state.totalWatchTime += Date.now() - state.lastUpdateTime;
                    state.isPlaying = false;
                }
                this.checkVideoViewEligibility(videoElement, passageId, videoIndex);
            });
            
            // Time update event (for tracking while playing)
            videoElement.addEventListener('timeupdate', () => {
                if (state.isPlaying && state.startTime) {
                    const currentTime = Date.now();
                    state.totalWatchTime += currentTime - state.lastUpdateTime;
                    state.lastUpdateTime = currentTime;
                    this.checkVideoViewEligibility(videoElement, passageId, videoIndex);
                }
            });
            
            // Seeking event (reset tracking if user seeks backward)
            let lastTime = 0;
            videoElement.addEventListener('timeupdate', () => {
                if (videoElement.currentTime < lastTime - 5) {
                    // User seeked backward more than 5 seconds, reset tracking
                    state.totalWatchTime = videoElement.currentTime * 1000;
                    state.startTime = Date.now() - state.totalWatchTime;
                    state.hasTracked = false;
                }
                lastTime = videoElement.currentTime;
            });
            
            // Before unload (track if still playing)
            window.addEventListener('beforeunload', () => {
                if (state.isPlaying && state.startTime) {
                    state.totalWatchTime += Date.now() - state.lastUpdateTime;
                    this.trackVideoView(passageId, videoIndex, state.totalWatchTime, videoElement.duration * 1000);
                }
            });
        },

        // Check if video view is eligible for tracking
        async checkVideoViewEligibility(videoElement, passageId, videoIndex) {
            const videoId = `${passageId}-${videoIndex}`;
            const state = this.videoStates[videoId];
            
            if (state.hasTracked) return;
            
            const totalDuration = videoElement.duration * 1000; // Convert to milliseconds
            const watchTime = state.totalWatchTime;
            
            // Check if watched 30 seconds or 90% of video
            if (watchTime >= 30000 || watchTime >= totalDuration * 0.9) {
                state.hasTracked = true;
                await this.trackVideoView(passageId, videoIndex, watchTime, totalDuration);
            }
        },

        // Track video view
        async trackVideoView(passageId, videoIndex, watchTime, totalDuration) {
            try {
                const fingerprints = await this.generateFingerprints();
                
                const response = await fetch('/api/view/video', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        passageId: passageId,
                        videoIndex: videoIndex,
                        watchTime: Math.round(watchTime),
                        totalDuration: Math.round(totalDuration),
                        deviceFingerprint: fingerprints.deviceFingerprint,
                        browserFingerprint: fingerprints.browserFingerprint,
                        timestamp: Date.now()
                    })
                });
                
                const result = await response.json();
                console.log('Video view tracked:', result);
                return result;
            } catch (error) {
                console.error('Error tracking video view:', error);
                return { success: false, error: error.message };
            }
        },

        // YouTube tracking state
        youtubeStates: {},

        // Initialize YouTube tracking
        initYouTubeTracking(passageId, youtubeVideoId) {
            // Check if YouTube IFrame API is loaded
            if (!window.YT || !window.YT.Player) {
                console.warn('YouTube IFrame API not loaded');
                return;
            }
            
            const playerId = `youtube-${passageId}-${youtubeVideoId}`;
            
            // Initialize state
            this.youtubeStates[playerId] = {
                startTime: null,
                totalWatchTime: 0,
                lastUpdateTime: null,
                hasTracked: false,
                checkInterval: null
            };
            
            const state = this.youtubeStates[playerId];
        },

        // Track YouTube embed view with YT Player API
        trackYouTubePlayer(player, passageId, youtubeVideoId) {
            const playerId = `youtube-${passageId}-${youtubeVideoId}`;
            const state = this.youtubeStates[playerId] || {
                startTime: null,
                totalWatchTime: 0,
                lastUpdateTime: null,
                hasTracked: false,
                checkInterval: null
            };
            
            this.youtubeStates[playerId] = state;
            
            // Clear any existing interval
            if (state.checkInterval) {
                clearInterval(state.checkInterval);
            }
            
            player.addEventListener('onStateChange', async (event) => {
                if (event.data === YT.PlayerState.PLAYING) {
                    state.startTime = Date.now();
                    state.lastUpdateTime = Date.now();
                    
                    // Check progress every second
                    state.checkInterval = setInterval(() => {
                        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                            const currentTime = Date.now();
                            state.totalWatchTime += currentTime - state.lastUpdateTime;
                            state.lastUpdateTime = currentTime;
                            
                            // Check if eligible for tracking
                            if (!state.hasTracked && state.totalWatchTime >= 30000) {
                                state.hasTracked = true;
                                this.trackYouTubeEmbed(passageId, youtubeVideoId, state.totalWatchTime);
                                clearInterval(state.checkInterval);
                            }
                        }
                    }, 1000);
                } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                    if (state.startTime) {
                        state.totalWatchTime += Date.now() - state.lastUpdateTime;
                        state.lastUpdateTime = Date.now();
                    }
                    
                    if (state.checkInterval) {
                        clearInterval(state.checkInterval);
                    }
                    
                    // Check if eligible for tracking
                    if (!state.hasTracked && state.totalWatchTime >= 30000) {
                        state.hasTracked = true;
                        await this.trackYouTubeEmbed(passageId, youtubeVideoId, state.totalWatchTime);
                    }
                }
            });
        },

        // Track YouTube embed view
        async trackYouTubeEmbed(passageId, youtubeVideoId, watchTime) {
            try {
                const fingerprints = await this.generateFingerprints();
                
                const response = await fetch('/api/view/youtube', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        passageId: passageId,
                        youtubeVideoId: youtubeVideoId,
                        watchTime: Math.round(watchTime),
                        deviceFingerprint: fingerprints.deviceFingerprint,
                        browserFingerprint: fingerprints.browserFingerprint,
                        timestamp: Date.now()
                    })
                });
                
                const result = await response.json();
                console.log('YouTube view tracked:', result);
                return result;
            } catch (error) {
                console.error('Error tracking YouTube view:', error);
                return { success: false, error: error.message };
            }
        },

        // Auto-initialize tracking for videos on page
        autoInitialize() {
            // Track all video elements
            const videos = document.querySelectorAll('video[data-passage-id][data-video-index]');
            videos.forEach(video => {
                const passageId = video.getAttribute('data-passage-id');
                const videoIndex = parseInt(video.getAttribute('data-video-index'));
                this.initVideoTracking(video, passageId, videoIndex);
            });
            
            // Track page view if on passage page
            const passageElement = document.querySelector('[data-passage-view]');
            if (passageElement) {
                const passageId = passageElement.getAttribute('data-passage-view');
                this.initPageViewTracking(passageId);
            }
        }
    };
    
    // Export to global scope
    window.ViewTracker = ViewTracker;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ViewTracker.autoInitialize();
        });
    } else {
        ViewTracker.autoInitialize();
    }
})();