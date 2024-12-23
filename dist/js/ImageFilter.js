// ImageFilter.js
class ImageFilter {
  constructor(options = {}) {
    this.options = {
      warningMessage: 'Content warning: This image may contain sensitive content',
      blurAmount: '20px',
      predictionThreshold: 0.5,
      ...options
    };
    
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

  async setupImageAnalysis(imgElement) {
    if (!imgElement) throw new Error('Image element is required');
    
    // Load model if not already loaded
    if (!this.model) {
      await this.loadModel();
    }
    
    // Create container for positioning
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.display = 'inline-block';  // Preserve image's inline behavior
    imgElement.parentNode.insertBefore(container, imgElement);
    container.appendChild(imgElement);
    
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
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
      box-sizing: border-box;
      z-index: 1000;
    `;
    container.appendChild(this.warningOverlay);
    
    // Wait for image to load if it hasn't already
    if (!imgElement.complete) {
      await new Promise(resolve => {
        imgElement.onload = resolve;
      });
    }
    
    // Analyze the image
    await this.analyzeImage(imgElement);
    
    return this;
  }

  async analyzeImage(imgElement) {
    if (!this.model) return;

    try {
      // Classify the image
      const predictions = await this.model.classify(imgElement);
      const hasRestrictedContent = this.evaluatePredictions(predictions);
      
      // Add class to mark as checked
      imgElement.classList.add('nsfw-checked');
      
      if (hasRestrictedContent) {
        this.showWarning(imgElement);
      }
    } catch (err) {
      console.error('Error analyzing image:', err);
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

  showWarning(imgElement) {
    // Blur the image
    imgElement.style.filter = `blur(${this.options.blurAmount})`;
    
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
        color: #000000;
      ">Show Image</button>
    `;
    this.warningOverlay.style.display = 'flex';
    
    // Add click handler to button
    const continueButton = this.warningOverlay.querySelector('button');
    continueButton.onclick = () => {
      this.hideWarning();
      imgElement.style.filter = 'none';
    };
  }

  hideWarning() {
    if (this.warningOverlay) {
      this.warningOverlay.style.display = 'none';
      this.warningOverlay.innerHTML = '';
    }
  }
}