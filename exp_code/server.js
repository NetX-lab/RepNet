// server behavour:
// as soon as it is ened by the client
// reply the FIN packets.

var net = require('../repnet'); 

var server = net.createServer(function(c) { 
  // read query
  c.on('data', function(ignore) {
  });

  c.on('end', function() {
    c.end();
  });

  c.on('error', function() {
    c.destroy();
    server.listen(5337, function(){});
  });
});
server.listen(5337, function() {
});
