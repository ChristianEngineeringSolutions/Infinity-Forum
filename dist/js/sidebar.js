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
$(function(){
    updateBookmarks();
    $(document).on('click', '[id^=transfer_bookmark_]', function(){
        var thiz = this;
        var _id = $(thiz).attr('id').split('_')[2];
        $.ajax({
            type: 'post',
            url: '/transfer_bookmark',
            data: {
                _id: _id,
                parent: $('#chief_passage_id').val()
            },
            success: function(data){
                flashIcon($('#transfer_bookmark_' + _id), 'green');
                $('#passage_wrapper').prepend(data);
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
    $(document).on('click', '#side_panel_close', function(){
        $('#side_panel').hide();
    });
});