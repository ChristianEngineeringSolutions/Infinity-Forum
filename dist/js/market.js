$(function(){
	$(document).on('keyup', '#market-search', function(e){
		if(e.which === 13){
			//set last part of url to search query and first page
			var newURL = document.URL.split('/');
			if(newURL.length === 4){
				newURL.push(1);
				newURL.push($(this).val());
			}
			else{
				newURL[newURL.length - 2] = 1;
				newURL[newURL.length - 1] = $(this).val();
			}
			window.location.href = newURL.join('/');
		}
	});
});