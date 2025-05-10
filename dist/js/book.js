// import { pdfExporter } from "/quill-to-pdf.js";

var ppeActive = false;

var sessionStorageQueue = false;

var Sasame = true;

var page = 1;

var altIteration = 1;

var altPrevs = [];

var PPEPage = 1;

var DOMAIN;

var fromOtro;

$(function(){
    $(document).on('click', '.open_advanced', function(){
        $('#passage_advanced').slideToggle();
    });
    analyzeImages();
    analyzeVideos();
});

function summonQuill(){
            var toolbarOptions = [
                    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                    ['blockquote', 'code-block'],
                    ['link', 'image'],
                
                    [{ 'header': 1 }, { 'header': 2 }],               // custom button values
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
                    [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
                    [{ 'direction': 'rtl' }],                         // text direction
                
                    [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                
                    [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
                    [{ 'font': [] }],
                    [{ 'align': [] }],
                
                    ['clean']                                         // remove formatting button
                ];
                // Only do if quill container exists (rtf)
                try{
                    var quill = new Quill('#passage_content', {
                    modules: {
                        syntax: true,              // Include syntax module
                        toolbar: toolbarOptions,  // Include button in toolbar
                    },
                    placeholder: 'What are  you creating?',
                    theme: 'snow'
                    });
                    quill.root.innerHTML = document.getElementById('quill-data').value;
                    quill.on('text-change', function(delta, source) {
                        var justHtml = quill.root.innerHTML;
                        if (quill.getLength() > 566836) {
                            quill.deleteText(limit, quill.getLength());
                          }
                        document.getElementById('quill-data').value = justHtml;
                    });
                }
                catch(error){
                    console.log(error);
                }
                finally{
    
                }
        }

function checkIfFromOtro(){
    fromOtro = $('#remote_toggle').data('cesconnect') == false ? '' : '?fromOtro=true';
    if($('#remote_toggle').length < 1){
        fromOtro = '';
    }
}
function syntaxHighlight(){
    var codes = document.getElementsByTagName('pre');
    for (var i=0; i < codes.length; i++) {
        if(codes[i].parentElement.nodeName !== 'CODE-INPUT'){
            console.log('test');
            hljs.highlightBlock(codes[i]);
        }
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
// function updateBrief(){
//     $('#right_passages').html($('#passages').html());
// }

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
    $(document).on('click', '#show_brief', function(){
        $('#right_side_select').val('brief').change();
        $('#side_panel').toggle();
        // $('.blocker').click();
        // $('#side_panel').scrollTop(0);
    });
    $(document).on('click', '#show-filter-options', function(){
        $("#label-select-div").toggle();
        $("#sort-select-div").toggle();
    });
    $(document).on('change', '#label-select-div, #sort-select-div', function(){
        //trigger search
        //TODO: do for messages
        if($('#is_profile').val() == 'false'){
            if($('#chief_passage_id').val() == 'root'){
                $("#search").trigger({ type: "keypress", which: 13 });
            }
            else{
                $("#search_passage").trigger({ type: "keypress", which: 13 });
            }
        }
        else{
            $("#search_profile").trigger({ type: "keypress", which: 13 });
        }
    });
    //search
    $('#search').on('keypress', function(e){
        checkIfFromOtro();
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $('#passage_wrapper').html($('#small-loading').html());
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/search/' + fromOtro,
                url: '/search/',
                data: {
                    search: thiz.val(),
                    personal: window.location.href.split('/').at(-2) == 'personal' ? true : false,
                    whichPage: $('#which-page').val(),
                    label: $('#label-select').val(),
                    sort: $('#sort-select').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                    syntaxHighlight();
                    analyzeImages();
                    analyzeVideos();
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
                // url: DOMAIN + '/ppe_search/' + fromOtro,
                url: '/ppe_search/',
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
            $('#passage_wrapper').html($('#small-loading').html());
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/search_profile/' + fromOtro,
                url: '/search_profile/',
                data: {
                    search: thiz.val(),
                    _id: $('#is_profile').val(),
                    label: $('#label-select').val(),
                    sort: $('#sort-select').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                    syntaxHighlight();
                    analyzeImages();
                    analyzeVideos();
                }
            });

        }
    });
    $('#search_messages').on('keypress', function(e){
        $('#search').val($(this).val());
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $('#passage_wrapper').html($('#small-loading').html());
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/search_messages/' + fromOtro,
                url: '/search_messages/',
                data: {
                    search: thiz.val(),
                    _id: $('#is_profile').val(),
                    label: $('#label-select').val(),
                    sort: $('#sort-select').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                    syntaxHighlight();
                    analyzeImages();
                    analyzeVideos();
                }
            });

        }
    });

    $('#search_leaderboard').on('keypress', function(e){
        //check what page we are on
        var thiz = $(this);
        if(e.which == 13){
            $('#passage_wrapper').html($('#small-loading').html());
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/search_leaderboard/' + fromOtro,
                url: '/search_leaderboard/',
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
            $('#passage_wrapper').html($('#small-loading').html());
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/search_passage/' + fromOtro,
                url: '/search_passage/',
                data: {
                    search: thiz.val(),
                    _id: $('#chief_passage_id').val(),
                    label: $('#label-select').val(),
                    sort: $('#sort-select').val()
                },
                success: function(data){
                    $('#passage_wrapper').html(data);
                    page = 1;
                    syntaxHighlight();
                    analyzeImages();
                    analyzeVideos();
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

    // function isElementInViewport (el) {

    //     // Special bonus for those using jQuery
    //     if (typeof jQuery === "function" && el instanceof jQuery) {
    //         el = el[0];
    //     }

    //     var rect = el.getBoundingClientRect();

    //     return (
    //         rect.top >= 0 &&
    //         rect.left >= 0 &&
    //         rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /* or $(window).height() */
    //         rect.right <= (window.innerWidth || document.documentElement.clientWidth) /* or $(window).width() */
    //     );
    // }

    // function onVisibilityChange(el, callback) {
    //     var old_visible;
    //     return function () {
    //         var visible = isElementInViewport(el);
    //         if (visible != old_visible) {
    //             old_visible = visible;
    //             if (typeof callback == 'function') {
    //                 if(visible){
    //                     callback();
    //                 }
    //             }
    //         }
    //     }
    // }

    // var handler = onVisibilityChange($('#view_more'), function() {
    //     $('#view_more').click();
    // });


    // jQuery
    // $(window).on('DOMContentLoaded load resize scroll', handler);
    var goScroll = true;
    $(window).scroll(function() {
       if($(window).scrollTop() + $(window).height() >= $(document).height() - 850) {
           if(goScroll==true){
               goScroll = false;
               $('#view_more').click();
            }
       }
       else{
        goScroll = true;
       }
    });
    // $(document).on('click', '[id^=star_]', function(){
    //     var _id = $(this).attr('id').split('_')[1];
    //     var thiz = $(this);
    //     var newCount = parseInt($('.star_count_'+_id).text(), 10) + 1;
    //     $.ajax({
    //         type: 'post',
    //         // url: DOMAIN + '/star/' + fromOtro,
    //         url: '/star/',
    //         data: {
    //             _id: _id
    //         },
    //         success: function(data){
    //             if(data == "You don't have enough stars to give!"){
    //                 alert(data);
    //             }
    //             else{
    //                 flashIcon(thiz);
    //                 $('.star_count_'+_id).text(newCount);
    //             }
    //         }
    //     });
    // });
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
            $('#header').css('display', 'block');
            $('#header').css('position', 'relative');
            $('#header').css('display', 'block');
            $('#header').css('z-index', '99999999999');

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
            if($('#top').is(':visible')){
                $('#header').hide()
            }
        }
    });
    $(document).on('click', '#cancel-subscription', function(){
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/unsubscribe',
            url: '/unsubscribe',
            data: {},
            success: function(){
                window.location.reload();
            }
        });
    });
    $(document).on('click', '#remote_toggle', function(){
        //green
        if($(this).css('color') == 'rgb(0, 128, 0)'){
            $(this).css('color', 'red');
            $.ajax({
                type: 'post',
                // url: DOMAIN + '/cesconnect/' + fromOtro,
                url: '/cesconnect/',
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
                url: '/cesconnect/',
                // url: DOMAIN + '/cesconnect/' + fromOtro,
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
            // url: DOMAIN + '/update_chapter_order/' + fromOtro,
            url: '/update_chapter_order/',
            data: {
                passages: JSON.stringify($('#sub_passages').sortable('toArray')),
                chapterID: $('#parent_chapter_id').val()
            },
            success: function(data){
                alert('Updated');
            }
        });
    });


    $(document).on('click', '#filestreamsync', function(){
        $.ajax({
            type: 'post',
            url: '/syncfilestream/',
            // url: DOMAIN + '/syncfilestream/' + fromOtro,
            data: {
                
            },
            success: function(data){
                alert('FileStream Passages Up to date.');
                window.location.reload();
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
                // updateBrief();
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