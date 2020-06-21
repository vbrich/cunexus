const express = require('express');
const axios = require('axios') 
const bodyParser = require("body-parser");
const app = express();

const apikey = 'rfkpBK4J7V9vJxZCq6Y9R4MRjlZ1NpT25wa8urCd';
const tdturl = 'https://pdt.test.compliancesystems.cloud/api/Translate';
var tdtbody = {"translatorCode":"json","partnerData":"","mappingData":{"location":"1","data":"cunexus_leadsapi_v1.json"}};
const tdtheaders = {'Content-Type': 'application/json','x-api-key': apikey}
const rturl = 'https://runtime.test.compliancesystems.cloud/2.0/api/StartSession/Lending';
const rtheaders = {'Content-Type': 'application/json'}
var rtbody = {"documentLibraryVersion": "2020.130.1","client": {"licenseKey":"030qmnHcMieNjHr1vEQbUZtUi4cCg1SVpbAmnwiM3X0bjDbxapbPJYaikFjOn/lo6AhLLlfH2g8+992tRnLZfXW77sIR/TKhMvJgROcWPOaQ+rYhQHL5M9qt+GEa9rW0G0g83+HiwKOZEUKigIwFhKA+mPYZ2o/2Cd+CHctsQ77u8xRrcg86XDxMFtSsVAW/YDMUa3IPOlw8TBbUrFQFv2AyYEs2Nx4BY0IARlRqnUGOS6Y9Y7VwJgafC7Egy4eWdQ7idwaAjiTjBM7q+xzp6jRA=="},"configuration":{"id":"DefaultConfigID"},"notificationUrl": "","redirectUrl": "","transactionData":""}

// Configure and Launch the Express Server
app.use(bodyParser.json({limit: '15mb'})); 
app.use(bodyParser.text({ type: 'text/plain' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('public')); // load files from public directory
app.listen(process.env.PORT || 3000, function() {
  console.log('Express server listening on port %d in %s mode', this.address().port, app.settings.env);
});

// **** GET ****
app.get("/", function(req, res) {
  res.sendFile('public/index.html'); // no need to specify dir off root
});

// **** POST ****
app.post("/getdocs", function(req, res) {
  console.log('GET DOCUMENTS POST REQUEST HIT WITH ' + req.body.payload);
  let receivedData = JSON.parse(req.body.payload); 
  getDocs(receivedData).then(
    function(result) { res.send(result); },
    function(error) { console.log(error); }
  );
});

async function getDocs(receivedData) {
  
  // 1 - CALL TDT 
  let base64data = Buffer.from(JSON.stringify(receivedData)).toString('base64');
  tdtbody.partnerData = base64data;
  tdtbody = JSON.stringify(tdtbody);
  let tdtResponse = await axios.post(tdturl, tdtbody, { headers: tdtheaders});
  let buff = Buffer.from(tdtResponse.data.txl, 'base64');
  let txl = buff.toString('ascii');

  console.log("1 - Received TXL from TDT... ");  
 
  // 2 - CALL RUNTIME PAYMENT CALC
  base64payload = Buffer.from(JSON.stringify(txl)).toString('base64');
  rtbody.transactionData = base64payload;
  let rtResponse = await axios.post(rturl, rtbody, { headers: rtheaders});
  console.log(rtResponse);
  console.log("2 - Received sessionID from Runtime..." + rtResponse.data.session.id);
  return '<a href="' + rtResponse.data.url + '">runtime</a><br><a href="https://cunexus--sbatester.repl.co">back</a>';

//TODO: Get PaymentCalculation to not throw 500 error
//TODO: Get Runtime to actually launch correctly
  
  // 3 - CALL DCL
  

  // return txl;   
}