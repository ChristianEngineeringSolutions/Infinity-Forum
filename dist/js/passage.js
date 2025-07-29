"use strict";

// const { default: hljs } = require("highlight.js");
//return brief for current passage list
    function getBrief(clip=false){
        $('#brief-passages').html('');
        $('.passage:not(.view-more)').each(function(i){
            var title = $(this).children('.detail-div').children('.p-padding-box').children('.detail_title').text();
            title = title == '' ? 'Untitled' : title;
            var _id = $(this).attr('id').split('_').at(-1);
            if(i != 0){
                $('#brief-passages').append('<h2 id="brief-passage-'+_id+'"class="brief-passage"><a href="/passage/'+encodeURIComponent(title)+'/'+_id+'">' + title + '</a></h2>');
            }
            else{

            }
        });
        if(clip){
            $('#brief-passages').children().last().remove();
        }
        if(!$('brief-passages').hasClass('ui-sortable')){
            $('#brief-passages').sortable({
                update: function(event, ui){
                    var orderList = $('#brief-passages').sortable('toArray');
                    orderList.forEach(function(p, i){
                        orderList[i] = orderList[i].split('-').at(-1);
                    });
                    // var new_locations = $(this).find('.brief-passage').map(function(i, el) {
                    //     return $(el).attr('id').split('-').at(-1);
                    //   }).get()
                    reorder(orderList, $('#sub_passages'));
                }
            });
        }
        function reorder(orderArray, elementContainer)
        {
            $.each(orderArray, function(key, val){
                elementContainer.append($("#passage_"+val));
            });
        }
        //get if chapter is public or private
        //to see if we should allow sorting

    }
    function highlightPageNumber(){
        if(!isNaN(window.location.href.split('/').at(-1))){
            var num = window.location.href.split('/').at(-1);
            $('.pnum').css('font-weight', 'normal');
            $('.pnum-'+num).css('font-weight', 'bolder');
        }else{
            $('.pnum').css('font-weight', 'normal');
            $('.pnum-1').css('font-weight', 'bolder');
        }
    }
$(function(){
    highlightPageNumber();
    // $('.passage').draggable();
    hljs.configure({   // optionally configure hljs
        languages: ['javascript', 'ruby', 'python', 'cpp', 'html', 'css', 'r', 'c', 'php']
      });
      window.onload = function() {
        syntaxHighlight();
    };
    $('#sub_passages').sortable({
        handle: '.passage_options'
    });
    var languages = [
        "javascript",
        "rich",
        "python",
        "mixed",
        "daemon",
        "html",
        "css",
    ];
    $('.passage_lang').autocomplete({
        source: languages,
        minLength: 0
    }).on('focus', function() { $(this).keydown(); });
    //sub passages are only hidden for index and search
    var inRoot = $('#chief_passage_id').val() === 'root';
    if($('#chief_passage_id').val() != 'root'){
        $('.sub_passages').show();
    }
    getBrief();
    $(document).on('click', '#show_passage_info', function(){
        popup("Passage Info", "<br>ID: " + $(this).data('id'));
    });
    $(document).on('click', '[id^=watch-]', function(){
        var passage = $(this).attr('id').split('-').at(-1);
        var thiz = $(this);
        $.ajax({
            type: 'post',
            url: '/watch',
            data: {
                passage: passage
            },
            success: function(data){
                if(thiz.css('color') == 'rgb(255, 255, 255)'){
                    thiz.css('color', 'gold');
                }
                else if(thiz.css('color') == 'rgb(255, 215, 0)'){
                    thiz.css('color', 'white');
                }
            }
        });
    });
    $(document).on('click', '[id^="passage_executable_"]', function(e){
        let _id = $(this).attr('id').split('_').at(-1);
    });
    $(document).on('click', '[id^="passage_edit_"]', function(e){
        var _id = $(this).attr('id').split('_').at(-1);
        if($(this).data('quill') == false){
            // hljs.configure({   // optionally configure hljs
            //     languages: ['javascript', 'ruby', 'python', 'cpp', 'html', 'css', 'r', 'c', 'php']
            // });
            var toolbarOptions = [
                ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                ['blockquote', 'code-block'],
                ['link', 'image'],
            
                [{ 'header': 1 }, { 'header': 2 }],               // custom button values
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
                [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
                [{ 'direction': 'rtl' }],                         // text direction
            
                [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
            
                [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
                [{ 'font': [] }],
                [{ 'align': [] }],
            
                ['clean']                                         // remove formatting button
            ];
            // Only do if quill container exists (rtf)
            try{
                var quill = new Quill('#passage_content_' + _id, {
                modules: {
                    syntax: true,              // Include syntax module
                    toolbar: toolbarOptions,  // Include button in toolbar
                },
                theme: 'snow'
                });
                quill.root.innerHTML = document.getElementById('quill-data-' + _id).value;
                quill.on('text-change', function(delta, source) {
                    var justHtml = quill.root.innerHTML;
                    if (quill.getLength() > 566836) {
                        quill.deleteText(limit, quill.getLength());
                      }
                    document.getElementById('quill-data-' + _id).value = justHtml;
                });
            }
            catch(error){
                console.log(error);
            }
            finally{

            }
            $(this).data('quill', true);
        }
        $('.display_data_' + _id).toggle();
        $('#passage_form_' + _id).toggle();
        if($('#editor-label').val() == 'Product'){
            $('#product-form-'+_id).html(productFormHTML);
        }
    });
    $(document).on('click', '[id^="make_mainfile_"]', function(){
        var thiz = $(this);
        $.ajax({
            type: 'post',
            url: '/makeMainFile',
            // url: DOMAIN + '/makeMainFile',
            data: {
                _id: thiz.attr('id').split('_').at(-1)
            },
            success: function(data){
                alert("Done.");
            }
        });
    });

    // $(document).on('click', '.passage_tab_open_advanced', function(e){
    //     $('.passage_advanced').fadeToggle().css('display', 'inline-block');
    // });
    $(document).on('click', '[id^="passage_executable_"]', function(e){
        let _id = $(this).attr('id').split('_').at(-1);
        $('#passage_advanced_' + _id).fadeToggle();
    });
    $(document).on('click', '[id^="passage_details_executable_"]', function(e){
        let _id = $(this).attr('id').split('_').at(-1);
        $('#passage_details_advanced_' + _id).fadeToggle();
    });
    $(document).on('change', '[id^="passage_file_"]', function(e){
        let _id = $(this).attr('id').split('_').at(-1);
        var mimeType = $(this)[0].files[0].type.split('/' + fromOtro)[0];
        var isSVG = false;
        if($(this)[0].files[0].type.split('/' + fromOtro)[0] == 'image'
        && $(this)[0].files[0].type.split('+')[0].split('/' + fromOtro)[1] == 'svg'){
            isSVG = true;
            mimeType = 'svg';
        }
        else{
            isSVG = false;
        }
        var file = $(this)[0].files[0];
        //create temp source link from uploaded file
        var srcLink = URL.createObjectURL(file);
        var thiz = $(this);
        switch(mimeType){
            case 'image':
                //set src
                $('#thumbnail_image_' + _id).attr('src', srcLink);
            break;
            //inject into 3js and cut from canvas to save thumbnail
            case 'model':
                //create scene in three js
                const scene = new THREE.Scene();
                const camera = new THREE.PerspectiveCamera( 75, 300 / 300, 0.1, 1000 );

                const renderer = new THREE.WebGLRenderer();
                renderer.domElement.id = "model_thumbnail_canvas_" + _id;
                renderer.domElement.style = "display:none;";
                renderer.setSize( 300, 300 );
                thiz.after(renderer.domElement);
                //load model into scene
                var loader = new THREE.GLTFLoader();
                loader.load(srcLink, function(data){
                    scene.add( data.scene );
                    camera.position.z = 5;
                    //make sure there is light to see the object
                    var light = new THREE.PointLight( 0xffffcc, 20, 200 );
                    light.position.set( 4, 30, -20 );
                    scene.add( light );

                    var light2 = new THREE.AmbientLight( 0x20202A, 20, 100 );
                    light2.position.set( 30, -10, 30 );
                    scene.add( light2 );
                    renderer.render(scene, camera);
                    //save snapshot of canvas to thumbnail field as data url
                    var base64Image = renderer.domElement.toDataURL();
                    $('#thumbnail_image_' + _id).attr('src', base64Image);
                    $('#thumbnail_clip_' + _id).val(base64Image);
                });
            break;
            case 'svg':
                // inject svg into canvas and save image as thumbnail
                const canvas = document.getElementById('thumbnail_canvas_' + _id);
                var ctx = canvas.getContext("2d");
                var img = new Image();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0);
                    var thumbnail = canvas.toDataURL();
                    $.ajax({
                        type: 'post',
                        url: DOMAIN + '/update_thumbnail/' + fromOtro,
                        data: {
                            passageID: _id,
                            thumbnail: thumbnail
                        },
                        success: function(data){
                            // alert(data);
                        }
                    });
                    $('#thumbnail_image_' + _id).attr('src', thumbnail);
                    $('#thumbnail_clip_' + _id).val(thumbnail);
                }
                img.src = srcLink;
            break;
        }
        $('#passage_thumbnail_' + _id).fadeIn();
    });
    $(document).on('click', '[id^="buy-product-button-"]', function(e){
        var thiz = $(this);
        $.ajax({
            type: 'get',
            data: {
                _id: thiz.attr('id').split('-').at(-1)
            },
            success: function(data){
                window.location.href = data;
            }
        });
    });
    const productFormHTML = `
        Price: <input type="number" name="price"/><br>
        Contains screen bigger than 4 inches diagonally (phones excluded) or cathode ray tube(s) <input type="checkbox" name="ceds"/><br>
        Contains or is new tires <input type="checkbox" name="new-tires"/><br>
        Contains smoking, tobacco, marijuana, or alcoholic beverage products <input type="checkbox" name="drugs"/>
    `;
    $(document).on('change', '#editor-label', function(e){
        //change label color
        switch($(this).val()){
            case 'Project':
            case 'Idea':
            case 'Database':
            case 'Folder':
            case 'Miscellaneous':
                $('#editor-label-color').css('color', 'red');
                break;
            case 'Social':
            case 'Public Folder':
            case 'Product':
            case 'Question':
            case 'Comment':
            case 'Task':
            case 'Challenge':
            case 'Product':
            case 'Commission':
                $('#editor-label-color').css('color', 'green');
                break;
            case 'Forum':
                $('#editor-label-color').css('color', 'brown');
                break;
        }
        //add/remove product details
        if($(this).val() == 'Product'){
            $('#product-form').html(productFormHTML);
        }else{
            $('#product-form').html('');
        }
    });
    $(document).on('click', '[id^="select-answer-"]', function(e){
        var id = $(this).attr('id').split('-').at(-1);
        $.ajax({
            type: 'post',
            url: '/select-answer',
            data: {
                answer: id,
            },
            success: function(data){
                window.location.reload();
            }
        });
    });
    $(document).on('click', '[id^="add-reward-"]', function(e){
        var id = $(this).attr('id').split('-').at(-1);
        $('#reward-form-'+id).slideToggle();
    });
    $(document).on('click', '[id^="increase-reward-"]', function(e){
        var id = $(this).attr('id').split('-').at(-1);
        var value = $('#reward-input-'+id).val();
        if(isNaN(value) || value == '' || Number(value) <= 0){
            alert("Please enter a valid number greater than 0.");
        }
        $.ajax({
            type: 'post',
            url: '/increase-reward',
            data: {
                value: value,
                _id: id
            },
            success: function(data){
                if(data == 'Reward Increased.'){
                    $('#reward-ticker-'+id).text(Number($('#reward-ticker-'+id).text()) + Number(value));
                }
                alert(data);
            }
        });
    });
    $(document).on('change', '[id^="passage_showbestof_"]', function(e){
        var ID = $(this).attr('id').split('_').at(-1);
        var thiz = $(this);
        console.log($(this).is(':checked'));
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/create_passage/' + fromOtro,
            url: '/show-bestof/',
            data: {
                _id: ID,
                checked: thiz.is(':checked')
            },
            success: function(data){
                thisPassage(thiz, '_').replaceWith(data);
            }
        });
        
    });
    $(document).on('change', '[id^="passage_same_users_"]', function(e){
        var ID = $(this).attr('id').split('_').at(-1);
        var thiz = $(this);
        console.log($(this).is(':checked'));
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/create_passage/' + fromOtro,
            url: '/same-users/',
            data: {
                _id: ID,
                checked: thiz.is(':checked')
            },
            success: function(data){
                
            }
        });
        
    });
    $(document).on('change', '[id^="passage_same_collabers_"]', function(e){
        var ID = $(this).attr('id').split('_').at(-1);
        var thiz = $(this);
        console.log($(this).is(':checked'));
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/create_passage/' + fromOtro,
            url: '/same-collabers/',
            data: {
                _id: ID,
                checked: thiz.is(':checked')
            },
            success: function(data){

            }
        });
        
    });
    $(document).on('change', '[id^="passage_same_sources_"]', function(e){
        var ID = $(this).attr('id').split('_').at(-1);
        var thiz = $(this);
        console.log($(this).is(':checked'));
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/create_passage/' + fromOtro,
            url: '/same-sources/',
            data: {
                _id: ID,
                checked: thiz.is(':checked')
            },
            success: function(data){
                
            }
        });
        
    });
    $(document).on('click', '#add_passage_button', function(e){
        var whichPage = $('#which-page').val();
        var chief = $('#chief_passage_id').val();
        var title = whichPage == 'market' ? 'New Product' : "New Post";
        popup(title, $('#clean_editor').val());
        if($('.popup').css('position') == 'absolute'){
            $('.popup').css('top', $(window).scrollTop() + 'px');
        }
        $('#passage_form').show();
        if($('#is-root').length > 0){
            var isRoot = $('#is-root').val();
            var parentLabel = $("#parent-label").val();
            var parentPublic = $("#parent-public").val();
            if(isRoot == 'false'){
                if(parentPublic == 'true'){

                }else{
                    $('#editor-label').val(parentLabel).change();
                    if(whichPage == 'comments'){
                        $('#editor-label').hide();
                        $('#editor-label-color').hide();
                    }
                }
            }
            if(whichPage == 'market'){
                $('#editor-label').hide();
                $('#editor-label-color').hide();
                $('#product-form').html(productFormHTML);
            }
        }
        else{
            isRoot = 'true';
        }
        summonQuill();
        //create a passage and then show it
        // alert(DOMAIN);
        // alert(fromOtro);
        // $.ajax({
        //     type: 'post',
        //     // url: DOMAIN + '/create_passage/' + fromOtro,
        //     url: '/create_passage/',
        //     data: {
        //         passageID: chief
        //     },
        //     success: function(data){
        //         if(chief == 'root'){
        //             $('#passage_wrapper').prepend(data);
        //         }
        //         else{
        //             $('#passage_wrapper').append(data);
        //         }
        //     }
        // });
    });
    function getPassageId(thiz, separator='_'){
        //passage_id is the last part of the html id
        return $(thiz).attr('id').split(separator)[$(thiz).attr('id').split(separator).length - 1];
    }
    function getDashPassageID(thiz){
        //passage_id is the last part of the html id
        return $(thiz).attr('id').split('-').at(-1);
    }
    function getPassageTitle(_id){
        return encodeURIComponent($('#passage_title_'+_id).val());
    }
    function thisPassage(thiz, separator='_'){
        // console.log(getPassageId(thiz, separator));
        return $('#passage_' + getPassageId(thiz, separator));
    }
    $(document).on('click', '[id^="passage-delete-"]', function(e){
        var _id = $(this).attr('id').split('-').at(-1);
        $('#passage_'+_id).remove();
        $('.close-modal').click();
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/delete_passage/' + fromOtro,
            url: '/delete_passage/',
            data: {
                _id: _id
            },
            success: function(data){
                if(_id == $('#chief_passage_id').val()){
                    window.location.reload();
                }
                // $('#passage_'+_id).remove();
                // $('.close-modal').click();
            }
        });
    });
    $(document).on('click', '[id^="passage-dprofile-"]', function(e){
        var _id = $(this).attr('id').split('-').at(-1);
        $('#passage_'+$(this).data('passage-id')).remove();
        $('.close-modal').click();
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/delete_passage/' + fromOtro,
            url: '/delete-profile/',
            data: {
                _id: _id
            },
            success: function(data){
                alert(data);
                window.location.reload();
                // $('#passage_'+_id).remove();
                // $('.close-modal').click();
            }
        });
    });
    $(document).on('click', '[id^="passage_delete_"]', function(e){
        var _id = getPassageId(this);
        $('#passage_'+_id).remove();
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/delete_passage/' + fromOtro,
            url: '/delete_passage/',
            data: {
                _id: _id
            },
            success: function(data){
                if(_id == $('#chief_passage_id').val()){
                    window.location.reload();
                }
            }
        });
    });
    $(document).on('click', '[id^="passage_alternate_"]', function(e){
        var _id = getPassageId(this);
        altPrevs.push(_id);
        var thiz = $(this);
        var pos = getAllSubPassageIDs().indexOf(_id);
        $.ajax({
            type: 'get',
            url: '/alternate/',
            // url: DOMAIN + '/alternate/' + fromOtro,
            data: {
                passageID: _id,
                parentID: $('#chief_passage_id').val(),
                iteration: altIteration++,
                position: pos,
                altPrevs: altPrevs
            },
            success: function(data){
                //UPDATE TODO
                //replace entire passage list
                //\UPDATE TODO
                if(data != 'restart'){
                    // if($('#passage_'+(altIteration - 2)+'_'+_id).length){
                    //     $('#passage_'+(altIteration - 2)+'_'+_id).replaceWith(data);
                    // }
                    // else{
                    //     $('#passage_'+_id).replaceWith(data);
                    // }
                    $('#passage_wrapper').html(data);
                    $('#sub_passages').sortable({
                        handle: '.passage_options'
                    });
                }
                //UNCOMMENT!!!
                else{
                    altIteration = 0;
                    thiz.click();
                }
                $('#save-alternate-' + $('#chief_passage_id').val()).show();
            }
        });
    });
    $(document).on('click', '[id^="passage-show-more-"]', function(e){
        var _id = getDashPassageID(this);
        $('#passage-display-more-' + _id).toggle();
    });
    $(document).on('click', '[id^="save-alternate-"]', function(e){
        var _id = getDashPassageID(this);
        var thiz = $(this);
        var orderList = [];
        if($('#sub_passages').length){
            orderList = $('#sub_passages').sortable('toArray');
            orderList.forEach(function(p, i){
                orderList[i] = orderList[i].split('_').at(-1);
            });
        }
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/save_alternate/' + fromOtro,
            url: '/save_alternate/',
            data: {
                passageID: _id,
                passages: JSON.stringify(orderList)
            },
            success: function(data){
                flashIcon($('#save-alternate-' + _id), 'green');
                alert(data);
                updateBookmarks();
            }
        });
    });
    $(document).on('click', '[id^="passage_install_"]', function(e){
        var _id = getPassageId(this);
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/install_passage/' + fromOtro,
            url: '/install_passage/',
            data: {
                _id: _id
            },
            success: function(data){
                flashIcon($('#passage_install_' + _id), 'green');
            }
        });
    });
    $(document).on('click', '[id^="passage_share_"]', async function(e){
        var _id = getPassageId(this);
        var text = $('#passage-href-'+_id).val();
        var port = window.location.hostname == 'localhost' ? ':3000' : '';
        await navigator.clipboard.writeText(window.location.protocol + '//' + window.location.hostname + port + text);
        alert("Copied URL to clipboard!");
    });
    $(document).on('click', '[id^="passage_more_"]', function(e){
        let _id = getPassageId(this);
        let title = getPassageTitle(_id) == '' ? 'Untitled' : getPassageTitle(_id);
        let href = '/passage/' + fromOtro+ title +'/' + fromOtro + _id;
        $('.active_tab').html('<span class="tab_delete">X</span>' + decodeURIComponent(title));
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
            // url: DOMAIN + '/copy_passage',
            url: '/copy_passage',
            data: {
                _id: _id,
                parent: $('#chief_passage_id').val()
            },
            success: function(data){
                $('#passage_' + _id).after(data);
                flashIcon($('#passage_copy_' + _id), 'green');
            }
        });
    });
    $(document).on('mouseup', '[id^="passage_detail_content_"], [id^="passage_detail_code_"],[id^="passage_detail_html_"],[id^="passage_detail_css_"], [id^="passage_detail_javascript_"]', function(){
        if(window.getSelection().toString() != ''){
            $('#selection').val(window.getSelection());
            //save what part of passage is being selected
            //(content, html, css, javascript, or code)
            $('#selection').data('type', $(this).attr('id').split('_')[2]);
        }
        //strongly consider removing
        setTimeout(function(){
            $('#selection').val('');
        }, 3000);
    });
    $(document).on('click', '[id^="remove-file-"]', function(){
        var thiz = $(this);
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/removeFile',
            url: '/removeFile',
            data: {
                _id: thiz.attr('id').split('-').at(-1)
            },
            success: function(){
                $('.passage-file-' + thiz.attr('id').split('-').at(-1)).remove();
            }
        });
    })
    $(document).on('click', '[id^="passage_bookmark_"]', function(e){
        var _id = getPassageId(this);
        var thiz = $(this);
        var content = $('#selection').val();
        $.ajax({
            type: 'post',
            // url: DOMAIN + '/bookmark_passage',
            url: '/bookmark_passage',
            data: {
                _id: _id,
                content: content,
                which: $('#selection').data('type')
            },
            success: function(data){
                updateBookmarks();
                flashIcon($('#passage_bookmark_' + _id), 'green');
            }
        });
    });
    // $(document).on('click', '[id^="passage_comments_"]', function(e){
    //     var _id = getPassageId(this);
    //     let title = getPassageTitle(_id) == '' ? 'Untitled' : getPassageTitle(_id);
    //     flashIcon($('#passage_comments_' + _id), 'green');
    //     if($('#passage_private_'+_id).length > 0){
    //         window.location.href = '/comments/' + title + '/' + _id;
    //     }
    //     else{
    //         $('#passage_more_' + _id).click();
    //     }

    // });
    $(document).on('click', '[id^="passage_download_"]', function(e){
        var _id = getPassageId(this);
        var thiz = $(this);
        var content = $('#selection').val();
        // Default export is a4 paper, portrait, using millimeters for units
        const doc = new jsPDF();
        var source = $('#passage_detail_content_' + _id)[0];
        // doc.text(text, 10, 10);
        // doc.save("a4.pdf");
        doc.fromHTML(
            source,
            15,
            15,
            {
              'width': 180,
            });
        
        doc.output("dataurlnewwindow");
    });
    $(document).on('keyup', '.passage_add_user', function(e){
        if(e.keyCode == 13){
            var thiz = $(this);
            $.ajax({
                // url: DOMAIN + '/add_user',
                url: '/add_user',
                type: 'POST',
                data: {
                    passageId: thiz.attr('id').split('_').at(-1),
                    username: thiz.val()
                },
                success: function (data) {
                    alert(data);
                    window.location.reload();
                }
            });
        }
    });
    $(document).on('click', '.btn-add-user', function(e){
        var thiz = $(this);
        var _id = thiz.attr('id').split('-').at(-1);
        $.ajax({
            // url: DOMAIN + '/add_user',
            url: '/add_user',
            type: 'POST',
            data: {
                passageId: _id,
                username: $('#passage_add_user_'+_id).val()
            },
            success: function (data) {
                alert(data);
                window.location.reload();
            }
        });
    });
    $(document).on('keyup', '.share-passage', function(e){
        if(e.keyCode == 13){
            var thiz = $(this);
            $.ajax({
                // url: DOMAIN + '/share_passage',
                url: '/share_passage',
                type: 'POST',
                data: {
                    passageId: thiz.attr('id').split('-').at(-1),
                    username: thiz.val()
                },
                success: function (data) {
                    alert(data);
                }
            });
        }
    });
    $(document).on('keyup', '.passage_add_collaborator', function(e){
        if(e.keyCode == 13){
            var thiz = $(this);
            $.ajax({
                // url: DOMAIN + '/add_collaborator',
                url: '/add_collaborator',
                type: 'POST',
                data: {
                    passageID: thiz.attr('id').split('_').at(-1),
                    username: thiz.val()
                },
                success: function (data) {
                    alert(data);
                    window.location.reload();
                }
            });
        }
    });
    $(document).on('click', '.btn-add-collaber', function(e){
        var thiz = $(this);
        var _id = thiz.attr('id').split('-').at(-1);
        $.ajax({
            // url: DOMAIN + '/add_user',
            url: '/add_collaborator',
            type: 'POST',
            data: {
                passageID: _id,
                username: $('#passage_add_collaborator_'+_id).val()
            },
            success: function (data) {
                alert(data);
                window.location.reload();
            }
        });
    });
    $(document).on('click', '.passage_remove_user', function(e){
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/remove_user',
            url: '/remove_user',
            type: 'POST',
            data: {
                passageID: $(this).attr('id').split('_').at(-1),
                userID: thiz.data('userid')
            },
            success: function (data) {
                window.location.reload();
            }
        });
    });
    $(document).on('click', '.passage_remove_collaber', function(e){
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/remove_user',
            url: '/remove_collaber',
            type: 'POST',
            data: {
                passageID: $(this).attr('id').split('_').at(-1),
                userID: thiz.data('userid')
            },
            success: function (data) {
                window.location.reload();
            }
        });
    });
    $(document).on('click touch', '#parent_title2', function(e){
        window.location.href = $(this).data('url');
    });
    $(document).on('change', 'select[id^=label-select-]', function(e){
        var ID = $(this).attr('id').split('-').at(-1);
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/remove_user',
            url: '/change_label',
            type: 'POST',
            data: {
                _id: $(this).attr('id').split('-').at(-1),
                label: $(this).val(),
                parent: $('#chief_passage_id').val()
            },
            success: function (data) {
                thisPassage(thiz, '-').replaceWith(data);
                // switch($('#label-select-'+ID).val()){
                //     case 'Project':
                //     case 'Idea':
                //     case 'Database':
                //         // $('#label-color-'+ID).removeClass();
                //         // $('#label-color-'+ID).addClass('brown');
                //         $('#label-color-'+ID).css('color', 'red');
                //         // $('#show-bestof-'+ID).hide();
                //         break;
                //     case 'Social':
                //     case 'Question':
                //     case 'Comment':
                //     case 'Task':
                //         console.log('green');
                //         // $('#label-color-'+ID).removeClass();
                //         // $('#label-color-'+ID).addClass('green');
                //         console.log('#label-color-'+ID);
                //         $('#label-color-'+ID).css('color', 'green');
                //         // $('#show-bestof-'+ID).show();
                //         break;
                //     case 'Forum':
                //         // $('#label-color-'+ID).removeClass();
                //         // $('#label-color-'+ID).addClass('brown');
                //         $('#label-color-'+ID).css('color', 'brown');
                //         // $('#show-bestof-'+ID).hide();
                //         break;

                // }
            }
        });
    });
    $(document).on('click', '.passage_setting', function(){
        let _id = $(this).attr('id').split('_').at(-1);
        let setting = $(this).data('setting');
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/passage_setting',
            url: '/passage_setting',
            type: 'POST',
            data: {
                _id: _id,
                setting: setting
            },
            success: function (data) {
                if(thiz.data('setting') != 'request-public-daemon'){
                    if(thiz.hasClass('green')){
                        thiz.removeClass('green');
                        thiz.addClass('red');
                    }
                    else if(thiz.hasClass('red')){
                        thiz.removeClass('red');
                        thiz.addClass('green');
                    }
                }
                switch (thiz.data('setting')) {
                    case 'public':
                        let privateSetting = $('#passage_setting_make_private_' + _id);
                        if(privateSetting.hasClass('green')){
                            privateSetting.removeClass('green');
                            privateSetting.addClass('red');
                        }
                        else if(privateSetting.hasClass('red')){
                            privateSetting.removeClass('red');
                            privateSetting.addClass('green');
                        }
                        break;
                    case 'private':
                        let publicSetting = $('#passage_setting_make_public_' + _id);
                        console.log(publicSetting);
                        if(publicSetting.hasClass('green')){
                            publicSetting.removeClass('green');
                            publicSetting.addClass('red');
                        }
                        else if(publicSetting.hasClass('red')){
                            console.log('?');
                            publicSetting.removeClass('red');
                            publicSetting.addClass('green');
                        }
                        break;
                    case 'personal':
                        let personalSetting = $('#passage_setting_make_personal_' + _id);
                        if(personalSetting.hasClass('green')){
                            personalSetting.removeClass('green');
                            personalSetting.addClass('red');
                        }
                        else if(personalSetting.hasClass('red')){
                            personalSetting.removeClass('red');
                            personalSetting.addClass('green');
                        }
                        break;
                    case 'request-public-daemon':
                        if(thiz.hasClass('yellow')){
                            thiz.removeClass('yellow');
                            thiz.addClass('red');
                        }
                        else if(thiz.hasClass('red')){
                            thiz.removeClass('red');
                            thiz.addClass('yellow');
                        }
                        break;
                    case 'personal':
                        if(thiz.hasClass('green')){
                            thiz.removeClass('green');
                            thiz.addClass('red');
                        }
                        else if(thiz.hasClass('red')){
                            thiz.removeClass('red');
                            thiz.addClass('green');
                        }
                        break;
                    
                    default:
                        
                        break;
                }
                // alert(data);
            }
        });
    });
    $(document).on('click', '[id^=update_mirroring_]', function(e){
        var _id = getPassageId(this);
        $.ajax({
            url: '/update_mirroring',
            type: 'POST',
            data: {
                _id: _id,
                mirror: $('#passage_mirror_' + _id).val(),
                mirrorEntire: $('#passage_mirrorEntire_' + _id).is(':checked'),
                mirrorContent: $('#passage_mirrorContent_' + _id).is(':checked'),
                bestOf: $('#passage_bestOf_' + _id).val(),
                bestOfEntire: $('#passage_bestOfEntire_' + _id).is(':checked'),
                bestOfContent: $('#passage_bestOfContent_' + _id).is(':checked')
            },
            success: function(data){
                window.location.reload();
            }
        });
    });
    $(document).on('click', '[id^=passage_expand]', function(e){
        var _id = getPassageId(this);
        $('#passage_condensed_' + _id).fadeToggle();
    });
    function disallowedProducts(thiz){
        if($('#'+thiz.attr('id')+' [name="ceds"]').is(':checked')){
            alert("Screens must be less than 4 inches diagonally (phones excluded), and product can not contain cathode ray tube(s).");
            return true;
        }
        if($('#'+thiz.attr('id')+' [name="new-tires"]').is(':checked')){
            alert("Product can not contain or be new tires.");
            return true;
        }
        if($('#'+thiz.attr('id')+' [name="drugs"]').is(':checked')){
            alert("Smoking, tobacco, marijuana, or alcoholic beverage products are not allowed.");
            return true;
        }
        return false;
    }
    $(document).on('submit', '[id^=passage_form_]', function(e){
        e.preventDefault();
        if(disallowedProducts($(this))){
            return;
        }
        var thiz = $(this);
        var formData = new FormData(this);
        formData.append("parent", $('#chief_passage_id').val());
        if($('#passage_file_'+$(this).attr('id').split('_').at(-1)).val() != ''){
            $('#loading').show();
        }
        $.ajax({
            // url: DOMAIN + '/update_passage',
            url: '/update_passage',
            type: 'POST',
            data: formData,
            success: function (data) {
                thisPassage(thiz).replaceWith(data);
                syntaxHighlight();
                $('#loading').hide();
                analyzeImages();
            },
            error: function(a, b, c){
                alert(JSON.stringify(a) + b + c);
            },
            cache: false,
            contentType: false,
            processData: false
        });
    });
    $(document).on('click', '.add_stars', function(){
        var thiz = $(this);
        if(thiz.text() == 'Give'){
            var passage_id = $(this).attr('id').split('_').at(-1);
            var amount = $('#star_number_' + passage_id).val();
            amount = parseInt(amount, 10);
            if (isNaN(amount) || amount < 1) {
              alert('Please enter a valid quantity greater than 0.');
              return;
            }
            var data = {
                    passage_id: passage_id,
                    amount: amount,
                    parent: $('#chief_passage_id').val()
                };
                // alert(JSON.stringify(data));
            // if(passage_id.includes('star_number')){
            //     alert(passage_id);
            //     alert($(this).attr('id').split('_').at(-1));
            // }
            // if(!$('#page-loader').length){
            // thisPassage(thiz).replaceWith('<div class="page-loader-'+getPassageId(thiz)+'"id="page-loader">'+$('#small-loading').html()+'</div>');
            // }
            // alert(JSON.stringify(data));
            // thiz.text("Loading...");
            $.ajax({
                url: '/star_passage/',
                // url: DOMAIN + '/star_passage/' + fromOtro,
                type: 'POST',
                data: data,
                success: function(data2){
                    if(data2 == 'Not enough stars.' || data2 == 'Please enter a number greater than 0.'){
                        thiz.text("Give");
                        alert(data2);
                    }
                    else{
                        if(data2[0] == 'N'){
                            thisPassage(thiz).prepend(data2);
                        }
                        else{
                            var prevCount = parseInt($('#p-starCount-' + passage_id).text().split(' ')[0], 10);
                            var newCount = prevCount + amount;
                            var finalText = newCount + ' star' + (newCount == 1 ? '' : 's');
                            $('#p-starCount-' + passage_id).text(finalText);
                            // thisPassage(thiz).replaceWith(data2);
                            // $('.page-loader-'+getPassageId(thiz)).replaceWith(data2);
                        }
                    }
                }
            });
        }
    });
    $(document).on('click', '[id^=star-]', function(){
        var thiz = $(this);
        var passage_id = $(this).attr('id').split('-').at(-1);
        $.ajax({
            type: 'post',
            url: '/single_star/',
            data: {
                _id: $(this).attr('id').split('-').at(-1),
                on: $(this).css('color') == 'rgb(255, 215, 0)' ? true : false
            },
            success: function(data){
                var prevCount = parseInt($('#p-starCount-' + passage_id).text().split(' ')[0], 10);
                var newCount = prevCount + (thiz.css('color') == 'rgb(255, 215, 0)' ? (-1) : 1);
                var finalText = newCount + ' star' + (newCount == 1 ? '' : 's');
                $('#p-starCount-' + passage_id).text(finalText);
                thiz.css('color', (thiz.css('color') == 'rgb(255, 215, 0)' ? 'rgb(255, 255, 255)' : 'rgb(255, 215, 0)'));
                // thisPassage(thiz, '-').replaceWith(data);
            }
        });
    });
    $(document).on('click', '[id^=repost-]', function(){
        var whichPage = $('#which-page').val(); 
        var id = $(this).attr('id').split('-').at(-1);
        popup("Repost", $('#repost-editor').val());
        if($('.popup').css('position') == 'absolute'){
            $('.popup').css('top', $(window).scrollTop() + 'px');
        }
        $('#passage_form').show();
        $('<input id="repost-id">').attr('type','hidden').appendTo('#passage_form');
        $('#repost-id').val(id);
        $('#repost-id').attr('name', 'repost-id');
        //hide post to thread if on root
        if($('#chief_passage_id').val() == 'root'){
            $('#post-thread-div').remove();
            $('#post-top-div').remove();
            $('<input id="post-top-hidden">').attr('type','hidden').appendTo('#passage_form');
            $('#post-top-hidden').val('true');
        }
        if(whichPage == 'comments'){
            $('#editor-label').hide();
            $('#editor-label-color').hide();
        }else{
            $('#editor-label').val('Social').change();
        }
        summonQuill();
    });
    $(document).on('change', '.post-top', function(){
        if($(this).is(':checked')){
            $('.post-thread').prop('checked', false);
        }
    });
    $(document).on('change', '.post-thread', function(){
        if($(this).is(':checked')){
            $('.post-top').prop('checked', false);
        }
    });
    $(document).on('click', '.change_passage_file', function(){
        let _id = $(this).attr('id').split('_')[$(this).attr('id').split('_').length - 1];
        // $('#passage_file_' + _id).
    });
    $(document).on('click', '[id^="passage_push_"]', function(e){
        var _id = getPassageId(this);
        var password = prompt("Password:");
        var passage = $('#full_push_passage_' + _id).val();
        $.ajax({
            type: 'post',
            url: '/push',
            data: {
                _id: _id,
                passage: passage,
                password: password
            },
            success: function(data){
                flashIcon($('#passage_push_' + _id), 'green');
            }
        });
    });
    function getAllSubPassageIDs(){
        var orderList = [];
        if($('#sub_passages').length){
            orderList = $('#sub_passages').sortable('toArray');
            orderList.forEach(function(p, i){
                orderList[i] = orderList[i].split('_').at(-1);
            });
        }
        return orderList;
    }
    $(document).on('click', '[id^=passage_update_]', function(){
        var _id = getPassageId(this);
        flashIcon($('#passage_update_' + _id), 'green');
        // var content = $('#passage_content_' + _id).html();
        // $('#quill-data-' + _id).val(content);
        syntaxHighlight();
        //if chapter passage in view,
        //update passage order according to sortable
        //pending ....
        // ....
        if($('#chief_passage_id').val() == _id){
            var orderList = [];
            if($('#sub_passages').length){
                orderList = $('#sub_passages').sortable('toArray');
                orderList.forEach(function(p, i){
                    orderList[i] = orderList[i].split('_')[1];
                });
            }
            $('#orderList_' + _id).val(JSON.stringify(orderList));
            $('#isChief_' + _id).val(true);

            $('#yes-subforums-' + _id).val($('#yes-subforums').val());
            $('#yes-comments-' + _id).val($('#yes-comments').val());
            //TODO: only do if order is different from original
            // $.ajax({
            //     // url: DOMAIN + '/update_passage_order',
            //     url: '/update_passage_order',
            //     type: 'POST',
            //     data: {
            //         _id: _id,
            //         passageOrder: JSON.stringify(orderList)
            //     },
            //     success: function (data) {
            //         // alert(data);
            //     }
            // });
        }
        $('#passage_form_' + _id).submit();
    });
    $(document).on('click', '[id^=passage_sticky_]', function(){
        var thiz = $(this);
        var _id = $(this).attr('id').split('_').at(-1);
        $.ajax({
            type: 'post',
            url: '/sticky',
            data: {
                _id: _id
            },
            success: function(data){
                if(thiz.css('color') == 'rgb(255, 255, 255)'){
                    thiz.css('color', 'gold');
                }
                else if(thiz.css('color') == 'rgb(255, 215, 0)'){
                    thiz.css('color', 'white');
                }
            }
        });
    });
    //For Home, Search, and Profile
    var okPaginate = true;
    $(document).on('click', '#view_more, #view-more-leaders', function(){
        if(true){
            okPaginate = false;
            checkIfFromOtro();
            //check if home, search, or profile
            var isProfile = $('#is_profile').val();
            page += 1;
            if(!$('#page-loader').length){
                $('#passage_wrapper').append('<div id="page-loader">'+$('#small-loading').html()+'</div>');
            }
            var cursor = $('.cursor').last().val() == '' ? null : $('.cursor').last().val();
            $.ajax({
                type: 'post',
                url: '/paginate',
                // url: DOMAIN + '/paginate/' + fromOtro,
                data: {
                    page: page,
                    cursor: cursor,
                    passage: $('#chief_passage_id').val(),
                    parent: $('#chief_passage_id').val(),
                    profile: isProfile,
                    search: $('#search').val(),
                    whichPage: $('#which-page').val(),
                    label: $('#label-select').val(),
                    sort: $('#sort-select').val()
                },
                success: function(data){
                    $('#page-loader').remove();
                    if($('#is_profile').val() == 'leaderboard'){
                        $('#leaders').append(data);
                    }else{
                        $('#passage_wrapper').append(data);
                        syntaxHighlight();
                        // replacePassages();
                    }
                    okPaginate = true;
                    analyzeImages();
                    analyzeVideos();
                },
                error: function(a, b, c){
                    console.log(JSON.stringify(a) + b + c);
                }
            });
        }
    });
    $(document).on('keyup', '[id^=display_html_]', function(){
        var _id = getPassageId(this);
        $('#passage_html_' + _id).val($(this).val());
    });
    $(document).on('keyup', '[id^=display_css_]', function(){
        var _id = getPassageId(this);
        $('#passage_css_' + _id).val($(this).val());
    });
    $(document).on('keyup', '[id^=display_js_]', function(){
        var _id = getPassageId(this);
        $('#passage_js_' + _id).val($(this).val());
    });
    $(document).on('keyup', '[id^=display_code]', function(){
        var _id = getPassageId(this);
        $('#passage_code_' + _id).val($(this).val());
    });
    $(document).on('click', '.view_code', function(){
        syntaxHighlight();
    });
    $(document).on('click', '.b-bar', function(){
        $('#right_side_select').val('bookmarks').change();
        $('#side_panel').toggle();
        // $('.blocker').click();
        // $('#side_panel').scrollTop(0);
    });
    $(document).on('click', '#yt-drop', function(){
        $('.yt-dropdown').slideToggle();
    });
    $(document).on('click', '[id^=yt-drop-]', function(){
        var _id = $(this).attr('id').split('-').at(-1);
        $('.yt-dropdown-' + _id).slideToggle();
    });
    $(document).on('click', '[id^=list-contributors-]', function(){
        var _id = $(this).attr('id').split('-').at(-1);
        $('#contributor-list-'+_id).slideToggle();

    });
    $(document).on('click', '.add-source', function(){
        var _id = $(this).attr('id').split('-').at(-1);
        $('.new-sources:not(#new-sources-'+_id+')').hide();
        $('#new-sources-' + _id).slideToggle();
    });
    $(document).on('click', '[id^=remove-sources-]', function(){
        var _id = $(this).attr('id').split('-').at(-1);
        $('#original-sources-'+_id).toggle();
        $('#recursive-sources-'+_id).toggle();
        if($(this).text() == 'Remove Sources'){
            $(this).text("View Sources");
        }else{
            $(this).text("Remove Sources");
        }

    });
    $(document).on('click', '[id^=delete-passage-source-]', function(){
        var _id = $(this).attr('id').split('-').at(-1);
        var thiz = $(this);
        $.ajax({
            // url: DOMAIN + '/remove_user',
            url: '/remove-source',
            type: 'POST',
            data: {
                passageID: $(this).attr('id').split('-').at(-1),
                sourceID: thiz.data('source')
            },
            success: function (data) {
                window.location.reload();
            }
        });

    });
    // $(document).on('keyup', '.passage_ext', function(){
    //     var _id = $(this).attr('id').split('_').at(-1);
    //     var code = $('#display_code_'+_id).val();
    //     $('#display_code_'+_id).replaceWith('<code-input value="'+code+'"lang="'+$(this).val()+'"class="code_display display_code" id="display_ext_'+_id+'>"></code-input>');
    // });

    // 
    // NEW FORM SUBMITTING FOR INITIAL PASSAGE CREATION
    // 

    $(document).on('click', '#post-passage', function(){
        // $('#passage_form').submit();
        //okay so for forum we add a row to the table
        //for stream/projects/questions we add the passage
    });
    $(document).on('submit', '#passage_form', function(e){
        e.preventDefault();
        if(disallowedProducts($(this))){
            return;
        }
        $('.editor-chief').val($('#chief_passage_id').val());
        $('#which-subforums').val($('#yes-subforums').val());
        $('#which-comments').val($('#yes-comments').val());
        var thiz = $(this);
        var formData = new FormData(this);
        // formData.append("whichPage", $('#which-page').val());
        if($('#passage_file').val() != ''){
            $('#loading').show();
        }
        $.ajax({
            // url: DOMAIN + '/update_passage',
            url: '/create_initial_passage/',
            type: 'POST',
            data: formData,
            success: function (data) {
                $('#loading').hide();
                if(data == 'You must log in to create a passage.'){
                    alert(data);
                    return;
                }
                var which = $('#forum-which').val();
                var chief = $('#chief_passage_id').val();
                $('#dim').click();
                //okay so for forum we add a row to the table
                //for stream/projects/questions we add the passage
                if(formData.has('repost-id')){
                    alert("Passage Sent.");
                }
                if($('#forum-post').length == 0){ //stream
                    if(chief == 'root'){
                        $('#passage_wrapper').prepend(data);
                    }
                    else if($('#yes-comments').val() == 'true' && formData.get('post-top') != 'on'){
                        $(data).insertAfter('.passage:first');
                    }
                    else{
                        if(formData.get('post-top') != 'on'){
                            $('#passage_wrapper').append(data);
                        }
                        //go to last passage
                        // $('.passage').eq(-2)[0].scrollIntoView();
                    }
                }
                else if(which == 'thread'){
                    $('#thread-passages').append(data);
                }
                else{
                    $('#no-posts').hide();
                    // $('#cat-tbl').prepend(data);
                    $(data).insertAfter('#first-cat');
                }
                thisPassage(thiz).replaceWith(data);
                getBrief(true);                
                syntaxHighlight();
            },
            cache: false,
            contentType: false,
            processData: false

        });
    });
    $(document).on('keyup', '[id^=fps-counter-]', function(e){
        if(e.keyCode == 13){
            var counter = parseInt($(this).val());
            var _id = $(this).attr('id').split('-').at(-1);
            $('#vid-img-'+_id).html(`
                <div id="vid-img-`+_id+`-loading">
                    <div style="text-align: center;background:transparent;padding:20px;width:90%;margin:auto;">
                     <div class="circle"></div>
                     <div class="circle1"></div>
                     <div style=" color:rgba(255,255,255,0.9);
                     text-shadow:0 0 15px #fff; margin-top:-28px; margin-left:10px; font-weight:bolder">Loading...</div>
                    </div>
                </div>
            `);
            createVideoFromImages(images, counter * 1000, "vid-img-"+_id+"-loading");
        }
    });
});
async function createVideoFromImages(imageUrls, frameDuration, el) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  // Set canvas dimensions based on the first image
  const firstImage = await loadImage(imageUrls[0]);
  canvas.width = firstImage.width;
  canvas.height = firstImage.height;

  const stream = canvas.captureStream();
  const recorder = new MediaRecorder(stream);
  const chunks = [];

  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(blob);

    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    // document.body.appendChild(video);
    $('#'+el).replaceWith(video);
  };

  recorder.start();

  for (const imageUrl of imageUrls) {
    const image = await loadImage(imageUrl);

    context.drawImage(image, 0, 0);

    await new Promise(resolve => setTimeout(resolve, frameDuration));
    recorder.requestData();
  }

  recorder.stop();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
