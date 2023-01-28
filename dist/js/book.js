var ppeActive = false;

var sessionStorageQueue = false;

var Sasame = true;

if($('#parent_chapter_id').val() != 'Christian Engineering Solutions'){
    //so only in chapters
    Sasame = false;
    $('#passages').sortable({
        handle: '.passage_author'
    });
}
else{
    //force height of passages only on home page
    document.styleSheets[0].insertRule('.passage_content{max-height:300px}');
}
//For forms
$.fn.serializeObject = function() {
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name]) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};

function isMobile(){
    return window.matchMedia("(max-width: 550px)").matches;
}
  $( function() {
    if(!isMobile()){
        $(document).tooltip();
    }
  } );
//search
$('[id^="chapter_search_"]').on('keypress', function(e){
    $('#search_val').val($(this).val());
    if(e.which == 13){
        $.ajax({
            type: 'post',
            url: '/search/',
            data: {
                title: $(this).val()
            },
            success: function(data){
                $('.category').not('#chapter_load').not('#chapter_load_mobile').remove();
                $('#categories').append(data);
            }
        });

    }
});

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
$(document).on('click', '.passage_mutate', function(){
    flashIcon($(this), 'red');
    var content = $(this).parent().siblings('.passage_content').text();
    $(this)
    .parent()
    .parent()
    .append('<input class="reserve"type="hidden"value="'+content+'"/>');
    var newContent = $(this).parent().siblings('.reserve').val();
    newContent = share.mutate(newContent, ' ');
    $(this).parent().siblings('.passage_content').html(newContent);
});
$(document).on('click', '.image_upload_icon', function(){
    $(this).css('color', 'red');
    $(this).parent().siblings('.hidden_upload').click();
});

function scriptLoaded(url) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length; i--;) {
        if (scripts[i].src == url) return true;
    }
    return false;
}
function flashIcon(thiz, color='gold'){
    thiz.css('color', color);
    setTimeout(function(){
        thiz.css('color', 'inherit');
    }, 250);
}
$(document).on('click', '[id^=star_]', function(){
    var _id = $(this).attr('id').split('_')[1];
    var thiz = $(this);
    var newCount = parseInt($('.star_count_'+_id).text(), 10) + 1;
    $.ajax({
        type: 'post',
        url: '/star/',
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
$('[id^=update_order_]').on('click', function(){
    var _id = $(this).attr('id').split('_')[1];
    $.ajax({
        type: 'post',
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


function updateBrief(){
    $('#right_passages').html($('#passages').html());
}

$('#right_side_select').on('change', function(){
    $('#side_panel_switcher').children().hide();
    switch($(this).val()){
        case 'chapters':
            $('#categories').show();
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