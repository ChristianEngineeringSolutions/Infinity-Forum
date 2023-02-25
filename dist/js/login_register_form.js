$(function(){
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
                $('#register_username_load').text(name.split(" ").join('.') + "." + data);
            }
        });
    });
    $('#register_username_load').text($('#register_username').val());
    $('#register_username').keyup();
});