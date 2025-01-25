// VideoFilter.js
class VideoFilter {
  constructor(options = {}) {
    this.options = {
      warningMessage: 'Content warning: This video may contain sensitive content',
      blurAmount: '20px',
      sampleInterval: 1000,
      predictionThreshold: 0.5,
      ...options
    };
    
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.warningOverlay = null;
    this.model = null;
  }

  async loadModel() {
    try {
      this.model = await nsfwModel.load();
      return true;
    } catch (err) {
      console.error('Failed to load NSFW model:', err);
      throw err;
    }
  }

  async setupVideoAnalysis(videoElement) {
    if (!videoElement) throw new Error('Video element is required');
    
    // Create warning overlay
    this.warningOverlay = document.createElement('div');
    this.warningOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,1);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
      box-sizing: border-box;
      z-index: 1000;
    `;
    
    // Add container for positioning
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';
    videoElement.parentNode.insertBefore(container, videoElement);
    container.appendChild(videoElement);
    if(videoElement.offsetParent != null){
      container.appendChild(this.warningOverlay);
    }

    // Show initial warning immediately
    videoElement.style.filter = `blur(${this.options.blurAmount})`;
    this.warningOverlay.innerHTML = `
      <div>Analyzing content...</div>
      <button style="
        margin-top: 10px;
        padding: 8px 16px;
        background: #ffffff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #000000;
      ">Show Content Anyway</button>
    `;
    
    // Add click handler to button
    const continueButton = this.warningOverlay.querySelector('button');
    continueButton.onclick = () => {
      this.hideWarning();
      videoElement.style.filter = 'none';
    };

    // Wait for video metadata to load to get duration
    if (videoElement.readyState === 0) {
      await new Promise(resolve => {
        videoElement.addEventListener('loadedmetadata', resolve, { once: true });
      });
    }

    // Load model if not already loaded
    if (!this.model) {
      await this.loadModel();
    }
    //
    // Analyze frames at specific intervals
    await this.analyzeVideoIntervals(videoElement, 4);
    
    // Setup video event listeners
    videoElement.addEventListener('play', () => videoElement.currentTime = 0);
    videoElement.addEventListener('pause', () => this.stopAnalysis());
    videoElement.addEventListener('ended', () => this.stopAnalysis());
    
    return this;
  }

  async analyzeVideoIntervals(videoElement, numFrames) {
    const duration = videoElement.duration;
    const interval = duration / (numFrames + 1); // +1 to not include the very end
    
    let hasRestrictedContent = false;
    
    // Store original time
    const originalTime = videoElement.currentTime;
    
    // Check frames at intervals
    for (let i = 1; i <= numFrames; i++) {
      const timePoint = interval * i;
      videoElement.currentTime = timePoint;
      
      // Wait for seek to complete
      await new Promise(resolve => {
        const seekHandler = () => {
          videoElement.removeEventListener('seeked', seekHandler);
          resolve();
        };
        videoElement.addEventListener('seeked', seekHandler);
      });
      
      // Analyze the frame
      const frameResult = await this.analyzeFrame(videoElement);
      if (frameResult) {
        hasRestrictedContent = true;
      }
    }
    
    // Reset video to original time
    videoElement.currentTime = originalTime;

    // If no restricted content was found, remove the warning
    if (!hasRestrictedContent) {
      this.hideWarning();
      videoElement.style.filter = 'none';
    }
    
    return hasRestrictedContent;
  }

  async analyzeFrame(videoElement) {
    if (!this.model) return false;

    // Resize canvas to match video dimensions
    this.canvas.width = videoElement.videoWidth;
    this.canvas.height = videoElement.videoHeight;
    
    // Draw current frame to canvas
    this.context.drawImage(videoElement, 0, 0);
    
    // Create an image element for NSFW.js
    const img = document.createElement('img');
    img.src = this.canvas.toDataURL();
    
    // Wait for image to load
    await new Promise(resolve => {
      img.onload = resolve;
    });

    try {
      // Classify the frame
      const predictions = await this.model.classify(img);
      const hasRestrictedContent = this.evaluatePredictions(predictions);
      
      // Add class to mark as checked
      videoElement.classList.add('nsfw-checked');
      
      if (hasRestrictedContent) {
        this.showWarning(videoElement);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error analyzing frame:', err);
      return false;
    }
  }

  evaluatePredictions(predictions) {
    return predictions.some(prediction => {
      if (prediction.className === 'Drawing' || prediction.className === 'Neutral') {
        return false;
      }
      return prediction.probability > this.options.predictionThreshold;
    });
  }

  showWarning(videoElement) {
    // Show warning overlay
    this.warningOverlay.innerHTML = `
      <div>${this.options.warningMessage}</div>
      <button style="
        margin-top: 10px;
        padding: 8px 16px;
        background: #ffffff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Show Content</button>
    `;
    this.warningOverlay.style.display = 'flex';
    
    // Add click handler to button
    const continueButton = this.warningOverlay.querySelector('button');
    continueButton.onclick = () => {
      this.hideWarning();
      videoElement.style.filter = 'none';
    };
  }

  hideWarning() {
    if (this.warningOverlay) {
      this.warningOverlay.style.display = 'none';
      this.warningOverlay.innerHTML = '';
    }
  }

  stopAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
  }
}