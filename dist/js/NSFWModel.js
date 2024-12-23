// NSFWModel.js
class NSFWModel {
  constructor() {
    if (NSFWModel.instance) {
      return NSFWModel.instance;
    }
    NSFWModel.instance = this;
    this.model = null;
    this.loading = null;
  }

  async load() {
    // If model is already loaded, return it
    if (this.model) {
      return this.model;
    }

    // If model is currently loading, wait for it
    if (this.loading) {
      return this.loading;
    }

    // Start loading the model
    try {
      this.loading = nsfwjs.load('/models/nsfw/model.json');
      this.model = await this.loading;
      console.log('NSFW Model loaded successfully');
      return this.model;
    } catch (err) {
      console.error('Failed to load NSFW model:', err);
      throw err;
    } finally {
      this.loading = null;
    }
  }
}

// Create a single instance
const nsfwModel = new NSFWModel();