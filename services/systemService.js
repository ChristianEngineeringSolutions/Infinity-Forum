'use strict';

function getRemotePage(req, res){
    //get same route from server
    var route = req.originalUrl + '?fromOtro=true';
    const remoteURL = 'https://infinity-forum.org' + route;
    var output = '';
    var request = https.request(remoteURL, function(response){
        response.setEncoding('utf8');
        response.on('data', function(data){
            var final = data.replaceAll("/css/", "https://infinity-forum.org/css/");
            final = final.replaceAll("/js/", "https://infinity-forum.org/js/");
            final = final.replaceAll("/eval/", "https://infinity-forum.org/eval/");
            final = final.replaceAll("/images/", "https://infinity-forum.org/images/");
            final = final.replaceAll("/jquery", "https://infinity-forum.org/jquery");
            final = final.replaceAll("https://unpkg.com/three@0.87.1/exampleshttps://infinity-forum.org/js/loaders/GLTFLoader.js", "https://unpkg.com/three@0.87.1/examples/js/loaders/GLTFLoader.js");
            final = final.replaceAll("/ionicons.esm.js", "https://infinity-forum.org/ionicons.esm.js");
            final = final.replaceAll("/ionicons.js", "https://infinity-forum.org/ionicons.js");
            output += final;
        });
        response.on('end', function(){
            var script = `
            <script>
                $(function(){
                    var html = '<ion-icon data-cesconnect="true"style="float:left;"class="green"id="remote_toggle"title="Remote"src="/images/ionicons/sync-circle.svg"></ion-icon>';
                    $(document).on('click', '#remote_toggle', function(){
                        //green
                        if($(this).css('color') == 'rgb(0, 128, 0)'){
                            $(this).css('color', 'red');
                            $.ajax({
                                type: 'post',
                                url: '/cesconnect/',
                                data: {},
                                success: function(data){
                                    window.location.reload();
                                }
                            });
                        }
                        else{
                            $(this).css('color', 'rgb(0, 128, 0)');
                            $.ajax({
                                type: 'post',
                                url: '/cesconnect/',
                                data: {},
                                success: function(data){
                                    window.location.reload();
                                }
                            });
                        }
                    });
                    $('#main_header').prepend(html);
                    $(document).on('click', '[id^="passage_pull_"]', function(e){
                        var _id = $(this).attr('id').split('_').at(-1);
                        //submit proper form
                        $('#pull_form_' + _id).submit();
                        flashIcon($('#passage_pull_' + _id), 'green');
                    });
                    $(document).on('click', '.rex_cite', function(){
                        var _id = ''; //get from DOM
                        //1. Get passage from remote
                        $.ajax({
                            type: 'get',
                            url: 'https://christianengineeringsolutions/get_passage',
                            data: {
                                _id: _id,
                            },
                            success: function(data){
                                flashIcon($('#transfer_bookmark_' + _id), 'green');
                                $('#passage_wrapper').append(data);
                                //2. update details to local
                                $.ajax({
                                    type: 'post',
                                    url: '/passage_from_json',
                                    data: {
                                        passage: data,
                                    },
                                    //this route should also bookmark the passage
                                    success: function(data){
                                       //show some success alert
                                       alert("Done"); //temp
    
                                    }
                                });


                            }
                        });

                    });
                });
            </script>
            `;
            return res.send(output + script);
        });
    });
    request.end();
}

// Add other moderator-specific controller functions here

// Send email function (from sasame.js line 8500)
const nodemailer = require('nodemailer');
const { accessSecret } = require('../common-utils');

async function sendEmail(to, subject, body){
    const EMAIL_PASSWORD = await accessSecret("EMAIL_PASSWORD");
    var transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: EMAIL_PASSWORD
      }
    });

    var mailOptions = {
      from: 'admin@infinity-forum.org',
      to: to,
      subject: subject,
      text: body
    };

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
      return true;
    });
    return true;
}

module.exports = {
    getRemotePage,
    sendEmail
};