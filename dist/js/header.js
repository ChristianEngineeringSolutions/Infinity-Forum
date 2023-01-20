$(function(){
    $(document).on('click', '#login_register_link', function(){
        window.location.href = "/loginform";
    });
    $(document).on('click', '#home_link', function(){
        window.location.href = "/";
    });
    $(document).on('click', '#profile_link', function(){
        window.location.href = "/profile/";
    });
    $(document).on('click', '#help_link', function(){
        
    });
    $(document).on('click', '#new_tab', function(){
        $(this).before(' <li class="tab">Tab</li> ');
    });
    $('.tab').droppable({
        drop: () => {
            // alert('dropped');
        },
        over: (event, ui) => {
            $('#' + event.target.id).css('background', 'yellow');
        },
        out: (event) => {
            $('#' + event.target.id).css('background', 'gold');
        },
        tolerance: 'pointer'
    });
    $(document).on('click', '.tab', function(){
        var href = $(this).data('href');
        $.ajax({
            type: 'get',
            url: '/tab/' + href,
            success: function(data){
                $('#passage_wrapper').html(data);
            }
        });
    });
});