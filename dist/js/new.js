//////////////////////////////////////////////////
//  relax@infinity-forum.org
//////////////////////////////////////////////////        
$(window).ready(function() {

    $(window).resize(function() {
        //////////////////////////////////////////////////
        //  I really could not make this to work as I wanted and after chaing the code a couple of times adding and removing 
        //  this became the reult.
        //////////////////////////////////////////////////

        // get the current height main should have to fill remaining space
        // var check = $(window).height() - $("#top").height() - $("#middle").height() - $("#mid_bar").height() - $("#foot").height() - 63 + "px";
        // hide the scroll while resizing so it does not jump like a rabbit on crack
        // $("html").css('overflow', 'hidden');

        // set main height not to the check value but to current
        //$("#main").css('height', $(window).height() - $("#top").height() - $("#middle").height() - $("#mid_bar").height() - $("#foot").height() - 100 + "px"); //63

        // this checks and setts if main body is higher then main, this is so doable in css with relative but because we set the main hight to a fixed hight to fill the screen
        // this bugs so this was my solution for now
        /*if ($("#main-body").height() > $("#main").height()) {
            // set it so it does not go over
            $("#main").css('height', $("#main-body").height() + "px");
        }*/
        // check if the browser is still beeing resized, if not overflow auto again after 400ms
        //  setTimeout(function () {
        //      if (check === $(window).height() - $("#top").height() - $("#middle").height() - $("#mid_bar").height() - $("#foot").height() - 63 + "px") $("html").css('overflow', 'auto');
        //  }, 400);

        // the tour resize if open
        if ($(".tour-main").is(":visible")) {
            var ml = ($(window).width() / 2) - ($(".tour-main").width() / 2);
            var mt = ($(window).height() / 2) - ($(".tour-main").height() / 2) - 50;
            $(".tour-main").css({
                left: ml + "px",
                top: mt + "px"
            });
        }

        //$("#main-body").css("min-height", $(document).height()-200 + "px");
        // mnu_left is float so i had problem with it when it comes to size, I like javascript and yes i know its slower, i should learn css better tbh
        // checks so mnu_left is 100% of boxiz
        /*if ($("#mnu_left").height() < $("#boxiz").height()) {
            $("#mnu_left").css('height', $("#boxiz").height());
        }*/
    });
    //  trigger the resize when loaded so everything gets to place, two times..... one time wassent enough >.>
    // $(window).trigger("resize");
    // $(window).trigger("resize");

    /////////////////////////////////////////////////////////
    //  local storage script
    /////////////////////////////////////////////////////////
    function lsSupport() { // check if the browser supports local storage.
        if (typeof(Storage) !== "undefined") {
            return true;
        } else {
            return false;
        }
    }


    //////////////////////////////////////////////////////////
    //  this is for my small news/information box
    //    added localstorage and variable "storage" to not 
    //    spam ajax requests
    //////////////////////////////////////////////////////////
    var news = []; // variable to store data if localstorage is not supported

    $(document).on("click", "#mnu_left li", function() {
        var id = $(this).attr("id"); // get the is of the news
        $("#mnu_left li").each(function() {
            $(this).removeAttr("active"); // remove active attribute from all li
        });
        var thiz = this; //for later usage
        $(this).attr("active", ''); // set the clicked one as active
        if (lsSupport() && localStorage['news_' + id]) { //check if localstorage support and if the info is stored
            $(this).effect("transfer", {
                to: "#mnu_main"
            }, 500, function() { //transfer effect
                $("#mnu_main").html($.parseJSON(localStorage['news_' + id])[2]);
            });
        } else if (news[id] == null) { // check if we we have the info in the variable that we use if localstorage is not supported
            $.ajax({ // ajax the information
                type: "post",
                url: "/extra/ajax.php",
                data: {
                    "action": "get" + $("#mnu_left").attr("data"),
                    "id": id
                },
                success: function(data) {
                    //console.log(data);
                    if (data.substring(0, 7) == "[error]") { // darn it :(
                        notification("Something went wrong, please try again later.<br/>Error code: " + data.substring(7, 10), "red"); //show a error notification
                    } else if (parseInt($.parseJSON(data)[0]) == id) { // check if we got the right data
                        if (lsSupport()) // save in ls if supported else as an varialble
                            localStorage['news_' + id] = data;
                        else
                            news[id] = data;
                        $(thiz).effect("transfer", {
                            to: "#mnu_main"
                        }, 500, function() { //transfer effect
                            $("#mnu_main").html($.parseJSON(localStorage['news_' + id])[2]);
                        });
                    } else {
                        notification("critical error occurred, please contact Infinity staff", "red"); //fuck this is not suppost to happen and I hope it never :S
                    }
                }
            });
        } else { // we already have the information as a variable
            $(this).effect("transfer", {
                to: "#mnu_main"
            }, 500, function() { //transfer, have no idea why I have the same code 3 times >.<
                $("#mnu_main").html($.parseJSON(localStorage['news_' + id])[2]); // show yourself you, you, you... news
            });
        }
    });
    /////////////////////////////////////////////
    // FAQ
    /////////////////////////////////////////////
    $(document).on("click", "div[class^='Q_']", function() {
        var id = $(this).attr('class').substr(2);
        $(".A_" + id).slideToggle(500);
    });
    //////////////////////////////////////////////////////////
    //  this is for my small notification box script
    //////////////////////////////////////////////////////////
    function notification(msg, color) {
        if (color == "green") // predefined color for green
            color = "#36600b";
        if (color == "red") // and red
            color = "#9b0000";
        $(".notification").css("background", color);
        $(".notification").delay(500).html(msg).fadeIn(800).delay(2500).fadeOut(1000).delay(1000); // set, show, wait, hide
    }

    ////////////////////////////////////////////////////////////
    // tour box
    ////////////////////////////////////////////////////////////
    $(document).on("click", "#tour-link", function() {
        $(".tour-main").show();
        $(".tour").fadeIn(500);
        $(".tour-main").attr("active", "1");

    });
    $(document).on("click", ".tour, .boxx", function() { // when you click the background
        $(this).fadeOut(500); // hide this shit
        $(".tour-main").removeAttr("active");
    });
    $(document).on("click", ".tour-main, .boxx-main", function(e) { // but if you clikc inside the box
        e.stopPropagation(); // cancel the hide shit
    });

    ///////////////////////////////////
    // member login/register/recover
    ///////////////////////////////////
    $(".box_cont").each(function() { // jquery buggs on height
        //$(this).css("height", $(this).height()+50);
        $(this).hide();
    });
    var tim;
    $(document).on("click", "#box_top", function(e) { // when you click on a title or icon

        clearTimeout(tim);
        var id = $(this).parents("div[class^='inner_box']").attr("class").substr(9); //gief the id
        if ($(this).find("div[class^='box_icon']").attr("active") == "1") { //if you click on a active already
            $(".member_box div[class^='box_icon']").removeAttr("active"); //remove active
            $(".member_box div[class^='inner_box'] .box_cont").slideUp({ //first slide up the content
                queue: false
            });
            setTimeout(function() { // then slide the title so only the icon is visible 
                $(".member_box div[class^='inner_box']").animate({
                    left: "-172px"
                });
            }, 400); // queue = true did not work
        } else { // you did not click on a active
            $(".member_box div[class^='box_icon']").removeAttr("active"); //remove active from all
            $(".box_icon" + id).attr("active", "1"); //set active to mine

            $(".member_box div[class^='inner_box'] .box_cont").slideUp({ // slide up all contents
                queue: true
            });
            tim = setTimeout(function() { //same queue did not work so after slideup is finished
                $(".member_box div[class^='inner_box']:not([class='inner_box" + id + "'])").animate({ // hide all titles to the icon except MINE!!!
                    left: "-172px"
                });

                $(".inner_box" + id).animate({ //show MINE title!!!
                    left: 0
                }, {
                    queue: false, //do it while the others are hiding
                    complete: function() {
                        $(".inner_box" + id + " .box_cont").slideDown(400); // this is a 100$ question what this actually does, send your answer to bottom@trashcan.gov
                    }
                });
            }, 400); // when previous is finished run this shit


        }
    });



    //////////////////////////////////
    //    Scroll to top
    //////////////////////////////////
    $(".totop").click(function() {
        $('html, body').animate({
            scrollTop: $("body").offset().top
        }, 1000);
    });

    $(window).on("scroll", this, function() {
        if ($(this).scrollTop() > 0)
            $(".totop").fadeIn(700);
        else
            $(".totop").fadeOut(700);

    });

    //////////////////////////////////
    //    feedback, donate btn's
    //////////////////////////////////
    $(document).on("click", ".extra-btn1, .extra-btn2", function() {
        var thiz = $(this).find("div");
        if (thiz.is("[active]")) { // check for active
            $("div[class^='extra_icon']").removeAttr("active");
            $(".extra").slideUp(500);
        } else {
            if ($(".extra").is(":visible")) {
                $(".extra").slideUp(500);
            }
            setTimeout(function() {
                $("#feedback, #donate").hide()
                $("div[class^='extra_icon']").removeAttr("active");
                $(thiz).attr("active", "yes");
                if (thiz.css("background-image").substr(-7, 1) == "f")
                    $("#feedback").show();
                else
                    $("#donate").show();
                $(".extra").slideDown(500);
            }, 500);
        }
    });
    /////////////////
    // donate slider
    /////////////////
    $(".Dslider").slider({
        animate: true,
        range: "min",
        value: 15,
        min: 5,
        max: 300,
        step: 5,
        //this gets a live reading of the value and prints it on the page
        slide: function(event, ui) {
            $("#slider-result").html(ui.value + "$");
        },
        //this updates the hidden form field so we can submit the data using a form
        change: function(event, ui) {
            $('#hidden').attr('value', ui.value);
        }
    });



    $(document).on("click", "div[id^='feed_next']", function() {
        id = $(this).attr("id").substr(-1);
        switch (id) {
            case "1":
            case "2":
            case "3":
                if (!feed_check(id)) {
                    $("#fee_err").fadeOut(500);
                    $("#feed_box").slideUp(500);
                    setTimeout(function() {
                        $("#feed_box_" + id).hide();
                        $("#feed_box_" + parseInt(++id)).show();
                        $("#feed_box").slideDown(500);
                    }, 500);
                } else {
                    $("#fee_err").fadeIn(500);
                }
                break;
            case "4":
                $("#send_feedback").submit();
                break;

        }
    });



    function feed_check(id) {
        if (parseInt(id) == 1)
            return false;
        else if (parseInt(id) == 2 && $(".fee_l").is(":checked") && $(".fee_n").is(":checked"))
            return false;
        else if (parseInt(id) == 3 && $(".fee_f").is(":checked") && $(".fee_a").is(":checked"))
            return false;

        return true;
    }


    setTimeout(function() {
        $("html").css("overflow-y", "scroll");
        $(".loader").fadeOut(1000);
        setTimeout(function() {
            $(".loader").remove();
            $(window).trigger("resize");
            $(window).trigger("resize");
        }, 1000);
    }, 1800);
    notification("The page was loaded successfully", "green"); // page was loaded
});


////////////////////////////
// recover
/////////////////////////////
$(document).on("click", ".rec_f_btn", function() {
    var warning = {
        "outline": "none",
        "-webkit-box-shadow": "0 0 5px #ff0000",
        "-moz-box-shadow": "0 0 5px #ff0000",
        "box-shadow": "0 0 5px #ff0000"
    };
    var none = {
        "outline": "none",
        "-webkit-box-shadow": "0 0 0 #000000",
        "-moz-box-shadow": "0 0 0 #000000",
        "box-shadow": "0 0 0 #000000"
    };
    var pwd = $("#rec_f_pwd").val();
    var pwd2 = $("#rec_f_pwd2").val();
    if (pwd.length < 6 || String(pwd).search(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])/) == -1) {
        $("#rec_f_pwd").css(warning);
        $("#rec_f_err1").fadeIn(500);
        return false;
    } else {
        $("#rec_f_pwd").css(none);
        $("#rec_f_err1").fadeOut(500);
    }
    if (pwd != pwd2) {
        $("#rec_f_pwd2").css(warning);
        $("#rec_f_err2").fadeIn(500);
        return false;
    } else {
        $("#rec_f_pwd").css(none);
        $("#rec_f_err2").fadeOut(500);
    }
    $("#rec_f_frm").submit();

});

/////////////////////////////
//    msgbox
/////////////////////////////
function MsgBox(title, txt, icon, style) {
    if (style == "undefined" || style == null)
        style = "";
    if (icon == -1) {
        $("#msgbox_icon").hide();
        $("#msgbox_txt").css("padding", "10px 10px 10px 10px");
    } else {
        $("#msgbox_icon").show();
        $("#msgbox_txt").css("padding", "10px 10px 10px 75px");
    }
    $("#msgbox_title").html(title + " <span id=\"msgbox_close\">&times;</span>");
    $("#msgbox_txt").html(txt);
    $("#msgbox_txt").attr("style", style)
    icon = parseInt(icon);
    var icons = ["checkmark_64", "information_64", "help_64", "error_64", "forbidden_64"];
    $("#msgbox_icon_img").attr("src", "/images/" + icons[icon] + ".png");
    setTimeout(function() {
        $(".MsgBox_bg").fadeIn(300);
        $(".MsgBox").attr("active", "1");
        setTimeout(function() {
            $(".MsgBox").css({
                "-webkit-transition": "none",
                "-moz-transition": "none",
                "-ms-transition": "none",
                "-o-transition": "none",
                "transition": "none"
            });
        }, 500);
    }, 500);
}
$(document).on('click', '#dim', function() {
    document.body.style.overflow = "";
    $('.popup, #dim').fadeOut(function() {
        $('.popup, #dim').remove();
    });
    $(this).fadeOut();
});
///////////////////////////////
// MsgBox
///////////////////////////////
$(document).on("click", "#msgbox_close", function() {
    $(".MsgBox_bg").fadeOut(500);
    // document.body.style.overflow = "";
    $('.popup, #dim').fadeOut(function() {
        $('.popup, #dim').remove();
    });
    $('.popup').fadeOut();
});
$(".MsgBox").draggable({
    handle: "#msgbox_title",
    cancel: "#msgbox_close"
});

function popup(title, what, id, style) {
    //document.body.style.overflow = "hidden";
    $("<div id='dim'></div>").appendTo('body').fadeIn();
    $('<div id="' + id + '"class="popup"style="' + (style || '') + '"><div id="msgbox_title"style="cursor:default">' + title + '<span id=\"msgbox_close\">&times;</span></div><div id="popup-body">' + what + '</div></div>')
        .appendTo(document.body).hide().fadeIn();
}
//id is id of textarea to sync with
function epicEdit(container, id, change) {
    if (typeof change === 'undefined') val = true;
    else val = false;
    var previewer;
    var auto = val ? 'auto' : false;
    var opts = {
        container: container,
        textarea: id || null,
        basePath: '/css/',
        clientSideStorage: false,
        autogrow: true,
        file: {
            name: 'epiceditor'
        },
        theme: {
            base: 'themes/base-epiceditor.css',
            preview: 'themes/dark-preview-epiceditor.css',
            editor: 'themes/dark-epiceditor.css'
        },
        button: {
            preview: val,
            fullscreen: false,
            bar: auto
        },
        string: {
            togglePreview: 'Toggle Preview Mode',
            toggleEdit: 'Toggle Edit Mode',
            toggleFullscreen: 'Enter Fullscreen'
        }
    }
    var editor = new EpicEditor(opts);
    editor.load(function() {
        previewer = this.getElement('previewer');

        // Prettify JS
        var scriptTag = previewer.createElement('script');
        scriptTag.src = 'https://google-code-prettify.googlecode.com/svn/loader/run_prettify.js';

        // Prettify CSS
        // var cssTag = previewer.createElement('link');
        // cssTag.rel = 'stylesheet';
        // cssTag.type = 'text/css';
        // cssTag.href = 'google-code-prettify/prettify.css';

        // Add JS / CSS
        previewer.body.appendChild(scriptTag);
        //previewer.head.appendChild(cssTag);
    });
    editor.on('preview', function() {
        // Add necessary classes to <code> elements
        var previewerBody = previewer.body;
        var codeBlocks = previewerBody.getElementsByTagName('code');

        for (var i = 0; i < codeBlocks.length; i++)
            codeBlocks[i].className += ' prettyprint';

        prettyPrint(null, previewerBody);
    });
    return editor;
}

function epicDisplay(container, id) {
    var editor = epicEdit(container, id || null, false);
    editor.preview();
}
$(document).on('click', '#pm-top', function(e) {
    e.preventDefault();
    if (window.location.hash !== '#!/pm')
        $.ajax({
            url: '/lounge/script.php',
            data: {
                signal: 'list-pms',
                sent: false,
                mini: true
            },
            success: function(res) {
                popup('messages', '<br><br>' + res);
                $("#pm-to").tagit({
                    autocomplete: {
                        source: '/lounge/auto.php',
                        minLength: 1
                    }
                });
            }
        });
});
$(document).on('submit', '#pm-form', function(e) {
    e.preventDefault();
    $.ajax({
        type: 'POST',
        url: '/lounge/script.php',
        data: $(this).serialize(),
        success: function(res) {
            $('#msgbox_close').click();
            MsgBox('Response', res, -1);
        }
    });
});
$(document).on('click', '#pm-mini-more', function() {
    $('#msgbox_close').click();
});
$(document).on('click', 'div[id^="pm-row-"]', function() {
    $(this).next().slideToggle();
});
//plugin for dropdowns
(function($) {
    $.fn.dropDown = function(eName) {
        var id = this.attr('id');
        $(document).on('click', '#' + id, function() {
            $('#' + id + '-content').slideToggle();
        });
        $(document).on('click', '.' + id + '-item', function() {
            var text = $(this).text();
            $('#' + id).data('val', text);
            $('#' + id).html(text + ' <i class="fa fa-caret-down"></i>');
            $('#' + id + '-content').slideUp();
            if (typeof eName !== 'undefined') {
                $.event.trigger({
                    type: eName,
                    val: text
                });
            }
        });
    };
})(jQuery);
/////////////////////////////////
//    preload images
/////////////////////////////////

var images = new Array()

    function preload() {
        for (i = 0; i < preload.arguments.length; i++) {
            images[i] = new Image()
            images[i].src = preload.arguments[i]
        }
    }
preload(
    "/images/logo_big.png",
    "/slide/3.jpg",
    "/images/broken_noise.png",
    "/images/dark_stripes.png",
    "/images/qa.png",
    "/images/na.png",
    "/images/ka.png",
    "/images/fa.png",
    "/images/da.png"
);
function ucfirst(str)
{
    return str.charAt(0).toUpperCase() + str.slice(1);
}