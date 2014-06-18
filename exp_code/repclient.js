//*****************************
// Exact Three Parameters
// 1: (float) flow size in KBytes
// 2: (uint) connections
// 3: (string) server hostname
//*****************************

// Client behavour:
// 1. establish an connection and start timing
// 2. semd a bunch of data
// 3. send out FIN immediately after the data are all sent out.
// 4. stop timing as soon as the FIN is received.
// OUTPUT (two numbers): <FCT in ms>  <flow size>

var net = require('../repnet');

var size = Math.ceil(process.argv[2] * 1024);
var num_client = process.argv[3];
var clients = new Array();

function Client(p, h)
{
  var t0, t1;
  var data = new Buffer(size);
  var datalen = 0;

  var client = net.connect(p, h, function() { //'connect' listener
    t0 = process.hrtime();
    client.write(data);
    client.end();
  });

  // when 'end' event is emitted, all message has been received.
  client.on('end', function() {
    t1 = process.hrtime(t0);
    console.log(t1[0]*1000 + t1[1]/1000000, size);
  }); 
}

for (var i = 0; i < num_client; i++) {
  var host = process.argv[i+4]; 
  clients[i] = new Client(5337, host);
};
