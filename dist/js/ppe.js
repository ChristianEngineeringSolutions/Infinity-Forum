$(function(){
    var POSX;
    var POSY;
    var sourceList = [];
    function ppe(){
        var share = {};
        share.mutate = function(data, indice, iterations=0){
            var chunks = data.split(indice);
            var options = ['insert', 'delete', 'mutate'];
            for(var i = 0; i < chunks.length; ++i){
              //random num between 1 and 3
              var random = Math.floor(Math.random() * options.length) + 1;
              switch(options[random]){
                case 'insert':
                //perform an insertion by duplicating a chunk!
                var nextChunk = chunks[i + 1];
                chunks[i + 1] = chunks[i];
                //then carry down the changes to the end of the array
                for(var j = i + 1; j < chunks.length; ++j){
                  chunks[j + 1] = chunks[j];
                }
                break;
                case 'delete':
                //delete a chunk by making it equal the next chunk!
                chunks[i] = chunks[i + 1];
                //then make each following chunk equal the next chunk,
                //removing the last chunk (technically just a left shift)
                for(var j = i + 1; j < chunks.length; ++j){
                  if(j + 1 < chunks.length){
                    chunks[j] = chunks[j + 1];
                  }
                  else{
                    chunks.pop();
                  }
                }
                break;
                case 'mutate':
                var ran = Math.floor(Math.random() * chunks.length) + 1;
                var ran2 = Math.floor(Math.random() * chunks.length) + 1;
                if(indice != ''){
                  var points = chunks[i].split('');
                  points[ran] = points[ran2];
                  chunks[i] = points.join('');
                }
                else{
                  chunks[ran] = chunks[ran2];
                }
                break;
              }
            }
            return chunks.join(indice);
          };
        ppeActive = true;
        if(isMobile()){
            if(!sessionStorage.alertedGraphicDev){
                $('#graphic_dev_modal').modal();
                sessionStorage.alertedGraphicDev = true;
            }
        }
        var canvas = document.getElementById('ppe_canvas');
        var cursor = document.getElementById('ppe_cursor');
        var cursorctx = cursor.getContext('2d');
        var ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth - 10;
        canvas.height = window.innerHeight;
        cursor.width = window.innerWidth - 10;
        cursor.height = window.innerHeight;
        var queuePos = 0;
        var masterScale = 1;
        var masterRotate = 0;
        var isDrawing = false;
        var isErasing = false;
        var fadeCounter = 0;
        var hardOpacity = false;
        var increasingOpacity = false;
        var decreasingOpacity = true;
        var opacity = 1;
        var elements = [];
        const baseSize = 50;
        function fadeOut(){
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        //properties come from the source passage
        function drawImage(image, posx, posy, x, y, delv, realImage=false, properties={}){
            delv.globalAlpha = opacity;
            delv.setTransform(masterScale, 0, 0, masterScale, posx, posy); // sets scale and origin
            delv.rotate(masterRotate*(Math.PI/180));
            // if(realImage && image.width > 300){
                var adjustedHeight = baseSize * (image.height/image.width);
                //remember: 300 vs baseSize seems to do a z axis rotation
                delv.drawImage(image, -baseSize / 2, -adjustedHeight / 2, baseSize, adjustedHeight);
            // }
            // else{
            //     delv.drawImage(image, -image.width / 2, -image.height / 2);
            // }
            delv.setTransform(1,0,0,1,0,0);
            //Every time we draw an image we are adding an 'element' to the canvas
            //this element may have properties associated with it
            //i.e, passage info/metadata
            //we also might want to undo or redraw to change the z-index,
            //or select the area
            //so we want to keep track of all this
            //later do the same for erase
            elements.push(properties); //and then send to db
            //now we have options, since properties can contain methods such as
            //animation, event handlers, etc.
            //We can execute data for all elements of a portion of them every animation frame
            //or by some other standard, depending on the properties
            //We also want to store elements in the database associated with any saved image,
            //so that it can remain dynamic
            //this also allows us to use db features to constrain element searches according to
            //purpose
        }
        //very similar to reading passage metadata
        function scanElements(search, action){
            //get elements by searching db then
            switch(action){
                case 'runMethods':
                //ex. animation, key handlers, game stuff
                elements.forEach(function(element){
                    element.runMethods();
                });
                break;
                case 'layerDown':
                break;
                case 'layerUp':
                break;
                case 'erase':
                break;
            }
        }
        function getSelectedQueueImage(){
            return $('#ppe_queue').find(".ppe_queue_selected").children('.ppe_queue_canvas')[0];
        }
        function getSelectedQueueId(){
            try{
                return $('#ppe_queue').find(".ppe_queue_selected").children('.ppe_queue_canvas').attr('id').split('_').at(-1);
            }
            catch(error){
                console.log(error);
            }
        }
        function draw(e) {
            var pos = getMousePos(canvas, e);
            posx = pos.x;
            posy = pos.y;
            POSX = posx;
            POSY = posy;
            drawCursor(posx, posy);
            if($('#ppe_select').data('select') == 'off' && isDrawing && $('#ppe_erase').data('on') != 'true'){
                var image = getSelectedQueueImage();
                // var imageContext = image.getContext('2d');
                // fadeOut();
                drawImage(image, posx, posy, (posx - image.width/2), (posy - image.height/2), ctx);
                // ctx.drawImage(image, (posx - image.width/2*scale), (posy - image.height/2*scale), image.width*scale, image.height*scale);
                drawCursor();
            }
        }
        function select(e) {
            var pos = getMousePos(canvas, e);
            posx = pos.x;
            posy = pos.y;
            POSX = posx;
            POSY = posy;
            drawSelect(posx, posy);
            if(isErasing){
                ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                ctx.fillRect(posx, posy, baseSize*masterScale, baseSize*masterScale);
            }
        }
        function drawSelect(posx=POSX, posy=POSY){
            cursorctx.fillStyle = "#000000";
            cursorctx.clearRect(0, 0, canvas.width, canvas.height); 
            cursorctx.beginPath();
            cursorctx.rect(posx, posy, baseSize*masterScale, baseSize*masterScale);
            cursorctx.stroke();
        }
        // Returns a random integer, positive or negative
        // between the given value
        function randInt(min, max, positive) {
    
          let num;
          if (positive === false) {
            num = Math.floor(Math.random() * max) - min;
            num *= Math.floor(Math.random() * 2) === 1 ? 1 : -1;
          } else {
            num = Math.floor(Math.random() * max) + min;
          }
    
          return num;
    
        }
        $(document).on('click', '#ppe_mutate', function(){
            var mutationCanvas = $('#ppe_mutation')[0];
            var mutationctx = mutationCanvas.getContext('2d');
            mutationctx.clearRect(0, 0, mutationCanvas.width, mutationCanvas.height);
            var size = baseSize;
            var sideNumb = parseInt(share.mutate(Math.floor(Math.random() * 9) + 1 + '', ''), 10);
            if(isNaN(sideNumb)){
                sideNumb = 0;
            }
            var rotation = parseInt(share.mutate(
                (Math.floor(Math.random() * 9) + 1) + ''
                +
                (Math.floor(Math.random() * 9) + 1) + ''
                +
                (Math.floor(Math.random() * 9) + 1) + ''
                , ''), 10);
            if(isNaN(rotation)){
                rotation = 0;
            }
            var height = size,
            width = size,
            sideLen = size/2;
            // sideNumb = numSides,
            // rotation = r;
            rotation *= Math.PI/180;
            var xCenter = mutationCanvas.width/2;
            var yCenter = mutationCanvas.height/2;
            mutationctx.beginPath();
            if(sideNumb == 0){
                mutationctx.arc(xCenter, yCenter, sideLen, 0, 2 * Math.PI);
            }
            else{
                mutationctx.moveTo (xCenter +  sideLen * Math.cos(rotation), yCenter +  sideLen *  Math.sin(rotation));           
    
            }
            for (var i = 1; i <= sideNumb; i += 1) {
                mutationctx.lineTo (xCenter +  sideLen * Math.cos(rotation + (i * 2 * Math.PI / sideNumb)), yCenter +  sideLen *  Math.sin(rotation + (i * 2 * Math.PI / sideNumb)));
            }
            var color2 = 'rgba('+randInt(0,255)+
            ','+randInt(0,255)+
            ','+randInt(0,255)+
            ','+opacity+
            ')';
            // mutationctx.strokeStyle = color1;
            mutationctx.fillStyle = color2;
            var lineWidth = parseInt(share.mutate(Math.floor(Math.random() * 9) + 1 + '', ''), 10);
            if(isNaN(lineWidth)){
                lineWidth = 0;
            }
            mutationctx.lineWidth = lineWidth;
            if(sideNumb == 2){
                mutationctx.stroke();
            }
            mutationctx.fill();
            drawCursor();
        });
        function drawCursor(posx=POSX, posy=POSY){
            //Queue Item
            $('#ppe_queue').find(".ppe_queue_selected").show();
            var image = getSelectedQueueImage();
            var isRealImage = image instanceof HTMLImageElement ? true : false;
            // var imageContext = image.getContext('2d');
            //Cursor
            cursorctx.globalAlpha = 1;
            cursorctx.fillStyle = "#000000";
            cursorctx.clearRect(0, 0, canvas.width, canvas.height); 
            cursorctx.beginPath();
            //cursor should be 10% bigger than image
            cursorctx.arc(posx, posy, (baseSize*1.1)/2*masterScale, 0, 2 * Math.PI);
            cursorctx.stroke();
            var adjustedHeight = baseSize * (image.height/image.width);
            //Also need to star the related passage
            drawImage(image, posx, posy, (posx - baseSize/2), (posy - adjustedHeight/2), cursorctx, isRealImage);
    
        }
        var newPPEQueueCounter = 0;
        $(document).on('click touch', '#ppe_cursor', function(){
            if($('#ppe_select').data('select') == 'off' && $('#ppe_erase').data('on') != 'true'){
                var image = getSelectedQueueImage();
                try{
                    var source = getSelectedQueueId();
                    var added = false;
                    if(source != 'mutation'){
                        for(const s of sourceList){
                            //already added
                            if(s == source){
                                added = true;
                                break;
                            }
                        }
                        if(added == false){
                            sourceList.push(source);
                        }
                    }
                }
                catch(error){
                    console.log(error);
                }
                    console.log(sourceList);
                var isRealImage = image instanceof HTMLImageElement ? true : false;
                var adjustedHeight = baseSize * (image.height/image.width);
                drawImage(image, posx, posy, (posx - baseSize/2), (posy - adjustedHeight/2), ctx, isRealImage);
                drawCursor();
            }
            else{
                if($('#ppe_erase').data('on') == 'true'){
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.fillRect(posx, posy, baseSize*masterScale, baseSize*masterScale);
                }
                else{
                    //select is active; add item to queue
                    $(`
                        <div class="ppe_canvas_container">
                        <ion-icon id="ppe_little_`+(++newPPEQueueCounter)+`"class="ppe_little_create"title="Create Passage"src="/images/ionicons/add-circle-sharp.svg"></ion-icon>
                        <canvas height="`+baseSize*masterScale+
                        `" width="`+baseSize*masterScale+
                        `"class="ppe_queue_canvas"></canvas></div>`)
                        .appendTo('#ppe_queue');
                        var little = $('#ppe_queue').children().eq(-1).children('.ppe_queue_canvas')[0];
                        var littlectx = little.getContext('2d');
                        var data = ctx.getImageData(posx, posy, baseSize*masterScale, baseSize*masterScale);
                        littlectx.putImageData(data, 0, 0);
                    $('#ppe_queue').find(".ppe_queue_selected").removeClass('ppe_queue_selected');
                    queuePos = $('#ppe_queue').children().length - 1;
                    $('#ppe_queue').children().eq(queuePos).addClass('ppe_queue_selected');
                    $('#ppe_select').click();
                    var dataURL = little.toDataURL();
                    $('#code').modal();
                    $('.properties').prepend($('#property_select').html());
                    $('.property_key').val('Canvas');
                    $('.property_value').val('Image');
                    $('.dataURL').val(dataURL);
                    cursorctx.clearRect(0, 0, canvas.width, canvas.height); 
                    drawCursor();
                    $('#ppe_queue_view_more').remove();
                    let icon = '<ion-icon title="View More"style="font-size:2em;display:inline-block;padding-bottom:10px;cursor:pointer;"id="ppe_queue_view_more"class=""title="View More"src="/images/ionicons/add-circle-outline.svg"></ion-icon>';
                    $(document).on('click touch', '#ppe_little_'+newPPEQueueCounter, function(){
                        //Now add the passage to database
                        $.ajax({
                            type: 'post',
                            url: '/ppe_add',
                            // url: DOMAIN + '/ppe_add',
                            data: {
                                dataURL: dataURL,
                                parent: $('#chief_passage_id').val(),
                                sourceList: JSON.stringify(sourceList)
                            },
                            success: function(data){
                                //and now replace it with the database version
                                $('#ppe_little_'+newPPEQueueCounter).parent().replaceWith(data);
                                $('#ppe_queue').append(icon);
                            }
                        });
                    });
                }
            }
        });
        $(document).on('click', '#ppe_erase', function(){
            var thiz = $(this);
            jqueryToggle($(this), function(){
                thiz.data('on', 'true');
                thiz.css('color', 'gold');
                $('#ppe_cursor').off('mousemove touchmove', draw);
                $('#ppe_cursor').on('mousemove touchmove', select);
                drawSelect();
            }, function(){
                thiz.css('color', '#fff');
                thiz.data('on', 'false');
                $('#ppe_cursor').off('mousemove touchmove', select);
                $('#ppe_cursor').on('mousemove touchmove', draw);
                drawCursor();
            });
        });
        $(document).on('click', '.ppe_queue_link', function(){
    
    
        window.open(
            $(this).data('href'),
            '_blank'
        );
      
      
        });
        function loadPPEQueue(){
            $.ajax({
                type: 'get',
                url: '/ppe_queue',
                // url: DOMAIN + '/ppe_queue',
                data: {
                    parent: $('#chief_passage_id').val(),
                },
                success: function(data){
                    $('#ppe_queue_view_more').remove();
                    let icon = '<ion-icon title="View More"style="font-size:2em;display:inline-block;padding-bottom:10px;cursor:pointer;"id="ppe_queue_view_more"class=""title="View More"src="/images/ionicons/add-circle-outline.svg"></ion-icon>';
                    $('#ppe_queue').append(data + icon);
                }
            });
        }
        loadPPEQueue();
        $(document).on('click', '.ppe_queue_view_more', function(){
            var isProfile = $('#is_profile').val();
            $.ajax({
                type: 'post',
                url: '/paginate',
                // url: DOMAIN + '/paginate',
                data: {
                    page: PPEPage,
                    passage: $('#chief_passage_id').val(),
                    profile: isProfile,
                    search: $('#ppe_search').val()
                },
                success: function(data){
                    PPEPage += 1;
                    $('#ppe_queue_view_more').remove();
                    let icon = '<ion-icon title="View More"style="font-size:2em;display:inline-block;padding-bottom:10px;cursor:pointer;"id="ppe_queue_view_more"class=""title="View More"src="/images/ionicons/add-circle-outline.svg"></ion-icon>';
                    $('#ppe_queue').append(data + icon);
                }
            });
        });
        $(document).on('click', '#ppe_select', function(){
            var thiz = $(this);
            jqueryToggle($(this), function(){
                thiz.attr('title', 'Draw');
                thiz.attr('src', '/images/ionicons/brush-sharp.svg');
                $('#ppe_cursor').off('mousemove touchmove', draw);
                $('#ppe_cursor').on('mousemove touchmove', select);
                drawSelect();
            }, function(){
                thiz.attr('title', 'Select');
                thiz.attr('src', '/images/ionicons/scan-sharp.svg');
                $('#ppe_cursor').off('mousemove touchmove', select);
                $('#ppe_cursor').on('mousemove touchmove', draw);
                drawCursor();
            }, 'select', ['on', 'off']);
        });
        $(document).on('click', '.ppe_canvas_container', function(){
            $('.ppe_queue_selected').removeClass('ppe_queue_selected');
            $(this).addClass('ppe_queue_selected');
            cursorctx.clearRect(0, 0, canvas.width, canvas.height); 
            drawCursor();
        });
        function cursorSelect(){
            return $('#ppe_select').data('select');
        }
        $('#ppe_cursor').on('mousemove touchmove', function(e){
            draw(e);
        });
        $('#ppe_cursor').on('mousedown touchstart', function(){
            isDrawing = true;
            isErasing = true;
        });
        $('#ppe_cursor').on('mouseup touchend', function(){
            isDrawing = false;
            isErasing = false;
        });
        $(document).on('click', '#ppe_search_icon', function(){
            $('#side_panel').toggle();
            $('#right_side_select').val('passages').change();
            $(this).toggleClass('gold');
        });
        $(document).on('keydown', function(e){
            if($('#graphic_mode').data('active') == 'true'){
                if(e.keyCode == 80 || e.keyCode == 78){
                    //p for previous
                    if(e.keyCode == 80){
                    queuePos = queuePos - 1;
                    }
                    //n for next
                    if(e.keyCode == 78){
                        queuePos = queuePos + 1;
                    }
                    $('#ppe_queue').find(".ppe_queue_selected").removeClass('ppe_queue_selected');
                    
                    if(queuePos >= $('#ppe_queue').children().length){
                        queuePos = 0;
                    }
                    if(queuePos < 0){
                        queuePos = $('#ppe_queue').children().length;
                    }
                    $('#ppe_queue').children().eq(queuePos).addClass('ppe_queue_selected');
    
                    // Clear and redraw cursor with new item
                    // cursorctx.fillStyle = "#000000";
                    cursorctx.clearRect(0, 0, canvas.width, canvas.height); 
                    drawCursor();
                }
                // Open menu on space
                else if(e.keyCode == 32){
                    e.preventDefault();
                    $('#ppe_search_icon').click();
                }
                //m for mutate
                else if(e.keyCode == 77){
                    if($('#ppe_select').data('select') == 'on'){
                        $('#ppe_select').click();
                    }
                    $('#ppe_mutate').click();
                    $('#ppe_queue').find(".ppe_queue_selected").removeClass('ppe_queue_selected');
                    $('#ppe_queue').children().eq(0).addClass('ppe_queue_selected');
                    drawCursor();
                }
                //o for toggle opacity
                else if(e.keyCode == 79){
                    if(opacity > 1){
                        opacity = 1;
                    }
                    if(opacity < 0.02){
                        opacity = 0.02;
                    }
                    if(opacity == 1){
                        decreasingOpacity = true;
                        increasingOpacity = false;
                    }
                    if(opacity == 0.02){
                        increasingOpacity = true;
                        decreasingOpacity = false;
                    }
                    if(increasingOpacity){
                        opacity += 0.02;
                    }
                    if(decreasingOpacity){
                        opacity -= 0.02;
                    }
                    if(e.shiftKey){
                        increasingOpacity = !increasingOpacity;
                        decreasingOpacity = !decreasingOpacity;
                    }
                    drawCursor();
                }
                //e for erase
                else if(e.keyCode == 69){
                    $('#ppe_erase').click();
                }
                //q for select
                else if(e.keyCode == 81){
                    $('#ppe_select').click();
                }
                //s for scale
                else if(e.keyCode == 83){
                    if(e.shiftKey){
                        masterScale -= 0.01*masterScale*3;
                    }
                    else{
                        masterScale += 0.01*masterScale*3;
                    }
                    if(cursorSelect() == 'off'){
                        drawCursor();
                    }
                    else if(cursorSelect() == 'on'){
                        drawSelect();
                    }
                }
                //r for rotate
                else if(e.keyCode == 82){
                    if(e.shiftKey){
                        masterRotate -= 1;
                    }
                    else{
                        masterRotate += 1;
                    }
                    drawCursor();
                }
                //c for clear
                else if(e.keyCode == 67){
                    if(e.shiftKey){
                        //clear entire canvas
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                    //reset attributes
                    else{
                        masterRotate = 0;
                        masterScale = 1;
                        opacity = 1;
                    }
                    drawCursor();
                }
                //f for fade
                else if(e.keyCode == 70){
                    fadeOut();
                }
                //b for book mode
                else if(e.keyCode == 66){
                    $('.graphic_mode').click()
                }
            }
            //now that we've modified the element let's create an object for it,
            //and string it together with all other elements until mouseup
            //read passage from queue to determine properties and methods
            // var element_properties = {};
            // var element_methods = [];
            // var passageInfo = {};
            // switch(passageInfo.type){
            //     //...
            // }
            // var element = new Element(element_properties, element_methods);
        });
    
        function getMousePos(canvas, evt) {
            var rect = canvas.getBoundingClientRect();
            // alert((evt.pageX - rect.left) / (rect.right - rect.left) * canvas.width);
            //use pageX and pageY for touch events
            if(window.matchMedia("(max-width: 1200px)").matches){
                return {
                    x: (evt.pageX - rect.left) / (rect.right - rect.left) * canvas.width,
                    y: (evt.pageY - rect.top) / (rect.bottom - rect.top) * canvas.height
                };
            } 
            return {
                x: (evt.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
                y: (evt.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
            };
        }
        class Element{
            constructor(properties, methods){
                this.properties = properties;
                //E.G.
                // this.x;
                // this.y;
                // this.vx;
                // this.vy;
                // this.z;
                // this.vz;
                // this.text;
                // this.color;
                // this.font;
                this.methods = methods;
            }
            runMethods(){
                this.methods.forEach(function(method){
                    method(this);
                });
            }
        }
    }
    ppe();
    $(function(){
        $('#ppe_mutate').click();
    }); 
});