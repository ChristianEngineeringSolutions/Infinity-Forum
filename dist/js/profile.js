$(function(){
    // $('#tab_panel').hide();
    $(document).on('keyup', '#register_username', function(){
        var name = $(this).val();
        $('#register_username_load').text(name);
        $.ajax({
            type: 'post',
            url: '/get_username_number',
            data: {
                name: name
            },
            success: function(data){
                if(name !== $('#original_username').val()){
                    $('#register_username_load').text(name + data);
                }
                else{
                    $('#register_username_load').text(name);
                }
            }
        });
    });
    $('#register_username_load').text($('#register_username').val());
    $('#register_username').keyup();
});