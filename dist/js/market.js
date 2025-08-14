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
	$(document).on('click', '[id^="market-view-"]', function(e){
		e.preventDefault(); // Prevent any default behavior
		console.log('Market view clicked!');
		
		var href = window.location.href;
		var which = $(this).attr('id').split('-').at(-1);
		console.log('Which:', which);
		console.log('Current URL:', href);
		
		var field = "shipped"; // Use consistent parameter name
		var url = window.location.href;
		
		if(url.indexOf('?' + field + '=') != -1){
			console.log('Found ? parameter, updating...');
			var newUrl = updateURLParameter(window.location.href, "shipped", which);
			console.log('New URL:', newUrl);
			window.location.href = newUrl;
		}
		else if(url.indexOf('&' + field + '=') != -1){
			console.log('Found & parameter, updating...');
			var newUrl = updateURLParameter(window.location.href, "shipped", which);
			console.log('New URL:', newUrl);
		    window.location.href = newUrl;
		}else{
			console.log('No existing parameter, adding new...');
			var newUrl = window.location.href + `?shipped=${which}`;
			console.log('New URL:', newUrl);
			window.location.href = newUrl;
		}
	});
	/**
	 * https://stackoverflow.com/questions/1090948/change-url-parameters-and-specify-defaults-using-javascript
	 */
	function updateURLParameter(url, param, paramVal)
	{
	    var TheAnchor = null;
	    var newAdditionalURL = "";
	    var tempArray = url.split("?");
	    var baseURL = tempArray[0];
	    var additionalURL = tempArray[1];
	    var temp = "";

	    if (additionalURL) 
	    {
	        var tmpAnchor = additionalURL.split("#");
	        var TheParams = tmpAnchor[0];
	            TheAnchor = tmpAnchor[1];
	        if(TheAnchor)
	            additionalURL = TheParams;

	        tempArray = additionalURL.split("&");

	        for (var i=0; i<tempArray.length; i++)
	        {
	            if(tempArray[i].split('=')[0] != param)
	            {
	                newAdditionalURL += temp + tempArray[i];
	                temp = "&";
	            }
	        }        
	    }
	    else
	    {
	        var tmpAnchor = baseURL.split("#");
	        var TheParams = tmpAnchor[0];
	            TheAnchor  = tmpAnchor[1];

	        if(TheParams)
	            baseURL = TheParams;
	    }

	    if(TheAnchor)
	        paramVal += "#" + TheAnchor;

	    var rows_txt = temp + "" + param + "=" + paramVal;
	    return baseURL + "?" + newAdditionalURL + rows_txt;
	}

});