$(function(){
    // localStorage.clear();
    console.log(localStorage.getItem('num_tabs'));
    if(localStorage.getItem('num_tabs') === null){
        localStorage.setItem('num_tabs', 1);
        localStorage.setItem('tab_' + 1, JSON.stringify({text: 'Home', href: '/'}));
    }
    var num_tabs = parseInt(localStorage.getItem('num_tabs'));
    function addTab(num){
        let tab_data = JSON.parse(localStorage.getItem('tab_' + num));
        $('#new_tab').before(' <li id="tab_'+(num)+'" data-href="'+tab_data.href+'" class="tab">'+tab_data.text+'</li> ');
    }
    $(document).on('click', '#new_tab', function(){
        let tab_num = num_tabs + 1; 
        localStorage.setItem('num_tabs', tab_num);
        var text = 'New Tab';
        if($('.tab').length - 1 === 0){
            text = 'Home';
        }
        localStorage.setItem('tab_' + tab_num, JSON.stringify({text: text, href: '/'}));
        addTab(tab_num);
        console.log(localStorage.getItem('num_tabs'));
    });
    // if($('.tab').length - 1 === 0){
    //     $('#new_tab').click();
    // }
    for(let i = 1; i <= num_tabs; ++i){
        addTab(i);
        let tab_data = JSON.parse(localStorage.getItem('tab_' + i));
        if(tab_data !== null){
            $('#tab_' + i).text(tab_data.text);
            $('#tab_' + i).data('href', tab_data.href);
        }
    }
    let active_tab_id = localStorage.getItem('active_tab');
    let active_tab_data = JSON.parse(localStorage.getItem(active_tab_id));
    if(active_tab_data !== null){
        $('#' + active_tab_id).text(active_tab_data.text);
        $('#' + active_tab_id).data('href', active_tab_data.href);
    }
    if(localStorage.getItem('active_tab') === null){
        localStorage.setItem('active_tab', 'tab_1');
    }
    $('#' + localStorage.getItem('active_tab')).addClass('active_tab');
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
        var href = window.location.href.split('/');
        let title = href[href.length - 2];
        let passage_id = href[href.length - 1];
        var _id = $(this).attr('id');
        console.log(_id);
        href = title + '/' + passage_id;
        if($(this).attr('id') !== 'new_tab'){
            $('.tab:not(#new_tab)').css('background', 'gold');
            $(this).css('background', 'yellow');
            localStorage.setItem('active_tab', _id);
            window.location.href = $(this).data('href');
            // localStorage.setItem(_id, href);
            // $(this).text(title);
            // $.ajax({
            //     type: 'get',
            //     url: '/tab/' + href,
            //     success: function(data){
            //         $('#passage_wrapper').html(data);
            //     }
            // });
        }
    });
});