  document.getElementById("loading").className = "loading-visible";
  var hideDiv = function(){$('#loading').hide();};
  var oldLoad = window.onload;
  var newLoad = oldLoad ? function(){hideDiv.call(this);oldLoad.call(this);} : hideDiv;
  window.onload = newLoad;
  $(function(){
    setTimeout(function(){$('#loading').hide();},100);
  });
