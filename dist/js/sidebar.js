//update bookmarks display in sidebar
function updateBookmarks(){
    $.ajax({
        type: 'get',
        url: '/get_bookmarks',
        // url: /*DOMAIN + */'/get_bookmarks',
        success: function(data){
            $('#bookmarks').html(data);
        }
    });
}
function updateDaemons(){
    $.ajax({
        type: 'get',
        url: '/get_daemons',
        // url: /*DOMAIN + */'/get_daemons',
        success: function(data){
            $('#daemons').html(data);
        }
    });
}
$(function(){
    $('#daemons').sortable({
        update: function(){
            var orderList = [];
            orderList = $('#daemons').sortable('toArray');
            orderList.forEach(function(p, i){
                orderList[i] = orderList[i].split('_')[1];
            });
            $.ajax({
                url: DOMAIN + '/sort_daemons',
                type: 'POST',
                data: {
                    daemonOrder: JSON.stringify(orderList)
                },
                success: function (data) {
                    alert(data);
                }
            });
        }
    });
    updateBookmarks();
    updateDaemons();
    $(document).on('click', '[id^=add_daemon_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        $.ajax({
            type: 'post',
            url: '/add_daemon',
            // url: DOMAIN + '/add_daemon',
            data: {
                _id: _id,
            },
            success: function(data){
                flashIcon($('#add_daemon_' + _id), 'green');
                window.location.reload();
            }
        });
    });
    $(document).on('click', '[id^=remove_daemon_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/remove_daemon',
            url: '/remove_daemon',
            data: {
                _id: _id,
            },
            success: function(data){
                window.location.reload();
            }
        });
    });
    $(document).on('click', '[id^=transfer_bookmark_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        var _chief = $('#chief_passage_id').val();
        var focus = false;
        if($('.new-sources:visible').length > 0){
            //they're adding to a passage
            focus = true;
            _chief = $('.new-sources:visible').attr('id').split('-').at(-1);
        }
        $.ajax({
            type: 'post',
            url: '/transfer_bookmark',
            // url: DOMAIN + '/transfer_bookmark',
            data: {
                _id: _id,
                parent: _chief,
                which: $('#which-page').val() || 's',
                focus: focus
            },
            success: function(data){
                flashIcon($('#transfer_bookmark_' + _id), 'green');
                if(!focus){
                    if($('#which-page').val() == 'thread' || $('#which-page').val() == 'cat'){
                        if($('#which-page').val() == 'thread')
                        $('#thread-passages').append(data);
                        else if($('#which-page').val() == 'cat')
                            $(data).insertAfter('#first-cat');
                    }
                    else{
                        if(_chief == 'root'){
                            $('#passage_wrapper').prepend(data);
                        }
                        else{
                            $('#passage_wrapper').append(data);
                        }
                    }
                    syntaxHighlight();
                }
                else{
                    $('.new-sources:visible').append(data);
                    var token = $('.new-sources:visible').children().last().data('token');
                    var title = $('.new-sources:visible').children().last().data('title');
                    //add source to sourcelist client side
                    var ID = $('.new-sources:visible').attr('id').split('-').at(-1);
                    $('#sourcelist_'+ID).append('<div class="passage_source_'+ID+'"><a target="_blank"href="/passage/'+title+'/'+token+'">'+title+'</a></div>');
                }
            }
        });
    });
    $(document).on('click', '[id^=remove_bookmark_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        $.ajax({
            type: 'post',
            url: '/remove_bookmark',
            // url: DOMAIN + '/remove_bookmark',
            data: {
                _id: _id,
            },
            success: function(data){
                $(thiz).parent().parent().remove();
            }
        });
    });
    $(document).on('click', '[id^=view_bookmark_]', function(){
        var thiz = this;
        window.location.href = "/passage/" + encodeURIComponent($(this).data('title')) + '/' + $(this).attr('id').split('_').at(-1);
    });
    $(document).on('click', '[id^=view_daemon_]', function(){
        var thiz = this;
        window.location.href = "/passage/" + encodeURIComponent($(this).data('title')) + '/' + $(this).attr('id').split('_').at(-1);
    });
    $(document).on('click', '#side_panel_close', function(){
        $('#side_panel').hide();
    });
});