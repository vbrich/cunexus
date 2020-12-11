require('console-stamp')(console, '[HH:MM:ss.l]');
const fs = require('fs'); // comes part of nodejs
const express = require('express');
const axios = require('axios'); 
const bodyParser = require("body-parser");
const app = express();
const { base64encode, base64decode } = require('nodejs-base64');
var util = require('util');

// Read our .env properties (hidden unless you are REPL owner)
const rturl = process.env.rturl;
const rtlendurl =process.env.rtlendurl;
const sessurl = process.env.sessurl;
const dclurl = process.env.dclurl;
// const licensekey = process.env.licensekey;
// const doclib = process.env.doclib;

// Bring in our JSON config files
const rtheaders = require('./json/rtheaders.json');
const rtbody = require('./json/rtbody.json');
const sessbody = require('./json/sessbody.json');
const dclbody = require('./json/dclbody.json');

let ispayloadjson = true;
let now = new Date().getUTCMilliseconds();

// Update our JSON files from .env properties
// rtbody.client.licenseKey = licensekey;
// rtbody.documentLibraryVersion = doclib;
// dclbody.jobTicket.DocumentLibraryVersion.DocumentLibraryVersion = doclib;
// dclbody.jobTicket.Prefs.LicenseKeyString = licensekey;

// Configure and Launch the Express Server
// app.use(bodyParser.json({limit: '15mb'})); 
app.use(bodyParser.text({ type: 'text/plain' }))
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
app.use(express.static('public')); // load files from public directory
app.listen(process.env.PORT || 3000, function() {
  console.log('Express server listening on port %d in %s mode', this.address().port, app.settings.env);
});

// Launch our own index.html from the GET
app.get("/", function(req, res) {  
  res.sendFile('public/index.html'); // no need to specify dir off root
});

// Handle a /getdocs POST
app.post("/getdocs", function(req, res) {
  purgeLogs();
  let receivedData;
  
  // load variables from form 
  rtbody.client.licenseKey = req.body.key;
  rtbody.documentLibraryVersion = req.body.doclib;
  dclbody.jobTicket.DocumentLibraryVersion.DocumentLibraryVersion = req.body.doclib;
  dclbody.jobTicket.Prefs.LicenseKeyString = req.body.key;
  
  if (isJson(req.body.payload)) {
    receivedData = JSON.parse(req.body.payload);
  } else {
    receivedData = req.body.payload;
    ispayloadjson = false;
  } 
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { res.send('Error occured. Have to look at REPL logs, but most likely payload related causing the touchless API flow to fail.'); console.log(error); }
  );
});

async function getDocs(receivedData) {
  let calcRuntimeResponse = "TBD";
  let calcSessionResponse = "TBD";
  let lendingRuntimeResponse = "TBD";
  let lendingSessionResponse = "TBD";
  let paycalcurl = "TBD";
  let lendingurl = "TBD";

  // 1 - PARSE XML PAYLOAD IN
  let txl = receivedData;
  console.log("1 - Received our payload");
  writelog('logs/' + now + '_1_ReceivedData', receivedData);

  // 2 - CALL RUNTIME PAYMENT CALC
  let base64payload = base64encode(txl); 
  rtbody.configuration.id = 'DefaultConfigId-noswitching';
  rtbody.transactionData[0] = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  let sessionId = rtResponse.data.session.id;
  writelog('logs/' + now + '_2_PayCalcStartSessionURL', rtResponse.data.url);
  console.log("2 - Runtime PaymentCalc SessionId = " + sessionId);
  console.log('CalcRuntime dataCollectionRequired = ' + rtResponse.data.runtimeDataCollectionStatus.dataCollectionRequired);
  console.log('CalcRuntime transactionDataComplete = ' + rtResponse.data.runtimeDataCollectionStatus.reasons.transactionDataComplete);
  console.log();
  calcRuntimeResponse = JSON.stringify(rtResponse.data.runtimeDataCollectionStatus);
  paycalcurl = rtResponse.data.url;

  // 3 - CALL SESSION TO GET DELTA TXL
  sessbody.session.id = sessionId;
  sessbody.fullTransactionData = 'false';
  let sessResponse = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let deltatxl = sessResponse.data.transactionData;
  writelog('logs/' + now + '_3_PayCalcTXLDecoded', base64decode(deltatxl));
  console.log("3 - Delta Txl received from PaymentCalc");
  console.log('CalcSession dataCollectionRequired = ' + sessResponse.data.runtimeDataCollectionStatus.dataCollectionRequired);
  console.log('CalcSession transactionDataComplete = ' + sessResponse.data.runtimeDataCollectionStatus.reasons.transactionDataComplete);
  console.log();
  calcSessionResponse = JSON.stringify(sessResponse.data.runtimeDataCollectionStatus);

  // 4 - CALL RUNTIME LENDING   
  rtbody.configuration.id = 'DefaultConfigId';
  rtbody.transactionData[0] = deltatxl;
  rtbody.transactionData[1] = base64payload; // received earlier (original payload)
  let rtlendResponse = await axios.post(rtlendurl, rtbody, { headers: rtheaders});
  let lendsessionId = rtlendResponse.data.session.id;
  writelog('logs/' + now + '_4_LendingStartSessionURL', rtlendResponse.data.url);
  console.log("4 - Runtime Lending SessionId = " + lendsessionId);
  console.log('LendRuntime dataCollectionRequired = ' + rtResponse.data.runtimeDataCollectionStatus.dataCollectionRequired);
  console.log('LendRuntime transactionDataComplete = ' + rtResponse.data.runtimeDataCollectionStatus.reasons.transactionDataComplete);
  console.log();
  lendingRuntimeResponse = JSON.stringify(rtResponse.data.runtimeDataCollectionStatus);
  lendingurl = rtlendResponse.data.url;

  // 5 - CALL SESSION TO GET FULL TXL
  sessbody.session.id = lendsessionId;
  sessbody.fullTransactionData = 'true';
  let sessResponseLend = await axios.post(sessurl, sessbody, { headers: rtheaders});
  let fulltxl = sessResponseLend.data.transactionData;
  writelog('logs/' + now + '_5_LendingSessionTXLDecoded', base64decode(fulltxl));
  console.log("5 - Full Txl received from Lending");
  console.log('LendSession dataCollectionRequired = ' + sessResponseLend.data.runtimeDataCollectionStatus.dataCollectionRequired);
  console.log('LendSession transactionDataComplete = ' + sessResponseLend.data.runtimeDataCollectionStatus.reasons.transactionDataComplete);
  console.log();
  lendingSessionResponse = JSON.stringify(sessResponseLend.data.runtimeDataCollectionStatus);

  // 6 - CALL DCL EXECUTE JOB TICKET
  dclbody.jobTicket.DataValuesList[0].content = fulltxl;
  let dclResponse = await axios.post(dclurl, dclbody, { headers: rtheaders});
  writelog('logs/' + now + '_6_DCLResponse', util.inspect(dclResponse)); // replace circular links since JSON.stringify had issues
  let encodedPdf = dclResponse.data.Result.RenderedFiles[0].Content;
  console.log("6 - EncodedPDF");
  writelog('logs/' + now + '_7_pdf', encodedPdf);

  let backUrl = '<a href="https://hrtrid--sbatester.repl.co">Go Back</a>';

  return('<html>' + backUrl + '<br>' + 
  '<br>' + '<b>PayCalc URL = </b>' + '<a href="' + paycalcurl + '" target="_blank">' + paycalcurl + '</a>' + 
  '<br>' + '<b>PaymentCalculation Runtime Response = </b>' + calcRuntimeResponse + 
  '<br>' + '<b>PaymentCalculation Session Response = </b>' + calcSessionResponse +
  '<br>' + 
  '<br>' + '<b>Lending URL = </b>' + '<a href="' + lendingurl + '" target="_blank">' + lendingurl + '</a>' +
  '<br>' + '<b>Lending Runtime Response = </b>' + lendingRuntimeResponse +
  '<br>' + '<b>Lending Session Response = </b>' + lendingSessionResponse + '<br><br>' + 
  '<object style="width: 100%; height: 100%;" type="application/pdf" data="data:application/pdf;base64,' + encodedPdf + 
  '"' + '></object></html>');
}

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

function writelog(logpath, data) {
  fs.writeFile(logpath, data, function (error) {
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