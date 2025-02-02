function analyzeVideos(){
  if($('#safe-mode').val() == 'true'){
    $('.uploadedVideo:not(.nsfw-checked)').each(function(){
      const filter = new VideoFilter({
        warningMessage: 'Content Warning: This video may contain sensitive material',
        blurAmount: '15px',
        sampleInterval: 5000, // Check every 5 second
        predictionThreshold: 0.5 // 50% confidence threshold
      });

      filter.setupVideoAnalysis(this).catch(console.error);
    });
  }
}
function analyzeImages() {
  if($('#safe-mode').val() == 'true'){
    $('.uploadedImage').each(function() {
      console.log('getting there');
      const filter = new ImageFilter({
        warningMessage: 'Content Warning: This image may contain sensitive material',
        blurAmount: '15px',
        predictionThreshold: 0.5
      });
      
      filter.setupImageAnalysis(this).catch(console.error);
    });
  }
}