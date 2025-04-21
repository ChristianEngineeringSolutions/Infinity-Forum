(function() {
	var old = [],
		old_data = [],
		DIR = 'l',
		MODIFY = null;
	var chief = 'root';
	var which = 'forum';
	var moving = false;
	$(document).ready(function(e) {
		// window.onhashchange = hash_ajax;
		$(document).on("click", ".cat_title", function() { //if you click on a forum 
			var ele = $(this).parents(".forum").children(".subcat"); //find the subcat for that forum
			if (ele.is(":hidden"))
				ele.slideDown(500); //show if hidden
			else
				ele.slideUp(500); //else hide
		});
		$(document).on("click", "a:not(#link-more):not(.option_link)", function(e) {
			setTimeout(function() {
				hash_ajax();
			}, 200)
		}); //small hash hack
		//changing pages
		$(document).on('click', 'a[id^="change-pg-"]', function() {
			var hash = window.location.hash;
			//add a slash if we need to for a proper split
			var pg = hash.slice(-1);
			var nxt = $(this).attr('id').substring(10);
			if (pg > nxt) DIR = 'r';
			else DIR = 'l';
			if (pg != '/' && isNaN(pg)) {
				hash += '/';
				DIR = 'l';
			}
			hash = hash.split('/');
			//change page part of URL
			hash[hash.length - 1] = nxt;
			window.location.hash = hash.join('/');
			$('html, body').animate({
				scrollTop: $("body").offset().top
			}, 1000);
		});
		//////////////////////////////////////////////////////
		// clicking on a category will be handled with ajax..
		//////////////////////////////////////////////////////
		var current = 0;
		var first = false,
			block = false;
		if (window.location.hash.length !== 0) //check if theres a hashtag
		{
			first = true;
			hash_ajax(); //get that page 

		} else {
			window.location = "#";
		}

		$(document).on('keypress', '#cat_search', function(e){
			var hash = window.location.hash.substring(1); //get the hashtag
			var _id = hash.split('/')[2];
			var thiz = $(this);
	        if(e.which == 13){
	        	$('#last_search').val(thiz.val());
	            $.ajax({
	                type: 'get',
	                // url: DOMAIN + '/search/' + fromOtro,
	                url: '/cat/',
	                data: {
	                    search: thiz.val(),
	                    pNumber: 1,
	                    _id: _id
	                },
	                success: function(data){
	                    $('.forum_box').replaceWith(data);
	                    $('#cat_search').val($('#last_search').val());
	                }
	            });
	        }
		});
		function hash_ajax() {
			// if (block)
			// 	return;
			var pages = ["forum", "cat", "thread"];
			var pg = window.location.href.split('/').at(-1);
			var hash = window.location.hash.substring(1); //get the hashtag
			// alert(hash);
			var _id = hash.split('/')[2];
			var page = hash.split('/')[0];
			var pNumber = hash.split('/')[3];
			var id = 'l';
			var data = {};
			data = {
				_id: _id,
				pNumber: pNumber
			};
			if(page == '' || page == 'forum'){
				page = 'forum';
				data._id = true;
				id = 'r';
				chief = 'root';
				which = 'forum';
			}
			else if(page == 'cat'){
				chief = data._id;
				which = 'cat';

			}
			else if(page == 'thread'){
				chief = data._id;
				data.page = pg;
				which = 'thread';
			}
			// var data, id = "l";
			// id = DIR;
			id = DIR;
			data.search = $('#last_search').val();
			var time = first === true ? 0 : 1000;
			$.ajax({ // send it with ajax
				url: '/' + page, //to the right file depending on the previus code
				type: "GET",
				beforeSend: function() {
					block = true;
				},
				data: data, //data depending on previus code

				success: function(res) { //when done
					$("#main").prepend("<div class=\"forum_2\">" + res + "</div>"); //add the feteched data to a div
					$(".forum_1").hide("slide", {
							direction: ((id === "l") ? "left" : "right")
						}, time, //slide the old one away 
						function() {
							while ($(".forum_1").length > 0) {
								$(".forum_1").remove(); //REMOVE OLD ONE
							}
							$(".forum_2").attr("class", "forum_1"); //change new to active so we can keep this going
							current = old.length;
							save(newID());
							//console.log("length: " +old.length + "\nCurrent: " + current + "\nData: " + old);
							block = false;
							nav();
							if ((page == 'cat' || page == 'thread') && $('#logged-in').val() == 'true') {
								$('#forum-pages').html('<button id="forum-post">New Post</button>');
							} else {
								$('#forum-pages').html('');
							}
							if(page == 'thread'){
								$('#sub_passages').sortable({
						        handle: '.passage_options'
						    });
							}
						});
					$(".forum_2").show("slide", {
						direction: ((id !== "l") ? "left" : "right")
					}, time); //slide the new one in

					first = false;
					setTimeout(function(){
						if($('.forum_1').length > 1){
							$('#main .forum_1').not(':first-child').remove();
						}
						// alert(1);
					}, 2000);
					highlightPageNumber();
				}
			});
		}

		function newID() {
			var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; //avalible chars for the random generated string name
			var newID = ""; //string ID
			for (var i = 0; i < 32; i++)
				newID += chars.charAt(Math.floor(Math.random() * chars.length)) //loop to add the random char	
			return newID;
		}

		function save(newID) {
			var hash = window.location.hash;
			if (hash.length === 0) {
				window.location.hash = "#";
				hash = "#";
				//return;
			}
			arrows();
		}

		function arrows() {
			$("body").append("<div class=\"arrow_l\"></div><div class=\"arrow_r\"></div>") //show arrows
			if (window.location.hash.length === 0) {
				$(".arrow_l").remove();
				$(".arrow_r").remove();
			}
			if (window.location.hash.indexOf("f=") != -1 && DIR === 'l') {
				$(".arrow_r").remove();
			}
			if (window.location.hash.indexOf("t=") != -1) {
				if ($('#last-page').val() == 1 || window.location.hash.slice(-1) === $('#last-page').val()) $(".arrow_r").remove();
			}
		}

		// $(document).on('click', '#forum_nav_1', function(){
		// 	window.location.href = '#';
		// 	hash_ajax();
		// 	alert(1);
		// });
		function nav() {
			$("div[id^='forum_nav_']:not('#forum_nav_1')").hide();
			$("#forum_nav i").hide();

			var arr = ["hdn_cat", "hdn_thr"]; //the different classes
			var arr2 = []; //checked array
			arr.forEach(function(entry) {
				if ($("." + entry).length > 0){ //check if exists
					arr2.push(entry); //then add if it does
				}
			});
			arr2.forEach(function(entry, index) {
				var nav = $("#forum_nav_" + (index + 2)); //easier to write
				var txt = $("." + entry).val(); // the text
				var name = window.atob(txt.substring(0, txt.indexOf("|"))); //decoded name
				if(name == ''){
					name = 'Untitled';
				}
				console.log(name);
				var id = txt.substr(txt.indexOf("|") + 1); //the ID
				nav.children("span:first-child").html(((index + 1 == arr2.length) ? name : "<a href=\"#cat/" + name.replace(/ /g, '_') + "/" + id + "\">" + name + "</a>") + ((index == 0) ? " <b>&#171;</b>" : "")); //set the html with the decoded name
				$("div[id^='forum_nav_']").removeClass("forum_nav_active"); //remove active from all of them
				if (index + 1 == arr2.length) //if the last
					nav.addClass("forum_nav_active"); //active
				nav.show(); // guess :O
				nav.css("display", "inline-block"); // jquery puts as block always, so....
				$("#forum_nav i:nth-child(" + (index * 2 + 2) + ")").show(); // show the -----------
			});

		}

		function numPages() {
			return $('.pg-link').length / 2 + 1;
		}
		////////////////////////////////////////////////////
		// history buttons :]
		////////////////////////////////////////////////////
		$(document).on("click", "div[class^='arrow_']", function() {
			nav();
			arrows(); //recalculate arrows
			var id = $(this).attr("class").substr(-1); //get the direction, left or right (l or r)
			DIR = id === 'l' ? 'r' : 'l';
			REFER = 1;
			var pg = window.location.hash.slice(-1);
			if (isNaN(pg)) pg = 1;
			if (id === 'r' && window.location.hash.indexOf("t=") != -1 && numPages() > 1 && pg !== $('#last-page').val()) {
				var nxt = parseInt(pg, 10) + 1;
				$('#change-pg-' + nxt).click();
			} else if (id === 'l'){
				window.history.back();
				setTimeout(function() {
					hash_ajax();
				}, 200);
			}
			else{
				window.history.forward();
				setTimeout(function() {
					hash_ajax();
				}, 200);
			}
		});
		$(document).on('click', '.forum', function() {
			DIR = 'l';
		});
		/////////////////////////
		// clear session storage
		/////////////////////////
		if (typeof(Storage) !== "undefined")
			sessionStorage.clear();
		save(newID());


		///////////////////////////////////////
		//	nav cat dropdown
		///////////////////////////////////////
		$(document).on("click", "#forum_nav_2 span:nth-child(2) a, #forum_nav_2 span:first-child b", function() {
			$("#forum_nav_2 span:nth-child(2)").slideToggle(300);
		});
		//transform a string into a markdown quote
		function quoteString(name, date, str) {
			var str = str.split("\n");
			var quote = "From " + name + ", " + date + ":\n";
			for (var i = 0, len = str.length; i < len; i++) {
				quote += ">" + str[i] + "\n";
			}
			return quote + '\n\n';
		}
		//quoting
		$(document).on('click', '[id^="forum-quote-"]', function() {
			var id = $(this).attr('id').substring(12);
			var postData = $('#forum-data-post-' + id).val().split('-');
			var post = quoteString(postData[1], postData[2], $('#epic-' + id).val());
			var hash = window.location.hash;
			if (hash.indexOf("f=") != -1)
				var cat = hash.substr(hash.indexOf("f=") + 2, hash.indexOf("/") - 2); //get the ID of the category
			if (hash.indexOf("t=") != -1)
				var thread = hash.substr(hash.indexOf("t=") + 2, hash.indexOf("/") - 2); //get the ID of the thread
			popup("New Post", '<form id="new-forum-post"><input type="hidden"name="signal"value="post"/><input type="hidden"name="' +
				(thread ? 't' : 'f') + '"value="' + (thread || cat) + '"/><br>' +
				(cat ? '<input style="padding:10px;width:75%"name="subject"placeholder="Subject"/>' : '') +
				'<br><br><div id="epicedit-body"><textarea id="epic-body"name="body"class="epic-text form-control">' + post + '</textarea></div><br><button class="pr-btn">Post</button></form>');
			epicEdit('epicedit-body', 'epic-body');
		});
		//new post form
		$(document).on('click', '#forum-post', function() {
			var hash = window.location.hash;
			if (hash.indexOf("f=") != -1)
				var cat = hash.substr(hash.indexOf("f=") + 2, hash.indexOf("/") - 2); //get the ID of the category
			if (hash.indexOf("t=") != -1)
				var thread = hash.substr(hash.indexOf("t=") + 2, hash.indexOf("/") - 2); //get the ID of the thread
			popup("New Post", $('#clean_editor').val());
			$('#editor-label').val('Forum').change();
			$('#editor-label').hide();
			$('#editor-label-color').hide();
			$('#chief_passage_id').val(chief);
			$('#forum-which').val(which);

			$('#passage_form').show();
				// hljs.configure({   // optionally configure hljs
				//     languages: ['javascript', 'ruby', 'python', 'cpp', 'html', 'css', 'r', 'c', 'php']
				// });
				summonQuill();
			$('.display_data').toggle();
			// $('#passage_form').toggle();
			// epicEdit('epicedit-body', 'epic-body');
		});
		//deleting
		$(document).on('click', '[id^="forum-remove-"]', function() {
			var id = $(this).attr('id').split('-');
			var ID = id[3];
			var obj = {
				id: ID,
				signal: 'delete'
			};
			var isTopic = id[2] == 'topics';
			obj[isTopic ? 'f' : 't'] = ID;
			$.ajax({
				url: '/forum/handle.php',
				data: obj,
				type: 'POST',
				success: function(data) {
					if (isTopic) {
						$('.arrow_l').click();
					}
					$(window).trigger('hashchange');
				}
			});
		});
		//modifiying
		$(document).on('click', '[id^="forum-modify-"]', function(e) {
			var id = $(this).attr('id').split('-')[3];
			var isF = $('#threadID').val() == id;
			MODIFY = id;
			var hash = window.location.hash;
			if (hash.indexOf("f=") != -1)
				var cat = hash.substr(hash.indexOf("f=") + 2, hash.indexOf("/") - 2); //get the ID of the category
			if (hash.indexOf("t=") != -1)
				var thread = hash.substr(hash.indexOf("t=") + 2, hash.indexOf("/") - 2); //get the ID of the thread
			popup("Modify Post", '<form id="modify-forum-post"><input type="hidden"name="id"value="' + id + '"/><input type="hidden"name="signal"value="update"/><input type="hidden"name="' +
				(!isF ? 't' : 'f') + '"value="' + (parseInt(thread || cat)) + '"/><br>' +
				(isF ? '<input style="padding:10px;width:75%"name="subject"placeholder="Subject"/>' : '') +
				'<br><br><div id="epicedit-body"><textarea id="epic-body"name="body"class="epic-text form-control">' + $('#epic-' + id).val() + '</textarea></div><br><button class="pr-btn">Modify</button></form>');
			epicEdit('epicedit-body', 'epic-body');
		});
		//new post creation
		$(document).on('submit', '#new-forum-post', function(e) {
			e.preventDefault();
			var formData = $(this).serialize();
			$.ajax({
				url: '/forum/handle.php',
				data: formData,
				type: 'POST',
				success: function(data) {
					//dealing with category
					var hash = window.location.hash;
					var cat = hash.indexOf("f=") != -1 ? true : false;
					if (cat) {
						window.location.reload(true);
					} else {
						//change to last page to see post
						//add a slash if we need to for a proper split
						if (hash.slice(-1) != '/' && isNaN(hash.slice(-1))) hash += '/';
						hash = hash.split('/');
						//change page part of URL
						hash[hash.length - 1] = $('#last-page').val();
						if (window.location.hash === hash.join('/')) $(window).trigger('hashchange');
						else window.location.hash = hash.join('/');
						$('#msgbox_close').click(); //close popup and dim
						$('html, body').animate({
							scrollTop: $(document).height()
						}, 3000);
					}
				}
			});
		});
		//modify post
		$(document).on('submit', '#modify-forum-post', function(e) {
			e.preventDefault();
			var formData = $(this).serialize();
			$.ajax({
				url: '/forum/handle.php',
				data: formData,
				type: 'POST',
				success: function(data) {
					$('#epic-' + MODIFY).val($('#epic-body').val());
					$('#msgbox_close').click(); //close popup and dim
					MODIFY = null;
					window.location.reload(true);
				}
			});
		});
	});
})();