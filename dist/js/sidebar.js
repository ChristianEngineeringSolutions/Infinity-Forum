//update bookmarks display in sidebar
function updateBookmarks(){
    $.ajax({
        type: 'get',
        url: '/get_bookmarks',
        success: function(data){
            $('#bookmarks').html(data);
        }
    });
}
function updateDaemons(){
    $.ajax({
        type: 'get',
        url: '/get_daemons',
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
                url: '/sort_daemons',
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
        $.ajax({
            type: 'post',
            url: '/transfer_bookmark',
            data: {
                _id: _id,
                parent: _chief
            },
            success: function(data){
                flashIcon($('#transfer_bookmark_' + _id), 'green');
                $('#passage_wrapper').append(data);
            }
        });
    });
    $(document).on('click', '[id^=remove_bookmark_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        $.ajax({
            type: 'post',
            url: '/remove_bookmark',
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
        window.location.href = "/passage/" + $(this).data('title') + '/' + $(this).attr('id').split('_').at(-1);
    });
    $(document).on('click', '[id^=view_daemon_]', function(){
        var thiz = this;
        window.location.href = "/passage/" + $(this).data('title') + '/' + $(this).attr('id').split('_').at(-1);
    });
    $(document).on('click', '#side_panel_close', function(){
        $('#side_panel').hide();
    });
});