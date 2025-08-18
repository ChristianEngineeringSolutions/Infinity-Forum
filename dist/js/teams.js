$(function(){
	$(document).on('click', '#create-team', function(){
		popup("Create Team", $('#create-team-form-input').val());
		$('#create-team-form').show();
	});
	$(document).on('click', '#edit-team', function(){
		popup("Edit Team", $('#edit-team-form-input').val());
		$('#edit-team-form').show();
	});
	$(document).on('click', '[id^="delete-team-"]', function(){
		var _id = $(this).attr('id').split('-').at(-1);
		$.ajax({
            // url: DOMAIN + '/update_passage',
            url: '/teams/delete-team',
            type: 'POST',
            data: {
            	teamId: _id
            },
            success: function (data) {
                window.location.href = '/teams';
            }
        });
	});
	$(document).on('submit', '#create-team-form', function(e){
        e.preventDefault();
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/update_passage',
            url: '/teams/create-team',
            type: 'POST',
            data: {
            	name: $('#create-team-name').val(),
            	open: $('#create-team-open').val(),
            	description: $('#create-team-description').val(),
            	usernames: $('#create-team-usernames').val()
            },
            success: function (data) {
                $('#loading').hide();
                $('#teams_list').prepend(data);
                $('#dim').click();
                
            }
        });
    });
    $(document).on('submit', '#edit-team-form', function(e){
        e.preventDefault();
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/update_passage',
            url: '/teams/edit-team',
            type: 'POST',
            data: {
            	_id: $('#edit-team-id').val(),
            	name: $('#edit-team-name').val(),
            	open: $('#edit-team-open').val(),
            	description: $('#edit-team-description').val(),
            	usernames: $('#edit-team-usernames').val()
            },
            success: function (data) {
                window.location.reload();
                
            }
        });
    });
});