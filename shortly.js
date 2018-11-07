var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(cookieParser());

const accessToShortly = function(req, res, next) {
  if (req.cookies.signup || req.cookies.login) {
    next();
  } else {
    res.redirect('/login');
  }
};

app.get('/logout', (req, res) => {
  res.clearCookie('login', 'signup').redirect('/login');
});

app.get('/', accessToShortly, function (req, res) {
  res.render('index');
});

app.get('/create', accessToShortly, function (req, res) {
  res.render('index');
});

app.get('/links', accessToShortly, function (req, res) {
  Links.reset()
    .fetch()
    .then(function (links) {
      res.status(200).send(links.models);
    });
});

app.post('/links', function (req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function (found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function (err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        }).then(function (newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function (req, res) {
  res.render('login');
});

app.get('/signup', function (req, res) {
  res.render('signup');
});

app.post('/signup', function (req, res) {
  const name = req.body.username;
  const hash = crypto.createHash('sha256');
  const password = hash.update(req.body.password).digest('hex');
  console.log('name check', name, 'password check', req.body.password, password);
  new User({ name }).fetch().then(found => {
    if (found) {
      console.log('Model with this usernamne already exists');
      res
        .status(418)
        .send(
          'Sorry fool, you need to be more creative with your username 💅🏼`'
        );

    } else {
      Users.create({
        name: name,
        password: password
      }).then(function (userCreated) {
        res.status(201).cookie('signup', name).redirect('/');
      }).catch(error => {
        console.log('something went wrong when creating a username 🤷🏻‍♀️', error);
      });
    }
  });
});

app.post('/login', function (req, res) {
  const name = req.body.username;
  const hash = crypto.createHash('sha256');
  const password = hash.update(req.body.password).digest('hex');
  let matchedUserAndPassword = false;
  Users.fetch().then(function (userModel) {
    for (var i = 0; i < userModel.models.length; i++) {
      if (userModel.models[i].attributes.name === name && userModel.models[i].attributes.password === password) {
        matchedUserAndPassword = true;
        break;
      }
    }
    if (matchedUserAndPassword) {
      console.log('We did it!');
      res.status(201).cookie('login', name).redirect('/');
    } else {
      console.log('Error Dude!');
      res.status(400).redirect('/login');
    }
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function (req, res) {
  new Link({ code: req.params[0] }).fetch().then(function (link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function () {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function () {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
