// require('console-stamp')(console, '[HH:MM:ss.l]');
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
let adddocbody = require('./json/adddoc_nosignature.json');
let adddocbodysign = require('./json/adddoc_signature.json');
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
  sendIMM(req.body).then(
    function(result) { res.send(result); },
    function(error) { res.send(error); }
  );
});

// **************************************
// * sendIMM()
// **************************************
async function sendIMM(receivedData) {
  writelog('logs/' + now + '_1_receivedData', 'Received from UI' + '\n\n' + JSON.stringify(receivedData));

  // YES, THIS IS ABOUT TO GET GHETTO AND HACKED AS QUICKLY AS POSSIBLE THIS WEEKEND...
  
  // Reset some variables
  commitendpoint = immendpoint + '/eSignapi/v1';
  createsessbody = require('./json/createsessbody.json');
  adddocbody = require('./json/adddoc_nosignature.json');
  adddocbodysign = require('./json/adddoc_signature.json');
  remotebody = require('./json/remotebody.json');
  
  // Read our inputs and load the json bodies appropriately
  let requestType = receivedData.requestType;  
  let docType = receivedData.docType;   
  let p1Name = receivedData.p1Name;
  let p1Email = receivedData.p1Email;
  let p1Phone = receivedData.p1Phone;
  let p1Password = receivedData.p1Password;
  let p1RemoteType = receivedData.p1RemoteType;
  let p2Exists = receivedData.p2Exists;
  let p2Name = receivedData.p2Name;
  let p2Email = receivedData.p2Email;
  let p2Phone = receivedData.p2Phone;
  let p2Password = receivedData.p2Password; 
  let p2RemoteType = receivedData.p2RemoteType;
  createsessbody.Parties[0].Email = p1Email;
  createsessbody.Parties[0].PhoneNumber = p1Phone;
  createsessbody.Parties[0].FullName = p1Name;
  adddocbody.PartyMappings[0].FullName = p1Name;
  adddocbody.PartyMappings[0].PartyId = 'P1';
  adddocbodysign.PartyMappings[0].FullName = p1Name;
  adddocbodysign.PartyMappings[0].PartyId = 'P1';
  remotebody.RemotePartyDetails[0].FullName = p1Name;
  remotebody.RemotePartyDetails[0].Email = p1Email;
  remotebody.RemotePartyDetails[0].RemoteAuthenticationType = p1RemoteType;
  remotebody.RemotePartyDetails[0].RemoteSigningOrder = '1'; // default to parallel signing
  if (p1RemoteType == 'Phone') {
    remotebody.RemotePartyDetails[0].Details = p1Phone;
  } else if (p1RemoteType == 'Password') {
    remotebody.RemotePartyDetails[0].Details = p1Password;
  } else {
    remotebody.RemotePartyDetails[0].Details = 'These are our details...';
  }

console.log('p2Exists = ' + p2Exists);

  if (p2Exists == 'yes') {
    createsessbody['Parties'].push({"Email": "tbd","PhoneNumber": "tbd","PhoneCountryCode": "1","FullName": "tbd"});
    adddocbody['PartyMappings'].push({"Action": "view","FullName": "tbd","PartyId": "P2"});
    adddocbodysign['PartyMappings'].push({"Action": "view","FullName": "tbd","PartyId": "P2"});
    adddocbodysign['Fields'].push({"BBox": {"Height": 11,"Width": 149,"X": 44,"Y": 400},"FieldType": "Signature","PageNumber": 1,"PartyIndex": "P2"});
    remotebody['RemotePartyDetails'].push({"FullName": "tbd","Email": "tbd","Details": "tbd","RemoteAuthenticationType": "Email","RemoteSigningOrder": "1"});
    createsessbody.Parties[1].Email = p2Email;
    createsessbody.Parties[1].PhoneNumber = p2Phone;
    createsessbody.Parties[1].FullName = p2Name;
    adddocbody.PartyMappings[1].FullName = p2Name;
    adddocbodysign.PartyMappings[1].FullName = p2Name;
    remotebody.RemotePartyDetails[1].FullName = p2Name;
    remotebody.RemotePartyDetails[1].Email = p2Email;
    remotebody.RemotePartyDetails[1].RemoteAuthenticationType = p2RemoteType;
    remotebody.RemotePartyDetails[1].RemoteSigningOrder = '1'; 
    if (p2RemoteType == 'Phone') {
      remotebody.RemotePartyDetails[1].Details = p2Phone;
    } else if (p2RemoteType == 'Password') {
      remotebody.RemotePartyDetails[1].Details = p2Password;
    } else {
      remotebody.RemotePartyDetails[1].Details = 'These are our details...';
    } 
  }
  // console.log('CreateSession = ' + JSON.stringify(createsessbody));
  // console.log('AddDoc = ' + JSON.stringify(adddocbody));
  // console.log('AddDocSign = ' + JSON.stringify(adddocbodysign));
  // console.log('RemoteBody = ' + JSON.stringify(remotebody));

  // **************************************
  // A - Login and get our access token
  // **************************************
  console.log('\n\n(A) ' + loginendpoint);
  loginresponse = await axios.post(loginendpoint, loginbody, { headers: loginheader});
  // console.log(loginresponse.data);
  console.log('* Access Token = ' + loginresponse.headers['access-token']);
  accesstoken = loginresponse.headers['access-token'];

  // **************************************
  // B - Create a session
  // **************************************
  console.log('\n\n(B) ' + createsessendpoint);
  sessheader["access-token"] = accesstoken; 
  createsessresponse = await axios.post(createsessendpoint, createsessbody, { headers: sessheader});
  hostsessionid = createsessresponse.data.HostSessionId
  console.log('* Host Session ID = ' + hostsessionid);

  // **************************************
  // C - Add Document
  // **************************************
  let docbody = '';
  if (docType == 'signature') {
    docbody = adddocbodysign;
  } else {
    docbody = adddocbody;
  }
  adddocendpoint2 = adddocendpoint + '/session/' + hostsessionid + '/rts/document';
  console.log('\n\n(C) ' + adddocendpoint2);
  adddocresponse = await axios.post(adddocendpoint2, docbody, { headers: sessheader});
  // console.log(adddocresponse.data);

  // **************************************
  // D - Commit Session or Remote Call
  // **************************************
  let response = "";
  if (requestType === 'direct') {
    console.log("*** Direct Integration was requested...");
    commitendpoint = commitendpoint + '/session/' + hostsessionid + '/commit';
    console.log('\n\n(D) ' + commitendpoint);
    commitresponse = await axios.put(commitendpoint, '', { headers: sessheader});
    console.log(commitresponse);
    response = '<a href="https://integrations.immesign.com/v2019.2/TeAASP/" target="blank">IMM Site</a>';
  } else {
    console.log("*** Remote Integration was requested...");
    remoteendpoint2 = remoteendpoint + '/remote/' + hostsessionid;
    console.log('\n\n(D) ' + remoteendpoint2);
    remoteresponse = await axios.put(remoteendpoint2, remotebody, { headers: sessheader});
    response = JSON.stringify(remoteresponse.data);
  }

  let backUrl = '<a href="https://HTML2IMM.sbatester.repl.co">Go Back</a>';
  return('<html>' + backUrl + '<br><br>' + response + '</html>');
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
        console.log("*** Successfully deleted " + logpath);
      }
    });
  }
  dir.closeSync()
}