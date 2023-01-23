"use strict"
$(function(){
    $('#passage_wrapper').sortable();
    //sub passages are only hidden for index and search
    var inRoot = $('#chief_passage_id').val() === 'root';
    if($('#chief_passage_id').val() != 'root'){
        $('.sub_passages').show();
    }
    $(document).on('click', '.passage_tab_open_advanced', function(e){
        $('.passage_advanced').fadeToggle().css('display', 'inline-block');
    });
    $(document).on('click', '#add_passage_button', function(e){
        //create a passage and then show it
        $.ajax({
            type: 'post',
            url: '/create_passage/',
            data: {
                passageID: $('#chief_passage_id').val()
            },
            success: function(data){
                $('#passage_wrapper').prepend(data);
            }
        });
    });
    function getPassageId(thiz){
        //passage_id is the last part of the html id
        return $(thiz).attr('id').split('_')[$(thiz).attr('id').split('_').length - 1];
    }
    function getPassageTitle(_id){
        return $('#passage_title_'+_id).val();
    }
    function thisPassage(thiz){
        return $('#passage_' + getPassageId(thiz));
    }
    $(document).on('click', '[id^="passage_delete_"]', function(e){
        var _id = getPassageId(this);
        $.ajax({
            type: 'post',
            url: '/delete_passage/',
            data: {
                _id: _id
            },
            success: function(data){
                $('#passage_'+_id).remove();
            }
        });
    });
    $(document).on('click', '[id^="passage_more_"]', function(e){
        let _id = getPassageId(this);
        let title = getPassageTitle(_id) == '' ? 'Untitled' : getPassageTitle(_id);
        let href = '/passage/'+ title +'/' + _id;
        $('.active_tab').html('<span class="tab_delete">X</span>' + title);
        let tab_id = $('.active_tab').attr('id');
        localStorage.setItem(tab_id, JSON.stringify({text: title, href: href}));
        localStorage.setItem('active_tab', tab_id);
        window.location.href = href;
    });
    $(document).on('click', '[id^="passage_copy_"]', function(e){
        var _id = getPassageId(this);
        var thiz = $(this);
        $.ajax({
            type: 'post',
            url: '/copy_passage',
            data: {
                _id: _id,
            },
            success: function(data){
                // alert(data);
                flashIcon($('#passage_copy_' + _id), 'green');
            }
        });
    });
    $(document).on('click', '[id^=passage_update_]', function(){
        var _id = getPassageId(this);
        var form = thisPassage(this).children('.passage_form');
        var formData = form.serializeArray();
        var properData = {};
        //make array object
        formData.forEach((tup)=>{
            properData[tup['name']] = tup['value'];
        });
        var thiz = $(this);
        $.ajax({
            type: 'post',
            url: '/update_passage',
            data: {
                _id: _id,
                formData: properData
            },
            success: function(data){
                thisPassage(thiz).replaceWith(data);
                flashIcon($('#passage_update_' + _id), 'green');
            }
        });
        // var content = $(this).parent().siblings('.passage_content');
        // var text;
        // if(content.prop('tagName') == 'TEXTAREA'){
        //     editor = content.next('.CodeMirror').get(0).CodeMirror;
        //     text = editor.getValue();
        // }
        // else if(content.children('.ql-editor').length){
        //     text = content.children('.ql-editor').html();
        // }
        // else{
        //     text = content.text();
        // }
        // var thiz = $(this);
        // $.ajax({
        //     type: 'post',
        //     url: '/update_passage_content',
        //     data: {
        //         _id: _id,
        //         content: text
        //     },
        //     success: function(data){
        //         flashIcon(thiz, 'gold');
        //     }
        // });
    });
    $(document).on('click', '[id^=passage_flag_]', function(){
        var _id = getPassageId(this);
        $.ajax({
            type: 'post',
            url: '/flag_passage',
            data: {
                _id: _id
            },
            success: function(data){
                
            }
        });
    });
});