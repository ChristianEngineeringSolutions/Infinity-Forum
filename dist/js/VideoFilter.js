// VideoFilter.js
class VideoFilter {
  constructor(options = {}) {
    this.options = {
      warningMessage: 'Content warning: This video may contain sensitive content',
      blurAmount: '20px',
      sampleInterval: 1000, // Check frame every 1 second
      predictionThreshold: 0.5, // Threshold for NSFW confidence
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
    
    // Load model if not already loaded
    if (!this.model) {
      await this.loadModel();
    }
    
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
      display: none;
    `;
    
    // Add container for positioning
    const container = document.createElement('div');
    container.style.position = 'relative';
    videoElement.parentNode.insertBefore(container, videoElement);
    container.appendChild(videoElement);
    container.appendChild(this.warningOverlay);
    
    // Setup video event listeners
    videoElement.addEventListener('play', () => this.startAnalysis(videoElement));
    videoElement.addEventListener('pause', () => this.stopAnalysis());
    videoElement.addEventListener('ended', () => this.stopAnalysis());
    
    return this;
  }

  async analyzeFrame(videoElement) {
    if (!this.model) return;

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
      } else {
        this.hideWarning();
      }
    } catch (err) {
      console.error('Error analyzing frame:', err);
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
    // Blur the video
    videoElement.style.filter = `blur(${this.options.blurAmount})`;
    
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

  startAnalysis(videoElement) {
    this.analysisInterval = setInterval(() => {
      this.analyzeFrame(videoElement);
    }, this.options.sampleInterval);
  }

  stopAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
  }
}