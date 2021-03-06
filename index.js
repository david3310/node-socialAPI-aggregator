var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
    response.render('pages/index');
});

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});

//===========main code here=============//

var cal = {};

var readJson = require("r-json"); //can read the data from json file
const CREDENTIALS = readJson(`${__dirname}/credentials.json`); //get the API from the json file

var pg = require('pg');

var schedule = require('node-schedule');

async = require('async-kit');

var j = schedule.scheduleJob('* * /1 * * *', function() {//every day upload the social posted data
    console.log('');
    cal.run();
});

cal.Social = [];
cal.pushToArray = function(sourceID, title, description, sourceCreatedUTC, sourceUrl) {
    var temp = {};
    temp.sourceID = sourceID;
    temp.title = title;
    temp.description = description;
    temp.sourceCreatedUTC = sourceCreatedUTC;
    temp.sourceUrl = sourceUrl;
    this.Social.push(temp);
}
cal.run = function() {

    async.series([
            function(callback) { //instagram
                var ig = require('instagram-node').instagram();
                ig.use({ access_token: CREDENTIALS.instagram.access_token });
                ig.user('self/media/recent', function(err, result, remaining, limit) {
                    var len = result.length;
                    for (var i = 0; i < len; i++) {
                        var temp = Number('' + result[i].created_time + '000');
                        var time = (new Date(temp)).toUTCString();
                        // sourceID, title, description, sourceCreatedUTC, sourceUrl
                        cal.pushToArray(result[i].id, result[i].caption, result[i].caption, time, result[i].link);
                    }
                    callback();
                });

            },
            function(callback) { //pinterest
                var PDK = require('node-pinterest');
                var pinterest = PDK.init(CREDENTIALS.pinterest.token);
                pinterest.api('me/pins').then(function(result) {
                    var array = result.data;
                    var len = result.data.length;

                    for (var i = 0; i < len; i++) {
                        cal.pushToArray(array[i].id, array[i].note, array[i].note, "2016/01/01", array[i].link);

                    }
                    callback();
                });

            },
            function(callback) { //twitter
                var Twitter = require('twitter');
                var twitter_client = new Twitter({
                    consumer_key: CREDENTIALS.twitter.consumer_key,
                    consumer_secret: CREDENTIALS.twitter.consumer_secret,
                    access_token_key: CREDENTIALS.twitter.access_token,
                    access_token_secret: CREDENTIALS.twitter.access_token_secret
                });

                var params = { screen_name: 'nodejs' };
                twitter_client.get('statuses/user_timeline', params, function(error, tweets, response) {
                    if (!error) {
                        // console.log("tweets", tweets[0]); // works well
                        //sourceID, title, description, sourceCreatedUTC, sourceUrl
                        cal.pushToArray(tweets[0].id, tweets[0].text, tweets[0].text, tweets[0].created_at, '');
                    }
                    callback();
                });

            },
            function(callback) { //youtube
                var youtubeV3;
                var google = require('googleapis'),
                    youtubeV3 = google.youtube({
                        version: CREDENTIALS.youtube.version,
                        auth: CREDENTIALS.youtube.api_key
                    });
                var request = youtubeV3.search.list({
                    part: 'id, snippet',
                    type: 'video',
                    q: '',
                    maxResults: 1,
                    order: 'date',
                    safeSearch: 'moderate',
                    videoEmbeddable: true
                }, (err, response) => {

                    var sourceID, title, description, sourceCreatedUTC, sourceUrl;
                    for (i = 0; i < response.items.length; i++) {
                        var snippet = response.items[i]['snippet'];
                        // console.log("id: " + response.items[i]['id']['videoId']);
                        // console.log("title: " + snippet.title);
                        // console.log("description: " + snippet.description);
                        // console.log("thumbnails: " + snippet.thumbnails.default.url);
                        // console.log("publishedAt: " + snippet.publishedAt);

                        sourceID = response.items[i]['id']['videoId'];
                        title = snippet.title;
                        description = snippet.description;
                        sourceCreatedUTC = snippet.publishedAt;
                        sourceUrl = snippet.thumbnails.default.url;
                        cal.pushToArray(sourceID, title, description, sourceCreatedUTC, sourceUrl);
                    }
                    callback();
                });

            },
            function(callback) { //tumblr
                var tumblr = require('tumblr');
                var oauth = {
                    consumer_key: CREDENTIALS.tumblr.consumer_key,
                    consumer_secret: CREDENTIALS.tumblr.consumer_secret,
                    token: CREDENTIALS.tumblr.token,
                    token_secret: CREDENTIALS.tumblr.token_secret
                };

                var blog = new tumblr.Blog('david.tumblr.com', oauth);

                blog.text({ limit: 1 }, function(error, response) {
                    cal.pushToArray(response.posts[0].id, response.posts[0].title, response.posts[0].blog_name, response.posts[0].date, response.posts[0].post_url);
                    callback();
                });

            },
            function(callback) { //facebook
                var FB = require('fb');
                FB.api('me/feed', { access_token: CREDENTIALS.facebook.access_token }, function(res) {
                    //console.log("facebook Result is ", res.data[0]);
                    cal.pushToArray(res.data[0].id, res.data[0].story, res.data[0].story, res.data[0].created_time, "");
                    callback();
                });

            },
            function(callback) {
                var pg_client = new pg.Client({
                    user: "kazkzjgeikcamt",
                    password: "ywY0hGCJJbbkm7_t66bWzh6A4E",
                    database: "de82f9ag1o36jr",
                    port: 5432,
                    host: "ec2-54-235-132-192.compute-1.amazonaws.com",
                    ssl: true
                });

                pg_client.connect(function(err) {
                    if (err) {
                        return console.error('could not connect to postgres', err);
                    }
                    var count = 0;
                    var len = cal.Social.length;
                    for (var i = 0; i < len; i++) {
                        var string = '' + cal.Social[i].title;
                        string = escape(string);
                        var length = 199;
                        var title = string.substring(0, length);

                        var description = escape(cal.Social[i].description);

                        var query = "insert into Item ( SourceID, AreaID, ItemTypeID, Title,  Description, ViewCount, SourceURL, CoordinateXY, LabelAlignment,  CreatedUTC,  SourceCreatedUTC) values ( '" + cal.Social[i].sourceID + "', 24, 1, '" + title + "',  '" + description + "', 0, '" + cal.Social[i].sourceUrl + "', '(70,4)', 'LEFT','1/1/1900',  '" + cal.Social[i].sourceCreatedUTC + "');";
                        pg_client.query(query, function(err, result) {
                            if (err) {
                                return console.error('error running query', err);
                            } else {
                                console.log("input success!");
                            }
                            count++;
                            if (count == len) {
                                pg_client.end();
                                cal.Social = [];
                            }
                        });
                    }
                });

            }
        ])
        .exec(function(error, results) {
            if (error) console.log('ERROR!');
            else console.log('DONE!');
        });
}
