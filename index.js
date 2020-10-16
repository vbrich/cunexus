require('console-stamp')(console, '[HH:MM:ss.l]');
const fs = require('fs'); // comes part of nodejs
const express = require('express');
const axios = require('axios');
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');
const pdfcrowd = require('pdfcrowd');
const util = require('util');

var now = new Date().getUTCMilliseconds();

// **************************************
// * Get sensitive data from .env
// **************************************
const hostfiid = process.env.hostfiid;
const userid = process.env.userid;
const businessappuserid = process.env.businessappuserid; 
const partnerid = process.env.partnerid; 
const apikey = process.env.apikey; 
const immendpoint = process.env.immendpoint; 

// **************************************
// * Bring in our JSON config files
// **************************************
let loginbody = require('./json/loginbody.json');
let createsessbody = require('./json/createsessbody.json');
let sessheader = require('./json/sessheader.json');
let adddocbody = require('./json/adddoc_nosig_view.json');
let remotebody = require('./json/remotebody.json');

// **************************************
// * Update our JSON files with .env data
// **************************************
loginbody.HostFIID = hostfiid;
loginbody.UserID = userid;
loginbody.BusinessAppUserID = businessappuserid;
loginbody.APIKey = apikey;
loginbody.PartnerID = partnerid; 

// **************************************
// * Setup Other Variables
// **************************************
let loginendpoint = immendpoint + '/eSignapi/v1/login';
let createsessendpoint = immendpoint + '/eSignapi/v1/session/rts/create';
let getsessendpoint = immendpoint + '/eSignapi/v1/session';
let adddocendpoint = immendpoint + '/eSignapi/v1';
let commitendpoint = immendpoint + '/eSignapi/v1'; 
let remoteendpoint = immendpoint + '/eSignapi/v1';
let accesstoken = '';
let hostsessionid = '';
let loginheader = {"Content-Type": "application/json"};

// **************************************
// * Configure and Launch the Express Server
// **************************************
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.text({ type: 'text/plain' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public')); // load files from public directory
app.listen(process.env.PORT || 3000, function() {
  console.log('Express server listening on port %d in %s mode', this.address().port, app.settings.env);
});

// **************************************
// * Launch index.html
// **************************************
app.get("/", function(req, res) {
  res.sendFile('public/index.html'); // no need to specify dir off root
});

// **************************************
// * Handle a /sendimm POST
// **************************************
app.post("/sendimm", function(req, res) {
  purgeLogs();
  console.log('\n\n(0)--->' + req.body); 
  sendIMM(req.body).then(
    function(result) { res.send(result); },
    function(error) { res.send(error); }
  );
});

// **************************************
// * sendIMM()
// **************************************
async function sendIMM(receivedData) {
  writelog('logs/' + now + '_1_receivedData', JSON.stringify(receivedData));
  
  // **************************************
  // A - Login and get our access token
  // **************************************
  console.log('\n\n(A)--->' + loginendpoint);
  loginresponse = await axios.post(loginendpoint, loginbody, { headers: loginheader});
  // console.log(loginresponse.data);
  console.log('Access Token = ' + loginresponse.headers['access-token']);
  accesstoken = loginresponse.headers['access-token'];

  // **************************************
  // B - Create a session
  // **************************************
  console.log('\n\n(B)--->' + createsessendpoint);
  sessheader["access-token"] = accesstoken; 
  createsessresponse = await axios.post(createsessendpoint, createsessbody, { headers: sessheader});
  hostsessionid = createsessresponse.data.HostSessionId
  console.log('Host Session ID = ' + hostsessionid);

  // **************************************
  // C - Add Document
  // **************************************
  adddocendpoint2 = adddocendpoint + '/session/' + hostsessionid + '/rts/document';
  console.log('\n\n(C)--->' + adddocendpoint2);
  adddocresponse = await axios.post(adddocendpoint2, adddocbody, { headers: sessheader});
  // console.log(adddocresponse.data);

  // **************************************
  // D - Commit Session (all documents in IMM site for Banker)
  // **************************************
  /*
  commitendpoint = commitendpoint + '/session/' + hostsessionid + '/commit';
  console.log('\n\n(D)--->' + commitendpoint);
  commitresponse = await axios.put(commitendpoint, '', { headers: sessheader});
  console.log(commitresponse);
  */

  // **************************************
  // D - Remote Call (does commit for you)
  // **************************************
  remoteendpoint2 = remoteendpoint + '/remote/' + hostsessionid;
  console.log('\n\n(D)--->' + remoteendpoint2);
  remoteresponse = await axios.put(remoteendpoint2, remotebody, { headers: sessheader});
  // console.log(remoteresponse.data);

  let backUrl = '<a href="https://HTML2IMM.sbatester.repl.co">Go Back</a>';

  return('<html>' + backUrl + '<br><br>' + JSON.stringify(remoteresponse.data) + '</html>');
}

function writelog(logpath, data) {
  fs.writeFile(logpath, data, function(error) {
    if (error) {
      console.error(error);
    }
  });
}

function purgeLogs() {
  const dir = fs.opendirSync('logs')
  let logfile;
  while ((logfile = dir.readSync()) !== null) {
    let logpath = 'logs/' + logfile.name;
    fs.unlink(logpath, function(err) {
      if (err) {
        throw err
      } else {
        console.log("Successfully deleted " + logpath);
      }
    });
  }
  dir.closeSync()
}