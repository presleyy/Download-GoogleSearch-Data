var fs = require('fs');
var path = require('path')
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'webmasters-nodejs-creds.json';

function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if there has a previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      refreshToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

function refreshToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

function query_googleSearch_WaterfallOver(siteUrl, auth, params, iterator_callback, final_callback) {
  function report() {
    if (params.startRow && params.startRow != null)
      query_googleSearch(siteUrl, auth, params, function (data) {
        iterator_callback(data);
        report();
      });
    else
      final_callback();
  }
  // Start querying the 1st set and then loop
  query_googleSearch(siteUrl, auth, params, function (data) {
    iterator_callback(data);
    report();
  });
}

function query_googleSearch(url, auth, params, success) {
  var startDate = params.startDate;
  var endDate = params.endDate;
  var startRow = params.startRow;
  var dimensions = params.dimensions;
  var webmasters = google.webmasters('v3');
  var gparams = {
    auth: auth,
    siteUrl: encodeURIComponent(url),
    resource: {
      'startDate': startDate,
      'endDate': endDate,
      'dimensions': dimensions,
      'rowLimit': 5000,
      'startRow': startRow
    }
  };
  var query = webmasters.searchanalytics.query(gparams, function (err, res) {
    var returnLen = 0;
    if (res && res.rows && res.rows.length > 0) {
      returnLen = res.rows.length;
    }
    console.log("fetched start:" + params.startRow + " length:" + returnLen);
    success(res);
  });
}

function formatDate(date) {
  var d = new Date(date),
    month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

function lastDateOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function ensureDirExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirExistence(dirname);
  fs.mkdirSync(dirname);
}

function query_googleSearch_WaterfallOver_byMonth(siteUrl, auth, params, monthStartDate, totalEndDate, storePathPrefix) {
  var monthEndDate = lastDateOfMonth(monthStartDate);
  params.startDate = formatDate(monthStartDate);
  params.endDate = formatDate(monthEndDate);
  params.startRow = 0;
  console.log('Begin fetch from ' + params.startDate + ' to ' + params.endDate);
  query_googleSearch_WaterfallOver(siteUrl, auth, params,
    function (data) {
      var filename = storePathPrefix + params.startDate + "-" + (params.startRow / 5000) + ".json";
      if (data && data != null && data.rows && data.rows != null) {
        if (data.rows.length < 5000) {
          params.startRow = null;
        }
        else {
          params.startRow = params.startRow + 5000;
        }
        var vals = data.rows;
        var json = JSON.stringify(vals);
        ensureDirExistence(filename)
        fs.writeFileSync(filename, json, 'utf8');
      }
      else {
        params.startRow = null;
      }
    },
    function () {
      console.log('End fetch from ' + params.startDate + ' to ' + params.endDate);
      console.log("----------");
      var nextMonthStartDate = new Date(monthStartDate.setMonth(monthStartDate.getMonth() + 1));
      if (nextMonthStartDate.getTime() < totalEndDate.getTime()) {
        query_googleSearch_WaterfallOver_byMonth(siteUrl, auth, params, nextMonthStartDate, totalEndDate, storePathPrefix)
      }
      else {
        console.log('finished');
      }
    }
  );
}

/**
  * @param {string} startDateStr - Start date of the time range for the data
  * @param {string} endDateStr - End date of the time range for the data
  * @param {string[]} queryDimension - Google search query dimension, e.g. ["query","page"]
  * @param {string} folderPath - The target folder to write the downloaded data into. This should be just the folder path.
  * @param {string} fileName - The target file name to write. This should be just the file name without path.
  */
module.exports.download = function dumpGoogleSearchData(siteUrl, startDateStr, endDateStr, queryDimension, folderPath, fileName) {
  fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Webmasters query.
    var runStart = new Date(startDateStr);
    var runEnd = new Date(endDateStr);
    var params = {};
    params.startDate = formatDate(runStart);
    params.endDate = formatDate(runEnd);
    params.dimensions = queryDimension;
    params.filters
    params.startRow = 0;
    authorize(JSON.parse(content), function (auth) {
      query_googleSearch_WaterfallOver_byMonth(siteUrl, auth, params, runStart, runEnd, "data/" + folderPath + "/" + fileName + "-");
    });
  });
}