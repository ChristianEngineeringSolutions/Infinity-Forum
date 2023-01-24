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
        $.ajax({
            type: 'post',
            url: '/transfer_bookmark',
            data: {
                _id: $(thiz).attr('id').split('_')[2],
                tab_id: $('#chief_passage_id').val()
            },
            success: function(data){
                $('#passage_wrapper').prepend(data);
            }
        });
    });
});