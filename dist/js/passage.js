"use strict"
$(function(){
    $(document).on('click', '.passage_tab_open_advanced', function(e){
        $('.passage_advanced').fadeToggle().css('display', 'inline-block');
    });
    $(document).on('click', '#add_passage_button', function(e){
        //create a passage and then show it
        $.ajax({
            type: 'post',
            url: '/create_passage/',
            success: function(data){
                $('#passage_wrapper').prepend(data);
            }
        });
    });
    $(document).on('click', '.passage_delete', function(e){
        $.ajax({
            type: 'post',
            url: '/delete_passage/',
            success: function(data){
                
            }
        });
    });
    $(document).on('click', '[id^="passage_more_"]', function(e){
        window.location.href = '/passage/' + $(this).attr('id').split('_')[2];
    });
});