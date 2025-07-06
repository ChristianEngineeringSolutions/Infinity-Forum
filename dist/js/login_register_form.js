$(function(){
    $(document).on('keyup', '#register_username, .register_username', function(){
        var name = $(this).val();
        $('#register_username_load').text(name);
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/get_username_number',
            url: '/get_username_number',
            data: {
                name: name
            },
            success: function(data){
                var username = name.split(" ").join('.') + "." + data;
                $('#register_username_load').text(username);
                $('#hidden-username').val(username);
            }
        });
    });
    $('#register_username_load').text($('#register_username').val());
    $('#hidden-username').val($('#register_username').val());
    $('#register_username').keyup();
    // if($('#register_username').val() !=== ''){
    //     $('#register_username').keyup();
    // }
});