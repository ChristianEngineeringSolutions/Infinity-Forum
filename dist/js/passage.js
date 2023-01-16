"use strict"
$(function(){
    $(document).on('click', '.passage_tab_open_advanced', function(e){
        $('.passage_advanced').fadeToggle().css('display', 'inline-block');
    });
});