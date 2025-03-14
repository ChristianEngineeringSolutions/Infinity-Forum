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
function isValidHttpUrl(string) {
  let url;
  
  try {
    url = new URL(string);
  } catch (_) {
    return false;  
  }

  return url.protocol === "http:" || url.protocol === "https:";
}
function analyzeImages() {
  //just gonna handle image preview links right here for now, might need to restructure code
  $('.preview-image:not(.image-loaded)').each(function(){
    var thiz = $(this);
    var _id = thiz.attr('id').split('-').at(-1);
    // if(isValidHttpUrl(thiz.data('url'))){
      fetch(`/preview-link?url=${encodeURIComponent(thiz.data('url'))}`)
      .then(response => response.json())
      .then(data => {
        if (data.imageUrl) {
          thiz.addClass('image-loaded');
          $('#image-preview-'+_id).show();
          $('#preview-link-url-'+_id).text(data.url);
          $('#preview-link-url-'+_id).attr('href', data.link);
          $('#preview-link-description-'+_id).text(data.description);
          document.getElementById(thiz.attr('id')).src = data.imageUrl;
          analyzeImages();
        } else {
          console.log(data.message); // Handle the case where no image was found
          //Maybe set a placeholder image
           document.getElementById(thiz.attr('id')).src = ""
        }
      })
      .catch(error => {
        console.error('Error:', error);
      });
    // }
  });
  if($('#safe-mode').val() == 'true'){
    $('.uploadedImage:not(.nsfw-checked)').each(function() {
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