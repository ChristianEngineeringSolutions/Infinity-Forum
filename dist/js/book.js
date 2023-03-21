var ppeActive = false;

var sessionStorageQueue = false;

var Sasame = true;

var page = 1;

var PPEPage = 1;

var DOMAIN;

var fromOtro;

function checkIfFromOtro(){
    fromOtro = $('#remote_toggle').data('cesconnect') == false ? '' : '?fromOtro=true';
    if($('#remote_toggle').length < 1){
        fromOtro = '';
    }
}

$(function(){
    checkIfFromOtro();
});

function isMobile(){
    return window.matchMedia("(max-width: 550px)").matches;
}
$( function() {
    if(!isMobile()){
        $(document).tooltip();
    }
    DOMAIN = $('#DOMAIN').val();
} );    

function jqueryToggle(thiz, func1, func2, dataType='toggle', dataValue=[0, 1]){
    if(thiz.data(dataType) == dataValue[0]){
        thiz.data(dataType, dataValue[1]);
        func2();
    }
    else{
        thiz.data(dataType, dataValue[0]);
        func1();
    }
    return thiz.data(dataType);
}
function flashIcon(thiz, color='gold'){
    thiz.css('color', color);
    setTimeout(function(){
        thiz.css('color', 'inherit');
    }, 250);
}
function updateBrief(){
    $('#right_passages').html($('#passages').html());
}

$(function(){
    // if($('#parent_chapter_id').val() != 'Christian Engineering Solutions'){
    //     //so only in chapters
    //     Sasame = false;
    //     $('#passages').sortable({
    //         handle: '.passage_author'
    //     });
    // }
    // else{
    //     //force height of passages only on home page
    //     document.styleSheets[0].insertRule('.passage_content{max-height:300px}');
    // }

    //search
    $('#search').on('keypress', function(e){
        checkIfFromOtro();
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $.ajax({
                type: 'post',
                url: DOMAIN + '/search/' + fromOtro,
                data: {
                    search: thiz.val(),
                    personal: window.location.href.split('/').at(-2) == 'personal' ? true : false
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                }
            });

        }
    });
    $('#ppe_search').on('keypress', function(e){
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $.ajax({
                type: 'post',
                url: DOMAIN + '/ppe_search/' + fromOtro,
                data: {
                    search: thiz.val(),
                    parent: $('#chief_passage_id').val()
                },
                success: function(data){
                    $('#ppe_queue_view_more').remove();
                    let icon = '<ion-icon title="View More"style="font-size:2em;display:inline-block;padding-bottom:10px;cursor:pointer;"id="ppe_queue_view_more"class=""title="Distraction Free Mode"src="/images/ionicons/add-circle-outline.svg"></ion-icon>';
                    $('#ppe_queue').html(data + icon);
                    page = 1;
                }
            });

        }
    });
    $('#search_profile').on('keypress', function(e){
        $('#search').val($(this).val());
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $.ajax({
                type: 'post',
                url: DOMAIN + '/search_profile/' + fromOtro,
                data: {
                    search: thiz.val(),
                    _id: $('#is_profile').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                }
            });

        }
    });

    $('#search_leaderboard').on('keypress', function(e){
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $.ajax({
                type: 'post',
                url: DOMAIN + '/search_leaderboard/' + fromOtro,
                data: {
                    search: thiz.val()
                },
                success: function(data){
                    $('#leaders').html(data);
                    page = 1;
                }
            });

        }
    });
    $('#search_passage').on('keypress', function(e){
        $('#search').val($(this).val());
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $.ajax({
                type: 'post',
                url: DOMAIN + '/search_passage/' + fromOtro,
                data: {
                    search: thiz.val(),
                    _id: $('#chief_passage_id').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                }
            });

        }
    });
    var scrollTimer = null;
    $(window).scroll(function(){
        $('#scroll-to-bottom').show();
        if(scrollTimer !== null) {
            clearTimeout(scrollTimer);        
        }
        scrollTimer = setTimeout(function() {
            $('#scroll-to-bottom').hide();
        },1750);
    });
    $(document).on('mouseover', '#scroll-to-bottom', function(){
        clearTimeout(scrollTimer);
    });
    $(document).on('mouseleave', '#scroll-to-bottom', function(){
        scrollTimer = setTimeout(function() {
            $('#scroll-to-bottom').hide();
        },1500);
    });
    $(document).on('click', '#scroll-to-bottom', function(){
        $("html, body").animate({ scrollTop: $(document).height() - 1300 }, "slow");
    });

    $(document).on('click', '[id^=star_]', function(){
        var _id = $(this).attr('id').split('_')[1];
        var thiz = $(this);
        var newCount = parseInt($('.star_count_'+_id).text(), 10) + 1;
        $.ajax({
            type: 'post',
            url: DOMAIN + '/star/' + fromOtro,
            data: {
                _id: _id
            },
            success: function(data){
                if(data == "You don't have enough stars to give!"){
                    alert(data);
                }
                else{
                    flashIcon(thiz);
                    $('.star_count_'+_id).text(newCount);
                }
            }
        });
    });
    $(document).on('click', '#graphic_mode', function(){
        var thiz = $(this);
        if(!$('#ppe').is(':visible')){
            thiz.data('active', 'true');
            $('#ppe').show();
            $('#left-side-panel').hide();
            $('#options').show();
            $('.ppe_option').css('display', 'inline-block');
            $('html, body').css({
                overflow: 'hidden'
            });
            $('.book_option').hide();
        }
        else{
            thiz.data('active', 'false');
            $('#ppe').hide();
            $('#options').hide();
            $('.ppe_option').hide();
            $('.book_option').show();
            $('html, body').css({
                overflow: 'scroll'
            });
        }
    });
    $(document).on('click', '#remote_toggle', function(){
        //green
        if($(this).css('color') == 'rgb(0, 128, 0)'){
            $(this).css('color', 'red');
            $.ajax({
                type: 'post',
                url: DOMAIN + '/cesconnect/' + fromOtro,
                data: {},
                success: function(data){
                    window.location.reload();
                }
            });
        }
        else{
            $(this).css('color', 'rgb(0, 128, 0)');
            $.ajax({
                type: 'post',
                url: DOMAIN + '/cesconnect/' + fromOtro,
                data: {},
                success: function(data){
                    window.location.reload();
                }
            });
        }
    });
    $('[id^=update_order_]').on('click', function(){
        var _id = $(this).attr('id').split('_')[1];
        $.ajax({
            type: 'post',
            url: DOMAIN + '/update_chapter_order/' + fromOtro,
            data: {
                passages: JSON.stringify($('#sub_passages').sortable('toArray')),
                chapterID: $('#parent_chapter_id').val()
            },
            success: function(data){
                alert('Updated');
            }
        });
    });



    $('#right_side_select').on('change', function(){
        $('#side_panel_switcher').children().hide();
        switch($(this).val()){
            case 'daemons':
                $('#daemons').show();
                break;
            case 'add':
                $('#add_div').show();
                break;
            case 'brief':
                $('#brief').show();
                updateBrief();
                break;
            case 'bookmarks':
                // updateQueue();
                    $('#bookmarks').show();
                break;
            case 'passages':
                $('#search_passages').show();
                break;
            case 'console':
                $('#console_div').show();
                break;
            case 'edit':
                $('#edit_div').show();
                break;
            case 'leaderboard':
                $('#leaderboard_div').show();
                break;
                break;
            case 'help':
                $('#help_div').show();
                break;
        }
    });
});

//SOCKETS
// var passageID = '6404133eae65f8dc5be79946';
// const socket = io();


// //CORS
// // const socket = io("https://api.example.com", {
// //   withCredentials: true,
// //   extraHeaders: {
// //     "my-custom-header": "abcd"
// //   }
// // });


// //create room
// socket.emit('controlPassage', passageID);
// //recieve response
// socket.on(passageID, function(msg) {
//     console.log(msg);
//   });
// //send message to room
// socket.emit('add', 'Hello');