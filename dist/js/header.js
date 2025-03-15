distractionFree = false;
$(function(){
    $(document).on('click', '#bookmarks_icon, #bookmarks-fa', function(){
        $('#left-side-panel').hide();
        $('#right_side_select').val('bookmarks').change();
        $('#side_panel').toggle();
        $('.blocker').click();
        $('#side_panel').scrollTop(0);
    });

    $(document).on('click', '#nav_donate', function(){
        window.location.href = '/donate';
    });
    $(document).on('click', '.help_read_more', function(){
        $('#right_side_select').val('help').change();
        $('#side_panel').toggle();
        $('.blocker').click();
        $('#side_panel').scrollTop(0);
    });
    $(document).on('click', '#logout', function(){
        window.location.href = '/logout';
    });
    $(document).on('click', '#leaderboard_link', function(){
        window.location.href = '/leaderboard';
    });
    // $('#bookmarks_icon').click();
    // localStorage.clear();
    // $('#tab_list').sortable();
    if(localStorage.getItem('num_tabs') === null){
        localStorage.setItem('num_tabs', 1);
        localStorage.setItem('tab_' + 1, JSON.stringify({text: 'Home', href: '/'}));
    }
    var num_tabs = parseInt(localStorage.getItem('num_tabs'));
    function addTab(num){
        if(localStorage.getItem('tab_' + num) === null){
            return false;
        }
        let tab_data = JSON.parse(localStorage.getItem('tab_' + num));
        if(tab_data === null) return false;
        $('#new_tab').before(' <li id="tab_'+(num)+'" data-href="'+tab_data.href+'" class="tab">'+tab_data.text+'</li> ');
    }
    $(document).on('click', '.tab_delete', function(e){
        var thiz = $(this);
        //id of tab to be deleted
        var _id = thiz.parent().attr('id');
        var _num = _id.split('_')[1];
        //thiz.remove();
        var num_tabss = $('.tab').length;
        $('.tab').each(function(){
            //id of tab
            let tabId = $(this).attr('id');
            let tabNum = tabId.split('_')[1];
            if(localStorage.getItem('tab_' + tabNum) === null){
                return false;
            }
            if(tabNum > _num){
                //push back tab ids
                $('#tab_' + tabNum).attr('id', '#tab_' + tabNum - 1);
                let tabData = JSON.parse(localStorage.getItem('tab_' + tabNum));
                let text = tabData.text;
                let href = tabData.href;
                localStorage.setItem('tab_' + tabNum - 1, JSON.stringify({text: text, href: href}));
                //remove last tab
                if(tabNum == num_tabss - 1){
                    localStorage.setItem('tab_' + tabNum, null);
                }
            }
        });
        //remove deleted tab    
        localStorage.setItem('tab_' + _num, null);
        $(this).parent().remove();
        e.stopPropagation();
    });
    $(document).on('click', '#new_tab', function(){
        let tab_num = num_tabs + 1; 
        localStorage.setItem('num_tabs', tab_num);
        var text = 'New Tab';
        if($('.tab').length - 1 === 0){
            text = 'Home';
        }
        localStorage.setItem('tab_' + tab_num, JSON.stringify({text: text, href: '/'}));
        addTab(tab_num);
        console.log(localStorage.getItem('num_tabs'));
    });
    //populate tabs from localStorage
    for(let i = 1; i <= num_tabs; ++i){
        addTab(i);
        let tab_data = JSON.parse(localStorage.getItem('tab_' + i));
        if(tab_data !== null){
            $('#tab_' + i).html('<span class="tab_delete">X</span>' + decodeURIComponent(tab_data.text));
            $('#tab_' + i).data('href', tab_data.href);
        }
    }
    let active_tab_id = localStorage.getItem('active_tab');
    let active_tab_data = JSON.parse(localStorage.getItem(active_tab_id));
    if(active_tab_data !== null){
        $('#' + active_tab_id).html('<span class="tab_delete">X</span>' + active_tab_data.text);
        $('#' + active_tab_id).data('href', active_tab_data.href);
    }
    if(localStorage.getItem('active_tab') === null){
        localStorage.setItem('active_tab', 'tab_1');
    }
    $('#' + localStorage.getItem('active_tab')).addClass('active_tab');
    $(document).on('click', '#login_register_link', function(){
        window.location.href = "/loginform";
    });
    $(document).on('click', '.menu-link', function(){
        var id = $(this).attr('id');
        var title = id.split('-')[0];
        var href = '/' + title;
        $('.active_tab').html('<span class="tab_delete">X</span>' + title[0].toUpperCase + title.slice(1));
        let tab_id = $('.active_tab').attr('id');
        localStorage.setItem(tab_id, JSON.stringify({text: title[0].toUpperCase + title.slice(1), href: href}));
        localStorage.setItem('active_tab', tab_id);
        window.location.href = href;
    });
    $(document).on('click', '#home_link, .home-link', function(){
        var title = 'Home';
        let href = '/';
        $('.active_tab').html('<span class="tab_delete">X</span>' + title);
        let tab_id = $('.active_tab').attr('id');
        localStorage.setItem(tab_id, JSON.stringify({text: title, href: href}));
        localStorage.setItem('active_tab', tab_id);
        window.location.href = href;
    });
    $(document).on('click', '#menu-button', function(){
        $('#left-side-panel').show();
    });
    $(document).on('click', '#link-more', function(){
        $('#left-side-panel').toggle();
    });
    $(document).on('click', '#file-stream', function(){
        window.location.href = "/filestream/";
    });
    // $(document).on('click', '#file-stream', function(){
    //     // load passages from filestream using ajax
    //     $.ajax({
    //         type: 'get',
    //         url: '/filestream/',
    //         data: {
    //             viewMainFile: true, //allow to click to true
    //         },
    //         success: function(data){
    //             //add view main file toggle option
    //             //TODO...
    //             //then...
    //             $('#passage_wrapper').html(data);
    //             syntaxHighlight();
	// 			$('#left-side-panel').hide();
    //         }
    //     });
    // });
    $(document).on('click', '#menu-advanced', function(){
        $('#advanced-menu-options').fadeToggle()
    });
    $(document).on('click', '#menu-help', function(){
        window.location.href = 'https://infinity-forum.org/passage/Welcome!/65a1ca52f788bd934dd36d6a';
    });
    $(document).on('click', '#menu-contact', function(){
        alert("Email us at: admin@infinity-forum.org");
    });
    $(document).on('click', '#menu-terms', function(){
        window.location.href = '/terms';
    });
    //click blocking for panels
    $(document).on('click', function(e){
        var container = $("#left-side-panel");
        if(container.is(':visible') && e.target.id != 'menu-button' && e.target.id != 'link-more'){
            // if the target of the click isn't the container nor a descendant of the container
            if (!container.is(e.target) && container.has(e.target).length === 0) 
            {
                container.hide();
            }
            e.stopPropagation();
        }
        var container = $("#side_panel");
        // console.log(e.target.id);
        if(container.is(':visible') && e.target.id != 'show_brief' && e.target.id != 'bookmarks_icon' && e.target.id != 'ppe_search_icon' && e.target.id != 'bookmarks-fa' && (e.target.id.length > 0 && !$('#' + e.target.id).hasClass('b-bar'))){
            // if the target of the click isn't the container nor a descendant of the container
            if (!container.is(e.target) && container.has(e.target).length === 0) 
            {
                container.hide();
            }
            e.stopPropagation();
        }
    });
    $(document).on('click', '#menu-close', function(){
        $('#left-side-panel').hide()
    });
    $(document).on('click', '#profile_link', function(){
        window.location.href = "/profile/";
    });
    $(document).on('click', '#feed_link', function(){
        window.location.href = "/feed";
    });
    $(document).on('click', '#messages', function(){
        window.location.href = "/messages";
    });
    $(document).on('click', '#notifications', function(){
        window.location.href = "/notifications";
    });
    $(document).on('click', '#distraction_free', function(){
        $('#left-side-panel').hide();
        if(distractionFree == false){
            $(this).css('color', 'green');
            $('.passage_options').hide();
            $('.passage_tabs').hide();
            $('.passage_author').hide();
            $('.passage_users').hide();
            $('.passage_stars').hide();
            // $('.passage').css('background', 'white'); 
            // $('.passage').css('border', '0'); 
            $('.passage').css('margin-bottom', '0'); 
            $('.passage').css('padding-top', '0'); 
            $('.passage').css('padding-bottom', '0'); 
            // $('.detail_title').hide();
            $('.detail_description').css('margin-bottom', '0'); 
            $('.detail_description').css('margin-top', '0');
            $('.hr').hide();
            $('#search_passage').hide();
            $('#page_title').hide();
            $('#tab_panel').hide();
            $('#add_passage_button').hide();
            $('#top_spacer').hide();
            $('.passage-box').hide();
            $('.toppings').hide();
            $('.bottom-bar').hide();
            distractionFree = true;
        }
        else{
            $('.toppings').show();
            $('.bottom-bar').show();
            $(this).css('color', 'white');
            $('.passage-box').show();
            $('.passage_options').show();
            $('.passage_tabs').show();
            $('.passage_author').show();
            $('.passage_users').show();
            $('.passage_stars').show();
            // $('.passage').css('background', 'gold'); 
            // $('.passage').css('border', '2px solid #353535'); 
            $('.passage').css('margin-bottom', '10px'); 
            // $('.detail_title').show();
            $('.detail_description').css('margin-bottom', '50px'); 
            $('.detail_description').css('margin-top', '25px');
            $('.passage').css('padding', '15px'); 
            $('#search_passage').show();
            $('#page_title').show();
            $('#tab_panel').show();
            $('#add_passage_button').show();
            $('#top_spacer').show();
            distractionFree = false;
        }
    });
    if($('#is_distraction_free').val() != 'false'){
        $('#distraction_free').click();
    }
    // $('.passage').draggable();
    $('.tab').droppable({
        drop: (event, ui) => {
            // alert('dropped');
            $('#' + event.target.id).css('background', 'green');
            setTimeout(function(){
                $('#' + event.target.id).css('background', 'gold');
            }, 300);    
            let destination_id = $('#' + event.target.id).data('href').split('/').at(-1);
            let passage_id = ui.draggable.attr('id').split('_').at(-1);
            let pdom = ui.draggable;
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/move_passage',
                url: '/move_passage',
                data: {
                    destination_id: destination_id,
                    passage_id: passage_id
                },
                success: function(data){
                    let pdom = ui.draggable;
                    if(pdom.parent.attr('id') == 'sub_passages'){
                        pdom.remove();
                    }
                    $('#' + event.target.id).css('background', 'green');
                    setTimeout(function(){
                        $('#' + event.target.id).css('background', 'gold');
                    }, 500);
                }
            });
            ui.draggable.draggable('option', 'revert', true);
        },
        over: (event, ui) => {
            $('#' + event.target.id).css('background', 'yellow');
        },
        out: (event) => {
            $('#' + event.target.id).css('background', 'gold');
        },
        tolerance: 'pointer'
    });
    $(document).on('click', '.tab:not(".tab_delete")', function(){
        var href = window.location.href.split('/');
        let title = decodeURIComponent(href[href.length - 2]);
        let passage_id = href[href.length - 1];
        var _id = $(this).attr('id');
        href = title + '/' + passage_id;
        if($(this).attr('id') !== 'new_tab'){
            $('.tab:not(#new_tab)').css('background', 'gold');
            $(this).css('background', 'yellow');
            localStorage.setItem('active_tab', _id);
            window.location.href = $(this).data('href');
            // localStorage.setItem(_id, href);
            // $(this).text(title);
            // $.ajax({
            //     type: 'get',
            //     url: DOMAIN + '/tab/' + href,
            //     success: function(data){
            //         $('#passage_wrapper').html(data);
            //     }
            // });
        }
    });
    //correction for tab name if using window navigation
    {
        let title;
        if(window.location.pathname === '/'){
            title = 'Home';
        }
        else if(window.location.pathname == '/loginform'
        || window.location.pathname == '/leaderboard'){
            title = 'Home';
            // $('.tab').css('background', 'gold');
        }
        else{
            title = window.location.href.split('/')[window.location.href.split('/').length - 2];
        }
        let active_tab_id = localStorage.getItem('active_tab');
        $('#' + active_tab_id).html('<span class="tab_delete">X</span>' + decodeURIComponent(title));
    }

});
$(document).ready(function(e) 
{
	setTimeout(function()
	{
    	$(".member_bar").slideDown(500);
		setTimeout(function()
		{
			$("#member_bar_body").fadeIn(200);
			$("#member_bar_icons").fadeIn(200);	
		},800);
	},800);
});
$(function(){
    window.onscroll = function (e) {
        if(window.scrollY > 50){
            $('#top').hide();
            $('#header').show();
        }
        if(window.scrollY < 50){
            if(window.innerWidth > 1045){
                // alert(screen.width);
                $('#header').hide();
                $('#top').show();
            }
        }
    };
    window.onresize = function (e) {
        if(window.innerWidth < 1500){
            $('#top').hide();
            $('#header').show();
        }
        else if(window.innerWidth > 1500){
            $('#header').hide();
            $('#top').show();
        }
    };
});