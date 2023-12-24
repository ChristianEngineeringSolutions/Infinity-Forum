$(function(){
    // $('#tab_panel').hide();
    $(document).on('keyup', '#register_username', function(){
        var name = $(this).val();
        $('#register_username_load').text(name);
        $.ajax({
            type: 'post',
            url: DOMAIN + '/get_username_number',
            data: {
                name: name
            },
            success: function(data){
                if(name !== $('#oldName').val()){
                    $('#newUsername').val(name.split(' ').join('.') + '.' +  data);
                    $('#register_username_load').text($('#newUsername').val());
                }
                else{
                    $('#register_username_load').text($('#oldUsername').val());
                }
            }
        });
    });
    // $('#register_username_load').text($('#register_username').val());
    $(document).on('click', '#change-photo', function(){
        $('#update_profile_picture').submit();
    });
});